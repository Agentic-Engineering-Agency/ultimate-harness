import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { freemem } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  QUEUE_STATE_SCHEMA_VERSION,
  QueueFileSchema,
  QueueStateSchema,
  type QueueEntry,
  type QueueEntryState,
  type QueueEntryStatus,
  type QueueFile,
  type QueueState,
} from "../schema/queue.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { assertHiveChainsIntact, recordQueuePass } from "./hive.js";
import { dispatchEvent, type NotificationEvent } from "./notifications.js";
import { generateRunId } from "./run-id.js";
import { workerConcurrency } from "./runtime-resources.js";
import { DEFAULT_WAIT_TIMEOUT_MS, WaitError, waitForRuns, type WaitReport } from "./wait.js";

/**
 * UH queue — launch missions in order under an orchestrator cap and a free
 * memory floor, resumable from disk.
 *
 * The scheduler is pure with respect to the outside world: launching a mission,
 * settling a launched run, and reading free memory are injected, so a test
 * drives the whole state machine with fake missions and fake run records and
 * never starts a runtime. The default launcher spawns `uh mission run` and the
 * default memory probe reads `freemem()`.
 *
 * Settlement: an entry settles from the run's recorded settlement — the same
 * `runtime-control.json`/`runtime-result.yaml` records `uh wait` reads — never
 * from the spawned child's exit. A child exit is not a settlement: the run can
 * be orphaned or still live, so a fresh entry is treated exactly like a resumed
 * one. A passed record settles the entry passed; a failed, blocked, or
 * cancelled record settles it failed with the recorded stop reason; an orphaned
 * run settles failed with reason `orphaned`; a wait that times out settles
 * failed with reason `wait-timeout` and keeps the run id for a later resume; and
 * a child that exits non-zero before any record appears settles failed with
 * reason `launch-failed`.
 *
 * Ordering: an entry launches only once every `after` dependency has passed,
 * chosen in file order. At most `maxOrchestrators` runs at once, and each new
 * launch first reuses the worker admission helper from `runtime-resources.ts`:
 * when the free memory headroom cannot admit one more run, the launch is
 * refused and retried later instead of overcommitting the box.
 *
 * Durability: per-entry state is written atomically to
 * `.harness/queue/<queue-id>/state.json` after every change. On start the
 * existing state is loaded; settled entries are kept, and an entry recorded as
 * running is waited on by its recorded run id rather than relaunched.
 */

export const QUEUE_STATE_FILE = "state.json";
export const DEFAULT_MAX_ORCHESTRATORS = 2;
/** Free memory that must remain unclaimed before another orchestrator launches. */
export const DEFAULT_MEMORY_FLOOR_MB = 1024;
/** Memory reserved for one in-flight orchestrator when checking headroom. */
export const DEFAULT_RUN_MEMORY_MB = 1024;
/** How long to wait before re-probing memory after a floor refusal. */
export const DEFAULT_MEMORY_RETRY_MS = 1000;
/** How long the settle step waits for a launched run's recorded settlement. */
export const DEFAULT_SETTLE_TIMEOUT_MS = DEFAULT_WAIT_TIMEOUT_MS;
/** How often the settle step re-checks for a fresh run's record before it appears. */
export const DEFAULT_SETTLE_POLL_MS = 250;

export function queueDir(root: string, queueId: string): string {
  return path.join(root, ".harness", "queue", queueId);
}

export function queueStatePath(root: string, queueId: string): string {
  return path.join(queueDir(root, queueId), QUEUE_STATE_FILE);
}

export async function loadQueueFile(filePath: string): Promise<QueueFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Queue file not found: ${filePath} (${(error as Error).message})`);
  }
  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error) {
    throw new Error(`Queue file is not valid YAML: ${filePath} (${(error as Error).message})`);
  }
  try {
    return QueueFileSchema.parse(document);
  } catch (error) {
    throw new Error(`Queue file is invalid: ${filePath} (${(error as Error).message})`);
  }
}

export async function readQueueState(root: string, queueId: string): Promise<QueueState | undefined> {
  const filePath = queueStatePath(root, queueId);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Queue state is not valid JSON: ${filePath} (${(error as Error).message})`);
  }
  try {
    return QueueStateSchema.parse(document);
  } catch (error) {
    throw new Error(`Queue state is invalid: ${filePath} (${(error as Error).message})`);
  }
}

async function writeQueueState(root: string, state: QueueState): Promise<void> {
  await mkdir(queueDir(root, state.queue_id), { recursive: true });
  await writeAtomicArtifact(queueStatePath(root, state.queue_id), `${JSON.stringify(state, null, 2)}\n`);
}

/* -------------------------------------------------------------------------- */
/* Injectable seams                                                           */
/* -------------------------------------------------------------------------- */

export interface QueueLaunchRequest {
  queueId: string;
  entryId: string;
  /** Absolute mission file path (relative `mission` resolved against the root). */
  missionPath: string;
  runtime: string;
  root: string;
  /** Present when resuming an entry recorded as running: wait on this run instead of launching. */
  resumeRunId?: string;
}

export interface QueueSettleOutcome {
  status: "passed" | "failed";
  exit_code: number;
  /**
   * Why a failure was recorded: the run's recorded stop code, or `"orphaned"`,
   * `"wait-timeout"`, or `"launch-failed"`. Absent for a pass.
   */
  reason?: string;
}

/** A launched run: its id is known immediately so it can be persisted before it settles. */
export interface QueueLaunchHandle {
  run_id: string;
  settled: Promise<QueueSettleOutcome>;
}

export type QueueLauncher = (request: QueueLaunchRequest) => Promise<QueueLaunchHandle>;

export interface QueueSettlementNotice {
  queueId: string;
  entryId: string;
  status: QueueEntryStatus;
  runId: string | null;
  exitCode: number | null;
  /** Recorded stop reason for a failed entry; absent for a pass or a skip. */
  reason?: string;
}

export type QueueNotifier = (root: string, notice: QueueSettlementNotice) => Promise<void> | void;

/** Signal from a freshly spawned controller child, for launch-failure detection. */
export interface QueueChildExit {
  code: number | null;
  /** True when the child could not be spawned at all. */
  error: boolean;
}

/**
 * What the settle step needs to resolve a launched run: the pinned run id and
 * the same project root `uh wait` reads. A fresh launch also passes the child
 * exit signal, because a controller that dies before writing its record is a
 * launch failure rather than a settlement.
 */
export interface QueueSettleRequest {
  root: string;
  runId: string;
  /** Present for a fresh launch: resolves when the spawned controller exits. */
  childExit?: Promise<QueueChildExit>;
  /** How long to keep waiting for the run's record (defaults to `uh wait`'s timeout). */
  timeoutMs?: number;
  /** Poll interval while the record is not yet discoverable (default 250 ms). */
  pollIntervalMs?: number;
}

/**
 * The settle step: resolve a launched run's recorded settlement, never its
 * child's exit. Injectable so a test can drive the queue from fake run records.
 */
export type QueueSettler = (request: QueueSettleRequest) => Promise<QueueSettleOutcome>;

export interface QueueLauncherDeps {
  /** CLI entrypoint to spawn; defaults to the `cli.{ts,js}` shipped beside this module. */
  cliEntry?: string;
  /** Node executable that runs the CLI entrypoint; defaults to `process.execPath`. */
  nodePath?: string;
  spawner?: (command: string, args: string[], options: { cwd: string }) => ChildProcess;
  /** The wait harness; defaults to `waitForRuns`. */
  wait?: typeof waitForRuns;
  /** The settle step; defaults to resolving the run's record through `wait`. */
  settle?: QueueSettler;
  /** How long the default settle step waits for a run's record. */
  settleTimeoutMs?: number;
}

/** Resolve `cli.ts`/`cli.js` beside this module, mirroring the TUI subprocess orchestrator. */
export function resolveCliEntry(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const ext = path.extname(modulePath) === ".ts" ? ".ts" : ".js";
  return path.resolve(path.dirname(modulePath), "..", `cli${ext}`);
}

/** Map a run's `uh wait` record onto a queue entry outcome. */
function mapWaitReport(report: WaitReport, runId: string): QueueSettleOutcome {
  const entry = report.entries.find((candidate) => candidate.run_id === runId);
  if (entry === undefined) return { status: "failed", exit_code: report.exit_code || 1 };
  if (entry.outcome === "settled" && entry.status === "passed") {
    return { status: "passed", exit_code: 0 };
  }
  const reason = entry.outcome === "settled"
    ? entry.stop_code
    : entry.outcome === "orphaned"
      ? "orphaned"
      : "wait-timeout";
  return { status: "failed", exit_code: report.exit_code || 1, ...(reason !== undefined ? { reason } : {}) };
}

/**
 * The default settle step: block on the run's recorded settlement through the
 * same `waitForRuns` harness `uh wait` and the resume path use, then map the
 * record onto a queue outcome.
 *
 * A run whose record is not yet discoverable is watched, never failed on a
 * guess: the controller registers it moments after launch. Only a child that
 * exits non-zero before its record appears is a `launch-failed`, and only the
 * wait's own timeout is a `wait-timeout` (the run id is kept so a later resume
 * can wait on it again).
 */
async function settleRunFromRecords(
  wait: typeof waitForRuns,
  request: QueueSettleRequest,
  defaultTimeoutMs: number,
): Promise<QueueSettleOutcome> {
  const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
  const pollIntervalMs = request.pollIntervalMs ?? DEFAULT_SETTLE_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { status: "failed", exit_code: 1, reason: "wait-timeout" };
    try {
      const report = await wait(request.root, { runId: request.runId, timeoutMs: remaining });
      return mapWaitReport(report, request.runId);
    } catch (error) {
      // A record that is not discoverable yet is not a failure: keep watching
      // until the child dies without one, or the wait gives out.
      if (!(error instanceof WaitError) || error.code !== "unknown_target") {
        return { status: "failed", exit_code: 1 };
      }
    }
    const pause = Math.max(0, Math.min(pollIntervalMs, deadline - Date.now()));
    if (request.childExit === undefined) {
      if (pause > 0) await delay(pause);
      continue;
    }
    const signal = await Promise.race([
      request.childExit.then((exit) => ({ exited: true as const, exit })),
      delay(pause).then(() => ({ exited: false as const })),
    ]);
    if (signal.exited && (signal.exit.error || signal.exit.code !== 0)) {
      return { status: "failed", exit_code: signal.exit.code ?? 1, reason: "launch-failed" };
    }
  }
}

/**
 * The default launcher: spawn `uh mission run` for a fresh entry, or read the
 * recorded settlement of a resumed one.
 *
 * A child exit is not a settlement: a run can be orphaned or still live, and
 * recording it as settled on the child's exit would be a lie. So every entry,
 * fresh or resumed, settles from the run's recorded settlement. A fresh launch
 * pins its run id with `--run-id` before the run starts, so the entry's state
 * can record it while the run is still running, then waits through the same
 * `uh wait` path. A resumed entry has no live child (the queue process
 * crashed), so it waits on its recorded run id directly.
 */
export function createQueueLauncher(deps: QueueLauncherDeps = {}): QueueLauncher {
  const cliEntry = deps.cliEntry ?? resolveCliEntry();
  const nodePath = deps.nodePath ?? process.execPath;
  const spawner = deps.spawner
    ?? ((command, args, options) => spawn(command, args, { ...options, stdio: ["ignore", "ignore", "ignore"] }));
  const wait = deps.wait ?? waitForRuns;
  const settleTimeoutMs = deps.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;
  const settle = deps.settle
    ?? ((request: QueueSettleRequest) => settleRunFromRecords(wait, request, settleTimeoutMs));
  return async (request) => {
    if (request.resumeRunId !== undefined) {
      const runId = request.resumeRunId;
      return { run_id: runId, settled: settle({ root: request.root, runId }) };
    }
    const runId = generateRunId();
    const args = [
      cliEntry, "mission", "run", request.missionPath,
      "--runtime", request.runtime, "--root", request.root, "--run-id", runId, "--no-sandbox",
    ];
    const child = spawner(nodePath, args, { cwd: request.root });
    const childExit = new Promise<QueueChildExit>((resolve) => {
      child.once("error", () => resolve({ code: null, error: true }));
      child.once("exit", (code) => resolve({ code, error: false }));
    });
    return { run_id: runId, settled: settle({ root: request.root, runId, childExit }) };
  };
}

export function buildQueueSettlementEvent(notice: QueueSettlementNotice, at: string): NotificationEvent {
  return {
    event: "queue.entry.settled",
    at,
    subject: `UH queue.entry.settled: ${notice.queueId} ${notice.entryId} ${notice.status}`,
    summary: `queue ${notice.queueId} entry ${notice.entryId} ${notice.status}`
      + `${notice.reason !== undefined ? ` (${notice.reason})` : ""}`
      + `${notice.runId !== null ? ` (run ${notice.runId})` : ""}`,
    // A run id keeps the at-most-once ledger key distinct; a skipped entry has
    // no run, so a queue/entry-qualified id stands in.
    run_id: notice.runId ?? `${notice.queueId}#${notice.entryId}`,
    status: notice.status,
    queue_id: notice.queueId,
    entry_id: notice.entryId,
    ...(notice.exitCode !== null ? { exit_code: notice.exitCode } : {}),
    ...(notice.reason !== undefined ? { reason: notice.reason } : {}),
  };
}

async function defaultQueueNotifier(root: string, notice: QueueSettlementNotice): Promise<void> {
  try {
    await dispatchEvent(root, buildQueueSettlementEvent(notice, new Date().toISOString()));
  } catch {
    // A notification must never fail or delay the queue.
  }
}

/* -------------------------------------------------------------------------- */
/* Scheduler                                                                  */
/* -------------------------------------------------------------------------- */

export interface RunQueueOptions {
  root: string;
  launcher?: QueueLauncher;
  maxOrchestrators?: number;
  freeMemoryBytes?: () => number;
  memoryFloorMb?: number;
  runMemoryMb?: number;
  memoryRetryMs?: number;
  notify?: QueueNotifier;
  now?: () => Date;
}

export interface QueueRunCounts {
  total: number;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface QueueRunResult {
  schema_version: typeof QUEUE_STATE_SCHEMA_VERSION;
  queue_id: string;
  status: "passed" | "failed";
  entries: QueueEntryState[];
  counts: QueueRunCounts;
  state_path: string;
}

export function countQueueEntries(entries: readonly QueueEntryState[]): QueueRunCounts {
  const counts: QueueRunCounts = { total: entries.length, pending: 0, running: 0, passed: 0, failed: 0, skipped: 0 };
  for (const entry of entries) counts[entry.status] += 1;
  return counts;
}

export function formatQueueState(state: QueueState): string {
  const lines = state.entries.map(
    (entry) => `${entry.id}  ${entry.status}  run=${entry.run_id ?? "-"}  exit=${entry.exit_code ?? "-"}`,
  );
  const counts = countQueueEntries(state.entries);
  lines.push(
    `queue ${state.queue_id}: total=${counts.total} pending=${counts.pending} running=${counts.running} `
    + `passed=${counts.passed} failed=${counts.failed} skipped=${counts.skipped}`,
  );
  return lines.join("\n");
}

/** Reuse the worker admission helper to decide whether one more run may launch. */
function hasMemoryHeadroom(
  freeBytes: number,
  limits: { maxOrchestrators: number; memoryFloorMb: number; runMemoryMb: number },
): boolean {
  try {
    workerConcurrency(1, {
      max_parallel: limits.maxOrchestrators,
      worker_memory_mb: limits.runMemoryMb,
      reserve_memory_mb: limits.memoryFloorMb,
    }, freeBytes);
    return true;
  } catch {
    return false;
  }
}

function blankEntryState(id: string): QueueEntryState {
  return { id, status: "pending", run_id: null, started_at: null, finished_at: null, exit_code: null };
}

export async function runQueue(queueFilePath: string, options: RunQueueOptions): Promise<QueueRunResult> {
  const root = path.resolve(options.root);
  // Hive integrity is a precondition: a broken hive facts or ledger chain means
  // the shared state every agent trusts cannot be extended, so queue refuses.
  assertHiveChainsIntact(root);
  const queue = await loadQueueFile(path.resolve(queueFilePath));
  const maxOrchestrators = options.maxOrchestrators ?? DEFAULT_MAX_ORCHESTRATORS;
  if (!Number.isInteger(maxOrchestrators) || maxOrchestrators < 1) {
    throw new Error(`--max-orchestrators must be a positive integer, got: ${String(options.maxOrchestrators)}`);
  }
  const memoryFloorMb = options.memoryFloorMb ?? DEFAULT_MEMORY_FLOOR_MB;
  const runMemoryMb = options.runMemoryMb ?? DEFAULT_RUN_MEMORY_MB;
  const memoryRetryMs = options.memoryRetryMs ?? DEFAULT_MEMORY_RETRY_MS;
  const freeMemoryBytes = options.freeMemoryBytes ?? freemem;
  const notify = options.notify ?? defaultQueueNotifier;
  const now = options.now ?? (() => new Date());
  const launcher = options.launcher ?? createQueueLauncher();

  const recorded = await readQueueState(root, queue.id);
  if (recorded !== undefined && recorded.queue_id !== queue.id) {
    throw new Error(
      `Queue state at ${queueStatePath(root, queue.id)} is for queue "${recorded.queue_id}", not "${queue.id}"`,
    );
  }

  const byId = new Map<string, QueueEntryState>();
  for (const entry of queue.entries) {
    const previous = recorded?.entries.find((candidate) => candidate.id === entry.id);
    if (previous !== undefined && previous.status === "running" && previous.run_id === null) {
      throw new Error(`Queue entry "${entry.id}" is recorded running but has no run id; cannot resume`);
    }
    byId.set(entry.id, previous !== undefined ? { ...previous } : blankEntryState(entry.id));
  }
  const state: QueueState = {
    schema_version: QUEUE_STATE_SCHEMA_VERSION,
    queue_id: queue.id,
    entries: queue.entries.map((entry) => byId.get(entry.id)!),
  };
  await writeQueueState(root, state);

  const inflight = new Map<string, Promise<void>>();

  const settleEntry = async (
    entry: QueueEntry,
    outcome: { status: QueueEntryStatus; run_id: string | null; exit_code: number | null; reason?: string },
  ): Promise<void> => {
    const entryState = byId.get(entry.id)!;
    entryState.status = outcome.status;
    entryState.finished_at = now().toISOString();
    if (outcome.status === "skipped") {
      entryState.run_id = null;
      entryState.exit_code = null;
    } else {
      entryState.run_id = outcome.run_id;
      entryState.exit_code = outcome.exit_code;
    }
    await writeQueueState(root, state);
    await notify(root, {
      queueId: queue.id,
      entryId: entry.id,
      status: entryState.status,
      runId: entryState.run_id,
      exitCode: entryState.exit_code,
      ...(outcome.status === "failed" && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    });
    // Best-effort: a hive error never fails the queue.
    if (outcome.status === "passed") {
      recordQueuePass(root, {
        queueId: queue.id,
        entryId: entry.id,
        runId: entryState.run_id,
        missionPath: entry.mission,
      });
    }
  };

  const startTask = (entry: QueueEntry): void => {
    const entryState = byId.get(entry.id)!;
    const resuming = entryState.status === "running";
    const resumeRunId = resuming ? entryState.run_id ?? undefined : undefined;
    // Mark running synchronously so the launch loop never selects this entry
    // twice before the launcher hands back its run id.
    if (!resuming) {
      entryState.status = "running";
      entryState.started_at = now().toISOString();
      entryState.finished_at = null;
      entryState.exit_code = null;
      entryState.run_id = null;
    }
    const task = (async () => {
      let handle: QueueLaunchHandle;
      try {
        handle = await launcher({
          queueId: queue.id,
          entryId: entry.id,
          missionPath: path.isAbsolute(entry.mission) ? entry.mission : path.resolve(root, entry.mission),
          runtime: entry.runtime,
          root,
          ...(resumeRunId !== undefined ? { resumeRunId } : {}),
        });
      } catch {
        await settleEntry(entry, { status: "failed", run_id: entryState.run_id, exit_code: 1 });
        return;
      }
      // The run id is known before the run settles, so it is persisted while the
      // entry is still running and a resume can wait on it after a crash.
      entryState.run_id = handle.run_id;
      await writeQueueState(root, state);

      let outcome: QueueSettleOutcome;
      try {
        outcome = await handle.settled;
      } catch {
        outcome = { status: "failed", exit_code: 1 };
      }
      await settleEntry(entry, {
        status: outcome.status,
        run_id: handle.run_id,
        exit_code: outcome.exit_code,
        ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
      });
    })().finally(() => { inflight.delete(entry.id); });
    inflight.set(entry.id, task);
  };

  // Resume: a settled entry is kept; an entry recorded running is waited on by
  // its recorded run id instead of being relaunched.
  for (const entry of queue.entries) {
    if (byId.get(entry.id)!.status === "running") startTask(entry);
  }

  for (;;) {
    // A dependency that failed (or was skipped) skips this entry.
    for (const entry of queue.entries) {
      const entryState = byId.get(entry.id)!;
      if (entryState.status !== "pending") continue;
      const blocked = (entry.after ?? []).some((dep) => {
        const depStatus = byId.get(dep)?.status;
        return depStatus === "failed" || depStatus === "skipped";
      });
      if (blocked) await settleEntry(entry, { status: "skipped", run_id: null, exit_code: null });
    }

    let memoryBlocked = false;
    while (inflight.size < maxOrchestrators) {
      const candidate = queue.entries.find((entry) => {
        const entryState = byId.get(entry.id)!;
        return entryState.status === "pending" && (entry.after ?? []).every((dep) => byId.get(dep)?.status === "passed");
      });
      if (candidate === undefined) break;
      if (!hasMemoryHeadroom(freeMemoryBytes(), { maxOrchestrators, memoryFloorMb, runMemoryMb })) {
        memoryBlocked = true;
        break;
      }
      startTask(candidate);
    }

    if (inflight.size === 0) {
      const anyPending = queue.entries.some((entry) => byId.get(entry.id)!.status === "pending");
      if (anyPending && memoryBlocked) {
        await delay(memoryRetryMs);
        continue;
      }
      break;
    }
    await Promise.race([...inflight.values()]);
  }

  const counts = countQueueEntries(state.entries);
  const status: "passed" | "failed" = counts.failed > 0 || counts.skipped > 0 ? "failed" : "passed";
  return {
    schema_version: QUEUE_STATE_SCHEMA_VERSION,
    queue_id: queue.id,
    status,
    entries: state.entries,
    counts,
    state_path: queueStatePath(root, queue.id),
  };
}
