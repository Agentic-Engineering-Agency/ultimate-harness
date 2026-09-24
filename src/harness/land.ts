import { access, appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import {
  IndependentReviewAssessmentSchema,
  IndependentReviewRequestSchema,
  type IndependentReviewRequest,
} from "../schema/independent-review.js";
import { LandSchema } from "../schema/project.js";
import { DEFAULT_PROTECTED_PATHS } from "../schema/runtime-control.js";
import { assertHiveChainsIntact, recordLandCommit } from "./hive.js";
import { harnessOwnerRoot } from "./hive-root.js";
import { chainEntry, lastChainedHash, readJsonLines, sha256Hex, verifyChainedLines, type ChainBreak } from "./hash-chain.js";
import { projectYaml } from "./paths.js";
import { removeWorktreeLinks } from "./worktree-links.js";

const execFileP = promisify(execFile);

/** The outcome of one injected command run. `exitCode` is 0 on success. */
export type LandCommandResult = { exitCode: number; stdout: string; stderr: string };
/** Runs `git` with `args` inside `cwd` (the real runner prefixes `git -C <cwd>`). */
export type LandGitRunner = (args: string[], cwd: string) => Promise<LandCommandResult>;
/** Runs a shell command line inside `cwd`. Injected so tests never run the real suite. */
export type LandCommandRunner = (command: string, cwd: string) => Promise<LandCommandResult>;

export const DEFAULT_LAND_CHECKS: ReadonlyArray<{ name: string; command: string }> = [
  { name: "typecheck", command: "bun run typecheck" },
  { name: "test", command: "bun run test" },
];
export const DEFAULT_LAND_BUILD = "bun run build";
export const DEFAULT_FORBIDDEN_PATTERNS: readonly string[] = [
  "co-authored-by",
  "anthropic",
  "claude-session",
  "generated with",
  "\u{1F916}",
];

const COMMAND_OUTPUT_CAP = 100_000;

export const defaultLandGitRunner: LandGitRunner = async (args, cwd) => {
  try {
    const { stdout, stderr } = await execFileP("git", ["-C", cwd, ...args], { maxBuffer: 32 * 1024 * 1024 });
    return { exitCode: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    return {
      exitCode: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout === undefined ? "" : String(e.stdout),
      stderr: e.stderr === undefined ? (e.message ?? "") : String(e.stderr),
    };
  }
};

export const defaultLandCommandRunner: LandCommandRunner = (command, cwd) =>
  new Promise<LandCommandResult>((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const append = (current: string, chunk: unknown): string => {
      if (current.length >= COMMAND_OUTPUT_CAP) return current;
      const next = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
      return (current + next).slice(0, COMMAND_OUTPUT_CAP);
    };
    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, stdout, stderr });
    };
    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (err) => { stderr = stderr || (err as Error).message; finish(1); });
    child.on("close", (code) => finish(code ?? 1));
  });

export type LandOptions = {
  root: string;
  workerBranches: readonly string[];
  onto: string;
  messageFile: string;
  acceptReview?: string;
  fastForward?: readonly string[];
  /**
   * Main checkout that owns the collected review assessments (the
   * `review-assessment.json` files under `.harness/missions`) and the
   * accepted-review decision receipts under `.harness/land`. Defaults to the
   * target worktree's common git directory parent.
   */
  reviewRoot?: string;
  /** Keep the landed workers' retained worktrees (default: remove them). */
  keepWorktrees?: boolean;
  git?: LandGitRunner;
  runCommand?: LandCommandRunner;
};

export type LandForbiddenHit = { pattern: string; file: string; line: number; source: "diff" | "message" };

export type LandResult = {
  status: "landed";
  onto: string;
  previous_head: string;
  commit: string;
  branches: string[];
  checks: Array<{ name: string; exit_code: number }>;
  build: { command: string; exit_code: number };
  fast_forwarded: string[];
  removed_worktrees: string[];
  accepted_review?: { reason: string; path: string };
};

/** A refused gate or failed step; `step` names where landing stopped. */
export class LandError extends Error {
  readonly step: string;
  constructor(step: string, reason: string) {
    super(`land failed at step "${step}": ${reason}`);
    this.name = "LandError";
    this.step = step;
  }
}

/** A review-gate failure, which `--accept-review` may override. Not a verify failure. */
export class ReviewGateError extends LandError {
  readonly reviews: string[];
  constructor(reason: string, reviews: string[]) {
    super("gates", reason);
    this.name = "ReviewGateError";
    this.reviews = reviews;
  }
}

type LandConfig = {
  checks?: Array<{ name: string; command: string }>;
  forbiddenPatterns?: string[];
  build?: string;
};

/**
 * Gated cherry-pick of verified worker branches into the target worktree, run
 * from that worktree (`root`). Every git and shell command routes through an
 * injectable runner so tests drive it against throwaway repositories without
 * executing the real checks or build.
 */
export async function landWorkerBranches(options: LandOptions): Promise<LandResult> {
  if (!options.workerBranches || options.workerBranches.length === 0) {
    throw new LandError("gates", "at least one --worker-branch is required");
  }
  if (!options.onto || options.onto.trim().length === 0) {
    throw new LandError("gates", "--onto is required");
  }
  const root = path.resolve(options.root);
  const git = options.git ?? defaultLandGitRunner;
  const runCommand = options.runCommand ?? defaultLandCommandRunner;
  // Hive integrity is a precondition: a broken hive facts or ledger chain means
  // the shared state every agent trusts cannot be extended, so land refuses.
  try {
    assertHiveChainsIntact(root);
  } catch (error) {
    throw new LandError("hive", `refusing to land on a broken hive chain: ${(error as Error).message}`);
  }
  const config = await readLandConfig(root);
  const checks = config.checks ?? DEFAULT_LAND_CHECKS;
  const forbiddenPatterns = config.forbiddenPatterns ?? DEFAULT_FORBIDDEN_PATTERNS;
  const buildCommand = config.build ?? DEFAULT_LAND_BUILD;

  // ---- Step 1: gates (no git mutation happens here) ----------------------
  // `uh mission review-collect` writes the collected assessment in the project
  // that owns the worker worktrees (next to the review's review-request.json),
  // not in the worker worktree. Worker worktrees live inside that project's
  // `.harness`, so the project is resolved from their paths.
  const worktrees = await listWorktrees(git, root);
  const reviewRoot = options.reviewRoot !== undefined
    ? path.resolve(options.reviewRoot)
    : resolveOwningProject(worktrees, options.workerBranches);
  const reviews = await collectReviews(reviewRoot);
  let reviewAccepted = false;
  const acceptedReviewIds: string[] = [];
  for (const branch of options.workerBranches) {
    const worktree = worktrees.find((entry) => entry.branch === branch);
    if (!worktree) {
      throw new LandError("gates", `no retained worktree found for worker branch ${branch}`);
    }
    const missionIds = await requirePassedVerification(worktree.path, branch);
    const tip = await git(["rev-parse", branch], root);
    if (tip.exitCode !== 0) {
      throw new LandError("gates", `cannot resolve the tip of worker branch ${branch}: ${reason(tip)}`);
    }
    try {
      await requireCleanReview({
        branch,
        tip: tip.stdout.trim(),
        missionIds,
        reviewRoot,
        reviews,
        git,
        root,
      });
    } catch (err) {
      if (err instanceof ReviewGateError && options.acceptReview !== undefined) {
        reviewAccepted = true;
        acceptedReviewIds.push(...err.reviews);
      } else {
        throw err;
      }
    }
  }
  const decisionPath = reviewAccepted
    ? await writeLandDecision(reviewRoot, {
        branches: [...options.workerBranches],
        reason: options.acceptReview ?? "",
        review_ids: acceptedReviewIds,
      })
    : undefined;

  // ---- Step 2: record the target HEAD, require a clean worktree ----------
  const head = await git(["rev-parse", "HEAD"], root);
  if (head.exitCode !== 0) throw new LandError("cherry-pick", `cannot resolve target HEAD: ${reason(head)}`);
  const previousHead = head.stdout.trim();
  const dirty = await git(["status", "--porcelain"], root);
  if (dirty.exitCode !== 0) throw new LandError("cherry-pick", `cannot read target status: ${reason(dirty)}`);
  // Harness-owned roots (`.harness` and friends) are never the user's work and
  // are where `uh land` itself writes the accepted-review decision; a change
  // there must not block landing. Anything else dirty refuses before git runs.
  const dirtyEntries = dirty.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !isHarnessOwnedStatus(line));
  if (dirtyEntries.length > 0) {
    throw new LandError("cherry-pick", "target worktree is not clean; refusing to land");
  }

  const checkResults: Array<{ name: string; exit_code: number }> = [];
  let buildResult: { command: string; exit_code: number } = { command: buildCommand, exit_code: 0 };
  const fastForwarded: string[] = [];
  let commitId = "";
  try {
    for (const branch of options.workerBranches) {
      const range = `${options.onto}..${branch}`;
      const picked = await git(["cherry-pick", "--no-commit", range], root);
      if (picked.exitCode !== 0) {
        throw new LandError("cherry-pick", `git cherry-pick ${range} failed: ${reason(picked)}`);
      }
    }

    // ---- Step 3: the project's full checks ------------------------------
    for (const check of checks) {
      const result = await runCommand(check.command, root);
      checkResults.push({ name: check.name, exit_code: result.exitCode });
      if (result.exitCode !== 0) {
        throw new LandError("checks", `check "${check.name}" failed with exit code ${result.exitCode}: ${reason(result)}`);
      }
    }

    // ---- Step 4: forbidden patterns in the staged diff and message file --
    const staged = await git(["diff", "--cached"], root);
    if (staged.exitCode !== 0) throw new LandError("forbidden-patterns", `cannot read staged diff: ${reason(staged)}`);
    const messageFile = path.resolve(options.messageFile);
    const messageText = await readFile(messageFile, "utf-8");
    const hits = [
      ...scanStagedDiff(staged.stdout, forbiddenPatterns),
      ...scanText(messageText, forbiddenPatterns, messageFile, "message"),
    ];
    if (hits.length > 0) {
      const detail = hits.map((hit) => `${hit.pattern} in ${hit.file}:${hit.line}`).join("; ");
      throw new LandError("forbidden-patterns", `forbidden pattern(s) found: ${detail}`);
    }

    // ---- Step 5: commit under the repository's configured identity ------
    const nameConfig = await git(["config", "user.name"], root);
    const emailConfig = await git(["config", "user.email"], root);
    const authorName = nameConfig.exitCode === 0 ? nameConfig.stdout.trim() : "";
    const authorEmail = emailConfig.exitCode === 0 ? emailConfig.stdout.trim() : "";
    if (authorName.length === 0 || authorEmail.length === 0) {
      throw new LandError("commit", "repository git identity is not configured (user.name and user.email are required)");
    }
    const committed = await git([
      "-c", `user.name=${authorName}`,
      "-c", `user.email=${authorEmail}`,
      "commit", "-F", messageFile,
    ], root);
    if (committed.exitCode !== 0) throw new LandError("commit", `git commit failed: ${reason(committed)}`);
    const newHead = await git(["rev-parse", "HEAD"], root);
    if (newHead.exitCode !== 0) throw new LandError("commit", `cannot resolve the new commit: ${reason(newHead)}`);
    commitId = newHead.stdout.trim();

    // ---- Step 6: the build ----------------------------------------------
    const built = await runCommand(buildCommand, root);
    buildResult = { command: buildCommand, exit_code: built.exitCode };
    if (built.exitCode !== 0) {
      throw new LandError("build", `build "${buildCommand}" failed with exit code ${built.exitCode}: ${reason(built)}`);
    }

    // ---- Step 7: fast-forward the requested checkouts -------------------
    for (const checkout of options.fastForward ?? []) {
      const merged = await git(["merge", "--ff-only", options.onto], checkout);
      if (merged.exitCode !== 0) {
        throw new LandError("fast-forward", `git merge --ff-only ${options.onto} failed in ${checkout}: ${reason(merged)}`);
      }
      fastForwarded.push(checkout);
    }
  } catch (err) {
    await restoreTarget(git, root, previousHead);
    throw err;
  }

  // Best-effort: a hive error never fails the land.
  recordLandCommit(root, {
    commit: commitId,
    branches: [...options.workerBranches],
    messageFile: path.resolve(options.messageFile),
  });

  const removedWorktrees = options.keepWorktrees
    ? []
    : await removeLandedWorktrees(git, root, worktrees, options.workerBranches, [root, ...fastForwarded]);

  return {
    status: "landed",
    onto: options.onto,
    previous_head: previousHead,
    commit: commitId,
    branches: [...options.workerBranches],
    checks: checkResults,
    build: buildResult,
    fast_forwarded: fastForwarded,
    removed_worktrees: removedWorktrees,
    ...(decisionPath ? { accepted_review: { reason: options.acceptReview ?? "", path: decisionPath } } : {}),
  };
}

type Worktree = { path: string; branch?: string; head?: string };

/**
 * A landed worker's retained worktree has served its purpose: its commits are
 * on the target, and its verification and review have gated this land. Remove
 * it, and remove a team's leader worktree once none of that team's worker
 * worktrees remain, so retained team worktrees do not accumulate. Branches are
 * kept. Best-effort: a worktree that cannot be removed stays for
 * `git worktree list` to surface and never fails the land. Links inside a
 * worktree are removed first, because Git for Windows' `worktree remove`
 * deletes through junctions.
 */
async function removeLandedWorktrees(
  git: LandGitRunner,
  root: string,
  worktrees: Worktree[],
  branches: readonly string[],
  keep: readonly string[],
): Promise<string[]> {
  const kept = new Set(keep.map((entry) => path.resolve(entry)));
  const removed: string[] = [];
  const remove = async (worktreePath: string): Promise<void> => {
    if (kept.has(path.resolve(worktreePath))) return;
    try {
      await removeWorktreeLinks(worktreePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
    await git(["worktree", "unlock", worktreePath], root);
    const result = await git(["worktree", "remove", "--force", worktreePath], root);
    if (result.exitCode === 0) removed.push(path.resolve(worktreePath));
  };

  const teams = new Set<string>();
  for (const branch of branches) {
    const worktree = worktrees.find((entry) => entry.branch === branch);
    if (worktree) await remove(worktree.path);
    const team = /^uh\/team\/([^/]+)\/[^/]+$/.exec(branch)?.[1];
    if (team) teams.add(team);
  }
  if (teams.size > 0) {
    const remaining = await listWorktrees(git, root);
    for (const team of teams) {
      const prefix = `uh/team/${team}/`;
      const leaderBranch = `${prefix}leader`;
      const workersLeft = remaining.some((entry) => entry.branch?.startsWith(prefix) && entry.branch !== leaderBranch);
      const leader = remaining.find((entry) => entry.branch === leaderBranch);
      if (!workersLeft && leader) await remove(leader.path);
    }
  }
  return removed;
}

async function listWorktrees(git: LandGitRunner, root: string): Promise<Worktree[]> {
  const result = await git(["worktree", "list", "--porcelain"], root);
  if (result.exitCode !== 0) throw new LandError("gates", `git worktree list failed: ${reason(result)}`);
  const worktrees: Worktree[] = [];
  let current: Worktree | undefined;
  for (const raw of result.stdout.split(/\r?\n/)) {
    if (raw.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: raw.slice("worktree ".length).trim() };
    } else if (!current) {
      continue;
    } else if (raw.startsWith("HEAD ")) {
      current.head = raw.slice("HEAD ".length).trim();
    } else if (raw.startsWith("branch ")) {
      current.branch = raw.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
}

async function requirePassedVerification(worktreePath: string, branch: string): Promise<string[]> {
  const files = await collectArtifacts(worktreePath, "verification.yaml");
  if (files.length === 0) {
    throw new LandError(
      "gates",
      `worker branch ${branch} has no retained uh verify result (.harness/missions/*/verification.yaml) in ${worktreePath}`,
    );
  }
  const missionIds: string[] = [];
  for (const file of files) {
    let doc: unknown;
    try {
      doc = parse(await readFile(file, "utf-8"));
    } catch (err) {
      throw new LandError("gates", `cannot read verification ${file}: ${(err as Error).message}`);
    }
    const record = (doc && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
    if (record.status !== "passed") {
      throw new LandError("gates", `worker branch ${branch} verification ${file} status is ${String(record.status)}, not passed`);
    }
    for (const missionId of verificationMissionIds(file, record)) {
      if (!missionIds.includes(missionId)) missionIds.push(missionId);
    }
  }
  // A team worker branch encodes the team mission id it belongs to
  // (`uh/team/<team>/<role>`), which is the only mission id the branch name
  // itself can prove. `uh verify`'s retained result remains the primary proof.
  for (const missionId of branchMissionIds(branch)) {
    if (!missionIds.includes(missionId)) missionIds.push(missionId);
  }
  return missionIds;
}

/** The mission ids a retained verification result proves: its stated id, else its directory name. */
function verificationMissionIds(file: string, record: Record<string, unknown>): string[] {
  const stated = record.mission_id;
  if (typeof stated === "string" && stated.length > 0) return [stated];
  return [path.basename(path.dirname(file))];
}

/** The team mission id a `uh/team/<team>/<role>` branch name proves; empty for any other branch. */
function branchMissionIds(branch: string): string[] {
  const match = /^uh\/team\/([^/]+)\/[^/]+$/.exec(branch);
  return match ? [match[1]] : [];
}

/** The shape of a collected assessment; the schema is the only source of truth. */
type IndependentReviewAssessment = ReturnType<typeof IndependentReviewAssessmentSchema.parse>;

/** A collected independent review read from the main checkout's review missions. */
type CollectedReview = {
  reviewId: string;
  requestPath: string;
  assessmentPath: string;
  request: IndependentReviewRequest;
  assessment: IndependentReviewAssessment;
};

async function requireCleanReview(input: {
  branch: string;
  tip: string;
  missionIds: string[];
  reviewRoot: string;
  reviews: CollectedReview[];
  git: LandGitRunner;
  root: string;
}): Promise<void> {
  const { branch, tip, missionIds, reviewRoot, reviews, git, root } = input;
  const matched = reviews.filter((review) =>
    review.request.sources.some((source) => missionIds.includes(source.mission_id)));
  if (matched.length === 0) {
    if (reviews.length === 0) {
      throw new ReviewGateError(
        `worker branch ${branch} has no collected independent review (.harness/missions/*/review-assessment.json) in ${reviewRoot}`,
        [],
      );
    }
    const first = reviews[0];
    throw new ReviewGateError(
      `worker branch ${branch} has no collected independent review naming mission ${missionIds.join(", ")}; ` +
        `review ${first.reviewId} names ${first.request.sources.map((source) => source.mission_id).join(", ")} ` +
        `(first mismatching path: ${first.requestPath})`,
      reviews.map((review) => review.reviewId),
    );
  }
  // Accept the branch as soon as one collected review is bound to it; a single
  // unrelated or broken review must not mask a clean one.
  let firstFailure: ReviewGateError | undefined;
  for (const review of matched) {
    try {
      await assertReviewBoundToTip(review, branch, tip, missionIds, git, root);
      const contradicted = (review.assessment.claims ?? []).filter((claim) => claim.verdict === "contradicted");
      if (contradicted.length > 0) {
        throw new ReviewGateError(
          `contradicted claims in independent review ${review.reviewId}: ${contradicted.map((claim) => claim.claim).join("; ")}`,
          [review.reviewId],
        );
      }
      return;
    } catch (err) {
      if (!(err instanceof ReviewGateError)) throw err;
      if (!firstFailure) firstFailure = err;
    }
  }
  throw firstFailure!;
}

/**
 * A review is bound to the slice only when its request hashes to the recorded
 * request digest and every captured `output`/`changed` file it claims at the
 * branch's tip still hashes to the branch's own bytes. Every failure names the
 * review id and the first mismatching path.
 */
async function assertReviewBoundToTip(
  review: CollectedReview,
  branch: string,
  tip: string,
  missionIds: string[],
  git: LandGitRunner,
  root: string,
): Promise<void> {
  const requestBytes = await readFile(review.requestPath, "utf-8");
  if (review.assessment.request_sha256 !== sha256Hex(requestBytes)) {
    throw new ReviewGateError(
      `review ${review.reviewId} request_sha256 does not match ${review.requestPath} ` +
        `(first mismatching path: ${review.requestPath})`,
      [review.reviewId],
    );
  }
  for (const source of review.request.sources) {
    if (!missionIds.includes(source.mission_id)) continue;
    for (const file of source.files) {
      if (file.kind !== "output" && file.kind !== "changed") continue;
      if (file.state !== "present") continue;
      const originalPath = file.original_path.replaceAll("\\", "/").replace(/^\.\/+/, "");
      const shown = await git(["show", `${tip}:${originalPath}`], root);
      if (shown.exitCode !== 0) {
        throw new ReviewGateError(
          `review ${review.reviewId} captures ${originalPath}, which ${branch} does not contain ` +
            `(first mismatching path: ${originalPath})`,
          [review.reviewId],
        );
      }
      const actual = sha256Hex(shown.stdout);
      if (file.sha256 !== actual) {
        throw new ReviewGateError(
          `review ${review.reviewId} captured ${originalPath} at sha256 ${String(file.sha256)}, but ${branch} holds ${actual} ` +
            `(first mismatching path: ${originalPath})`,
          [review.reviewId],
        );
      }
    }
  }
}

/** Enumerate `.harness/missions/<id>/<fileName>` under `root`; empty when none. */
async function collectArtifacts(root: string, fileName: string): Promise<string[]> {
  const missionsRoot = path.join(root, ".harness", "missions");
  let entries: string[];
  try {
    entries = await readdir(missionsRoot);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(missionsRoot, entry, fileName);
    if (await fileExists(candidate)) found.push(candidate);
  }
  return found;
}

/**
 * The project that owns the worker branches' retained worktrees: the parent of
 * the `.harness` directory they live in. Branches owned by different projects,
 * or a missing worktree, are refused; `--review-root` names the project instead.
 */
function resolveOwningProject(worktrees: readonly Worktree[], branches: readonly string[]): string {
  const owners = new Set<string>();
  for (const branch of branches) {
    const worktree = worktrees.find((entry) => entry.branch === branch);
    if (!worktree) throw new LandError("gates", `no retained worktree found for worker branch ${branch}`);
    owners.add(harnessOwnerRoot(worktree.path));
  }
  if (owners.size !== 1) {
    throw new LandError("gates", `worker branches belong to ${owners.size} projects (${[...owners].join(", ")}); pass --review-root`);
  }
  return [...owners][0]!;
}

/**
 * Read every collected independent review in `reviewRoot`, pairing each
 * assessment with the request it belongs to. Both must parse through the
 * canonical schemas to count; a malformed mission is skipped, so a broken
 * review can never be mistaken for a passing gate.
 */
async function collectReviews(reviewRoot: string): Promise<CollectedReview[]> {
  const files = await collectArtifacts(reviewRoot, "review-assessment.json");
  const reviews: CollectedReview[] = [];
  for (const assessmentPath of files) {
    const reviewDir = path.dirname(assessmentPath);
    let assessment: IndependentReviewAssessment;
    try {
      assessment = IndependentReviewAssessmentSchema.parse(JSON.parse(await readFile(assessmentPath, "utf-8")));
    } catch {
      continue;
    }
    const requestPath = path.join(reviewDir, "review-request.json");
    let request: IndependentReviewRequest;
    try {
      request = IndependentReviewRequestSchema.parse(JSON.parse(await readFile(requestPath, "utf-8")));
    } catch {
      continue;
    }
    reviews.push({ reviewId: assessment.review_id, requestPath, assessmentPath, request, assessment });
  }
  return reviews;
}

async function restoreTarget(git: LandGitRunner, root: string, previousHead: string): Promise<void> {
  await git(["cherry-pick", "--abort"], root);
  await git(["reset", "--hard", previousHead], root);
}

/** The chained index of land decision receipts, under `.harness/land/`. */
export function landDecisionsPath(root: string): string {
  return path.join(path.resolve(root), ".harness", "land", "decisions.ndjson");
}

/**
 * Append one chained entry to the land decision index: the receipt file and its
 * content hash, linked to the entry before it. The index is itself a chain, so
 * a rewritten or removed receipt is detectable.
 */
export async function appendLandDecisionIndex(root: string, entry: { file: string; sha256: string }): Promise<void> {
  const indexFile = landDecisionsPath(root);
  await mkdir(path.dirname(indexFile), { recursive: true });
  const chained = chainEntry(lastChainedHash(readJsonLines(indexFile)), {
    at: new Date().toISOString(),
    file: path.relative(path.resolve(root), entry.file).replaceAll("\\", "/"),
    sha256: entry.sha256,
  });
  await appendFile(indexFile, `${JSON.stringify(chained)}\n`, "utf-8");
}

/** The first break in the land decision index chain, or undefined when intact. */
export function verifyLandDecisionChain(root: string): ChainBreak | undefined {
  return verifyChainedLines(readJsonLines(landDecisionsPath(root)));
}

async function writeLandDecision(
  root: string,
  decision: { branches: string[]; reason: string; review_ids: string[] },
): Promise<string> {
  const dir = path.join(root, ".harness", "land");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-decision.json`);
  const content = `${JSON.stringify({ ...decision, created_at: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(file, content, "utf-8");
  await appendLandDecisionIndex(root, { file, sha256: sha256Hex(content) });
  return file;
}

async function readLandConfig(root: string): Promise<LandConfig> {
  const file = projectYaml(root);
  if (!(await fileExists(file))) return {};
  let doc: unknown;
  try {
    doc = parse(await readFile(file, "utf-8"));
  } catch (err) {
    throw new LandError("config", `cannot parse ${file}: ${(err as Error).message}`);
  }
  const raw = doc && typeof doc === "object" ? (doc as Record<string, unknown>).land : undefined;
  if (raw === undefined) return {};
  const parsed = LandSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LandError("config", `invalid project land block: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return {
    ...(parsed.data.checks ? { checks: parsed.data.checks } : {}),
    ...(parsed.data.forbidden_patterns ? { forbiddenPatterns: parsed.data.forbidden_patterns } : {}),
    ...(parsed.data.build ? { build: parsed.data.build } : {}),
  };
}

/** Scan added lines of a unified diff; report the target file and its line number. */
function scanStagedDiff(diffText: string, patterns: readonly string[]): LandForbiddenHit[] {
  const hits: LandForbiddenHit[] = [];
  let file = "";
  let newLine = 0;
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      file = target === "/dev/null" ? "" : target.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+")) {
      const content = line.slice(1);
      const lower = content.toLowerCase();
      for (const pattern of patterns) {
        if (pattern.length > 0 && lower.includes(pattern.toLowerCase())) {
          hits.push({ pattern, file, line: newLine, source: "diff" });
        }
      }
      newLine += 1;
    } else if (line.startsWith(" ")) {
      newLine += 1;
    }
  }
  return hits;
}

function scanText(text: string, patterns: readonly string[], file: string, source: "diff" | "message"): LandForbiddenHit[] {
  const hits: LandForbiddenHit[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const lower = lines[index].toLowerCase();
    for (const pattern of patterns) {
      if (pattern.length > 0 && lower.includes(pattern.toLowerCase())) {
        hits.push({ pattern, file, line: index + 1, source });
      }
    }
  }
  return hits;
}

/** True when a `git status --porcelain` line names a harness-owned protected root. */
function isHarnessOwnedStatus(entry: string): boolean {
  const raw = entry.slice(3).trim();
  const candidate = raw.includes(" -> ") ? raw.slice(raw.lastIndexOf(" -> ") + 4) : raw;
  const normalized = candidate.replace(/^"(.*)"$/, "$1").replaceAll("\\", "/").replace(/^\.\/+/, "");
  return DEFAULT_PROTECTED_PATHS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function reason(result: LandCommandResult): string {
  const text = (result.stderr || result.stdout || `exit code ${result.exitCode}`).trim();
  return text.length > 0 ? text : `exit code ${result.exitCode}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
