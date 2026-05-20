import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "../../../paths.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

/**
 * UH-77 truncated-events-ndjson: the last non-empty line of
 * `events.ndjson` does not parse as JSON. We assume a crash mid-write and
 * truncate the partial line so a future replay does not error on the first
 * record.
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
      const filePath = path.join(missionsDir(root), id, "events.ndjson");
      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      const lines = raw.split("\n");
      // Find the last non-empty line.
      let last = lines.length - 1;
      while (last >= 0 && lines[last].length === 0) last -= 1;
      if (last < 0) continue;
      try {
        JSON.parse(lines[last]);
        continue;
      } catch {
        issues.push({
          kind: "truncated-events-ndjson",
          severity: "error",
          message: `Mission ${id} events.ndjson trailing line is not valid JSON`,
          target: filePath,
          metadata: { missionId: id },
        });
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
      // Truncate the bad line and keep a trailing newline.
      const kept = lines.slice(0, last);
      await writeFile(issue.target, kept.length === 0 ? "" : kept.join("\n") + "\n", "utf-8");
      return { issue, outcome: "repaired" };
    } catch (err) {
      return { issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};
