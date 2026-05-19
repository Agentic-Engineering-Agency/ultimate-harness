import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "../../../paths.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

/**
 * UH-77 stale-worker drift: a `.harness/missions/<id>/team/workers/<role>/lock`
 * file whose PID is no longer alive. The lock blocks fresh worker spawns even
 * though nobody is holding it, so the safe repair is to delete the file.
 */
export const staleWorkerKind: DriftKindModule = {
  kind: "stale-worker",
  canRepair: true,

  async detect(root: string): Promise<DriftIssue[]> {
    const out: DriftIssue[] = [];
    const missions = missionsDir(root);
    let missionDirs: string[];
    try {
      missionDirs = await readdir(missions);
    } catch {
      return out;
    }
    for (const missionId of missionDirs) {
      const workersDir = path.join(missions, missionId, "team", "workers");
      let workerEntries: string[];
      try {
        workerEntries = await readdir(workersDir);
      } catch {
        continue;
      }
      for (const role of workerEntries) {
        const lockPath = path.join(workersDir, role, "lock");
        let raw: string;
        try {
          raw = (await readFile(lockPath, "utf-8")).trim();
        } catch {
          continue;
        }
        const pid = Number.parseInt(raw, 10);
        if (!Number.isFinite(pid) || pid <= 0 || isProcessAlive(pid)) {
          continue;
        }
        out.push({
          kind: "stale-worker",
          severity: "error",
          message: `Stale worker lock for ${missionId}/${role} (pid ${pid} not alive)`,
          target: lockPath,
          metadata: { missionId, role, pid: String(pid) },
        });
      }
    }
    return out;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    try {
      await unlink(issue.target);
      return { issue, outcome: "repaired" };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        // Idempotent: already gone.
        return { issue, outcome: "repaired" };
      }
      return { issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM means "process exists but we can't signal it" → still alive.
    return code === "EPERM";
  }
}
