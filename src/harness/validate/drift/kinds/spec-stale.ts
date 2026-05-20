import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { DriftDetectOptions } from "../detect-options.js";
import type { DriftIssue, DriftKindModule, DriftSeverity, RepairResult } from "../types.js";

const execFileP = promisify(execFile);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

/**
 * UH-109 spec-stale: `git diff dev...HEAD` touches `src/**` implementation
 * without updating the nearest `.spec.md` (sibling `foo.spec.md` for
 * `foo.ts`, or any `docs/specs/**` change for cross-cutting work).
 */
export const specStaleKind: DriftKindModule = {
  kind: "spec-stale",
  canRepair: false,

  async detect(root: string, options?: DriftDetectOptions): Promise<DriftIssue[]> {
    const severity = specStaleSeverity(options);
    const changed = await listChangedPaths(root);
    if (changed.length === 0) return [];

    const changedSet = new Set(changed);
    const docsSpecTouched = changed.some((p) => p.startsWith("docs/specs/"));
    const issues: DriftIssue[] = [];

    for (const srcPath of changed) {
      if (!isImplementationSrcChange(srcPath)) continue;

      const nearestSpec = neighborSpecPath(srcPath);
      if (changedSet.has(nearestSpec)) continue;
      if (docsSpecTouched) continue;

      issues.push({
        kind: "spec-stale",
        severity,
        message: `Source ${srcPath} changed without updating nearest spec ${nearestSpec}`,
        target: path.join(root, srcPath),
        metadata: { srcPath, specPath: nearestSpec },
      });
    }

    return issues;
  },

  async repair(issue: DriftIssue): Promise<RepairResult> {
    return {
      issue,
      outcome: "needs-human",
      reason: "Update the nearest .spec.md (or a docs/specs/ spec for cross-cutting work) to match the implementation change.",
    };
  },
};

export function specStaleSeverity(options?: DriftDetectOptions): DriftSeverity {
  return options?.strictSpec === true ? "error" : "warn";
}

export function neighborSpecPath(srcPath: string): string {
  const dir = path.posix.dirname(srcPath);
  const base = path.posix.basename(srcPath);
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  return path.posix.join(dir, `${stem}.spec.md`);
}

export function isImplementationSrcChange(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.startsWith("src/")) return false;
  if (normalized.endsWith(".spec.md")) return false;
  const ext = path.posix.extname(normalized);
  return SOURCE_EXTENSIONS.has(ext);
}

async function listChangedPaths(root: string): Promise<string[]> {
  for (const baseRef of ["dev", "origin/dev"]) {
    try {
      const { stdout } = await execFileP(
        "git",
        ["diff", "--name-only", `${baseRef}...HEAD`],
        { cwd: root },
      );
      return stdout
        .split("\n")
        .map((line) => line.trim().replace(/\\/g, "/"))
        .filter(Boolean);
    } catch {
      // try next base ref
    }
  }
  return [];
}
