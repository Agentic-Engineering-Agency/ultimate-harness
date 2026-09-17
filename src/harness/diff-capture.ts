/**
 * Diff capture helper used by every runtime adapter (UH-34).
 *
 * Replaces the previous per-adapter `git diff --no-color` calls. Plain
 * `git diff` skips untracked new files, which is the most common shape of a
 * mission output. Untracked files are rendered with `git diff --no-index`
 * without mutating the repository index.
 *
 * Generated bookkeeping under sandbox/audit directories and mission run
 * mirrors is excluded; harness configuration such as adapters, workflows,
 * project metadata, and mission packets remains diffable.
 *
 * Falls back to an empty patch + an error entry when git is unavailable or
 * `cwd` is not a checkout, matching the prior contract.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

const GIT_MAX_BUFFER = 50 * 1024 * 1024;
function isGeneratedHarnessPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.startsWith(".harness/sandboxes/") || normalized.startsWith(".harness/audit/")) return true;
  const parts = normalized.split("/");
  if (parts[0] !== ".harness" || parts[1] !== "missions" || parts.length < 4) return false;
  return parts[3] === "runs" || ["latest.json", "runtime-result.yaml", "verification.yaml", "promotion.yaml"].includes(parts[3]);
}

const GENERATED_PATHSPEC_EXCLUDES = [
  ":(exclude).harness/sandboxes/**",
  ":(exclude).harness/audit/**",
  ":(exclude).harness/missions/**/runs/**",
  ":(exclude).harness/missions/**/latest.json",
  ":(exclude).harness/missions/**/runtime-result.yaml",
  ":(exclude).harness/missions/**/verification.yaml",
  ":(exclude).harness/missions/**/promotion.yaml",
] as const;

function diffFailure(err: unknown): DiffCaptureResult {
  return {
    patch: "",
    errors: [`Diff capture failed: ${(err as Error).message}`],
  };
}

export async function captureDiffWithUntracked(cwd: string): Promise<DiffCaptureResult> {
  try {
    // A HEAD baseline is required: without one, a successful empty result
    // would silently discard staged content and cannot be applied to a base.
    await execFileP("git", ["rev-parse", "--verify", "HEAD"], { cwd, maxBuffer: GIT_MAX_BUFFER });

    const { stdout: untrackedRaw } = await execFileP(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd, maxBuffer: GIT_MAX_BUFFER },
    );
    const untracked = untrackedRaw
      .split("\0")
      .filter((p) => p.length > 0 && !isGeneratedHarnessPath(p));

    // Comparing HEAD with the worktree includes both staged and unstaged
    // changes while leaving the index untouched. --binary is required for
    // binary changes to remain applicable on a clean base.
    const { stdout: trackedDiff } = await execFileP(
      "git",
      ["diff", "HEAD", "--binary", "--no-color", "--", ".", ...GENERATED_PATHSPEC_EXCLUDES],
      { cwd, maxBuffer: GIT_MAX_BUFFER },
    );
    const patches = trackedDiff.length > 0 ? [trackedDiff] : [];
    for (const relativePath of untracked) {
      try {
        await execFileP(
          "git",
          ["diff", "--no-index", "--binary", "--no-color", "--", "/dev/null", relativePath],
          { cwd, maxBuffer: GIT_MAX_BUFFER },
        );
      } catch (err) {
        const output = err as { stdout?: string; code?: number | string };
        if (Number(output.code) !== 1 || typeof output.stdout !== "string") throw err;
        if (output.stdout.length > 0) patches.push(output.stdout);
      }
    }
    return { patch: patches.join("") };
  } catch (err) {
    return diffFailure(err);
  }
}
