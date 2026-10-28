/**
 * `uh land` — a gated cherry-pick of verified worker branches.
 *
 * Every scenario drives real `git` inside throwaway repositories (never the
 * repository under test) and injects a fake check/build runner, so the real
 * full suite and build never run here.
 *
 * Collected independent reviews live in the main checkout
 * (`.harness/missions/<review-id>/`), exactly where `uh mission review-collect`
 * writes them, never in the worker worktree.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import {
  IndependentReviewAssessmentSchema,
  IndependentReviewRequestSchema,
} from "../src/schema/independent-review.js";
import { landWorkerBranches, ReviewGateError, verifyLandDecisionChain, type LandCommandRunner, type LandOptions } from "../src/harness/land.js";
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
  await writeFile(join(root, ".gitignore"), ".harness/\n", "utf-8");
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

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

type ReviewFixture = {
  reviewId: string;
  missionId: string;
  sourceRoot: string;
  changedPath: string;
  changedSha256: string;
  requestSha256?: string;
  recommendation?: "pass" | "needs-attention" | "needs-remediation";
  verdicts: string[];
  /** A review that captured no output or changed file at all. */
  omitChanged?: boolean;
  /** The commit the review's source workspace was at (`source_head` in the request). */
  sourceHead?: string;
};

/**
 * Write a collected review whose request and assessment are shaped by the
 * canonical schemas, plus the request digest the assessment must carry.
 */
async function writeCollectedReview(root: string, fixture: ReviewFixture): Promise<void> {
  const reviewDir = join(root, ".harness", "missions", fixture.reviewId);
  await mkdir(reviewDir, { recursive: true });
  const request = IndependentReviewRequestSchema.parse({
    schema_version: "uh.independent-review-request.v0",
    review_id: fixture.reviewId,
    sources: [{
      mission_id: fixture.missionId,
      source_root: fixture.sourceRoot,
      files: [
        { kind: "contract", state: "present",
          original_path: `.harness/missions/${fixture.missionId}/mission.yaml`,
          snapshot_path: "inputs/contract.yaml", sha256: "0".repeat(64) },
        ...(fixture.omitChanged ? [] : [{ kind: "changed", state: "present", original_path: fixture.changedPath,
          snapshot_path: "inputs/changed-0.txt", sha256: fixture.changedSha256 }]),
      ],
      ...(fixture.sourceHead !== undefined ? { source_head: fixture.sourceHead } : {}),
      reference_paths: [],
      acceptance: [],
      checks: [],
    }],
  });
  const requestText = `${JSON.stringify(request, null, 2)}\n`;
  await writeFile(join(reviewDir, "review-request.json"), requestText, "utf-8");
  const assessment = IndependentReviewAssessmentSchema.parse({
    schema_version: "uh.independent-review-assessment.v0",
    review_id: fixture.reviewId,
    run_id: "run-1",
    request_sha256: fixture.requestSha256 ?? sha256(requestText),
    recommendation: fixture.recommendation ?? (fixture.verdicts.includes("contradicted") ? "needs-remediation" : "pass"),
    human_acceptance_required: true,
    claims: fixture.verdicts.map((verdict, index) => ({
      source: fixture.missionId, claim: `claim ${index}`, verdict, evidence_source: "out/report.json",
    })),
  });
  await writeFile(join(reviewDir, "review-assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`, "utf-8");
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
  reviewMissionId?: string;
  reviewSha256?: string;
  reviewRequestSha256?: string;
  reviewChangedPath?: string;
  reviewInWorktree?: boolean;
  reviewRecommendation?: ReviewFixture["recommendation"];
};

async function setup(options: SetupOptions = {}): Promise<{ worktree: string; messageFile: string; missionId: string; reviewId: string }> {
  await initRepo(ROOT);
  await makeWorkerBranch(ROOT, "work", options.diffFiles ?? { "feature.txt": "feature\n" }, "feat: add feature");
  // Worker worktrees live inside the owning project's .harness, as team runs create them.
  const worktree = join(ROOT, ".harness", "missions", "team-a", "team", "workers", "wt-work");
  await gitQuiet(ROOT, ["worktree", "add", "-q", worktree, "work"]);
  const missionId = options.missionId ?? "mission-a";
  const reviewId = options.reviewId ?? "review-a";
  if (options.verificationStatus !== null) {
    await writeVerification(worktree, missionId, options.verificationStatus ?? "passed");
  }
  if (options.reviewVerdicts !== null) {
    const changedPath = options.reviewChangedPath ?? "feature.txt";
    const changedSha256 = options.reviewSha256 ?? sha256(await git(ROOT, ["show", `work:${changedPath}`]));
    await writeCollectedReview(options.reviewInWorktree ? worktree : ROOT, {
      reviewId,
      missionId: options.reviewMissionId ?? missionId,
      sourceRoot: await realpath(worktree),
      changedPath,
      changedSha256,
      requestSha256: options.reviewRequestSha256,
      recommendation: options.reviewRecommendation,
      verdicts: options.reviewVerdicts ?? ["supported"],
    });
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
    reviewRoot: ROOT,
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
  // Real path: git reports worktree paths resolved (macOS /private/var).
  WORK = await realpath(await mkdtemp(join(tmpdir(), "uh-land-work-")));
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

  test("refuses a non-passing review even when all its claims are supported", async () => {
    const { messageFile } = await setup({ reviewRecommendation: "needs-attention" });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/recommends needs-attention, not pass/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("U-409: a clean review does not outvote another review of the same tip that contradicts it", async () => {
    const { messageFile, worktree, missionId } = await setup({ reviewVerdicts: ["supported"] });
    const changedSha256 = sha256(await git(ROOT, ["show", "work:feature.txt"]));
    await writeCollectedReview(ROOT, {
      reviewId: "review-b", missionId, sourceRoot: await realpath(worktree),
      changedPath: "feature.txt", changedSha256, verdicts: ["supported", "contradicted"],
    });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/contradicted/i);

    expect(await head(ROOT)).toBe(before);
  });

  test("U-409: a review of an older tip does not block a clean review of this one", async () => {
    const { messageFile, worktree, missionId } = await setup({ reviewVerdicts: ["supported"] });
    await writeCollectedReview(ROOT, {
      reviewId: "review-old", missionId, sourceRoot: await realpath(worktree),
      changedPath: "feature.txt", changedSha256: "f".repeat(64), verdicts: ["contradicted"],
    });
    const before = await head(ROOT);
    const result = await runLand({ messageFile });
    expect(result.accepted_review).toBeUndefined();
    expect(await head(ROOT)).not.toBe(before);
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
    // The decision file and its chained index are the only harness state left behind.
    const landDir = join(ROOT, ".harness", "land");
    const entries = (await readdir(landDir)).sort();
    expect(entries).toHaveLength(2);
    expect(entries).toContain("decisions.ndjson");
    expect(verifyLandDecisionChain(ROOT)).toBeUndefined();
  });

  test("the decision index re-hashes the receipts it lists: an edited or deleted receipt breaks it (#265)", async () => {
    const { messageFile } = await setup({ reviewVerdicts: ["contradicted"] });
    const result = await runLand({ messageFile, acceptReview: "reviewed by hand; accepted" });
    const receipt = result.accepted_review!.path;
    expect(verifyLandDecisionChain(ROOT)).toBeUndefined();

    const original = await readFile(receipt, "utf-8");
    await writeFile(receipt, original.replace("reviewed by hand; accepted", "nothing to see here"), "utf-8");
    expect(verifyLandDecisionChain(ROOT)?.reason).toMatch(/does not match/i);

    await rm(receipt, { force: true });
    expect(verifyLandDecisionChain(ROOT)?.reason).toMatch(/missing/i);
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

  test("a successful land removes the landed worker's worktree and keeps its branch", async () => {
    const { messageFile, worktree } = await setup();

    const result = await runLand({ messageFile });

    expect(result.removed_worktrees).toEqual([worktree]);
    expect(await fileExists(worktree)).toBe(false);
    expect(await git(ROOT, ["worktree", "list", "--porcelain"])).not.toContain("wt-work");
    expect((await git(ROOT, ["branch", "--list", "work"])).trim()).toContain("work");
  });

  test("--keep-worktrees keeps the landed worker's worktree", async () => {
    const { messageFile, worktree } = await setup();

    const result = await runLand({ messageFile, keepWorktrees: true });

    expect(result.removed_worktrees).toEqual([]);
    expect(await fileExists(worktree)).toBe(true);
  });

  test("a refused land keeps the worker's worktree", async () => {
    const { messageFile, worktree } = await setup();

    await expect(runLand({ messageFile, runCommand: fakeRunner(["bun run test"]) })).rejects.toThrow();

    expect(await fileExists(worktree)).toBe(true);
  });

  test("a team's leader worktree goes once none of its worker worktrees remain", async () => {
    await initRepo(ROOT);
    await makeWorkerBranch(ROOT, "uh/team/t1/backend", { "backend.txt": "b\n" }, "feat: backend");
    await makeWorkerBranch(ROOT, "uh/team/t1/frontend", { "frontend.txt": "f\n" }, "feat: frontend");
    await gitQuiet(ROOT, ["branch", "uh/team/t1/leader", "main"]);
    const backend = join(WORK, "backend");
    const frontend = join(WORK, "frontend");
    const leader = join(WORK, "leader");
    for (const [branch, dir] of [["uh/team/t1/backend", backend], ["uh/team/t1/frontend", frontend], ["uh/team/t1/leader", leader]]) {
      await gitQuiet(ROOT, ["worktree", "add", "-q", dir, branch]);
    }
    for (const [dir, id] of [[backend, "backend"], [frontend, "frontend"]]) {
      await writeVerification(dir, id, "passed");
      await writeCollectedReview(ROOT, {
        reviewId: `review-${id}`, missionId: id, sourceRoot: dir, changedPath: `${id}.txt`,
        changedSha256: sha256(await git(ROOT, ["show", `uh/team/t1/${id}:${id}.txt`])), verdicts: ["supported"],
      });
    }
    const messageFile = join(WORK, "message.txt");
    await writeFile(messageFile, "feat: land team\n", "utf-8");

    const first = await runLand({ messageFile, workerBranches: ["uh/team/t1/backend"] });
    expect(first.removed_worktrees).toEqual([backend]);
    expect(await fileExists(leader)).toBe(true);

    const second = await runLand({ messageFile, workerBranches: ["uh/team/t1/frontend"] });
    expect(second.removed_worktrees).toEqual([frontend, leader]);
    expect(await fileExists(leader)).toBe(false);
  });

  test("fast-forwards a second checkout to the landed target", async () => {
    const { messageFile } = await setup();
    const mirror = join(WORK, "mirror");
    await gitQuiet(ROOT, ["worktree", "add", "-q", "-b", "mirror", mirror, "main"]);

    const result = await runLand({ messageFile, fastForward: [mirror] });

    expect(result.fast_forwarded).toEqual([mirror]);
    expect(await head(mirror)).toBe(await head(ROOT));
  });

  test("a failed fast-forward of a later checkout puts every earlier checkout back, not just the target (#263)", async () => {
    const { messageFile } = await setup();
    const first = join(WORK, "mirror-first");
    const second = join(WORK, "mirror-second");
    await gitQuiet(ROOT, ["worktree", "add", "-q", "-b", "mirror-first", first, "main"]);
    await gitQuiet(ROOT, ["worktree", "add", "-q", "-b", "mirror-second", second, "main"]);
    // The second checkout has its own commit, so it cannot fast-forward to the landed target.
    await writeFile(join(second, "local.txt"), "local\n", "utf-8");
    await gitQuiet(second, ["add", "local.txt"]);
    await gitQuiet(second, ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "local work"]);
    const before = { root: await head(ROOT), first: await head(first), second: await head(second) };

    await expect(runLand({ messageFile, fastForward: [first, second] })).rejects.toThrow(/fast-forward/i);

    expect(await head(ROOT)).toBe(before.root);
    expect(await head(first)).toBe(before.first);
    expect(await head(second)).toBe(before.second);
  });

  test("a worker file that is not valid UTF-8 binds to a review of its exact bytes (#264)", async () => {
    const { worktree, messageFile, missionId } = await setup({ reviewVerdicts: null });
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x81, 0xc3, 0x28]);
    await writeFile(join(worktree, "blob.bin"), bytes);
    await gitQuiet(worktree, ["add", "blob.bin"]);
    await gitQuiet(worktree, ["commit", "-q", "-m", "binary"]);
    await writeCollectedReview(ROOT, {
      reviewId: "review-bin", missionId, sourceRoot: await realpath(worktree),
      changedPath: "blob.bin", changedSha256: createHash("sha256").update(bytes).digest("hex"), verdicts: ["supported"],
    });
    const result = await runLand({ messageFile });
    expect(result.status).toBe("landed");
  });

  test("a file git writes with CRLF in the worker's tree binds to a review of those bytes (#264)", async () => {
    const { worktree, messageFile, missionId } = await setup({
      reviewVerdicts: null,
      diffFiles: { "feature.txt": "feature\n", ".gitattributes": "*.crlf text eol=crlf\n", "doc.crlf": "a\nb\n" },
    });
    // The worker's checkout holds CRLF, because of the attribute; the branch's blob holds LF.
    await rm(join(worktree, "doc.crlf"), { force: true });
    await gitQuiet(worktree, ["checkout", "--", "doc.crlf"]);
    const onDisk = await readFile(join(worktree, "doc.crlf"));
    expect(onDisk.toString("latin1")).toBe("a\r\nb\r\n");
    await writeCollectedReview(ROOT, {
      reviewId: "review-crlf", missionId, sourceRoot: await realpath(worktree),
      changedPath: "doc.crlf", changedSha256: createHash("sha256").update(onDisk).digest("hex"), verdicts: ["supported"],
    });
    const result = await runLand({ messageFile });
    expect(result.status).toBe("landed");
  });

  test("a review that captured no file binds to nothing and is refused (#264)", async () => {
    const { worktree, messageFile, missionId } = await setup({ reviewVerdicts: null });
    await writeCollectedReview(ROOT, {
      reviewId: "review-empty", missionId, sourceRoot: await realpath(worktree),
      changedPath: "feature.txt", changedSha256: "0".repeat(64), verdicts: ["supported"], omitChanged: true,
    });
    await expect(runLand({ messageFile })).rejects.toThrow(/captured no output or changed file|binds to nothing/i);
  });

  test("a review of a commit that is not part of the branch is refused, one of an ancestor or the tip binds (#264)", async () => {
    const { worktree, messageFile, missionId } = await setup({ reviewVerdicts: null });
    const changed = sha256(await git(ROOT, ["show", "work:feature.txt"]));
    const sourceRoot = await realpath(worktree);
    const review = (reviewId: string, sourceHead: string) => writeCollectedReview(ROOT, {
      reviewId, missionId, sourceRoot, changedPath: "feature.txt", changedSha256: changed, verdicts: ["supported"], sourceHead,
    });
    await review("review-elsewhere", "1".repeat(40));
    await expect(runLand({ messageFile })).rejects.toThrow(/not part of|is not an ancestor/i);
    const tip = (await git(ROOT, ["rev-parse", "work"])).trim();
    await rm(join(ROOT, ".harness", "missions", "review-elsewhere"), { recursive: true, force: true });
    await review("review-tip", tip);
    expect((await runLand({ messageFile })).status).toBe("landed");
  });

  test("--accept-review records no review ids when none of the collected reviews names this mission (#264)", async () => {
    const { messageFile } = await setup({ reviewMissionId: "some-other-mission" });
    const result = await runLand({ messageFile, acceptReview: "reviewed by hand; accepted" });
    expect(result.status).toBe("landed");
    const decision = JSON.parse(await readFile(result.accepted_review!.path, "utf-8")) as { review_ids: string[] };
    expect(decision.review_ids).toEqual([]);
  });

  describe("which mission a team worker's branch belongs to (#264)", () => {
    /** A team branch whose worktree's own verification.yaml names `claimedMission`, as a worker could write it. */
    async function teamBranch(claimedMission: string) {
      await initRepo(ROOT);
      const branch = "uh/team/team-a/backend";
      await makeWorkerBranch(ROOT, branch, { "feature.txt": "feature\n" }, "feat: add feature");
      const worktree = join(ROOT, ".harness", "missions", "team-a", "team", "workers", "wt-backend");
      await gitQuiet(ROOT, ["worktree", "add", "-q", worktree, branch]);
      await writeVerification(worktree, claimedMission, "passed");
      // The controller's own record of the team, which a worker cannot reach.
      const runDir = join(ROOT, ".harness", "missions", "team-a", "runs", "run-1");
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "team-state.json"), JSON.stringify({
        schema_version: "uh.team-run.v0", mission_id: "team-a",
        workers: [{ id: "backend", role: "backend", mission_id: "worker-backend" }],
      }), "utf-8");
      const messageFile = join(WORK, "message.txt");
      await writeFile(messageFile, "feat: land worker\n", "utf-8");
      const changedSha256 = sha256(await git(ROOT, ["show", `${branch}:feature.txt`]));
      return { branch, worktree, messageFile, changedSha256 };
    }

    test("a review of a mission the worker only claims in its own verification file does not bind", async () => {
      const { branch, worktree, messageFile, changedSha256 } = await teamBranch("evil-mission");
      await writeCollectedReview(ROOT, {
        reviewId: "review-evil", missionId: "evil-mission", sourceRoot: await realpath(worktree),
        changedPath: "feature.txt", changedSha256, verdicts: ["supported"],
      });
      await expect(runLand({ messageFile, workerBranches: [branch] })).rejects.toThrow(/worker-backend/);
    });

    test("a review of the mission the team state names binds, whatever the worker's file says", async () => {
      const { branch, worktree, messageFile, changedSha256 } = await teamBranch("evil-mission");
      await writeCollectedReview(ROOT, {
        reviewId: "review-real", missionId: "worker-backend", sourceRoot: await realpath(worktree),
        changedPath: "feature.txt", changedSha256, verdicts: ["supported"],
      });
      expect((await runLand({ messageFile, workerBranches: [branch] })).status).toBe("landed");
    });
  });

  test("lands when the collected review names the worker's mission", async () => {
    const { messageFile } = await setup();

    // No explicit review root: it must resolve to the main checkout on its own.
    const result = await runLand({ messageFile, reviewRoot: undefined });

    expect(result.status).toBe("landed");
  });

  test("reads reviews from the project that owns the worker worktree, not the checkout git's common dir points at", async () => {
    await initRepo(ROOT);
    await makeWorkerBranch(ROOT, "work", { "feature.txt": "feature\n" }, "feat: add feature");
    // The uh project is itself a linked worktree of ROOT, as when a project is checked out beside another.
    const project = join(WORK, "project");
    await gitQuiet(ROOT, ["worktree", "add", "-q", "-b", "target", project, "main"]);
    const worktree = join(project, ".harness", "missions", "team-a", "team", "workers", "wt-work");
    await gitQuiet(ROOT, ["worktree", "add", "-q", worktree, "work"]);
    await writeVerification(worktree, "mission-a", "passed");
    await writeCollectedReview(project, {
      reviewId: "review-a",
      missionId: "mission-a",
      sourceRoot: worktree,
      changedPath: "feature.txt",
      changedSha256: sha256(await git(ROOT, ["show", "work:feature.txt"])),
      verdicts: ["supported"],
    });
    const messageFile = join(WORK, "message.txt");
    await writeFile(messageFile, "feat: land work\n", "utf-8");

    const result = await runLand({ root: project, onto: "target", messageFile, reviewRoot: undefined });

    expect(result.status).toBe("landed");
  });

  test("refuses a collected review that names another mission id", async () => {
    const { messageFile, reviewId } = await setup({ reviewMissionId: "other-mission" });
    const before = await head(ROOT);

    const error = await runLand({ messageFile }).catch((err) => err);

    expect(error).toBeInstanceOf(ReviewGateError);
    expect((error as Error).message).toContain(reviewId);
    expect((error as Error).message).toContain("other-mission");
    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("refuses another worker's review even when the team mission and changed bytes match", async () => {
    const { messageFile, missionId } = await setup({ reviewVerdicts: null });
    await makeWorkerBranch(ROOT, "other-worker", { "feature.txt": "feature\n" }, "feat: same feature");
    const otherWorktree = join(WORK, "other-worker");
    await gitQuiet(ROOT, ["worktree", "add", "-q", otherWorktree, "other-worker"]);
    await writeCollectedReview(ROOT, {
      reviewId: "review-other-worker",
      missionId,
      sourceRoot: otherWorktree,
      changedPath: "feature.txt",
      changedSha256: sha256(await git(ROOT, ["show", "other-worker:feature.txt"])),
      verdicts: ["supported"],
    });
    const before = await head(ROOT);

    await expect(runLand({ messageFile })).rejects.toThrow(/no collected independent review.*worktree/i);

    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("refuses when a captured snapshot hash differs from the branch tip", async () => {
    const { messageFile, reviewId } = await setup({ reviewSha256: "b".repeat(64) });
    const before = await head(ROOT);

    const error = await runLand({ messageFile }).catch((err) => err);

    expect(error).toBeInstanceOf(ReviewGateError);
    expect((error as Error).message).toContain(reviewId);
    expect((error as Error).message).toContain("feature.txt");
    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("refuses when the assessment digest does not match the review request", async () => {
    const { messageFile, reviewId } = await setup({ reviewRequestSha256: "c".repeat(64) });
    const before = await head(ROOT);

    const error = await runLand({ messageFile }).catch((err) => err);

    expect(error).toBeInstanceOf(ReviewGateError);
    expect((error as Error).message).toContain(reviewId);
    expect((error as Error).message).toContain("review-request.json");
    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("ignores a collected review that exists only inside the worker worktree", async () => {
    const { messageFile } = await setup({ reviewInWorktree: true });
    const before = await head(ROOT);

    const error = await runLand({ messageFile }).catch((err) => err);

    expect(error).toBeInstanceOf(ReviewGateError);
    expect((error as Error).message).toMatch(/no collected independent review/i);
    expect(await head(ROOT)).toBe(before);
    expect(await status(ROOT)).toBe("");
  });

  test("--accept-review writes the decision into the main checkout", async () => {
    const { messageFile, reviewId, worktree } = await setup({ reviewVerdicts: ["contradicted"] });

    const result = await runLand({ messageFile, acceptReview: "operator override", reviewRoot: ROOT });

    expect(result.status).toBe("landed");
    const decisionFile = result.accepted_review!.path;
    expect(await fileExists(decisionFile)).toBe(true);
    expect(decisionFile.startsWith(join(ROOT, ".harness", "land"))).toBe(true);
    // The decision lives in the main checkout, never the worker worktree.
    expect(await fileExists(join(worktree, ".harness", "land"))).toBe(false);
    const decision = JSON.parse(await readFile(decisionFile, "utf-8"));
    expect(decision.review_ids).toEqual([reviewId]);
    expect(decision.reason).toBe("operator override");
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
