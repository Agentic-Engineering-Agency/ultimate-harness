import { spawn, execFileSync } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, appendFile } from "node:fs/promises";
import {
  type MissionArtifactContext,
  getMissionArtifactContext,
  assertWritableArtifact,
  assertPathInsideMissionDir,
  writeArtifactFile,
  persistPromptAndSession,
  appendMissionEvent,
} from "./_artifact-context.js";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { z } from "zod";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
import { buildUsageEvent, type RuntimeUsage } from "../harness/usage.js";
import {
  appendRunsIndexEntry,
  generateRunId,
  mirrorRuntimeResultToLatest,
  writeLatestPointer,
} from "../harness/run-id.js";
import type { RunStatus } from "../schema/runs.js";
import {
  RuntimeSessionDocument,
  RuntimeResultDocument,
  RuntimeResultStatus,
  validateRuntimeResult,
} from "../schema/artifacts.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
  type AdapterRuntimeChecker,
} from "../harness/registry.js";
import { captureDiffWithUntracked } from "../harness/diff-capture.js";
import { extractRuntimeFinalMessageSentinel } from "../harness/runtime-final-message.js";
import { buildDispatchContext } from "../harness/dispatch-context.js";
import { renderPrompt } from "../harness/render-prompt.js";
import { mergeRuntimeConfigOverrides } from "../harness/runtime-config-overrides.js";
import {
  flushPendingHonchoSaves,
  loadHonchoMemoryBlock,
  recordMissionExchange,
} from "../extensions/honcho-memory/index.js";


export type CheckResult = {
  runtime: string;
  found: boolean;
  version: string;
  errors: string[];
};

export type DryRunResult = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
};

export type OhMyPiRunPlan = {
  command: string;
  args: string[];
  /** Final prompt handed to the runtime (memory-enriched when honcho-memory is enabled). */
  prompt: string;
  /**
   * Pre-enrichment mission prompt — what `buildMissionPrompt` produced before
   * any extension touched it. Persisted to Honcho as the "user message" so
   * we never feed the injected `[Persistent memory]` block back into Honcho's
   * own summarizer on the next run.
   */
  basePrompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
  /**
   * UH-137 — resolved Honcho opt-out for this mission. `false` when
   * `runtime_config.honcho_memory: false`; otherwise `true`. When `false`,
   * `runOhMyPi` skips `recordMissionExchange` just as `planOhMyPiRun` skipped
   * `loadHonchoMemoryBlock`.
   */
  honchoMemoryEnabled: boolean;
};
/**
 * Input the adapter hands to a OhMyPi runner.
 *
 * Runners are responsible for invoking the configured CLI with the given
 * arguments inside `cwd`. They MUST honor `timeoutMs` when set; on expiry,
 * return `timedOut: true` and a non-zero exit code. The default runner uses
 * `child_process.spawn`; tests inject deterministic stubs.
 */
export interface OhMyPiRunnerInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  /** Receives raw stdout chunks while the child is still running. */
  onStdoutChunk?: (chunk: string) => void | Promise<void>;
  /** Aborts the owned runtime process tree when the CLI receives a signal. */
  cancellationSignal?: AbortSignal;
}

/**
 * Output a OhMyPi runner returns to the adapter.
 *
 * Errors are surfaced explicitly rather than swallowed: a spawn failure sets
 * `spawnError`; a timeout sets `timedOut`. The adapter translates these into
 * `failed` runtime-result entries with explicit `errors[]` items.
 */
export interface OhMyPiRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  spawnError?: string;
}

export type OhMyPiRunner = (input: OhMyPiRunnerInput) => Promise<OhMyPiRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface PlanOhMyPiOptions {
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}
export interface RunOhMyPiOptions {
  runner?: OhMyPiRunner;
  timeoutMs?: number;
  collectDiff?: DiffCollector;
  /** Canonical host root for persisted artifacts; execution remains rooted at `root`. */
  artifactRoot?: string;
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Explicit per-run id; generated when absent. UH-82. */
  runId?: string;
  /** Signal used by the CLI to stop the owned runtime process tree. */
  cancellationSignal?: AbortSignal;
}

export interface RunOhMyPiResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
  /** UH-82 — id of the per-run artifact directory written. */
  runId: string;
}
export interface OhMyPiCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: OhMyPiRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: OhMyPiRunnerOutput;
  diff: DiffCaptureResult;
  eventsAlreadyPersisted?: boolean;
}

export interface OhMyPiCollectOutput {
  exitCode: number;
  stderr: string;
  result?: RuntimeResultDocument;
  finalMessage: string;
}

const execFileP = promisify(execFile);

export async function loadAdapterConfig(root: string, runtimeId: string): Promise<AdapterDocument> {
  const entry = await runtimeRegistry.load(root, runtimeId);
  return entry.document;
}

async function runOhMyPiCliCheck(command: string): Promise<AdapterCheckResult> {
  const result: AdapterCheckResult = {
    runtime: "oh-my-pi",
    found: false,
    version: "",
    errors: [],
  };

  try {
    const { stdout } = await execFileP(command, ["--version"]);
    result.found = true;
    result.version = stdout.trim();
  } catch {
    result.errors.push(
      "omp CLI not found in PATH. Install: https://github.com/can1357/oh-my-pi",
    );
  }

  return result;
}

const ohMyPiRuntimeChecker: AdapterRuntimeChecker = async (manifest) => {
  const command = manifest.config?.cli_command ? manifest.config.cli_command : "omp";
  return runOhMyPiCliCheck(command);
};

runtimeRegistry.register("oh-my-pi", ohMyPiRuntimeChecker);

/**
 * Strict Zod schema for `config.runtime_config` of the oh-my-pi adapter.
 *
 * Registered with the adapter-schema registry so manifests are validated at
 * load time; unknown keys raise a Zod error.
 */
export const OhMyPiRuntimeConfigSchema = z.object({
  mode: z
    .enum(["json", "text", "rpc", "rpc-ui"])
    .optional()
    .default("json"),
  thinking: z
    .union([
      z.literal(""),
      z.enum(["minimal", "low", "medium", "high", "xhigh"]),
    ])
    .optional()
    .default(""),
  allow_extensions: z.boolean().optional().default(false),
  allow_skills: z.boolean().optional().default(false),
  model: z.string().optional(),
  // UH-137: per-mission Honcho opt-out. Omitted/true -> Honcho memory enrich,
  // record, and the honcho_search/honcho_remember tools run when Honcho env is
  // configured. false -> all Honcho activity is skipped for this mission.
  honcho_memory: z.boolean().optional(),
}).strict();

export type OhMyPiRuntimeConfig = z.infer<typeof OhMyPiRuntimeConfigSchema>;

registerRuntimeConfigSchema("oh-my-pi", OhMyPiRuntimeConfigSchema);

/** Extract the strongly-typed oh-my-pi `runtime_config` from an adapter manifest. */
export function getOhMyPiRuntimeConfig(adapter: AdapterDocument): OhMyPiRuntimeConfig {
  return OhMyPiRuntimeConfigSchema.parse(adapter.config?.runtime_config ?? {});
}

/**
 * Convenience wrapper that mirrors the CLI's oh-my-pi check.
 *
 * - With `root`: dispatches through the registry so manifest errors and CLI
 *   errors share the same structured shape.
 * - Without `root`: probes the oh-my-pi CLI directly (used in environments
 *   without an initialized `.harness/`).
 */
export async function checkOhMyPi(root?: string): Promise<CheckResult> {
  if (root) {
    return runtimeRegistry.check(root, "oh-my-pi");
  }
  return runOhMyPiCliCheck("omp");
}

export async function dryRunOhMyPi(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planOhMyPiRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "oh-my-pi",
        status: "planned",
        command: plan.command,
        args: plan.args,
      });
    }
    return {
      command: plan.command,
      args: plan.args,
      prompt: plan.prompt,
      worktree: plan.worktree,
      session_id_passthrough: plan.session_id_passthrough,
      errors: plan.errors,
    };
  } catch (e) {
    return {
      command: "",
      args: [],
      prompt: "",
      worktree: false,
      session_id_passthrough: false,
      errors: [(e as Error).message],
    };
  }
}

/**
 * Compile a mission into the command, args, and prompt the OhMyPi runner
 * needs. Throws when the mission or adapter manifest cannot be loaded;
 * recoverable issues (missing workflow profile) are returned in `errors[]`
 * so the caller decides whether to proceed.
 */
export async function planOhMyPiRun(root: string, missionPath: string, options: PlanOhMyPiOptions = {}): Promise<OhMyPiRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "oh-my-pi");

  let mission: MissionDocument;
  try {
    const content = await readFile(missionPath, "utf-8");
    const parsed = parse(content);
    mission = validateMission(parsed);
  } catch (e) {
    throw new Error(`Mission load error: ${(e as Error).message}`);
  }

  // Merge mission-level overrides on top of adapter defaults, then strict-parse.
  // The strict schema catches typos in either source (adapter manifest or mission override).
  // UH-81: `options.extraRuntimeConfigOverrides` is the CLI-time
  // `--runtime-config-overrides <json>` payload; it wins over the
  // mission file (later spread = higher precedence).
  const mergedRuntimeConfig = {
    ...(adapter.config?.runtime_config ?? {}),
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides),
  };
  let runtimeConfig;
  try {
    runtimeConfig = OhMyPiRuntimeConfigSchema.parse(mergedRuntimeConfig);
  } catch (e) {
    throw new Error(`Mission runtime_config_overrides validation failed: ${(e as Error).message}`);
  }

  let workflow: WorkflowDocument | undefined;
  const workflowPath = path.join(workflowsDir(root), `${mission.workflow_profile}.yaml`);
  try {
    const wfContent = await readFile(workflowPath, "utf-8");
    const wfParsed = parse(wfContent);
    workflow = validateWorkflow(wfParsed);
  } catch {
    errors.push(`Workflow profile not found: ${mission.workflow_profile}`);
  }

  const config = adapter.config;
  const cliCommand = config?.cli_command ? config.cli_command : "omp";
  const worktreeMode = config?.worktree_mode === true;
  if (config?.pass_session_id === true) {
    errors.push("OhMyPi assigns its own thread id; set pass_session_id: false");
  }

  const mode = runtimeConfig.mode;
  if (mode === "rpc-ui") {
    errors.push("oh-my-pi mode rpc-ui expects a TUI parent; use mode: json, text, or rpc for headless runs");
  }
  const model = runtimeConfig.model && runtimeConfig.model.length > 0 ? runtimeConfig.model : undefined;
  const thinking = runtimeConfig.thinking === "" ? undefined : runtimeConfig.thinking;
  const allowExtensions = runtimeConfig.allow_extensions;
  const allowSkills = runtimeConfig.allow_skills;

  // UH-80: build the dispatch context first, then enrich via the Honcho
  // memory hook by setting `ctx.memoryBlock`. `basePrompt` is the rendered
  // prompt WITHOUT the memory block so it remains the right "user message"
  // to record back into Honcho (otherwise the next run would feed Honcho's
  // own summarized memory back into its own summarizer).
  // UH-137: `runtime_config.honcho_memory: false` disables ALL Honcho activity
  // for this mission (enrich here + record in runOhMyPi). Default ON; the
  // honcho-memory extension itself no-ops when Honcho env is not configured.
  const honchoMemoryEnabled = runtimeConfig.honcho_memory !== false;

  const ctx = buildDispatchContext(mission, workflow);
  const basePrompt = renderPrompt(ctx);
  const memoryBlock = honchoMemoryEnabled
    ? await loadHonchoMemoryBlock({ cwd: root, missionId: mission.id })
    : null;
  ctx.memoryBlock = memoryBlock ?? undefined;
  const prompt = renderPrompt(ctx);
  const args = [
    "--print",
  ];
  if (model) {
    args.push("--model", model);
  }
  if (thinking) {
    args.push("--thinking", thinking);
  }
  args.push("--mode", mode, "--no-session");
  if (!allowExtensions) {
    args.push("--no-extensions");
  }
  if (!allowSkills) {
    args.push("--no-skills");
  }
  args.push("--no-title", prompt);

  return {
    command: cliCommand,
    args,
    prompt,
    basePrompt,
    worktree: worktreeMode,
    session_id_passthrough: false,
    errors,
    mission,
    honchoMemoryEnabled,
  };
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
function terminateOwnedProcessTree(child: { pid?: number; kill: (signal?: NodeJS.Signals) => boolean }): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    } catch {
      // Fall through to the direct child signal when taskkill is unavailable.
    }
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through to the direct child signal when no process group exists.
    }
  }
  try { child.kill("SIGKILL"); } catch { /* child already exited */ }
}

/**
 * Default runner. Streams stdout/stderr from a spawned child, applies a
 * SIGKILL on timeout, and never throws — failures surface as `spawnError` or
 * `timedOut` on the returned record so the adapter can translate them into a
 * `failed` runtime-result with explicit errors.
 */
export const defaultOhMyPiRunner: OhMyPiRunner = (input) => {
  const { promise, resolve } = createDeferred<OhMyPiRunnerOutput>();
  const child = spawn(input.command, input.args, {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let settled = false;
  let finalizing = false;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;
  const callbackPromises: Promise<void>[] = [];
  const callbackErrors: unknown[] = [];
  const onCancellation = (): void => terminateOwnedProcessTree(child);
  if (input.cancellationSignal?.aborted) {
    onCancellation();
  } else {
    input.cancellationSignal?.addEventListener("abort", onCancellation, { once: true });
  }

  const finalize = async (exitCode: number, spawnError?: string): Promise<void> => {
    if (settled || finalizing) return;
    finalizing = true;
    clearTimeout(timer);
    input.cancellationSignal?.removeEventListener("abort", onCancellation);
    await Promise.all(callbackPromises);
    const callbackError = callbackErrors[0];
    settled = true;
    const callbackMessage = callbackError instanceof Error ? callbackError.message : String(callbackError);
    resolve({
      stdout,
      stderr,
      exitCode: callbackError ? 1 : exitCode,
      timedOut,
      spawnError: callbackError ? `Stream callback failed: ${callbackMessage}` : spawnError,
    });
  };

  if (typeof input.timeoutMs === "number" && input.timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      terminateOwnedProcessTree(child);
    }, input.timeoutMs);
  }

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
    try {
      const pending = input.onStdoutChunk?.(chunk);
      if (pending) {
        callbackPromises.push(Promise.resolve(pending).then(
          () => undefined,
          (error) => {
            callbackErrors.push(error);
          },
        ));
      }
    } catch (error) {
      callbackErrors.push(error);
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  child.on("close", (code: number | null) => {
    void finalize(timedOut ? 1 : code ?? 1);
  });
  child.on("error", (err: Error) => {
    void finalize(1, err.message);
  });
  return promise;
};

/**
 * Default diff collector. Delegates to `captureDiffWithUntracked`
 * (UH-34) which captures both modified-tracked files AND new untracked
 * files in a single `git diff` output.
 */
export const defaultDiffCollector: DiffCollector = async (cwd) => {
  return captureDiffWithUntracked(cwd);
};

/**
 * Execute a mission against the OhMyPi runtime end-to-end.
 *
 * Orchestrates: `planOhMyPiRun` -> writeable artifact context ->
 * `runtime.started` audit -> runner invocation -> diff capture ->
 * `collectOhMyPiSession`. The runner and diff collector are injectable so
 * tests can drive deterministic outcomes (success, non-zero exit, timeout,
 * malformed result block) without invoking a real `oh-my-pi` binary.
 */
export async function runOhMyPi(
  root: string,
  missionPath: string,
  options: RunOhMyPiOptions = {},
): Promise<RunOhMyPiResult> {
  const plan = await planOhMyPiRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides });
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const runId = options.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const artifactRoot = options.artifactRoot ?? root;
  const artifactMissionPath = path.join(artifactRoot, ".harness", "missions", plan.mission.id, "mission.yaml");
  const artifacts = await getMissionArtifactContext(artifactRoot, artifactMissionPath, runId);

  let initializationError: string | undefined;
  if (artifacts) {
    try {
      await writeLatestPointer(artifactRoot, plan.mission.id, {
        schema_version: "uh.latest-run.v0",
        run_id: runId,
        started_at: startedAt,
        status: "running",
      });
      await appendRunsIndexEntry(artifactRoot, plan.mission.id, {
        run_id: runId,
        started_at: startedAt,
        status: "running",
        runtime: "oh-my-pi",
      });
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "oh-my-pi",
        status: "running",
        command: plan.command,
        args: plan.args,
        started_at: startedAt,
      });
      await appendMissionEvent(artifacts, {
        event: "runtime.started",
        timestamp: startedAt,
        runtime: "oh-my-pi",
        mission_id: plan.mission.id,
        command: plan.command,
        args: plan.args,
        run_id: runId,
      });
    } catch {
      initializationError = "Initial artifact persistence failure";
    }
  }

  // Audit event
  try {
    const logPath = auditLog(artifactRoot);
    const auditEntry = JSON.stringify({
      event: "mission.run",
      timestamp: new Date().toISOString(),
      runtime: "oh-my-pi",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
      run_id: runId,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultOhMyPiRunner;
  let liveBuffer = "";
  let liveEventPersisted = false;
  let liveWrites = Promise.resolve();
  const enqueueLiveChunk = (chunk: string): Promise<void> => {
    if (!artifacts) return Promise.resolve();
    liveBuffer += chunk;
    const lines = liveBuffer.split(/\r?\n/);
    liveBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: Record<string, unknown>;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
        event = parsed as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof event.type !== "string") continue;
      liveEventPersisted = true;
      liveWrites = liveWrites.then(() => appendMissionEvent(artifacts, {
        ...event,
        event: `oh-my-pi.${event.type}`,
      }));
    }
    return liveWrites;
  };
  let runnerResult: OhMyPiRunnerOutput;
  let collection: OhMyPiCollectOutput;
  try {
    if (initializationError) {
      runnerResult = {
        stdout: "",
        stderr: "",
        exitCode: 1,
        timedOut: false,
        spawnError: initializationError,
      };
      collection = await collectOhMyPiSession({
        root: artifactRoot,
        artifacts,
        plan,
        startedAt,
        finishedAt: new Date().toISOString(),
        runnerResult,
        diff: { patch: "" },
        eventsAlreadyPersisted: false,
      });
    } else {
      try {
        runnerResult = await runner({
          command: plan.command,
          args: plan.args,
          cwd: root,
          timeoutMs: options.timeoutMs,
          onStdoutChunk: enqueueLiveChunk,
          cancellationSignal: options.cancellationSignal,
        });
      } catch {
        runnerResult = {
          stdout: "",
          stderr: "",
          exitCode: 1,
          timedOut: false,
          spawnError: "Runtime runner or stream persistence failed",
        };
      }
      const trailing = liveBuffer;
      liveBuffer = "";
      try {
        if (trailing.trim().length > 0) await enqueueLiveChunk(`${trailing}\n`);
        await liveWrites;
      } catch {
        if (!runnerResult.spawnError) {
          runnerResult = { ...runnerResult, exitCode: 1, spawnError: "Stream callback failed" };
        }
      }

      const collectDiff = options.collectDiff ?? defaultDiffCollector;
      const diff = await collectDiff(root);
      const finishedAt = new Date().toISOString();
      collection = await collectOhMyPiSession({
        root: artifactRoot,
        artifacts,
        plan,
        startedAt,
        finishedAt,
        runnerResult,
        diff,
        eventsAlreadyPersisted: liveEventPersisted,
      });
    }
  } finally {
    if (artifacts) {
      try {
        await mirrorRuntimeResultToLatest(artifactRoot, plan.mission.id, runId);
      } catch {
        // best-effort.
      }
    }
  }

  // UH-137: skip ALL Honcho record activity when the mission opted out.
  if (plan.honchoMemoryEnabled) {
    try {
      if (collection.finalMessage) {
        await recordMissionExchange(plan.basePrompt, collection.finalMessage, {
          cwd: root,
          missionId: plan.mission.id,
        });
      }
    } finally {
      await flushPendingHonchoSaves();
    }
  }

  if (artifacts) {
    const finishedAt = new Date().toISOString();
    const terminalStatus = deriveOmpRunStatus(collection.result, collection.exitCode);
    try {
      await writeLatestPointer(artifactRoot, plan.mission.id, {
        schema_version: "uh.latest-run.v0",
        run_id: runId,
        started_at: startedAt,
        finished_at: finishedAt,
        status: terminalStatus,
      });
    } catch {
      // Keep the terminal per-run result even when the mirror is unwritable.
    }
    try {
      await appendRunsIndexEntry(artifactRoot, plan.mission.id, {
        run_id: runId,
        started_at: startedAt,
        finished_at: finishedAt,
        status: terminalStatus,
        runtime: "oh-my-pi",
      });
    } catch {
      // Keep the terminal per-run result even when the index is unwritable.
    }
  }

  return {
    exitCode: collection.exitCode,
    stdout: runnerResult.stdout,
    stderr: collection.stderr,
    result: collection.result,
    runId,
  };
}


function deriveOmpRunStatus(
  result: RuntimeResultDocument | undefined,
  exitCode: number,
): RunStatus {
  if (result?.status) return result.status;
  return exitCode === 0 ? "blocked" : "failed";
}

/**
 * Persist a completed OhMyPi session: stdout.log, stderr.log, diff.patch,
 * runtime-result.yaml, and the back-compat runtime-session.yaml. Determines
 * the runtime-result `status` from the runner outcome and any final
 * `uh.runtime-result.v0` block emitted by OhMyPi on stdout.
 *
 * Status rules:
 *  - `spawnError` -> failed (with explicit "Spawn error: ..." stderr)
 *  - `timedOut`   -> failed (with timeout error)
 *  - `exitCode != 0` -> failed
 *  - `exitCode == 0` + valid final block with status passed/completed -> passed
 *  - `exitCode == 0` + any other final block status -> that block's status
 *  - `exitCode == 0` + missing final assistant message -> blocked
 *
 * Artifact-write failures are caught and surfaced via stderr so callers see
 * the cause instead of getting a silent partial commit.
 */
export async function collectOhMyPiSession(
  input: OhMyPiCollectInput,
): Promise<OhMyPiCollectOutput> {
  const { artifacts, plan, runnerResult, diff, startedAt, finishedAt, root, eventsAlreadyPersisted } = input;

  const errors: string[] = [];
  let stderr = runnerResult.stderr;
  let exitCode = runnerResult.exitCode;

  if (runnerResult.spawnError) {
    const safeSpawnError = runnerResult.spawnError.startsWith("Stream callback failed")
      ? "Stream callback failed"
      : runnerResult.spawnError;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Spawn error: ${safeSpawnError}`;
    errors.push(`Spawn error: ${safeSpawnError}`);
    if (exitCode === 0) exitCode = 1;
  }
  if (runnerResult.timedOut) {
    errors.push("Runtime timed out");
    if (exitCode === 0) exitCode = 1;
  }
  if (diff.errors) {
    errors.push(...diff.errors);
  }

  const parsedStream = parseOhMyPiOutput(runnerResult.stdout);
  errors.push(...parsedStream.parseErrors);
  const quotaError = detectOhMyPiQuotaError(runnerResult.stdout, stderr, parsedStream.events);
  if (quotaError) {
    errors.push(quotaError);
  }
  const nativeTerminalError = extractNativeTerminalFailure(parsedStream.events);
  if (nativeTerminalError) {
    errors.push(nativeTerminalError);
  }
  const reportedFacts = extractReportedFacts(parsedStream.events);
  // (last assistant-like JSON entry). Scans the heuristic-extracted last
  // assistant text (which is the JSON-decoded content, with real newlines)
  // rather than the raw NDJSON stdout where newlines are JSON-escaped.
  // Falls back to the heuristic when the sentinel is absent.
  const heuristicFinal = parsedStream.finalMessage;
  const sentinel = extractRuntimeFinalMessageSentinel(heuristicFinal);
  const finalMessage = sentinel ?? heuristicFinal;
  const finalMessageMissing = finalMessage.length === 0;
  if (finalMessageMissing) {
    errors.push("oh-my-pi did not emit a final assistant message");
  }

  let status: RuntimeResultStatus;
  if (runnerResult.spawnError) {
    status = "failed";
  } else if (runnerResult.timedOut) {
    status = "failed";
  } else if (quotaError) {
    status = "blocked";
  } else if (nativeTerminalError) {
    status = "failed";
  } else if (exitCode !== 0) {
    status = "failed";
  } else if (finalMessageMissing) {
    status = "blocked";
  } else {
    status = "passed";
  }
  if (status === "failed" && exitCode === 0) exitCode = 1;

  if (!artifacts) {
    return { exitCode, stderr, finalMessage };
  }

  let result: RuntimeResultDocument | undefined;
  try {
    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "oh-my-pi",
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: exitCode,
      prompt_path: path.relative(root, artifacts.promptPath),
      stdout_path: path.relative(root, artifacts.stdoutPath),
      stderr_path: path.relative(root, artifacts.stderrPath),
      diff_path: path.relative(root, artifacts.diffPath),
      errors,
      ...(reportedFacts.provider ? { provider: reportedFacts.provider } : {}),
      ...(reportedFacts.model ? { model: reportedFacts.model } : {}),
      ...(reportedFacts.usage ? { usage: reportedFacts.usage } : {}),
      ...(reportedFacts.costUsd !== undefined ? { cost_usd: reportedFacts.costUsd } : {}),
    };
    result = validateRuntimeResult(draft);
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, runnerResult.stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    await persistFinalMessage(artifacts, finalMessage);
    // Publish independently readable terminal artifacts before appending
    // optional events. An unwritable events stream must not leave the run
    // result or session in a running state.
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));
    await persistFinalRuntimeSession(
      artifacts,
      plan,
      startedAt,
      finishedAt,
      exitCode,
      status === "passed" ? "succeeded" : "failed",
      reportedFacts,
    );
    if (!eventsAlreadyPersisted) {
      for (const event of parsedStream.events) {
        if (typeof event.type === "string") {
          await appendMissionEvent(artifacts, {
            ...event,
            event: `oh-my-pi.${event.type}`,
          });
        }
      }
    }
    await appendMissionEvent(artifacts, {
      event: "runtime.finished",
      timestamp: finishedAt,
      runtime: "oh-my-pi",
      mission_id: plan.mission.id,
      exit_code: exitCode,
      status: status === "passed" ? "succeeded" : "failed",
    });

    if (reportedFacts.usage) {
      await appendMissionEvent(
        artifacts,
        buildUsageEvent("oh-my-pi", plan.mission.id, reportedFacts.usage, finishedAt),
      );
    }
  } catch {
    exitCode = exitCode === 0 ? 1 : exitCode;
    const persistenceError = "Artifact persistence failure";
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}${persistenceError}`;
    if (result) {
      result = { ...result, status: "failed", exit_code: exitCode, errors: [...result.errors, persistenceError] };
      try {
        await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));
      } catch {
        // The failed result remains available to the caller if this file is also unwritable.
      }
      try {
        await persistFinalRuntimeSession(artifacts, plan, startedAt, finishedAt, exitCode, "failed", reportedFacts);
      } catch {
        // Finalize the independent run index even when session persistence is unavailable.
      }
    }
    return { exitCode, stderr, result, finalMessage };
  }

  return { exitCode, stderr, result, finalMessage };
}

export function parseOhMyPiOutput(stdout: string): { events: Array<Record<string, unknown>>; parseErrors: string[]; finalMessage: string } {
  const events: Array<Record<string, unknown>> = [];
  const parseErrors: string[] = [];
  const lines = stdout.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      } else {
        parseErrors.push(`OhMyPi JSON line ${index + 1} is not an object`);
      }
    } catch {
      parseErrors.push(`OhMyPi JSON parse error on line ${index + 1}`);
    }
  }

  if (events.length === 0 && stdout.trim().length > 0) {
    try {
      const parsed = JSON.parse(stdout) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
        parseErrors.length = 0;
      } else {
        parseErrors.push("OhMyPi JSON output is not an object");
      }
    } catch {
      // Keep line-by-line parse errors; they are more actionable.
    }
  }

  return {
    events,
    parseErrors,
    finalMessage: extractFinalMessage(events),
  };
}

function nativeMessageRecords(event: Record<string, unknown>): Record<string, unknown>[] {
  const records = [event];
  if (event.message && typeof event.message === "object" && !Array.isArray(event.message)) {
    records.push(event.message as Record<string, unknown>);
  }
  if (event.type === "agent_end" && Array.isArray(event.messages)) {
    for (const message of event.messages) {
      if (message && typeof message === "object" && !Array.isArray(message)) {
        records.push(message as Record<string, unknown>);
      }
    }
  }
  return records;
}
function extractNativeTerminalFailure(events: Array<Record<string, unknown>>): string | null {
  const isAuthOrQuotaStatus = (value: unknown): boolean =>
    value === 401 || value === 403 || value === 429 || value === "401" || value === "403" || value === "429";
  const isServerStatus = (value: unknown): boolean =>
    (typeof value === "number" && value >= 500 && value <= 599)
    || (typeof value === "string" && /^5\d\d$/.test(value));

  for (const event of events) {
    const eventType = typeof event.type === "string" ? event.type : "";
    for (const candidate of nativeMessageRecords(event)) {
      const stopReason = candidate.stopReason ?? candidate.stop_reason;
      if (typeof stopReason === "string" && /^(error|aborted)$/i.test(stopReason)) {
        return `oh-my-pi runtime reported terminal failure: ${stopReason.toLowerCase()}`;
      }
      const errorMessage = candidate.errorMessage ?? candidate.error_message;
      if (typeof errorMessage === "string" && errorMessage.trim().length > 0) {
        return "oh-my-pi runtime reported terminal failure";
      }

      const errorRecord = candidate.error && typeof candidate.error === "object" && !Array.isArray(candidate.error)
        ? candidate.error as Record<string, unknown>
        : undefined;
      const nestedStatus = errorRecord?.status;
      const nestedMessage = errorRecord?.message;
      const genericEnvelope = /^(error|failure)$/i.test(eventType)
        && (isServerStatus(nestedStatus)
          || (typeof nestedMessage === "string" && nestedMessage.trim().length > 0)
          || isServerStatus(candidate.status));
      const typedNestedFailure = isServerStatus(nestedStatus)
        && (typeof nestedMessage === "string" || /^(error|failure)$/i.test(eventType));
      if ((genericEnvelope || typedNestedFailure) && !isAuthOrQuotaStatus(nestedStatus)) {
        return "oh-my-pi runtime reported terminal failure";
      }
    }
  }
  return null;
}

export function detectOhMyPiQuotaError(
  stdout: string,
  stderr: string,
  events: Array<Record<string, unknown>> = parseOhMyPiOutput(stdout).events,
): string | null {
  const classify = (text: string): string | null => {
    if (/not authenticated|unauthorized|auth(?:entication|orization)? required|please log in|api[-_ ]?key|\b(?:401|403)\b/i.test(text)) {
      return "oh-my-pi auth or quota error: API key authentication required";
    }
    if (/usage limit|rate limit|quota|credit|\b429\b/i.test(text)) {
      return "oh-my-pi auth or quota error: quota or rate limit exceeded";
    }
    return null;
  };

  for (const line of stderr.split("\n")) {
    const diagnostic = classify(line.trim());
    if (diagnostic) return diagnostic;
  }
  for (const event of events) {
    const type = typeof event.type === "string" ? event.type : "";
    for (const candidate of nativeMessageRecords(event)) {
      const errorRecord = candidate.error && typeof candidate.error === "object" && !Array.isArray(candidate.error)
        ? candidate.error as Record<string, unknown>
        : undefined;
      const status = errorRecord?.status ?? candidate.status;
      if (status === 401 || status === 403 || status === "401" || status === "403") {
        return "oh-my-pi auth or quota error: API key authentication required";
      }
      if (status === 429 || status === "429") {
        return "oh-my-pi auth or quota error: quota or rate limit exceeded";
      }
      const diagnostic = [
        candidate.errorMessage,
        candidate.error_message,
        candidate.code,
        errorRecord?.code,
        errorRecord?.message,
        /^(error|failure)$/i.test(type) && typeof candidate.message === "string" ? candidate.message : "",
        typeof status === "string" ? status : "",
        typeof candidate.error === "string" ? candidate.error : "",
      ].filter((value): value is string => typeof value === "string").join(" ");
      if (/error|failure|auth|quota/i.test(type) || diagnostic.length > 0) {
        const classified = classify(diagnostic);
        if (classified) return classified;
      }
    }
  }
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{")) continue;
    const diagnostic = classify(trimmed);
    if (diagnostic) return diagnostic;
  }
  return null;
}
function extractFinalMessage(events: Array<Record<string, unknown>>): string {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const extracted = extractAssistantText(events[index]);
    if (extracted.length > 0) {
      return extracted;
    }
  }
  return "";
}

function extractAssistantText(event: Record<string, unknown>): string {
  const nestedMessage = event.message;
  if (nestedMessage && typeof nestedMessage === "object" && !Array.isArray(nestedMessage)) {
    const extracted = extractAssistantText(nestedMessage as Record<string, unknown>);
    if (extracted.length > 0) return extracted;
  }

  const role = event.role;
  const type = event.type;
  const isAssistantLike = role === "assistant" || type === "assistant" || type === "message" || type === "result";
  if (isAssistantLike) {
    const direct = extractStringBody(event);
    if (direct.length > 0) return direct;
  }

  const messages = event.messages;
  if (Array.isArray(messages)) {
    const extracted = extractLastAssistantFromArray(messages);
    if (extracted.length > 0) return extracted;
  }

  const transcript = event.transcript;
  if (Array.isArray(transcript)) {
    const extracted = extractLastAssistantFromArray(transcript);
    if (extracted.length > 0) return extracted;
  }

  const final = event.final;
  if (typeof final === "string") return final;
  if (final && typeof final === "object" && !Array.isArray(final)) {
    const extracted = extractAssistantText(final as Record<string, unknown>);
    if (extracted.length > 0) return extracted;
  }

  const result = event.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return extractStringBody(result as Record<string, unknown>);
  }

  return "";
}

function extractLastAssistantFromArray(items: unknown[]): string {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const extracted = extractAssistantText(item as Record<string, unknown>);
    if (extracted.length > 0) return extracted;
  }
  return "";
}

function extractStringBody(event: Record<string, unknown>): string {
  for (const key of ["content", "text", "message", "body", "output"]) {
    const value = event[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const parts = value.flatMap((block) => {
        if (!block || typeof block !== "object" || Array.isArray(block)) return [];
        const candidate = (block as Record<string, unknown>).text;
        const blockType = (block as Record<string, unknown>).type;
        return typeof candidate === "string" && (blockType === undefined || blockType === "text")
          ? [candidate]
          : [];
      });
      if (parts.length > 0) return parts.join("");
    }
  }
  return "";
}

type OmpReportedFacts = {
  provider?: string;
  model?: string;
  usage?: RuntimeUsage;
  costUsd?: number;
};

function extractReportedFacts(events: Array<Record<string, unknown>>): OmpReportedFacts {
  const facts: OmpReportedFacts = {};
  const usage: RuntimeUsage = { source: "runtime" };
  const seenUsageIds = new Set<string>();
  let usageSeen = false;
  let assistantTurnCount = 0;
  let inputComplete = true;
  let outputComplete = true;
  let totalComplete = true;
  let cacheReadComplete = true;
  let cacheWriteComplete = true;
  let costComplete = true;
  let inputTotal = 0;
  let outputTotal = 0;
  let totalTokens = 0;
  let cacheReadTotal = 0;
  let cacheWriteTotal = 0;
  let costTotal = 0;
  let lastIdlessMessageEndFingerprint: string | undefined;

  for (const event of events) {
    const message = event.message;
    const messageRecord = message && typeof message === "object" && !Array.isArray(message)
      ? message as Record<string, unknown>
      : null;
    for (const candidate of messageRecord ? [event, messageRecord] : [event]) {
      if (typeof candidate.provider === "string" && candidate.provider.length > 0) facts.provider = candidate.provider;
      if (typeof candidate.model === "string" && candidate.model.length > 0) facts.model = candidate.model;
    }
    if (event.type !== "message_end" || !messageRecord || messageRecord.role !== "assistant") continue;
    const usageId = [messageRecord.id, messageRecord.responseId, event.id, event.responseId]
      .find((value): value is string => typeof value === "string" && value.length > 0);
    if (usageId) {
      if (seenUsageIds.has(usageId)) continue;
      seenUsageIds.add(usageId);
    } else {
      const messageEndFingerprint = JSON.stringify([event.timestamp ?? null, messageRecord]);
      if (messageEndFingerprint === lastIdlessMessageEndFingerprint) continue;
      lastIdlessMessageEndFingerprint = messageEndFingerprint;
    }
    assistantTurnCount += 1;
    const usageObject = messageRecord.usage;
    if (!usageObject || typeof usageObject !== "object" || Array.isArray(usageObject)) {
      inputComplete = false;
      outputComplete = false;
      totalComplete = false;
      cacheReadComplete = false;
      cacheWriteComplete = false;
      costComplete = false;
      continue;
    }
    const usageData = usageObject as Record<string, unknown>;
    usageSeen = true;

    if (typeof usageData.input === "number") inputTotal += usageData.input;
    else inputComplete = false;
    if (typeof usageData.output === "number") outputTotal += usageData.output;
    else outputComplete = false;
    if (typeof usageData.totalTokens === "number") totalTokens += usageData.totalTokens;
    else totalComplete = false;
    if (typeof usageData.cacheRead === "number") cacheReadTotal += usageData.cacheRead;
    else cacheReadComplete = false;
    if (typeof usageData.cacheWrite === "number") cacheWriteTotal += usageData.cacheWrite;
    else cacheWriteComplete = false;

    const cost = usageData.cost;
    if (cost && typeof cost === "object" && !Array.isArray(cost) && typeof (cost as Record<string, unknown>).total === "number") {
      costTotal += (cost as Record<string, unknown>).total as number;
    } else {
      costComplete = false;
    }
  }

  if (!usageSeen || assistantTurnCount === 0) return facts;
  if (inputComplete) usage.input_tokens = inputTotal;
  if (outputComplete) usage.output_tokens = outputTotal;
  if (totalComplete) usage.total_tokens = totalTokens;
  if (cacheReadComplete) usage.cache_read_tokens = cacheReadTotal;
  if (cacheWriteComplete) usage.cache_write_tokens = cacheWriteTotal;
  if (facts.provider) usage.provider = facts.provider;
  if (facts.model) usage.model = facts.model;
  if (costComplete) {
    facts.costUsd = costTotal;
    usage.cost_usd = costTotal;
  }
  facts.usage = usage;
  return facts;
}

async function persistFinalMessage(
  artifacts: MissionArtifactContext,
  finalMessage: string,
): Promise<void> {
  await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, finalMessage);
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: OhMyPiRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
  reportedFacts: OmpReportedFacts,
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "oh-my-pi",
    status: sessionStatus,
    command: plan.command,
    args: plan.args,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: finishedAt,
    ...(reportedFacts.provider ? { provider: reportedFacts.provider } : {}),
    ...(reportedFacts.model ? { model: reportedFacts.model } : {}),
    ...(reportedFacts.usage ? { usage: reportedFacts.usage } : {}),
    ...(reportedFacts.costUsd !== undefined ? { cost_usd: reportedFacts.costUsd } : {}),
  });
}
