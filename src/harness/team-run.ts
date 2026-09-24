import { mapResourceWaves, resolveTeamResources, workerConcurrency, type ResolvedTeamResources } from "./runtime-resources.js";
import { DEFAULT_PROTECTED_PATHS, RuntimeControlSchema, type RuntimeLimits, type TeamResourceLimits } from "../schema/runtime-control.js";
import { resolveWorkerAdapter, type TeamWorker } from "../schema/mission.js";
import { relativeArtifactPath } from "./artifact-paths.js";
import { verifyExpectedArtifact } from "./output-verification.js";
import { captureReplace } from "./interventions.js";
/**
 * UH-72 — Team mission runtime.
 *
 * Fans a single mission out across N adapter-bound workers (each in its
 * own git worktree on a dedicated branch), mechanically integrates the
 * worker diffs, and runs the existing verification pipeline
 * against the integrated result.
 *
 * The plan/run split mirrors `runtimeRegistry` and `run-all`:
 *   - `planTeamRun`  -> pure expansion (count -> N worker plans) + path layout.
 *   - `runTeamMission` -> executes the plan; injects the adapter runner and
 *     git operations so tests can drive it deterministically.
 *
 * Layout under the canonical mission directory:
 *
 *   .harness/missions/<id>/team/
 *     workers/<role>-<n>/        # git worktree on uh/team/<id>/<role>-<n>
 *     leader/                    # git worktree on uh/team/<id>/leader
 *     integration-report.md      # leader-authored summary (UH-72)
 *
 * Worktrees are removed on success and PRESERVED on failure to mirror the
 * `.harness/sandbox` retention policy (forensics > hygiene when something
 * goes wrong).
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { promisify } from "node:util";
import { harnessDir, missionRunDir, missionsDir } from "./paths.js";
import {
  appendRunsIndexEntry,
  generateRunId,
  readLatestPointer,
  writeLatestPointer,
} from "./run-id.js";
import {
  RuntimeResultSchema,
  type RuntimeResultDocument,
  type RuntimeResultStatus,
} from "../schema/artifacts.js";
import {
  CanonicalTeamStateSchema,
  type CanonicalTeamState,
  type CanonicalTeamStatus,
  type CanonicalTeamWorker,
} from "../schema/team.js";
import { loadMissionFile } from "./capabilities.js";
import { aggregateRuntimeUsage, type RuntimeUsage } from "./usage.js";
import { readRuntimeAccounting } from "./runtime-accounting.js";
import { assertSafeMissionId, assertWithinRoot, fileExists, isPathWithin } from "./mission.js";
import { removeWorktreeLinks } from "./worktree-links.js";
import { listLiveRuns, registerLiveRun } from "./live-runs.js";
import { reconcileRuntimeResultControl } from "./runtime-settlement.js";
import { elapsedMs, notifyTeamSettled } from "./notifications.js";
import { getSessionTemplate } from "./session-templates.js";
import { appendWorkerRules } from "./session-template-adoption.js";
import type { SessionTemplate } from "../schema/session-template.js";
const execFileP = promisify(execFile);

/* -------------------------------------------------------------------------- */
/* Windows long paths                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Windows' classic (non-`\\?\`) path ceiling. A team worktree path plus the
 * longest tracked path under it must stay below it unless git's
 * `core.longpaths` lifts the limit; 260 is the hard MAX_PATH, so 259 is the
 * last total that works without it.
 */
export const WINDOWS_MAX_PATH = 260;

/** Cap on how much git stderr one failure message carries. */
const GIT_STDERR_LIMIT = 2000;

/** Trim whitespace and cap an error body so a runaway stderr cannot flood a report. */
function trimForMessage(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= GIT_STDERR_LIMIT) return trimmed;
  const head = Math.floor(GIT_STDERR_LIMIT / 2);
  return `${trimmed.slice(0, head)}\n…\n${trimmed.slice(trimmed.length - (GIT_STDERR_LIMIT - head))}`;
}

/** Read the stderr an exec-style git failure carries, as a string. */
function stderrOf(err: unknown): string {
  const candidate = (err as { stderr?: unknown } | null)?.stderr;
  if (typeof candidate === "string") return candidate;
  if (candidate && typeof (candidate as { toString(): string }).toString === "function") {
    return (candidate as { toString(): string }).toString();
  }
  return "";
}

/**
 * Render a git failure with its stderr preserved. `child_process` keeps git's
 * stderr on the error object, but its `message` may hold only
 * "Command failed: git ..." — dropping that stderr is exactly how a failing
 * path name is lost. Both runGit (which already embeds stderr) and a plain
 * exec error (stderr only on the property) route through here.
 */
function formatGitError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const stderr = trimForMessage(stderrOf(err));
  if (stderr.length > 0 && !message.includes(stderr)) {
    return `${message} — ${stderr}`;
  }
  return message;
}

/** `git -c core.longpaths=true <args>` — every team-run git call lifts MAX_PATH. */
function gitCommand(args: readonly string[]): string[] {
  return ["-c", "core.longpaths=true", ...args];
}

/** Run git with the long-path prefix; on failure throw with git's stderr attached. */
async function runGit(args: readonly string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  try {
    // A generous buffer: `ls-tree -r` lists every path in the repository, which
    // can exceed the 1 MiB default on a large repo and would otherwise abort the
    // preflight silently.
    return await execFileP("git", gitCommand(args), { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`git ${args[0] ?? ""} failed: ${formatGitError(err)}`);
  }
}

interface LongPathState {
  /** True when long paths are usable, or unnecessary on this platform. */
  ok: boolean;
  /** One-line integration-report notice when UH changed the repository config. */
  note: string | null;
}

/**
 * On Windows, make sure git can address paths past MAX_PATH before any worktree
 * is created. If the repository's effective `core.longpaths` is not true, set
 * it in the repository's LOCAL config and return a notice for the report;
 * otherwise long paths are already usable. On other platforms (no MAX_PATH
 * ceiling) this is a no-op. `ok` is false only when the config could not be set.
 */
async function prepareLongPaths(args: {
  gitOps: GitOps;
  root: string;
  platform: NodeJS.Platform;
}): Promise<LongPathState> {
  if (args.platform !== "win32") return { ok: true, note: null };
  const { gitOps, root } = args;
  if (gitOps.longPathsEnabled && await gitOps.longPathsEnabled(root)) return { ok: true, note: null };
  if (!gitOps.enableLongPaths) return { ok: false, note: null };
  try {
    await gitOps.enableLongPaths(root);
    return {
      ok: true,
      note: `UH enabled git \`core.longpaths=true\` in this repository's local config because team worktree paths can exceed the Windows ${WINDOWS_MAX_PATH}-character limit`,
    };
  } catch {
    return { ok: false, note: null };
  }
}

/**
 * Preflight a single worktree path against the Windows MAX_PATH ceiling. The
 * total is the worktree path length plus the longest tracked path at the base
 * ref (the deepest file the checkout must write). When it exceeds 259 and long
 * paths could not be enabled, return a message naming both lengths so the
 * worker fails clearly instead of surfacing git's opaque worktree error.
 */
export function checkWorktreePathLength(args: {
  label: string;
  worktreePath: string;
  longestTrackedPath: string;
  longPathsOk: boolean;
  platform: NodeJS.Platform;
}): string | null {
  if (args.platform !== "win32" || args.longPathsOk) return null;
  const worktreeLength = args.worktreePath.length;
  const trackedLength = args.longestTrackedPath.length;
  const total = worktreeLength + trackedLength;
  if (total <= WINDOWS_MAX_PATH - 1) return null;
  return `${args.label} worktree path is ${worktreeLength} characters and the longest tracked path at the base ref is ${trackedLength} characters (${total} total), over the Windows ${WINDOWS_MAX_PATH}-character limit, and git core.longpaths could not be enabled`;
}

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type LeaderStrategy = "merge" | "cherry-pick" | "rebase";

export type { TeamWorker } from "../schema/mission.js";
type TeamWorkerSpec = Omit<TeamWorker, "adapter"> & { adapter?: string };

export interface TeamLeader {
  /** Adapter id the leader dispatches against. */
  adapter: string;
  /** Stable role used by the canonical Observatory agent identity. */
  role?: string;
}

export interface TeamMission {
  /** Mission id; matches the directory under .harness/missions/. */
  id: string;
  team: {
    workers: TeamWorkerSpec[];
    leader: TeamLeader;
    resources?: TeamResourceLimits;
  };
  /** Optional override for the integration-report path. */
  integration_report_path?: string;
}


export interface WorkerPlan {
  role: string;
  adapter: string;
  index: number;
  /** `${role}` when count===1, else `${role}-${index}`. */
  id: string;
  worktreePath: string;
  branch: string;
  spec?: TeamWorkerSpec;
}

export interface LeaderPlan {
  adapter: string;
  strategy: LeaderStrategy;
  worktreePath: string;
  branch: string;
}

export interface TeamPlan {
  missionId: string;
  teamRoot: string;
  workers: WorkerPlan[];
  leader: LeaderPlan;
  integrationReportPath: string;
}

/** Canonical artifact identity supplied to each runtime worker. */
export interface TeamRuntimeContext {
  artifactRoot: string;
  runId: string;
  missionId?: string;
  limits?: RuntimeLimits;
  onAttempt?: (runId: string) => Promise<void>;
}

/** Mirror of `RuntimeRunResult` to avoid a circular import with run-all. */
export interface TeamRuntimeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: {
    status?: string;
    completion?: "complete" | "incomplete";
    incomplete_reason?: string;
    errors?: string[];
    provider?: string;
    model?: string;
    usage?: RuntimeUsage;
    cost_usd?: number;
    started_at?: string;
    finished_at?: string;
  };
  runId?: string;
}

export type TeamRuntimeRunner = (
  adapter: string,
  root: string,
  missionPath: string,
  context: TeamRuntimeContext,
) => Promise<TeamRuntimeRunResult>;

export interface VerifyMissionLike {
  status: "passed" | "failed" | "blocked" | "waived";
  path: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_blocked: number;
  acceptance_total: number;
  acceptance_passed: number;
  acceptance_failed_block: number;
  acceptance_warn_failed: number;
  acceptance_blocked: number;
}

export type TeamVerifier = (root: string, missionId: string) => Promise<VerifyMissionLike>;

export interface GitOps {
  /** `git worktree add --lock --reason uh:<branch> -b <branch> <path> <baseRef>` */
  addWorktree: (root: string, branch: string, worktreePath: string, baseRef: string) => Promise<void>;
  /**
   * `git worktree unlock <path>` (tolerating "is not locked") then
   * `git worktree remove [--force] <path>`. Never prunes globally, and is
   * silent when the worktree is already gone.
   */
  removeWorktree: (root: string, worktreePath: string) => Promise<void>;
  /** Run `git merge <branch>` in `cwd`. Returns a structured outcome; never throws on conflicts. */
  merge: (cwd: string, branch: string) => Promise<MergeOutcome>;
  /** Return the changed files (relative paths) for `branch` vs `baseRef`. */
  diffFiles: (root: string, baseRef: string, branch: string) => Promise<string[]>;
  /**
   * Delete a local branch (`git branch -D`) and its `branch.<name>` config
   * section — `git branch -D` leaves the section behind, so the fork-point
   * record would otherwise outlive the branch. Best-effort.
   */
  deleteBranch: (root: string, branch: string) => Promise<void>;
  /**
   * Resolve `ref` to a full commit id in `root`. Optional so test doubles that
   * never touch git stay valid; when absent the base ref is used verbatim and
   * no `branch.<name>.base` record is written.
   */
  resolveCommit?: (root: string, ref: string) => Promise<string>;
  /** Record `git config branch.<branch>.base <commit>` in `root` (the fork point review reads back). */
  setBranchBase?: (root: string, branch: string, commit: string) => Promise<void>;
  /** Rename a local branch (`git branch -m <from> <to>`); used to archive a retained run. */
  renameBranch?: (root: string, from: string, to: string) => Promise<void>;
  /** True when a local branch exists. Optional so existing test doubles stay valid. */
  branchExists?: (root: string, branch: string) => Promise<boolean>;
  /**
   * Stage + commit uncommitted changes in `cwd`, no-op when the staged index is
   * empty. `stagePaths` restricts staging to exactly those paths — an empty
   * array stages nothing — so a worker whose only changes fall outside its
   * write roots produces no commit. Both the worker commit and the salvage
   * commit route through it. When omitted (a stub gitOps that cannot enumerate
   * the worktree), the whole worktree is staged minus the protected roots.
   * `forcePaths` lists declared outputs that git ignores (an `out/` directory in
   * `.gitignore` is the case that motivated it) and must be staged with
   * `git add -f`; only declared outputs ever reach it.
   */
  commitAll: (cwd: string, message: string, stagePaths?: readonly string[], forcePaths?: readonly string[]) => Promise<void>;
  /**
   * List the paths with uncommitted changes (staged, unstaged, untracked) in a
   * worktree, relative to the worktree root. Used to decide whether a stopped
   * worker produced salvageable work outside the protected roots. Optional so
   * existing test doubles stay valid; when absent, salvage cannot be evaluated.
   */
  dirtyPaths?: (cwd: string) => Promise<string[]>;
  /**
   * True when the repository's effective `core.longpaths` is already `true`.
   * Optional so existing test doubles stay valid; absent means "unknown", and
   * on Windows the preflight then treats long paths as unavailable unless
   * `enableLongPaths` succeeds.
   */
  longPathsEnabled?: (root: string) => Promise<boolean>;
  /** Set `core.longpaths true` in the repository's LOCAL config. */
  enableLongPaths?: (root: string) => Promise<void>;
  /**
   * The longest tracked path (by character length) at `ref`, or "" when the ref
   * has no tracked paths. Used by the Windows preflight so a MAX_PATH overflow
   * fails with both lengths named. Optional so test doubles stay valid.
   */
  longestTrackedPath?: (root: string, ref: string) => Promise<string>;
}

export interface MergeOutcome {
  /** True when conflict markers landed on disk and the merge was aborted. */
  conflicted: boolean;
  /**
   * True when `git merge` failed for a non-conflict reason (corrupt branch,
   * missing ref, dirty index, etc.). A `failed` outcome is NEVER integrated
   * — downstream callers must treat it as a hard merge failure that drops
   * the worker from the integrated set, just like a conflict.
   */
  failed?: boolean;
  /** Conflicting paths reported by `git`. Empty when `conflicted === false`. */
  conflictPaths: string[];
  /** Free-form note attached to the integration report. */
  note: string;
}

export interface RunTeamMissionOptions {
  runnerFor: (adapter: string) => TeamRuntimeRunner;
  /** Defaults to git CLI via execFile. Tests inject a fake. */
  gitOps?: GitOps;
  /** Defaults to undefined (skip verify). Wired to `verifyMission` from the CLI. */
  verifier?: TeamVerifier;
  /** Base ref every worker / leader worktree branches off. Default `HEAD`. */
  baseRef?: string;
  /** When true, do NOT remove worktrees even on success. Useful for tests. */
  retainOnSuccess?: boolean;
  /**
   * Relaunch a team whose previous run left worktrees and branches behind: the
   * old worktrees are removed, each old branch is renamed under
   * `uh/archive/<team>/<timestamp>/<role>` (never deleted — unmerged work is
   * kept), and `.harness/missions/<team>/team` is renamed to
   * `team.<timestamp>`. Without it, a relaunch is refused while retained state
   * exists. Always refused while a live run of the team is registered.
   */
  replace?: boolean;
  /**
   * Leader integration strategy. The mission.yaml surface no longer declares
   * this; callers (CLI, staged workflow) thread it through. Only `"merge"`
   * is implemented today; other values throw from `planTeamRun` before any
   * worker dispatch (UH-72 contract).
   */
  strategy?: LeaderStrategy;
  /**
   * Host platform the run should assume. Defaults to `process.platform`; tests
   * override it to exercise the Windows long-path config and preflight on any
   * host.
   */
  platform?: NodeJS.Platform;
  /**
   * Injected free-memory reading for worker admission. Defaults to
   * `os.freemem`; tests pass a fixed reading so admission never depends on the
   * host's real free memory.
   */
  availableBytes?: () => number;
  /** Injected clock for admission waiting. Defaults to `Date.now`. */
  now?: () => number;
  /** Injected sleep for admission waiting. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

export interface WorkerOutcome {
  plan: WorkerPlan;
  exitCode: number;
  status: "succeeded" | "failed" | "blocked" | "error";
  errorMessage?: string;
  filesTouched: string[];
  finalSentinel: string;
  merge: MergeOutcome | null;
  /** True when the leader successfully integrated this worker's branch. */
  integrated: boolean;
  /** Canonical native artifact identity retained outside the worktree. */
  runId?: string;
  artifactScope?: string;
  runtimeResult?: RuntimeResultDocument;
  /** Stop code from the worker's runtime control receipt, when one was read. */
  stopCode?: string;
  /** Salvage record for a failed worker whose stop code permits salvage. */
  salvage?: WorkerSalvage;
  /** Why a settled worker's non-zero exit did not fail it (rendered as a report warning). */
  postRunWarning?: string;
  /**
   * Changed paths the worker left outside its write roots and declared outputs
   * (protected paths excluded), so they were never staged into the worker
   * commit. Mirrors `CanonicalTeamWorker["out_of_roots"]`.
   */
  outOfRoots?: NonNullable<CanonicalTeamWorker["out_of_roots"]>;
}

/** A worker's salvage record (see `CanonicalWorkerSalvageSchema`). */
export type WorkerSalvage = NonNullable<CanonicalTeamWorker["salvage"]>;

/**
 * Stop codes that mean a worker ran out of budget or was halted by safety,
 * rather than failing on its own merits. A worker stopped by one of these may
 * still hold a complete, verifiable change in its worktree.
 */
const SALVAGE_STOP_CODES = new Set(["turn_limit", "timeout", "deadline", "stall", "policy"]);

/** True when `candidate` equals or lives under any protected root. */
function isProtectedPath(candidate: string, protectedRoots: readonly string[]): boolean {
  const normalized = candidate.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
  if (normalized.length === 0) return true;
  return protectedRoots.some((root) => {
    const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
  });
}

/** Normalize a repo-relative path for containment checks (POSIX separators, no leading "./"). */
function normalizeRelativePath(candidate: string): string {
  return candidate.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * True when `candidate` equals or lives under the repo-relative `root`. Unlike
 * `isProtectedPath`, a root of `.` matches the whole worktree — the default
 * write root must not be treated as a literal path segment.
 */
function isWithinRelativeRoot(candidate: string, root: string): boolean {
  const normalizedRoot = normalizeRelativePath(root);
  if (normalizedRoot.length === 0 || normalizedRoot === ".") return true;
  const normalized = normalizeRelativePath(candidate);
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`);
}

/** Extract non-empty `write_roots` from a raw guard block, if any. */
function guardWriteRoots(guard: unknown): string[] | undefined {
  const record = objectRecord(guard);
  const roots = record.write_roots;
  if (!Array.isArray(roots)) return undefined;
  const cleaned = roots.filter((root): root is string => typeof root === "string" && root.trim().length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The worker's resolved write roots — the same roots the tool guard enforces.
 * A per-worker `guard.write_roots` wins, then the worker's mission packet guard
 * (what the runtime actually used), then the permissive default (".").
 */
function resolveWorkerWriteRoots(spec: TeamWorkerSpec | undefined, basePacket: Record<string, unknown>): string[] {
  return guardWriteRoots(spec?.guard) ?? guardWriteRoots(basePacket.guard) ?? ["."];
}

/** Cap on the out-of-roots paths carried in the canonical state and the report. */
const OUT_OF_ROOTS_LIST_CAP = 20;

interface WorkerCommitScope {
  /**
   * Exact changed paths to stage. `undefined` when the gitOps cannot enumerate
   * the worktree (a stub without `dirtyPaths`); the commit then falls back to
   * the write roots as pathspecs.
   */
  stagePaths?: string[];
  /**
   * Declared outputs that exist in the worktree but `dirtyPaths` never listed —
   * an `out/` directory in `.gitignore` is the motivating case — so `git add`
   * needs `-f` to stage them. Only declared outputs, protected paths excluded,
   * ever land here; an ignored file that is not declared stays out of the commit.
   */
  forcePaths?: string[];
  /** Changed paths outside the write roots and declared outputs, protected paths excluded. */
  outOfRoots?: NonNullable<CanonicalTeamWorker["out_of_roots"]>;
}

/**
 * Partition a worker's changed paths into the ones inside its write roots or
 * declared outputs — staged into the worker commit — and the rest, which stay
 * unstaged and are reported as `out_of_roots`. Protected roots keep their
 * existing exclusion behaviour and are never listed as out-of-roots. A child
 * process (a build) can write outside the roots without the tool guard seeing
 * it, which is exactly what this classification catches. A declared output that
 * exists but git ignores is returned separately in `forcePaths` so the commit
 * can stage it with `-f`.
 */
async function resolveWorkerCommitScope(args: {
  gitOps: GitOps;
  worktreePath: string;
  writeRoots: readonly string[];
  expectedOutputs: readonly string[];
}): Promise<WorkerCommitScope> {
  const allowedRoots = [...args.writeRoots, ...args.expectedOutputs];
  // Without a way to enumerate the worktree we cannot classify paths, so fall
  // back to the legacy unrestricted commit (a stub gitOps without `dirtyPaths`).
  if (!args.gitOps.dirtyPaths) return {};
  let changed: string[];
  try {
    changed = await args.gitOps.dirtyPaths(args.worktreePath);
  } catch {
    return {};
  }
  const stagePaths: string[] = [];
  const outside: string[] = [];
  const staged = new Set<string>();
  for (const candidate of changed) {
    if (isProtectedPath(candidate, DEFAULT_PROTECTED_PATHS)) continue;
    if (allowedRoots.some((root) => isWithinRelativeRoot(candidate, root))) {
      stagePaths.push(candidate);
      staged.add(normalizeRelativePath(candidate));
    } else outside.push(candidate);
  }
  // A declared output under an ignored directory (`out/` in `.gitignore`) never
  // shows up in `dirtyPaths`, so it is not in `stagePaths` and a plain `git add`
  // would refuse it. Such an output still belongs to the worker's commit: stage
  // it explicitly with `git add -f`. Only declared outputs are force-added, and
  // one under a protected root stays excluded like any other changed path.
  const forcePaths: string[] = [];
  for (const outputPath of args.expectedOutputs) {
    if (isProtectedPath(outputPath, DEFAULT_PROTECTED_PATHS)) continue;
    const normalized = normalizeRelativePath(outputPath);
    if (normalized.length === 0 || staged.has(normalized)) continue;
    if (await fileExists(path.join(args.worktreePath, outputPath))) forcePaths.push(outputPath);
  }
  outside.sort();
  const scope: WorkerCommitScope = { stagePaths };
  if (forcePaths.length > 0) scope.forcePaths = forcePaths;
  if (outside.length > 0) {
    scope.outOfRoots = { paths: outside.slice(0, OUT_OF_ROOTS_LIST_CAP), total: outside.length };
  }
  return scope;
}

/** Read the stop code off a worker run's persisted runtime control receipt. */
async function readWorkerStopCode(artifactRoot: string, missionId: string, runId: string): Promise<string | undefined> {
  const controlPath = path.join(artifactRoot, ".harness", "missions", missionId, "runs", runId, "runtime-control.json");
  try {
    const control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf-8")));
    return control.stop_code;
  } catch {
    return undefined;
  }
}

/**
 * Team-run verdict.
 *
 * UH-127: `passed_partial` is a clearly-named NON-blocking status for the case
 * where M<N workers landed but the integrated subset is shippable — leader
 * integration is clean for the surviving workers AND verification passed on
 * the integrated result. It is distinct from `passed` (every worker integrated)
 * and from `blocked` (genuine verification failure / nothing integrated / no
 * verifier wired). Callers that gate on success should treat `passed_partial`
 * as a success-with-caveats, not a hard block.
 */
export type TeamRunStatus = "passed" | "passed_partial" | "failed" | "blocked";

export interface TeamRunResult {
  missionId: string;
  plan: TeamPlan;
  workers: WorkerOutcome[];
  leaderRanVerification: boolean;
  verification: VerifyMissionLike | null;
  integrationReportPath: string;
  status: TeamRunStatus;
  /** True when at least one worker failed or had a merge conflict. */
  hadConflicts: boolean;
  retained: boolean;
  /** Canonical parent run identity. */
  runId?: string;
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

export function planTeamRun(
  mission: TeamMission,
  root: string,
  options: { strategy?: LeaderStrategy; templates?: ReadonlyMap<string, SessionTemplate> } = {},
): TeamPlan {
  assertSafeMissionId(mission.id);
  if (!mission.team || !Array.isArray(mission.team.workers) || mission.team.workers.length === 0) {
    throw new Error(`Team mission ${mission.id} has no workers configured`);
  }
  if (!mission.team.leader || typeof mission.team.leader.adapter !== "string") {
    throw new Error(`Team mission ${mission.id} has no leader configured`);
  }

  const strategy: LeaderStrategy = options.strategy ?? "merge";
  if (strategy !== "merge") {
    // Strategy stubs — explicit, never silently skipped (UH-72 contract).
    // Fail BEFORE any worker dispatch happens so callers don't pay the
    // worktree-creation tax on a doomed run.
    throw new Error(`Leader strategy "${strategy}" not yet implemented (UH-72 implements "merge" only)`);
  }

  const teamRoot = path.resolve(missionsDir(root), mission.id, "team");
  const workersRoot = path.join(teamRoot, "workers");
  const workers: WorkerPlan[] = [];
  for (const spec of mission.team.workers) {
    if (!isSafeSegment(spec.role)) {
      throw new Error(`Team worker role must be a safe identifier, got: ${spec.role}`);
    }
    // The effective adapter is resolved once here: the worker's explicit
    // adapter wins, otherwise the adapter of the session template it adopts.
    const template = spec.template ? options.templates?.get(spec.template) : undefined;
    const adapter = resolveWorkerAdapter(spec, template);
    if (adapter === undefined) {
      throw new Error(`Team worker ${spec.role} must declare an adapter or a template that supplies one`);
    }
    if (!isSafeSegment(adapter)) {
      throw new Error(`Team worker adapter must be a safe identifier, got: ${adapter}`);
    }
    const count = spec.count ?? 1;
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(`Team worker count must be a positive integer, got: ${String(spec.count)}`);
    }
    for (let i = 1; i <= count; i += 1) {
      const id = count === 1 ? spec.role : `${spec.role}-${i}`;
      const worktreePath = path.join(workersRoot, id);
      workers.push({
        role: spec.role,
        adapter,
        index: i,
        id,
        worktreePath,
        branch: `uh/team/${mission.id}/${id}`,
        spec,
      });
    }
  }
  // Dedup on `id` (collisions can only happen if two specs use the same role
  // without count, or if a single-count role collides with a multi-count
  // sibling — both are operator errors we surface explicitly).
  const seen = new Set<string>();
  for (const w of workers) {
    if (seen.has(w.id)) {
      throw new Error(`Duplicate team worker id: ${w.id}. Reuse of role names without count is not allowed.`);
    }
    seen.add(w.id);
  }

  const leader: LeaderPlan = {
    adapter: mission.team.leader.adapter,
    strategy,
    worktreePath: path.join(teamRoot, "leader"),
    branch: `uh/team/${mission.id}/leader`,
  };

  // UH-129: the doc-comment (top of file) documents the report living under
  // `.harness/missions/<id>/team/`. A RELATIVE `integration_report_path` must
  // therefore resolve under `teamRoot`, not the repo root — otherwise
  // `custom/place.md` silently landed at the repo root, contradicting the
  // documented layout. Absolute paths are honored as-is. Either way the
  // traversal guard still runs so the path can never escape `root`.
  const integrationReportPath = mission.integration_report_path
    ? (path.isAbsolute(mission.integration_report_path)
        ? assertWithinRoot(mission.integration_report_path, root, "integration_report_path")
        : assertWithinRoot(path.join(teamRoot, mission.integration_report_path), root, "integration_report_path"))
    : path.join(teamRoot, "integration-report.md");

  return {
    missionId: mission.id,
    teamRoot,
    workers,
    leader,
    integrationReportPath,
  };
}

function isSafeSegment(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Default git ops (real `git` CLI)                                           */
/* -------------------------------------------------------------------------- */

/**
 * A worker commit must contain only the worker's own work. `.harness`,
 * `.commandcode`, `.omp`, and `.pi` hold harness-owned artifacts the harness
 * itself writes into the worker root — derived/re-seeded mission packets, the
 * Command Code hook configuration (absolute local paths), the worktree-local
 * `.harness/.gitignore`, per-run session state, and the audit log. `.git` is
 * dropped because git never stages its own metadata directory.
 *
 * These are applied as pathspec exclusions so tracked and untracked files
 * alike stay out of the commit — an ignore rule cannot cover a file the
 * repository already tracks. A worker that produced nothing else therefore has
 * nothing staged and no commit is created. A tracked protected file the worker
 * (or harness) modified is left unstaged, never reset or restored.
 */
const COMMIT_PROTECTED_EXCLUDES = DEFAULT_PROTECTED_PATHS
  .filter((protectedPath) => protectedPath !== ".git")
  .map((protectedPath) => `:(exclude)${protectedPath}`);

export const defaultGitOps: GitOps = {
  async addWorktree(root, branch, worktreePath, baseRef) {
    // Lock the registration so a `git worktree prune` run elsewhere (another
    // controller, or a removable/network volume that is briefly unmounted)
    // cannot delete this worktree's administrative entry behind our back. No
    // run id is in scope here, so the branch name is the lock identifier.
    await runGit(["worktree", "add", "--lock", "--reason", `uh:${branch}`, "-b", branch, worktreePath, baseRef], root);
  },
  async removeWorktree(root, worktreePath) {
    // A locked worktree refuses `remove` until it is unlocked; an already
    // unlocked one reports "is not locked", a no-op we tolerate. We NEVER run
    // `git worktree prune` here: it deletes the registration of every worktree
    // whose directory is missing at that instant — other controllers'
    // worktrees, or ones parked on a removable/network volume — leaving their
    // directories "not a git repository" even when they come back. When this
    // worktree's directory was deleted out of band we drop only its own
    // registration; if git still refuses we leave the orphan for
    // `git worktree list` to surface. Git for Windows' `worktree remove`
    // deletes through junctions, so every link is dropped first; if one
    // cannot be dropped, the worktree is left in place.
    try {
      await removeWorktreeLinks(worktreePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
    try {
      await runGit(["worktree", "unlock", worktreePath], root);
    } catch { /* tolerated: not locked, or already unregistered */ }
    try {
      await runGit(["worktree", "remove", "--force", worktreePath], root);
    } catch { /* best-effort; orphans surface via `git worktree list` */ }
  },
  async merge(cwd, branch) {
    try {
      const { stdout } = await runGit([
        "-c", "user.email=uh-team@example.com",
        "-c", "user.name=uh team leader",
        "merge", "--no-edit", branch,
      ], cwd);
      return { conflicted: false, conflictPaths: [], note: stdout.trim().split("\n").slice(0, 1).join("") };
    } catch (err) {
      // Detect conflict by checking MERGE_HEAD via rev-parse (works in
      // both regular repos and linked worktrees, where `.git` is a file).
      let gitDirPath = "";
      try {
        const { stdout } = await runGit(["rev-parse", "--git-path", "MERGE_HEAD"], cwd);
        gitDirPath = stdout.trim();
      } catch { /* ignore */ }
      const resolved = gitDirPath
        ? (path.isAbsolute(gitDirPath) ? gitDirPath : path.join(cwd, gitDirPath))
        : path.join(cwd, ".git", "MERGE_HEAD");
      const inConflict = await fileExists(resolved);
      if (!inConflict) {
        // Codex P1: a non-conflict `git merge` failure (corrupt branch, missing
        // ref, dirty index, etc.) is NOT a clean integration. Returning
        // `conflicted: false` here caused downstream code to treat the worker
        // as integrated when no merge commit ever landed. Flag it as `failed`
        // so the consumer drops it from the integrated set.
        return {
          conflicted: false,
          failed: true,
          conflictPaths: [],
          note: `merge failed: ${formatGitError(err)}`,
        };
      }
      const { stdout } = await runGit(["diff", "--name-only", "--diff-filter=U"], cwd);
      const paths = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      try { await runGit(["merge", "--abort"], cwd); } catch { /* tolerated */ }
      return { conflicted: true, conflictPaths: paths, note: `merge conflict on ${paths.length} path(s)` };
    }
  },
  async diffFiles(root, baseRef, branch) {
    try {
      const { stdout } = await runGit(["diff", "--name-only", `${baseRef}...${branch}`], root);
      return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  },
  async deleteBranch(root, branch) {
    try {
      await runGit(["branch", "-D", branch], root);
    } catch { /* best-effort */ }
    // `git branch -D` deletes the ref but leaves `branch.<name>` in the config,
    // so the base record would outlive its branch (and confuse a later review,
    // or a same-named branch recreated by a relaunch). Drop the section too.
    try {
      await runGit(["config", "--remove-section", `branch.${branch}`], root);
    } catch { /* best-effort: no section, or no config at all */ }
  },
  async resolveCommit(root, ref) {
    const { stdout } = await runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], root);
    const commit = stdout.trim();
    if (commit.length === 0) throw new Error(`Cannot resolve base ref "${ref}" to a commit`);
    return commit;
  },
  async setBranchBase(root, branch, commit) {
    await runGit(["config", `branch.${branch}.base`, commit], root);
  },
  async renameBranch(root, from, to) {
    await runGit(["branch", "-m", from, to], root);
  },
  async branchExists(root, branch) {
    try {
      await runGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], root);
      return true;
    } catch {
      return false;
    }
  },
  async commitAll(cwd, message, stagePaths, forcePaths) {
    // An explicit empty list means "nothing is inside the worker's roots":
    // stage nothing and create no commit, mirroring the protected-path case —
    // unless a declared output was force-added (its own ignored `out/` file).
    if (stagePaths !== undefined && stagePaths.length === 0 && (forcePaths?.length ?? 0) === 0) return;
    // Stage only the worker's own work. When `stagePaths` is given it lists the
    // exact changed paths inside the worker's write roots (plus its declared
    // outputs) — the caller already filtered the protected roots out, so it is
    // staged as-is. `:(literal)` keeps a path with glob metacharacters (e.g. a
    // Next.js `[slug].js`) from matching unintended files, and no exclude
    // pathspecs are mixed in: a file include combined with excludes can
    // mis-stage on some git builds. Otherwise the whole worktree is staged
    // minus the protected roots, so a harness-owned file is never staged.
    if (stagePaths === undefined) {
      await runGit(["add", "-A", "--", ".", ...COMMIT_PROTECTED_EXCLUDES], cwd);
    } else {
      const stagePathspecs = stagePaths.map((entry) => `:(literal)${entry}`);
      if (stagePathspecs.length > 0) {
        await runGit(["add", "-A", "--", ...stagePathspecs], cwd);
      }
      // Declared outputs under an ignored directory need `-f`: a plain `git add`
      // refuses them. Only declared outputs reach `forcePaths`, so an ignored
      // stray never gets staged alongside them.
      const forcePathspecs = (forcePaths ?? []).map((entry) => `:(literal)${entry}`);
      if (forcePathspecs.length > 0) {
        await runGit(["add", "-f", "-A", "--", ...forcePathspecs], cwd);
      }
    }
    // Any residual out-of-root or protected change stays in the worktree
    // unstaged (the worktree is discarded or retained as evidence), so gate the
    // commit on the INDEX being non-empty rather than on the worktree being clean.
    const { stdout } = await runGit(["diff", "--cached", "--name-only"], cwd);
    if (stdout.trim().length === 0) return;
    // A8: commit under the repository's configured identity (author and
    // committer alike), falling back to the harness literal only when the
    // repository has no identity configured.
    const readConfig = async (key: string): Promise<string | undefined> => {
      try {
        const configured = await runGit(["config", key], cwd);
        const value = configured.stdout.trim();
        return value.length > 0 ? value : undefined;
      } catch {
        return undefined;
      }
    };
    await runGit([
      "-c", `user.email=${(await readConfig("user.email")) ?? "uh-team@example.com"}`,
      "-c", `user.name=${(await readConfig("user.name")) ?? "uh team worker"}`,
      "commit", "-m", message,
    ], cwd);
  },
  async dirtyPaths(cwd) {
    // `--porcelain` keeps the output stable across git versions and locales.
    // Untracked files are included so a worker that only created new files is
    // still seen as having produced work.
    const { stdout } = await runGit(["status", "--porcelain", "--untracked-files=all"], cwd);
    return stdout
      .split("\n")
      .map((line) => line.replace(/\r$/, ""))
      .filter((line) => line.length > 3)
      // `<XY> <path>`; a rename/copy is rendered as `<old> -> <new>`, so keep
      // the destination path.
      .map((line) => line.slice(3))
      .map((entry) => (entry.includes(" -> ") ? entry.slice(entry.lastIndexOf(" -> ") + 4) : entry))
      .map((entry) => entry.replace(/^"(.*)"$/, "$1"))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  async longPathsEnabled(root) {
    // Read WITHOUT the `-c core.longpaths=true` prefix every other call carries:
    // that override would be echoed back and mask an unset value. `--bool`
    // normalizes "true"/"1"/"yes"; an unset key exits non-zero, which we read as
    // "not enabled".
    try {
      const { stdout } = await execFileP("git", ["config", "--bool", "core.longpaths"], { cwd: root });
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  },
  async enableLongPaths(root) {
    // LOCAL config: the setting is per-checkout state, never a global change to
    // the operator's git.
    await runGit(["config", "--local", "core.longpaths", "true"], root);
  },
  async longestTrackedPath(root, ref) {
    // The deepest tracked blob at the base commit is the longest file path the
    // worktree checkout must materialize. `-z` keeps names with odd characters
    // intact; `ls-tree` is index-independent so it reads exactly `ref`.
    const { stdout } = await runGit(["ls-tree", "-r", "-z", "--name-only", ref], root);
    let longest = "";
    for (const entry of stdout.split("\0")) {
      if (entry.length > longest.length) longest = entry;
    }
    return longest;
  },
};

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

let canonicalParentWriteChain = Promise.resolve();

function queueCanonicalParentWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = canonicalParentWriteChain.then(operation, operation);
  canonicalParentWriteChain = next.then(() => undefined, () => undefined);
  return next;
}

function parentRunDir(canonicalMissionDir: string, runId: string): string {
  return path.join(canonicalMissionDir, "runs", runId);
}

function parentTeamStatePath(canonicalMissionDir: string, runId: string): string {
  return path.join(parentRunDir(canonicalMissionDir, runId), "team-state.json");
}

function workerArtifactRoot(teamRoot: string, workerId: string, parentRunId: string): string {
  return path.join(teamRoot, "artifacts", parentRunId, "workers", workerId);
}

/** Where a team worker's run records live, resolved from its worktree path. */
export type TeamWorkerArtifactLookup = { artifactRoot: string } | { reason: string };

/**
 * A team worker writes its run records outside its own worktree — the worktree
 * is `.harness/missions/<team>/team/workers/<worker-id>`, while its records
 * live under the team's artifact root. Given that worktree path, resolve the
 * artifact root the team recorded for the worker, through the team's run
 * pointer and `team-state.json`; never by guessing the newest directory.
 * Returns `null` when the path is not a team worker worktree, otherwise the
 * resolved artifact root or the lookup that failed.
 */
export async function resolveTeamWorkerArtifactRoot(workerWorktree: string): Promise<TeamWorkerArtifactLookup | null> {
  const workersRoot = path.dirname(workerWorktree);
  const teamRoot = path.dirname(workersRoot);
  const teamMissionDir = path.dirname(teamRoot);
  const missionsRoot = path.dirname(teamMissionDir);
  const harnessRoot = path.dirname(missionsRoot);
  if (path.basename(workersRoot) !== "workers" || path.basename(teamRoot) !== "team"
    || path.basename(missionsRoot) !== "missions" || path.basename(harnessRoot) !== ".harness") {
    return null;
  }
  const workerId = path.basename(workerWorktree);
  const teamMissionId = path.basename(teamMissionDir);
  const teamLatest = await readLatestPointer(path.dirname(harnessRoot), teamMissionId);
  if (!teamLatest) {
    return { reason: `the team ${teamMissionId} has no latest.json run pointer, so the worker artifact root cannot be located` };
  }
  let state: CanonicalTeamState;
  try {
    state = CanonicalTeamStateSchema.parse(JSON.parse(await readFile(parentTeamStatePath(teamMissionDir, teamLatest.run_id), "utf-8")));
  } catch (error) {
    const detail = (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "has no team-state.json"
      : "has an unreadable team-state.json";
    return { reason: `the team ${teamMissionId} run ${teamLatest.run_id} ${detail}, so the worker artifact root cannot be located` };
  }
  const worker = state.workers.find((entry) => entry.id === workerId);
  if (!worker) {
    return { reason: `the team state names no worker ${workerId}, so the worker artifact root cannot be located` };
  }
  const artifactRoot = path.resolve(teamRoot, worker.artifact_scope);
  if (!isPathWithin(artifactRoot, teamRoot)) {
    return { reason: `the team state names an artifact root outside the team for worker ${workerId}` };
  }
  return { artifactRoot };
}

type WorkerContract = NonNullable<CanonicalTeamWorker["contract"]>;

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveWorkerContract(
  canonicalPacket: Record<string, unknown>,
  spec: TeamWorkerSpec,
  basePacket: Record<string, unknown> = canonicalPacket,
  template?: SessionTemplate,
): WorkerContract {
  const baseObjective = typeof basePacket.objective === "string" ? basePacket.objective : "";
  const parentObjective = typeof canonicalPacket.objective === "string" ? canonicalPacket.objective : "";
  const objective = spec.objective !== undefined
    ? [spec.objective, basePacket === canonicalPacket
      ? (parentObjective ? `Team objective: ${parentObjective}` : "")
      : (baseObjective ? `Worker mission objective: ${baseObjective}` : "")].filter(Boolean).join("\n\n")
    : baseObjective;
  const baseOverrides = objectRecord(basePacket.runtime_config_overrides);
  const parentOverrides = objectRecord(canonicalPacket.runtime_config_overrides);
  const workerOverrides = spec.runtime_config_overrides ?? {};
  // The template is the least specific source: the parent packet, the worker's
  // own packet, and the worker spec each override it key by key.
  const runtimeConfigOverrides = {
    ...(template?.runtime_config_overrides ?? {}),
    ...parentOverrides,
    ...baseOverrides,
    ...workerOverrides,
  };
  const mergedLimits = {
    ...(template?.limits ?? {}),
    ...objectRecord(parentOverrides.limits),
    ...objectRecord(baseOverrides.limits),
    ...(spec.limits ?? {}),
  };
  if (Object.keys(mergedLimits).length > 0) {
    runtimeConfigOverrides.limits = mergedLimits;
  }
  const mergedRecovery = {
    ...(template?.recovery ?? {}),
    ...objectRecord(parentOverrides.recovery),
    ...objectRecord(baseOverrides.recovery),
  };
  if (Object.keys(mergedRecovery).length > 0) {
    runtimeConfigOverrides.recovery = mergedRecovery;
  }
  const expectedOutputs = spec.expected_outputs ?? (
    basePacket.expected_outputs && typeof basePacket.expected_outputs === "object"
      ? basePacket.expected_outputs as WorkerContract["expected_outputs"]
      : undefined
  );
  const baseConstraints = Array.isArray(basePacket.constraints)
    ? basePacket.constraints.filter((item): item is string => typeof item === "string")
    : [];
  // Worker rules land after the worker's own constraints, the same order the
  // prompt renders: mission guidance first, then the template's.
  const constraints = appendWorkerRules(baseConstraints, template?.worker_rules ?? []);
  // `memory_mb` is a team-resource concern, not a runtime limit; the canonical
  // contract's strict limits schema rejects it, so keep it out of `limits` (it
  // still rides in `runtime_config_overrides.limits` for the runtime packet).
  const contractLimits: Record<string, unknown> = { ...mergedLimits };
  delete contractLimits.memory_mb;
  return {
    ...(objective ? { objective } : {}),
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(Object.keys(runtimeConfigOverrides).length > 0 ? { runtime_config_overrides: runtimeConfigOverrides } : {}),
    ...(Object.keys(contractLimits).length > 0 ? { limits: contractLimits } : {}),
    ...(expectedOutputs ? { expected_outputs: expectedOutputs } : {}),
    ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
  };
}

function deriveWorkerPacket(
  canonicalPacket: Record<string, unknown>,
  contract: WorkerContract,
): Record<string, unknown> {
  const packet: Record<string, unknown> = { ...canonicalPacket };
  if (contract.objective !== undefined) packet.objective = contract.objective;
  if (contract.constraints !== undefined) packet.constraints = contract.constraints;
  if (contract.runtime_config_overrides !== undefined) {
    packet.runtime_config_overrides = contract.runtime_config_overrides;
  }
  if (contract.expected_outputs !== undefined) {
    packet.expected_outputs = contract.expected_outputs;
  }
  if (contract.seed !== undefined) {
    const constraints = Array.isArray(packet.constraints) ? [...packet.constraints] : [];
    constraints.push(`Seed: ${contract.seed}. Use it for every randomized step and print it in your final message.`);
    packet.constraints = constraints;
  }
  return packet;
}

async function writeDerivedMissionPacket(
  canonicalBytes: string,
  worktreePath: string,
  missionId: string,
  contract: WorkerContract,
): Promise<string> {
  const canonicalPacket = parse(canonicalBytes) as Record<string, unknown>;
  const derivedBytes = stringify(deriveWorkerPacket(canonicalPacket, contract));
  const target = path.join(worktreePath, ".harness", "missions", missionId);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "mission.yaml"), derivedBytes, "utf-8");
  return derivedBytes;
}

async function seedCanonicalWorkerScope(
  canonicalMissionDir: string,
  artifactRoot: string,
  missionId: string,
  missionYamlContent?: string,
): Promise<void> {
  const target = path.join(artifactRoot, ".harness", "missions", missionId);
  await mkdir(target, { recursive: true });
  const missionYaml = path.join(canonicalMissionDir, "mission.yaml");
  if (missionYamlContent !== undefined) {
    await writeFile(path.join(target, "mission.yaml"), missionYamlContent, "utf-8");
  } else if (await fileExists(missionYaml)) {
    await writeFile(path.join(target, "mission.yaml"), await readFile(missionYaml, "utf-8"), "utf-8");
  }
}

async function writeCanonicalTeamState(
  canonicalMissionDir: string,
  teamRoot: string,
  state: CanonicalTeamState,
): Promise<void> {
  CanonicalTeamStateSchema.parse(state);
  await mkdir(parentRunDir(canonicalMissionDir, state.run_id), { recursive: true });
  await writeFile(parentTeamStatePath(canonicalMissionDir, state.run_id), JSON.stringify(state, null, 2), "utf-8");
  void teamRoot;
}

async function readCanonicalRuntimeResult(
  artifactRoot: string,
  missionId: string,
  runId: string,
): Promise<RuntimeResultDocument | undefined> {
  const resultPath = path.join(artifactRoot, ".harness", "missions", missionId, "runs", runId, "runtime-result.yaml");
  try {
    return RuntimeResultSchema.parse(parse(await readFile(resultPath, "utf-8")));
  } catch {
    return undefined;
  }
}

function runtimeStatusForTeam(status: CanonicalTeamStatus): RuntimeResultStatus {
  if (status === "passed" || status === "passed_partial") return "passed";
  if (status === "blocked") return "blocked";
  return "failed";
}

function runStatusForTeam(status: CanonicalTeamStatus): "running" | "passed" | "failed" | "blocked" {
  if (status === "running") return "running";
  if (status === "passed" || status === "passed_partial") return "passed";
  if (status === "blocked") return "blocked";
  return "failed";
}


async function readCanonicalSentinel(
  artifactRoot: string,
  missionId: string,
  runId: string,
): Promise<string> {
  try {
    return await readFile(
      path.join(artifactRoot, ".harness", "missions", missionId, "runs", runId, "runtime-final.txt"),
      "utf-8",
    );
  } catch {
    return "";
  }
}

async function persistCanonicalParentProjection(
  root: string,
  canonicalMissionDir: string,
  verification: VerifyMissionLike | null,
  state: CanonicalTeamState,
  contexts: TeamRuntimeContext[],
): Promise<string | null> {
  const finishedAt = state.finished_at ?? new Date().toISOString();
  const accounting = await Promise.all(contexts.map(context => readRuntimeAccounting(context.artifactRoot, context.missionId ?? state.mission_id, [context.runId])));
  const aggregate = aggregateRuntimeUsage(accounting.map(item => item.facts));
  const runDir = parentRunDir(canonicalMissionDir, state.run_id);
  const relativeState = relativeArtifactPath(root, parentTeamStatePath(canonicalMissionDir, state.run_id));
  const runtimeResult: RuntimeResultDocument = {
    schema_version: "uh.runtime-result.v0",
    mission_id: state.mission_id,
    runtime: "ultimate-harness-team",
    status: runtimeStatusForTeam(state.status),
    started_at: state.started_at,
    finished_at: finishedAt,
    exit_code: runtimeStatusForTeam(state.status) === "passed" ? 0 : 1,
    prompt_path: relativeState,
    stdout_path: relativeState,
    stderr_path: relativeState,
    diff_path: relativeArtifactPath(root, path.isAbsolute(state.integration_report_path)
      ? state.integration_report_path
      : path.resolve(root, state.integration_report_path)),
    errors: [],
    ...(aggregate.provider ? { provider: aggregate.provider } : {}),
    ...(aggregate.model ? { model: aggregate.model } : {}),
    ...(aggregate.usage ? { usage: aggregate.usage } : {}),
    ...(aggregate.cost_usd !== undefined ? { cost_usd: aggregate.cost_usd } : {}),
    ...(aggregate.cost_basis ? { cost_basis: aggregate.cost_basis } : {}),
  };
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify(runtimeResult), "utf-8");
  let verificationPath: string | null = null;
  let verificationYaml: string | undefined;
  if (verification && await fileExists(verification.path)) {
    verificationYaml = await readFile(verification.path, "utf-8");
    verificationPath = path.join(runDir, "verification.yaml");
    await writeFile(verificationPath, verificationYaml, "utf-8");
  }

  await queueCanonicalParentWrite(async () => {
    await appendRunsIndexEntry(root, state.mission_id, {
      run_id: state.run_id,
      started_at: state.started_at,
      finished_at: finishedAt,
      status: runStatusForTeam(state.status),
      runtime: "ultimate-harness-team",
    });
    const current = await readLatestPointer(root, state.mission_id);
    const currentStarted = current ? Date.parse(current.started_at) : Number.NaN;
    const selected = !current || current.run_id === state.run_id || !Number.isFinite(currentStarted)
      || currentStarted <= Date.parse(state.started_at);
    if (!selected) return;
    await writeFile(path.join(canonicalMissionDir, "runtime-result.yaml"), stringify(runtimeResult), "utf-8");
    if (verificationYaml !== undefined) {
      await writeFile(path.join(canonicalMissionDir, "verification.yaml"), verificationYaml, "utf-8");
    }
    await writeLatestPointer(root, state.mission_id, {
      schema_version: "uh.latest-run.v0",
      run_id: state.run_id,
      started_at: state.started_at,
      finished_at: finishedAt,
      status: runStatusForTeam(state.status),
    });
  });
  return verificationPath;
}

export async function runTeamMission(
  mission: TeamMission,
  root: string,
  options: RunTeamMissionOptions,
): Promise<TeamRunResult> {
  // Resolve every worker's session template BEFORE planning or dispatch, so an
  // unknown template id fails the whole team up front instead of after a
  // worker's worktree exists. Each id is loaded once and reused by every worker
  // that names it.
  const workerTemplates = new Map<string, SessionTemplate>();
  for (const spec of mission.team.workers) {
    if (spec.template === undefined || workerTemplates.has(spec.template)) continue;
    workerTemplates.set(spec.template, await getSessionTemplate(root, spec.template));
  }
  const plan = planTeamRun(mission, root, { strategy: options.strategy, templates: workerTemplates });
  workerConcurrency(plan.workers.length, mission.team.resources);
  const workerMemory = mission.team.resources?.worker_memory_mb;
  if (workerMemory && (process.platform !== "win32" || plan.workers.some(worker => !["oh-my-pi", "command-code", "claude-code"].includes(worker.adapter)))) {
    throw new Error("A worker memory cap requires the native Windows Job runner (oh-my-pi, command-code, or claude-code); refusing unenforced execution");
  }
  // Resolve the per-worker memory the team is admitted against. An undeclared
  // cap is filled from this project's recorded run peaks (or the 700 MB
  // fallback); the resolved values are reported in the integration report.
  const resources = await resolveTeamResources(
    root,
    plan.workers.map((worker) => worker.adapter),
    mission.team.resources ?? {},
  );
  const gitOps = options.gitOps ?? defaultGitOps;
  const baseRef = options.baseRef ?? "HEAD";
  // Resolve the base ref to a commit id ONCE, before any worker starts, so every
  // worker and the leader branch from the same immutable commit (not from a ref
  // that can advance mid-run), and so independent review can read the exact fork
  // point back from `branch.<name>.base`.
  const baseCommit = gitOps.resolveCommit ? await gitOps.resolveCommit(root, baseRef) : undefined;
  const worktreeBase = baseCommit ?? baseRef;

  const canonicalMissionDir = path.resolve(missionsDir(root), mission.id);
  const missionPath = path.join(canonicalMissionDir, "mission.yaml");
  if (!(await fileExists(missionPath))) {
    throw new Error(`Team mission packet not found at ${missionPath}; create the mission before run-team.`);
  }
  await guardTeamRelaunch({
    gitOps,
    root,
    missionId: mission.id,
    plan,
    replace: options.replace === true,
  });
  // The canonical packet on disk is the single source of truth for workers.
  const canonicalBytes = await readFile(missionPath, "utf-8");
  const canonicalPacket = parse(canonicalBytes) as Record<string, unknown>;
  const workerMissionPackets = new Map<string, { id: string; bytes: string; packet: Record<string, unknown> }>();
  for (const worker of plan.workers) {
    const missionId = worker.spec?.mission_id;
    if (!missionId) continue;
    assertSafeMissionId(missionId);
    const resolvedPath = assertWithinRoot(
      path.join(root, ".harness", "missions", missionId, "mission.yaml"),
      root,
      "worker mission",
    );
    if (!(await fileExists(resolvedPath))) {
      throw new Error(`Worker mission packet not found at ${resolvedPath}`);
    }
    await loadMissionFile(resolvedPath);
    const bytes = await readFile(resolvedPath, "utf-8");
    workerMissionPackets.set(worker.id, { id: missionId, bytes, packet: parse(bytes) as Record<string, unknown> });
  }
  const parentRunId = generateRunId();
  const startedAt = new Date().toISOString();
  const workerContexts = new Map<string, TeamRuntimeContext>();
  const canonicalState: CanonicalTeamState = {
    schema_version: "uh.team-run.v0",
    mission_id: mission.id,
    run_id: parentRunId,
    status: "running",
    started_at: startedAt,
    finished_at: null,
    integration_report_path: relativeArtifactPath(root, plan.integrationReportPath),
    verification_status: null,
    leader: { role: mission.team.leader.role ?? "integrator", adapter: plan.leader.adapter, status: "queued" },
    workers: plan.workers.map((worker) => {
      const runId = generateRunId();
      const artifactRoot = workerArtifactRoot(plan.teamRoot, worker.id, parentRunId);
      const workerSpec = worker.spec ?? { role: worker.role, adapter: worker.adapter as TeamWorker["adapter"] };
      const workerMission = workerMissionPackets.get(worker.id);
      const template = workerSpec.template ? workerTemplates.get(workerSpec.template) : undefined;
      const contract = resolveWorkerContract(canonicalPacket, workerSpec, workerMission?.packet, template);
      // The runtime receives the same limits the contract adopted: template
      // defaults first, then the worker's own limits, then the memory cap.
      const limits = {
        ...(template?.limits ?? {}),
        ...(workerSpec.limits ?? {}),
        ...(workerMemory ? { memory_mb: workerMemory } : {}),
      };
      workerContexts.set(worker.id, {
        artifactRoot,
        runId,
        ...(workerMission ? { missionId: workerMission.id } : {}),
        ...(Object.keys(limits).length > 0 ? { limits } : {}),
      });
      return {
        id: worker.id,
        role: worker.role,
        ...(workerMission ? { mission_id: workerMission.id } : {}),
        adapter: worker.adapter,
        run_id: runId,
        artifact_scope: relativeArtifactPath(plan.teamRoot, artifactRoot),
        runtime_result_path: null,
        status: "queued",
        completion: "complete",
        started_at: startedAt,
        finished_at: null,
        contract,
        ...(baseCommit !== undefined ? { base_commit: baseCommit } : {}),
      };
    }),
  };
  let stateWrite = Promise.resolve();
  const persistState = async (): Promise<void> => {
    stateWrite = stateWrite.then(() => writeCanonicalTeamState(canonicalMissionDir, plan.teamRoot, canonicalState));
    await stateWrite;
  };
  await persistState();
  await queueCanonicalParentWrite(async () => {
    await appendRunsIndexEntry(root, mission.id, {
      run_id: parentRunId,
      started_at: startedAt,
      status: "running",
      runtime: "ultimate-harness-team",
    });
    const current = await readLatestPointer(root, mission.id);
    const currentStarted = current ? Date.parse(current.started_at) : Number.NaN;
    if (!current || current.run_id === parentRunId || !Number.isFinite(currentStarted)
      || currentStarted <= Date.parse(startedAt)) {
      await writeLatestPointer(root, mission.id, {
        schema_version: "uh.latest-run.v0",
        run_id: parentRunId,
        started_at: startedAt,
        status: "running",
      });
    }
  });

  // ------------------------------------------------------------------ workers
  // Worktree creation goes through `git worktree add`, which writes to the
  // shared `.git/worktrees/` index. Real `git` serializes these writes
  // internally, but to keep the failure mode deterministic across CI runners
  // we serialize at the JS layer. Spawning the workers themselves runs in
  // parallel — that's where the wall-clock win is.
  let setupQueue = Promise.resolve();
  const launchedWorkers = new Set<string>();
  const admissionNotes: string[] = [];
  // Windows MAX_PATH handling, before any worktree is created: enable
  // `core.longpaths` in this repository's local config when it is not already
  // on (noted in the report), and resolve the base ref's longest tracked path
  // once so each worktree preflight can name both lengths if it fails.
  const platform = options.platform ?? process.platform;
  const longPaths = await prepareLongPaths({ gitOps, root, platform });
  const setupNotes: string[] = longPaths.note ? [longPaths.note] : [];
  const longestTracked = platform === "win32" && gitOps.longestTrackedPath
    ? await gitOps.longestTrackedPath(root, worktreeBase).catch(() => "")
    : "";
  const admissionWaits: string[] = [];
  const workerOutcomes: WorkerOutcome[] = await mapResourceWaves(plan.workers, resources.limits, async (wp): Promise<WorkerOutcome> => {
    const slot: { plan: WorkerPlan; setupError?: Error } = { plan: wp };
    const setup = setupQueue.then(async () => {
      const context = workerContexts.get(wp.id)!;
      const workerMission = workerMissionPackets.get(wp.id);
      const workerMissionId = workerMission?.id ?? mission.id;
      const preflight = checkWorktreePathLength({
        label: `worker ${wp.id}`,
        worktreePath: wp.worktreePath,
        longestTrackedPath: longestTracked,
        longPathsOk: longPaths.ok,
        platform,
      });
      if (preflight) throw new Error(preflight);
      await seedCanonicalWorkerScope(canonicalMissionDir, context.artifactRoot, mission.id);
      await gitOps.addWorktree(root, wp.branch, wp.worktreePath, worktreeBase);
      if (baseCommit !== undefined && gitOps.setBranchBase) {
        await gitOps.setBranchBase(root, wp.branch, baseCommit);
      }
      await seedMissionPacket(canonicalMissionDir, wp.worktreePath, mission.id);
      const workerSpec = wp.spec ?? { role: wp.role, adapter: wp.adapter as TeamWorker["adapter"] };
      const template = workerSpec.template ? workerTemplates.get(workerSpec.template) : undefined;
      const contract = resolveWorkerContract(canonicalPacket, workerSpec, workerMission?.packet, template);
      const sourceBytes = workerMission?.bytes ?? canonicalBytes;
      const derivedBytes = await writeDerivedMissionPacket(sourceBytes, wp.worktreePath, workerMissionId, contract);
      if (workerMission) {
        await seedCanonicalWorkerScope(canonicalMissionDir, context.artifactRoot, workerMissionId, derivedBytes);
      } else {
        await seedCanonicalWorkerScope(canonicalMissionDir, context.artifactRoot, mission.id, derivedBytes);
      }
      await writeWorkerArtifactGitignore(wp.worktreePath);
      // The harness owns every protected path; anything it rewrote into this
      // worktree (the Command Code hook config, the seeded mission packet) must
      // not masquerade as the worker's own change. `--skip-worktree` is
      // per-index, so it hides the churn here and nowhere else.
      await markProtectedPathsSkipWorktree(wp.worktreePath);
    });
    setupQueue = setup.then(() => undefined, () => undefined);
    try { await setup; }
    catch (error) { slot.setupError = error instanceof Error ? error : new Error(String(error)); }
    const context = workerContexts.get(slot.plan.id)!;
    const canonicalWorker = canonicalState.workers.find((worker) => worker.id === slot.plan.id)!;
    if (slot.setupError) {
      canonicalWorker.status = "error";
      canonicalWorker.finished_at = new Date().toISOString();
      await persistState();
      return {
        plan: slot.plan,
        exitCode: 1,
        status: "error" as const,
        errorMessage: `worktree setup failed: ${formatGitError(slot.setupError)}`,
        filesTouched: [],
        finalSentinel: "",
        merge: null,
        integrated: false,
        runId: context.runId,
        artifactScope: canonicalWorker.artifact_scope,
      };
    }
    const workerMissionId = canonicalWorker.mission_id ?? mission.id;
    const workerMissionPath = path.join(slot.plan.worktreePath, ".harness", "missions", workerMissionId, "mission.yaml");
    try {
      const runner = options.runnerFor(slot.plan.adapter);
      canonicalWorker.status = "running";
      canonicalWorker.started_at = new Date().toISOString();
      await persistState();
      context.onAttempt = async (runId) => {
        context.runId = runId;
        canonicalWorker.run_id = runId;
        // Register the worker at the PROJECT root so `uh ps` finds it from
        // outside the team tree. Team identity comes straight from the plan,
        // not from path parsing, so it is exact.
        const overrides = canonicalWorker.contract?.runtime_config_overrides;
        const model = overrides !== undefined && typeof overrides.model === "string" ? overrides.model : undefined;
        try {
          await registerLiveRun({
            projectRoot: root,
            artifactRoot: context.artifactRoot,
            runId,
            missionId: workerMissionId,
            runtime: slot.plan.adapter,
            ...(model !== undefined ? { model } : {}),
            team: { mission_id: mission.id, role: slot.plan.role },
          });
        } catch {
          // The registry is best-effort; a worker must not fail because of it.
        }
        await persistState();
      };
      launchedWorkers.add(slot.plan.id);
      let res: TeamRuntimeRunResult;
      try {
        res = await runner(slot.plan.adapter, slot.plan.worktreePath, workerMissionPath, context);
      } finally {
        await writeFile(workerMissionPath, workerMissionPackets.get(slot.plan.id)?.bytes ?? canonicalBytes, "utf-8");
      }
      const runtimeResult = await (async () => {
        // End-of-run consistency: the runtime-control receipt is the
        // confirmed settlement. A runtime result that contradicts it gets a
        // `settlement_conflict` record and the confirmed settlement is
        // preferred before the status decision reads it. Best-effort: a
        // reconciliation failure must not fail the worker.
        await reconcileRuntimeResultControl(context.artifactRoot, workerMissionId, context.runId).catch(() => undefined);
        return readCanonicalRuntimeResult(context.artifactRoot, workerMissionId, context.runId);
      })();
      const finalSentinel = (await readCanonicalSentinel(context.artifactRoot, workerMissionId, context.runId))
        || await readSentinel(slot.plan.worktreePath, workerMissionId);
      await stripWorkerSessionArtifacts(slot.plan.worktreePath, workerMissionId);
      canonicalWorker.completion = runtimeResult?.completion ?? res.result?.completion ?? "complete";
      // The reconciled, on-disk runtime result is the authoritative verdict
      // when one was written; the adapter's in-memory copy is the fallback.
      let status = classifyRuntimeStatus({ ...res, result: runtimeResult ?? res.result });
      // A settled worker whose runtime exited non-zero after the settlement
      // did its work; the exit is a post-run artifact, not a worker failure.
      const postRunWarning = status === "succeeded" && res.exitCode !== 0
        ? `Runtime exited with code ${res.exitCode} after a settled pass; treated as succeeded`
        : undefined;
      const expectedOutputs = canonicalWorker.contract?.expected_outputs ?? slot.plan.spec?.expected_outputs;
      if (status === "succeeded" && expectedOutputs) {
        const outputs = await Promise.all(expectedOutputs.files.map(async (outputPath) => {
          const check = await verifyExpectedArtifact(slot.plan.worktreePath, { path: outputPath });
          return {
            path: outputPath,
            status: check.status === "passed" ? "passed" as const : "failed" as const,
            ...(check.notes ? { notes: check.notes } : {}),
          };
        }));
        canonicalWorker.outputs = outputs;
        const failure = outputs.find((output) => output.status === "failed");
        if (failure) {
          status = "blocked";
          canonicalWorker.blocked_reason = `Declared output ${failure.path}: ${failure.notes ?? "verification failed"}`;
        }
      }
      canonicalWorker.status = status === "succeeded"
        ? "succeeded"
        : status === "blocked"
          ? "blocked"
          : status === "failed"
            ? "failed"
            : "error";
      canonicalWorker.finished_at = new Date().toISOString();
      canonicalWorker.runtime_result_path = runtimeResult
        ? relativeArtifactPath(root, path.join(context.artifactRoot, ".harness", "missions", workerMissionId, "runs", context.runId, "runtime-result.yaml"))
        : null;
      // A failed worker may still hold a complete change: salvage evaluates and
      // (only when both pass) commits it, but the leader never merges it. Both
      // the salvage commit and the settled worker's commit stage exactly the
      // paths inside the worker's write roots (or its declared outputs) — so
      // compute that scope's inputs once here.
      const commitWorkerSpec = slot.plan.spec ?? { role: slot.plan.role, adapter: slot.plan.adapter as TeamWorker["adapter"] };
      const commitBasePacket = workerMissionPackets.get(slot.plan.id)?.packet ?? canonicalPacket;
      const commitWriteRoots = resolveWorkerWriteRoots(commitWorkerSpec, commitBasePacket);
      let salvageStopCode: string | undefined;
      let salvageRecord: WorkerSalvage | undefined;
      if (status === "failed") {
        const salvageOutputs = canonicalWorker.contract?.expected_outputs ?? slot.plan.spec?.expected_outputs;
        const evaluated = await evaluateWorkerSalvage({
          gitOps,
          verifier: options.verifier,
          worktreePath: slot.plan.worktreePath,
          branch: slot.plan.branch,
          workerId: slot.plan.id,
          workerMissionId,
          artifactRoot: context.artifactRoot,
          runId: context.runId,
          expectedOutputs: salvageOutputs?.files,
          writeRoots: commitWriteRoots,
        });
        salvageStopCode = evaluated.stopCode;
        salvageRecord = evaluated.record;
        if (salvageRecord) canonicalWorker.salvage = salvageRecord;
        if (evaluated.outOfRoots) canonicalWorker.out_of_roots = evaluated.outOfRoots;
      }
      // Classify the worktree's changed paths before committing: only paths
      // inside the worker's resolved write roots (or its declared outputs) are
      // staged. A child process — a build — can write outside those roots with
      // the tool guard none the wiser, so those paths stay unstaged and are
      // recorded as out_of_roots.
      let outOfRoots: WorkerOutcome["outOfRoots"] = canonicalWorker.out_of_roots;
      let stagePaths: string[] | undefined;
      let forcePaths: string[] | undefined;
      if (status === "succeeded") {
        const scope = await resolveWorkerCommitScope({
          gitOps,
          worktreePath: slot.plan.worktreePath,
          writeRoots: commitWriteRoots,
          expectedOutputs: expectedOutputs?.files ?? [],
        });
        stagePaths = scope.stagePaths;
        forcePaths = scope.forcePaths;
        outOfRoots = scope.outOfRoots;
        if (outOfRoots) canonicalWorker.out_of_roots = outOfRoots;
      }
      await persistState();
      let commitErr: string | null = null;
      if (status === "succeeded") {
        try {
          await gitOps.commitAll(slot.plan.worktreePath, `team(${slot.plan.id}): worker run`, stagePaths, forcePaths);
        } catch (err) {
          commitErr = formatGitError(err);
        }
      }
      return {
        plan: slot.plan,
        exitCode: res.exitCode,
        status,
        errorMessage: commitErr ?? canonicalWorker.blocked_reason,
        filesTouched: [],
        finalSentinel,
        merge: null,
        integrated: false,
        runId: context.runId,
        artifactScope: canonicalWorker.artifact_scope,
        runtimeResult,
        ...(postRunWarning !== undefined ? { postRunWarning } : {}),
        ...(salvageStopCode !== undefined ? { stopCode: salvageStopCode } : {}),
        ...(salvageRecord ? { salvage: salvageRecord } : {}),
        ...(outOfRoots ? { outOfRoots } : {}),
      };
    } catch (err) {
      canonicalWorker.status = "error";
      canonicalWorker.finished_at = new Date().toISOString();
      await persistState();
      return {
        plan: slot.plan,
        exitCode: 1,
        status: "error" as const,
        errorMessage: formatGitError(err),
        filesTouched: [],
        finalSentinel: "",
        merge: null,
        integrated: false,
        runId: context.runId,
        artifactScope: canonicalWorker.artifact_scope,
      };
    }
  }, {
    costOf: async (_outcome, worker) => {
      if (!launchedWorkers.has(worker.id)) return 0;
      const context = workerContexts.get(worker.id)!;
      return (await readRuntimeAccounting(context.artifactRoot, mission.id, [context.runId])).facts.cost_usd;
    },
    blocked: async (worker, reason) => {
      const context = workerContexts.get(worker.id)!;
      const canonicalWorker = canonicalState.workers.find(item => item.id === worker.id)!;
      canonicalState.admission_blocked_reason = reason;
      canonicalWorker.status = "blocked";
      canonicalWorker.finished_at = new Date().toISOString();
      await persistState();
      return { plan: worker, exitCode: 1, status: "blocked", errorMessage: reason, filesTouched: [],
        finalSentinel: "", merge: null, integrated: false, runId: context.runId, artifactScope: canonicalWorker.artifact_scope };
    },
    onAdmission: async (note) => {
      admissionNotes.push(note);
      canonicalState.admission_notes = [...admissionNotes];
      await persistState();
    },
    root,
    onWait: async (note) => {
      admissionWaits.push(note);
    },
    ...(options.availableBytes !== undefined ? { availableBytes: options.availableBytes } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
  });

  // ------------------------------------------------------------------- leader
  canonicalState.leader.status = "integrating";
  await persistState();
  const leaderPreflight = checkWorktreePathLength({
    label: "leader",
    worktreePath: plan.leader.worktreePath,
    longestTrackedPath: longestTracked,
    longPathsOk: longPaths.ok,
    platform,
  });
  const leaderError = leaderPreflight ?? await safeAddWorktree(gitOps, root, plan.leader, worktreeBase);
  const leaderReady = leaderError === null;
  if (leaderReady) {
    if (baseCommit !== undefined && gitOps.setBranchBase) {
      await gitOps.setBranchBase(root, plan.leader.branch, baseCommit);
    }
    await seedMissionPacket(canonicalMissionDir, plan.leader.worktreePath, mission.id);
  } else {
    canonicalState.leader.status = "failed";
    await persistState();
  }

  // Collect files touched per worker (vs base). Done after worker commits so
  // the diff reflects the persisted state on the branch.
  for (const outcome of workerOutcomes) {
    if (outcome.status !== "succeeded") continue;
    outcome.filesTouched = await gitOps.diffFiles(root, worktreeBase, outcome.plan.branch);
  }

  // Leader integrates each successful worker. The strategy guard was
  // enforced by `planTeamRun` before any worker dispatch, so by here we
  // know `plan.leader.strategy === "merge"` and can integrate directly.
  let hadConflicts = false;
  if (!leaderReady) {
    hadConflicts = true;
  } else {
    for (const outcome of workerOutcomes) {
      if (outcome.status !== "succeeded") {
        outcome.merge = { conflicted: false, conflictPaths: [], note: `skipped: worker status=${outcome.status}` };
        hadConflicts = true;
        continue;
      }
      const mergeOutcome = await gitOps.merge(plan.leader.worktreePath, outcome.plan.branch);
      outcome.merge = mergeOutcome;
      // Codex P1: only a clean (non-conflicted, non-failed) merge counts as
      // integrated. A non-conflict merge failure must NOT mark the worker
      // integrated just because conflict markers are absent.
      outcome.integrated = !mergeOutcome.conflicted && !mergeOutcome.failed;
      if (mergeOutcome.conflicted || mergeOutcome.failed) hadConflicts = true;
    }
  }

  // ----------------------------------------------------------- integration md
  const reportPath = await writeIntegrationReport({
    missionId: mission.id,
    plan,
    workers: workerOutcomes,
    leaderReady,
    leaderError,
    integrationReportPath: plan.integrationReportPath,
    admissionNotes,
    setupNotes,
    admissionWaits,
    resources,
  });

  // ------------------------------------------------------------- verification
  // Run verification whenever the leader's worktree is usable, even when
  // some workers conflicted or failed. A clean-merge subset can still be a
  // meaningful integration; the verifier — not the merge outcome alone —
  // decides whether the result is shippable. Verifier exceptions are
  // captured separately from `hadConflicts` (review finding F4) so the
  // integration-report's conflict accounting stays accurate.
  let verification: VerifyMissionLike | null = null;
  let leaderRanVerification = false;
  let verificationFailed = false;
  if (leaderReady && options.verifier) {
    try {
      verification = await options.verifier(plan.leader.worktreePath, mission.id);
      leaderRanVerification = true;
    } catch (err) {
      verification = null;
      verificationFailed = true;
      await appendReportFailure(reportPath, `verification raised: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ verdict
  // Catastrophic leader-setup failure or a verifier exception is hard-failed.
  // Verifier-reported `failed` is also a failure. Otherwise:
  //   - clean integration + verifier passed            -> passed
  //   - partial integration + verifier passed + a
  //     surviving worker actually landed                -> passed_partial (UH-127)
  //   - partial integration, nothing landed, or no
  //     verifier wired                                  -> blocked
  //   - verifier blocked                                -> blocked
  //
  // UH-127: do NOT report BLOCKED when M<N workers succeeded but (a) leader
  // integration is clean for the survivors, (b) verification.required_checks
  // pass on the integrated result (verifier returns `passed`), and (c) at
  // least one worker satisfied acceptance and was integrated. That is a
  // shippable partial result, surfaced as the non-blocking `passed_partial`.
  // Genuine BLOCKED is preserved for real verification failures, a verifier
  // that was never run, or a partial run where nothing integrated.
  const anyWorkerIntegrated = workerOutcomes.some((w) => w.integrated);
  const overallStatus: TeamRunStatus = (() => {
    if (!leaderReady) return "failed";
    if (verificationFailed) return "failed";
    if (verification && verification.status === "failed") return "failed";
    if (canonicalState.admission_blocked_reason) return "blocked";
    if (verification && verification.status === "passed") {
      if (!hadConflicts) return "passed";
      return anyWorkerIntegrated ? "passed_partial" : "blocked";
    }
    return "blocked";
  })();
  canonicalState.status = overallStatus;
  canonicalState.finished_at = new Date().toISOString();
  canonicalState.integration_report_path = relativeArtifactPath(root, reportPath);
  canonicalState.verification_status = verification?.status ?? (verificationFailed ? "failed" : null);
  canonicalState.leader.status = !leaderReady
    ? "failed"
    : overallStatus === "passed" || overallStatus === "passed_partial"
      ? "succeeded"
      : overallStatus === "blocked"
        ? "blocked"
        : "failed";
  await persistState();
  const verificationPath = await persistCanonicalParentProjection(
    root,
    canonicalMissionDir,
    verification,
    canonicalState,
    canonicalState.workers.filter(worker => launchedWorkers.has(worker.id)).map(worker => workerContexts.get(worker.id)!),
  );
  if (verification && verificationPath) {
    verification = { ...verification, path: verificationPath };
  }

  // ----------------------------------------------------------------- cleanup
  const retained = options.retainOnSuccess === true || overallStatus !== "passed";
  if (!retained) {
    for (const w of workerOutcomes) {
      await gitOps.removeWorktree(root, w.plan.worktreePath);
      await gitOps.deleteBranch(root, w.plan.branch);
    }
    await gitOps.removeWorktree(root, plan.leader.worktreePath);
    await gitOps.deleteBranch(root, plan.leader.branch);
  }

  notifyTeamSettled(root, {
    run_id: parentRunId,
    mission: mission.id,
    status: overallStatus,
    duration_ms: elapsedMs(startedAt, canonicalState.finished_at ?? undefined),
    files_written: workerOutcomes.reduce((total, worker) => total + worker.filesTouched.length, 0),
  });

  return {
    missionId: mission.id,
    plan,
    workers: workerOutcomes,
    leaderRanVerification,
    verification,
    integrationReportPath: reportPath,
    status: overallStatus,
    hadConflicts,
    retained,
    runId: parentRunId,
  };
}

async function safeAddWorktree(gitOps: GitOps, root: string, leader: LeaderPlan, baseRef: string): Promise<string | null> {
  try {
    await gitOps.addWorktree(root, leader.branch, leader.worktreePath, baseRef);
    return null;
  } catch (err) {
    return formatGitError(err);
  }
}

function classifyRuntimeStatus(res: TeamRuntimeRunResult): WorkerOutcome["status"] {
  if (res.result?.status === "blocked") return "blocked";
  if (res.exitCode === 0) return "succeeded";
  // A worker whose runtime-result block settled as `passed` did its work: a
  // non-zero exit observed after that settlement is a post-run artifact (a
  // diff capture failure, launcher teardown), never a worker failure.
  if (res.result?.status === "passed") return "succeeded";
  return "failed";
}

/**
 * Decide whether a worker that settled as `failed` left salvageable work, and
 * if so, verify it in place.
 *
 * A worker is only considered when its stop code means it ran out of budget or
 * was halted by safety (`turn_limit`, `timeout`, `deadline`, `stall`, `policy`)
 * AND its worktree holds changes inside its write roots (or its declared
 * outputs) that are not protected — the same scope the worker commit honors, so
 * a stray temp file at the repository root is never salvaged into a commit and
 * is instead reported as `out_of_roots`. Its own declared outputs are re-checked
 * with the output verification, and the worker mission's
 * `verification.required_checks` are run in the worker worktree through the same
 * verifier the leader uses. The worktree is committed to the worker branch —
 * staging exactly the in-roots paths — only when both passed. The record is
 * always surfaced so an operator can take it deliberately; the leader never
 * merges it.
 */
async function evaluateWorkerSalvage(args: {
  gitOps: GitOps;
  verifier: TeamVerifier | undefined;
  worktreePath: string;
  branch: string;
  workerId: string;
  workerMissionId: string;
  artifactRoot: string;
  runId: string;
  expectedOutputs: readonly string[] | undefined;
  writeRoots: readonly string[];
}): Promise<{
  stopCode?: string;
  record?: WorkerSalvage;
  outOfRoots?: WorkerOutcome["outOfRoots"];
}> {
  const stopCode = await readWorkerStopCode(args.artifactRoot, args.workerMissionId, args.runId);
  if (stopCode === undefined || !SALVAGE_STOP_CODES.has(stopCode)) return { stopCode };
  // Partition the stopped worktree exactly like a settled worker's commit: only
  // paths inside the write roots or declared outputs are stageable; the rest
  // stay unstaged and are surfaced as out_of_roots on the same footing. An
  // undefined scope means the worktree could not be inspected at all (a stub
  // gitOps without `dirtyPaths`, or one that threw) — we cannot tell salvageable
  // work from harness-owned churn, so we record nothing rather than guess.
  const { stagePaths, forcePaths, outOfRoots } = await resolveWorkerCommitScope({
    gitOps: args.gitOps,
    worktreePath: args.worktreePath,
    writeRoots: args.writeRoots,
    expectedOutputs: args.expectedOutputs ?? [],
  });
  if (stagePaths === undefined) return { stopCode };
  // A declared output under an ignored directory arrives in `forcePaths` rather
  // than `stagePaths`, but it is still salvageable work, so either list makes the
  // stopped worker eligible.
  const eligible = stagePaths.length > 0 || (forcePaths?.length ?? 0) > 0;
  let outputsPassed = false;
  let checksPassed = false;
  if (eligible) {
    outputsPassed = true;
    for (const outputPath of args.expectedOutputs ?? []) {
      const check = await verifyExpectedArtifact(args.worktreePath, { path: outputPath });
      if (check.status !== "passed") { outputsPassed = false; break; }
    }
    if (args.verifier) {
      try {
        const verification = await args.verifier(args.worktreePath, args.workerMissionId);
        checksPassed = verification.status === "passed";
      } catch {
        checksPassed = false;
      }
    }
    if (outputsPassed && checksPassed) {
      try {
        await args.gitOps.commitAll(args.worktreePath, `team(${args.workerId}): salvaged worker run`, stagePaths, forcePaths);
      } catch { /* best-effort: the record still points at the branch for a human */ }
    }
  }
  return {
    stopCode,
    record: { eligible, outputs_passed: outputsPassed, checks_passed: checksPassed, branch: args.branch },
    ...(outOfRoots ? { outOfRoots } : {}),
  };
}

async function seedMissionPacket(canonicalMissionDir: string, worktreePath: string, missionId: string): Promise<void> {
  const target = path.join(worktreePath, ".harness", "missions", missionId);
  // When the worktree was branched off a ref that pre-dates the mission, the
  // .harness/missions/<id>/ directory is missing inside it. Seed the canonical
  // mission.yaml so the adapter can find the packet.
  if (await fileExists(target)) return;
  await mkdir(target, { recursive: true });
  const missionYaml = path.join(canonicalMissionDir, "mission.yaml");
  if (await fileExists(missionYaml)) {
    const src = await readFile(missionYaml, "utf-8");
    await writeFile(path.join(target, "mission.yaml"), src, "utf-8");
  }
}

/**
 * UH-128: keep per-worker runtime artifacts out of the leader merge.
 *
 * Each worker run writes session artifacts under `.harness/audit/events.ndjson`
 * and `.harness/missions/<id>/runs/<ts>/` (diff.patch, events.ndjson, prompt.md,
 * runtime-final.txt, runtime-result.yaml, runtime-session.yaml). These are
 * per-worker forensics, not code the worker owns — bleeding them onto the
 * worker branch makes the leader merge pull (and potentially conflict on)
 * files no worker actually authored. We write a worktree-local
 * `.harness/.gitignore` so `commitAll`'s `git add -A` never stages them; the
 * artifacts stay on disk for forensics but never reach the branch the leader
 * integrates. This mirrors the existing strip-before-merge isolation in
 * `stripWorkerSessionArtifacts` (belt-and-suspenders for mission-root files).
 */
async function writeWorkerArtifactGitignore(worktreePath: string): Promise<void> {
  const harness = path.join(worktreePath, ".harness");
  await mkdir(harness, { recursive: true });
  const gitignorePath = path.join(harness, ".gitignore");
  // Patterns are relative to `.harness/` (the .gitignore's directory):
  //   audit/            -> .harness/audit/ (incl. events.ndjson)
  //   missions/*/runs/  -> per-run session dirs for every mission
  //   .gitignore        -> this harness-owned file itself, so a fresh worktree
  //                        does not report it as an untracked change
  const body = [
    "# UH-128: per-worker runtime artifacts — kept on disk, never committed,",
    "# so the leader merge cannot bleed forensic files no worker authored.",
    "audit/",
    "missions/*/runs/",
    ".gitignore",
    "",
  ].join("\n");
  await writeFile(gitignorePath, body, "utf-8");
}

/** Run `git update-index --skip-worktree` for `files`, streaming paths on stdin (no argv cap). */
function updateIndexSkipWorktree(worktreePath: string, files: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      gitCommand(["update-index", "--skip-worktree", "-z", "--stdin"]),
      { cwd: worktreePath },
      (error) => (error ? reject(error) : resolve()),
    );
    child.stdin?.end(files.map((file) => `${file}\0`).join(""));
  });
}

/**
 * Hide harness-owned churn from `git status` in a worktree without touching the
 * shared index (each worktree has its own). The harness rewrites tracked files
 * under the protected roots — `.commandcode/settings.json` (Command Code hook
 * config with local paths) and the seeded `.harness` packet — none of which the
 * worker authored. `--skip-worktree` makes a fresh worker worktree report a
 * clean tree. Worker commits are unaffected: they never stage protected paths.
 */
async function markProtectedPathsSkipWorktree(worktreePath: string): Promise<void> {
  const tracked: string[] = [];
  for (const protectedPath of DEFAULT_PROTECTED_PATHS) {
    if (protectedPath === ".git") continue;
    let listing: string;
    try {
      ({ stdout: listing } = await execFileP("git", gitCommand(["ls-files", "-z", "--", protectedPath]), { cwd: worktreePath }));
    } catch {
      continue; // not a git worktree, or no index yet
    }
    for (const entry of listing.split("\0")) {
      if (entry.length === 0) continue;
      if (await fileExists(path.join(worktreePath, entry))) tracked.push(entry);
    }
  }
  if (tracked.length === 0) return;
  try {
    await updateIndexSkipWorktree(worktreePath, tracked);
  } catch {
    // Best-effort: a cosmetic status entry must never fail the worker setup.
  }
}

/* -------------------------------------------------------------------------- */
/* Relaunch lifecycle                                                         */
/* -------------------------------------------------------------------------- */

/** A branch or worktree path a planned team run would reuse from an earlier run. */
interface TeamPreexisting {
  branches: string[];
  worktrees: string[];
}

async function safeBranchExists(gitOps: GitOps, root: string, branch: string): Promise<boolean> {
  if (!gitOps.branchExists) return false;
  try {
    return await gitOps.branchExists(root, branch);
  } catch {
    return false;
  }
}

/** Planned branches and worktree paths that already exist on disk. */
async function detectTeamPreexisting(gitOps: GitOps, root: string, plan: TeamPlan): Promise<TeamPreexisting> {
  const planned = [
    ...plan.workers.map((worker) => ({ branch: worker.branch, worktreePath: worker.worktreePath })),
    { branch: plan.leader.branch, worktreePath: plan.leader.worktreePath },
  ];
  const branches: string[] = [];
  const worktrees: string[] = [];
  for (const entry of planned) {
    if (await safeBranchExists(gitOps, root, entry.branch)) branches.push(entry.branch);
    if (await fileExists(entry.worktreePath)) worktrees.push(entry.worktreePath);
  }
  return { branches, worktrees };
}

/** Run ids of live runs registered against this team, so a refusal can name them. */
async function liveTeamRunIds(root: string, missionId: string): Promise<string[]> {
  try {
    const { records } = await listLiveRuns(root, { persist: false });
    return records
      .filter((record) => record.liveness === "live" && record.team?.mission_id === missionId)
      .map((record) => record.run_id)
      .sort();
  } catch {
    // The registry is best-effort; never block a run because it could not be read.
    return [];
  }
}

/**
 * Archive — never delete — a previous run's retained worktrees, branches, and
 * team directory so a relaunch starts clean while unmerged work survives under
 * `uh/archive/<team>/<timestamp>/<role>` and `team.<timestamp>`.
 */
async function archiveTeamRun(gitOps: GitOps, root: string, plan: TeamPlan): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveBranch = (role: string): string => `uh/archive/${plan.missionId}/${timestamp}/${role}`;
  for (const worker of plan.workers) {
    await gitOps.removeWorktree(root, worker.worktreePath);
    if (gitOps.renameBranch && await safeBranchExists(gitOps, root, worker.branch)) {
      await gitOps.renameBranch(root, worker.branch, archiveBranch(worker.id));
    }
  }
  await gitOps.removeWorktree(root, plan.leader.worktreePath);
  if (gitOps.renameBranch && await safeBranchExists(gitOps, root, plan.leader.branch)) {
    await gitOps.renameBranch(root, plan.leader.branch, archiveBranch("leader"));
  }
  // Rename only AFTER the worktrees inside it are gone, or the rename would
  // move their directories out from under the removal.
  try {
    await rename(plan.teamRoot, `${plan.teamRoot}.${timestamp}`);
  } catch {
    // No team directory to archive (a run that failed during setup), already gone.
  }
}

/**
 * Refuse (or take over) a relaunch that would collide with a previous run.
 *
 * A live run of the same team always refuses, naming its run ids: nothing may
 * delete a worktree out from under a running worker. Otherwise retained
 * branches / worktrees refuse by default and name `--replace`, which archives
 * the old state instead.
 */
async function guardTeamRelaunch(args: {
  gitOps: GitOps;
  root: string;
  missionId: string;
  plan: TeamPlan;
  replace: boolean;
}): Promise<void> {
  const preexisting = await detectTeamPreexisting(args.gitOps, args.root, args.plan);
  if (preexisting.branches.length === 0 && preexisting.worktrees.length === 0) return;
  const liveRunIds = await liveTeamRunIds(args.root, args.missionId);
  if (liveRunIds.length > 0) {
    throw new Error(
      `Team mission ${args.missionId} already has a live run (${liveRunIds.join(", ")}); refuse to relaunch. Stop it first.`,
    );
  }
  if (args.replace) {
    await archiveTeamRun(args.gitOps, args.root, args.plan);
    await captureReplace(args.root, { missionId: args.missionId });
    return;
  }
  const retained = [...preexisting.branches, ...preexisting.worktrees];
  throw new Error(
    `Team mission ${args.missionId} has retained state from a previous run (${retained.join(", ")}). `
    + `Re-run with \`uh mission run-team ${args.missionId} --replace\` to archive the old branches and team directory, `
    + "or remove them by hand.",
  );
}

/**
 * UH-82: read the runtime sentinel for a worker. First try the active
 * per-run dir via the worktree's `latest.json` pointer; fall back to the
 * legacy mission-level path so tests/fakes that haven't migrated still
 * work.
 */
async function readSentinel(worktreePath: string, missionId: string): Promise<string> {
  const missionDir = path.join(worktreePath, ".harness", "missions", missionId);
  const pointerPath = path.join(missionDir, "latest.json");
  try {
    const raw = await readFile(pointerPath, "utf-8");
    const pointer = JSON.parse(raw) as { run_id?: unknown };
    if (pointer && typeof pointer.run_id === "string" && pointer.run_id.length > 0) {
      const perRun = path.join(missionDir, "runs", pointer.run_id, "runtime-final.txt");
      try { return await readFile(perRun, "utf-8"); } catch { /* fall through */ }
    }
  } catch {
    // no pointer; fall through to legacy mission-level path.
  }
  const legacy = path.join(missionDir, "runtime-final.txt");
  try { return await readFile(legacy, "utf-8"); } catch { return ""; }
}

/**
 * UH-82: per-run subdirectories under `.harness/missions/<id>/runs/<run_id>/`
 * are unique-per-worker, so they don't conflict on the leader merge.
 * The mission-level mirror `runtime-result.yaml` and the `latest.json`
 * pointer DO conflict (every worker rewrites them), so those are the
 * files we strip before handing the branch to the leader. The legacy
 * mission-level artifacts (runtime-final.txt / events.ndjson / etc) are
 * stripped too so older runners — and tests that mock the runner without
 * going through `runHermes` — don't trigger a leader-merge conflict.
 */
async function stripWorkerSessionArtifacts(worktreePath: string, missionId: string): Promise<void> {
  const dir = path.join(worktreePath, ".harness", "missions", missionId);
  // UH-128: the cross-mission audit log lives OUTSIDE missions/<id>, so the
  // per-worktree `.gitignore` (audit/) is the primary guard — but strip it
  // here too for runners/tests that bypass the gitignore (e.g. fake gitOps
  // whose `commitAll` is a no-op and doesn't honor ignore rules).
  const auditEvents = path.join(worktreePath, ".harness", "audit", "events.ndjson");
  if (await fileExists(auditEvents)) {
    try { await rm(auditEvents, { force: true }); } catch { /* tolerated */ }
  }
  // Codex P1 (PR #96 round 1): `runs/index.json` MUST be stripped —
  // every worker run writes it, so two workers would otherwise hit a
  // deterministic add/add or modify/modify merge conflict on a
  // bookkeeping file unrelated to their code changes. Per-run subdirs
  // (`runs/<run_id>/`) are NOT stripped because each worker has its own
  // run_id so the subdirs cannot collide.
  for (const name of [
    "runtime-result.yaml",
    "latest.json",
    "runs/index.json",
    "runtime-final.txt",
    "events.ndjson",
    "runtime-session.yaml",
    "runtime.stdout.log",
    "runtime.stderr.log",
    "diff.patch",
    "prompt.md",
  ]) {
    const p = path.join(dir, name);
    if (await fileExists(p)) {
      try { await rm(p, { force: true }); } catch { /* tolerated */ }
    }
  }
}

interface WriteReportArgs {
  missionId: string;
  plan: TeamPlan;
  workers: WorkerOutcome[];
  leaderReady: boolean;
  leaderError: string | null;
  integrationReportPath: string;
  admissionNotes: string[];
  setupNotes: string[];
  admissionWaits: string[];
  resources: ResolvedTeamResources;
}

function describeWorkerMemorySource(resources: ResolvedTeamResources): string {
  if (resources.worker_memory_source === "declared") return "declared by the team";
  if (resources.worker_memory_source === "recorded_median") {
    const runs = resources.worker_memory_sample_runs;
    return `median of ${runs} recorded run peak${runs === 1 ? "" : "s"}`;
  }
  return "fallback (no recorded run peaks for this runtime)";
}

async function writeIntegrationReport(args: WriteReportArgs): Promise<string> {
  await mkdir(path.dirname(args.integrationReportPath), { recursive: true });
  const lines: string[] = [];
  lines.push(`# Team integration report: ${args.missionId}`);
  lines.push("");
  lines.push(`- Leader strategy: \`${args.plan.leader.strategy}\``);
  lines.push(`- Leader branch: \`${args.plan.leader.branch}\``);
  lines.push(`- Workers: ${args.plan.workers.length}`);
  for (const note of args.setupNotes) lines.push(`- Notice: ${note}`);
  lines.push(`- Worker memory admission: ${args.resources.worker_memory_mb} MB per worker (${describeWorkerMemorySource(args.resources)})`);
  lines.push(`- Memory reserve: ${args.resources.reserve_memory_mb} MB`);
  lines.push(`- Admission timeout: ${Math.round(args.resources.admission_timeout_ms / 60_000)} min`);
  if (!args.leaderReady) {
    lines.push("");
    lines.push(`> **Leader setup failed:** ${args.leaderError ?? "unknown error"}`);
  }
  for (const note of args.admissionNotes) lines.push(`- Cost admission: ${note}`);
  for (const wait of args.admissionWaits) lines.push(`- Admission wait: ${wait}`);
  lines.push("");
  lines.push("## Workers");
  lines.push("");
  for (const outcome of args.workers) {
    lines.push(`### \`${outcome.plan.id}\` (${outcome.plan.adapter})`);
    lines.push("");
    lines.push(`- Branch: \`${outcome.plan.branch}\``);
    lines.push(`- Status: ${outcome.status}${outcome.errorMessage ? ` (${outcome.errorMessage})` : ""}`);
    if (outcome.postRunWarning) lines.push(`- Warning: ${outcome.postRunWarning}`);
    if (outcome.runId) lines.push(`- Canonical run: \`${outcome.runId}\` (${outcome.artifactScope ?? "worker scope"})`);
    lines.push(`- Files touched: ${outcome.filesTouched.length}`);
    if (outcome.filesTouched.length > 0) {
      for (const p of outcome.filesTouched) lines.push(`  - \`${p}\``);
    }
    // Changed paths the worker left outside its write roots are never staged;
    // surface them (capped, with the true count) so the integration report
    // shows exactly what stayed behind.
    if (outcome.outOfRoots && outcome.outOfRoots.total > 0) {
      lines.push(`- Not committed (outside write roots): ${outcome.outOfRoots.total} path(s)`);
      for (const p of outcome.outOfRoots.paths) lines.push(`  - \`${p}\``);
    }
    // A worker that did not succeed always renders why — the worker's own
    // error message first, the runtime result's errors as the fallback — so
    // a "failed with no reason" report cannot happen.
    if (outcome.status !== "succeeded") {
      const reason = outcome.errorMessage
        ?? (outcome.runtimeResult?.errors ?? []).map((entry) => entry.trim()).filter(Boolean).join("; ");
      lines.push(`- Failure reason: ${reason.length > 0 ? reason : "no reason recorded"}`);
    }
    if (outcome.merge) {
      // Codex P2: the report verdict must distinguish three states —
      // clean, conflict, and non-conflict failure — so operators don't
      // get a "merge: clean" line on a blocked run where `git merge`
      // actually failed without producing MERGE_HEAD.
      const verdict = outcome.merge.conflicted
        ? `conflict (${outcome.merge.conflictPaths.length} path(s))`
        : outcome.merge.failed
          ? "failed (non-conflict)"
          : "clean";
      lines.push(`- Leader merge: ${verdict}`);
      if (outcome.merge.conflicted) {
        for (const p of outcome.merge.conflictPaths) lines.push(`  - conflict: \`${p}\``);
      }
      if (outcome.merge.note) lines.push(`- Leader note: ${outcome.merge.note}`);
    } else {
      lines.push("- Leader merge: not attempted");
    }
    lines.push(`- Summary: ${oneLineSummary(outcome.finalSentinel)}`);
    lines.push("");
  }
  // Stopped-but-verified work: a failed worker whose stop code permitted
  // salvage and whose worktree held changes inside its write roots. The leader
  // never merges these automatically — the section exists so a human can take
  // the branch deliberately (a policy stop always requires a human). Paths the
  // stopped worker left outside its roots were never salvaged into the commit,
  // so they are listed here too: a branch marked "committed" holds only the
  // in-roots subset.
  const salvaged = args.workers.filter((outcome) => outcome.salvage?.eligible === true);
  lines.push("## Verified work from stopped workers");
  lines.push("");
  if (salvaged.length === 0) {
    lines.push("_(none)_");
    lines.push("");
  } else {
    for (const outcome of salvaged) {
      const salvage = outcome.salvage!;
      const stop = outcome.stopCode ? `\`${outcome.stopCode}\`` : "_unknown_";
      const verdict = salvage.outputs_passed && salvage.checks_passed ? "committed" : "not committed";
      lines.push(`- \`${outcome.plan.id}\` — stop ${stop}, branch \`${salvage.branch}\`, outputs \`${salvage.outputs_passed ? "passed" : "failed"}\`, checks \`${salvage.checks_passed ? "passed" : "failed"}\` (${verdict})`);
      if (outcome.outOfRoots && outcome.outOfRoots.total > 0) {
        lines.push(`  - not committed (outside write roots): ${outcome.outOfRoots.total} path(s)`);
        for (const p of outcome.outOfRoots.paths) lines.push(`    - \`${p}\``);
      }
    }
    lines.push("");
    lines.push("> Not merged: the leader never integrates a failed worker automatically. Take this branch deliberately.");
    lines.push("");
  }
  const report = lines.join("\n");
  await writeFile(args.integrationReportPath, report, "utf-8");
  return args.integrationReportPath;
}

async function appendReportFailure(reportPath: string, message: string): Promise<void> {
  try {
    const existing = await readFile(reportPath, "utf-8");
    await writeFile(reportPath, `${existing}\n> ${message}\n`, "utf-8");
  } catch {
    await writeFile(reportPath, `> ${message}\n`, "utf-8");
  }
}

function oneLineSummary(sentinel: string): string {
  const trimmed = sentinel.trim();
  if (trimmed.length === 0) return "_(no runtime-final.txt captured)_";
  const first = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0);
  return first ? first.trim() : "_(empty runtime-final.txt)_";
}

/** Surface from cli.ts so `uh mission run-team` can build a runner mapping. */
export function teamHarnessTeamRoot(root: string, missionId: string): string {
  return path.join(harnessDir(root), "missions", missionId, "team");
}

/**
 * Best-effort removal of every worktree + branch a previous `runTeamMission`
 * left on disk (typically because `retainOnSuccess: true` was passed so a
 * staged workflow could keep using the leader for Verify→Fix). Safe to call
 * multiple times — the underlying `gitOps.removeWorktree` is a no-op when the
 * path is already gone.
 */
export async function cleanupTeamRun(
  result: TeamRunResult,
  root: string,
  gitOps: GitOps = defaultGitOps,
): Promise<void> {
  for (const w of result.workers) {
    await gitOps.removeWorktree(root, w.plan.worktreePath);
    await gitOps.deleteBranch(root, w.plan.branch);
  }
  await gitOps.removeWorktree(root, result.plan.leader.worktreePath);
  await gitOps.deleteBranch(root, result.plan.leader.branch);
}
