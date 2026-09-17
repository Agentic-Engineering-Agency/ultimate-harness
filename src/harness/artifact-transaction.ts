import { access, open, realpath, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
/** Atomic replacement with durable contents and unique staging files. */
export async function writeAtomicArtifact(file: string, content: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

/** Serialize the read/modify/write boundary across CLI processes, not merely Promise callers.
 * Windows uses a kernel-owned named pipe, released automatically when its owner dies.
 * Other platforms retain the bounded filesystem lock; ambiguous legacy locks fail closed.
 */
export async function withArtifactTransaction<T>(file: string, operation: () => Promise<T>): Promise<T> {
  if (process.platform === "win32") return withWindowsTransaction(file, operation);
  const lockPath = `${file}.lock`;
  const deadline = Date.now() + 10_000;
  let handle;
  while (!handle) {
    try { handle = await open(lockPath, "wx"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error(`Artifact transaction remains locked: ${lockPath}`);
      await delay(20);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath);
  }
}

async function withWindowsTransaction<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const canonical = path.join(await realpath(path.dirname(path.resolve(file))), path.basename(file)).toLowerCase();
  if (canonical.startsWith("\\\\")) throw new Error("Windows artifact transactions require local storage, not a network share");
  const pipe = `\\\\.\\pipe\\uh-artifact-${createHash("sha256").update(canonical).digest("hex")}`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    const server = createServer(socket => socket.destroy());
    server.maxConnections = 1;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(pipe, () => { server.off("error", reject); resolve(); });
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      if (Date.now() >= deadline) throw new Error(`Artifact transaction remains locked: ${file}`);
      await delay(20);
      continue;
    }
    try {
      // Never discard an older controller's ownership evidence or assume its PID is dead.
      try {
        await access(`${file}.lock`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return await operation();
        throw error;
      }
      throw new Error(`Legacy artifact lock requires owner reconciliation: ${file}.lock`);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}
