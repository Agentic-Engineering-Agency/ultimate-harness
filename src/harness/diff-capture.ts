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
 * `cwd` is not a checkout, matching the prior contract. Each git command is
 * retried once after a short settle delay so a transient spawn failure (for
 * example during a host memory shortage) cannot fail an otherwise settled
 * run; callers must treat a capture failure after a confirmed settlement as
 * `diff_capture` bookkeeping, never as a status or exit-code change.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

const GIT_MAX_BUFFER = 50 * 1024 * 1024;
/** One settle-and-retry round for transient git spawn failures (host memory shortage, AV scans). */
const GIT_RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one git command. A failed invocation is retried exactly once after a
 * short settle delay before giving up, so a transient spawn failure cannot
 * fail an otherwise settled run. Exit codes listed in `toleratedExitCodes`
 * are expected outcomes of the command (e.g. `git diff --no-index` exits 1
 * when differences exist) and are rethrown untouched so the caller can
 * interpret them without paying the retry delay.
 */
async function execGit(
  args: string[],
  cwd: string,
  toleratedExitCodes: readonly (number | string)[] = [],
): Promise<string> {
  try {
    return (await execFileP("git", args, { cwd, maxBuffer: GIT_MAX_BUFFER })).stdout;
  } catch (firstError) {
    const code = (firstError as { code?: number | string }).code;
    if (toleratedExitCodes.some((tolerated) => Number(tolerated) === Number(code))) throw firstError;
    await delay(GIT_RETRY_DELAY_MS);
    return (await execFileP("git", args, { cwd, maxBuffer: GIT_MAX_BUFFER })).stdout;
  }
}

/**
 * The record a diff capture failure leaves on a runtime result after the run
 * has already settled. It is bookkeeping, never a status or exit-code change:
 * consumers must not overturn a confirmed settlement because of it.
 */
export function diffCaptureFailureRecord(errors: readonly string[]): string {
  return `diff_capture: ${JSON.stringify({ status: "failed", error: errors.filter((entry) => entry.trim().length > 0).join("; ") })}`;
}

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
    await execGit(["rev-parse", "--verify", "HEAD"], cwd);

    const untrackedRaw = await execGit(
      ["ls-files", "--others", "--exclude-standard", "-z"],
      cwd,
    );
    const untracked = untrackedRaw
      .split("\0")
      .filter((p) => p.length > 0 && !isGeneratedHarnessPath(p));

    // Comparing HEAD with the worktree includes both staged and unstaged
    // changes while leaving the index untouched. --binary is required for
    // binary changes to remain applicable on a clean base.
    const trackedDiff = await execGit(
      ["diff", "HEAD", "--binary", "--no-color", "--", ".", ...GENERATED_PATHSPEC_EXCLUDES],
      cwd,
    );
    const patches = trackedDiff.length > 0 ? [trackedDiff] : [];
    for (const relativePath of untracked) {
      try {
        const output = await execGit(
          ["diff", "--no-index", "--binary", "--no-color", "--", "/dev/null", relativePath],
          cwd,
          [1],
        );
        if (output.length > 0) patches.push(output);
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
