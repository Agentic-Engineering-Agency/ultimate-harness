/**
 * UH-73 — Staged workflow tests.
 *
 * Five phases, bounded fix loop, and a team-shape interleave with mocked
 * adapters. Real adapter dispatch is exercised by `team-run.test.ts`; this
 * file is purely about the phase sequencing + retry logic.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_ITERATIONS,
  runStagedWorkflow,
  type RunStagedOptions,
  type SinglePhaseInput,
  type SinglePhaseOutput,
  type StagedMission,
  type StagedPhaseName,
  type StagedPhaseOutcome,
} from "../src/harness/workflow.js";
import type { TeamRunResult, VerifyMissionLike } from "../src/harness/team-run.js";

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-workflow-staged-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ---------------------------------------------------------------- helpers  */

function recordingRunner(log: { name: StagedPhaseName; iteration: number }[]): (input: SinglePhaseInput) => Promise<SinglePhaseOutput> {
  return async (input) => {
    log.push({ name: input.phase, iteration: input.iteration });
    return { status: "passed", artifact: `[${input.phase} #${input.iteration}] ok` };
  };
}

function constantVerifier(status: VerifyMissionLike["status"]): RunStagedOptions["verifier"] {
  return async (_root, _missionId) => ({
    status,
    path: "/fake/verification.yaml",
    checks_total: 1,
    checks_passed: status === "passed" ? 1 : 0,
    checks_failed: status === "failed" ? 1 : 0,
    checks_blocked: status === "blocked" ? 1 : 0,
    acceptance_total: 0,
    acceptance_passed: 0,
    acceptance_failed_block: 0,
    acceptance_warn_failed: 0,
    acceptance_blocked: 0,
  });
}

function scriptedVerifier(seq: VerifyMissionLike["status"][]): RunStagedOptions["verifier"] {
  let i = 0;
  return async () => {
    const status = seq[Math.min(i, seq.length - 1)];
    i += 1;
    return {
      status,
      path: "/fake/verification.yaml",
      checks_total: 1,
      checks_passed: status === "passed" ? 1 : 0,
      checks_failed: status === "failed" ? 1 : 0,
      checks_blocked: status === "blocked" ? 1 : 0,
      acceptance_total: 0,
      acceptance_passed: 0,
      acceptance_failed_block: 0,
      acceptance_warn_failed: 0,
      acceptance_blocked: 0,
    };
  };
}

function phaseStatuses(phases: StagedPhaseOutcome[]): Array<[string, number, string]> {
  return phases.map((p) => [p.name, p.iteration, p.status]);
}

/* -------------------------------------------------------------- single  */

describe("runStagedWorkflow — single shape", () => {
  test("5-phase happy path runs Plan → PRD → Execute → Verify and skips Fix", async () => {
    const log: { name: StagedPhaseName; iteration: number }[] = [];
    const mission: StagedMission = { id: "m1" };
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: recordingRunner(log),
      verifier: constantVerifier("passed"),
    });
    expect(result.status).toBe("passed");
    expect(result.fixIterations).toBe(0);
    expect(phaseStatuses(result.phases)).toEqual([
      ["Plan", 1, "passed"],
      ["PRD", 1, "passed"],
      ["Execute", 1, "passed"],
      ["Verify", 1, "passed"],
    ]);
    // Recorded runner saw Plan, PRD, Execute (Verify uses the verifier, not the runner).
    expect(log.map((e) => e.name)).toEqual(["Plan", "PRD", "Execute"]);
    // Artifacts on disk:
    const plan = await readFile(join(ROOT, ".harness", "missions", "m1", "plan.md"), "utf-8");
    expect(plan).toMatch(/\[Plan #1\]/);
    const prd = await readFile(join(ROOT, ".harness", "missions", "m1", "prd.md"), "utf-8");
    expect(prd).toMatch(/\[PRD #1\]/);
    const runtimeFinal = await readFile(join(ROOT, ".harness", "missions", "m1", "runtime-final.txt"), "utf-8");
    expect(runtimeFinal).toMatch(/\[Execute #1\]/);
    const verifyReport = await readFile(join(ROOT, ".harness", "missions", "m1", "verify-report.md"), "utf-8");
    expect(verifyReport).toMatch(/Status: passed/);
  });

  test("bounded fix loop: verify-fail then verify-pass returns passed in one Fix iteration", async () => {
    const log: { name: StagedPhaseName; iteration: number }[] = [];
    const mission: StagedMission = { id: "m2" };
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: recordingRunner(log),
      verifier: scriptedVerifier(["failed", "passed"]),
    });
    expect(result.status).toBe("passed");
    expect(result.fixIterations).toBe(1);
    const fixReport = await readFile(join(ROOT, ".harness", "missions", "m2", "fix-report.md"), "utf-8");
    expect(fixReport).toMatch(/# Fix iteration 1/);
    expect(phaseStatuses(result.phases)).toEqual([
      ["Plan", 1, "passed"],
      ["PRD", 1, "passed"],
      ["Execute", 1, "passed"],
      ["Verify", 1, "failed"],
      ["Fix", 1, "passed"],
      ["Verify", 2, "passed"],
    ]);
  });

  test("fix-cap reached: verify keeps failing past max_iterations -> blocked", async () => {
    const mission: StagedMission = { id: "m3", verification: { max_iterations: 1 } };
    const log: { name: StagedPhaseName; iteration: number }[] = [];
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: recordingRunner(log),
      verifier: constantVerifier("failed"),
    });
    expect(result.status).toBe("failed");
    expect(result.fixIterations).toBe(1);
    expect(phaseStatuses(result.phases)).toEqual([
      ["Plan", 1, "passed"],
      ["PRD", 1, "passed"],
      ["Execute", 1, "passed"],
      ["Verify", 1, "failed"],
      ["Fix", 1, "passed"],
      ["Verify", 2, "failed"],
    ]);
  });

  test("default max_iterations is 2 when mission.verification.max_iterations is undefined", async () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(2);
    const mission: StagedMission = { id: "m4" };
    const log: { name: StagedPhaseName; iteration: number }[] = [];
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: recordingRunner(log),
      verifier: constantVerifier("failed"),
    });
    expect(result.fixIterations).toBe(2);
    // Phase sequence: Plan, PRD, Execute, Verify-fail, Fix-1, Verify-fail, Fix-2, Verify-fail.
    expect(result.phases.filter((p) => p.name === "Verify")).toHaveLength(3);
    expect(result.phases.filter((p) => p.name === "Fix")).toHaveLength(2);
    expect(result.status).toBe("failed");
  });

  test("verify-blocked at cap returns blocked overall, not failed", async () => {
    const mission: StagedMission = { id: "m5", verification: { max_iterations: 0 } };
    const log: { name: StagedPhaseName; iteration: number }[] = [];
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: recordingRunner(log),
      verifier: constantVerifier("blocked"),
    });
    expect(result.fixIterations).toBe(0);
    expect(result.status).toBe("blocked");
  });

  test("failed Execute short-circuits before Verify ever runs", async () => {
    const mission: StagedMission = { id: "m6" };
    let verifierCalls = 0;
    const result = await runStagedWorkflow(mission, ROOT, {
      singlePhaseRunner: async (input) => {
        if (input.phase === "Execute") return { status: "failed", artifact: "boom" };
        return { status: "passed", artifact: `${input.phase} ok` };
      },
      verifier: async () => { verifierCalls += 1; return { status: "passed" } as VerifyMissionLike; },
    });
    expect(result.status).toBe("failed");
    expect(verifierCalls).toBe(0);
    expect(result.phases.map((p) => p.name)).toEqual(["Plan", "PRD", "Execute"]);
  });
});

/* ---------------------------------------------------------------- team  */

describe("runStagedWorkflow — team shape", () => {
  test("leader runs Plan/PRD/Verify/Fix; teamRunner handles Execute", async () => {
    const leaderLog: StagedPhaseName[] = [];
    const mission: StagedMission = {
      id: "team-mission",
      shape: "team",
      team: {
        workers: [
          { role: "backend", runtime: "hermes" },
          { role: "frontend", runtime: "codex" },
        ],
        leader: { runtime: "hermes", strategy: "merge" },
      },
    };
    let teamRunnerCalled = 0;
    const result = await runStagedWorkflow(mission, ROOT, {
      teamLeaderRunner: async (input) => {
        leaderLog.push(input.phase);
        return { status: "passed", artifact: `[leader/${input.phase}/${input.iteration}]` };
      },
      teamRunner: async (m, _root): Promise<TeamRunResult> => {
        teamRunnerCalled += 1;
        return {
          missionId: m.id,
          plan: { missionId: m.id, teamRoot: "/fake/team", workers: [], leader: { runtime: "hermes", strategy: "merge", worktreePath: "/fake/team/leader", branch: "uh/team/x/leader" }, integrationReportPath: "/fake/integration-report.md" },
          workers: [
            { plan: { role: "backend", runtime: "hermes", index: 1, id: "backend", worktreePath: "/fake/backend", branch: "uh/team/x/backend" }, exitCode: 0, status: "succeeded", filesTouched: ["src/a.ts"], finalSentinel: "backend done", merge: { conflicted: false, conflictPaths: [], note: "ok" }, integrated: true },
            { plan: { role: "frontend", runtime: "codex", index: 1, id: "frontend", worktreePath: "/fake/frontend", branch: "uh/team/x/frontend" }, exitCode: 0, status: "succeeded", filesTouched: ["src/b.ts"], finalSentinel: "frontend done", merge: { conflicted: false, conflictPaths: [], note: "ok" }, integrated: true },
          ],
          leaderRanVerification: false,
          verification: null,
          integrationReportPath: "/fake/integration-report.md",
          status: "passed",
          hadConflicts: false,
          retained: true,
        };
      },
      verifier: constantVerifier("passed"),
    });

    expect(teamRunnerCalled).toBe(1);
    expect(result.shape).toBe("team");
    expect(result.status).toBe("passed");
    expect(result.teamRun?.workers).toHaveLength(2);
    expect(leaderLog).toEqual(["Plan", "PRD"]);
    expect(phaseStatuses(result.phases)).toEqual([
      ["Plan", 1, "passed"],
      ["PRD", 1, "passed"],
      ["Execute", 1, "passed"],
      ["Verify", 1, "passed"],
    ]);
  });

  test("team-shape verify-fail then verify-pass routes Fix through the leader", async () => {
    const leaderLog: { phase: StagedPhaseName; iteration: number }[] = [];
    const mission: StagedMission = {
      id: "team-fix",
      shape: "team",
      verification: { max_iterations: 2 },
      team: {
        workers: [{ role: "backend", runtime: "hermes" }],
        leader: { runtime: "hermes", strategy: "merge" },
      },
    };
    const result = await runStagedWorkflow(mission, ROOT, {
      teamLeaderRunner: async (input) => {
        leaderLog.push({ phase: input.phase, iteration: input.iteration });
        return { status: "passed", artifact: `[leader/${input.phase}/${input.iteration}]` };
      },
      teamRunner: async (m, _root): Promise<TeamRunResult> => ({
        missionId: m.id,
        plan: { missionId: m.id, teamRoot: "/fake/team", workers: [], leader: { runtime: "hermes", strategy: "merge", worktreePath: "/fake/team/leader", branch: "uh/team/x/leader" }, integrationReportPath: "/fake/integration-report.md" },
        workers: [{ plan: { role: "backend", runtime: "hermes", index: 1, id: "backend", worktreePath: "/fake/backend", branch: "uh/team/x/backend" }, exitCode: 0, status: "succeeded", filesTouched: ["src/a.ts"], finalSentinel: "ok", merge: { conflicted: false, conflictPaths: [], note: "ok" }, integrated: true }],
        leaderRanVerification: false,
        verification: null,
        integrationReportPath: "/fake/integration-report.md",
        status: "passed",
        hadConflicts: false,
        retained: true,
      }),
      verifier: scriptedVerifier(["failed", "passed"]),
    });

    expect(result.status).toBe("passed");
    expect(result.fixIterations).toBe(1);
    expect(leaderLog.map((l) => `${l.phase}#${l.iteration}`)).toEqual([
      "Plan#1", "PRD#1", "Fix#1",
    ]);
  });

  test("team Execute failure propagates and skips Verify", async () => {
    const mission: StagedMission = {
      id: "team-fail",
      shape: "team",
      team: {
        workers: [{ role: "backend", runtime: "hermes" }],
        leader: { runtime: "hermes", strategy: "merge" },
      },
    };
    let verifierCalled = 0;
    const result = await runStagedWorkflow(mission, ROOT, {
      teamLeaderRunner: async (input) => ({ status: "passed", artifact: input.phase }),
      teamRunner: async (m, _root): Promise<TeamRunResult> => ({
        missionId: m.id,
        plan: { missionId: m.id, teamRoot: "/fake/team", workers: [], leader: { runtime: "hermes", strategy: "merge", worktreePath: "/fake/team/leader", branch: "uh/team/x/leader" }, integrationReportPath: "/fake/integration-report.md" },
        workers: [],
        leaderRanVerification: false,
        verification: null,
        integrationReportPath: "/fake/integration-report.md",
        status: "failed",
        hadConflicts: true,
        retained: true,
      }),
      verifier: async () => { verifierCalled += 1; return { status: "passed" } as VerifyMissionLike; },
    });
    expect(result.status).toBe("failed");
    expect(verifierCalled).toBe(0);
    expect(result.phases.map((p) => p.name)).toEqual(["Plan", "PRD", "Execute"]);
  });
});
