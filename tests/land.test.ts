/**
 * `uh land` — a gated cherry-pick of verified worker branches.
 *
 * Every scenario drives real `git` inside throwaway repositories (never the
 * repository under test) and injects a fake check/build runner, so the real
 * full suite and build never run here.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import { landWorkerBranches, type LandCommandRunner, type LandOptions } from "../src/harness/land.js";
import { defaultGitOps } from "../src/harness/team-run.js";

const execFileP = promisify(execFile);
const IDENTITY = { name: "Land Tester", email: "land@example.com" };

let ROOT: string;
let WORK: string;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", cwd, ...args]);
  return stdout;
}

async function gitQuiet(cwd: string, args: string[]): Promise<void> {
  await execFileP("git", ["-C", cwd, ...args]);
}

async function initRepo(root: string): Promise<void> {
  await gitQuiet(root, ["init", "-q", "-b", "main"]);
  await gitQuiet(root, ["config", "user.email", IDENTITY.email]);
  await gitQuiet(root, ["config", "user.name", IDENTITY.name]);
  await gitQuiet(root, ["config", "commit.gpgsign", "false"]);
  await gitQuiet(root, ["config", "core.autocrlf", "false"]);
  await writeFile(join(root, "README.md"), "# seed\n", "utf-8");
  await gitQuiet(root, ["add", "-A"]);
  await gitQuiet(root, ["commit", "-q", "-m", "seed"]);
}

async function makeWorkerBranch(root: string, branch: string, files: Record<string, string>, message: string): Promise<void> {
  await gitQuiet(root, ["checkout", "-q", "-b", branch, "main"]);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  await gitQuiet(root, ["add", "-A"]);
  await gitQuiet(root, ["commit", "-q", "-m", message]);
  await gitQuiet(root, ["checkout", "-q", "main"]);
}

async function writeVerification(worktree: string, missionId: string, status: string): Promise<void> {
  const dir = join(worktree, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "verification.yaml"), stringifyYaml({
    schema_version: "uh.verification-result.v0",
    mission_id: missionId,
    status,
    checks: [{ name: "typecheck", type: "command", status }],
  }), "utf-8");
}

async function writeReview(worktree: string, reviewId: string, verdicts: string[]): Promise<void> {
  const dir = join(worktree, ".harness", "missions", reviewId);
  await mkdir(dir, { recursive: true });
  const contradicted = verdicts.includes("contradicted");
  await writeFile(join(dir, "review-assessment.json"), JSON.stringify({
    schema_version: "uh.independent-review-assessment.v0",
    review_id: reviewId,
    run_id: "run-1",
    request_sha256: "a".repeat(64),
    recommendation: contradicted ? "needs-remediation" : "pass",
    human_acceptance_required: true,
    claims: verdicts.map((verdict, index) => ({ source: "work", claim: `claim ${index}`, verdict, evidence_source: "out/report.json" })),
  }, null, 2) + "\n", "utf-8");
}

function fakeRunner(failing: string[] = []): LandCommandRunner {
  return async (command: string) => ({
    exitCode: failing.includes(command) ? 1 : 0,
    stdout: "",
    stderr: failing.includes(command) ? `${command} failed` : "",
  });
}

type SetupOptions = {
  verificationStatus?: string | null;
  reviewVerdicts?: string[] | null;
  diffFiles?: Record<string, string>;
  message?: string;
  missionId?: string;
  reviewId?: string;
};

async function setup(options: SetupOptions = {}): Promise<{ worktree: string; messageFile: string; missionId: string; reviewId: string }> {
  await initRepo(ROOT);
  await makeWorkerBranch(ROOT, "work", options.diffFiles ?? { "feature.txt": "feature\n" }, "feat: add feature");
  const worktree = join(WORK, "wt-work");
  await gitQuiet(ROOT, ["worktree", "add", "-q", worktree, "work"]);
  const missionId = options.missionId ?? "mission-a";
  const reviewId = options.reviewId ?? "review-a";
  if (options.verificationStatus !== null) {
    await writeVerification(worktree, missionId, options.verificationStatus ?? "passed");
  }
  if (options.reviewVerdicts !== null) {
    await writeReview(worktree, reviewId, options.reviewVerdicts ?? ["supported"]);
  }
  const messageFile = join(WORK, "message.txt");
  await writeFile(messageFile, options.message ?? "feat: land worker\n", "utf-8");
  return { worktree, messageFile, missionId, reviewId };
}

function runLand(overrides: Partial<LandOptions> & { messageFile: string }) {
  return landWorkerBranches({
    root: ROOT,
    workerBranches: ["work"],
    onto: "main",
    runCommand: fakeRunner(),
    ...overrides,
  });
}

async function head(root: string): Promise<string> {
  return (await git(root, ["rev-parse", "HEAD"])).trim();
}

async function status(root: string): Promise<string> {
  return (await git(root, ["status", "--porcelain"])).trim();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-land-repo-"));
  WORK = await mkdtemp(join(tmpdir(), "uh-land-work-"));
});

afterEach(async () => {
  if (WORK) await rm(WORK, { recursive: true, force: true });
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

describe("uh land", () => {
  test("refuses when the worker worktree has no passed verification", async () => {
    const { messageFile } = await setup({ verificationStatus: null });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/verification/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("refuses when the collected independent review has a contradicted claim", async () => {
    const { messageFile } = await setup({ reviewVerdicts: ["supported", "contradicted"] });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/contradicted/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("--accept-review records the decision file and lands past a contradicted review", async () => {
    const { messageFile, reviewId } = await setup({ reviewVerdicts: ["contradicted"] });

    const result = await runLand({ messageFile, acceptReview: "reviewed by hand; accepted" });

    expect(result.status).toBe("landed");
    expect(result.accepted_review).toBeDefined();
    const decisionFile = result.accepted_review!.path;
    const decision = JSON.parse(await readFile(decisionFile, "utf-8"));
    expect(decision).toMatchObject({
      branches: ["work"],
      reason: "reviewed by hand; accepted",
      review_ids: [reviewId],
    });
    // The decision file is the only harness state left behind.
    const landDir = join(ROOT, ".harness", "land");
    expect(await readdir(landDir)).toHaveLength(1);
  });

  test("a forbidden pattern in the diff restores the target byte-for-byte", async () => {
    const { messageFile } = await setup({
      diffFiles: { "feature.txt": "feature\nCo-authored-by: Bot <bot@example.com>\n" },
    });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/forbidden|co-authored-by/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
    expect(await fileExists(join(ROOT, "feature.txt"))).toBe(false);
  });

  test("a forbidden pattern in the message file restores the target byte-for-byte", async () => {
    const { messageFile } = await setup({ message: "chore: land\nGenerated with a tool\n" });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/forbidden|generated with/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
    expect(await fileExists(join(ROOT, "feature.txt"))).toBe(false);
  });

  test("a failing check restores the target byte-for-byte", async () => {
    const { messageFile } = await setup();
    const before = await head(ROOT);

    await expect(runLand({ messageFile, runCommand: fakeRunner(["bun run test"]) }))
      .rejects.toThrow(/checks|test/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
    expect(await fileExists(join(ROOT, "feature.txt"))).toBe(false);
  });

  test("success commits with the configured identity as author and committer", async () => {
    const { messageFile } = await setup();
    const before = await head(ROOT);

    const result = await runLand({ messageFile });

    expect(result.status).toBe("landed");
    expect(result.previous_head).toBe(before);
    expect(result.commit).not.toBe(before);
    expect(result.checks.map((check) => check.name)).toEqual(["typecheck", "test"]);
    expect(result.build.exit_code).toBe(0);

    expect((await git(ROOT, ["log", "-1", "--format=%an|%ae|%cn|%ce"])).trim())
      .toBe(`${IDENTITY.name}|${IDENTITY.email}|${IDENTITY.name}|${IDENTITY.email}`);
    expect((await git(ROOT, ["log", "-1", "--format=%s"])).trim()).toBe("feat: land worker");
  });

  test("fast-forwards a second checkout to the landed target", async () => {
    const { messageFile } = await setup();
    const mirror = join(WORK, "mirror");
    await gitQuiet(ROOT, ["worktree", "add", "-q", "-b", "mirror", mirror, "main"]);

    const result = await runLand({ messageFile, fastForward: [mirror] });

    expect(result.fast_forwarded).toEqual([mirror]);
    expect(await head(mirror)).toBe(await head(ROOT));
  });
});

describe("team worker identity (A8)", () => {
  test("commits under the repository's configured identity", async () => {
    await initRepo(ROOT);
    await writeFile(join(ROOT, "worker.txt"), "work\n", "utf-8");

    await defaultGitOps.commitAll(ROOT, "team(worker): run");

    expect((await git(ROOT, ["log", "-1", "--format=%an|%ae"])).trim())
      .toBe(`${IDENTITY.name}|${IDENTITY.email}`);
  });

  test("falls back to the literal identity only when none is configured", async () => {
    await gitQuiet(ROOT, ["init", "-q", "-b", "main"]);
    await writeFile(join(ROOT, "worker.txt"), "work\n", "utf-8");

    const emptyConfig = join(WORK, "empty-gitconfig");
    await writeFile(emptyConfig, "", "utf-8");
    const previousGlobal = process.env.GIT_CONFIG_GLOBAL;
    const previousSystem = process.env.GIT_CONFIG_NOSYSTEM;
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      await defaultGitOps.commitAll(ROOT, "team(worker): run");
    } finally {
      if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previousGlobal;
      if (previousSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
      else process.env.GIT_CONFIG_NOSYSTEM = previousSystem;
    }

    expect((await git(ROOT, ["log", "-1", "--format=%an|%ae"])).trim())
      .toBe("uh team worker|uh-team@example.com");
  });
});
