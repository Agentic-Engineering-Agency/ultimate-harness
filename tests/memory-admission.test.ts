/**
 * Worker memory admission across teams.
 *
 * A team that declares no memory limit is admitted against a per-worker cap
 * resolved from this project's recorded run peaks (or a 700 MB fallback). Two
 * teams launched from the same project root decide under one per-project lock
 * and subtract each other's reservations from the same free-memory reading, and
 * a wave with no headroom waits for it to free instead of failing outright.
 * A reservation stops counting as soon as its worker's runtime process has
 * started and reported, so a started worker's memory is never counted twice.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mapResourceWaves,
  resolveTeamResources,
  workerAdmissionDir,
} from "../src/harness/runtime-resources.js";
import {
  runTeamMission,
  type GitOps,
  type MergeOutcome,
  type TeamMission,
  type TeamRuntimeRunResult,
  type VerifyMissionLike,
} from "../src/harness/team-run.js";
import { registerLiveRun } from "../src/harness/live-runs.js";

const MB = 1024 * 1024;

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-memory-admission-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

async function writeControl(
  root: string,
  missionId: string,
  runId: string,
  runtime: string,
  peakMb: number,
  status = "passed",
): Promise<void> {
  const dir = join(root, ".harness", "missions", missionId, "runs", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0",
    mission_id: missionId,
    run_id: runId,
    runtime,
    controller_pid: 4242,
    started_at: "2026-09-20T00:00:00.000Z",
    heartbeat_at: "2026-09-20T00:01:00.000Z",
    status,
    turns: 1,
    denials: 0,
    inflight_tools: 0,
    peak_memory_bytes: Math.round(peakMb * MB),
  }), "utf-8");
}

/** A clock whose sleeps advance time, so admission timeouts are deterministic. */
function virtualClock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let clock = 0;
  return {
    now: () => clock,
    sleep: async (ms: number) => { clock += ms; },
  };
}

/* ------------------------------------------------------ memory defaults */

describe("worker memory defaults", () => {
  test("an undeclared cap is the median peak of the runtime's recent settled runs", async () => {
    await writeControl(ROOT, "m", "run-1", "command-code", 300);
    await writeControl(ROOT, "m", "run-2", "command-code", 350);
    await writeControl(ROOT, "m", "run-3", "command-code", 400);
    // A different runtime, a running run, and a settled run with no peak never
    // contribute to this runtime's median.
    await writeControl(ROOT, "m", "run-4", "codex", 9000);
    await writeControl(ROOT, "m", "run-5", "command-code", 9999, "running");

    const resolved = await resolveTeamResources(ROOT, ["command-code"]);
    expect(resolved.worker_memory_mb).toBe(350);
    expect(resolved.worker_memory_source).toBe("recorded_median");
    expect(resolved.worker_memory_sample_runs).toBe(3);
    expect(resolved.reserve_memory_mb).toBe(1024);
    expect(resolved.admission_timeout_ms).toBe(20 * 60 * 1000);
  });

  test("no recorded peak falls back to 700 MB and a declared cap always wins", async () => {
    const fallback = await resolveTeamResources(ROOT, ["command-code"]);
    expect(fallback.worker_memory_mb).toBe(700);
    expect(fallback.worker_memory_source).toBe("fallback");
    expect(fallback.worker_memory_sample_runs).toBe(0);

    const declared = await resolveTeamResources(ROOT, ["command-code"], { worker_memory_mb: 256 });
    expect(declared.worker_memory_mb).toBe(256);
    expect(declared.worker_memory_source).toBe("declared");
  });
});

/* --------------------------------------------------- per-project admission */

describe("per-project worker admission", () => {
  const limits = {
    max_parallel: 4,
    worker_memory_mb: 700,
    reserve_memory_mb: 1024,
    admission_timeout_ms: 25_000,
  };

  test("two teams deciding at once do not both admit when only one fits", async () => {
    const { now, sleep } = virtualClock();
    // 1024 MB reserve + one 700 MB worker fits exactly; two never do.
    const availableBytes = () => 1724 * MB;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });

    const team = (id: string) => mapResourceWaves([id], limits, async (item) => {
      await gate;
      return { id: item, admitted: true };
    }, {
      availableBytes, now, sleep, pollIntervalMs: 10_000, root: ROOT,
      costOf: async () => 0,
      blocked: async (item) => ({ id: item, admitted: false }),
    });

    const guard = setTimeout(() => releaseGate(), 5_000);
    try {
      const a = team("a");
      const b = team("b");
      // The admitted team stays reserved until the other has finished waiting.
      void Promise.race([a, b]).then(() => releaseGate(), () => releaseGate());
      const [ra, rb] = await Promise.all([a, b]);
      const outcomes = [...ra, ...rb];
      expect(outcomes.filter((entry) => entry.admitted)).toHaveLength(1);
      expect(outcomes.filter((entry) => !entry.admitted)).toHaveLength(1);
      // Reservations are released once the admitted wave settles.
      expect(await readdir(join(workerAdmissionDir(ROOT), "reservations"))).toEqual([]);
    } finally {
      clearTimeout(guard);
    }
  });

  test("a wave with no headroom waits and admits once memory frees", async () => {
    const { now, sleep } = virtualClock();
    let reads = 0;
    const availableBytes = () => (reads++ === 0 ? 1024 * MB : 1724 * MB);
    const admitted: string[] = [];
    const blocked: string[] = [];
    const waits: string[] = [];

    await mapResourceWaves(["w1"], { ...limits, admission_timeout_ms: 120_000 }, async (item) => {
      admitted.push(item);
      return item;
    }, {
      availableBytes, now, sleep, pollIntervalMs: 10_000, root: ROOT,
      onWait: (note) => { waits.push(note); },
      costOf: async () => 0,
      blocked: async (item) => { blocked.push(item); return item; },
    });

    expect(admitted).toEqual(["w1"]);
    expect(blocked).toEqual([]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatch(/wait 1 for worker memory headroom/);
  });

  test("the timeout blocks with the current admission reason", async () => {
    const { now, sleep } = virtualClock();
    const waits: string[] = [];
    let reason: string | undefined;

    const results = await mapResourceWaves(["w1"], limits, async () => "ran", {
      availableBytes: () => 1024 * MB, now, sleep, pollIntervalMs: 10_000, root: ROOT,
      onWait: (note) => { waits.push(note); },
      costOf: async () => 0,
      blocked: async (_item, blockedReason) => { reason = blockedReason; return "blocked"; },
    });

    expect(results).toEqual(["blocked"]);
    expect(reason).toMatch(/Insufficient resource headroom to launch one worker within its memory cap/);
    expect(waits).toHaveLength(3);
  });
});

/* ------------------------------------- started workers stop counting again */

describe("reservations stop counting once their worker has started", () => {
  const limits = {
    max_parallel: 4,
    worker_memory_mb: 700,
    reserve_memory_mb: 1024,
    admission_timeout_ms: 25_000,
  };

  async function writeReservation(root: string, pid: number, reservedMb = 700): Promise<void> {
    const dir = join(workerAdmissionDir(root), "reservations");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `res-${pid}-test.json`), JSON.stringify({
      reserved_mb: reservedMb,
      created_at: new Date(0).toISOString(),
      release_after_ms: 60_000,
      pid,
      worker: "slot-0",
    }), "utf-8");
  }

  /** A live run whose worker's runtime process has started and reported a heartbeat. */
  async function reportStartedWorker(root: string, runId: string, pid: number): Promise<void> {
    await registerLiveRun({
      projectRoot: root, artifactRoot: root, runId,
      missionId: "team-mission", runtime: "hermes", controllerPid: pid,
    });
    const dir = join(root, ".harness", "missions", "team-mission", "runs", runId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "runtime-control.json"), JSON.stringify({
      schema_version: "uh.runtime-control.v0",
      mission_id: "team-mission", run_id: runId, runtime: "hermes",
      controller_pid: pid,
      started_at: "2026-09-20T00:00:00.000Z",
      heartbeat_at: "2026-09-20T00:00:01.000Z",
      status: "running", turns: 1, denials: 0, inflight_tools: 0,
    }), "utf-8");
  }

  test("a reservation whose worker has reported no longer counts", async () => {
    const { now, sleep } = virtualClock();
    await writeReservation(ROOT, 4242);
    await reportStartedWorker(ROOT, "20260920T000001Z-abc123", 4242);
    const admitted: string[] = [];

    // 1024 MB reserve + one 700 MB worker fits exactly, but only once the
    // reservation belonging to the started worker stops counting.
    await mapResourceWaves(["w1"], limits, async (item) => { admitted.push(item); return item; }, {
      availableBytes: () => 1724 * MB, now, sleep, pollIntervalMs: 10_000, root: ROOT,
      costOf: async () => 0,
      blocked: async (item) => item,
    });

    expect(admitted).toEqual(["w1"]);
    expect(await readdir(join(workerAdmissionDir(ROOT), "reservations"))).toEqual([]);
  });

  test("a reservation whose worker has not reported is still counted", async () => {
    const { now, sleep } = virtualClock();
    await writeReservation(ROOT, 9999);
    const blocked: string[] = [];

    await mapResourceWaves(["w1"], { ...limits, admission_timeout_ms: 1 }, async () => "ran", {
      availableBytes: () => 1724 * MB, now, sleep, pollIntervalMs: 10_000, root: ROOT,
      costOf: async () => 0,
      blocked: async (item) => { blocked.push(item); return "blocked"; },
    });

    expect(blocked).toEqual(["w1"]);
  });
});

/* ------------------------------------------------------ integration report */

describe("team integration report memory admission", () => {
  async function seedMissionPacket(root: string, missionId: string): Promise<void> {
    const dir = join(root, ".harness", "missions", missionId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "mission.yaml"), [
      "schema_version: uh.mission.v0",
      `id: ${missionId}`,
      "title: Team Mission",
      "workflow_profile: staged",
      "objective: report admission",
    ].join("\n") + "\n", "utf-8");
  }

  function fakeGitOps(): GitOps {
    return {
      async addWorktree(_root, _branch, worktreePath) { await mkdir(worktreePath, { recursive: true }); },
      async removeWorktree() { /* no-op */ },
      async merge(): Promise<MergeOutcome> { return { conflicted: false, conflictPaths: [], note: "merged" }; },
      async diffFiles() { return []; },
      async deleteBranch() { /* no-op */ },
      async commitAll() { /* no-op */ },
    };
  }

  const passingVerifier = async (): Promise<VerifyMissionLike> => ({
    status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
    acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
  });

  test("the report shows the resolved memory values used for admission", async () => {
    await seedMissionPacket(ROOT, "team-mission");
    await writeControl(ROOT, "history", "run-1", "hermes", 512);
    const packet: TeamMission = {
      id: "team-mission",
      team: { workers: [{ role: "backend", adapter: "hermes" }], leader: { adapter: "hermes" } },
    };
    const result = await runTeamMission(packet, ROOT, {
      gitOps: fakeGitOps(),
      runnerFor: () => async (): Promise<TeamRuntimeRunResult> => ({
        exitCode: 0, stdout: "", stderr: "", result: { status: "passed" },
      }),
      verifier: passingVerifier,
      // Explicit headroom: the resolved 512 MB cap is what this test asserts,
      // not whatever the host's real free memory happens to be.
      availableBytes: () => 256 * 1024 * 1024 * 1024,
    });

    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toContain("Worker memory admission: 512 MB per worker (median of 1 recorded run peak)");
    expect(report).toContain("Memory reserve: 1024 MB");
    expect(report).toContain("Admission timeout: 20 min");
  });
});
