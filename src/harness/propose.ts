import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { validateMission } from "../schema/mission.js";
import { validateFile } from "./validate.js";
import { harnessDir, missionsDir } from "./paths.js";
import {
  assertSafeMissionId,
  fileExists,
  isPathWithin,
  rejectSymlinkIfExists,
  requireInitializedProject,
  requireWorkflowProfile,
} from "./mission.js";

export type ProposeIssueRef = {
  provider: string;
  id: string;
  url?: string;
};

export type ProposeRequiredCheck = {
  name: string;
  command?: string;
};

export type ProposeMissionOptions = {
  id: string;
  title: string;
  workflow: string;
  objective: string;
  priority?: string;
  issueRefs?: ProposeIssueRef[];
  readFirst?: string[];
  sourceLinks?: string[];
  repoRoot?: string;
  constraints?: string[];
  requiredSkills?: string[];
  suggestedSkills?: string[];
  expectedOutputs?: string[];
  completionCriteria?: string[];
  sandboxBackend?: string;
  promotionPolicy?: string;
  requiredChecks?: ProposeRequiredCheck[];
  reviewGates?: string[];
  outputPath?: string;
  force?: boolean;
};

export type ProposeMissionResult = {
  path: string;
  created: boolean;
  mission: Record<string, unknown>;
};

const DEFAULT_PRIORITY = "medium";
const DEFAULT_SANDBOX_BACKEND = "git-worktree";
const DEFAULT_PROMOTION_POLICY = "human-approved";
const DEFAULT_REVIEW_GATES = ["spec-compliance", "implementation-quality"];

export async function proposeMission(
  root: string,
  opts: ProposeMissionOptions,
): Promise<ProposeMissionResult> {
  assertSafeMissionId(opts.id);
  if (opts.title.length === 0) {
    throw new Error("Mission title must not be empty.");
  }
  await rejectSymlinkIfExists(path.resolve(harnessDir(root)), "Harness directory");
  await requireInitializedProject(root);
  await requireWorkflowProfile(root, opts.workflow);

  const missionPath = resolveMissionPath(root, opts);
  if (opts.outputPath === undefined) {
    await rejectSymlinkIfExists(path.resolve(missionsDir(root)), "Missions directory");
  }
  await rejectSymlinkIfExists(path.dirname(missionPath), "Mission directory");
  await rejectSymlinkIfExists(missionPath, "Mission file");
  const exists = await fileExists(missionPath);
  if (exists && !opts.force) {
    throw new Error(`Mission already exists: ${missionPath}. Use --force to overwrite.`);
  }

  const mission = buildMissionDocument(opts);

  // Validate the in-memory mission packet before writing anything to disk so
  // we never persist an invalid artifact.
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
    mission,
  };
}

function resolveMissionPath(root: string, opts: ProposeMissionOptions): string {
  const harnessRoot = path.resolve(harnessDir(root));
  if (opts.outputPath !== undefined) {
    const explicit = path.isAbsolute(opts.outputPath)
      ? path.resolve(opts.outputPath)
      : path.resolve(root, opts.outputPath);
    const projectRoot = path.resolve(root);
    if (!isPathWithin(explicit, projectRoot)) {
      throw new Error(`Unsafe output path outside project root: ${opts.outputPath}`);
    }
    return explicit;
  }
  const missionRoot = path.resolve(missionsDir(root));
  if (!isPathWithin(missionRoot, harnessRoot)) {
    throw new Error("Unsafe missions directory");
  }
  const missionPath = path.resolve(missionRoot, opts.id, "mission.yaml");
  if (!isPathWithin(missionPath, missionRoot)) {
    throw new Error(`Unsafe mission path for id: ${opts.id}`);
  }
  return missionPath;
}

function buildMissionDocument(opts: ProposeMissionOptions): Record<string, unknown> {
  const context: Record<string, unknown> = {
    read_first: opts.readFirst ?? [],
    source_links: opts.sourceLinks ?? [],
  };
  if (opts.repoRoot !== undefined && opts.repoRoot.length > 0) {
    context.repo_root = opts.repoRoot;
  }

  const reviewGates = opts.reviewGates && opts.reviewGates.length > 0
    ? opts.reviewGates
    : DEFAULT_REVIEW_GATES;

  return {
    schema_version: "uh.mission.v0",
    id: opts.id,
    title: opts.title,
    workflow_profile: opts.workflow,
    priority: opts.priority ?? DEFAULT_PRIORITY,
    objective: opts.objective,
    issue_refs: (opts.issueRefs ?? []).map(serializeIssueRef),
    context,
    constraints: opts.constraints ?? [],
    skills: {
      required: opts.requiredSkills ?? [],
      suggested: opts.suggestedSkills ?? [],
    },
    expected_outputs: {
      files: opts.expectedOutputs ?? [],
    },
    sandbox: {
      backend: opts.sandboxBackend ?? DEFAULT_SANDBOX_BACKEND,
      promotion_policy: opts.promotionPolicy ?? DEFAULT_PROMOTION_POLICY,
    },
    verification: {
      required_checks: (opts.requiredChecks ?? []).map(serializeRequiredCheck),
      review_gates: reviewGates,
    },
    completion_criteria: opts.completionCriteria ?? [],
  };
}

function serializeIssueRef(ref: ProposeIssueRef): Record<string, string> {
  const out: Record<string, string> = {
    provider: ref.provider,
    id: ref.id,
  };
  if (ref.url !== undefined && ref.url.length > 0) {
    out.url = ref.url;
  }
  return out;
}

function serializeRequiredCheck(check: ProposeRequiredCheck): Record<string, string> {
  const out: Record<string, string> = { name: check.name };
  if (check.command !== undefined && check.command.length > 0) {
    out.command = check.command;
  }
  return out;
}

/**
 * Parse a `provider:id[:url]` issue reference spec.
 *
 * The first colon separates provider from the remainder. If the remainder
 * contains another colon, the first one separates the id from the url, which
 * may itself contain colons (e.g. an https:// URL).
 */
export function parseIssueRef(spec: string): ProposeIssueRef {
  if (typeof spec !== "string" || spec.length === 0) {
    throw new Error("Issue ref must be a non-empty string");
  }
  const firstColon = spec.indexOf(":");
  if (firstColon === -1) {
    throw new Error(`Invalid issue ref (expected provider:id[:url]): ${spec}`);
  }
  const provider = spec.slice(0, firstColon).trim();
  const rest = spec.slice(firstColon + 1);
  if (provider.length === 0) {
    throw new Error(`Invalid issue ref (empty provider): ${spec}`);
  }
  const secondColon = rest.indexOf(":");
  if (secondColon === -1) {
    const id = rest.trim();
    if (id.length === 0) {
      throw new Error(`Invalid issue ref (empty id): ${spec}`);
    }
    return { provider, id };
  }
  const id = rest.slice(0, secondColon).trim();
  const url = rest.slice(secondColon + 1).trim();
  if (id.length === 0) {
    throw new Error(`Invalid issue ref (empty id): ${spec}`);
  }
  if (url.length === 0) {
    return { provider, id };
  }
  return { provider, id, url };
}

/**
 * Parse a `name[=command]` required check spec. The command portion may
 * contain `=` characters; only the first one is treated as the separator.
 */
export function parseRequiredCheck(spec: string): ProposeRequiredCheck {
  if (typeof spec !== "string" || spec.length === 0) {
    throw new Error("Required check must be a non-empty string");
  }
  const firstEq = spec.indexOf("=");
  if (firstEq === -1) {
    const name = spec.trim();
    if (name.length === 0) {
      throw new Error(`Invalid required check (empty name): ${spec}`);
    }
    return { name };
  }
  const name = spec.slice(0, firstEq).trim();
  const command = spec.slice(firstEq + 1);
  if (name.length === 0) {
    throw new Error(`Invalid required check (empty name): ${spec}`);
  }
  if (command.length === 0) {
    return { name };
  }
  return { name, command };
}
