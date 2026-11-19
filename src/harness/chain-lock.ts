import { closeSync, mkdirSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import path from "node:path";

/**
 * Serialize one chained append across processes and across callers in one process.
 *
 * A hash chain is read-then-append: the next entry links to the hash of the last line. Two writers that
 * read the same last line both write an entry with the same `prev_hash`, the chain forks, and the
 * integrity check that `uh land` and `uh queue` require then fails for good. The read and the append
 * therefore run inside one exclusive section.
 *
 * The lock is a `<file>.lock` created with `O_EXCL`, which behaves the same on Windows and POSIX. The
 * section is a few synchronous file operations, so a lock older than `STALE_LOCK_MS` can only be left
 * by a process that died inside it and is taken over, never waited on forever.
 */
const STALE_LOCK_MS = 30_000;
const WAIT_LIMIT_MS = 15_000;
const SLEEP = new Int32Array(new SharedArrayBuffer(4));
const RETRYABLE = new Set(["EEXIST", "EPERM", "EACCES", "EBUSY"]);

function sleep(ms: number): void {
  Atomics.wait(SLEEP, 0, 0, ms);
}

export function withChainLock<T>(file: string, operation: () => T): T {
  const lockPath = `${file}.lock`;
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + WAIT_LIMIT_MS;
  let descriptor: number | undefined;
  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx");
    } catch (error) {
      if (!RETRYABLE.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) rmSync(lockPath, { force: true });
      } catch { /* the holder released it between the open and the stat */ }
      if (Date.now() >= deadline) throw new Error(`Hash-chain append remains locked: ${lockPath}`);
      sleep(15);
    }
  }
  try {
    writeSync(descriptor, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
    return operation();
  } finally {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  }
}
