/**
 * Diff capture helper used by every runtime adapter (UH-34).
 *
 * Replaces the previous per-adapter `git diff --no-color` calls. Plain
 * `git diff` skips untracked new files, which is the most common shape
 * of a mission output (codex/oh-my-pi/hermes writing one or more brand
 * new files). The captured `diff.patch` would then look empty even when
 * the mission produced real artifacts.
 *
 * Strategy: run `git add --intent-to-add` against the untracked-file
 * list (excluding gitignored paths) before `git diff`. `git add -N`
 * does NOT stage blob content; it just marks the path so `git diff`
 * emits a new-file hunk for it. The index mutation is bounded and
 * harmless inside a discardable sandbox worktree.
 *
 * Falls back to an empty patch + an error entry when git is unavailable
 * or `cwd` is not a checkout, matching the prior contract.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface DiffCaptureResult {
  patch: string;
  errors?: string[];
}

const GIT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Capture the working-tree diff at `cwd`, including untracked new files.
 *
 * Steps:
 *   1. `git ls-files --others --exclude-standard -z` to enumerate
 *      untracked (non-ignored) paths.
 *   2. `git add --intent-to-add -- <paths>` to mark them so the next
 *      `git diff` produces a new-file diff for each.
 *   3. `git diff --no-color` to capture both modified-tracked and the
 *      now-intent-to-added untracked files in one unified patch.
 *
 * When step 1 fails (git missing, no repo), returns `{ patch: "",
 * errors }` matching the prior contract. Step 2 is a no-op when there
 * are zero untracked files. Step 3 is the same call the previous
 * implementation made.
 */
export async function captureDiffWithUntracked(cwd: string): Promise<DiffCaptureResult> {
  try {
    const { stdout: untrackedRaw } = await execFileP(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd, maxBuffer: GIT_MAX_BUFFER },
    );
    const untracked = untrackedRaw.split("\0").filter((p) => p.length > 0);
    if (untracked.length > 0) {
      // `git add -N` doesn't stage content; the next `git diff` then
      // includes a /dev/null -> <file> hunk for each path.
      await execFileP("git", ["add", "--intent-to-add", "--", ...untracked], {
        cwd,
        maxBuffer: GIT_MAX_BUFFER,
      });
    }
    const { stdout: diff } = await execFileP("git", ["diff", "--no-color"], {
      cwd,
      maxBuffer: GIT_MAX_BUFFER,
    });
    return { patch: diff };
  } catch (err) {
    return {
      patch: "",
      errors: [`Diff capture failed: ${(err as Error).message}`],
    };
  }
}
