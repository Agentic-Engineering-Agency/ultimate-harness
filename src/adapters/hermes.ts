import { z } from "zod";
import { spawn } from "node:child_process";
import { readFile, appendFile, lstat, writeFile } from "node:fs/promises";
import { parse, stringify } from "yaml";
import path from "node:path";
import { AdapterDocument, AdapterConfigSchema } from "../schema/adapter.js";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { auditLog, workflowsDir } from "../harness/paths.js";
import { RuntimeSessionDocument } from "../schema/artifacts.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
  type AdapterRuntimeChecker,
} from "../harness/registry.js";

type MissionArtifactContext = {
  missionDir: string;
  promptPath: string;
  runtimeSessionPath: string;
  eventsPath: string;
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

type HermesRunPlan = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
  mission: MissionDocument;
};

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

  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const execFileP = promisify(execFile);

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

async function planHermesRun(root: string, missionPath: string): Promise<HermesRunPlan> {
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
  const path = await import("node:path");
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

export async function runHermes(root: string, missionPath: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
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

  return new Promise((resolve) => {
    const child = spawn(plan.command, plan.args, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let completed = false;
    let finalizePromise: Promise<void> | null = null;

    async function finalize(exitCode: number): Promise<void> {
      if (!finalizePromise) {
        finalizePromise = artifacts
          ? persistFinalRuntimeSession(artifacts, plan, startedAt, exitCode)
          : Promise.resolve();
      }
      await finalizePromise;
    }

    async function complete(exitCode: number, extraStderr = ""): Promise<void> {
      if (completed) return;
      completed = true;
      let resolvedExitCode = exitCode;
      let resolvedStderr = extraStderr ? `${stderr}${extraStderr}` : stderr;
      try {
        await finalize(exitCode);
      } catch (err) {
        resolvedExitCode = 1;
        const message = (err as Error).message;
        const separator = resolvedStderr && !resolvedStderr.endsWith("\n") ? "\n" : "";
        resolvedStderr = `${resolvedStderr}${separator}Artifact persistence failure: ${message}`;
      }
      resolve({ exitCode: resolvedExitCode, stdout, stderr: resolvedStderr });
    }

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code: number | null) => {
      void complete(code ?? 1);
    });

    child.on("error", (err: Error) => {
      void complete(1, `Spawn error: ${err.message}`);
    });
  });
}

async function getMissionArtifactContext(root: string, missionPath: string): Promise<MissionArtifactContext | null> {
  const path = await import("node:path");
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

  const context = {
    missionDir,
    promptPath: path.join(missionDir, "prompt.md"),
    runtimeSessionPath: path.join(missionDir, "runtime-session.yaml"),
    eventsPath: path.join(missionDir, "events.ndjson"),
  };

  for (const artifactPath of [context.promptPath, context.runtimeSessionPath, context.eventsPath]) {
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

async function persistPromptAndSession(
  artifacts: MissionArtifactContext,
  prompt: string,
  session: RuntimeSessionDocument,
): Promise<void> {
  await assertWritableArtifact(artifacts.missionDir, artifacts.promptPath);
  await assertWritableArtifact(artifacts.missionDir, artifacts.runtimeSessionPath);
  await writeFile(artifacts.promptPath, prompt, "utf-8");
  await writeFile(artifacts.runtimeSessionPath, stringify(session), "utf-8");
}

async function appendMissionEvent(artifacts: MissionArtifactContext, event: Record<string, unknown>): Promise<void> {
  await assertWritableArtifact(artifacts.missionDir, artifacts.eventsPath);
  await appendFile(artifacts.eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}

async function persistFinalRuntimeSession(
  artifacts: MissionArtifactContext,
  plan: HermesRunPlan,
  startedAt: string,
  exitCode: number,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const status = exitCode === 0 ? "succeeded" : "failed";
  await persistPromptAndSession(artifacts, plan.prompt, {
    schema_version: "uh.runtime-session.v0",
    mission_id: plan.mission.id,
    runtime: "hermes",
    status,
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
    status,
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

  prompt += "Execute this mission and produce the expected artifacts.";

  return prompt;
}
