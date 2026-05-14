import { access, appendFile, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { validatePromotion, validateVerificationResult, type PromotionDocument } from "../schema/artifacts.js";
import { harnessDir, missionsDir, projectYaml } from "./paths.js";
import { validateFile } from "./validate.js";

export type PromoteDecision = PromotionDocument["decision"];

export type PromoteMissionOptions = {
  approvedBy: string;
  decision?: PromoteDecision;
  changes?: string[];
  sandboxId?: string;
};

export type PromoteMissionResult = {
  mission_id: string;
  decision: PromoteDecision;
  path: string;
};

export async function promoteMission(root: string, missionId: string, options: PromoteMissionOptions): Promise<PromoteMissionResult> {
  assertSafeMissionId(missionId);
  const decision = options.decision ?? "promoted";
  assertDecision(decision);
  if (!options.approvedBy || options.approvedBy.trim().length === 0) {
    throw new Error("--approved-by is required");
  }

  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);

  const missionRoot = path.resolve(missionsDir(projectRoot));
  const missionDir = path.resolve(missionRoot, missionId);
  const missionPath = path.resolve(missionDir, "mission.yaml");
  const verificationPath = path.resolve(missionDir, "verification.yaml");
  const promotionPath = path.resolve(missionDir, "promotion.yaml");
  const eventsPath = path.resolve(missionDir, "events.ndjson");

  if (
    !isPathWithin(missionDir, missionRoot) ||
    !isPathWithin(missionPath, missionDir) ||
    !isPathWithin(verificationPath, missionDir) ||
    !isPathWithin(promotionPath, missionDir) ||
    !isPathWithin(eventsPath, missionDir)
  ) {
    throw new Error(`Unsafe mission path for id: ${missionId}`);
  }

  await rejectSymlinkIfExists(missionRoot, "Missions directory");
  await rejectSymlinkIfExists(missionDir, "Mission directory");
  await rejectSymlinkIfExists(missionPath, "Mission file");
  await rejectSymlinkIfExists(verificationPath, "Verification file");
  await rejectSymlinkIfExists(promotionPath, "Promotion file");
  await rejectSymlinkIfExists(eventsPath, "Mission events file");
  await assertExistingPathWithinIfExists(missionDir, missionRoot, "Mission directory");
  await assertExistingPathWithinIfExists(missionPath, missionDir, "Mission file");
  await assertExistingPathWithinIfExists(verificationPath, missionDir, "Verification file");
  await assertExistingPathWithinIfExists(promotionPath, missionDir, "Promotion file");
  await assertExistingPathWithinIfExists(eventsPath, missionDir, "Mission events file");

  const mission = await readMissionAtLocation(missionPath);
  if (mission.id !== missionId) {
    throw new Error(`Mission id mismatch: expected ${missionId}, got ${mission.id}`);
  }

  if (decision === "promoted") {
    await requirePassedVerification(verificationPath, missionId);
  }

  const now = new Date().toISOString();
  const auditEventId = `promotion-${now}-${Math.random().toString(36).slice(2, 10)}`;
  const artifact: PromotionDocument = validatePromotion({
    schema_version: "uh.promotion.v0",
    mission_id: missionId,
    ...(options.sandboxId ? { sandbox_id: options.sandboxId } : {}),
    decision,
    approved_by: options.approvedBy,
    ...(decision === "promoted" ? { promoted_at: now } : {}),
    ...(options.changes && options.changes.length > 0 ? { changes: options.changes } : {}),
    audit_event_id: auditEventId,
  });

  await rejectSymlinkIfExists(promotionPath, "Promotion file");
  await writeFile(promotionPath, stringify(artifact), "utf-8");
  const validation = await validateFile(promotionPath);
  if (!validation.valid || validation.schema_version !== "uh.promotion.v0") {
    throw new Error(`Generated promotion failed validation: ${validation.errors.join("; ")}`);
  }

  await rejectSymlinkIfExists(eventsPath, "Mission events file");
  await appendMissionEvent(eventsPath, {
    id: auditEventId,
    type: "promotion.recorded",
    mission_id: missionId,
    timestamp: now,
    decision,
    approved_by: options.approvedBy,
    ...(options.sandboxId ? { sandbox_id: options.sandboxId } : {}),
  });

  return {
    mission_id: missionId,
    decision,
    path: promotionPath,
  };
}

async function readMissionAtLocation(missionPath: string): Promise<MissionDocument> {
  const validation = await validateFile(missionPath);
  if (!validation.valid) {
    throw new Error(`Mission is invalid: ${validation.errors.join("; ")}`);
  }
  if (validation.schema_version !== "uh.mission.v0") {
    throw new Error(`Mission has wrong schema_version: expected uh.mission.v0, got ${validation.schema_version}`);
  }
  return validateMission(parse(await readFile(missionPath, "utf-8")));
}

async function requirePassedVerification(verificationPath: string, missionId: string): Promise<void> {
  if (!(await fileExists(verificationPath))) {
    throw new Error(`Promoted decision requires passed verification.yaml for mission ${missionId}`);
  }
  const validation = await validateFile(verificationPath);
  if (!validation.valid) {
    throw new Error(`Verification is invalid: ${validation.errors.join("; ")}`);
  }
  if (validation.schema_version !== "uh.verification-result.v0") {
    throw new Error(`Verification has wrong schema_version: expected uh.verification-result.v0, got ${validation.schema_version}`);
  }
  const verification = validateVerificationResult(parse(await readFile(verificationPath, "utf-8")));
  if (verification.mission_id !== missionId) {
    throw new Error(`Verification mission_id mismatch: expected ${missionId}, got ${verification.mission_id}`);
  }
  if (verification.status !== "passed") {
    throw new Error(`Promoted decision requires passed verification.yaml; current status is ${verification.status}`);
  }
}

async function requireInitializedProject(root: string): Promise<void> {
  const projectPath = projectYaml(root);
  if (!(await fileExists(projectPath))) {
    throw new Error(`Harness project is not initialized: missing ${projectPath}. Run 'uh init' first.`);
  }
  await rejectSymlinkIfExists(projectPath, "Project file");
  const validation = await validateFile(projectPath);
  if (!validation.valid) {
    throw new Error(`Harness project is invalid: ${validation.errors.join("; ")}`);
  }
  if (validation.schema_version !== "uh.project.v0") {
    throw new Error(`Harness project has wrong schema_version: expected uh.project.v0, got ${validation.schema_version}`);
  }
}

async function appendMissionEvent(eventsPath: string, event: Record<string, unknown>): Promise<void> {
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}

function assertSafeMissionId(id: string): void {
  if (path.isAbsolute(id) || id === "." || id === ".." || id.includes("/") || id.includes("\\") || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`Invalid mission id: ${id}. Use a safe mission slug without path separators.`);
  }
}

function assertDecision(decision: string): asserts decision is PromoteDecision {
  if (decision !== "promoted" && decision !== "rejected" && decision !== "deferred") {
    throw new Error(`Invalid promotion decision: ${decision}`);
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

async function assertExistingPathWithinIfExists(candidate: string, parent: string, label: string): Promise<void> {
  if (!(await fileExists(candidate))) {
    return;
  }
  const [candidateReal, parentReal] = await Promise.all([realpath(candidate), realpath(parent)]);
  if (!isPathWithin(candidateReal, parentReal)) {
    throw new Error(`${label} resolves outside expected directory: ${candidate}`);
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
