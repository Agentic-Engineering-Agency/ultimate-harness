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
import { AdapterDocument, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { z } from "zod";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
import { buildUsageEvent, estimateUsage } from "../harness/usage.js";
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

export type PiRunPlan = {
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
};

/**
 * Input the adapter hands to a Pi runner.
 *
 * Runners are responsible for invoking the configured CLI with the given
 * arguments inside `cwd`. They MUST honor `timeoutMs` when set; on expiry,
 * return `timedOut: true` and a non-zero exit code. The default runner uses
 * `child_process.spawn`; tests inject deterministic stubs.
 */
export interface PiRunnerInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

/**
 * Output a Pi runner returns to the adapter.
 *
 * Errors are surfaced explicitly rather than swallowed: a spawn failure sets
 * `spawnError`; a timeout sets `timedOut`. The adapter translates these into
 * `failed` runtime-result entries with explicit `errors[]` items.
 */
export interface PiRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  spawnError?: string;
}

export type PiRunner = (input: PiRunnerInput) => Promise<PiRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface PlanPiOptions {
  /** UH-81 — CLI-time overrides spread on top of mission.runtime_config_overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}

export interface RunPiOptions {
  runner?: PiRunner;
  timeoutMs?: number;
  collectDiff?: DiffCollector;
  /** UH-81 — forwarded into the planner so the merge happens before strict-parse. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Explicit per-run id; generated when absent. UH-82. */
  runId?: string;
}

export interface RunPiResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
  /** UH-82 — id of the per-run artifact directory written. */
  runId: string;
}

export interface PiCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: PiRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: PiRunnerOutput;
  diff: DiffCaptureResult;
}

export interface PiCollectOutput {
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

async function runPiCliCheck(command: string): Promise<AdapterCheckResult> {
  const result: AdapterCheckResult = {
    runtime: "pi",
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
      `${command} CLI not found in PATH. Install the pi agent CLI and ensure \`${command}\` is on PATH.`,
    );
  }

  return result;
}

const piRuntimeChecker: AdapterRuntimeChecker = async (manifest) => {
  const command = manifest.config?.cli_command ? manifest.config.cli_command : "pi";
  return runPiCliCheck(command);
};

runtimeRegistry.register("pi", piRuntimeChecker);

/**
 * Strict Zod schema for `config.runtime_config` of the pi adapter.
 *
 * Registered with the adapter-schema registry so manifests are validated at
 * load time; unknown keys raise a Zod error.
 */
export const PiRuntimeConfigSchema = z.object({
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
}).strict();

export type PiRuntimeConfig = z.infer<typeof PiRuntimeConfigSchema>;

registerRuntimeConfigSchema("pi", PiRuntimeConfigSchema);

/** Extract the strongly-typed pi `runtime_config` from an adapter manifest. */
export function getPiRuntimeConfig(adapter: AdapterDocument): PiRuntimeConfig {
  return PiRuntimeConfigSchema.parse(adapter.config?.runtime_config ?? {});
}

/**
 * Convenience wrapper that mirrors the CLI's pi check.
 *
 * - With `root`: dispatches through the registry so manifest errors and CLI
 *   errors share the same structured shape.
 * - Without `root`: probes the pi CLI directly (used in environments
 *   without an initialized `.harness/`).
 */
export async function checkPi(root?: string): Promise<CheckResult> {
  if (root) {
    return runtimeRegistry.check(root, "pi");
  }
  return runPiCliCheck("pi");
}

export async function dryRunPi(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planPiRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath, generateRunId());
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "pi",
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
 * Compile a mission into the command, args, and prompt the Pi runner
 * needs. Throws when the mission or adapter manifest cannot be loaded;
 * recoverable issues (missing workflow profile) are returned in `errors[]`
 * so the caller decides whether to proceed.
 */
export async function planPiRun(root: string, missionPath: string, options: PlanPiOptions = {}): Promise<PiRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "pi");

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
    runtimeConfig = PiRuntimeConfigSchema.parse(mergedRuntimeConfig);
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
  const cliCommand = config?.cli_command ? config.cli_command : "pi";
  const worktreeMode = config?.worktree_mode === true;
  if (config?.pass_session_id === true) {
    errors.push("Pi assigns its own thread id; set pass_session_id: false");
  }

  const mode = runtimeConfig.mode;
  if (mode === "rpc-ui") {
    errors.push("pi mode rpc-ui expects a TUI parent; use mode: json, text, or rpc for headless runs");
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
  const ctx = buildDispatchContext(mission, workflow);
  const basePrompt = renderPrompt(ctx);
  const memoryBlock = await loadHonchoMemoryBlock({ cwd: root, missionId: mission.id });
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
  // Vanilla pi takes the prompt as a positional arg; it has no `--no-title`
  // flag (that is an oh-my-pi/omp extension). Verified against `pi --help` (v0.73.1).
  args.push(prompt);

  return {
    command: cliCommand,
    args,
    prompt,
    basePrompt,
    worktree: worktreeMode,
    session_id_passthrough: false,
    errors,
    mission,
  };
}

/**
 * Default runner. Streams stdout/stderr from a spawned child, applies a
 * SIGKILL on timeout, and never throws — failures surface as `spawnError` or
 * `timedOut` on the returned record so the adapter can translate them into a
 * `failed` runtime-result with explicit errors.
 */
export const defaultPiRunner: PiRunner = (input) => {
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
 * Execute a mission against the Pi runtime end-to-end.
 *
 * Orchestrates: `planPiRun` -> writeable artifact context ->
 * `runtime.started` audit -> runner invocation -> diff capture ->
 * `collectPiSession`. The runner and diff collector are injectable so
 * tests can drive deterministic outcomes (success, non-zero exit, timeout,
 * malformed result block) without invoking a real `pi` binary.
 */
export async function runPi(
  root: string,
  missionPath: string,
  options: RunPiOptions = {},
): Promise<RunPiResult> {
  const plan = await planPiRun(root, missionPath, { extraRuntimeConfigOverrides: options.extraRuntimeConfigOverrides });
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const runId = options.runId ?? generateRunId();
  const startedAt = new Date().toISOString();
  const artifacts = await getMissionArtifactContext(root, missionPath, runId);

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
      runtime: "pi",
    });
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "pi",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "pi",
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
      runtime: "pi",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
      run_id: runId,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultPiRunner;
  let runnerResult: PiRunnerOutput;
  let collection: PiCollectOutput;
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

    collection = await collectPiSession({
      root,
      artifacts,
      plan,
      startedAt,
      finishedAt,
      runnerResult,
      diff,
    });
  } finally {
    if (artifacts) {
      try {
        await mirrorRuntimeResultToLatest(root, plan.mission.id, runId);
      } catch {
        // best-effort.
      }
    }
  }

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

  if (artifacts) {
    const finishedAt = new Date().toISOString();
    const terminalStatus = deriveOmpRunStatus(collection.result, collection.exitCode);
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
      runtime: "pi",
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

function deriveOmpRunStatus(
  result: RuntimeResultDocument | undefined,
  exitCode: number,
): RunStatus {
  if (result?.status) return result.status;
  return exitCode === 0 ? "blocked" : "failed";
}

/**
 * Persist a completed Pi session: stdout.log, stderr.log, diff.patch,
 * runtime-result.yaml, and the back-compat runtime-session.yaml. Determines
 * the runtime-result `status` from the runner outcome and any final
 * `uh.runtime-result.v0` block emitted by Pi on stdout.
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
export async function collectPiSession(
  input: PiCollectInput,
): Promise<PiCollectOutput> {
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

  const quotaError = detectPiQuotaError(runnerResult.stdout, stderr);
  if (quotaError) {
    errors.push(quotaError);
  }

  const parsedStream = parsePiOutput(runnerResult.stdout);
  errors.push(...parsedStream.parseErrors);

  // Prefer the UH-28 runtime-final-message sentinel over the heuristic
  // (last assistant-like JSON entry). Scans the heuristic-extracted last
  // assistant text (which is the JSON-decoded content, with real newlines)
  // rather than the raw NDJSON stdout where newlines are JSON-escaped.
  // Falls back to the heuristic when the sentinel is absent.
  const heuristicFinal = parsedStream.finalMessage;
  const sentinel = extractRuntimeFinalMessageSentinel(heuristicFinal);
  const finalMessage = sentinel ?? heuristicFinal;
  const finalMessageMissing = finalMessage.length === 0;
  if (finalMessageMissing) {
    errors.push("pi did not emit a final assistant message");
  }

  let status: RuntimeResultStatus;
  if (runnerResult.spawnError) {
    status = "failed";
  } else if (runnerResult.timedOut) {
    status = "failed";
  } else if (quotaError) {
    status = "blocked";
  } else if (exitCode !== 0) {
    status = "failed";
  } else if (finalMessageMissing) {
    status = "blocked";
  } else {
    status = "passed";
  }

  if (!artifacts) {
    return { exitCode, stderr, finalMessage };
  }

  let result: RuntimeResultDocument | undefined;
  try {
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, runnerResult.stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    await persistFinalMessage(artifacts, finalMessage);
    for (const event of parsedStream.events) {
      if (typeof event.type === "string") {
        await appendMissionEvent(artifacts, {
          ...event,
          event: `pi.${event.type}`,
        });
      }
    }

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "pi",
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
      buildUsageEvent("pi", plan.mission.id, estimateUsage(plan.prompt, finalMessage), finishedAt),
    );
  } catch (err) {
    const message = (err as Error).message;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Artifact persistence failure: ${message}`;
    return { exitCode: exitCode === 0 ? 1 : exitCode, stderr, finalMessage };
  }

  return { exitCode, stderr, result, finalMessage };
}

export function parsePiOutput(stdout: string): { events: Array<Record<string, unknown>>; parseErrors: string[]; finalMessage: string } {
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
        parseErrors.push(`Pi JSON line ${index + 1} is not an object`);
      }
    } catch (err) {
      parseErrors.push(`Pi JSON line ${index + 1} parse error: ${(err as Error).message}`);
    }
  }

  if (events.length === 0 && stdout.trim().length > 0) {
    try {
      const parsed = JSON.parse(stdout) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
        parseErrors.length = 0;
      } else {
        parseErrors.push("Pi JSON output is not an object");
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

export function detectPiQuotaError(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;
  const pattern = /usage limit|rate limit|not authenticated|auth(orization)? required|please log in|quota|credit|401|403|api[- ]?key/i;
  if (!pattern.test(combined)) {
    return null;
  }
  const firstMatch = combined
    .split("\n")
    .map((line) => line.trim())
    .find((line) => pattern.test(line));
  const detail = firstMatch && firstMatch.length > 0 ? `: ${firstMatch}` : "";
  return `pi auth or quota error${detail}`;
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
  }
  return "";
}

async function persistFinalMessage(
  artifacts: MissionArtifactContext,
  finalMessage: string,
): Promise<void> {
  await writeArtifactFile(artifacts.missionDir, artifacts.finalMessagePath, finalMessage);
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: PiRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "pi",
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
    runtime: "pi",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}
