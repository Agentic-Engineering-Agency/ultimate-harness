/**
 * UH-72 — Team mission runtime.
 *
 * Fans a single mission out across N adapter-bound workers (each in its
 * own git worktree on a dedicated branch), then asks a leader runtime to
 * integrate the worker diffs and runs the existing verification pipeline
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
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { harnessDir, missionsDir } from "./paths.js";
import { assertSafeMissionId, assertWithinRoot, fileExists } from "./mission.js";

const execFileP = promisify(execFile);

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type LeaderStrategy = "merge" | "cherry-pick" | "rebase";

export interface TeamWorker {
  /** Stable role name used in worktree paths and branch names. */
  role: string;
  /** Adapter id the worker dispatches against (hermes, codex, ...). */
  adapter: string;
  /** Expand to N instances. Default 1. */
  count?: number;
}

export interface TeamLeader {
  /** Adapter id the leader dispatches against. */
  adapter: string;
}

export interface TeamMission {
  /** Mission id; matches the directory under .harness/missions/. */
  id: string;
  team: {
    workers: TeamWorker[];
    leader: TeamLeader;
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

/** Mirror of `RuntimeRunResult` to avoid a circular import with run-all. */
export interface TeamRuntimeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: { status?: string; errors?: string[] };
}

export type TeamRuntimeRunner = (
  adapter: string,
  root: string,
  missionPath: string,
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
  /** `git worktree add -b <branch> <path> <baseRef>` */
  addWorktree: (root: string, branch: string, worktreePath: string, baseRef: string) => Promise<void>;
  /** `git worktree remove --force <path>` (silent on missing). */
  removeWorktree: (root: string, worktreePath: string) => Promise<void>;
  /** Run `git merge <branch>` in `cwd`. Returns a structured outcome; never throws on conflicts. */
  merge: (cwd: string, branch: string) => Promise<MergeOutcome>;
  /** Return the changed files (relative paths) for `branch` vs `baseRef`. */
  diffFiles: (root: string, baseRef: string, branch: string) => Promise<string[]>;
  /** Delete a local branch (`git branch -D`). Best-effort. */
  deleteBranch: (root: string, branch: string) => Promise<void>;
  /** Stage + commit any uncommitted changes in `cwd`. No-op when worktree is clean. */
  commitAll: (cwd: string, message: string) => Promise<void>;
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
   * Leader integration strategy. The mission.yaml surface no longer declares
   * this; callers (CLI, staged workflow) thread it through. Only `"merge"`
   * is implemented today; other values throw from `planTeamRun` before any
   * worker dispatch (UH-72 contract).
   */
  strategy?: LeaderStrategy;
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
}

export interface TeamRunResult {
  missionId: string;
  plan: TeamPlan;
  workers: WorkerOutcome[];
  leaderRanVerification: boolean;
  verification: VerifyMissionLike | null;
  integrationReportPath: string;
  status: "passed" | "failed" | "blocked";
  /** True when at least one worker failed or had a merge conflict. */
  hadConflicts: boolean;
  retained: boolean;
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

export function planTeamRun(
  mission: TeamMission,
  root: string,
  options: { strategy?: LeaderStrategy } = {},
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
    if (!isSafeSegment(spec.adapter)) {
      throw new Error(`Team worker adapter must be a safe identifier, got: ${spec.adapter}`);
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
        adapter: spec.adapter,
        index: i,
        id,
        worktreePath,
        branch: `uh/team/${mission.id}/${id}`,
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

  const integrationReportPath = resolveIntegrationReportPath(
    mission.integration_report_path,
    root,
    teamRoot,
  );

  return {
    missionId: mission.id,
    teamRoot,
    workers,
    leader,
    integrationReportPath,
  };
}

/**
 * Bare filenames (no path separator) anchor under the team directory so
 * `integration_report_path: integration-report.md` matches the layout
 * documented above. Paths with a directory component stay repo-root-relative.
 */
function resolveIntegrationReportPath(
  integrationReportPath: string | undefined,
  root: string,
  teamRoot: string,
): string {
  if (!integrationReportPath) {
    return path.join(teamRoot, "integration-report.md");
  }
  const isBareFilename =
    !path.isAbsolute(integrationReportPath) &&
    !integrationReportPath.includes("/") &&
    !integrationReportPath.includes("\\");
  const base = isBareFilename ? teamRoot : root;
  return assertWithinRoot(integrationReportPath, base, "integration_report_path");
}

function isSafeSegment(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Default git ops (real `git` CLI)                                           */
/* -------------------------------------------------------------------------- */

export const defaultGitOps: GitOps = {
  async addWorktree(root, branch, worktreePath, baseRef) {
    await execFileP("git", ["worktree", "add", "-b", branch, worktreePath, baseRef], { cwd: root });
  },
  async removeWorktree(root, worktreePath) {
    if (!(await fileExists(worktreePath))) {
      try { await execFileP("git", ["worktree", "prune"], { cwd: root }); } catch { /* tolerated */ }
      return;
    }
    try {
      await execFileP("git", ["worktree", "remove", "--force", worktreePath], { cwd: root });
    } catch {
      // Best-effort; orphans surface via `git worktree list`.
      try { await execFileP("git", ["worktree", "prune"], { cwd: root }); } catch { /* tolerated */ }
    }
  },
  async merge(cwd, branch) {
    try {
      const { stdout } = await execFileP("git", [
        "-c", "user.email=uh-team@example.com",
        "-c", "user.name=uh team leader",
        "merge", "--no-edit", branch,
      ], { cwd });
      return { conflicted: false, conflictPaths: [], note: stdout.trim().split("\n").slice(0, 1).join("") };
    } catch (err) {
      // Detect conflict by checking MERGE_HEAD via rev-parse (works in
      // both regular repos and linked worktrees, where `.git` is a file).
      let gitDirPath = "";
      try {
        const { stdout } = await execFileP("git", ["rev-parse", "--git-path", "MERGE_HEAD"], { cwd });
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
          note: `merge failed: ${(err as Error).message}`,
        };
      }
      const { stdout } = await execFileP("git", ["diff", "--name-only", "--diff-filter=U"], { cwd });
      const paths = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      try { await execFileP("git", ["merge", "--abort"], { cwd }); } catch { /* tolerated */ }
      return { conflicted: true, conflictPaths: paths, note: `merge conflict on ${paths.length} path(s)` };
    }
  },
  async diffFiles(root, baseRef, branch) {
    try {
      const { stdout } = await execFileP("git", ["diff", "--name-only", `${baseRef}...${branch}`], { cwd: root });
      return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  },
  async deleteBranch(root, branch) {
    try {
      await execFileP("git", ["branch", "-D", branch], { cwd: root });
    } catch { /* best-effort */ }
  },
  async commitAll(cwd, message) {
    await execFileP("git", ["add", "-A"], { cwd });
    const { stdout } = await execFileP("git", ["status", "--porcelain"], { cwd });
    if (stdout.trim().length === 0) return;
    await execFileP("git", [
      "-c", "user.email=uh-team@example.com",
      "-c", "user.name=uh team worker",
      "commit", "-m", message,
    ], { cwd });
  },
};

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

export async function runTeamMission(
  mission: TeamMission,
  root: string,
  options: RunTeamMissionOptions,
): Promise<TeamRunResult> {
  const plan = planTeamRun(mission, root, { strategy: options.strategy });
  const gitOps = options.gitOps ?? defaultGitOps;
  const baseRef = options.baseRef ?? "HEAD";

  const canonicalMissionDir = path.resolve(missionsDir(root), mission.id);
  const missionPath = path.join(canonicalMissionDir, "mission.yaml");
  if (!(await fileExists(missionPath))) {
    throw new Error(`Team mission packet not found at ${missionPath}; create the mission before run-team.`);
  }
  await mkdir(plan.teamRoot, { recursive: true });

  // ------------------------------------------------------------------ workers
  // Worktree creation goes through `git worktree add`, which writes to the
  // shared `.git/worktrees/` index. Real `git` serializes these writes
  // internally, but to keep the failure mode deterministic across CI runners
  // we serialize at the JS layer. Spawning the workers themselves runs in
  // parallel — that's where the wall-clock win is.
  const workerSetup: Array<{ plan: WorkerPlan; setupError?: Error }> = [];
  for (const wp of plan.workers) {
    try {
      await gitOps.addWorktree(root, wp.branch, wp.worktreePath, baseRef);
      await seedMissionPacket(canonicalMissionDir, wp.worktreePath, mission.id);
      workerSetup.push({ plan: wp });
    } catch (err) {
      workerSetup.push({ plan: wp, setupError: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  const workerOutcomes: WorkerOutcome[] = await Promise.all(workerSetup.map(async (slot) => {
    if (slot.setupError) {
      return {
        plan: slot.plan,
        exitCode: 1,
        status: "error",
        errorMessage: `worktree setup failed: ${slot.setupError.message}`,
        filesTouched: [],
        finalSentinel: "",
        merge: null,
        integrated: false,
      };
    }
    const runner = options.runnerFor(slot.plan.adapter);
    const workerMissionPath = path.join(slot.plan.worktreePath, ".harness", "missions", mission.id, "mission.yaml");
    try {
      const res = await runner(slot.plan.adapter, slot.plan.worktreePath, workerMissionPath);
      // Read + strip per-worker session artifacts BEFORE staging the diff so
      // they never reach the worker branch — otherwise every worker would
      // commit `.harness/missions/<id>/runtime-final.txt` and the leader's
      // merge would conflict on a file none of the workers actually own.
      const finalSentinel = await readSentinel(slot.plan.worktreePath, mission.id);
      await stripWorkerSessionArtifacts(slot.plan.worktreePath, mission.id);
      const status = classifyRuntimeStatus(res);
      let commitErr: string | null = null;
      if (status === "succeeded") {
        try {
          await gitOps.commitAll(slot.plan.worktreePath, `team(${slot.plan.id}): worker run`);
        } catch (err) {
          commitErr = err instanceof Error ? err.message : String(err);
        }
      }
      return {
        plan: slot.plan,
        exitCode: res.exitCode,
        status,
        errorMessage: commitErr ?? undefined,
        filesTouched: [],
        finalSentinel,
        merge: null,
        integrated: false,
      };
    } catch (err) {
      return {
        plan: slot.plan,
        exitCode: 1,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        filesTouched: [],
        finalSentinel: "",
        merge: null,
        integrated: false,
      };
    }
  }));

  // ------------------------------------------------------------------- leader
  const leaderError = await safeAddWorktree(gitOps, root, plan.leader, baseRef);
  const leaderReady = leaderError === null;
  if (leaderReady) {
    await seedMissionPacket(canonicalMissionDir, plan.leader.worktreePath, mission.id);
  }

  // Collect files touched per worker (vs base). Done after worker commits so
  // the diff reflects the persisted state on the branch.
  for (const outcome of workerOutcomes) {
    if (outcome.status !== "succeeded") continue;
    outcome.filesTouched = await gitOps.diffFiles(root, baseRef, outcome.plan.branch);
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
  //   - clean integration + verifier passed  -> passed
  //   - any conflict / skipped worker        -> blocked (partial integration)
  //   - verifier blocked or missing          -> blocked
  const overallStatus: TeamRunResult["status"] = (() => {
    if (!leaderReady) return "failed";
    if (verificationFailed) return "failed";
    if (verification && verification.status === "failed") return "failed";
    if (!hadConflicts && verification && verification.status === "passed") return "passed";
    return "blocked";
  })();

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
  };
}

async function safeAddWorktree(gitOps: GitOps, root: string, leader: LeaderPlan, baseRef: string): Promise<string | null> {
  try {
    await gitOps.addWorktree(root, leader.branch, leader.worktreePath, baseRef);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function classifyRuntimeStatus(res: TeamRuntimeRunResult): WorkerOutcome["status"] {
  if (res.result?.status === "blocked") return "blocked";
  if (res.exitCode === 0) return "succeeded";
  return "failed";
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
}

async function writeIntegrationReport(args: WriteReportArgs): Promise<string> {
  await mkdir(path.dirname(args.integrationReportPath), { recursive: true });
  const lines: string[] = [];
  lines.push(`# Team integration report: ${args.missionId}`);
  lines.push("");
  lines.push(`- Leader strategy: \`${args.plan.leader.strategy}\``);
  lines.push(`- Leader branch: \`${args.plan.leader.branch}\``);
  lines.push(`- Workers: ${args.plan.workers.length}`);
  if (!args.leaderReady) {
    lines.push("");
    lines.push(`> **Leader setup failed:** ${args.leaderError ?? "unknown error"}`);
  }
  lines.push("");
  lines.push("## Workers");
  lines.push("");
  for (const outcome of args.workers) {
    lines.push(`### \`${outcome.plan.id}\` (${outcome.plan.adapter})`);
    lines.push("");
    lines.push(`- Branch: \`${outcome.plan.branch}\``);
    lines.push(`- Status: ${outcome.status}${outcome.errorMessage ? ` (${outcome.errorMessage})` : ""}`);
    lines.push(`- Files touched: ${outcome.filesTouched.length}`);
    if (outcome.filesTouched.length > 0) {
      for (const p of outcome.filesTouched) lines.push(`  - \`${p}\``);
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
