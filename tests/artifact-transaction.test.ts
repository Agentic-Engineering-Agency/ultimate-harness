import { test, expect } from "vitest";
import { mkdtemp, readFile, readdir, rename as fsRename, writeFile, rm } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { withArtifactTransaction, writeAtomicArtifact } from "../src/harness/artifact-transaction.js";
import { appendRunsIndexEntry, writeLatestPointer, readLatestPointer, ensureRunDir, mirrorRuntimeResultToLatest, pruneOldRuns } from "../src/harness/run-id.js";

const retryError = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });

test("atomic artifact retries sharing failures and removes its staging file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-atomic-retry-"));
  const file = path.join(root, "state.json");
  let attempts = 0;
  try {
    await writeFile(file, "old");
    await writeAtomicArtifact(file, "new", {
      delay: async () => {},
      rename: async (from, to) => {
        attempts += 1;
        if (attempts < 3) throw retryError("EPERM");
        await fsRename(from, to);
      },
    });
    expect(attempts).toBe(3);
    expect(await readFile(file, "utf8")).toBe("new");
    expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("atomic artifact preserves the old file after ten sharing failures", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-atomic-fail-"));
  const file = path.join(root, "state.json");
  try {
    await writeFile(file, "old");
    await expect(writeAtomicArtifact(file, "new", {
      delay: async () => {},
      rename: async () => { throw retryError("EPERM"); },
    })).rejects.toMatchObject({ code: "EPERM" });
    expect(await readFile(file, "utf8")).toBe("old");
    expect((await readdir(root)).filter(name => name.endsWith(".tmp"))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("atomic artifact throws non-retryable rename errors immediately", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-atomic-enospc-"));
  try {
    await expect(writeAtomicArtifact(path.join(root, "state.json"), "new", {
      delay: async () => { throw new Error("delay should not run"); },
      rename: async () => { throw retryError("ENOSPC"); },
    })).rejects.toMatchObject({ code: "ENOSPC" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== "win32")("Windows open destination is retried until the reader closes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-atomic-windows-"));
  const file = path.join(root, "state.json");
  const handle = openSync(file, "w");
  const closeTimer = setTimeout(() => closeSync(handle), 50);
  let writeError: unknown;
  try {
    await writeFile(file, "old");
    try {
      await writeAtomicArtifact(file, "new");
    } catch (error) {
      writeError = error;
    }
    if (writeError) expect((writeError as NodeJS.ErrnoException).code).toMatch(/^(EPERM|EACCES|EBUSY)$/);
    else expect(await readFile(file, "utf8")).toBe("new");
  } finally {
    clearTimeout(closeTimer);
    try { closeSync(handle); } catch {}
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent sibling results and replay lineage survive canonical index updates", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-index-transaction-"));
  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => appendRunsIndexEntry(root, "one", {
      run_id: `run-${index}`, started_at: "2026-09-15T00:00:00.000Z", status: "running", runtime: "fixture", replay_of: "original",
    })));
    await Promise.all(Array.from({ length: 12 }, (_, index) => appendRunsIndexEntry(root, "one", {
      run_id: `run-${index}`, started_at: "2026-09-15T00:00:00.000Z", status: "passed", runtime: "fixture",
    })));
    const state = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", "index.json"), "utf8"));
    expect(state.runs.map((run: { run_id: string }) => run.run_id).sort()).toEqual(Array.from({ length: 12 }, (_, index) => `run-${index}`).sort());
    for (const run of state.runs) expect(run).toMatchObject({ status: "passed", replay_of: "original" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("malformed state is retained instead of overwritten with an empty ledger", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-index-corrupt-"));
  const entry = { run_id: "one", started_at: "2026-09-15T00:00:00.000Z", status: "running" as const, runtime: "fixture" };
  try {
    await appendRunsIndexEntry(root, "one", entry);
    const file = path.join(root, ".harness", "missions", "one", "runs", "index.json");
    await writeFile(file, "broken evidence");
    await expect(appendRunsIndexEntry(root, "one", entry)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("broken evidence");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a slower older run cannot replace the latest run projection", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-index-order-"));
  try {
    const old = { schema_version: "uh.latest-run.v0" as const, run_id: "older", started_at: "2026-09-15T00:00:00Z", status: "running" as const };
    const latest = { ...old, run_id: "newer", started_at: "2026-09-15T01:00:00Z" };
    await writeLatestPointer(root, "one", old);
    await writeLatestPointer(root, "one", latest);
    await writeFile(path.join(await ensureRunDir(root, "one", latest.run_id), "runtime-result.yaml"), "newer evidence");
    await mirrorRuntimeResultToLatest(root, "one", latest.run_id);
    await writeFile(path.join(await ensureRunDir(root, "one", old.run_id), "runtime-result.yaml"), "older evidence");
    await writeLatestPointer(root, "one", { ...old, status: "passed" });
    await mirrorRuntimeResultToLatest(root, "one", old.run_id);
    expect((await readLatestPointer(root, "one"))?.run_id).toBe("newer");
    expect(await readFile(path.join(root, ".harness", "missions", "one", "runtime-result.yaml"), "utf8")).toBe("newer evidence");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("retention never removes an active attempt's output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-index-active-"));
  try {
    for (const [index, status] of ["running", "passed", "failed"].entries()) {
      await appendRunsIndexEntry(root, "one", {
        run_id: `run-${index}`, started_at: `2026-09-15T0${index}:00:00Z`, status: status as "running" | "passed" | "failed",
      });
      await writeFile(path.join(await ensureRunDir(root, "one", `run-${index}`), "runtime.stdout.log"), `evidence-${index}`);
    }
    expect(await pruneOldRuns(root, "one", 1)).toBe(1);
    expect(await readFile(path.join(root, ".harness", "missions", "one", "runs", "run-0", "runtime.stdout.log"), "utf8")).toBe("evidence-0");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== "win32")("controller death releases canonical ownership without deleting another owner's lock", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-transaction-owner-loss-"));
  const file = path.join(root, "state.json");
  const module = new URL("../src/harness/artifact-transaction.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `import {withArtifactTransaction} from ${JSON.stringify(module)};
     await withArtifactTransaction(${JSON.stringify(file)}, async () => {
       process.stdout.write("owned"); await new Promise(() => {});
     });`], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 5000 });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.stdout!.once("data", () => resolve());
      child.once("close", () => reject(new Error("Owner exited before acquiring its transaction")));
    });
    child.kill();
    await closed;
    await withArtifactTransaction(file, () => writeAtomicArtifact(file, "recovered"));
    expect(await readFile(file, "utf8")).toBe("recovered");
    await writeFile(`${file}.lock`, "retained legacy ownership");
    await expect(withArtifactTransaction(file, () => writeAtomicArtifact(file, "overwritten"))).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("recovered");
    expect(await readFile(`${file}.lock`, "utf8")).toBe("retained legacy ownership");
  } finally {
    child.kill();
    await closed;
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
