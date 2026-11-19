import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { registerLiveRun } from "../src/harness/live-runs.js";

/**
 * `uh wait` — the CLI is spawned for real against a temporary live-run
 * registry so the exit codes under test are the process exit codes an
 * orchestrator sees. No test starts a model runtime: runs are fixtures whose
 * `runtime-control.json` the test settles at will, and controller pids are
 * either this (live) vitest process or a pid no machine can have.
 */

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const iso = (milliseconds: number): string => new Date(milliseconds).toISOString();

/** A pid that cannot exist: far beyond any realistic pid_max. */
const DEAD_PID = 2_000_000_000;

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(path.join(tmpdir(), "uh-wait-"));
  await mkdir(path.join(ROOT, ".harness"), { recursive: true });
  await writeFile(
    path.join(ROOT, ".harness", "project.yaml"),
    "schema_version: uh.project.v0\nname: wait fixture\n",
    "utf-8",
  );
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ fixtures */

function controlPath(missionId: string, runId: string): string {
  return path.join(ROOT, ".harness", "missions", missionId, "runs", runId, "runtime-control.json");
}

interface SeedOptions {
  missionId: string;
  runId: string;
  controllerPid?: number;
  status?: string;
  /** Write the runtime-control.json next to the registry entry (default true). */
  control?: boolean;
}

/** Register a live run at the project root and write its controller file. */
async function seedRun(options: SeedOptions): Promise<void> {
  const controllerPid = options.controllerPid ?? process.pid;
  const now = Date.now();
  if (options.control !== false) {
    await mkdir(path.dirname(controlPath(options.missionId, options.runId)), { recursive: true });
    await writeFile(
      controlPath(options.missionId, options.runId),
      JSON.stringify({
        schema_version: "uh.runtime-control.v0",
        mission_id: options.missionId,
        run_id: options.runId,
        runtime: "oh-my-pi",
        controller_pid: controllerPid,
        started_at: iso(now - 60_000),
        heartbeat_at: iso(now - 2_000),
        status: options.status ?? "running",
        turns: 3,
        denials: 0,
        inflight_tools: 1,
      }),
      "utf-8",
    );
  }
  await registerLiveRun({
    projectRoot: ROOT,
    artifactRoot: ROOT,
    runId: options.runId,
    missionId: options.missionId,
    runtime: "oh-my-pi",
    controllerPid,
    startedAt: iso(now - 60_000),
    ...(options.control === false && options.status !== undefined ? { status: options.status } : {}),
  });
}

/** The controller reports its own terminal settlement. */
async function settleRun(missionId: string, runId: string, status: string, stopCode?: string): Promise<void> {
  const file = controlPath(missionId, runId);
  const control = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  await writeFile(
    file,
    JSON.stringify({
      ...control,
      status,
      heartbeat_at: new Date().toISOString(),
      ...(stopCode !== undefined ? { stop_code: stopCode } : {}),
    }),
    "utf-8",
  );
}

function waitArgs(runId: string, extra: string[] = []): string[] {
  return ["wait", runId, "--root", ROOT, ...extra];
}

function runCli(args: string[]) {
  return spawnSync("bun", ["x", "tsx", CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  });
}

/** Spawn `uh wait` and resolve with its whole output once it exits. */
function runCliAsync(args: string[], killAfterMs = 25_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["x", "tsx", CLI, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const guard = setTimeout(() => child.kill("SIGKILL"), killAfterMs);
    child.on("close", (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, stderr });
    });
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* --------------------------------------------------------------------- tests */

describe("uh wait", () => {
  test("returns 0 with the run's line when the run settles while waiting", async () => {
    await seedRun({ missionId: "wave-a", runId: "run-wait-live" });
    const pending = runCliAsync(waitArgs("run-wait-live", ["--timeout-ms", "20000"]));
    await sleep(3_000);
    await settleRun("wave-a", "run-wait-live", "passed");
    const result = await pending;
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("run-wait-live  wave-a  passed");
    expect(result.stdout).toContain("matched=1 settled=1 passed=1 failed=0");
  });

  test("returns 1 when the run settles with a failing status", async () => {
    await seedRun({ missionId: "wave-b", runId: "run-wait-fail" });
    const pending = runCliAsync(waitArgs("run-wait-fail", ["--timeout-ms", "20000"]));
    await sleep(3_000);
    await settleRun("wave-b", "run-wait-fail", "failed", "stall");
    const result = await pending;
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("run-wait-fail  wave-b  failed  stop=stall");
    expect(result.stdout).toContain("matched=1 settled=1 passed=0 failed=1");
  });

  test("returns 4 after the timeout when the run never settles", async () => {
    await seedRun({ missionId: "wave-c", runId: "run-wait-stuck" });
    const result = runCli(waitArgs("run-wait-stuck", ["--timeout-ms", "1500"]));
    expect(result.status).toBe(4);
    expect(result.stdout).toContain("run-wait-stuck  wave-c  timed_out");
    expect(result.stdout).toContain("timed_out=1");
  });

  test("returns 2 for an unknown run id", () => {
    const result = runCli(waitArgs("run-wait-nope"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no run matching");
  });

  test("returns 3 when the run is orphaned", async () => {
    await seedRun({ missionId: "wave-d", runId: "run-wait-orphan", controllerPid: DEAD_PID, control: false });
    const result = runCli(waitArgs("run-wait-orphan", ["--timeout-ms", "15000"]));
    expect(result.status).toBe(3);
    expect(result.stdout).toContain("run-wait-orphan  wave-d  orphaned");
    expect(result.stdout).toContain("orphaned=1");
  });

  test("--json emits the wait report for an already-settled run", async () => {
    await seedRun({ missionId: "wave-e", runId: "run-wait-done", status: "passed" });
    await settleRun("wave-e", "run-wait-done", "passed");
    const result = runCli(waitArgs("run-wait-done", ["--json"]));
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      schema_version: string;
      exit_code: number;
      counts: { matched: number; settled: number; passed: number };
      entries: Array<{ run_id: string; status: string; outcome: string }>;
    };
    expect(report.schema_version).toBe("uh.wait.v0");
    expect(report.exit_code).toBe(0);
    expect(report.counts).toMatchObject({ matched: 1, settled: 1, passed: 1 });
    expect(report.entries[0]).toMatchObject({ run_id: "run-wait-done", status: "passed", outcome: "settled" });
  });
});
