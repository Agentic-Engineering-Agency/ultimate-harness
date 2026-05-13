import { access, readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parse } from "yaml";
import { ZodError } from "zod";
import { validateProject } from "../schema/project.js";
import { validateAdapter } from "../schema/adapter.js";
import { validateWorkflow } from "../schema/workflow.js";
import { validateMission } from "../schema/mission.js";
import {
  validatePromotion,
  validateRuntimeSession,
  validateSandboxesIndex,
  validateSkillsIndex,
  validateVerificationResult,
} from "../schema/artifacts.js";

const SCHEMA_DISPATCH: Record<string, (data: unknown) => unknown> = {
  "uh.project.v0": validateProject,
  "uh.adapter.v0": validateAdapter,
  "uh.workflow.v0": validateWorkflow,
  "uh.mission.v0": validateMission,
  "uh.skills-index.v0": validateSkillsIndex,
  "uh.sandboxes-index.v0": validateSandboxesIndex,
  "uh.verification-result.v0": validateVerificationResult,
  "uh.promotion.v0": validatePromotion,
  "uh.runtime-session.v0": validateRuntimeSession,
};

export type ValidationResult = {
  valid: boolean;
  path: string;
  schema_version: string | null;
  errors: string[];
};

export async function validateFile(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: false,
    path: filePath,
    schema_version: null,
    errors: [],
  };

  let content: string;
  try {
    await access(filePath);
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (err) {
    result.errors.push(`YAML parse error: ${(err as Error).message}`);
    return result;
  }

  if (!(parsed && typeof parsed === "object" && "schema_version" in parsed)) {
    result.errors.push("Missing required field: schema_version");
    return result;
  }

  const schemaVersion = (parsed as Record<string, unknown>).schema_version;
  if (typeof schemaVersion !== "string") {
    result.errors.push("schema_version must be a string");
    return result;
  }

  result.schema_version = schemaVersion;

  const validator = SCHEMA_DISPATCH[schemaVersion];
  if (!validator) {
    result.errors.push(`Unknown schema version: ${schemaVersion}`);
    return result;
  }

  try {
    validator(parsed);
    result.valid = true;
  } catch (err) {
    if (err instanceof ZodError) {
      result.errors.push(...err.issues.map((e: { message: string }) => e.message));
    } else {
      result.errors.push(`Validation error: ${(err as Error).message}`);
    }
  }

  return result;
}

export async function validateRootProject(root: string): Promise<ValidationResult> {
  const { projectYaml } = await import("./paths.js");
  return validateFile(projectYaml(root));
}

export async function validateAllWorkflows(root: string): Promise<ValidationResult[]> {
  const { readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const { workflowsDir } = await import("./paths.js");
  const results: ValidationResult[] = [];
  let files: string[];
  try {
    files = await readdir(workflowsDir(root));
  } catch {
    return results;
  }
  for (const f of files) {
    if (f.endsWith(".yaml") || f.endsWith(".yml")) {
      results.push(await validateFile(path.join(workflowsDir(root), f)));
    }
  }
  return results;
}

export async function validateAllMissions(root: string): Promise<ValidationResult[]> {
  const { readdir, access } = await import("node:fs/promises");
  const path = await import("node:path");
  const { missionsDir } = await import("./paths.js");
  const results: ValidationResult[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(missionsDir(root), { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const missionPath = path.join(missionsDir(root), entry.name, "mission.yaml");
    try {
      await access(missionPath);
    } catch {
      continue;
    }
    results.push(await validateFile(missionPath));
  }
  return results;
}
