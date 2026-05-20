import path from "node:path";

export function resolveRoot(root?: string): string {
  return root ? path.resolve(root) : process.cwd();
}

export function harnessDir(root: string): string {
  return path.join(root, ".harness");
}

export function projectYaml(root: string): string {
  return path.join(harnessDir(root), "project.yaml");
}

export function adaptersDir(root: string): string {
  return path.join(harnessDir(root), "adapters");
}

export function workflowsDir(root: string): string {
  return path.join(harnessDir(root), "workflows");
}

export function skillsDir(root: string): string {
  return path.join(harnessDir(root), "skills");
}

export function specsActiveDir(root: string): string {
  return path.join(harnessDir(root), "specs", "active");
}

export function specsArchiveDir(root: string): string {
  return path.join(harnessDir(root), "specs", "archive");
}

export function missionsDir(root: string): string {
  return path.join(harnessDir(root), "missions");
}

export function missionDir(root: string, missionId: string): string {
  return path.join(missionsDir(root), missionId);
}

export function missionRunsDir(root: string, missionId: string): string {
  return path.join(missionDir(root, missionId), "runs");
}

export function missionRunDir(root: string, missionId: string, runId: string): string {
  return path.join(missionRunsDir(root, missionId), runId);
}

export function missionLatestPointer(root: string, missionId: string): string {
  return path.join(missionDir(root, missionId), "latest.json");
}

export function missionRunsIndex(root: string, missionId: string): string {
  return path.join(missionRunsDir(root, missionId), "index.json");
}

export function sandboxesDir(root: string): string {
  return path.join(harnessDir(root), "sandboxes");
}

export function auditDir(root: string): string {
  return path.join(harnessDir(root), "audit");
}

export function auditLog(root: string): string {
  return path.join(auditDir(root), "events.ndjson");
}

export function skillsIndex(root: string): string {
  return path.join(skillsDir(root), "index.yaml");
}

export function sandboxesIndex(root: string): string {
  return path.join(sandboxesDir(root), "index.yaml");
}
