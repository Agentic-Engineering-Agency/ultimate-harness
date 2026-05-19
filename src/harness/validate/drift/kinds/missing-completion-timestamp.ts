import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { missionsDir } from "../../../paths.js";
import { RuntimeResultSchema } from "../../../../schema/artifacts.js";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

/**
 * UH-77 missing-completion-timestamp: a `runtime-result.yaml` says the run is
 * passed/failed but `finished_at` is unset (null / empty). The repair writes
 * the mission directory's mtime as a best-effort finish time — better than a
 * permanently empty audit field.
 */
export const missingCompletionTimestampKind: DriftKindModule = {
  kind: "missing-completion-timestamp",
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
      const filePath = path.join(missionsDir(root), id, "runtime-result.yaml");
      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      let parsed: Record<string, unknown>;
      try {
        const value = parse(raw);
        if (!value || typeof value !== "object") continue;
        parsed = value as Record<string, unknown>;
      } catch {
        continue;
      }
      const status = parsed.status;
      if (status !== "passed" && status !== "failed") continue;
      const finished = parsed.finished_at;
      if (typeof finished === "string" && finished.length > 0) continue;
      issues.push({
        kind: "missing-completion-timestamp",
        severity: "error",
        message: `Mission ${id} runtime-result is ${status} but has no finished_at`,
        target: filePath,
        metadata: { missionId: id },
      });
    }
    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    try {
      const raw = await readFile(issue.target, "utf-8");
      const parsed = parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { issue, outcome: "failed", reason: "runtime-result.yaml not an object" };
      }
      const obj = parsed as Record<string, unknown>;
      const stamp = new Date().toISOString();
      obj.finished_at = stamp;
      if (typeof obj.started_at !== "string" || obj.started_at.length === 0) {
        obj.started_at = stamp;
      }
      const validated = RuntimeResultSchema.parse(obj);
      await writeFile(issue.target, stringify(validated), "utf-8");
      return { issue, outcome: "repaired" };
    } catch (err) {
      return { issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};
