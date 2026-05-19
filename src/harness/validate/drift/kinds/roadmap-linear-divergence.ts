import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { missionsDir } from "../../../paths.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

const UH_REF = /\bUH-\d+\b/g;

/**
 * UH-77 roadmap-linear-divergence: scans `docs/ROADMAP.md` and every
 * mission's `issue_refs` for UH-N references. When a UH-N appears in
 * `issue_refs` but not in ROADMAP, or vice-versa, we emit a *warning*
 * (no network call to Linear — strictly filesystem). This is purely a
 * paper-trail check; auto-repair is `needs-human`.
 */
export const roadmapLinearDivergenceKind: DriftKindModule = {
  kind: "roadmap-linear-divergence",
  canRepair: false,

  async detect(root: string): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const roadmapPath = path.join(root, "docs", "ROADMAP.md");
    let roadmapRefs = new Set<string>();
    try {
      const raw = await readFile(roadmapPath, "utf-8");
      roadmapRefs = new Set(raw.match(UH_REF) ?? []);
    } catch {
      // No roadmap on disk → divergence detection is moot.
      return issues;
    }

    const missionRefs = new Map<string, string>(); // ref -> missionId

    let dirents: string[];
    try {
      dirents = await readdir(missionsDir(root));
    } catch {
      dirents = [];
    }
    for (const id of dirents) {
      const missionFile = path.join(missionsDir(root), id, "mission.yaml");
      let yaml: unknown;
      try {
        yaml = parse(await readFile(missionFile, "utf-8"));
      } catch {
        continue;
      }
      const refs = collectMissionRefs(yaml);
      for (const ref of refs) {
        if (!missionRefs.has(ref)) missionRefs.set(ref, id);
      }
    }

    for (const [ref, missionId] of missionRefs) {
      if (!roadmapRefs.has(ref)) {
        issues.push({
          kind: "roadmap-linear-divergence",
          severity: "warn",
          message: `Mission ${missionId} references ${ref} which is not in docs/ROADMAP.md`,
          target: roadmapPath,
          metadata: { ref, missionId },
        });
      }
    }
    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    return {
      issue,
      outcome: "needs-human",
      reason: "Roadmap divergence is a documentation concern; resolve manually.",
    };
  },
};

function collectMissionRefs(mission: unknown): Set<string> {
  const out = new Set<string>();
  if (!mission || typeof mission !== "object") return out;
  const m = mission as Record<string, unknown>;
  const issueRefs = Array.isArray(m.issue_refs) ? m.issue_refs : [];
  for (const r of issueRefs) {
    if (!r || typeof r !== "object") continue;
    const ref = r as Record<string, unknown>;
    if (typeof ref.id === "string") {
      for (const match of ref.id.match(UH_REF) ?? []) out.add(match);
    }
    if (typeof ref.url === "string") {
      for (const match of ref.url.match(UH_REF) ?? []) out.add(match);
    }
  }
  return out;
}
