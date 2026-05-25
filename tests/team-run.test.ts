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
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  planTeamRun,
  runTeamMission,
  seedWorkerRuntimeGitignore,
  type GitOps,
  type MergeOutcome,
  type TeamMission,
  type TeamRuntimeRunResult,
  type VerifyMissionLike,
  type WorkerOutcome,
} from "../src/harness/team-run.js";

const execFileP = promisify(execFile);

let ROOT: string;

async function initGitRepo(root: string): Promise<void> {
  await execFileP("git", ["init", "--initial-branch=main"], { cwd: root });
  await execFileP("git", ["config", "user.email", "uh-test@example.com"], { cwd: root });
  await execFileP("git", ["config", "user.name", "uh test"], { cwd: root });
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

/* ------------------------------------------------------ worker gitignore  */

describe("seedWorkerRuntimeGitignore", () => {
  test("creates scoped ignore rules for audit and mission runs", async () => {
    const wt = join(ROOT, "worker-wt");
    await mkdir(wt, { recursive: true });
    await seedWorkerRuntimeGitignore(wt, "m1");
    const text = await readFile(join(wt, ".gitignore"), "utf-8");
    expect(text).toContain(".harness/audit/");
    expect(text).toContain(".harness/missions/m1/runs/");
  });

  test("appends to an existing .gitignore without duplicating the marker", async () => {
    const wt = join(ROOT, "worker-wt-2");
    await mkdir(wt, { recursive: true });
    await writeFile(join(wt, ".gitignore"), "node_modules/\n", "utf-8");
    await seedWorkerRuntimeGitignore(wt, "m2");
    await seedWorkerRuntimeGitignore(wt, "m2");
    const text = await readFile(join(wt, ".gitignore"), "utf-8");
    expect(text.match(/# uh team-run worker runtime \(UH-128\)/g)).toHaveLength(1);
    expect(text).toContain("node_modules/");
    expect(text).toContain(".harness/missions/m2/runs/");
  });
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
    expect(plan.integrationReportPath.endsWith(".harness/missions/m1/team/integration-report.md")).toBe(true);
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

  test("uses integration_report_path override when provided", () => {
    const plan = planTeamRun(
      { ...mission("m1"), integration_report_path: "custom/place.md" },
      "/tmp/repo",
    );
    expect(plan.integrationReportPath).toBe("/tmp/repo/custom/place.md");
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
    expect(() => planTeamRun(
      { ...mission("m1"), integration_report_path: "../escape.md" },
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
    const id = root.split("/workers/")[1] ?? "unknown";
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

  test("conflict + verifier passes: status is still blocked (partial integration is not pass)", async () => {
    // Even when the partial-integration leader worktree passes verification,
    // a conflicted worker means the overall run cannot be `passed`.
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

    expect(result.status).toBe("blocked");
    expect(result.hadConflicts).toBe(true);
    // Verifier IS called now (was skipped pre-refactor) so reviewers can
    // see whether the partial integration was at least viable.
    expect(result.leaderRanVerification).toBe(true);
    expect(result.verification?.status).toBe("passed");
  });

  test("single-worker failure: leader skips that worker's merge and overall is blocked", async () => {
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

    expect(result.status).toBe("blocked");
    expect(result.hadConflicts).toBe(true);
    const frontend = result.workers.find((w) => w.plan.id === "frontend")!;
    expect(frontend.status).toBe("failed");
    expect(frontend.merge?.note).toMatch(/skipped: worker status=failed/);
    // Verifier runs on the partial integration so reviewers can see leader-side health.
    expect(result.leaderRanVerification).toBe(true);
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
});

/* ---------------------------------------------------------- real git smoke  */

describe("runTeamMission — real git (smoke)", () => {
  test("happy path against a real git repo: 2 workers, leader merges both", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await execFileP("git", ["add", "-A"], { cwd: ROOT });
    await execFileP("git", ["commit", "-m", "seed mission"], { cwd: ROOT });

    const runner = (_adapter: string) => async (_a: string, root: string, _missionPath: string) => {
      const id = root.split("/workers/")[1] ?? "unknown";
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

    for (const w of result.plan.workers) {
      const gi = await readFile(join(w.worktreePath, ".gitignore"), "utf-8");
      expect(gi).toContain(".harness/audit/");
      expect(gi).toContain(".harness/missions/team-mission/runs/");
    }

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
});
