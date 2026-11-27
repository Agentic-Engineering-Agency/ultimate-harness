import { readFile } from "node:fs/promises";

/**
 * Whether a process the harness killed is actually gone.
 *
 * A killed process whose parent has already exited is re-parented and stays
 * visible as a zombie until init reaps it. In a container whose PID 1 does not
 * reap orphans — which is how CI runners behave — that can last indefinitely,
 * and `process.kill(pid, 0)` succeeds for a zombie. So pid existence alone
 * cannot prove termination; a zombie has stopped executing, which is the
 * property these tests actually assert.
 */
export async function isTerminated(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch {
    return true;
  }
  if (process.platform !== "linux") return false;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf-8");
    // The comm field can contain spaces and parentheses, so the state is the
    // field after the last ")".
    return stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z");
  } catch {
    return true; // Exited between the existence probe and the state read.
  }
}

/** Poll for termination instead of asserting on one instant of reaping. */
export async function waitForTerminated(pid: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await isTerminated(pid))) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`process ${pid} was still running ${timeoutMs}ms after termination was requested`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
