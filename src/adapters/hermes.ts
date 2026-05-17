import { z } from "zod";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, appendFile, lstat, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, AdapterConfigSchema, registerRuntimeConfigSchema } from "../schema/adapter.js";
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

export type HermesRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
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

export interface RunHermesOptions {
  runner?: HermesRunner;
  timeoutMs?: number;
  collectDiff?: DiffCollector;
}

export interface RunHermesResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: RuntimeResultDocument;
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
 * Hermes has no runtime-specific runtime_config keys today. Registering a
 * strict empty schema ensures that any future typo or accidental key in
 * `config.runtime_config:` for hermes manifests fails fast instead of being
 * silently dropped.
 */
export const HermesRuntimeConfigSchema = z.object({}).strict();
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
    const artifacts = await getMissionArtifactContext(root, missionPath);
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
export async function planHermesRun(root: string, missionPath: string): Promise<HermesRunPlan> {
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

  const prompt = buildMissionPrompt(mission, workflow);
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
    worktree: config.worktree_mode,
    session_id_passthrough: config.pass_session_id,
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
 * Default diff collector. Runs `git diff --no-color` against the working
 * tree from `cwd`. When git is unavailable or `cwd` is not a git checkout,
 * returns an empty patch and records the failure in `errors[]` so the
 * runtime-result still has a diff_path but the cause is visible.
 */
export const defaultDiffCollector: DiffCollector = async (cwd) => {
  try {
    const { stdout } = await execFileP("git", ["diff", "--no-color"], {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { patch: stdout };
  } catch (err) {
    return { patch: "", errors: [`Diff capture failed: ${(err as Error).message}`] };
  }
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
  const plan = await planHermesRun(root, missionPath);
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join("; "));
  }

  const artifacts = await getMissionArtifactContext(root, missionPath);
  const startedAt = new Date().toISOString();

  if (artifacts) {
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
    });
    await appendFile(logPath, `${auditEntry}\n`, "utf-8");
  } catch {
    // audit failure shouldn't block run
  }

  const runner = options.runner ?? defaultHermesRunner;
  const runnerResult = await runner({
    command: plan.command,
    args: plan.args,
    cwd: root,
    timeoutMs: options.timeoutMs,
  });

  const collectDiff = options.collectDiff ?? defaultDiffCollector;
  const diff = await collectDiff(root);
  const finishedAt = new Date().toISOString();

  const collection = await collectHermesSession({
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
