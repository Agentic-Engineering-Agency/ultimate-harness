/**
 * UH-72 — Team mission runtime tests.
 *
 * The default `gitOps` uses real `git` and is exercised in the
 * happy-path test against a real init'd repo. The conflict and failure
 * paths inject a deterministic `gitOps` stub so they're CI-friendly and
 * never depend on host-level git semantics.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { promisify } from "node:util";
import {
  planTeamRun,
  runTeamMission,
  type GitOps,
  type MergeOutcome,
  type TeamMission,
  type TeamRuntimeRunResult,
  type VerifyMissionLike,
  type WorkerOutcome,
} from "../src/harness/team-run.js";
import { projectDeliveryObservatory } from "../src/harness/delivery-observatory/project.js";
import { verifyMission, warnConstraintsAreAdvisory } from "../src/harness/verify.js";
import { initializeHarness } from "../src/harness/init.js";

const execFileP = promisify(execFile);

let ROOT: string;

async function initGitRepo(root: string): Promise<void> {
  await execFileP("git", ["init", "--initial-branch=main"], { cwd: root });
  await execFileP("git", ["config", "user.email", "uh-test@example.com"], { cwd: root });
  await execFileP("git", ["config", "user.name", "uh test"], { cwd: root });
  await execFileP("git", ["config", "core.autocrlf", "false"], { cwd: root });
  await writeFile(join(root, "README.md"), "seed\n", "utf-8");
  await execFileP("git", ["add", "-A"], { cwd: root });
  await execFileP("git", ["commit", "-m", "seed"], { cwd: root });
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

function mission(id: string, overrides: Partial<TeamMission["team"]> = {}): TeamMission {
  return {
    id,
    team: {
      workers: overrides.workers ?? [
        { role: "backend", adapter: "hermes" },
        { role: "frontend", adapter: "codex" },
      ],
      leader: overrides.leader ?? { adapter: "hermes" },
    },
  };
}

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-team-run-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ---------------------------------------------------------------- planning  */

describe("planTeamRun", () => {
  test("expands count into N worker plans with stable ids and branches", () => {
    const plan = planTeamRun(
      mission("m1", { workers: [{ role: "backend", adapter: "hermes", count: 2 }] }),
      "/tmp/repo",
    );
    expect(plan.workers).toHaveLength(2);
    expect(plan.workers.map((w) => w.id)).toEqual(["backend-1", "backend-2"]);
    expect(plan.workers.map((w) => w.branch)).toEqual([
      "uh/team/m1/backend-1",
      "uh/team/m1/backend-2",
    ]);
    expect(plan.workers.every((w) => w.adapter === "hermes")).toBe(true);
    expect(plan.leader.branch).toBe("uh/team/m1/leader");
    expect(plan.leader.adapter).toBe("hermes");
    expect(plan.leader.strategy).toBe("merge");
  });

  test("single-count worker keeps role-only id (no -1 suffix)", () => {
    const plan = planTeamRun(mission("m1"), "/tmp/repo");
    expect(plan.workers.map((w) => w.id)).toEqual(["backend", "frontend"]);
  });

  test("rejects unsafe role names", () => {
    expect(() => planTeamRun(
      mission("m1", { workers: [{ role: "../oops", adapter: "hermes" }] }),
      "/tmp/repo",
    )).toThrow(/safe identifier/);
  });

  test("rejects zero or negative counts", () => {
    expect(() => planTeamRun(
      mission("m1", { workers: [{ role: "x", adapter: "hermes", count: 0 }] }),
      "/tmp/repo",
    )).toThrow(/positive integer/);
  });

  test("requires at least one worker", () => {
    expect(() => planTeamRun(
      { id: "m1", team: { workers: [], leader: { adapter: "hermes" } } },
      "/tmp/repo",
    )).toThrow(/no workers/);
  });

  test("uses integration_report_path override when provided (relative resolves under team dir)", () => {
    // UH-129: a RELATIVE override resolves under .harness/missions/<id>/team/
    // to match the documented layout, not the repo root.
    const plan = planTeamRun(
      { ...mission("m1"), integration_report_path: "custom/place.md" },
      "/tmp/repo",
    );
    expect(plan.integrationReportPath).toBe(resolve("/tmp/repo", ".harness", "missions", "m1", "team", "custom", "place.md"));
  });

  test("uses integration_report_path override when provided (absolute is honored as-is)", () => {
    // UH-129: an ABSOLUTE override inside the root is honored unchanged.
    const plan = planTeamRun(
      { ...mission("m1"), integration_report_path: "/tmp/repo/elsewhere/report.md" },
      "/tmp/repo",
    );
    expect(plan.integrationReportPath).toBe(resolve("/tmp/repo", "elsewhere", "report.md"));
  });

  test("rejects unsafe adapter ids", () => {
    expect(() => planTeamRun(
      mission("m1", { workers: [{ role: "x", adapter: "../sneaky" }] }),
      "/tmp/repo",
    )).toThrow(/safe identifier/);
  });

  test("non-merge strategy is rejected at plan time, before any worker dispatch", () => {
    // F5: short-circuit the run before workers are spawned so we don't pay
    // the worktree-creation tax on a guaranteed-failure invocation.
    expect(() => planTeamRun(mission("m1"), "/tmp/repo", { strategy: "cherry-pick" }))
      .toThrow(/not yet implemented/);
    expect(() => planTeamRun(mission("m1"), "/tmp/repo", { strategy: "rebase" }))
      .toThrow(/not yet implemented/);
  });

  test("integration_report_path that escapes root is rejected", () => {
    // UH-129: relative paths now resolve under teamRoot
    // (.harness/missions/m1/team/), so the traversal fixture must climb far
    // enough to actually escape the repo root before the guard fires.
    expect(() => planTeamRun(
      { ...mission("m1"), integration_report_path: "../../../../../../escape.md" },
      "/tmp/repo",
    )).toThrow(/outside of root/);
  });

  test("absolute integration_report_path outside root is rejected", () => {
    expect(() => planTeamRun(
      { ...mission("m1"), integration_report_path: "/etc/escape.md" },
      "/tmp/repo",
    )).toThrow(/outside of root/);
  });
});

/* ----------------------------------------------------------------- runtime  */

interface FakeRepo {
  branches: Set<string>;
  /** branch -> last-written file content snapshot (cumulative) */
  contents: Map<string, Map<string, string>>;
  /** Conflicts seeded by tests: branchA -> { branchB, paths } */
  conflictsWith: Map<string, { branch: string; paths: string[] }>;
}

function fakeGitOps(repo: FakeRepo, fs: { write: (p: string, c: string) => Promise<void> }): GitOps {
  return {
    async addWorktree(_root, branch, worktreePath) {
      if (repo.branches.has(branch)) throw new Error(`branch exists: ${branch}`);
      repo.branches.add(branch);
      repo.contents.set(branch, new Map(repo.contents.get("HEAD") ?? new Map()));
      // Provision the worktree dir on disk so seed+commit code paths are exercised.
      await mkdir(worktreePath, { recursive: true });
    },
    async removeWorktree(_root, _worktreePath) { /* no-op */ },
    async merge(cwd, branch): Promise<MergeOutcome> {
      // Detect leader = current worktree. Identify which branch the leader is on by cwd suffix.
      const leaderBranch = cwd.endsWith("/leader") ? `uh/team/${cwd.split("/team/")[1].split("/")[0]}/leader` : "";
      const conflict = repo.conflictsWith.get(branch);
      if (conflict) {
        return { conflicted: true, conflictPaths: conflict.paths, note: `conflict on ${conflict.paths.length} path(s)` };
      }
      // Apply worker's contents over leader.
      const incoming = repo.contents.get(branch) ?? new Map<string, string>();
      const leaderContents = repo.contents.get(leaderBranch) ?? new Map<string, string>();
      for (const [p, c] of incoming) {
        leaderContents.set(p, c);
        await fs.write(p, c);
      }
      repo.contents.set(leaderBranch, leaderContents);
      return { conflicted: false, conflictPaths: [], note: `merged ${branch}` };
    },
    async diffFiles(_root, _baseRef, branch) {
      const m = repo.contents.get(branch) ?? new Map<string, string>();
      const base = repo.contents.get("HEAD") ?? new Map<string, string>();
      const out: string[] = [];
      for (const [p, c] of m) if (base.get(p) !== c) out.push(p);
      return out.sort();
    },
    async deleteBranch(_root, branch) { repo.branches.delete(branch); },
    async commitAll(_cwd, _message) { /* no-op for fake */ },
  };
}

interface FakeRun {
  /** worker id -> { files written into the worker worktree, exitCode } */
  writes: Record<string, { files: Record<string, string>; sentinel?: string; exitCode?: number; status?: string }>;
}

function makeRunner(
  opts: FakeRun,
  repo: FakeRepo | null = null,
  missionId = "team-mission",
): (adapter: string) => (a: string, root: string, missionPath: string) => Promise<TeamRuntimeRunResult> {
  return (_adapter) => async (adapter, root, missionPath) => {
    const id = basename(root);
    const spec = opts.writes[id];
    if (!spec) {
      return { exitCode: 0, stdout: `no-op runner for ${id}`, stderr: "", result: { status: "passed" } };
    }
    for (const [rel, content] of Object.entries(spec.files)) {
      const target = join(root, rel);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, content, "utf-8");
    }
    if (spec.sentinel !== undefined) {
      const sentinelPath = join(root, ".harness", "missions", missionId, "runtime-final.txt");
      await mkdir(join(sentinelPath, ".."), { recursive: true });
      await writeFile(sentinelPath, spec.sentinel, "utf-8");
    }
    // Mirror writes into the fake repo so diffFiles sees them as if a real
    // `git commit` had landed on the worker branch. We mirror only the code
    // changes — never the session sentinel — to match the production strip.
    if (repo) {
      const branch = `uh/team/${missionId}/${id}`;
      const branchContents = repo.contents.get(branch) ?? new Map<string, string>();
      for (const [rel, content] of Object.entries(spec.files)) {
        branchContents.set(rel, content);
      }
      repo.contents.set(branch, branchContents);
    }
    void adapter; void missionPath;
    return {
      exitCode: spec.exitCode ?? 0,
      stdout: "",
      stderr: "",
      result: { status: spec.status ?? "passed" },
    };
  };
}

describe("runTeamMission — fake gitOps", () => {
  beforeEach(async () => {
    await seedMissionPacket(ROOT, "team-mission");
  });

  test("unknown worker spend blocks queued work without creating its worktree or claiming partial success", async () => {
    const repo: FakeRepo = { branches: new Set(["HEAD"]), contents: new Map([["HEAD", new Map()]]), conflictsWith: new Map() };
    const dispatched: string[] = [];
    const workerRunner = makeRunner({ writes: { backend: { files: { "answer.txt": "42" } } } }, repo);
    const packet = mission("team-mission");
    packet.team.resources = { max_parallel: 1, max_cost_usd: 2, worker_cost_reservation_usd: 1 };
    const result = await runTeamMission(packet, ROOT, {
      gitOps: fakeGitOps(repo, { write: async () => undefined }),
      runnerFor: adapter => async (runtime, workerRoot, missionPath) => {
        dispatched.push(basename(workerRoot));
        return workerRunner(adapter)(runtime, workerRoot, missionPath);
      },
      verifier: async () => ({
        status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
        acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
      }),
    });
    expect(dispatched).toEqual(["backend"]);
    expect(repo.branches.has("uh/team/team-mission/frontend")).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.retained).toBe(true);
    expect(result.workers.find(worker => worker.plan.id === "frontend")?.status).toBe("blocked");
  });

  test("2-worker happy path: spawns each worker, leader merges both, verifier passes", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async (_p: string, _c: string) => { /* no-op for accounting */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "wrote src/a.ts\nadditional note" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "wrote src/b.ts" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "passed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("passed");
    expect(result.hadConflicts).toBe(false);
    expect(result.workers).toHaveLength(2);
    expect(result.workers.every((w: WorkerOutcome) => w.integrated)).toBe(true);
    expect(result.workers.find((w) => w.plan.id === "backend")!.filesTouched).toEqual(["src/a.ts"]);
    expect(result.workers.find((w) => w.plan.id === "frontend")!.filesTouched).toEqual(["src/b.ts"]);
    expect(result.leaderRanVerification).toBe(true);

    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toMatch(/# Team integration report: team-mission/);
    expect(report).toMatch(/backend.*hermes/);
    expect(report).toMatch(/frontend.*codex/);
    expect(report).toMatch(/Leader merge: clean/);
    // Summary line extracted from runtime-final.txt's first non-empty line.
    expect(report).toMatch(/Summary: wrote src\/a\.ts/);
    expect(report).toMatch(/Summary: wrote src\/b\.ts/);
  });

  test("team worker registers a live run at the project root with its team and role", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const baseRunner = makeRunner({
      writes: { backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" } },
    }, repo);
    const result = await runTeamMission(mission("team-mission", {
      workers: [
        { role: "backend", adapter: "hermes", runtime_config_overrides: { model: "provider/backend" } },
      ],
    }), ROOT, {
      runnerFor: adapter => async (runtime, workerRoot, missionPath, context) => {
        // The adapter claims its attempt before running; the team runner wires
        // this hook so the worker is discoverable from the project root.
        await context.onAttempt?.(context.runId);
        return baseRunner(adapter)(runtime, workerRoot, missionPath);
      },
      gitOps: fakeGitOps(repo, fs),
      verifier: async () => ({
        status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
        acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
      }),
      retainOnSuccess: true,
    });

    expect(result.status).toBe("passed");
    const liveRunsDir = join(ROOT, ".harness", "live-runs");
    const files = await readdir(liveRunsDir);
    const entries = await Promise.all(files.map(async (file) => JSON.parse(
      await readFile(join(liveRunsDir, file), "utf-8"),
    ) as {
      run_id: string;
      mission_id: string;
      runtime: string;
      model?: string;
      team?: { mission_id: string; role: string };
      artifact_root: string;
    }));
    const backend = entries.find((entry) => entry.team?.role === "backend");
    expect(backend).toBeTruthy();
    expect(backend!.team).toEqual({ mission_id: "team-mission", role: "backend" });
    expect(backend!.runtime).toBe("hermes");
    expect(backend!.model).toBe("provider/backend");
    expect(backend!.artifact_root).toMatch(
      /^\.harness\/missions\/team-mission\/team\/artifacts\/.+\/workers\/backend$/,
    );
  });

  test("conflict path: leader marks conflict and overall status is blocked (no verifier wired)", async () => {
    // Conflict-verdict refinement: a merge conflict alone is NOT a hard
    // failure — verification decides. With no verifier wired, the run
    // settles on `blocked` so the caller knows verification was skipped
    // and a worker did not land.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map([
        ["uh/team/team-mission/frontend", { branch: "uh/team/team-mission/leader", paths: ["src/shared.ts"] }],
      ]),
    };
    const fs = { write: async (_p: string, _c: string) => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/shared.ts": "frontend-write" }, sentinel: "ok" },
      },
    }, repo);

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      retainOnSuccess: true,
    });

    expect(result.status).toBe("blocked");
    expect(result.hadConflicts).toBe(true);
    const frontend = result.workers.find((w) => w.plan.id === "frontend")!;
    expect(frontend.merge?.conflicted).toBe(true);
    expect(frontend.merge?.conflictPaths).toEqual(["src/shared.ts"]);
    expect(frontend.integrated).toBe(false);
    expect(result.leaderRanVerification).toBe(false);

    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toMatch(/Leader merge: conflict \(1 path/);
    expect(report).toMatch(/conflict: `src\/shared\.ts`/);
  });

  test("UH-127 conflict + verifier passes: partial integration is passed_partial (non-blocking), not blocked", async () => {
    // UH-127: when M<N workers land but the integrated subset is clean and
    // verification passes, the run is a NON-blocking `passed_partial` rather
    // than `blocked`. backend integrates clean; frontend conflicts and is
    // dropped; the verifier passes on the integrated result.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map([
        ["uh/team/team-mission/frontend", { branch: "uh/team/team-mission/leader", paths: ["src/shared.ts"] }],
      ]),
    };
    const fs = { write: async (_p: string, _c: string) => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/shared.ts": "frontend-write" }, sentinel: "ok" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "passed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("passed_partial");
    expect(result.hadConflicts).toBe(true);
    expect(result.leaderRanVerification).toBe(true);
    expect(result.verification?.status).toBe("passed");
    // The surviving worker is integrated; the conflicted one is not.
    expect(result.workers.find((w) => w.plan.id === "backend")!.integrated).toBe(true);
    expect(result.workers.find((w) => w.plan.id === "frontend")!.integrated).toBe(false);
  });

  test("UH-127 single-worker failure + verifier passes: passed_partial (surviving worker shippable)", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: {}, exitCode: 7, status: "failed", sentinel: "" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "passed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    // UH-127: a failed worker no longer forces BLOCKED when the integrated
    // subset verifies clean — it is a non-blocking partial success.
    expect(result.status).toBe("passed_partial");
    expect(result.hadConflicts).toBe(true);
    const frontend = result.workers.find((w) => w.plan.id === "frontend")!;
    expect(frontend.status).toBe("failed");
    expect(frontend.merge?.note).toMatch(/skipped: worker status=failed/);
    expect(result.workers.find((w) => w.plan.id === "backend")!.integrated).toBe(true);
    expect(result.leaderRanVerification).toBe(true);
  });

  test("UH-127 partial integration but verifier blocked stays blocked (no false success)", async () => {
    // Guard: passed_partial requires verification.status==='passed'. A blocked
    // verifier on a partial integration is still BLOCKED.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: {}, exitCode: 7, status: "failed", sentinel: "" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "blocked",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 0, checks_failed: 0, checks_blocked: 1,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("blocked");
    expect(result.verification?.status).toBe("blocked");
  });

  test("leader-verification failure: integration succeeds but verifier returns failed", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "ok" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "failed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 0, checks_failed: 1, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("failed");
    expect(result.hadConflicts).toBe(false);
    expect(result.leaderRanVerification).toBe(true);
    expect(result.verification?.status).toBe("failed");
    expect(result.retained).toBe(true);
  });

  test("non-merge strategy short-circuits in planTeamRun, never reaches workers", async () => {
    // Strategy validation lives in `planTeamRun` (F5) so a doomed
    // invocation fails BEFORE any worker worktree is created. Here we
    // inject a gitOps that fatally throws on addWorktree to confirm no
    // worker dispatch happens.
    let addWorktreeCalled = false;
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const baseOps = fakeGitOps(repo, fs);
    const gitOps: GitOps = {
      ...baseOps,
      addWorktree: async () => { addWorktreeCalled = true; throw new Error("should not reach here"); },
    };
    const runner = makeRunner({
      writes: {
        backend: { files: {}, sentinel: "ok" },
        frontend: { files: {}, sentinel: "ok" },
      },
    }, repo);
    await expect(runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps,
      retainOnSuccess: true,
      strategy: "cherry-pick",
    })).rejects.toThrow(/not yet implemented/);
    expect(addWorktreeCalled).toBe(false);
  });

  test("verifier raised exception: status is failed, hadConflicts stays false (F4)", async () => {
    // F4: verifier exceptions are tracked separately from `hadConflicts`,
    // so the integration-report conflict accounting remains accurate.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "ok" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => {
      throw new Error("verifier blew up");
    };

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("failed");
    expect(result.hadConflicts).toBe(false);
    expect(result.leaderRanVerification).toBe(false);
    expect(result.verification).toBeNull();
    for (const w of result.workers) {
      expect(w.integrated).toBe(true);
      expect(w.merge?.conflicted).toBe(false);
    }
  });

  test("retainOnSuccess=false removes worktrees + branches on PASS", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "ok" },
      },
    }, repo);
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "passed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier,
      retainOnSuccess: false,
    });

    expect(result.retained).toBe(false);
    // Branches were created then deleted.
    expect(repo.branches.has("uh/team/team-mission/backend")).toBe(false);
    expect(repo.branches.has("uh/team/team-mission/frontend")).toBe(false);
    expect(repo.branches.has("uh/team/team-mission/leader")).toBe(false);
  });

  test("Codex P1: non-conflict merge failure drops worker from integrated set (not silently merged)", async () => {
    // When `git merge` exits non-zero but MERGE_HEAD is NOT present (e.g.
    // corrupt branch, missing ref, dirty index), the old code returned
    // `{ conflicted: false }` and the consumer marked the worker integrated.
    // The fix: a non-conflict failure now sets `failed: true` and the worker
    // MUST NOT be integrated.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async (_p: string, _c: string) => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "ok" },
      },
    }, repo);
    const baseOps = fakeGitOps(repo, fs);
    const gitOps: GitOps = {
      ...baseOps,
      // Simulate a non-conflict merge failure for the frontend branch only.
      async merge(cwd, branch) {
        if (branch === "uh/team/team-mission/frontend") {
          return { conflicted: false, failed: true, conflictPaths: [], note: "merge failed: refs/heads/uh/team/team-mission/frontend points to a corrupt object" };
        }
        return baseOps.merge(cwd, branch);
      },
    };

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps,
      retainOnSuccess: true,
    });

    const frontend = result.workers.find((w) => w.plan.id === "frontend")!;
    expect(frontend.merge?.conflicted).toBe(false);
    expect(frontend.merge?.failed).toBe(true);
    expect(frontend.integrated).toBe(false);
    // The clean worker (backend) is still integrated.
    const backend = result.workers.find((w) => w.plan.id === "backend")!;
    expect(backend.integrated).toBe(true);
    // hadConflicts is set because the partial integration is not clean.
    expect(result.hadConflicts).toBe(true);
    // Without a verifier, the overall verdict is blocked (partial integration).
    expect(result.status).toBe("blocked");

    // Codex P2 follow-up: the integration report must reflect the failed
    // merge — operators should NOT see "Leader merge: clean" on a blocked
    // run where git merge actually failed.
    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toMatch(/Leader merge: failed \(non-conflict\)/);
    expect(report).not.toMatch(/frontend[\s\S]*?Leader merge: clean/);
  });

  test("UH-128: worker worktree gets a .harness/.gitignore excluding audit + per-run dirs", async () => {
    // UH-128: per-worker runtime artifacts (.harness/audit/, per-run dirs)
    // must not bleed into the leader merge. The isolation is a worktree-local
    // .harness/.gitignore so `commitAll`'s `git add -A` never stages them.
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "src/a.ts": "a\n" }, sentinel: "ok" },
        frontend: { files: { "src/b.ts": "b\n" }, sentinel: "ok" },
      },
    }, repo);

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      retainOnSuccess: true,
    });

    for (const w of result.workers) {
      const gitignore = await readFile(join(w.plan.worktreePath, ".harness", ".gitignore"), "utf-8");
      expect(gitignore).toMatch(/^audit\/$/m);
      expect(gitignore).toMatch(/^missions\/\*\/runs\/$/m);
    }
  });

  test("derives per-worker packets, restores canonical packets, and records contracts", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const packetByWorker: Record<string, Record<string, unknown>> = {};
    const baseRunner = makeRunner({
      writes: {
        backend: { files: { "out/backend.txt": "backend\n" } },
        frontend: { files: { "out/frontend.txt": "frontend\n" } },
      },
    }, repo);
    const packet = mission("team-mission", {
      workers: [
        {
          role: "backend",
          adapter: "hermes",
          objective: "Backend objective",
          runtime_config_overrides: { model: "provider/backend" },
          limits: { max_turns: 3 },
          expected_outputs: { files: ["out/backend.txt"] },
        },
        {
          role: "frontend",
          adapter: "codex",
          objective: "Frontend objective",
          runtime_config_overrides: { model: "provider/frontend" },
          limits: { max_turns: 7 },
          expected_outputs: { files: ["out/frontend.txt"] },
        },
      ],
    });
    const result = await runTeamMission(packet, ROOT, {
      runnerFor: adapter => async (runtime, workerRoot, missionPath, context) => {
        packetByWorker[basename(workerRoot)] = parseYaml(await readFile(missionPath, "utf-8")) as Record<string, unknown>;
        return baseRunner(adapter)(runtime, workerRoot, missionPath);
      },
      gitOps: fakeGitOps(repo, fs),
      verifier: async () => ({
        status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
        acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
      }),
      retainOnSuccess: true,
    });
    expect(result.status).toBe("passed");
    const backendPacket = packetByWorker.backend;
    const backendObjective = backendPacket.objective as string;
    const backendOverrides = backendPacket.runtime_config_overrides as Record<string, unknown>;
    const backendLimits = backendOverrides.limits as Record<string, unknown>;
    const backendOutputs = backendPacket.expected_outputs as { files: string[] };
    expect(backendObjective).toMatch(/Backend objective[\s\S]*Team objective: integrate worker fan-out/);
    expect(backendOverrides.model).toBe("provider/backend");
    expect(backendLimits.max_turns).toBe(3);
    expect(backendOutputs.files).toEqual(["out/backend.txt"]);
    const canonicalBytes = await readFile(join(ROOT, ".harness", "missions", "team-mission", "mission.yaml"), "utf-8");
    for (const worker of result.workers) {
      expect(await readFile(join(worker.plan.worktreePath, ".harness", "missions", "team-mission", "mission.yaml"), "utf-8")).toBe(canonicalBytes);
    }
    const state = JSON.parse(await readFile(join(ROOT, ".harness", "missions", "team-mission", "runs", result.runId!, "team-state.json"), "utf-8")) as {
      integration_report_path: string;
      workers: Array<{ id: string; contract?: { limits?: { max_turns?: number } } }>;
    };
    expect(state.integration_report_path).not.toMatch(/[\\]/);
    expect(resolve(ROOT, state.integration_report_path)).toBe(result.integrationReportPath);
    const parentRuntime = parseYaml(await readFile(join(ROOT, ".harness", "missions", "team-mission", "runs", result.runId!, "runtime-result.yaml"), "utf-8")) as { diff_path?: string };
    expect(parentRuntime.diff_path).toBe(state.integration_report_path);
  });
  test("uses a distinct worker mission as the worker contract base", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const workerMissionDir = join(ROOT, ".harness", "missions", "special-worker");
    await mkdir(workerMissionDir, { recursive: true });
    await writeFile(join(workerMissionDir, "mission.yaml"), [
      "schema_version: uh.mission.v0",
      "id: special-worker",
      "title: Special worker",
      "workflow_profile: staged",
      "objective: Special objective",
      "constraints:",
      "  - Stay in the special scope",
      "expected_outputs:",
      "  files:",
      "    - out/special.txt",
    ].join("\n") + "\n", "utf-8");
    const packets: Record<string, Record<string, unknown>> = {};
    const baseRunner = makeRunner({
      writes: { backend: { files: { "out/special.txt": "special\n" } } },
    }, repo);
    const result = await runTeamMission(mission("team-mission", {
      workers: [{ role: "backend", adapter: "hermes", mission_id: "special-worker" }],
    }), ROOT, {
      runnerFor: adapter => async (runtime, workerRoot, missionPath, _context) => {
        packets[basename(workerRoot)] = parseYaml(await readFile(missionPath, "utf-8")) as Record<string, unknown>;
        return baseRunner(adapter)(runtime, workerRoot, missionPath);
      },
      gitOps: fakeGitOps(repo, fs),
      verifier: async () => ({
        status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
        acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
      }),
      retainOnSuccess: true,
    });
    expect(result.status).toBe("passed");
    const packet = packets.backend;
    expect(packet.id).toBe("special-worker");
    expect(packet.objective).toBe("Special objective");
    expect(packet.constraints).toEqual(["Stay in the special scope"]);
    expect(packet.expected_outputs).toEqual({ files: ["out/special.txt"] });
    const state = JSON.parse(await readFile(join(ROOT, ".harness", "missions", "team-mission", "runs", result.runId!, "team-state.json"), "utf-8")) as {
      workers: Array<{ mission_id?: string; contract?: { objective?: string; constraints?: string[] } }>;
    };
    expect(state.workers[0].mission_id).toBe("special-worker");
    expect(state.workers[0].contract).toMatchObject({ objective: "Special objective", constraints: ["Stay in the special scope"] });
  });
  test("missing declared output blocks only that worker and yields passed_partial", async () => {
    const repo: FakeRepo = {
      branches: new Set(["HEAD"]),
      contents: new Map([["HEAD", new Map()]]),
      conflictsWith: new Map(),
    };
    const fs = { write: async () => { /* no-op */ } };
    const runner = makeRunner({
      writes: {
        backend: { files: { "out/backend.txt": "backend\n" } },
        frontend: { files: {} },
      },
    }, repo);
    const packet = mission("team-mission", {
      workers: [
        { role: "backend", adapter: "hermes", expected_outputs: { files: ["out/backend.txt"] } },
        { role: "frontend", adapter: "codex", expected_outputs: { files: ["out/missing.txt"] } },
      ],
    });
    const result = await runTeamMission(packet, ROOT, {
      runnerFor: runner,
      gitOps: fakeGitOps(repo, fs),
      verifier: async () => ({
        status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
        acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
      }),
      retainOnSuccess: true,
    });
    expect(result.status).toBe("passed_partial");
    const blockedOutcome = result.workers.find(worker => worker.plan.id === "frontend");
    expect(blockedOutcome?.status).toBe("blocked");
    expect(blockedOutcome?.integrated).toBe(false);
    expect(blockedOutcome?.errorMessage).toMatch(/^Declared output out\/missing\.txt:/);
    const statePath = join(ROOT, ".harness", "missions", "team-mission", "runs", result.runId!, "team-state.json");
    const state = JSON.parse(await readFile(statePath, "utf-8")) as {
      workers: Array<{
        id: string;
        status: string;
        blocked_reason?: string;
        outputs?: Array<{ path: string; status: string }>;
      }>;
    };
    const blocked = state.workers.find(worker => worker.id === "frontend")!;
    const succeeded = state.workers.find(worker => worker.id === "backend")!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.blocked_reason).toMatch(/^Declared output out\/missing\.txt:/);
    expect(blocked.outputs).toEqual([{ path: "out/missing.txt", status: "failed", notes: expect.any(String) }]);
    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.outputs).toEqual([{ path: "out/backend.txt", status: "passed" }]);
  });
});

/* ------------------------------------------- command-code cost admission */

describe("runTeamMission — command-code worker cost admission", () => {
  beforeEach(async () => {
    await seedMissionPacket(ROOT, "team-mission");
  });

  const pricesYaml = [
    "schema_version: uh.prices.v0",
    "models:",
    "  qwen/qwen3.8-flash:",
    "    input_usd_per_million: 2",
    "    output_usd_per_million: 8",
    "    cache_read_usd_per_million: 0.4",
    "    cache_write_usd_per_million: 1",
    '    source: "test placeholder, not a real price"',
  ].join("\n") + "\n";

  const passingVerifier = async (): Promise<VerifyMissionLike> => ({
    status: "passed", path: "/fake/verification.yaml", checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
    acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
  });

  /** A command-code worker whose native stream reports usage but no price. */
  function commandCodeRunner(stream: string) {
    return (_adapter: string) => async (
      _runtime: string,
      _workerRoot: string,
      _missionPath: string,
      context: { artifactRoot: string; runId: string },
    ): Promise<TeamRuntimeRunResult> => {
      const runDir = join(context.artifactRoot, ".harness", "missions", "team-mission", "runs", context.runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "runtime-result.yaml"), [
        "schema_version: uh.runtime-result.v0",
        "mission_id: team-mission",
        "runtime: command-code",
        "status: passed",
        "started_at: 2026-09-22T00:00:00.000Z",
        "finished_at: 2026-09-22T00:01:00.000Z",
        "prompt_path: prompt.md",
        "stdout_path: stdout.log",
        "stderr_path: stderr.log",
        "errors: []",
      ].join("\n") + "\n", "utf-8");
      await writeFile(join(runDir, "events.ndjson"), stream, "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
    };
  }

  async function runThreeWorkerTeam(stream: string): Promise<{ dispatched: string[]; result: Awaited<ReturnType<typeof runTeamMission>> }> {
    const dispatched: string[] = [];
    const runner = commandCodeRunner(stream);
    const packet = mission("team-mission", { workers: [{ role: "worker", adapter: "command-code", count: 3 }] });
    packet.team.resources = { max_parallel: 2, max_cost_usd: 2, worker_cost_reservation_usd: 1 };
    const result = await runTeamMission(packet, ROOT, {
      gitOps: fakeGitOps({ branches: new Set(["HEAD"]), contents: new Map([["HEAD", new Map()]]), conflictsWith: new Map() }, { write: async () => undefined }),
      runnerFor: adapter => async (runtime, workerRoot, missionPath, context) => {
        dispatched.push(basename(workerRoot));
        return runner(adapter)(runtime, workerRoot, missionPath, context);
      },
      verifier: passingVerifier,
      retainOnSuccess: true,
    });
    return { dispatched, result };
  }

  const usageStream = () => readFile(join(process.cwd(), "tests", "fixtures", "runtime-events", "command-code-usage.ndjson"), "utf-8");

  test("a price table makes the third worker admissible on estimated cost", async () => {
    await writeFile(join(ROOT, ".harness", "prices.yaml"), pricesYaml, "utf-8");
    const { dispatched, result } = await runThreeWorkerTeam(await usageStream());
    expect(dispatched).toHaveLength(3);
    expect(result.workers.every((w) => w.status === "succeeded")).toBe(true);
    expect(result.status).toBe("passed");
  });

  test("without a price table the third worker is still blocked with the existing reason", async () => {
    const { dispatched, result } = await runThreeWorkerTeam(await usageStream());
    expect(dispatched).toEqual(["worker-1", "worker-2"]);
    const third = result.workers.find((w) => w.plan.id === "worker-3");
    expect(third?.status).toBe("blocked");
    expect(third?.errorMessage).toMatch(/Completed worker cost is unknown/);
    expect(result.status).toBe("blocked");
  });
});

/* ------------------------------------------------------- constraints (UH-130) */

describe("warnConstraintsAreAdvisory (UH-130)", () => {
  test("warns once when constraints[] is non-empty", () => {
    const calls: string[] = [];
    const original = console.warn;
    console.warn = (msg?: unknown) => { calls.push(String(msg)); };
    try {
      warnConstraintsAreAdvisory(["no new deps", "keep under 200 LoC"]);
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(1);
  });

  test("is silent when constraints[] is empty or undefined", () => {
    const calls: string[] = [];
    const original = console.warn;
    console.warn = (msg?: unknown) => { calls.push(String(msg)); };
    try {
      warnConstraintsAreAdvisory([]);
      warnConstraintsAreAdvisory(undefined);
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(0);
  });
});

/* ---------------------------------------------------------- real git smoke  */

describe("runTeamMission — real git (smoke)", () => {
  test("happy path against a real git repo: 2 workers, leader merges both", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await execFileP("git", ["add", "-A"], { cwd: ROOT });
    await execFileP("git", ["commit", "-m", "seed mission"], { cwd: ROOT });

    const runner = (_adapter: string) => async (_a: string, root: string, _missionPath: string) => {
      const id = basename(root);
      const sentinelDir = join(root, ".harness", "missions", "team-mission");
      await mkdir(sentinelDir, { recursive: true });
      await writeFile(join(sentinelDir, "runtime-final.txt"), `worker ${id} done`, "utf-8");
      await mkdir(join(root, "src"), { recursive: true });
      const file = id === "backend" ? "src/a.ts" : "src/b.ts";
      await writeFile(join(root, file), `// ${id}\n`, "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
    };
    const verifier = async (): Promise<VerifyMissionLike> => ({
      status: "passed",
      path: "/fake/verification.yaml",
      checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
      acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
    });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      verifier,
      retainOnSuccess: true,
    });

    expect(result.status).toBe("passed");
    expect(result.workers).toHaveLength(2);
    for (const w of result.workers) {
      expect(w.status).toBe("succeeded");
      expect(w.integrated).toBe(true);
    }
    // Leader worktree contains both files.
    const leaderA = await readFile(join(result.plan.leader.worktreePath, "src/a.ts"), "utf-8");
    const leaderB = await readFile(join(result.plan.leader.worktreePath, "src/b.ts"), "utf-8");
    expect(leaderA).toBe("// backend\n");
    expect(leaderB).toBe("// frontend\n");
  });

  test("persists canonical parent and worker facts through non-retained cleanup", async () => {
    await initGitRepo(ROOT);
    await initializeHarness(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await writeFile(join(ROOT, ".harness", "missions", "team-mission", "mission.yaml"), [
      "schema_version: uh.mission.v0",
      "id: team-mission",
      "title: Team Mission",
      "workflow_profile: staged",
      "objective: integrate worker fan-out",
      "verification:",
      "  required_checks:",
      "    - name: merged-products",
      "      command: node -e \"const f=require('node:fs');if(f.readFileSync('src/a.ts','utf8').trim()!=='worker'||f.readFileSync('src/b.ts','utf8').trim()!=='worker')process.exit(1)\"",
      "shape: team",
      "team:",
      "  workers:",
      "    - role: backend",
      "      adapter: hermes",
      "    - role: frontend",
      "      adapter: codex",
      "  leader:",
      "    role: integrator",
      "    adapter: hermes",
    ].join("\n") + "\n", "utf-8");
    await execFileP("git", ["add", "-A"], { cwd: ROOT });
    await execFileP("git", ["commit", "-m", "seed mission"], { cwd: ROOT });
    const contexts: Array<{ artifactRoot: string; runId: string }> = [];
    const runner = (_adapter: string) => async (
      _a: string,
      workerRoot: string,
      _missionPath: string,
      context: { artifactRoot: string; runId: string },
    ): Promise<TeamRuntimeRunResult> => {
      contexts.push(context);
      const missionDir = join(context.artifactRoot, ".harness", "missions", "team-mission");
      const runDir = join(missionDir, "runs", context.runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "runtime-final.txt"), "worker complete\n", "utf-8");
      await writeFile(join(runDir, "runtime-result.yaml"), [
        "schema_version: uh.runtime-result.v0",
        "mission_id: team-mission",
        "runtime: oh-my-pi",
        "status: passed",
        "started_at: 2026-01-01T00:00:00.000Z",
        "finished_at: 2026-01-01T00:00:01.000Z",
        "exit_code: 0",
        "prompt_path: prompt.md",
        "stdout_path: stdout.log",
        "stderr_path: stderr.log",
        "diff_path: diff.patch",
        "errors: []",
        "provider: openai-codex",
        "model: gpt-5.6-luna",
        "usage:",
        "  input_tokens: 10",
        "  output_tokens: 2",
        "  total_tokens: 12",
        "  source: runtime",
        "  provider: openai-codex",
        "  model: gpt-5.6-luna",
        "  cost_usd: 0.1",
        "cost_usd: 0.1",
      ].join("\n"), "utf-8");
      await mkdir(join(workerRoot, "src"), { recursive: true });
      await writeFile(join(workerRoot, "src", `${workerRoot.endsWith("backend") ? "a" : "b"}.ts`), "worker\n", "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" }, runId: context.runId };
    };
    const verifier = (workerRoot: string, missionId: string) =>
      verifyMission(workerRoot, missionId, { useSandbox: false });

    const result = await runTeamMission(mission("team-mission"), ROOT, {
      runnerFor: runner,
      verifier,
      retainOnSuccess: false,
    });

    expect(result.status).toBe("passed");
    expect(result.retained).toBe(false);
    expect(result.verification).toMatchObject({ status: "passed", checks_total: 1, checks_passed: 1 });
    expect(result.runId).toBeTypeOf("string");
    expect(contexts).toHaveLength(2);
    expect(new Set(contexts.map((context) => context.artifactRoot)).size).toBe(2);
    for (const context of contexts) {
      await readFile(join(context.artifactRoot, ".harness", "missions", "team-mission", "runs", context.runId, "runtime-result.yaml"), "utf-8");
    }
    const parentRunDir = join(ROOT, ".harness", "missions", "team-mission", "runs", result.runId!);
    const state = JSON.parse(await readFile(join(parentRunDir, "team-state.json"), "utf-8"));
    expect(state).toMatchObject({ mission_id: "team-mission", status: "passed", run_id: result.runId });
    expect(state.workers).toHaveLength(2);

    const latest = JSON.parse(await readFile(join(ROOT, ".harness", "missions", "team-mission", "latest.json"), "utf-8"));
    expect(latest).toMatchObject({ run_id: result.runId, status: "passed" });
    const index = JSON.parse(await readFile(join(ROOT, ".harness", "missions", "team-mission", "runs", "index.json"), "utf-8"));
    expect(index.runs.filter((entry: { run_id: string }) => entry.run_id === result.runId)).toHaveLength(1);
    const snapshot = await projectDeliveryObservatory(ROOT, { now: "2026-01-01T00:00:02.000Z" });
    expect(snapshot.work_items[0]).toMatchObject({
      operation: "succeeded",
      phase: "verify",
      resolved_model: { state: "known", value: "gpt-5.6-luna" },
      provider: { state: "known", value: "openai-codex" },
      tokens: { state: "known", value: 24 },
      cost: { state: "known", value: 0.2 },
    });
    expect(snapshot.agents.filter((agent) => agent.operation === "succeeded")).toHaveLength(3);
  });
});
