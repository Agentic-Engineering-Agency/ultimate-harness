import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, appendFile, lstat, writeFile, copyFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, registerRuntimeConfigSchema } from "../schema/adapter.js";
import { z } from "zod";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
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
import {
  extractRuntimeFinalMessageSentinel,
  runtimeFinalMessageInstruction,
} from "../harness/runtime-final-message.js";

type MissionArtifactContext = {
  missionDir: string;
  promptPath: string;
  runtimeSessionPath: string;
  eventsPath: string;
  stdoutPath: string;
  stderrPath: string;
  diffPath: string;
  runtimeResultPath: string;
  finalMessagePath: string;
};

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

export type CodexRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
};

/**
 * Input the adapter hands to a Codex runner.
 *
 * Runners are responsible for invoking the configured CLI with the given
 * arguments inside `cwd`. They MUST honor `timeoutMs` when set; on expiry,
 * return `timedOut: true` and a non-zero exit code. The default runner uses
 * `child_process.spawn`; tests inject deterministic stubs.
 */
export interface CodexRunnerInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

/**
 * Output a Codex runner returns to the adapter.
 *
 * Errors are surfaced explicitly rather than swallowed: a spawn failure sets
 * `spawnError`; a timeout sets `timedOut`. The adapter translates these into
 * `failed` runtime-result entries with explicit `errors[]` items.
 */
export interface CodexRunnerOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  spawnError?: string;
}

export type CodexRunner = (input: CodexRunnerInput) => Promise<CodexRunnerOutput>;

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

export type DiffCollector = (cwd: string) => Promise<DiffCaptureResult>;

export interface RunCodexOptions {
  runner?: CodexRunner;
  timeoutMs?: number;
  collectDiff?: DiffCollector;
}

export interface RunCodexResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
}

export interface CodexCollectInput {
  root: string;
  artifacts: MissionArtifactContext | null;
  plan: CodexRunPlan;
  startedAt: string;
  finishedAt: string;
  runnerResult: CodexRunnerOutput;
  diff: DiffCaptureResult;
}

export interface CodexCollectOutput {
  exitCode: number;
  stderr: string;
  result?: RuntimeResultDocument;
}

const execFileP = promisify(execFile);

export async function loadAdapterConfig(root: string, runtimeId: string): Promise<AdapterDocument> {
  const entry = await runtimeRegistry.load(root, runtimeId);
  return entry.document;
}

async function runCodexCliCheck(command: string): Promise<AdapterCheckResult> {
  const result: AdapterCheckResult = {
    runtime: "codex",
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
      "codex CLI not found in PATH. Install: brew install --cask codex or https://github.com/openai/codex",
    );
  }

  return result;
}

const codexRuntimeChecker: AdapterRuntimeChecker = async (manifest) => {
  const command = manifest.config?.cli_command ? manifest.config.cli_command : "codex";
  return runCodexCliCheck(command);
};

runtimeRegistry.register("codex", codexRuntimeChecker);

/**
 * Strict Zod schema for `config.runtime_config` of the Codex adapter.
 *
 * Registered with the adapter-schema registry so manifests are validated
 * at load time; unknown keys (typos like `sandbox_modd`) raise a Zod error
 * instead of being silently dropped.
 */
export const CodexRuntimeConfigSchema = z.object({
  sandbox_mode: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .optional()
    .default("workspace-write"),
  approval_policy: z
    .enum(["never", "on-request", "on-failure", "untrusted"])
    .optional()
    .default("never"),
  full_auto_compat: z.boolean().optional().default(false),
}).strict();

export type CodexRuntimeConfig = z.infer<typeof CodexRuntimeConfigSchema>;

registerRuntimeConfigSchema("codex", CodexRuntimeConfigSchema);

/** Extract the strongly-typed Codex `runtime_config` from an adapter manifest. */
export function getCodexRuntimeConfig(adapter: AdapterDocument): CodexRuntimeConfig {
  return CodexRuntimeConfigSchema.parse(adapter.config?.runtime_config ?? {});
}

/**
 * Convenience wrapper that mirrors the CLI's codex check.
 *
 * - With `root`: dispatches through the registry so manifest errors and CLI
 *   errors share the same structured shape.
 * - Without `root`: probes the codex CLI directly (used in environments
 *   without an initialized `.harness/`).
 */
export async function checkCodex(root?: string): Promise<CheckResult> {
  if (root) {
    return runtimeRegistry.check(root, "codex");
  }
  return runCodexCliCheck("codex");
}

export async function dryRunCodex(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planCodexRun(root, missionPath);
    const artifacts = await getMissionArtifactContext(root, missionPath);
    if (artifacts) {
      await persistPromptAndSession(artifacts, plan.prompt, {
        schema_version: "uh.runtime-session.v0",
        mission_id: plan.mission.id,
        runtime: "codex",
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
 * Compile a mission into the command, args, and prompt the Codex runner
 * needs. Throws when the mission or adapter manifest cannot be loaded;
 * recoverable issues (missing workflow profile) are returned in `errors[]`
 * so the caller decides whether to proceed.
 */
export async function planCodexRun(root: string, missionPath: string): Promise<CodexRunPlan> {
  const errors: string[] = [];
  const adapter = await loadAdapterConfig(root, "codex");

  let mission: MissionDocument;
  try {
    const content = await readFile(missionPath, "utf-8");
    const parsed = parse(content);
    mission = validateMission(parsed);
  } catch (e) {
    throw new Error(`Mission load error: ${(e as Error).message}`);
  }

  // UH-33: merge mission-level runtime_config_overrides on top of the
  // adapter manifest defaults, then strict-parse via the per-runtime
  // schema so UH-26 typo safety extends to mission overrides.
  const mergedRuntimeConfig = {
    ...(adapter.config?.runtime_config ?? {}),
    ...mission.runtime_config_overrides,
  };
  let runtimeConfig;
  try {
    runtimeConfig = CodexRuntimeConfigSchema.parse(mergedRuntimeConfig);
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
  const cliCommand = config?.cli_command ? config.cli_command : "codex";
  const worktreeMode = config?.worktree_mode === true;
  if (config?.pass_session_id === true) {
    errors.push("Codex assigns its own thread id; set pass_session_id: false");
  }

  const sandboxMode = runtimeConfig.sandbox_mode;
  // approval_policy is retained in the runtime_config schema for backward
  // compatibility with manifests written against UH-23 / codex-cli <0.130,
  // but codex-cli 0.130+ no longer accepts the `--ask-for-approval` flag.
  // Under `--sandbox workspace-write`, in-sandbox actions are auto-approved
  // without an explicit flag (verified against codex-cli 0.130.0, UH-30).
  void runtimeConfig.approval_policy;
  // runtimeConfig.full_auto_compat is validated by schema; not yet consumed (reserved for legacy Codex builds).
  const finalMessagePath = await resolveFinalMessagePath(root, missionPath);

  const prompt = buildMissionPrompt(mission, workflow);
  const args = [
    "exec",
    "--cd",
    path.resolve(root),
    "--sandbox",
    sandboxMode,
    "--json",
    "--output-last-message",
    finalMessagePath,
    "--skip-git-repo-check",
    prompt,
  ];

  return {
    command: cliCommand,
    args,
    prompt,
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
export const defaultCodexRunner: CodexRunner = (input) => {
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
 * files in a single `git diff` output. The previous implementation
 * called `git diff --no-color` directly, which silently skipped
 * untracked new files — the most common mission output.
 */
export const defaultDiffCollector: DiffCollector = async (cwd) => {
  return captureDiffWithUntracked(cwd);
};

/**
 * Execute a mission against the Codex runtime end-to-end.
 *
 * Orchestrates: `planCodexRun` -> writeable artifact context ->
 * `runtime.started` audit -> runner invocation -> diff capture ->
 * `collectCodexSession`. The runner and diff collector are injectable so
 * tests can drive deterministic outcomes (success, non-zero exit, timeout,
 * malformed result block) without invoking a real `codex` binary.
 */
export async function runCodex(
  root: string,
  missionPath: string,
  options: RunCodexOptions = {},
): Promise<RunCodexResult> {
  const plan = await planCodexRun(root, missionPath);
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const artifacts = await getMissionArtifactContext(root, missionPath);
  const startedAt = new Date().toISOString();

  if (artifacts) {
    await persistPromptAndSession(artifacts, plan.prompt, {
      schema_version: "uh.runtime-session.v0",
      mission_id: plan.mission.id,
      runtime: "codex",
      status: "running",
      command: plan.command,
      args: plan.args,
      started_at: startedAt,
    });
    await appendMissionEvent(artifacts, {
      event: "runtime.started",
      timestamp: startedAt,
      runtime: "codex",
      mission_id: plan.mission.id,
      command: plan.command,
      args: plan.args,
    });
  }

  // Audit event
  try {
    const logPath = auditLog(root);
    const auditEntry = JSON.stringify({
      event: "mission.run",
      timestamp: new Date().toISOString(),
      runtime: "codex",
      mission_id: plan.mission.id,
      mission_name: plan.mission.name,
      workflow: plan.mission.workflow_profile,
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultCodexRunner;
  const runnerResult = await runner({
    command: plan.command,
    args: plan.args,
    cwd: root,
    timeoutMs: options.timeoutMs,
  });

  const collectDiff = options.collectDiff ?? defaultDiffCollector;
  const diff = await collectDiff(root);
  const finishedAt = new Date().toISOString();

  const collection = await collectCodexSession({
    root,
    artifacts,
    plan,
    startedAt,
    finishedAt,
    runnerResult,
    diff,
  });

  return {
    exitCode: collection.exitCode,
    stdout: runnerResult.stdout,
    stderr: collection.stderr,
    result: collection.result,
  };
}

/**
 * Persist a completed Codex session: stdout.log, stderr.log, diff.patch,
 * runtime-result.yaml, and the back-compat runtime-session.yaml. Determines
 * the runtime-result `status` from the runner outcome and any final
 * `uh.runtime-result.v0` block emitted by Codex on stdout.
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
export async function collectCodexSession(
  input: CodexCollectInput,
): Promise<CodexCollectOutput> {
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

  const quotaError = detectCodexQuotaError(runnerResult.stdout, stderr);
  if (quotaError) {
    errors.push(quotaError);
  }

  const parsedStream = parseCodexJsonlStream(runnerResult.stdout);
  errors.push(...parsedStream.parseErrors);

  let finalMessage = "";
  let finalMessageMissing = false;
  try {
    const rawFinalMessage = await readFile(getFinalMessagePath(plan.args), "utf-8");
    // Prefer the UH-28 runtime-final-message sentinel when present; this lets
    // missions explicitly bound the summary independent of Codex's raw
    // last-message capture. Fall back to the raw content for backward compat
    // with missions written before UH-28 (and with models that ignore the
    // sentinel instruction).
    const sentinel = extractRuntimeFinalMessageSentinel(rawFinalMessage);
    finalMessage = sentinel ?? rawFinalMessage;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      finalMessageMissing = true;
      errors.push("Codex did not write --output-last-message");
    } else {
      throw err;
    }
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
    return { exitCode, stderr };
  }

  let result: RuntimeResultDocument | undefined;
  try {
    await writeArtifactFile(artifacts.missionDir, artifacts.stdoutPath, runnerResult.stdout);
    await writeArtifactFile(artifacts.missionDir, artifacts.stderrPath, stderr);
    await writeArtifactFile(artifacts.missionDir, artifacts.diffPath, diff.patch);
    await persistFinalMessage(artifacts, finalMessage, finalMessageMissing);
    for (const event of parsedStream.events) {
      if (typeof event.type === "string") {
        await appendMissionEvent(artifacts, {
          ...event,
          event: `codex.${event.type}`,
        });
      }
    }

    const draft: RuntimeResultDocument = {
      schema_version: "uh.runtime-result.v0",
      mission_id: plan.mission.id,
      runtime: "codex",
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
  } catch (err) {
    const message = (err as Error).message;
    const separator = stderr && !stderr.endsWith("\n") ? "\n" : "";
    stderr = `${stderr}${separator}Artifact persistence failure: ${message}`;
    return { exitCode: exitCode === 0 ? 1 : exitCode, stderr };
  }

  return { exitCode, stderr, result };
}

export function parseCodexJsonlStream(stdout: string): { events: Array<Record<string, unknown>>; parseErrors: string[] } {
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
        parseErrors.push(`Codex JSONL line ${index + 1} is not an object`);
      }
    } catch (err) {
      parseErrors.push(`Codex JSONL line ${index + 1} parse error: ${(err as Error).message}`);
    }
  }
  return { events, parseErrors };
}

export function detectCodexQuotaError(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;
  if (!/usage limit|purchase more credits|usage exceeded|not authenticated|auth(orization)? required/i.test(combined)) {
    return null;
  }
  const firstMatch = combined
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /usage limit|purchase more credits|usage exceeded|not authenticated|auth(orization)? required/i.test(line));
  const detail = firstMatch && firstMatch.length > 0 ? `: ${firstMatch}` : "";
  return `Codex usage quota exhausted${detail}`;
}

async function resolveFinalMessagePath(root: string, missionPath: string): Promise<string> {
  const artifacts = await getMissionArtifactContext(root, missionPath);
  if (artifacts) return artifacts.finalMessagePath;
  return path.join(path.resolve(root), ".harness", "runtime-final.txt");
}

function getFinalMessagePath(args: string[]): string {
  const flagIndex = args.indexOf("--output-last-message");
  if (flagIndex < 0 || flagIndex + 1 >= args.length) {
    throw new Error("Codex run args missing --output-last-message path");
  }
  return args[flagIndex + 1];
}

async function persistFinalMessage(
  artifacts: MissionArtifactContext,
  finalMessage: string,
  missing: boolean,
): Promise<void> {
  // UH-28: write the in-memory finalMessage (sentinel-extracted or raw,
  // resolved at the call site) into runtime-final.txt. We deliberately
  // overwrite whatever Codex put there via --output-last-message — the
  // sentinel substitution would otherwise be lost when source === dest.
  await assertWritableArtifact(artifacts.missionDir, artifacts.finalMessagePath);
  await writeArtifactFile(
    artifacts.missionDir,
    artifacts.finalMessagePath,
    missing ? "" : finalMessage,
  );
}

async function getMissionArtifactContext(root: string, missionPath: string): Promise<MissionArtifactContext | null> {
  const rootResolved = path.resolve(root);
  const missionsRoot = path.join(rootResolved, ".harness", "missions");
  const resolvedMissionPath = path.isAbsolute(missionPath)
    ? path.resolve(missionPath)
    : path.resolve(rootResolved, missionPath);
  const relative = path.relative(missionsRoot, resolvedMissionPath);
  const parts = relative.split(path.sep);

  if (relative.startsWith("..") || path.isAbsolute(relative) || parts.length !== 2 || parts[1] !== "mission.yaml" || !parts[0]) {
    return null;
  }

  const harnessDir = path.join(rootResolved, ".harness");
  const harnessStat = await lstat(harnessDir);
  if (harnessStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked .harness directory: ${harnessDir}`);
  }
  if (!harnessStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory .harness path: ${harnessDir}`);
  }

  const missionsRootStat = await lstat(missionsRoot);
  if (missionsRootStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked missions directory: ${missionsRoot}`);
  }
  if (!missionsRootStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory missions path: ${missionsRoot}`);
  }

  const missionDir = path.join(missionsRoot, parts[0]);
  const missionDirStat = await lstat(missionDir);
  if (missionDirStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts into symlinked mission directory: ${missionDir}`);
  }
  if (!missionDirStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts into non-directory mission path: ${missionDir}`);
  }

  const context: MissionArtifactContext = {
    missionDir,
    promptPath: path.join(missionDir, "prompt.md"),
    runtimeSessionPath: path.join(missionDir, "runtime-session.yaml"),
    eventsPath: path.join(missionDir, "events.ndjson"),
    stdoutPath: path.join(missionDir, "runtime.stdout.log"),
    stderrPath: path.join(missionDir, "runtime.stderr.log"),
    diffPath: path.join(missionDir, "diff.patch"),
    runtimeResultPath: path.join(missionDir, "runtime-result.yaml"),
    finalMessagePath: path.join(missionDir, "runtime-final.txt"),
  };

  for (const artifactPath of [
    context.promptPath,
    context.runtimeSessionPath,
    context.eventsPath,
    context.stdoutPath,
    context.stderrPath,
    context.diffPath,
    context.runtimeResultPath,
    context.finalMessagePath,
  ]) {
    assertPathInsideMissionDir(missionDir, artifactPath);
  }

  return context;
}

async function assertWritableArtifact(missionDir: string, artifactPath: string): Promise<void> {
  assertPathInsideMissionDir(missionDir, artifactPath);
  try {
    const stat = await lstat(artifactPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlinked artifact: ${artifactPath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

function assertPathInsideMissionDir(missionDir: string, artifactPath: string): void {
  const relative = path.relative(missionDir, path.resolve(artifactPath));
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error(`Refusing to write artifact outside mission directory: ${artifactPath}`);
  }
}

async function writeArtifactFile(missionDir: string, artifactPath: string, content: string): Promise<void> {
  await assertWritableArtifact(missionDir, artifactPath);
  await writeFile(artifactPath, content, "utf-8");
}

async function persistPromptAndSession(
  artifacts: MissionArtifactContext,
  prompt: string,
  session: RuntimeSessionDocument,
): Promise<void> {
  await writeArtifactFile(artifacts.missionDir, artifacts.promptPath, prompt);
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify(session));
}

async function appendMissionEvent(artifacts: MissionArtifactContext, event: Record<string, unknown>): Promise<void> {
  await assertWritableArtifact(artifacts.missionDir, artifacts.eventsPath);
  await appendFile(artifacts.eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: CodexRunPlan,
  startedAt: string,
  finishedAt: string,
  exitCode: number,
  sessionStatus: "succeeded" | "failed",
): Promise<void> {
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "codex",
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
    runtime: "codex",
    mission_id: plan.mission.id,
    exit_code: exitCode,
    status: sessionStatus,
  });
}

function buildMissionPrompt(
  mission: MissionDocument,
  workflow: WorkflowDocument | undefined,
): string {
  let prompt = `# Mission: ${mission.name}\n\n`;
  prompt += `${mission.description}\n\n`;

  if (workflow) {
    prompt += `## Workflow: ${workflow.name}\n\n`;
    for (const phase of workflow.phases) {
      prompt += `### ${phase.name} (${phase.agent_role})\n${phase.description}\n\n`;
    }
  }

  if (mission.issues.length > 0) {
    prompt += "## Related Issues\n";
    for (const issue of mission.issues) {
      prompt += `- [${issue.source}] ${issue.reference}`;
      if (issue.url) prompt += ` (${issue.url})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (mission.read_first.length > 0) {
    prompt += "## Read First\n";
    for (const p of mission.read_first) {
      prompt += `- ${p}\n`;
    }
    prompt += "\n";
  }

  if (mission.expected_artifacts.length > 0) {
    prompt += "## Expected Artifacts\n";
    for (const a of mission.expected_artifacts) {
      prompt += `- ${a.path}`;
      if (a.type) prompt += ` (${a.type})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (mission.verification.checks.length > 0) {
    prompt += "## Verification Checks\n";
    for (const c of mission.verification.checks) {
      prompt += `- ${c}\n`;
    }
    prompt += "\n";
  }

  prompt += "Execute this mission and produce the expected artifacts.\n";
  prompt += runtimeFinalMessageInstruction();

  return prompt;
}
