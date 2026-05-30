import { z } from "zod";
import { spawn } from "node:child_process";
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
import { AdapterDocument, AdapterConfigSchema, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
import { buildUsageEvent, estimateUsage } from "../harness/usage.js";
import { loadHonchoMemoryBlock, recordMissionExchange } from "../extensions/honcho-memory/index.js";
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

export type HermesRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  /** Memory-free prompt, recorded to Honcho after the run (UH-59 parity). */
  basePrompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
  /**
   * UH-137 — resolved Honcho opt-out for this mission. `false` when
   * `runtime_config.honcho_memory: false`; otherwise `true`. When `false`,
   * the record path skips `recordMissionExchange` just as the planner skipped
   * `loadHonchoMemoryBlock`.
   */
  honchoMemoryEnabled: boolean;
};

/**
 * Input the adapter hands to a Hermes runner.
 *
 * Runners are responsible for invoking the configured CLI with the given
 * arguments inside `cwd`. They MUST honor `timeoutMs` when set; on expiry,
 * return `timedOut: true` and a non-zero exit code. The default runner uses
 * `child_process.spawn`; tests inject deterministic stubs.
 */
export interface HermesRunnerInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

/**
 * Output a Hermes runner returns to the adapter.
 *
 * Errors are surfaced explicitly rather than swallowed: a spawn failure sets
 * `spawnError`; a timeout sets `timedOut`. The adapter translates these into
 * `failed` runtime-result entries with explicit `errors[]` items.
 */
export interface HermesRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  spawnError?: string;
}

export type HermesRunner = (input: HermesRunnerInput) => Promise<HermesRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface PlanHermesOptions {
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}

export interface RunHermesOptions {
  runner?: HermesRunner;
  timeoutMs?: number;
  collectDiff?: DiffCollector;
  /** UH-81 — forwarded into the planner so the merge happens before strict-parse. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Explicit per-run id; generated when absent. UH-82. */
  runId?: string;
}

export interface RunHermesResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
  /** UH-82 — id of the per-run artifact directory written. */
  runId: string;
}

export interface HermesCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: HermesRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: HermesRunnerOutput;
  diff: DiffCaptureResult;
}

export interface HermesCollectOutput {
  exitCode: number;
  stderr: string;
  result?: RuntimeResultDocument;
}

const execFileP = promisify(execFile);

export async function loadAdapterConfig(root: string, runtimeId: string): Promise<AdapterDocument> {
  const entry = await runtimeRegistry.load(root, runtimeId);
  return entry.document;
}

/**
 * Minimum Hermes Agent version required by Ultimate Harness.
 *
 * Hermes Agent v0.14.0 introduced the `hermes proxy` OAI-compatible local
 * endpoint (UH-32), the per-turn file-mutation verifier footer, and the
 * codex app-server runtime with OAuth refresh classification. Older Hermes
 * builds are missing those capabilities and produce subtly different
 * runtime artifacts; gate explicitly rather than silently accept.
 */
export const MINIMUM_HERMES_VERSION = { major: 0, minor: 14, patch: 0 } as const;

export type HermesSemver = { major: number; minor: number; patch: number };

/**
 * Pull the first M.N.P (or M.N.P-pre / M.N.P+build) number out of a `hermes
 * --version` output. Returns null when no semver-like sequence is found.
 *
 * Tolerates the variants we have observed in the wild:
 * - "hermes 0.14.0"
 * - "Hermes Agent 0.14.0"
 * - "hermes-agent 0.14.0-beta.1"
 * - "hermes 0.14.0 (build abc)"
 */
export function parseHermesVersion(output: string): HermesSemver | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

/**
 * Returns true when `version` is at least `MINIMUM_HERMES_VERSION` in semver
 * order. Pre-release / build suffixes are ignored; we compare the base triple.
 */
export function meetsMinimumHermesVersion(version: HermesSemver): boolean {
  const min = MINIMUM_HERMES_VERSION;
  if (version.major !== min.major) return version.major > min.major;
  if (version.minor !== min.minor) return version.minor > min.minor;
  return version.patch >= min.patch;
}

/**
 * Hermes runtime availability check.
 *
 * Runs `<cli_command> --version` and `<cli_command> status`; the manifest is
 * trusted because it has already been loaded and validated by the registry.
 * Hard failures from missing manifests never reach here — they are surfaced
 * by `RuntimeRegistry.load`/`check` upstream.
 */
async function runHermesCliCheck(command: string): Promise<AdapterCheckResult> {
  const result: AdapterCheckResult = {
    runtime: "hermes",
    found: false,
    version: "",
    errors: [],
  };

  let versionOutput: string;
  try {
    const { stdout } = await execFileP(command, ["--version"]);
    versionOutput = stdout.trim();
  } catch {
    result.errors.push(
      "hermes CLI not found in PATH. Install: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
    );
    return result;
  }

  result.found = true;
  result.version = versionOutput;

  const parsed = parseHermesVersion(versionOutput);
  if (!parsed) {
    result.errors.push(
      `hermes --version output not recognized; expected M.N.P somewhere in: ${versionOutput}`,
    );
  } else if (!meetsMinimumHermesVersion(parsed)) {
    const min = MINIMUM_HERMES_VERSION;
    result.errors.push(
      `hermes ${min.major}.${min.minor}.${min.patch}+ required (you have ${parsed.major}.${parsed.minor}.${parsed.patch}); upgrade with: pip install --upgrade hermes-agent`,
    );
  }

  try {
    await execFileP(command, ["status"]);
  } catch {
    result.errors.push("hermes status failed; may need initial setup (hermes setup or hermes model)");
  }

  return result;
}

const hermesRuntimeChecker: AdapterRuntimeChecker = async (manifest) => {
  const command = manifest.config?.cli_command || "hermes";
  return runHermesCliCheck(command);
};

runtimeRegistry.register("hermes", hermesRuntimeChecker);

/**
 * Hermes has no runtime-specific runtime_config keys today beyond the UH-137
 * `honcho_memory` opt-out. The strict schema ensures that any other typo or
 * accidental key in `config.runtime_config:` for hermes manifests fails fast
 * instead of being silently dropped.
 */
export const HermesRuntimeConfigSchema = z
  .object({
    // UH-137: per-mission Honcho opt-out. Omitted/true -> Honcho memory
    // enrich, record, and the honcho_search/honcho_remember tools run when
    // Honcho env is configured. false -> all Honcho activity is skipped.
    honcho_memory: z.boolean().optional(),
  })
  .strict();
export type HermesRuntimeConfig = z.infer<typeof HermesRuntimeConfigSchema>;
registerRuntimeConfigSchema("hermes", HermesRuntimeConfigSchema);

/**
 * Convenience wrapper that mirrors the CLI's hermes check.
 *
 * - With `root`: dispatches through the registry so manifest errors and CLI
 *   errors share the same structured shape.
 * - Without `root`: probes the hermes CLI directly (used in environments
 *   without an initialized `.harness/`).
 */
export async function checkHermes(root?: string): Promise<CheckResult> {
  if (root) {
    return runtimeRegistry.check(root, "hermes");
  }
  return runHermesCliCheck("hermes");
}

export async function dryRunHermes(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planHermesRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "hermes",
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
 * Compile a mission into the command, args, and prompt the Hermes runner
 * needs. Throws when the mission or adapter manifest cannot be loaded;
 * recoverable issues (missing workflow profile) are returned in `errors[]`
 * so the caller decides whether to proceed.
 */
export async function planHermesRun(root: string, missionPath: string, options: PlanHermesOptions = {}): Promise<HermesRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "hermes");

  let mission: MissionDocument;
  try {
    const content = await readFile(missionPath, "utf-8");
    const parsed = parse(content);
    mission = validateMission(parsed);
  } catch (e) {
    throw new Error(`Mission load error: ${(e as Error).message}`);
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

  // UH-33: merge mission-level runtime_config_overrides on top of the
  // adapter manifest defaults, then strict-parse via the per-runtime
  // schema. HermesRuntimeConfigSchema is currently empty-strict, so any
  // override key will fail load — but the wiring is in place for the day
  // hermes gains runtime-specific config (e.g. hermes-proxy endpoint).
  // UH-81: `options.extraRuntimeConfigOverrides` is the CLI-time
  // `--runtime-config-overrides <json>` payload; it wins over the
  // mission file (later spread = higher precedence).
  const mergedRuntimeConfig = {
    ...(adapter.config?.runtime_config ?? {}),
    ...mergeRuntimeConfigOverrides(mission, options.extraRuntimeConfigOverrides),
  };
  let runtimeConfig: HermesRuntimeConfig;
  try {
    runtimeConfig = HermesRuntimeConfigSchema.parse(mergedRuntimeConfig);
  } catch (e) {
    throw new Error(`Mission runtime_config_overrides validation failed: ${(e as Error).message}`);
  }
  // UH-137: `runtime_config.honcho_memory: false` disables ALL Honcho activity
  // for this mission (enrich here + record later). Default ON; the
  // honcho-memory extension itself no-ops when Honcho env is not configured.
  const honchoMemoryEnabled = runtimeConfig.honcho_memory !== false;

  const defaultConfig: z.infer<typeof AdapterConfigSchema> = {
    cli_command: "hermes",
    default_toolsets: [],
    default_provider: "",
    default_model: "",
    worktree_mode: false,
    pass_session_id: true,
    runtime_config: {},
  };
  const config = adapter.config ?? defaultConfig;
  const toolsets = config.default_toolsets.length > 0
    ? config.default_toolsets.join(",")
    : "terminal,file,web";

  const ctx = buildDispatchContext(mission, workflow);
  const basePrompt = renderPrompt(ctx);
  ctx.memoryBlock = honchoMemoryEnabled
    ? (await loadHonchoMemoryBlock({ cwd: root, missionId: mission.id })) ?? undefined
    : undefined;
  const prompt = renderPrompt(ctx);
  const args = [
    "chat",
    "-q",
    prompt,
    "--toolsets",
    toolsets,
    "--source",
    "ultimate-harness",
  ];

  if (config.worktree_mode) args.push("-w");
  if (config.pass_session_id) args.push("--pass-session-id");
  if (config.default_model) args.push("--model", config.default_model);
  if (config.default_provider) args.push("--provider", config.default_provider);

  return {
    command: config.cli_command || "hermes",
    args,
    prompt,
    basePrompt,
    worktree: config.worktree_mode,
    session_id_passthrough: config.pass_session_id,
    errors,
    mission,
    honchoMemoryEnabled,
  };
}

/**
 * Default runner. Streams stdout/stderr from a spawned child, applies a
 * SIGKILL on timeout, and never throws — failures surface as `spawnError` or
 * `timedOut` on the returned record so the adapter can translate them into a
 * `failed` runtime-result with explicit errors.
 */
export const defaultHermesRunner: HermesRunner = (input) => {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    const finalize = (exitCode: number, spawnError?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, spawnError });
    };

    if (typeof input.timeoutMs === "number" && input.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch { /* child already exited */ }
      }, input.timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code: number | null) => {
      finalize(timedOut ? 1 : code ?? 1);
    });
    child.on("error", (err: Error) => {
      finalize(1, err.message);
    });
  });
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
 * Execute a mission against the Hermes runtime end-to-end.
 *
 * Orchestrates: `planHermesRun` -> writeable artifact context ->
 * `runtime.started` audit -> runner invocation -> diff capture ->
 * `collectHermesSession`. The runner and diff collector are injectable so
 * tests can drive deterministic outcomes (success, non-zero exit, timeout,
 * malformed result block) without invoking a real `hermes` binary.
 */
export async function runHermes(
  root: string,
  missionPath: string,
  options: RunHermesOptions = {},
): Promise<RunHermesResult> {
  const plan = await planHermesRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides });
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const runId = options.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const artifacts = await getMissionArtifactContext(root, missionPath, runId);

  // UH-82: pointer + index entry written BEFORE any artifact lands so an
  // operator inspecting state mid-run sees the in-flight row instead of a
  // dangling per-run dir with no top-level breadcrumb.
  if (artifacts) {
    await writeLatestPointer(root, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      status: "running",
    });
    await appendRunsIndexEntry(root, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      status: "running",
      runtime: "hermes",
    });
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "hermes",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "hermes",
      mission_id: plan.mission.id,
      command: plan.command,
      args: plan.args,
      run_id: runId,
    });
  }

  // Audit event
  try {
    const logPath = auditLog(root);
    const auditEntry = JSON.stringify({
      event: "mission.run",
      timestamp: new Date().toISOString(),
      runtime: "hermes",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
      run_id: runId,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultHermesRunner;
  let runnerResult: HermesRunnerOutput;
  let collection: HermesCollectOutput;
  try {
    runnerResult = await runner({
      command: plan.command,
      args: plan.args,
      cwd: root,
      timeoutMs: options.timeoutMs,
    });

    const collectDiff = options.collectDiff ?? defaultDiffCollector;
    const diff = await collectDiff(root);
    const finishedAt = new Date().toISOString();

    collection = await collectHermesSession({
      root,
      artifacts,
      plan,
      startedAt,
      finishedAt,
      runnerResult,
      diff,
    });
  } finally {
    // UH-82: mirror + terminal pointer always run, even when the runner or
    // diff-collector throws. Without this, a crashed run leaves
    // `latest.json` stuck at `running` forever.
    if (artifacts) {
      try {
        await mirrorRuntimeResultToLatest(root, plan.mission.id, runId);
      } catch {
        // mirror best-effort; the per-run copy is still on disk.
      }
    }
  }

  if (artifacts) {
    const finishedAt = new Date().toISOString();
    const terminalStatus = deriveRunStatus(collection.result, collection.exitCode);
    await writeLatestPointer(root, plan.mission.id, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: terminalStatus,
    });
    await appendRunsIndexEntry(root, plan.mission.id, {
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: terminalStatus,
      runtime: "hermes",
    });
  }

  return {
    exitCode: collection.exitCode,
    stdout: runnerResult.stdout,
    stderr: collection.stderr,
    result: collection.result,
    runId,
  };
}

/**
 * UH-82 run-status derivation: `runtime-result.status` carries the
 * authoritative four-way (passed/failed/blocked/cancelled). When the
 * collector failed before writing one, fall back on the exit code.
 */
function deriveRunStatus(
  result: RuntimeResultDocument | undefined,
  exitCode: number,
): RunStatus {
  if (result?.status) return result.status;
  return exitCode === 0 ? "blocked" : "failed";
}

/**
 * Persist a completed Hermes session: stdout.log, stderr.log, diff.patch,
 * runtime-result.yaml, and the back-compat runtime-session.yaml. Determines
 * the runtime-result `status` from the runner outcome and any final
 * `uh.runtime-result.v0` block emitted by Hermes on stdout.
 *
 * Status rules:
 *  - `spawnError` -> failed (with explicit "Spawn error: ..." stderr)
 *  - `timedOut`   -> failed (with timeout error)
 *  - `exitCode != 0` -> failed
 *  - `exitCode == 0` + valid final block with status passed/completed -> passed
 *  - `exitCode == 0` + any other final block status -> that block's status
 *  - `exitCode == 0` + missing/malformed block -> blocked
 *
 * Artifact-write failures are caught and surfaced via stderr so callers see
 * the cause instead of getting a silent partial commit.
 */
export async function collectHermesSession(
  input: HermesCollectInput,
): Promise<HermesCollectOutput> {
  const { artifacts, plan, runnerResult, diff, startedAt, finishedAt, root } = input;

  const errors: string[] = [];
  let stderr = runnerResult.stderr;
  let exitCode = runnerResult.exitCode;

  if (runnerResult.spawnError) {
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Spawn error: ${runnerResult.spawnError}`;
    errors.push(`Spawn error: ${runnerResult.spawnError}`);
    if (exitCode === 0) exitCode = 1;
  }
  if (runnerResult.timedOut) {
    errors.push("Runtime timed out");
    if (exitCode === 0) exitCode = 1;
  }
  if (diff.errors) {
    errors.push(...diff.errors);
  }

  const finalBlock = parseHermesFinalBlock(runnerResult.stdout);

  let status: RuntimeResultStatus;
  if (exitCode !== 0) {
    status = "failed";
    if (!finalBlock.valid && finalBlock.found) {
      errors.push(...finalBlock.errors);
    }
  } else if (!finalBlock.found) {
    status = "blocked";
    errors.push("Hermes did not emit a uh.runtime-result.v0 block on stdout");
  } else if (!finalBlock.valid) {
    status = "blocked";
    errors.push(...finalBlock.errors);
  } else if (finalBlock.status === "passed") {
    status = "passed";
  } else {
    status = finalBlock.status;
  }

  if (!artifacts) {
    return { exitCode, stderr };
  }

  let result: RuntimeResultDocument | undefined;
  try {
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, runnerResult.stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    // UH-28: extract the runtime-final-message sentinel from Hermes stdout.
    // Hermes does not produce its own runtime-final.txt; this is the only path
    // by which the sentinel block becomes a first-class artifact. When the
    // model omits the sentinel, runtime-final.txt is written as an empty file
    // for parity with codex/oh-my-pi.
    const hermesSentinel = extractRuntimeFinalMessageSentinel(runnerResult.stdout);
    await writeArtifactFile(
      artifacts.missionDir,
      artifacts.finalMessagePath,
      hermesSentinel ?? "",
    );

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "hermes",
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: exitCode,
      prompt_path: path.relative(root, artifacts.promptPath),
      stdout_path: path.relative(root, artifacts.stdoutPath),
      stderr_path: path.relative(root, artifacts.stderrPath),
      diff_path: path.relative(root, artifacts.diffPath),
      errors,
    };
    result = validateRuntimeResult(draft);
    await writeArtifactFile(artifacts.missionDir, artifacts.runtimeResultPath, stringify(result));

    await persistFinalRuntimeSession(
      artifacts,
      plan,
      startedAt,
      finishedAt,
      exitCode,
      exitCode === 0 ? "succeeded" : "failed",
    );

    await appendMissionEvent(
      artifacts,
      buildUsageEvent("hermes", plan.mission.id, estimateUsage(plan.prompt, hermesSentinel ?? ""), finishedAt),
    );

    if (hermesSentinel) {
      await recordMissionExchange(plan.basePrompt, hermesSentinel, {
        cwd: root,
        missionId: plan.mission.id,
      });
    }
  } catch (err) {
    const message = (err as Error).message;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Artifact persistence failure: ${message}`;
    return { exitCode: exitCode === 0 ? 1 : exitCode, stderr };
  }

  return { exitCode, stderr, result };
}

interface FinalBlock {
  found: boolean;
  valid: boolean;
  status: RuntimeResultStatus;
  errors: string[];
}

const VALID_RUNTIME_RESULT_STATUSES = new Set<RuntimeResultStatus>([
  "passed",
  "failed",
  "blocked",
  "cancelled",
]);

/**
 * Locate the trailing fenced ```yaml block in the Hermes stdout, parse it,
 * and confirm it looks like a `uh.runtime-result.v0` packet. The adapter
 * does not require every field — only `schema_version` and a `status` that
 * maps onto our enum. The runtime-result is authored by the harness; the
 * model only signals its terminal status.
 *
 * Normalizes the contract doc's `completed` synonym to our `passed` enum.
 */
function parseHermesFinalBlock(stdout: string): FinalBlock {
  const matches = stdout.match(/```yaml\s*\n([\s\S]*?)\n```/g);
  if (!matches || matches.length === 0) {
    return { found: false, valid: false, status: "blocked", errors: [] };
  }
  const raw = matches[matches.length - 1];
  const body = raw.replace(/^```yaml\s*\n/, "").replace(/\n```$/, "");
  let parsed: unknown;
  try {
    parsed = parse(body);
  } catch (err) {
    return {
      found: true,
      valid: false,
      status: "blocked",
      errors: [`Runtime-result block YAML parse error: ${(err as Error).message}`],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      found: true,
      valid: false,
      status: "blocked",
      errors: ["Runtime-result block is not a YAML mapping"],
    };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schema_version !== "uh.runtime-result.v0") {
    return {
      found: true,
      valid: false,
      status: "blocked",
      errors: [
        `Runtime-result block has unexpected schema_version: ${String(obj.schema_version)}`,
      ],
    };
  }
  const raw_status = obj.status;
  if (typeof raw_status !== "string") {
    return {
      found: true,
      valid: false,
      status: "blocked",
      errors: ["Runtime-result block missing status"],
    };
  }
  const normalized: string = raw_status === "completed" ? "passed" : raw_status;
  if (!VALID_RUNTIME_RESULT_STATUSES.has(normalized as RuntimeResultStatus)) {
    return {
      found: true,
      valid: false,
      status: "blocked",
      errors: [`Runtime-result block has invalid status: ${raw_status}`],
    };
  }
  return { found: true, valid: true, status: normalized as RuntimeResultStatus, errors: [] };
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: HermesRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "hermes",
    status: sessionStatus,
    command: plan.command,
    args: plan.args,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: finishedAt,
  });
  await appendMissionEvent(artifacts, {
    event: "runtime.finished",
    timestamp: finishedAt,
    runtime: "hermes",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}
