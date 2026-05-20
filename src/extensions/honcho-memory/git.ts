import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Result of a one-shot git invocation. `code` is the process exit code;
 * `stdout` is trimmed-friendly raw stdout.
 */
export interface GitExecResult {
  code: number;
  stdout: string;
}

/**
 * Run a short-lived git command inside `cwd`. The 3s timeout matches the pi
 * extension so a hung git invocation never blocks mission startup. Returns
 * `null` on any failure — callers fall through to the next strategy.
 */
export const execGit = async (
  cwd: string,
  args: string[],
): Promise<GitExecResult | null> => {
  try {
    const { stdout } = await execFileP("git", ["-C", cwd, ...args], {
      timeout: 3000,
      windowsHide: true,
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    if (typeof e.code === "number") {
      return { code: e.code, stdout: e.stdout ?? "" };
    }
    return null;
  }
};
