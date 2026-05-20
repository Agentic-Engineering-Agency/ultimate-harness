import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "../../../paths.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

const PROMPT_NAMES = ["prompt.txt", "prompt.md"];

/**
 * UH-77 stale-render: `prompt.{txt,md}` exists but `runtime-session.yaml` is
 * older than `mission.yaml`. That means someone edited the mission after the
 * last rendered prompt was captured; the next run would re-render and might
 * disagree with what the artifacts show. Warning-only — repair is left to the
 * operator (re-run / re-render) so we don't silently overwrite hand-edited
 * artifacts.
 */
export const staleRenderKind: DriftKindModule = {
  kind: "stale-render",
  canRepair: false,

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
      let promptStat: { mtimeMs: number } | null = null;
      for (const name of PROMPT_NAMES) {
        try {
          promptStat = await stat(path.join(missionDir, name));
          break;
        } catch {
          // try the next candidate
        }
      }
      if (!promptStat) continue;
      let missionStat: { mtimeMs: number };
      let sessionStat: { mtimeMs: number };
      try {
        missionStat = await stat(path.join(missionDir, "mission.yaml"));
        sessionStat = await stat(path.join(missionDir, "runtime-session.yaml"));
      } catch {
        continue;
      }
      if (sessionStat.mtimeMs < missionStat.mtimeMs) {
        issues.push({
          kind: "stale-render",
          severity: "warn",
          message: `Mission ${id} runtime-session.yaml is older than mission.yaml; rendered prompt may be stale`,
          target: missionDir,
          metadata: { missionId: id },
        });
      }
    }
    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    return {
      issue,
      outcome: "needs-human",
      reason: "Re-run the mission to regenerate prompt.* and runtime-session.yaml.",
    };
  },
};
