/**
 * Team commit hygiene — a worker's commit must contain only the worker's work.
 *
 * `uh mission run-team` commits each worker's worktree with `git add -A`. The
 * harness itself writes files into the worker root (`.commandcode/settings.json`,
 * `.harness/.gitignore`, derived/re-seeded mission packets) and a repository may
 * already track `.harness/audit/events.ndjson`. A blind `git add -A` sweeps those
 * into the worker commit and onto the leader branch — leaking absolute local
 * paths and bookkeeping no worker authored.
 *
 * These tests drive real `git` inside a throwaway repository (never the repo
 * under test) and assert the worker commit is exactly the worker's own work.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  runTeamMission,
  type TeamMission,
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
  await writeFile(join(dir, "mission.yaml"), [
    "schema_version: uh.mission.v0",
    `id: ${missionId}`,
    "title: Team Mission",
    "workflow_profile: staged",
    "objective: integrate worker fan-out",
  ].join("\n") + "\n", "utf-8");
}

/** A mission packet with a single worker, so branch assertions stay simple. */
function singleWorkerMission(id: string): TeamMission {
  return {
    id,
    team: {
      workers: [{ role: "backend", adapter: "hermes" }],
      leader: { adapter: "hermes" },
    },
  };
}

const passingVerifier = async (): Promise<VerifyMissionLike> => ({
  status: "passed",
  path: "/fake/verification.yaml",
  checks_total: 1, checks_passed: 1, checks_failed: 0, checks_blocked: 0,
  acceptance_total: 0, acceptance_passed: 0, acceptance_failed_block: 0, acceptance_warn_failed: 0, acceptance_blocked: 0,
});

/** Files a branch changes relative to `base`, in stable order. */
async function changedFiles(root: string, base: string, branch: string): Promise<string[]> {
  const stdout = await git(root, ["diff", "--name-only", base, branch]);
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
}

async function treeFiles(root: string, branch: string): Promise<string[]> {
  const stdout = await git(root, ["ls-tree", "-r", "--name-only", branch]);
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** Content of a path as committed on `branch`; undefined when absent. */
async function committedFile(root: string, branch: string, path: string): Promise<string | undefined> {
  try {
    return await git(root, ["show", `${branch}:${path}`]);
  } catch {
    return undefined;
  }
}

/** Create a repository that tracks the audit log (an ignore rule can't cover it). */
async function seedTrackedAudit(root: string): Promise<void> {
  const auditPath = join(root, ".harness", "audit", "events.ndjson");
  await mkdir(join(auditPath, ".."), { recursive: true });
  await writeFile(auditPath, '{"event":"seed"}\n', "utf-8");
  await mkdir(join(root, ".commandcode"), { recursive: true });
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-q", "-m", "seed mission and tracked audit"]);
}

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-team-commit-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

describe("worker commit hygiene", () => {
  test("worker commit contains exactly the worker's own source, not harness-written protected files", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await seedTrackedAudit(ROOT);

    const runner = (_adapter: string) => async (_a: string, root: string): Promise<TeamRuntimeRunResult> => {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src", "x.ts"), "export const x = 1;\n", "utf-8");
      // The harness (or a guarded runtime) writes this into the worker root.
      await mkdir(join(root, ".commandcode"), { recursive: true });
      await writeFile(join(root, ".commandcode", "settings.json"), `{"cwd":"${root.replace(/\\/g, "/")}"}\n`, "utf-8");
      // Appending to a TRACKED protected file — the case `.gitignore` cannot mask.
      await appendFile(join(root, ".harness", "audit", "events.ndjson"), '{"event":"worker"}\n', "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
    };

    const result = await runTeamMission(singleWorkerMission("team-mission"), ROOT, {
      runnerFor: runner,
      verifier: passingVerifier,
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("succeeded");

    // The worker branch commit is exactly the worker's own source edit.
    expect(await changedFiles(ROOT, "HEAD", backend.plan.branch)).toEqual(["src/x.ts"]);

    // The untracked protected files the harness/runner wrote are not on the
    // branch at all, and the tracked audit log still holds its committed base
    // content (the worker's append / the harness's strip were not committed).
    expect(await treeFiles(ROOT, backend.plan.branch)).not.toContain(".commandcode/settings.json");
    expect(await committedFile(ROOT, backend.plan.branch, ".harness/audit/events.ndjson")).toBe('{"event":"seed"}\n');

    // "Files touched" in the integration report no longer lists those paths.
    expect(backend.filesTouched).toEqual(["src/x.ts"]);
    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toContain("`src/x.ts`");
    expect(report).not.toMatch(/events\.ndjson/);
    expect(report).not.toMatch(/\.commandcode/);
    expect(report).not.toMatch(/\.harness\//);
  });

  test("a worker that only touched protected paths produces no commit and is reported as touching no files", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await seedTrackedAudit(ROOT);
    const headBefore = (await git(ROOT, ["rev-parse", "HEAD"])).trim();

    const runner = (_adapter: string) => async (_a: string, root: string): Promise<TeamRuntimeRunResult> => {
      await mkdir(join(root, ".commandcode"), { recursive: true });
      await writeFile(join(root, ".commandcode", "settings.json"), "{}\n", "utf-8");
      await appendFile(join(root, ".harness", "audit", "events.ndjson"), '{"event":"worker"}\n', "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
    };

    const result = await runTeamMission(singleWorkerMission("team-mission"), ROOT, {
      runnerFor: runner,
      verifier: passingVerifier,
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("succeeded");

    // No worker commit was created: the branch still points at the base.
    expect((await git(ROOT, ["rev-parse", backend.plan.branch])).trim()).toBe(headBefore);
    expect(await changedFiles(ROOT, "HEAD", backend.plan.branch)).toEqual([]);

    expect(backend.filesTouched).toEqual([]);
    const report = await readFile(result.integrationReportPath, "utf-8");
    expect(report).toMatch(/Files touched: 0/);
    expect(report).not.toMatch(/events\.ndjson/);
    expect(report).not.toMatch(/\.commandcode/);
  });

  test("a modified tracked protected file is left unstaged and is not reset or restored", async () => {
    await initGitRepo(ROOT);
    await seedMissionPacket(ROOT, "team-mission");
    await mkdir(join(ROOT, ".commandcode"), { recursive: true });
    await writeFile(join(ROOT, ".commandcode", "settings.json"), '{"seed":true}\n', "utf-8");
    await git(ROOT, ["add", "-A"]);
    await git(ROOT, ["commit", "-q", "-m", "seed tracked settings"]);

    const runner = (_adapter: string) => async (_a: string, root: string): Promise<TeamRuntimeRunResult> => {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src", "x.ts"), "export const x = 1;\n", "utf-8");
      await writeFile(join(root, ".commandcode", "settings.json"), '{"worker":true}\n', "utf-8");
      return { exitCode: 0, stdout: "", stderr: "", result: { status: "passed" } };
    };

    const result = await runTeamMission(singleWorkerMission("team-mission"), ROOT, {
      runnerFor: runner,
      verifier: passingVerifier,
      retainOnSuccess: true,
    });

    const backend = result.workers[0];
    expect(backend.status).toBe("succeeded");

    // Only the worker's own source was committed; the tracked protected file
    // keeps its committed base content rather than the worker's edit.
    expect(await changedFiles(ROOT, "HEAD", backend.plan.branch)).toEqual(["src/x.ts"]);
    expect(await committedFile(ROOT, backend.plan.branch, ".commandcode/settings.json")).toBe('{"seed":true}\n');

    // The worktree keeps the worker's edit as unstaged evidence — the harness
    // must not reset or restore it.
    const onDisk = await readFile(join(backend.plan.worktreePath, ".commandcode", "settings.json"), "utf-8");
    expect(onDisk).toBe('{"worker":true}\n');
    const status = await git(backend.plan.worktreePath, ["status", "--porcelain"]);
    expect(status).toMatch(/\.commandcode\/settings\.json/);
  });
});
