import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "yaml";
import { LandSchema } from "../schema/project.js";
import { DEFAULT_PROTECTED_PATHS } from "../schema/runtime-control.js";
import { projectYaml } from "./paths.js";

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
  const config = await readLandConfig(root);
  const checks = config.checks ?? DEFAULT_LAND_CHECKS;
  const forbiddenPatterns = config.forbiddenPatterns ?? DEFAULT_FORBIDDEN_PATTERNS;
  const buildCommand = config.build ?? DEFAULT_LAND_BUILD;

  // ---- Step 1: gates (no git mutation happens here) ----------------------
  const worktrees = await listWorktrees(git, root);
  let reviewAccepted = false;
  const acceptedReviewIds: string[] = [];
  for (const branch of options.workerBranches) {
    const worktree = worktrees.find((entry) => entry.branch === branch);
    if (!worktree) {
      throw new LandError("gates", `no retained worktree found for worker branch ${branch}`);
    }
    await requirePassedVerification(worktree.path, branch);
    try {
      await requireCleanReview(worktree.path, branch);
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
    ? await writeLandDecision(root, {
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

  return {
    status: "landed",
    onto: options.onto,
    previous_head: previousHead,
    commit: commitId,
    branches: [...options.workerBranches],
    checks: checkResults,
    build: buildResult,
    fast_forwarded: fastForwarded,
    ...(decisionPath ? { accepted_review: { reason: options.acceptReview ?? "", path: decisionPath } } : {}),
  };
}

type Worktree = { path: string; branch?: string; head?: string };

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

async function requirePassedVerification(worktreePath: string, branch: string): Promise<void> {
  const files = await collectArtifacts(worktreePath, "verification.yaml");
  if (files.length === 0) {
    throw new LandError(
      "gates",
      `worker branch ${branch} has no retained uh verify result (.harness/missions/*/verification.yaml) in ${worktreePath}`,
    );
  }
  for (const file of files) {
    let doc: unknown;
    try {
      doc = parse(await readFile(file, "utf-8"));
    } catch (err) {
      throw new LandError("gates", `cannot read verification ${file}: ${(err as Error).message}`);
    }
    const status = doc && typeof doc === "object" ? (doc as Record<string, unknown>).status : undefined;
    if (status !== "passed") {
      throw new LandError("gates", `worker branch ${branch} verification ${file} status is ${String(status)}, not passed`);
    }
  }
}

async function requireCleanReview(worktreePath: string, branch: string): Promise<void> {
  const files = await collectArtifacts(worktreePath, "review-assessment.json");
  if (files.length === 0) {
    throw new ReviewGateError(
      `worker branch ${branch} has no collected independent review (.harness/missions/*/review-assessment.json) in ${worktreePath}`,
      [],
    );
  }
  const reviews: string[] = [];
  const contradicted: string[] = [];
  for (const file of files) {
    let doc: unknown;
    try {
      doc = parse(await readFile(file, "utf-8"));
    } catch (err) {
      throw new ReviewGateError(`cannot read review ${file}: ${(err as Error).message}`, reviews);
    }
    const record = (doc && typeof doc === "object" ? doc : {}) as { review_id?: unknown; claims?: unknown };
    const reviewId = typeof record.review_id === "string" && record.review_id.length > 0
      ? record.review_id
      : path.basename(path.dirname(file));
    reviews.push(reviewId);
    const claims = Array.isArray(record.claims) ? record.claims : [];
    const count = claims.filter((claim) =>
      claim && typeof claim === "object" && (claim as Record<string, unknown>).verdict === "contradicted").length;
    if (count > 0) contradicted.push(`${reviewId} (${count})`);
  }
  if (contradicted.length > 0) {
    throw new ReviewGateError(`contradicted claims in independent review(s): ${contradicted.join(", ")}`, reviews);
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

async function restoreTarget(git: LandGitRunner, root: string, previousHead: string): Promise<void> {
  await git(["cherry-pick", "--abort"], root);
  await git(["reset", "--hard", previousHead], root);
}

async function writeLandDecision(
  root: string,
  decision: { branches: string[]; reason: string; review_ids: string[] },
): Promise<string> {
  const dir = path.join(root, ".harness", "land");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-decision.json`);
  await writeFile(file, `${JSON.stringify({ ...decision, created_at: new Date().toISOString() }, null, 2)}\n`, "utf-8");
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
