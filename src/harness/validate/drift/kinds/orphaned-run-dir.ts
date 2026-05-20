import { readdir, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "../../../paths.js";
import { RunsIndexSchema } from "../../../../schema/runs.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

/**
 * UH-82 follow-up: `.harness/missions/<id>/runs/<run_id>/` directories that
 * have no corresponding entry in `runs/index.json`. Happens when a run dir
 * is created (run started + per-run dir + first artifact write) but the
 * index entry write fails — or when the index is manually deleted but the
 * dirs remain. The orphan never appears in the dashboard's `runs[]` array
 * so it's wasted disk + invisible audit trail.
 *
 * Repair: best-effort `rm -rf` of the orphaned `runs/<run_id>/` directory.
 * Idempotent.
 */
export const orphanedRunDirKind: DriftKindModule = {
  kind: "orphaned-run-dir",
  canRepair: true,

  async detect(root: string): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    let missionIds: string[];
    try {
      missionIds = await readdir(missionsDir(root));
    } catch {
      return issues;
    }
    for (const missionId of missionIds) {
      const missionDir = path.join(missionsDir(root), missionId);
      const runsDir = path.join(missionDir, "runs");
      let runEntries: string[];
      try {
        runEntries = await readdir(runsDir);
      } catch {
        continue; // no runs/ dir = nothing to compare
      }
      const runDirs = runEntries.filter((e) => e !== "index.json");
      if (runDirs.length === 0) continue;

      // Read the index — if missing or malformed, EVERY run dir is orphaned
      // by definition. The dashboard can only enumerate runs via the index.
      const indexedRunIds = new Set<string>();
      const indexPath = path.join(runsDir, "index.json");
      try {
        const raw = await readFile(indexPath, "utf-8");
        const parsed = RunsIndexSchema.parse(JSON.parse(raw));
        for (const entry of parsed.runs) indexedRunIds.add(entry.run_id);
      } catch {
        // Empty set — every run dir on disk is orphaned.
      }

      for (const runId of runDirs) {
        if (indexedRunIds.has(runId)) continue;
        issues.push({
          kind: "orphaned-run-dir",
          severity: "warn",
          message: `Mission ${missionId} has run dir runs/${runId}/ with no index.json entry`,
          target: path.join(runsDir, runId),
          metadata: { missionId, runId },
        });
      }
    }
    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    try {
      await rm(issue.target, { recursive: true, force: true });
      return { issue, outcome: "repaired" };
    } catch (err) {
      return { issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};
