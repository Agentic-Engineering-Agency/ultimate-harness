/**
 * Team salvage — keep verified work from a worker that ran out of budget.
 *
 * A worker whose run ends as `failed` is normally skipped by the leader, even
 * when its worktree holds a complete change that passes its own checks. When
 * the stop code means the worker ran out of budget or was halted by safety
 * (`turn_limit`, `timeout`, `deadline`, `stall`, `policy`) AND its worktree has
 * changes outside the protected roots, `runTeamMission` re-evaluates its
 * declared outputs and its `verification.required_checks` and records a
 * `salvage` result. The branch is committed only when both pass — and the
 * leader still never merges a failed worker automatically.
 *
 * These tests use the same fake-runner / fake-gitOps pattern as
 * `tests/team-run.test.ts`, extended with a `dirtyPaths` probe so a stopped
 * worker's unsettled worktree can be inspected.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  runTeamMission,
  type GitOps,
  type MergeOutcome,
  type TeamMission,
  type TeamRuntimeContext,
  type TeamRuntimeRunResult,
  type VerifyMissionLike,
} from "../src/harness/team-run.js";

const execFileP = promisify(execFile);

let ROOT: string;

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", root, ...args]);
  return stdout;
}

async function initGitRepo(root: string): Promise<void> {
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await writeFile(join(root, "README.md"), "# seed\n", "utf-8");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "seed"]);
}

async function seedMissionPacket(root: string, missionId: string): Promise<void> {
  const dir = join(root, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  const yaml = [
    "schema_version: uh.mission.v0",
    `id: ${missionId}`,
    "title: Team Mission",
    "workflow_profile: staged",
    "objective: integrate worker fan-out",
  ].join("\n") + "\n";
  await writeFile(join(dir, "mission.yaml"), yaml, "utf-8");
}

function mission(id: string, workerOverrides: Partial<TeamMission["team"]["workers"][number]> = {}): TeamMission {
  return {
    id,
    team: {
      workers: [{ role: "backend", adapter: "hermes", ...workerOverrides }],
      leader: { adapter: "hermes" },
    },
  };
}

const PASSING: VerifyMissionLike = {
  status: "passed",
  path: "/fake/verification.yaml",
  checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
  acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
};

const FAILING: VerifyMissionLike = {
  status: "failed",
  path: "/fake/verification.yaml",
  checks_total: 1, checks_passed: 0, checks_failed: 1, checks_blocked: 0,
  acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
};

/** The leader's own verification always passes; the worker worktree answers `workerResult`. */
function verifierFor(workerResult: VerifyMissionLike) {
  return async (root: string): Promise<VerifyMissionLike> => basename(root) === "leader" ? PASSING : workerResult;
}

interface FakeRepo {
  branches: Set<string>;
  /** worktreePath -> relative paths the worker left unsettled */
  dirty: Map<string, string[]>;
  commits: Array<{ cwd: string; message: string }>;
  merges: string[];
}

function emptyRepo(): FakeRepo {
  return { branches: new Set(["HEAD"]), dirty: new Map(), commits: [], merges: [] };
}

function fakeGitOps(repo: FakeRepo): GitOps {
  return {
    async addWorktree(_root, branch, worktreePath) {
      if (repo.branches.has(branch)) throw new Error(`branch exists: ${branch}`);
      repo.branches.add(branch);
      await mkdir(worktreePath, { recursive: true });
    },
    async removeWorktree() { /* no-op */ },
    async merge(_cwd, branch): Promise<MergeOutcome> {
      repo.merges.push(branch);
      return { conflicted: false, conflictPaths: [], note: `merged ${branch}` };
    },
    async diffFiles() { return []; },
    async deleteBranch(_root, branch) { repo.branches.delete(branch); },
    async commitAll(cwd, message) { repo.commits.push({ cwd, message }); },
    async dirtyPaths(cwd) { return [...(repo.dirty.get(cwd) ?? [])]; },
  };
}

interface WorkerScript {
  /** Files written into the worker worktree, relative to its root. */
  files: Record<string, string>;
  /** Stop code to record on the worker's runtime control receipt. */
  stopCode?: string;
}

/** Mirror of the team-run fake runner, plus a control-receipt writer. */
function makeRunner(scripts: Record<string, WorkerScript>, repo: FakeRepo) {
  return (_adapter: string) =>
    async (_runtime: string, root: string, _missionPath: string, context: TeamRuntimeContext): Promise<TeamRuntimeRunResult> => {
      const script = scripts[basename(root)];
      if (!script) {
        return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
      }
      for (const [rel, content] of Object.entries(script.files)) {
        const target = join(root, rel);
        await mkdir(join(target, ".."), { recursive: true });
        await writeFile(target, content, "utf-8");
      }
      repo.dirty.set(root, Object.keys(script.files));
      if (script.stopCode) {
        const missionId = context.missionId ?? "team-mission";
        const runDir = join(context.artifactRoot, ".harness", "missions", missionId, "runs", context.runId);
        await mkdir(runDir, { recursive: true });
        await writeFile(join(runDir, "runtime-control.json"), JSON.stringify({
          schema_version: "uh.runtime-control.v0",
          mission_id: missionId,
          run_id: context.runId,
          runtime: "hermes",
          controller_pid: 4242,
          started_at: "2026-01-01T00:00:00.000Z",
          heartbeat_at: "2026-01-01T00:00:01.000Z",
          status: "failed",
          stop_code: script.stopCode,
          turns: 3,
          denials: 0,
          inflight_tools: 0,
        }), "utf-8");
      }
      return { exitCode: 1, stdout: "", stderr: "", result: { status: "failed" } };
    };
}

async function readState(root: string, runId: string): Promise<{
  workers: Array<{ id: string; status: string; salvage?: Record<string, unknown> }>;
}> {
  return JSON.parse(await readFile(join(root, ".harness", "missions", "team-mission", "runs", runId, "team-state.json"), "utf-8"));
}

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-team-salvage-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

describe("team salvage", () => {
  test("a worker that writes a valid change then reports turn_limit is salvaged: committed, not merged, listed", async () => {
    await seedMissionPacket(ROOT, "team-mission");
    const repo = emptyRepo();
    const runner = makeRunner({
      backend: { files: { "out/artifact.txt": "complete\n" }, stopCode: "turn_limit" },
    }, repo);

    const result = await runTeamMission(mission("team-mission", { expected_outputs: { files: ["out/artifact.txt"] } }), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo),
      verifier: verifierFor(PASSING),
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("failed");
    expect(backend.salvage).toEqual({
      eligible: true,
      outputs_passed: true,
      checks_passed: true,
      branch: backend.plan.branch,
    });

    // Committed to the worker branch with the existing hygiene, but never merged.
    expect(repo.commits.some((commit) => commit.cwd === backend.plan.worktreePath)).toBe(true);
    expect(repo.merges).not.toContain(backend.plan.branch);
    expect(backend.integrated).toBe(false);

    // Recorded on the canonical worker entry.
    const state = await readState(ROOT, result.runId!);
    expect(state.workers[0].salvage).toEqual({
      eligible: true,
      outputs_passed: true,
      checks_passed: true,
      branch: backend.plan.branch,
    });

    // A team with a failed worker is still not passed.
    expect(result.status).not.toBe("passed");

    // The report surfaces the stopped worker's branch + stop code for a human.
    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toContain("## Verified work from stopped workers");
    expect(report).toContain("turn_limit");
    expect(report).toContain(backend.plan.branch);
  });

  test("a stopped worker whose checks fail is eligible but produces no commit", async () => {
    await seedMissionPacket(ROOT, "team-mission");
    const repo = emptyRepo();
    const runner = makeRunner({
      backend: { files: { "out/artifact.txt": "complete\n" }, stopCode: "turn_limit" },
    }, repo);

    const result = await runTeamMission(mission("team-mission", { expected_outputs: { files: ["out/artifact.txt"] } }), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo),
      verifier: verifierFor(FAILING),
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("failed");
    expect(backend.salvage).toEqual({
      eligible: true,
      outputs_passed: true,
      checks_passed: false,
      branch: backend.plan.branch,
    });

    expect(repo.commits).toHaveLength(0);
    expect(repo.merges).not.toContain(backend.plan.branch);

    const state = await readState(ROOT, result.runId!);
    expect(state.workers[0].salvage).toMatchObject({ eligible: true, checks_passed: false });
  });

  test("a worker stopped with route_mismatch is not evaluated and gets no salvage record", async () => {
    await seedMissionPacket(ROOT, "team-mission");
    const repo = emptyRepo();
    const runner = makeRunner({
      backend: { files: { "out/artifact.txt": "complete\n" }, stopCode: "route_mismatch" },
    }, repo);

    const result = await runTeamMission(mission("team-mission", { expected_outputs: { files: ["out/artifact.txt"] } }), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo),
      verifier: verifierFor(PASSING),
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("failed");
    expect(backend.salvage).toBeUndefined();
    expect(repo.commits).toHaveLength(0);

    const state = await readState(ROOT, result.runId!);
    expect(state.workers[0].salvage).toBeUndefined();
  });

  test("a worker that touched only protected paths is not eligible and is not committed", async () => {
    await seedMissionPacket(ROOT, "team-mission");
    const repo = emptyRepo();
    const runner = makeRunner({
      backend: { files: { ".commandcode/settings.json": "{}\n" }, stopCode: "turn_limit" },
    }, repo);
    const verifiedRoots: string[] = [];
    const verifierSpy = async (root: string): Promise<VerifyMissionLike> => {
      verifiedRoots.push(root);
      return PASSING;
    };

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo),
      verifier: verifierSpy,
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("failed");
    expect(backend.salvage).toEqual({
      eligible: false,
      outputs_passed: false,
      checks_passed: false,
      branch: backend.plan.branch,
    });

    // The worker worktree's checks were never run; only the leader was verified.
    expect(verifiedRoots).not.toContain(backend.plan.worktreePath);
    expect(repo.commits).toHaveLength(0);

    const state = await readState(ROOT, result.runId!);
    expect(state.workers[0].salvage).toMatchObject({ eligible: false });
  });
});

describe("team salvage — real git (smoke)", () => {
  test("default gitOps commits the stopped worker's branch with hygiene and leaves it unmerged", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await git(ROOT, ["add", "-A"]);
    await git(ROOT, ["commit", "-q", "-m", "seed mission"]);

    const repo = emptyRepo();
    const runner = makeRunner({
      backend: { files: { "out/artifact.txt": "complete\n" }, stopCode: "turn_limit" },
    }, repo);

    const result = await runTeamMission(mission("team-mission", { expected_outputs: { files: ["out/artifact.txt"] } }), ROOT, {
      runnerFor: runner,
      verifier: verifierFor(PASSING),
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.salvage).toEqual({
      eligible: true,
      outputs_passed: true,
      checks_passed: true,
      branch: backend.plan.branch,
    });

    // The default gitOps committed exactly the worker's own change, observed
    // through real `git` (this exercises `dirtyPaths` + `commitAll`).
    const changed = (await git(ROOT, ["diff", "--name-only", "HEAD", backend.plan.branch]))
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(changed).toEqual(["out/artifact.txt"]);

    // Still not merged, and the team did not pass.
    expect(backend.integrated).toBe(false);
    expect(result.status).not.toBe("passed");
  });
});
