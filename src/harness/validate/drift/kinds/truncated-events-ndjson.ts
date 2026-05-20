import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "../../../paths.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

/**
 * UH-77 truncated-events-ndjson: the last non-empty line of an
 * `events.ndjson` does not parse as JSON. UH-82 widened this to scan
 * every per-run `events.ndjson` under `runs/<run_id>/` in addition to
 * any legacy mission-level `events.ndjson` left over from pre-UH-82
 * runs.
 */
export const truncatedEventsNdjsonKind: DriftKindModule = {
  kind: "truncated-events-ndjson",
  canRepair: true,

  async detect(root: string): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    let dirents: string[];
    try {
      dirents = await readdir(missionsDir(root));
    } catch {
      return issues;
    }
    for (const id of dirents) {
      const missionDir = path.join(missionsDir(root), id);
      // Legacy mission-level events.ndjson (pre-UH-82).
      await scanFile(path.join(missionDir, "events.ndjson"), id, issues);
      // UH-82 per-run subdirectories.
      const runsDir = path.join(missionDir, "runs");
      let runEntries: string[];
      try {
        runEntries = await readdir(runsDir);
      } catch {
        continue;
      }
      for (const runId of runEntries) {
        await scanFile(path.join(runsDir, runId, "events.ndjson"), id, issues, runId);
      }
    }
    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    try {
      const raw = await readFile(issue.target, "utf-8");
      const lines = raw.split("\n");
      let last = lines.length - 1;
      while (last >= 0 && lines[last].length === 0) last -= 1;
      if (last < 0) {
        return { issue, outcome: "skipped", reason: "events.ndjson is empty" };
      }
      const kept = lines.slice(0, last);
      await writeFile(issue.target, kept.length === 0 ? "" : kept.join("\n") + "\n", "utf-8");
      return { issue, outcome: "repaired" };
    } catch (err) {
      return { issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};

async function scanFile(filePath: string, missionId: string, issues: DriftIssue[], runId?: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return;
  }
  const lines = raw.split("\n");
  let last = lines.length - 1;
  while (last >= 0 && lines[last].length === 0) last -= 1;
  if (last < 0) return;
  try {
    JSON.parse(lines[last]);
  } catch {
    issues.push({
      kind: "truncated-events-ndjson",
      severity: "error",
      message: runId
        ? `Mission ${missionId} run ${runId} events.ndjson trailing line is not valid JSON`
        : `Mission ${missionId} events.ndjson trailing line is not valid JSON`,
      target: filePath,
      metadata: { missionId, ...(runId ? { runId } : {}) },
    });
  }
}
