import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeControlSchema } from "../schema/runtime-control.js";
import { CanonicalTeamStateSchema, type CanonicalTeamState } from "../schema/team.js";
import {
  defaultProcessLister,
  discoverRuns,
  findProjectRoot,
  isSettled,
  liveness,
  processChildren,
  settleLiveRun,
  type LiveRunRecord,
  type LiveRunTeam,
  type NativeProcess,
  type ProcessLister,
} from "./live-runs.js";
import { cancelLocalMissionRun, runRootForRecord, type MissionCancelResult } from "./mission-cancel.js";
import { reconcileRuntimeSettlement } from "./runtime-settlement.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId } from "./run-id.js";
import { captureKill } from "./interventions.js";

/** Cancellation-target resolution, re-exported so `uh kill` owns one surface. */
export { runRootForRecord } from "./mission-cancel.js";

/**
 * UH kill — stop any run from the project root and prove it is dead.
 *
 * The 2026-09-22 incident had two halves: an operator could not point
 * `uh mission cancel` at a team worker without typing that worker's artifact
 * root, and after the cancels settled nothing demonstrated that the native
 * processes were gone. This module fixes both by resolving every target
 * through `discoverRuns` (the registry plus the bounded harness scan, so the
 * artifact root is never typed), then watching the controller's own process
 * tree with the same injectable lister `uh ps` uses, escalating to a forced
 * tree termination, and finally reporting each run as
 * `cancelled_gracefully`, `force_killed`, `still_alive` or `orphan_settled`.
 *
 * Two invariants hold the safety line:
 * - A pid is only ever signalled when it is a recorded UH controller pid or a
 *   descendant of one, taken from a snapshot of the tree that was captured
 *   before anything was asked to stop.
 * - Nothing is ever inferred from a missing heartbeat alone. An orphan is
 *   settled only when the process lister confirms the controller pid is gone;
 *   if the lister produced no table at all, the run is reported as an error
 *   instead of being quietly written off.
 */

const execFileAsync = promisify(execFile);

export const KILL_REPORT_SCHEMA_VERSION = "uh.kill.v0" as const;
export const DEFAULT_KILL_WAIT_MS = 10_000;
export const DEFAULT_KILL_POLL_MS = 100;
/** After a forced termination, how long to wait before the confirming re-list. */
const CONFIRM_GRACE_MS = 250;

export type KillOutcome =
  | "cancelled_gracefully"
  | "force_killed"
  | "still_alive"
  | "orphan_settled"
  | "skipped_settled"
  | "error";

export type KillTargetKind = "run" | "team-controller";

export class KillError extends Error {
  readonly code: string;

  constructor(message: string, code = "kill_target") {
    super(message);
    this.name = "KillError";
    this.code = code;
  }
}

/** Selects which discovered runs a kill command targets. */
export interface KillSelector {
  runId?: string;
  role?: string;
  missionId?: string;
  teamId?: string;
  all?: boolean;
  orphans?: boolean;
}

export interface KillReportEntry {
  kind: KillTargetKind;
  run_id: string;
  mission_id: string;
  runtime: string;
  artifact_root: string;
  controller_pid: number;
  team?: LiveRunTeam;
  outcome: KillOutcome;
  stop_code?: string;
  detail?: string;
  /** Pids this target owns (a recorded controller pid plus its descendants). */
  tree_pids: number[];
  /** Pids still present on the machine after every attempt to stop them. */
  surviving_pids: number[];
}

export interface TeamStateMark {
  team_id: string;
  run_id: string;
  path: string;
  marked: boolean;
  reason?: string;
}

export interface KillCounts {
  matched: number;
  cancelled_gracefully: number;
  force_killed: number;
  still_alive: number;
  orphan_settled: number;
  skipped_settled: number;
  error: number;
}

export interface KillReport {
  schema_version: typeof KILL_REPORT_SCHEMA_VERSION;
  generated_at: string;
  project_root: string;
  entries: KillReportEntry[];
  teams: TeamStateMark[];
  counts: KillCounts;
  exit_code: number;
}

/** Terminates the process tree rooted at `pid`. Injected in tests. */
export type ProcessKiller = (pid: number) => Promise<void>;
/** The cancellation request itself; `cancelLocalMissionRun` in production. */
export type CancelRun = (root: string, missionId: string, runId: string) => Promise<MissionCancelResult>;

export interface KillOptions extends KillSelector {
  /** Skip the polite request and terminate the tree immediately. */
  force?: boolean;
  /** How long to wait for the controller and its tree to exit on their own. */
  waitMs?: number;
  pollIntervalMs?: number;
  now?: number;
  listProcesses?: ProcessLister;
  killProcess?: ProcessKiller;
  cancelRun?: CancelRun;
}

export interface ResolveTargetsOptions {
  now?: number;
  listProcesses?: ProcessLister;
  /** Pre-discovered records; lets one command list once. */
  records?: LiveRunRecord[];
}

interface KillContext {
  projectRoot: string;
  now: number;
  force: boolean;
  waitMs: number;
  pollIntervalMs: number;
  listProcesses: ProcessLister;
  killProcess: ProcessKiller;
  cancelRun: CancelRun;
  /** Controller pids hosted by more than one live run (a team controller). */
  sharedControllerPids: Set<number>;
  /** Process table captured before anything was asked to stop. */
  baseline: NativeProcess[];
}

/* -------------------------------------------------------------------------- */
/* Process termination                                                        */
/* -------------------------------------------------------------------------- */

function assertSignalablePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new KillError(`Refusing to signal an invalid pid: ${String(pid)}`, "invalid_pid");
  }
}

/**
 * Terminate a native process and everything below it. On Windows the tree goes
 * through `taskkill /PID <pid> /T /F` invoked as argv against powershell.exe —
 * never a bash command line, which rewrites `/PID` into a path. On POSIX the
 * controller's process group is SIGKILLed, matching how the runtime was
 * launched detached.
 */
export const defaultProcessKiller: ProcessKiller = async (pid: number): Promise<void> => {
  assertSignalablePid(pid);
  if (process.platform === "win32") {
    try {
      await execFileAsync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-Command", `& taskkill.exe /PID ${pid} /T /F`,
      ], { windowsHide: true, timeout: 30_000 });
    } catch (error) {
      // A process that exited between the list and the kill is a success.
      if (!/not found|can not be found|cannot be found/i.test((error as Error).message)) throw error;
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
    return;
  } catch {
    // Not a group leader (or already gone); fall through to the single pid.
  }
  try { process.kill(pid, "SIGKILL"); } catch { /* Already exited. */ }
};

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

function hasSelector(selector: KillSelector): boolean {
  return selector.runId !== undefined || selector.role !== undefined || selector.missionId !== undefined
    || selector.teamId !== undefined || selector.all === true || selector.orphans === true;
}

function assertValidSelector(selector: KillSelector): void {
  if (!hasSelector(selector)) {
    throw new KillError(
      "No kill target given. Pass a run id (or a unique prefix), --role, --mission, --team, --all, or --orphans.",
      "no_target",
    );
  }
  if (selector.runId !== undefined) assertValidRunId(selector.runId);
  for (const id of [selector.missionId, selector.teamId]) if (id !== undefined) assertSafeMissionId(id);
}

function matchesSelector(record: LiveRunRecord, selector: KillSelector): boolean {
  if (selector.runId !== undefined) return record.run_id === selector.runId;
  if (selector.role !== undefined) return record.team?.role === selector.role;
  if (selector.missionId !== undefined) {
    return record.mission_id === selector.missionId || record.team?.mission_id === selector.missionId;
  }
  if (selector.teamId !== undefined) return record.team?.mission_id === selector.teamId;
  return true;
}

/**
 * Resolve a selector against everything discoverable from the project root.
 * A bare run id is accepted as a unique prefix; ambiguity and misses are
 * errors rather than silent no-ops, because an operator killing a run by id
 * must know whether it happened.
 */
export async function resolveKillTargets(
  projectRoot: string,
  selector: KillSelector,
  options: ResolveTargetsOptions = {},
): Promise<LiveRunRecord[]> {
  assertValidSelector(selector);
  const now = options.now ?? Date.now();
  const records = options.records ?? await discoverRuns(path.resolve(projectRoot), {
    includeSettled: selector.runId !== undefined,
    now,
    persist: false,
  });

  let matched: LiveRunRecord[];
  const wanted = selector.runId;
  if (wanted !== undefined) {
    const exact = records.filter((record) => record.run_id === wanted);
    if (exact.length > 0) {
      matched = exact;
    } else {
      const prefixed = records.filter((record) => record.run_id.startsWith(wanted));
      if (prefixed.length === 0) {
        throw new KillError(
          `Kill refused: no run matching "${wanted}" is discoverable from ${path.resolve(projectRoot)}. Try \`uh ps --all\`.`,
          "unknown_target",
        );
      }
      if (prefixed.length > 1) {
        throw new KillError(
          `"${wanted}" is ambiguous: ${prefixed.map((record) => record.run_id).sort().join(", ")}`,
          "ambiguous_target",
        );
      }
      matched = prefixed;
    }
  } else if (selector.orphans === true) {
    const processes = await (options.listProcesses ?? defaultProcessLister)();
    matched = records.filter((record) => !isSettled(record)
      && liveness(record, processes, { now }) === "orphaned");
  } else {
    matched = records.filter((record) => !isSettled(record) && matchesSelector(record, selector));
  }
  return matched.sort((left, right) => left.run_id.localeCompare(right.run_id));
}

/** Controller pids that host more than one live run — the team controller. */
export function sharedControllerPids(records: readonly LiveRunRecord[]): Set<number> {
  const counts = new Map<number, number>();
  for (const record of records) {
    if (isSettled(record)) continue;
    counts.set(record.controller_pid, (counts.get(record.controller_pid) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([pid]) => pid));
}

/** The parent team run id a worker artifact root belongs to, if any. */
function teamParentRunFromArtifactRoot(artifactRoot: string): { team_id: string; run_id: string } | undefined {
  const match = /^\.harness\/missions\/([^/]+)\/team\/artifacts\/([^/]+)\/workers\/[^/]+$/.exec(artifactRoot);
  return match ? { team_id: match[1], run_id: match[2] } : undefined;
}

/* -------------------------------------------------------------------------- */
/* The kill of one run                                                        */
/* -------------------------------------------------------------------------- */

async function presentPids(context: KillContext): Promise<Set<number>> {
  const processes = await context.listProcesses();
  return new Set(processes.map((process) => process.pid));
}

function isPidPresent(processes: readonly NativeProcess[], pid: number): boolean {
  return processes.some((process) => process.pid === pid);
}

async function ownedTreeGone(context: KillContext, ownedPids: readonly number[]): Promise<boolean> {
  if (ownedPids.length === 0) return true;
  const alive = await presentPids(context);
  return ownedPids.every((pid) => !alive.has(pid));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Read a run's runtime-control.json; undefined when it is absent or unreadable. */
async function readControl(context: KillContext, record: LiveRunRecord): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(path.resolve(context.projectRoot, record.control_path), "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function writeControl(
  context: KillContext,
  record: LiveRunRecord,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const current = await readControl(context, record);
  if (current === undefined) return false;
  try {
    const next = RuntimeControlSchema.parse({ ...current, ...patch });
    await writeAtomicArtifact(path.resolve(context.projectRoot, record.control_path), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function baseEntry(record: LiveRunRecord): KillReportEntry {
  return {
    kind: "run",
    run_id: record.run_id,
    mission_id: record.mission_id,
    runtime: record.runtime,
    artifact_root: record.artifact_root,
    controller_pid: record.controller_pid,
    ...(record.team !== undefined ? { team: record.team } : {}),
    outcome: "error",
    tree_pids: [],
    surviving_pids: [],
  };
}

/**
 * Settle a run whose controller is gone. Nothing is chased or terminated here:
 * the record is closed through `reconcileRuntimeSettlement` with stop_code
 * `controller_lost`, writing the guardian-shaped receipt first when the native
 * guardian never got the chance (the POSIX and pre-guardian cases).
 *
 * The receipt attests that the owned tree is gone, so it is only written when
 * the process table attributes nothing further to the dead controller pid —
 * otherwise the surviving pids are reported and the run stays open unless the
 * operator forces the record closed.
 */
async function settleOrphanedRun(
  context: KillContext,
  record: LiveRunRecord,
): Promise<KillReportEntry> {
  const entry = baseEntry(record);
  const attributed = processChildren(record.controller_pid, context.baseline).map((child) => child.pid);
  if (attributed.length > 0 && !context.force) {
    return {
      ...entry,
      outcome: "still_alive",
      surviving_pids: [record.controller_pid, ...attributed],
      detail: `controller pid ${record.controller_pid} is gone but ${attributed.length} process(es) are still parented to it; the record was not settled — re-run with --force to close it anyway`,
    };
  }
  const control = await readControl(context, record);
  let detail = "no runtime-control.json to settle";
  if (control !== undefined) {
    const receipted = control.status === "failed" && control.stop_code === "controller_lost"
      && control.settlement_confirmed === true;
    if (!receipted) {
      const written = await writeControl(context, record, {
        status: "failed",
        stop_code: "controller_lost",
        settlement_confirmed: true,
        stop_reason: attributed.length > 0
          ? `uh kill: controller pid ${record.controller_pid} is not running; forced before tree confirmation`
          : `uh kill: controller pid ${record.controller_pid} is not running and the run never settled`,
        heartbeat_at: new Date(context.now).toISOString(),
      });
      detail = written ? "controller_lost receipt written by uh kill" : "runtime-control.json could not be updated";
    } else {
      detail = "guardian controller_lost receipt reconciled";
    }
  }
  const reconciled = await reconcileRuntimeSettlement(
    runRootForRecord(context.projectRoot, record),
    record.mission_id,
    record.run_id,
  );
  await settleLiveRun(context.projectRoot, record.run_id, {
    status: "failed",
    stop_code: "controller_lost",
    settled_at: new Date(context.now).toISOString(),
  });
  return {
    ...entry,
    outcome: "orphan_settled",
    stop_code: "controller_lost",
    detail: `${detail}; canonical settlement ${reconciled ? "reconciled" : "not applicable"}`,
  };
}

/**
 * Terminate the owned tree and confirm it. Every pid handed to the killer is
 * checked against the snapshot taken before this run was touched, so a pid can
 * only die here when it is the recorded controller or one of its descendants.
 */
async function forceKillOwnedTree(
  context: KillContext,
  owner: { label: string; controllerPid: number },
  ownedPids: readonly number[],
  treePids: readonly number[],
): Promise<{ surviving: number[]; killed: boolean }> {
  const alive = await presentPids(context);
  const survivors = ownedPids.filter((pid) => alive.has(pid));
  if (survivors.length === 0) return { surviving: [], killed: false };
  // A live controller takes its whole tree with it (`/T`, or the process
  // group); only when it is already gone is each descendant killed by pid.
  const killedTree = alive.has(owner.controllerPid) ? [owner.controllerPid] : survivors;
  for (const pid of killedTree) {
    if (!treePids.includes(pid)) {
      throw new KillError(
        `Refusing to signal pid ${pid}: it is not the controller of ${owner.label} nor one of its recorded descendants.`,
        "out_of_tree",
      );
    }
    await context.killProcess(pid);
  }
  await delay(Math.min(CONFIRM_GRACE_MS, context.pollIntervalMs));
  const after = await presentPids(context);
  return { surviving: ownedPids.filter((pid) => after.has(pid)), killed: true };
}

async function killRecord(context: KillContext, record: LiveRunRecord): Promise<KillReportEntry> {
  const entry = baseEntry(record);
  if (isSettled(record)) {
    // A settled run has nothing to terminate. It may still owe its canonical
    // settlement: a guardian receipt that nobody reconciled is closed here.
    if (record.stop_code === "controller_lost") return settleOrphanedRun(context, record);
    return { ...entry, outcome: "skipped_settled", detail: `already ${record.status ?? "settled"}` };
  }
  if (!isPidPresent(context.baseline, record.controller_pid)) return settleOrphanedRun(context, record);

  const shared = context.sharedControllerPids.has(record.controller_pid);
  const descendants = processChildren(record.controller_pid, context.baseline).map((child) => child.pid);
  const treePids = [record.controller_pid, ...descendants];
  // A team controller is shared by its workers: this run may only wait for its
  // own settlement, and only `--team` may terminate the controller itself. The
  // siblings' runtimes are not this run's tree to report or to kill.
  const ownedPids = shared ? [] : treePids;
  entry.tree_pids = shared ? [record.controller_pid] : treePids;

  let detail: string | undefined;
  let settled = false;
  if (context.force) {
    detail = "forced: the controller was not asked to settle";
  } else {
    try {
      const result = await context.cancelRun(
        runRootForRecord(context.projectRoot, record),
        record.mission_id,
        record.run_id,
      );
      settled = result.ok === true && result.status !== "running";
      if (!settled) detail = `cancel reported status ${result.status}`;
    } catch (error) {
      detail = describeError(error);
    }
    const deadline = Date.now() + context.waitMs;
    while (Date.now() < deadline) {
      if (await ownedTreeGone(context, ownedPids)) break;
      await delay(context.pollIntervalMs);
    }
  }

  if (await ownedTreeGone(context, ownedPids)) {
    if (settled || !shared) {
      return settleRecordAfterStop(context, record, entry, ownedPids, {
        outcome: "cancelled_gracefully",
        settled,
        ...(detail !== undefined ? { detail } : {}),
        ...(shared ? { detailSuffix: `controller pid ${record.controller_pid} is shared with the team and was left running` } : {}),
      });
    }
    // The run did not settle and its controller belongs to the team: stopping
    // it here would kill its siblings, so say so and fail instead.
    return {
      ...entry,
      outcome: "still_alive",
      surviving_pids: [],
      detail: `${detail ?? "the run did not settle"}; controller pid ${record.controller_pid} is shared with other live runs — stop the team with --team ${record.team?.mission_id ?? record.mission_id}`,
    };
  }

  const forced = await forceKillOwnedTree(
    context,
    { label: `run ${record.run_id}`, controllerPid: record.controller_pid },
    ownedPids,
    treePids,
  );
  if (forced.surviving.length > 0) {
    return {
      ...entry,
      outcome: "still_alive",
      surviving_pids: forced.surviving,
      ...(detail !== undefined ? { detail } : {}),
    };
  }
  return settleRecordAfterStop(context, record, entry, ownedPids, {
    outcome: forced.killed ? "force_killed" : "cancelled_gracefully",
    settled,
    ...(detail !== undefined ? { detail } : {}),
  });
}

/**
 * Close the record of a run whose owned tree is provably dead. When the
 * controller never reported its own settlement, kill writes the receipt: a
 * dead process must not keep a run readable as `running` in `uh ps`.
 */
async function settleRecordAfterStop(
  context: KillContext,
  record: LiveRunRecord,
  entry: KillReportEntry,
  ownedPids: readonly number[],
  verdict: { outcome: KillOutcome; settled: boolean; detail?: string; detailSuffix?: string },
): Promise<KillReportEntry> {
  const detail = [verdict.detail, verdict.detailSuffix].filter((part) => part !== undefined).join("; ");
  // Only a run with a tree of its own can have that tree confirmed gone; a run
  // sharing a team controller leaves its control file to the living controller.
  if (ownedPids.length > 0 && (verdict.outcome === "force_killed" || !verdict.settled)) {
    await writeControl(context, record, {
      status: "cancelled",
      stop_code: "cancelled",
      settlement_confirmed: true,
      stop_reason: `uh kill: owned process tree of controller pid ${record.controller_pid} is gone`,
      heartbeat_at: new Date(context.now).toISOString(),
    });
  }
  await settleLiveRun(context.projectRoot, record.run_id, {
    status: "cancelled",
    stop_code: "cancelled",
    settled_at: new Date(context.now).toISOString(),
  });
  return {
    ...entry,
    outcome: verdict.outcome,
    stop_code: "cancelled",
    surviving_pids: [],
    ...(detail.length > 0 ? { detail } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Team cascade                                                               */
/* -------------------------------------------------------------------------- */

/** Stop the controller process a team's workers were hosted by, once per pid. */
async function stopTeamControllers(
  context: KillContext,
  teamId: string,
  records: readonly LiveRunRecord[],
): Promise<KillReportEntry[]> {
  const pids = [...new Set(records.map((record) => record.controller_pid))].sort((a, b) => a - b);
  const entries: KillReportEntry[] = [];
  for (const pid of pids) {
    const sharedBy = records.filter((record) => record.controller_pid === pid).map((record) => record.run_id);
    const base: KillReportEntry = {
      kind: "team-controller",
      run_id: `controller:${pid}`,
      mission_id: teamId,
      runtime: "ultimate-harness-team",
      artifact_root: ".",
      controller_pid: pid,
      outcome: "error",
      tree_pids: [pid],
      surviving_pids: [],
    };
    const treePids = [pid, ...processChildren(pid, context.baseline).map((child) => child.pid)];
    const forced = await forceKillOwnedTree(
      context,
      { label: `team ${teamId} controller pid ${pid}`, controllerPid: pid },
      [pid],
      treePids,
    );
    if (forced.surviving.length > 0) {
      entries.push({ ...base, outcome: "still_alive", surviving_pids: forced.surviving });
      continue;
    }
    entries.push({
      ...base,
      outcome: forced.killed ? "force_killed" : "cancelled_gracefully",
      stop_code: "cancelled",
      tree_pids: treePids,
      detail: forced.killed
        ? `terminated the team controller hosting ${sharedBy.length} worker run(s)`
        : `exited on its own after ${sharedBy.length} worker run(s) settled`,
    });
  }
  return entries;
}

/**
 * Mark a team run's `team-state.json` as cancelled so the leader's work is
 * never integrated. `uh.team-run.v0` has no cancelled status, so the mark is
 * the schema's terminal `blocked` plus an explicit cancellation reason.
 */
export async function markTeamStateCancelled(
  projectRoot: string,
  teamId: string,
  parentRunId: string,
  now: number,
): Promise<TeamStateMark> {
  assertSafeMissionId(teamId);
  assertValidRunId(parentRunId);
  const file = path.join(projectRoot, ".harness", "missions", teamId, "runs", parentRunId, "team-state.json");
  const finishedAt = new Date(now).toISOString();
  let state: CanonicalTeamState;
  try {
    state = CanonicalTeamStateSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { team_id: teamId, run_id: parentRunId, path: file, marked: false, reason: code === "ENOENT" ? "no team-state.json" : "team-state.json unreadable" };
  }
  if (state.status !== "running") {
    return { team_id: teamId, run_id: parentRunId, path: file, marked: false, reason: `already ${state.status}` };
  }
  const cancelled: CanonicalTeamState = {
    ...state,
    status: "blocked",
    finished_at: finishedAt,
    leader: { ...state.leader, status: state.leader.status === "succeeded" ? "succeeded" : "blocked" },
    workers: state.workers.map((worker) => worker.status === "succeeded" || worker.status === "failed"
      || worker.status === "blocked" || worker.status === "error"
      ? worker
      : { ...worker, status: "blocked" as const, blocked_reason: `cancelled by uh kill --team ${teamId}`, finished_at: finishedAt }),
    admission_blocked_reason: `cancelled by uh kill: team ${teamId} run ${parentRunId}`,
  };
  await writeAtomicArtifact(file, `${JSON.stringify(CanonicalTeamStateSchema.parse(cancelled), null, 2)}\n`);
  return { team_id: teamId, run_id: parentRunId, path: file, marked: true };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

function emptyCounts(): KillCounts {
  return {
    matched: 0,
    cancelled_gracefully: 0,
    force_killed: 0,
    still_alive: 0,
    orphan_settled: 0,
    skipped_settled: 0,
    error: 0,
  };
}

function buildReport(
  projectRoot: string,
  generatedAt: string,
  entries: KillReportEntry[],
  teams: TeamStateMark[],
): KillReport {
  const counts = emptyCounts();
  counts.matched = entries.length;
  for (const entry of entries) counts[entry.outcome] += 1;
  const unresolved = entries.filter((entry) => entry.outcome === "still_alive" || entry.outcome === "error").length;
  return {
    schema_version: KILL_REPORT_SCHEMA_VERSION,
    generated_at: generatedAt,
    project_root: projectRoot,
    entries,
    teams,
    counts,
    exit_code: unresolved > 0 ? 1 : 0,
  };
}

/**
 * Stop every run a selector matches, and prove the native processes are gone.
 * Never throws for per-run failures: they are reported as `error` entries with
 * a non-zero exit code so one wedged run cannot hide the rest.
 */
export async function killRuns(projectRoot: string, options: KillOptions = {}): Promise<KillReport> {
  assertValidSelector(options);
  const resolved = await findProjectRoot(path.resolve(projectRoot));
  const root = resolved ?? path.resolve(projectRoot);
  const now = options.now ?? Date.now();
  const usingDefaultLister = options.listProcesses === undefined;
  const listProcesses = options.listProcesses ?? defaultProcessLister;
  const baseline = await listProcesses();
  if (usingDefaultLister && baseline.length === 0) {
    throw new KillError(
      "The native process table came back empty; refusing to treat live runs as orphans on no evidence.",
      "process_table_unavailable",
    );
  }
  const records = await discoverRuns(root, { includeSettled: options.runId !== undefined, now, persist: false });
  const targets = await resolveKillTargets(root, options, { now, listProcesses, records });

  const context: KillContext = {
    projectRoot: root,
    now,
    force: options.force === true,
    waitMs: options.waitMs ?? DEFAULT_KILL_WAIT_MS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_KILL_POLL_MS,
    listProcesses,
    killProcess: options.killProcess ?? defaultProcessKiller,
    cancelRun: options.cancelRun ?? cancelLocalMissionRun,
    sharedControllerPids: sharedControllerPids(records),
    baseline,
  };

  const entries: KillReportEntry[] = [];
  for (const record of targets) {
    try {
      entries.push(await killRecord(context, record));
    } catch (error) {
      entries.push({ ...baseEntry(record), outcome: "error", detail: describeError(error) });
    }
  }

  const teamMarks: TeamStateMark[] = [];
  if (options.teamId !== undefined) {
    const teamRecords = targets.filter((record) => record.team?.mission_id === options.teamId);
    entries.push(...await stopTeamControllers(context, options.teamId, teamRecords));
    const parentRuns = new Set<string>();
    for (const record of teamRecords) {
      const parent = teamParentRunFromArtifactRoot(record.artifact_root);
      if (parent !== undefined && parent.team_id === options.teamId) parentRuns.add(parent.run_id);
    }
    for (const runId of [...parentRuns].sort()) {
      teamMarks.push(await markTeamStateCancelled(root, options.teamId, runId, now));
    }
  }

  await captureKill(root, entries.map((entry) => ({
    run_id: entry.run_id,
    mission_id: entry.mission_id,
    outcome: entry.outcome,
    ...(entry.detail !== undefined ? { detail: entry.detail } : {}),
    ...(entry.team?.mission_id !== undefined ? { team_id: entry.team.mission_id } : {}),
  })));

  return buildReport(root, new Date(now).toISOString(), entries, teamMarks);
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** One line per stopped target: id, mission, role, outcome, and the pids. */
export function formatKillReport(report: KillReport): string {
  if (report.entries.length === 0) return "No runs matched.";
  const lines = report.entries.map((entry) => {
    const team = entry.team !== undefined ? `team=${entry.team.role}` : "team=-";
    const pids = entry.tree_pids.length > 0 ? entry.tree_pids.join(",") : String(entry.controller_pid);
    const parts = [
      entry.run_id,
      entry.mission_id,
      team,
      entry.runtime,
      entry.outcome,
      entry.stop_code !== undefined ? `stop=${entry.stop_code}` : "",
      `pids=${pids}`,
      entry.surviving_pids.length > 0 ? `surviving=${entry.surviving_pids.join(",")}` : "",
      entry.detail !== undefined ? `(${entry.detail})` : "",
    ].filter((part) => part.length > 0);
    return parts.join("  ");
  });
  for (const mark of report.teams) {
    lines.push(`team=${mark.team_id}  run=${mark.run_id}  ${mark.marked ? "team-state cancelled" : `team-state not marked (${mark.reason ?? "unknown"})`}`);
  }
  lines.push(
    `matched=${report.counts.matched} gracefully=${report.counts.cancelled_gracefully} forced=${report.counts.force_killed} orphans=${report.counts.orphan_settled} alive=${report.counts.still_alive} errors=${report.counts.error}`,
  );
  return lines.join("\n");
}
