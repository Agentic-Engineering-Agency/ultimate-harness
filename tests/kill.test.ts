import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse, stringify } from "yaml";
import { CanonicalTeamStateSchema, type CanonicalTeamState } from "../src/schema/team.js";
import { RuntimeControlSchema } from "../src/schema/runtime-control.js";
import {
  liveRunsDir,
  registerLiveRun,
  type ProcessLister,
} from "../src/harness/live-runs.js";
import {
  KillError,
  formatKillReport,
  killRuns,
  resolveKillTargets,
  runRootForRecord,
  type ProcessKiller,
} from "../src/harness/kill.js";

/**
 * `uh kill` — every process here is a fixture: the process lister and the
 * killer are both injected, so no test can signal a real process and no test
 * starts a real model runtime.
 */

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const iso = (milliseconds: number): string => new Date(milliseconds).toISOString();

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(path.join(tmpdir(), "uh-kill-"));
  await mkdir(path.join(ROOT, ".harness"), { recursive: true });
  await writeFile(
    path.join(ROOT, ".harness", "project.yaml"),
    "schema_version: uh.project.v0\nname: kill fixture\n",
    "utf-8",
  );
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ fixtures */

/** pid -> ppid for the fake machine. */
type World = { alive: Map<number, number> };

function world(processes: Array<[number, number]>): World {
  return { alive: new Map(processes) };
}

function lister(state: World): ProcessLister {
  return async () =>
    [...state.alive.entries()].map(([pid, ppid]) => ({
      pid,
      ppid,
      name: "runtime.exe",
      command: "runtime --json",
    }));
}

/** Tree-kill semantics: `taskkill /T /F` and a POSIX group kill take the descendants. */
function killer(
  state: World,
  calls: number[],
  options: { removesTree?: boolean } = {},
): ProcessKiller {
  return async (pid: number) => {
    calls.push(pid);
    if (options.removesTree === false) return;
    const doomed = new Set<number>([pid]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [child, parent] of [...state.alive.entries()]) {
        if (!doomed.has(child) && doomed.has(parent)) { doomed.add(child); grew = true; }
      }
    }
    for (const pidToRemove of doomed) state.alive.delete(pidToRemove);
  };
}

interface SeedOptions {
  missionId: string;
  runId: string;
  artifactRoot?: string;
  controllerPid: number;
  team?: { mission_id: string; role: string };
  status?: string;
  runtime?: string;
  heartbeatMs?: number;
  controlOverrides?: Record<string, unknown>;
  /** Write runtime-session.yaml so a controller_lost receipt can be reconciled. */
  session?: boolean;
}

/** Write a run's runtime-control.json and register it at the project root. */
async function seedRun(options: SeedOptions): Promise<string> {
  const artifactRoot = options.artifactRoot ?? ROOT;
  const runDir = path.join(artifactRoot, ".harness", "missions", options.missionId, "runs", options.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "runtime-control.json"),
    JSON.stringify({
      schema_version: "uh.runtime-control.v0",
      mission_id: options.missionId,
      run_id: options.runId,
      runtime: options.runtime ?? "oh-my-pi",
      controller_pid: options.controllerPid,
      started_at: iso(NOW - 60_000),
      heartbeat_at: iso(options.heartbeatMs ?? NOW - 2_000),
      status: options.status ?? "running",
      turns: 4,
      denials: 0,
      inflight_tools: 1,
      ...(options.session ? { session_id: "fixture-session" } : {}),
      ...options.controlOverrides,
    }),
    "utf-8",
  );
  if (options.session) {
    await writeFile(
      path.join(runDir, "runtime-session.yaml"),
      stringify({
        schema_version: "uh.runtime-session.v0",
        mission_id: options.missionId,
        runtime: options.runtime ?? "oh-my-pi",
        status: "running",
      }),
      "utf-8",
    );
    await writeFile(path.join(runDir, "runtime.stdout.log"), "partial transcript\n", "utf-8");
    await writeFile(path.join(runDir, "runtime.stderr.log"), "", "utf-8");
    await writeFile(path.join(runDir, "prompt.md"), "fixture prompt", "utf-8");
  }
  await registerLiveRun({
    projectRoot: ROOT,
    artifactRoot,
    runId: options.runId,
    missionId: options.missionId,
    runtime: options.runtime ?? "oh-my-pi",
    controllerPid: options.controllerPid,
    startedAt: iso(NOW - 60_000),
    ...(options.team ? { team: options.team } : {}),
  });
  return runDir;
}

const TEAM = "wave-rc-min";
const PARENT_RUN = "20260922T090000Z-parent";

function workerArtifactRoot(role: string): string {
  return path.join(ROOT, ".harness", "missions", TEAM, "team", "artifacts", PARENT_RUN, "workers", role);
}

/** A team worker: its control file lives under the WORKER artifact root. */
async function seedWorker(role: string, runId: string, controllerPid: number): Promise<string> {
  return seedRun({
    missionId: TEAM,
    runId,
    artifactRoot: workerArtifactRoot(role),
    controllerPid,
    team: { mission_id: TEAM, role },
  });
}

async function seedTeamState(workers: Array<{ role: string; run_id: string }>): Promise<string> {
  const state: CanonicalTeamState = {
    schema_version: "uh.team-run.v0",
    mission_id: TEAM,
    run_id: PARENT_RUN,
    status: "running",
    started_at: iso(NOW - 120_000),
    finished_at: null,
    integration_report_path: `.harness/missions/${TEAM}/team/integration-report.md`,
    verification_status: null,
    leader: { role: "leader", adapter: "oh-my-pi", status: "queued" },
    workers: workers.map((worker, index) => ({
      id: `w${index + 1}`,
      role: worker.role,
      adapter: "oh-my-pi",
      run_id: worker.run_id,
      artifact_scope: `.harness/missions/${TEAM}/team/artifacts/${PARENT_RUN}/workers/${worker.role}`,
      runtime_result_path: null,
      status: "running",
      completion: "complete",
      started_at: iso(NOW - 120_000),
      finished_at: null,
    })),
  };
  const runDir = path.join(ROOT, ".harness", "missions", TEAM, "runs", PARENT_RUN);
  await mkdir(runDir, { recursive: true });
  const file = path.join(runDir, "team-state.json");
  await writeFile(file, JSON.stringify(CanonicalTeamStateSchema.parse(state), null, 2), "utf-8");
  return file;
}

async function readRegistryEntry(runId: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(liveRunsDir(ROOT), `${runId}.json`), "utf-8")) as Record<string, unknown>;
}

async function readControl(runDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(runDir, "runtime-control.json"), "utf-8")) as Record<string, unknown>;
}

/** What a real controller does when it reads the cancel request: settle, then exit. */
async function settleControl(runDir: string, missionId: string, runId: string, status: string, stopCode: string): Promise<void> {
  const control = RuntimeControlSchema.parse({
    ...(await readControl(runDir)),
    mission_id: missionId,
    run_id: runId,
    status,
    stop_code: stopCode,
    heartbeat_at: iso(NOW),
    settlement_confirmed: true,
  });
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify(control), "utf-8");
}

/* ------------------------------------------------------------- target selection */

describe("uh kill target resolution", () => {
  test("a run id may be given as a unique prefix and needs no artifact root", async () => {
    await seedRun({ missionId: "plain", runId: "20260922T101500Z-aa11aa", controllerPid: 4242 });
    await seedRun({ missionId: "plain", runId: "20260922T101500Z-bb22bb", controllerPid: 4343 });

    const targets = await resolveKillTargets(ROOT, { runId: "20260922T101500Z-aa" }, { now: NOW });
    expect(targets.map((record) => record.run_id)).toEqual(["20260922T101500Z-aa11aa"]);
  });

  test("an ambiguous prefix is refused and names every match", async () => {
    await seedRun({ missionId: "plain", runId: "20260922T101500Z-aa11aa", controllerPid: 4242 });
    await seedRun({ missionId: "plain", runId: "20260922T101500Z-aa22bb", controllerPid: 4343 });

    await expect(resolveKillTargets(ROOT, { runId: "20260922T101500Z-aa" }, { now: NOW }))
      .rejects
      .toThrowError(KillError);
    await expect(resolveKillTargets(ROOT, { runId: "20260922T101500Z-aa" }, { now: NOW }))
      .rejects
      .toThrow(/20260922T101500Z-aa11aa/);
  });

  test("an unknown run id is refused instead of silently doing nothing", async () => {
    await expect(resolveKillTargets(ROOT, { runId: "20260922T101500Z-never" }, { now: NOW }))
      .rejects
      .toThrow(/no run/);
  });

  test("role, mission, team and --all select through the registry", async () => {
    await seedWorker("backend", "20260922T102000Z-w1aaaa", 5001);
    await seedWorker("frontend", "20260922T102001Z-w2bbbb", 5002);
    await seedRun({ missionId: "solo", runId: "20260922T102002Z-s1cccc", controllerPid: 5003 });

    const state = world([[5001, 1], [5002, 1], [5003, 1]]);
    const options = { listProcesses: lister(state), now: NOW };
    expect((await resolveKillTargets(ROOT, { role: "backend" }, options)).map((r) => r.run_id))
      .toEqual(["20260922T102000Z-w1aaaa"]);
    expect((await resolveKillTargets(ROOT, { teamId: TEAM }, options)).map((r) => r.run_id).sort())
      .toEqual(["20260922T102000Z-w1aaaa", "20260922T102001Z-w2bbbb"]);
    expect((await resolveKillTargets(ROOT, { missionId: "solo" }, options)).map((r) => r.run_id))
      .toEqual(["20260922T102002Z-s1cccc"]);
    expect((await resolveKillTargets(ROOT, { all: true }, options))).toHaveLength(3);
  });

  test("--orphans selects only runs whose controller pid is gone", async () => {
    await seedRun({ missionId: "plain", runId: "20260922T103000Z-o1aaaa", controllerPid: 6001 });
    await seedRun({ missionId: "plain", runId: "20260922T103001Z-o2bbbb", controllerPid: 6002 });
    const orphans = await resolveKillTargets(ROOT, { orphans: true }, {
      listProcesses: lister(world([[6002, 1]])), now: NOW,
    });
    expect(orphans.map((record) => record.run_id)).toEqual(["20260922T103000Z-o1aaaa"]);
  });

  test("settled runs are never selected by a selector", async () => {
    await seedRun({ missionId: "plain", runId: "20260922T103100Z-f1aaaa", controllerPid: 6101, status: "passed" });
    await seedRun({ missionId: "plain", runId: "20260922T103101Z-f2bbbb", controllerPid: 6102 });
    const targets = await resolveKillTargets(ROOT, { all: true }, {
      listProcesses: lister(world([[6102, 1]])), now: NOW,
    });
    expect(targets.map((record) => record.run_id)).toEqual(["20260922T103101Z-f2bbbb"]);
  });

  test("no selector at all is a usage error", async () => {
    await expect(killRuns(ROOT, {})).rejects.toThrowError(KillError);
  });

  test("a run's cancel root is its artifact root, read off the registry control path", async () => {
    await seedWorker("backend", "20260922T103200Z-r1aaaa", 7001);
    const [record] = await resolveKillTargets(ROOT, { role: "backend" }, { now: NOW });
    expect(runRootForRecord(ROOT, record)).toBe(workerArtifactRoot("backend"));

    await seedRun({ missionId: "plain", runId: "20260922T103201Z-r2bbbb", controllerPid: 7002 });
    const [plain] = await resolveKillTargets(ROOT, { runId: "20260922T103201Z-r2bbbb" }, { now: NOW });
    expect(runRootForRecord(ROOT, plain)).toBe(ROOT);
  });
});

/* ---------------------------------------------------------------- live stops */

describe("uh kill live runs", () => {
  test("graceful: cancels at the run's own root, waits for its tree, and never signals a process", async () => {
    const runId = "20260922T104000Z-g1aaaa";
    const runDir = await seedWorker("backend", runId, 4242);
    const state = world([[4242, 1], [4243, 4242], [4244, 4243]]);
    const killed: number[] = [];
    const cancelCalls: Array<{ root: string; mission: string; run: string }> = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 2_000,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async (root, mission, run) => {
        cancelCalls.push({ root, mission, run });
        await settleControl(runDir, mission, run, "cancelled", "cancelled");
        for (const pid of [4242, 4243, 4244]) state.alive.delete(pid);
        return { ok: true, status: "cancelled" };
      },
    });

    expect(cancelCalls).toEqual([{ root: workerArtifactRoot("backend"), mission: TEAM, run: runId }]);
    expect(killed).toEqual([]);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({
      run_id: runId,
      outcome: "cancelled_gracefully",
      team: { mission_id: TEAM, role: "backend" },
      surviving_pids: [],
    });
    expect(report.exit_code).toBe(0);
    expect(report.counts.cancelled_gracefully).toBe(1);

    const entry = await readRegistryEntry(runId);
    expect(entry).toMatchObject({ status: "cancelled", stop_code: "cancelled" });
    expect(typeof entry.settled_at).toBe("string");
    // Kill never rewrites a control file the controller settled for itself.
    const control = await readControl(runDir);
    expect(control.status).toBe("cancelled");
    expect(control.stop_reason).toBeUndefined();
  });

  test("forced: escalates to a tree kill of the controller once the wait expires", async () => {
    const runId = "20260922T104100Z-h1aaaa";
    const runDir = await seedRun({ missionId: "plain", runId, controllerPid: 8001, heartbeatMs: NOW - 90_000 });
    const state = world([[8001, 1], [8002, 8001]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 40,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      // A wedged controller: the cancel request never settles the run.
      cancelRun: async () => ({ ok: false, status: "running" }),
    });

    expect(killed).toEqual([8001]);
    expect(report.entries[0]).toMatchObject({
      run_id: runId,
      outcome: "force_killed",
      tree_pids: [8001, 8002],
      surviving_pids: [],
    });
    expect(state.alive.size).toBe(0);
    expect(report.exit_code).toBe(0);
    expect(report.counts.force_killed).toBe(1);
    await expect(readRegistryEntry(runId)).resolves.toMatchObject({ status: "cancelled", stop_code: "cancelled" });
    // The dead controller cannot settle its own record, so kill writes the receipt.
    await expect(readControl(runDir)).resolves.toMatchObject({
      status: "cancelled",
      stop_code: "cancelled",
      settlement_confirmed: true,
    });
  });

  test("--force skips the polite cancel and goes straight to the tree", async () => {
    const runId = "20260922T104200Z-h2aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 8101 });
    const state = world([[8101, 1], [8102, 8101]]);
    const killed: number[] = [];
    let cancelled = 0;

    const report = await killRuns(ROOT, {
      runId,
      force: true,
      waitMs: 5_000,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async () => { cancelled += 1; return { ok: true, status: "cancelled" }; },
    });

    expect(cancelled).toBe(0);
    expect(killed).toEqual([8101]);
    expect(report.entries[0].outcome).toBe("force_killed");
  });

  test("a survivor is reported with its pids and fails the command", async () => {
    const runId = "20260922T104300Z-i1aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 8201 });
    const state = world([[8201, 1], [8202, 8201]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 20,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      // Nothing dies, not even under SIGKILL.
      killProcess: killer(state, killed, { removesTree: false }),
      cancelRun: async () => ({ ok: false, status: "running" }),
    });

    expect(report.entries[0]).toMatchObject({
      run_id: runId,
      outcome: "still_alive",
      surviving_pids: [8201, 8202],
    });
    expect(report.exit_code).toBe(1);
    expect(formatKillReport(report)).toContain("still_alive");
    // A run that is not provably dead keeps its live registry entry.
    await expect(readRegistryEntry(runId)).resolves.not.toHaveProperty("settled_at");
  });

  test("only processes inside the controller's own tree are ever signalled", async () => {
    const runId = "20260922T104400Z-j1aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 9001 });
    const state = world([
      [9001, 1], [9002, 9001], [9003, 9002],
      // Somebody else's tree, plus this test runner itself.
      [process.pid, 1], [9101, process.pid], [9102, 4],
    ]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 20,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed, { removesTree: false }),
      cancelRun: async () => ({ ok: false, status: "running" }),
    });

    expect(killed).toEqual([9001]);
    for (const pid of [process.pid, 9101, 9102]) expect(killed).not.toContain(pid);
    expect(state.alive.has(process.pid)).toBe(true);
    expect(state.alive.has(9101)).toBe(true);
    expect(report.entries[0].outcome).toBe("still_alive");
  });

  test("a detached runtime that outlives its controller is killed by pid, not by guesswork", async () => {
    const runId = "20260922T104500Z-j2aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 9201 });
    const state = world([[9201, 1], [9202, 9201], [9301, 1]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 20,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      // The controller honours the cancel but its child does not.
      cancelRun: async () => { state.alive.delete(9201); return { ok: true, status: "cancelled" }; },
    });

    expect(killed).toEqual([9202]);
    expect(state.alive.has(9301)).toBe(true);
    expect(report.entries[0]).toMatchObject({ outcome: "force_killed", surviving_pids: [] });
  });

  test("a cancel that throws still escalates to the forced kill", async () => {
    const runId = "20260922T104600Z-j3aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 9401 });
    const state = world([[9401, 1]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId,
      waitMs: 20,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async () => { throw new Error("Runtime controller heartbeat is stale; cancellation is not confirmed"); },
    });

    expect(killed).toEqual([9401]);
    expect(report.entries[0].outcome).toBe("force_killed");
    expect(report.entries[0].detail).toContain("heartbeat is stale");
  });

  test("a selector that matches nothing is a no-op, not a failure", async () => {
    const report = await killRuns(ROOT, {
      all: true,
      now: NOW,
      listProcesses: lister(world([])),
      killProcess: async () => { throw new Error("must not be called"); },
    });
    expect(report.entries).toEqual([]);
    expect(report.exit_code).toBe(0);
  });
});

/* -------------------------------------------------------------------- orphans */

describe("uh kill orphans", () => {
  test("an orphaned run is settled with stop_code controller_lost and no process is looked for", async () => {
    const runId = "20260922T105000Z-k1aaaa";
    const runDir = await seedRun({
      missionId: "plain", runId, controllerPid: 999_999, session: true,
    });
    const killed: number[] = [];
    let cancelCalls = 0;

    const report = await killRuns(ROOT, {
      runId,
      now: NOW,
      // The controller is gone; the machine lister must not even be consulted
      // for a tree to kill, and nothing may be signalled.
      listProcesses: lister(world([])),
      killProcess: async (pid) => { killed.push(pid); },
      cancelRun: async () => { cancelCalls += 1; return { ok: true, status: "cancelled" }; },
    });

    expect(cancelCalls).toBe(0);
    expect(killed).toEqual([]);
    expect(report.entries[0]).toMatchObject({
      run_id: runId,
      outcome: "orphan_settled",
      stop_code: "controller_lost",
      surviving_pids: [],
    });
    expect(report.exit_code).toBe(0);

    // The canonical settlement ran through reconcileRuntimeSettlement.
    const result = parse(await readFile(path.join(runDir, "runtime-result.yaml"), "utf-8")) as Record<string, unknown>;
    expect(result.status).toBe("failed");
    expect((await readControl(runDir))).toMatchObject({ status: "failed", stop_code: "controller_lost" });
    expect((await readRegistryEntry(runId))).toMatchObject({ status: "failed", stop_code: "controller_lost" });
  });

  test("a guardian receipt that already exists is reconciled untouched", async () => {
    const runId = "20260922T105100Z-k2aaaa";
    const runDir = await seedRun({
      missionId: "plain",
      runId,
      controllerPid: 999_998,
      session: true,
      status: "failed",
      controlOverrides: { stop_code: "controller_lost", settlement_confirmed: true, stop_reason: "Controller exited before run settlement" },
    });
    const before = await readFile(path.join(runDir, "runtime-control.json"), "utf-8");

    const report = await killRuns(ROOT, {
      runId, now: NOW,
      listProcesses: lister(world([])),
      killProcess: async () => { throw new Error("must not be called"); },
    });

    expect(report.entries[0].outcome).toBe("orphan_settled");
    expect(await readFile(path.join(runDir, "runtime-control.json"), "utf-8")).toBe(before);
  });

  test("--orphans settles every orphan at once and leaves live runs alone", async () => {
    const deadOne = "20260922T105200Z-l1aaaa";
    const deadTwo = "20260922T105201Z-l2bbbb";
    await seedRun({ missionId: "plain", runId: deadOne, controllerPid: 999_997, session: true });
    await seedRun({ missionId: "plain", runId: deadTwo, controllerPid: 999_996, session: true });
    await seedRun({ missionId: "plain", runId: "20260922T105202Z-l3cccc", controllerPid: 9501 });
    const state = world([[9501, 1]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      orphans: true,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async () => { throw new Error("must not be called"); },
    });

    expect(report.entries.map((entry) => entry.run_id).sort()).toEqual([deadOne, deadTwo]);
    expect(report.entries.every((entry) => entry.outcome === "orphan_settled")).toBe(true);
    expect(killed).toEqual([]);
    expect(state.alive.has(9501)).toBe(true);
    await expect(readRegistryEntry("20260922T105202Z-l3cccc")).resolves.not.toHaveProperty("settled_at");
  });

  test("an orphan with processes still parented to its dead controller is not written off", async () => {
    const runId = "20260922T105300Z-l4dddd";
    const runDir = await seedRun({ missionId: "plain", runId, controllerPid: 999_995, session: true });
    // Windows keeps the stale ParentProcessId, so the runtime is still attributable.
    const state = world([[9701, 999_995]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId, now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
    });

    expect(killed).toEqual([]);
    expect(report.entries[0]).toMatchObject({ outcome: "still_alive", surviving_pids: [999_995, 9701] });
    expect(report.exit_code).toBe(1);
    await expect(readRegistryEntry(runId)).resolves.not.toHaveProperty("settled_at");
    expect((await readControl(runDir)).stop_code).toBeUndefined();

    // --force closes the record anyway; the operator owns the leftover process.
    const forced = await killRuns(ROOT, {
      runId, force: true, now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
    });
    expect(forced.entries[0]).toMatchObject({ outcome: "orphan_settled", stop_code: "controller_lost" });
    expect(killed).toEqual([]);
    expect(await readControl(runDir)).toMatchObject({ status: "failed", stop_code: "controller_lost" });
  });
});

/* --------------------------------------------------------------- team cascade */

describe("uh kill team cascade", () => {
  test("workers are stopped first, then the shared team controller, then team-state is marked cancelled", async () => {
    const workerOne = "20260922T110000Z-t1aaaa";
    const workerTwo = "20260922T110001Z-t2bbbb";
    const directoryOne = await seedWorker("backend", workerOne, 2000);
    const directoryTwo = await seedWorker("frontend", workerTwo, 2000);
    await seedTeamState([
      { role: "backend", run_id: workerOne },
      { role: "frontend", run_id: workerTwo },
    ]);
    // One controller process hosts both workers, each with its own runtime child.
    const state = world([[2000, 1], [2001, 2000], [2002, 2000], [2003, 2000]]);
    const killed: number[] = [];
    const order: string[] = [];

    const report = await killRuns(ROOT, {
      teamId: TEAM,
      waitMs: 200,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async (root, mission, run) => {
        order.push(run);
        // The controller cancels just this worker's runtime child, then keeps
        // running so it can integrate — exactly the leader we must not let through.
        if (run === workerOne) {
          await settleControl(directoryOne, mission, run, "cancelled", "cancelled");
          state.alive.delete(2001);
        } else {
          await settleControl(directoryTwo, mission, run, "cancelled", "cancelled");
          state.alive.delete(2002);
        }
        return { ok: true, status: "cancelled" };
      },
    });

    expect(order).toEqual([workerOne, workerTwo]);
    expect(report.entries.map((entry) => [entry.kind, entry.run_id])).toEqual([
      ["run", workerOne],
      ["run", workerTwo],
      ["team-controller", "controller:2000"],
    ]);
    expect(report.entries[0].outcome).toBe("cancelled_gracefully");
    expect(report.entries[1].outcome).toBe("cancelled_gracefully");
    expect(report.entries[2]).toMatchObject({ outcome: "force_killed", mission_id: TEAM });
    expect(killed).toEqual([2000]);
    expect(state.alive.size).toBe(0);

    const statePath = report.teams[0].path;
    expect(report.teams[0]).toMatchObject({ team_id: TEAM, run_id: PARENT_RUN, marked: true });
    const teamState = CanonicalTeamStateSchema.parse(JSON.parse(await readFile(statePath, "utf-8"))) as CanonicalTeamState & {
      admission_blocked_reason?: string;
    };
    expect(teamState.status).toBe("blocked");
    expect(teamState.leader.status).toBe("blocked");
    expect(teamState.workers.every((worker) => worker.status === "blocked" || worker.status === "failed")).toBe(true);
    expect(teamState.admission_blocked_reason).toMatch(/cancel/i);
    expect(teamState.workers.every((worker) => worker.blocked_reason === undefined || /cancel/i.test(worker.blocked_reason ?? ""))).toBe(true);
  });

  test("a worker killed on its own leaves the shared controller and its siblings running", async () => {
    const workerOne = "20260922T110100Z-t3aaaa";
    const workerTwo = "20260922T110101Z-t4bbbb";
    const directoryOne = await seedWorker("backend", workerOne, 2000);
    await seedWorker("frontend", workerTwo, 2000);
    const state = world([[2000, 1], [2001, 2000], [2002, 2000]]);
    const killed: number[] = [];

    const report = await killRuns(ROOT, {
      runId: workerOne,
      waitMs: 200,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, killed),
      cancelRun: async (root, mission, run) => {
        await settleControl(directoryOne, mission, run, "cancelled", "cancelled");
        state.alive.delete(2001);
        return { ok: true, status: "cancelled" };
      },
    });

    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].outcome).toBe("cancelled_gracefully");
    expect(killed).toEqual([]);
    expect(state.alive.has(2000)).toBe(true);
    expect(state.alive.has(2002)).toBe(true);
    expect(report.teams).toEqual([]);
  });

  test("--team with no live workers still reports nothing to do", async () => {
    const report = await killRuns(ROOT, {
      teamId: "no-such-team",
      now: NOW,
      listProcesses: lister(world([])),
      killProcess: async () => { throw new Error("must not be called"); },
    });
    expect(report.entries).toEqual([]);
    expect(report.exit_code).toBe(0);
  });
});

/* ------------------------------------------------------------------ report shape */

describe("uh kill report", () => {
  test("the JSON report is a stable contract", async () => {
    const runId = "20260922T111000Z-m1aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 3001 });
    const state = world([[3001, 1]]);
    const report = await killRuns(ROOT, {
      runId,
      waitMs: 20,
      pollIntervalMs: 5,
      now: NOW,
      listProcesses: lister(state),
      killProcess: killer(state, []),
      cancelRun: async () => ({ ok: false, status: "running" }),
    });
    expect(report.schema_version).toBe("uh.kill.v0");
    expect(report.project_root).toBe(ROOT);
    expect(Object.keys(report.counts).sort()).toEqual([
      "cancelled_gracefully", "error", "force_killed", "matched", "orphan_settled", "skipped_settled", "still_alive",
    ]);
    expect(report.exit_code).toBe(0);
    expect(formatKillReport(report)).toContain(runId);
    expect(formatKillReport(report)).toContain("force_killed");
    expect(formatKillReport(report)).toContain("pids=3001");
  });

  test("a settled run is reported as skipped rather than killed", async () => {
    const runId = "20260922T111100Z-m2aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 3101, status: "passed" });
    const report = await killRuns(ROOT, {
      runId,
      now: NOW,
      listProcesses: lister(world([[3101, 1]])),
      killProcess: async () => { throw new Error("must not be called"); },
    });
    expect(report.entries[0].outcome).toBe("skipped_settled");
    expect(report.exit_code).toBe(0);
  });
});

/* --------------------------------------------------------------- real process lister */

describe("uh kill default killer safety", () => {
  test("the default killer refuses a non-pid before touching anything", async () => {
    const { defaultProcessKiller } = await import("../src/harness/kill.js");
    await expect(defaultProcessKiller(0)).rejects.toThrow(/pid/i);
    await expect(defaultProcessKiller(-1)).rejects.toThrow(/pid/i);
    await expect(defaultProcessKiller(Number.NaN)).rejects.toThrow(/pid/i);
  });
});

/* ------------------------------------------------------------------ CLI contract */

function runKill(args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync("bun", ["x", "tsx", CLI, ...args], {
    encoding: "utf-8",
    timeout: 90_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  }) as { status: number | null; stdout: string; stderr: string };
}

describe("uh kill CLI", () => {
  test("advertises the selectors in --help", async () => {
    const help = runKill(["kill", "--help"]);
    expect(help.status).toBe(0);
    for (const flag of ["--role", "--mission", "--team", "--all", "--orphans", "--force", "--wait-ms", "--json"]) {
      expect(help.stdout).toContain(flag);
    }
  }, 90_000);

  test("settles an orphan from the project root and exits 0", async () => {
    const runId = "20260922T112000Z-c1aaaa";
    await seedRun({ missionId: "plain", runId, controllerPid: 2_147_483_646, session: true });

    const killed = runKill(["kill", runId, "--root", ROOT, "--json"]);
    expect(killed.status).toBe(0);
    const report = JSON.parse(killed.stdout) as { entries: Array<{ run_id: string; outcome: string; stop_code?: string }> };
    expect(report.entries[0]).toMatchObject({ run_id: runId, outcome: "orphan_settled", stop_code: "controller_lost" });
    await expect(readRegistryEntry(runId)).resolves.toMatchObject({ status: "failed", stop_code: "controller_lost" });
  }, 90_000);

  test("refuses an unknown run id with exit 1", async () => {
    const missing = runKill(["kill", "20260922T112100Z-none", "--root", ROOT]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/no run/);
  }, 90_000);
});
