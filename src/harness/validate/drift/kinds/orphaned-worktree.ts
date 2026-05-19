import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import type { DriftIssue, DriftKindModule, RepairResult } from "../types.js";

const execFileP = promisify(execFile);

/**
 * UH-77 orphaned-worktree drift: `git worktree list` references a path that
 * has been deleted from disk. Repair runs `git worktree prune` to clear the
 * stale entry.
 */
export const orphanedWorktreeKind: DriftKindModule = {
  kind: "orphaned-worktree",
  canRepair: true,

  async detect(root: string): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    let stdout: string;
    try {
      const r = await execFileP("git", ["worktree", "list", "--porcelain"], { cwd: root });
      stdout = r.stdout;
    } catch {
      return issues;
    }
    for (const block of stdout.split(/\n{2,}/)) {
      const m = block.match(/^worktree (.+)$/m);
      if (!m) continue;
      const wtPath = m[1].trim();
      try {
        await access(wtPath);
      } catch {
        issues.push({
          kind: "orphaned-worktree",
          severity: "error",
          message: `Git worktree references a deleted path: ${wtPath}`,
          target: wtPath,
        });
      }
    }
    return issues;
  },

  async repair(_issue: DriftIssue, root: string): Promise<RepairResult> {
    try {
      await execFileP("git", ["worktree", "prune"], { cwd: root });
      return { issue: _issue, outcome: "repaired" };
    } catch (err) {
      return { issue: _issue, outcome: "failed", reason: (err as Error).message };
    }
  },
};
