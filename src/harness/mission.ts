import { access, lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { validateMission } from "../schema/mission.js";
import { validateFile } from "./validate.js";
import { harnessDir, missionsDir, projectYaml, workflowsDir } from "./paths.js";

export type CreateMissionOptions = {
  id: string;
  title: string;
  workflow: string;
  objective: string;
  force?: boolean;
};

export type CreateMissionResult = {
  path: string;
  created: boolean;
};

export async function createMission(root: string, opts: CreateMissionOptions): Promise<CreateMissionResult> {
  assertSafeMissionId(opts.id);
  await rejectSymlinkIfExists(path.resolve(harnessDir(root)), "Harness directory");
  await requireInitializedProject(root);
  await requireWorkflowProfile(root, opts.workflow);

  const missionRoot = path.resolve(missionsDir(root));
  const missionPath = path.resolve(missionRoot, opts.id, "mission.yaml");
  if (!isPathWithin(missionPath, missionRoot)) {
    throw new Error(`Unsafe mission path for id: ${opts.id}`);
  }
  await rejectSymlinkIfExists(missionRoot, "Missions directory");
  await rejectSymlinkIfExists(path.dirname(missionPath), "Mission directory");
  await rejectSymlinkIfExists(missionPath, "Mission file");
  const exists = await fileExists(missionPath);
  if (exists && !opts.force) {
    throw new Error(`Mission already exists: ${missionPath}. Use --force to overwrite.`);
  }

  const mission = {
    schema_version: "uh.mission.v0",
    id: opts.id,
    title: opts.title,
    workflow_profile: opts.workflow,
    priority: "medium",
    objective: opts.objective,
    issue_refs: [],
    context: {
      read_first: [],
      source_links: [],
    },
    constraints: [],
    skills: {
      required: [],
      suggested: [],
    },
    expected_outputs: {
      files: [],
    },
    sandbox: {
      backend: "git-worktree",
      promotion_policy: "human-approved",
    },
    verification: {
      required_checks: [],
      review_gates: ["spec-compliance", "implementation-quality"],
    },
    completion_criteria: [],
  };

  validateMission(mission);

  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify(mission), "utf-8");

  const validation = await validateFile(missionPath);
  if (!validation.valid) {
    throw new Error(`Generated mission failed validation: ${validation.errors.join("; ")}`);
  }

  return {
    path: missionPath,
    created: !exists,
  };
}

function assertSafeMissionId(id: string): void {
  if (id === "." || id === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`Invalid mission id: ${id}. Use letters, numbers, dots, underscores, and hyphens; do not use path separators.`);
  }
}

async function requireInitializedProject(root: string): Promise<void> {
  const projectPath = projectYaml(root);
  if (!(await fileExists(projectPath))) {
    throw new Error(`Harness project is not initialized: missing ${projectPath}. Run 'uh init' first.`);
  }
  const validation = await validateFile(projectPath);
  if (validation.valid && validation.schema_version !== "uh.project.v0") {
    throw new Error(`Harness project has wrong schema_version: expected uh.project.v0, got ${validation.schema_version}`);
  }
  if (!validation.valid) {
    throw new Error(`Harness project is invalid: ${validation.errors.join("; ")}`);
  }
}

async function requireWorkflowProfile(root: string, workflow: string): Promise<void> {
  if (workflow === "." || workflow === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(workflow)) {
    throw new Error(`Invalid workflow profile: ${workflow}`);
  }

  const workflowRoot = path.resolve(workflowsDir(root));
  const workflowPath = path.resolve(workflowRoot, `${workflow}.yaml`);
  if (!isPathWithin(workflowPath, workflowRoot)) {
    throw new Error(`Unsafe workflow profile path: ${workflow}`);
  }
  if (!(await fileExists(workflowPath))) {
    throw new Error(`Workflow profile ${workflow} not found (${workflowPath})`);
  }
  const validation = await validateFile(workflowPath);
  if (validation.valid && validation.schema_version !== "uh.workflow.v0") {
    throw new Error(`Workflow profile ${workflow} has wrong schema_version: expected uh.workflow.v0, got ${validation.schema_version}`);
  }
  if (!validation.valid) {
    throw new Error(`Workflow profile ${workflow} is invalid: ${validation.errors.join("; ")}`);
  }
}

async function rejectSymlinkIfExists(filePath: string, label: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${filePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

function isPathWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
