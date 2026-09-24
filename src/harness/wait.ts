import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  defaultProcessLister,
  discoverRuns,
  findProjectRoot,
  isSettled,
  liveness,
  type LiveRunRecord,
  type LiveRunTeam,
  type NativeProcess,
  type ProcessLister,
} from "./live-runs.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId } from "./run-id.js";

/**
 * UH wait — block until matched runs settle, so orchestrators do not poll.
 *
 * An orchestrator that runs a team and wants to know when it is done currently
 * spends one model turn per `uh ps`. This module replaces that loop with one
 * process: resolve targets through the same selector semantics `uh kill` uses
 * (a run id or unique prefix, `--mission`, `--team`), then poll the live-run
 * registry on a fixed interval with no model involvement until every matched
 * run is settled or orphaned, or the timeout passes.
 *
 * Two rules mirror the rest of run control:
 * - Orphan status is only ever asserted from a non-empty process table; an
 *   unreadable table keeps the run open instead of declaring it dead.
 * - Nothing here signals, cancels, or settles a run on anyone's behalf; it
 *   only reads what the registry and each run's `runtime-control.json` say.
 */

export const WAIT_REPORT_SCHEMA_VERSION = "uh.wait.v0" as const;
/** 30 minutes: long enough for a mission, short enough to never wedge. */
export const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
/** A modest registry poll; wait is cheap, but the process lister is not free. */
export const DEFAULT_WAIT_POLL_MS = 2_000;

export type WaitOutcome = "settled" | "orphaned" | "timed_out";

export class WaitError extends Error {
  readonly code: string;

  constructor(message: string, code = "wait_target") {
    super(message);
    this.name = "WaitError";
    this.code = code;
  }
}

/** Selects which discovered runs a wait command blocks on. */
export interface WaitSelector {
  runId?: string;
  missionId?: string;
  teamId?: string;
}

export interface WaitOptions extends WaitSelector {
  /** Give up after this many milliseconds (default 30 minutes). */
  timeoutMs?: number;
  pollIntervalMs?: number;
  listProcesses?: ProcessLister;
}

export interface WaitReportEntry {
  run_id: string;
  mission_id: string;
  runtime: string;
  team?: LiveRunTeam;
  controller_pid: number;
  outcome: WaitOutcome;
  /** Terminal status for a settled run; `orphaned`/`timed_out` otherwise. */
  status: string;
  stop_code?: string;
}

export interface WaitCounts {
  matched: number;
  settled: number;
  passed: number;
  failed: number;
  orphaned: number;
  timed_out: number;
}

export interface WaitReport {
  schema_version: typeof WAIT_REPORT_SCHEMA_VERSION;
  generated_at: string;
  project_root: string;
  timeout_ms: number;
  elapsed_ms: number;
  entries: WaitReportEntry[];
  counts: WaitCounts;
  summary: string;
  exit_code: number;
}

function hasSelector(selector: WaitSelector): boolean {
  return selector.runId !== undefined || selector.missionId !== undefined || selector.teamId !== undefined;
}

function assertValidSelector(selector: WaitSelector): void {
  if (!hasSelector(selector)) {
    throw new WaitError(
      "No wait target given. Pass a run id (or a unique prefix), --mission, or --team.",
      "no_target",
    );
  }
  if (selector.runId !== undefined) assertValidRunId(selector.runId);
  for (const id of [selector.missionId, selector.teamId]) if (id !== undefined) assertSafeMissionId(id);
}

/**
 * Resolve a selector against discovered records with the same meaning as in
 * `uh kill`: a bare run id is exact-or-unique-prefix (settled runs count, so
 * waiting on a finished run answers at once), while `--mission`/`--team` match
 * the runs that were live when the wait began. Zero matches for team/mission
 * and misses/ambiguity for an id are errors, never silent successes.
 */
export function resolveWaitTargets(
  projectRoot: string,
  selector: WaitSelector,
  records: readonly LiveRunRecord[],
): LiveRunRecord[] {
  assertValidSelector(selector);
  let matched: LiveRunRecord[];
  if (selector.runId !== undefined) {
    const wanted = selector.runId;
    const exact = records.filter((record) => record.run_id === wanted);
    if (exact.length > 0) {
      matched = exact;
    } else {
      const prefixed = records.filter((record) => record.run_id.startsWith(wanted));
      if (prefixed.length === 0) {
        throw new WaitError(
          `Wait refused: no run matching "${wanted}" is discoverable from ${path.resolve(projectRoot)}. Try \`uh ps --all\`.`,
          "unknown_target",
        );
      }
      if (prefixed.length > 1) {
        throw new WaitError(
          `"${wanted}" is ambiguous: ${prefixed.map((record) => record.run_id).sort().join(", ")}`,
          "ambiguous_target",
        );
      }
      matched = prefixed;
    }
  } else {
    matched = records.filter((record) => {
      if (isSettled(record)) return false;
      if (selector.missionId !== undefined) {
        return record.mission_id === selector.missionId || record.team?.mission_id === selector.missionId;
      }
      return record.team?.mission_id === selector.teamId;
    });
    if (matched.length === 0) {
      const label = selector.missionId !== undefined ? `mission ${selector.missionId}` : `team ${selector.teamId}`;
      throw new WaitError(
        `Wait refused: no live run matches ${label} discoverable from ${path.resolve(projectRoot)}.`,
        "unknown_target",
      );
    }
  }
  return matched.sort((left, right) => left.run_id.localeCompare(right.run_id));
}

/** A retired entry for a run, or undefined when the wait must keep watching. */
function classifyRun(
  record: LiveRunRecord,
  processes: readonly NativeProcess[],
  tableAvailable: boolean,
  now: number,
): WaitReportEntry | undefined {
  const base = {
    run_id: record.run_id,
    mission_id: record.mission_id,
    runtime: record.runtime,
    ...(record.team !== undefined ? { team: record.team } : {}),
    controller_pid: record.controller_pid,
  };
  if (isSettled(record)) {
    return {
      ...base,
      outcome: "settled",
      status: record.status ?? "settled",
      ...(record.stop_code !== undefined ? { stop_code: record.stop_code } : {}),
    };
  }
  if (tableAvailable && liveness(record, processes, { now }) === "orphaned") {
    return { ...base, outcome: "orphaned", status: "orphaned" };
  }
  return undefined;
}

function emptyCounts(): WaitCounts {
  return { matched: 0, settled: 0, passed: 0, failed: 0, orphaned: 0, timed_out: 0 };
}

/**
 * Block until every matched run is settled or orphaned, or the timeout passes.
 * Never throws for a run that simply will not finish: that is exit code 4.
 */
export async function waitForRuns(projectRoot: string, options: WaitOptions = {}): Promise<WaitReport> {
  const selector: WaitSelector = { runId: options.runId, missionId: options.missionId, teamId: options.teamId };
  assertValidSelector(selector);
  const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new WaitError(`--timeout-ms must be a non-negative integer of milliseconds, got: ${String(options.timeoutMs)}`, "invalid_timeout");
  }
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WAIT_POLL_MS;
  const resolvedRoot = await findProjectRoot(path.resolve(projectRoot));
  const root = resolvedRoot ?? path.resolve(projectRoot);
  const listProcesses = options.listProcesses ?? defaultProcessLister;

  const started = Date.now();
  const records = await discoverRuns(root, { includeSettled: selector.runId !== undefined, now: started, persist: false });
  const targets = resolveWaitTargets(root, selector, records);

  const open = new Map(targets.map((record) => [record.run_id, record]));
  const retired: WaitReportEntry[] = [];
  let timedOut = false;
  for (;;) {
    const now = Date.now();
    // Settled runs vanish from default discovery, so keep watching with
    // includeSettled and remember the last sight of every still-open run.
    const fresh = await discoverRuns(root, { includeSettled: true, now, persist: false });
    const byId = new Map(fresh.map((record) => [record.run_id, record]));
    const needsTable = [...open.values()].some((record) => !isSettled(record));
    const processes = needsTable ? await listProcesses() : [];
    // An empty table is the lister failing, not every controller dying (the
    // same rule `uh kill` holds to): keep runs open on no evidence.
    const tableAvailable = !needsTable || processes.length > 0;
    for (const [runId, previous] of [...open.entries()]) {
      const record = byId.get(runId) ?? previous;
      const entry = classifyRun(record, processes, tableAvailable, now);
      if (entry !== undefined) {
        open.delete(runId);
        retired.push(entry);
        continue;
      }
      open.set(runId, record);
    }
    if (open.size === 0) break;
    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) {
      timedOut = true;
      break;
    }
    await delay(Math.min(pollIntervalMs, timeoutMs - elapsed));
  }

  if (timedOut) {
    for (const record of open.values()) {
      retired.push({
        run_id: record.run_id,
        mission_id: record.mission_id,
        runtime: record.runtime,
        ...(record.team !== undefined ? { team: record.team } : {}),
        controller_pid: record.controller_pid,
        outcome: "timed_out",
        status: record.status ?? "running",
      });
    }
  }

  const entries = retired.sort((left, right) => left.run_id.localeCompare(right.run_id));
  const counts = emptyCounts();
  counts.matched = entries.length;
  for (const entry of entries) {
    if (entry.outcome === "settled") {
      counts.settled += 1;
      if (entry.status === "passed") counts.passed += 1;
      else counts.failed += 1;
    } else if (entry.outcome === "orphaned") counts.orphaned += 1;
    else counts.timed_out += 1;
  }
  const elapsedMs = Date.now() - started;
  const summary = `matched=${counts.matched} settled=${counts.settled} passed=${counts.passed} failed=${counts.failed} orphaned=${counts.orphaned} timed_out=${counts.timed_out} elapsed=${elapsedMs}ms`;
  return {
    schema_version: WAIT_REPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    project_root: root,
    timeout_ms: timeoutMs,
    elapsed_ms: elapsedMs,
    entries,
    counts,
    summary,
    exit_code: counts.timed_out > 0 ? 4 : counts.orphaned > 0 ? 3 : counts.failed > 0 ? 1 : 0,
  };
}

/** One line per matched run (id, mission, final status, stop code) plus the summary. */
export function formatWaitReport(report: WaitReport): string {
  const lines = report.entries.map((entry) => {
    const status = entry.outcome === "settled" ? entry.status : entry.outcome;
    const stop = entry.stop_code !== undefined ? `stop=${entry.stop_code}` : "stop=-";
    return `${entry.run_id}  ${entry.mission_id}  ${status}  ${stop}`;
  });
  lines.push(report.summary);
  return lines.join("\n");
}
