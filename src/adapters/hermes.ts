import { z } from "zod";
import { spawn } from "node:child_process";
import { readFile, appendFile, access } from "node:fs/promises";
import { parse } from "yaml";
import { validateAdapter, AdapterDocument, AdapterConfigSchema } from "../schema/adapter.js";
import { MissionDocument } from "../schema/mission.js";
import { validateMission } from "../schema/mission.js";
import { validateWorkflow, WorkflowDocument } from "../schema/workflow.js";
import { adaptersDir, auditLog, workflowsDir } from "../harness/paths.js";

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
  const path = await import("node:path");
  const adapterPath = path.join(adaptersDir(root), `${runtimeId}.yaml`);
  try {
    await access(adapterPath);
  } catch {
    throw new Error(`Adapter manifest not found: ${adapterPath}`);
  }
  const content = await readFile(adapterPath, "utf-8");
  const parsed = parse(content);
  return validateAdapter(parsed);
}

export async function checkHermes(root?: string): Promise<CheckResult> {
  const result: CheckResult = {
    runtime: "hermes",
    found: false,
    version: "",
    errors: [],
  };

  const { promisify } = await import("node:util");
  const { execFile } = await import("node:child_process");
  const execFileP = promisify(execFile);

  let command = "hermes";
  if (root) {
    try {
      const adapter = await loadAdapterConfig(root, "hermes");
      command = adapter.config?.cli_command || command;
    } catch (e) {
      result.errors.push((e as Error).message);
      return result;
    }
  }

  let versionOutput: string;
  try {
    const { stdout } = await execFileP(command, ["--version"]);
    versionOutput = stdout.trim();
  } catch {
    result.errors.push(
      "hermes CLI not found in PATH. Install: curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash"
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

export async function dryRunHermes(root: string, missionPath: string): Promise<DryRunResult> {
  try {
    const plan = await planHermesRun(root, missionPath);
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

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code: number | null) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err: Error) => {
      resolve({ exitCode: 1, stdout, stderr: `Spawn error: ${err.message}` });
    });
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
