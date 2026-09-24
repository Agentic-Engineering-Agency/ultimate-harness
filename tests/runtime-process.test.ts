import { test, expect } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { runRuntimeProcess, type RuntimeProcessOutput } from "../src/harness/runtime-process.js";
import { cancelLocalMissionRun } from "../src/harness/mission-cancel.js";

// Real child processes and filesystem visibility cannot be driven by Vitest's fake clock.
async function waitForFile(file: string, predicate: (text: string) => boolean) {
  for (let i = 0; i < 100; i++) {
    try { const text = await readFile(file, "utf8"); if (predicate(text)) return text; } catch { /* Not persisted yet. */ }
    await delay(20);
  }
  throw new Error(`Expected persisted state at ${file}`);
}

/**
 * Supervision deadlines are fired by advancing this clock, never by waiting
 * out wall time, so the tests stay deterministic under machine load.
 */
function manualClock() {
  let current = Date.now();
  const polls: Array<() => void> = [];
  return {
    now: () => current,
    setInterval: (callback: () => void) => { polls.push(callback); return polls.length; },
    clearInterval: () => {},
    advance: (milliseconds: number) => { current += milliseconds; for (const poll of [...polls]) poll(); },
  };
}

/** Yield to the event loop without sleeping on wall time. */
const yieldToEventLoop = () => new Promise<void>(resolve => setImmediate(resolve));

test("local cancellation settles only the selected real child and preserves live transcript", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-local-cancel-"));
  const directory = path.join(root, ".harness", "missions", "one", "runs", "attempt-one");
  const abort = new AbortController();
  let running: Promise<RuntimeProcessOutput> | undefined;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(root, ".harness", "missions", "one", "mission.yaml"), "schema_version: uh.mission.v0\nid: one\n");
    running = runRuntimeProcess({ command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'native-session'})); console.log(JSON.stringify({type:'tool_execution_start',toolCallId:'one'})); setInterval(()=>{},1000)"],
      cwd: root, cancellationSignal: abort.signal, timeoutMs: 5000,
      getUsage: () => ({ source: "runtime", input_tokens: 7, cache_read_tokens: 11 }),
      artifacts: { directory, missionId: "one", runId: "attempt-one", runtime: "fixture" },
    });
    const live = await waitForFile(path.join(directory, "runtime.stdout.log"), text => text.includes("tool_execution_start"));
    expect(live).toContain("tool_execution_start");
    const liveControl = JSON.parse(await waitForFile(path.join(directory, "runtime-control.json"),
      text => JSON.parse(text).status === "running" && JSON.parse(text).usage?.input_tokens === 7));
    expect(liveControl.usage).toMatchObject({ input_tokens: 7, cache_read_tokens: 11 });
    const cancellation = await cancelLocalMissionRun(root, "one", "attempt-one");
    const result = await running;
    expect(cancellation.status).toBe("cancelled");
    expect(result.cancelled).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.sessionId).toBe("native-session");
    const persisted = JSON.parse(await readFile(path.join(directory, "runtime-control.json"), "utf8"));
    expect(persisted.status).toBe("cancelled");
    expect(persisted.usage).toMatchObject({ input_tokens: 7, cache_read_tokens: 11 });
    expect(persisted.usage.total_tokens).toBeUndefined();
    expect(await readFile(path.join(directory, "runtime.stdout.log"), "utf8")).toBe(result.stdout);
    expect((await cancelLocalMissionRun(root, "one", "attempt-one")).status).toBe("cancelled");
    await expect(cancelLocalMissionRun(root, "one", "other-attempt")).rejects.toThrow();
  } finally {
    abort.abort();
    if (running) await running;
    await rm(root, { recursive: true, force: true });
  }
});
test("a failed periodic heartbeat does not stop an otherwise successful run", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-heartbeat-retry-"));
  const clock = manualClock();
  const startedAt = clock.now();
  let heartbeatFailures = 0;
  // Serializes the "running" persists and exposes their completion, so the
  // test advances virtual time only after the initial and stdout-driven
  // persists have drained; the next running-persist is then a heartbeat.
  let runningPersistsDrained: Promise<void> = Promise.resolve();
  try {
    const run = runRuntimeProcess({
      command: process.execPath,
      // The child stays alive until the test confirms the heartbeat mechanism
      // ran, then exits on signal; the 10s backstop only bounds failure paths.
      args: ["-e", "const fs=require('node:fs'); process.stdout.write(JSON.stringify({type:'session',id:'heartbeat'})+'\\n'+JSON.stringify({type:'run_end'})+'\\n'); setInterval(()=>{ if (fs.existsSync('heartbeat-exercised')) process.exit(0); },20); setTimeout(()=>process.exit(0),10000)"],
      cwd: root,
      timeoutMs: 5000,
      clock,
      artifacts: { directory: path.join(root, "run"), missionId: "one", runId: "one", runtime: "fixture" },
      persistArtifact: async (_file, content) => {
        if (JSON.parse(content).status !== "running") return;
        const previous = runningPersistsDrained;
        let release!: () => void;
        runningPersistsDrained = new Promise<void>(resolve => { release = resolve; });
        try {
          await previous;
          if (clock.now() - startedAt > 500) { heartbeatFailures++; throw new Error("simulated heartbeat failure"); }
        } finally { release(); }
      },
    });
    let settled = false;
    void run.then(() => { settled = true; });
    await waitForFile(path.join(root, "run", "runtime.stdout.log"), text => text.includes("run_end"));
    await runningPersistsDrained;
    // Advance across the 1s heartbeat interval so a poll fires a heartbeat
    // persist, which fails; a real tick never has to elapse for this.
    while (heartbeatFailures === 0 && !settled) {
      clock.advance(1500);
      await yieldToEventLoop();
    }
    await writeFile(path.join(root, "heartbeat-exercised"), "", "utf8");
    const result = await run;
    expect(heartbeatFailures).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(result.supervisionStopCode).toBeUndefined();
  } finally {
    await writeFile(path.join(root, "heartbeat-exercised"), "", "utf8").catch(() => {});
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}, 10_000);

test("real process with no progress is stopped without a provider call", async () => {
  const clock = manualClock();
  const run = runRuntimeProcess({ command: process.execPath,
    args: ["-e", "setInterval(()=>{},1000)"], cwd: process.cwd(), limits: { startup_timeout_ms: 100 }, clock,
  });
  let settled = false;
  void run.then(() => { settled = true; });
  // Advance virtual time past the startup budget so the readiness deadline
  // fires on the next poll, exactly when intended, independent of load.
  while (!settled) {
    clock.advance(200);
    await yieldToEventLoop();
  }
  const result = await run;
  expect(result.exitCode).not.toBe(0);
  expect(result.timedOut).toBe(true);
});

test("a native max_turns result settles its receipt as turn_limit with a non-empty reason", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-native-turn-cap-"));
  try {
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'turn-cap'})); console.log(JSON.stringify({type:'result',subtype:'error_max_turns',stopReason:'max_turns',num_turns:100}))"],
      cwd: root,
      artifacts: { directory: root, missionId: "one", runId: "turn-cap", runtime: "fixture" },
    });
    expect(result.supervisionStopCode).toBe("turn_limit");
    const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "turn_limit" });
    expect(control.stop_reason).toBe("Native turn cap (max_turns) reached after 100 turns");
    expect(control.turns).toBe(100);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("an unrecognized native terminal stop settles as runtime_error with the reason copied", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-native-stop-reason-"));
  try {
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'native-stop'})); console.log(JSON.stringify({type:'result',finalText:'partial',stopReason:'aborted',num_turns:4}))"],
      cwd: root,
      artifacts: { directory: root, missionId: "one", runId: "native-stop", runtime: "fixture" },
    });
    expect(result.supervisionStopCode).toBe("runtime_error");
    const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "runtime_error" });
    expect(control.stop_reason).toBe("Runtime reported failure (aborted)");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test.skipIf(process.platform !== "win32")("job cap prevents an owned child from committing excessive memory", async () => {
  const outcome = await runRuntimeProcess({
    command: process.execPath,
    args: ["-e", "const b = Buffer.alloc(256 * 1024 * 1024, 7); console.log('ALLOCATION_COMPLETED', b[0]);"],
    cwd: process.cwd(),
    limits: { memory_mb: 64, timeout_ms: 5000 },
  });
  expect(outcome.exitCode).not.toBe(0);
  expect(outcome.stdout).not.toContain("ALLOCATION_COMPLETED");
  expect(outcome.timedOut).toBe(false);
});

test.skipIf(process.platform !== "win32")("controller death settles the owned worker tree and publishes failure", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-controller-loss-"));
  const worker = "const fs=require('node:fs'); const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); child.unref(); fs.writeFileSync('pids.json',JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000);";
  const options = { command: process.execPath, args: ["-e", worker], cwd: root,
    limits: { timeout_ms: 10000 },
    artifacts: { directory: root, missionId: "one", runId: "owner-loss", runtime: "fixture" },
  };
  const source = `import {runRuntimeProcess} from ${JSON.stringify(new URL("../src/harness/runtime-process.ts", import.meta.url).href)}; await runRuntimeProcess(${JSON.stringify(options)});`;
  const controller = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { stdio: "ignore", windowsHide: true });
  const closed = new Promise<void>(resolve => controller.once("close", () => resolve()));
  try {
    const pids: number[] = JSON.parse(await waitForFile(path.join(root, "pids.json"), text => Boolean(text.trim())));
    controller.kill("SIGKILL");
    await closed;
    const control = JSON.parse(await waitForFile(path.join(root, "runtime-control.json"), text => JSON.parse(text).status === "failed"));
    expect(control).toMatchObject({ stop_code: "controller_lost", settlement_confirmed: true });
    for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    controller.kill("SIGKILL");
    await closed;
    // The guardian publishes the receipt immediately before releasing its executable handle.
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}, 15000);

test("combined output limit settles a noisy child and bounds both durable streams", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-output-cap-"));
  const limit = 32 * 1024;
  try {
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'bounded-output'})); let n=0; setInterval(()=>{(n++%2 ? process.stdout : process.stderr).write('é'.repeat(8192));},20);"],
      cwd: root, limits: { max_output_bytes: limit, timeout_ms: 10000 },
      artifacts: { directory: root, missionId: "one", runId: "noisy", runtime: "fixture" },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.sessionId).toBe("bounded-output");
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(limit);
    expect(await readFile(path.join(root, "runtime.stdout.log"), "utf8")).toBe(result.stdout);
    expect(await readFile(path.join(root, "runtime.stderr.log"), "utf8")).toBe(result.stderr);
    const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "output_limit" });
    if (process.platform === "win32") expect(control.settlement_confirmed).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test.skipIf(process.platform !== "win32")("Windows-only guardian cache is reused across runs (non-Windows skips because the guardian requires PowerShell)", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "uh-guardian-cache-"));
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = cacheRoot;
  const roots: string[] = [];
  let cachedMtime: number | undefined;
  try {
    for (const runId of ["first", "second"]) {
      const root = await mkdtemp(path.join(tmpdir(), `uh-guardian-${runId}-`));
      roots.push(root);
      const result = await runRuntimeProcess({
        command: process.execPath,
        args: ["-e", "console.log(JSON.stringify({type:'session',id:'guardian-cache'}));"],
        cwd: root,
        artifacts: { directory: root, missionId: "one", runId, runtime: "fixture" },
      });
      expect(result.exitCode).toBe(0);
      const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
      expect(control.guardian.mode).toBe("cache");
      if (runId === "first") {
        cachedMtime = (await stat(control.guardian.path)).mtimeMs;
        // Let a mistaken second PowerShell compilation produce a distinct mtime.
        await delay(100);
      } else {
        expect((await stat(control.guardian.path)).mtimeMs).toBe(cachedMtime);
      }
    }
  } finally {
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    for (const root of roots) await rm(root, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}, 15000);

test.skipIf(process.platform !== "win32")("Windows-only guardian accepts forward-slash artifact paths (non-Windows skips because the guardian requires PowerShell)", async () => {
  const cacheRoot = await mkdtemp("T:/tmp/uh-guardian-forward-cache-");
  const root = await mkdtemp("T:/tmp/uh-guardian-forward-");
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = cacheRoot.replaceAll("\\", "/");
  try {
    // Keep the drive path in T:/tmp while exercising a pre-extended forward-slash form.
    const artifactsDirectory = `//?/${root.replaceAll("\\", "/")}`;
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'guardian-forward'}));"],
      cwd: root,
      artifacts: { directory: artifactsDirectory, missionId: "one", runId: "forward", runtime: "fixture" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("UH Windows job failed");
    const receipt = JSON.parse(await readFile(path.join(root, "windows-job-result.json"), "utf8"));
    expect(receipt.settled).toBe(true);
    const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ settlement_confirmed: true, guardian: { mode: "cache" } });
  } finally {
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    await rm(root, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}, 15000);

test.skipIf(process.platform !== "win32")("Windows-only guardian settles a deep run directory (non-Windows skips because the guardian requires PowerShell)", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "uh-guardian-deep-cache-"));
  const base = await mkdtemp(path.join(tmpdir(), "uh-guardian-deep-"));
  const root = path.join(base, ...Array.from({ length: 10 }, (_, index) => `worker-project-${index.toString().padStart(2, "0")}-0123456789abcdef`));
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = cacheRoot;
  try {
    const missionDirectory = path.join(root, ".harness", "missions", "one");
    const directory = path.join(missionDirectory, "runs", "deep");
    await mkdir(missionDirectory, { recursive: true });
    await writeFile(path.join(missionDirectory, "mission.yaml"), "schema_version: uh.mission.v0\nid: one\n");
    expect(directory.length).toBeGreaterThan(260);
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'guardian-deep'}));"],
      cwd: base,
      artifacts: { directory, missionId: "one", runId: "deep", runtime: "fixture" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("UH Windows job failed");
    const receipt = JSON.parse(await readFile(path.join(directory, "windows-job-result.json"), "utf8"));
    expect(receipt.settled).toBe(true);
    const control = JSON.parse(await readFile(path.join(directory, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ settlement_confirmed: true, guardian: { mode: "cache" } });
    expect(control.guardian.path.length).toBeLessThan(260);
  } finally {
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    await rm(base, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}, 15000);

test.skipIf(process.platform !== "win32")("Windows-only guardian honors cancellation in a deep run directory (non-Windows skips because the guardian requires PowerShell)", async () => {
  const cacheRoot = await mkdtemp(path.join(tmpdir(), "uh-guardian-stop-cache-"));
  const base = await mkdtemp(path.join(tmpdir(), "uh-guardian-stop-"));
  const root = path.join(base, ...Array.from({ length: 10 }, (_, index) => `worker-project-${index.toString().padStart(2, "0")}-0123456789abcdef`));
  const previousLocalAppData = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = cacheRoot;
  const abort = new AbortController();
  let running: Promise<RuntimeProcessOutput> | undefined;
  try {
    const missionDirectory = path.join(root, ".harness", "missions", "one");
    const directory = path.join(missionDirectory, "runs", "deep-stop");
    await mkdir(missionDirectory, { recursive: true });
    await writeFile(path.join(missionDirectory, "mission.yaml"), "schema_version: uh.mission.v0\nid: one\n");
    expect(directory.length).toBeGreaterThan(260);
    running = runRuntimeProcess({
      command: process.execPath,
      args: ["-e", "console.log(JSON.stringify({type:'session',id:'guardian-stop'})); setInterval(()=>{},1000)"],
      cwd: base,
      cancellationSignal: abort.signal,
      timeoutMs: 10000,
      artifacts: { directory, missionId: "one", runId: "deep-stop", runtime: "fixture" },
    });
    await waitForFile(path.join(directory, "runtime.stdout.log"), text => text.includes("guardian-stop"));
    const cancellation = await cancelLocalMissionRun(root, "one", "deep-stop");
    const result = await running;
    expect(cancellation).toEqual({ ok: true, status: "cancelled" });
    expect(result.cancelled).toBe(true);
    expect(result.settlementConfirmed).toBe(true);
    expect(result.stderr).not.toContain("UH Windows job failed");
    const receipt = JSON.parse(await readFile(path.join(directory, "windows-job-result.json"), "utf8"));
    expect(receipt).toMatchObject({ exit_code: 130, settled: true });
    const control = JSON.parse(await readFile(path.join(directory, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ status: "cancelled", settlement_confirmed: true, guardian: { mode: "cache" } });
  } finally {
    abort.abort();
    if (running) await running;
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    await rm(base, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}, 20000);

