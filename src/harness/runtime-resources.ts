import { freemem } from "node:os";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { TeamResourceLimitsSchema, type TeamResourceLimits } from "../schema/runtime-control.js";
import { harnessDir } from "./paths.js";
import { indexRuns, type RunRecord } from "./experience-store.js";
import { discoverRuns, type LiveRunRecord } from "./live-runs.js";
import { acquireExclusiveFileLock } from "./sandbox.js";

/** Fallback per-worker memory when no run of the team's runtime has recorded a peak. */
export const DEFAULT_WORKER_MEMORY_MB = 700;
/** Bytes reserved for the harness itself; matches the schema default. */
export const DEFAULT_RESERVE_MEMORY_MB = 1024;
/** How often a wave with no headroom re-checks before its admission timeout. */
export const WORKER_ADMISSION_POLL_MS = 10_000;
/**
 * Upper bound on how long a reservation is trusted. A reservation stops
 * counting as soon as its worker's runtime process has started and reported —
 * a project-root live-run entry with a heartbeat, or its measured memory
 * visible — because then that memory shows in the OS free-memory reading and
 * subtracting the reservation again would double count it. This bound is only
 * the fallback for an owner that never started a worker or crashed before it
 * reported; after it, the reservation is assumed visible and dropped.
 */
export const WORKER_RESERVATION_RELEASE_MS = 60_000;

const MEMORY_BYTES_PER_MB = 1024 * 1024;
const RECENT_PEAK_RUN_LIMIT = 20;
const ADMISSION_LOCK_TIMEOUT_MS = 5_000;
const ADMISSION_LOCK_STALE_MS = 10_000;
const ADMISSION_DIR_NAME = "worker-admission";

type ParsedLimits = z.output<typeof TeamResourceLimitsSchema>;
type ResolvedLimits = ParsedLimits & { worker_memory_mb: number };

/** How the effective `worker_memory_mb` was chosen. */
export type WorkerMemorySource = "declared" | "recorded_median" | "fallback";

export type ResolvedTeamResources = {
  /** Parsed limits with `worker_memory_mb` always resolved. */
  limits: ResolvedLimits;
  worker_memory_mb: number;
  reserve_memory_mb: number;
  admission_timeout_ms: number;
  worker_memory_source: WorkerMemorySource;
  /** Number of recorded run peaks the median was taken from (0 for fallback/declared). */
  worker_memory_sample_runs: number;
};

export function workerAdmissionDir(root: string): string {
  return path.join(harnessDir(root), ADMISSION_DIR_NAME);
}

/** Full path of the per-project admission lock file for a project root. */
export function workerAdmissionLockPath(root: string): string {
  return path.join(harnessDir(root), `${ADMISSION_DIR_NAME}.lock`);
}

function reservationsDir(root: string): string {
  return path.join(workerAdmissionDir(root), "reservations");
}

const ReservationFileSchema = z.object({
  reserved_mb: z.number().int().positive(),
  created_at: z.string().datetime(),
  release_after_ms: z.number().int().positive(),
  pid: z.number().int().positive(),
  worker: z.string().min(1).optional(),
}).strict();

export type WorkerReservation = { path: string; reserved_mb: number };

/**
 * Resolve a team's resource limits. When the team declares no
 * `worker_memory_mb`, it is taken from the median peak memory of the most
 * recent settled runs of the team's runtime in this project (as the experience
 * store indexes `runtime-control.json`), or the 700 MB fallback. The resolved
 * values are surfaced so the integration report can show what was used.
 */
export async function resolveTeamResources(
  root: string,
  adapters: readonly string[],
  input: TeamResourceLimits = {},
): Promise<ResolvedTeamResources> {
  const limits = TeamResourceLimitsSchema.parse(input);
  let workerMemoryMb = limits.worker_memory_mb;
  let source: WorkerMemorySource = "declared";
  let sampleRuns = 0;
  if (workerMemoryMb === undefined) {
    const peaks = await recordedWorkerPeakMb(root, adapters);
    sampleRuns = peaks.length;
    if (peaks.length > 0) {
      workerMemoryMb = medianOf(peaks);
      source = "recorded_median";
    } else {
      workerMemoryMb = DEFAULT_WORKER_MEMORY_MB;
      source = "fallback";
    }
  }
  return {
    limits: { ...limits, worker_memory_mb: workerMemoryMb },
    worker_memory_mb: workerMemoryMb,
    reserve_memory_mb: limits.reserve_memory_mb,
    admission_timeout_ms: limits.admission_timeout_ms,
    worker_memory_source: source,
    worker_memory_sample_runs: sampleRuns,
  };
}

async function recordedWorkerPeakMb(root: string, adapters: readonly string[]): Promise<number[]> {
  let records: RunRecord[];
  try { records = await indexRuns(root); } catch { return []; }
  const wanted = new Set(adapters);
  const candidates = records.filter((record) =>
    record.peak_memory_bytes !== undefined && record.peak_memory_bytes > 0
    && record.runtime !== undefined && (wanted.size === 0 || wanted.has(record.runtime))
    && record.status !== undefined && record.status !== "running",
  );
  candidates.sort((a, b) => settledAt(b) - settledAt(a));
  return candidates
    .slice(0, RECENT_PEAK_RUN_LIMIT)
    .map((record) => Math.round(record.peak_memory_bytes! / MEMORY_BYTES_PER_MB))
    .filter((mb) => mb > 0);
}

function settledAt(record: RunRecord): number {
  const value = Date.parse(record.finished_at ?? record.started_at ?? "");
  return Number.isFinite(value) ? value : 0;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.max(1, Math.round(value));
}

export function workerConcurrency(count: number, input: TeamResourceLimits = {}, availableBytes = freemem()): number {
  const limits = TeamResourceLimitsSchema.parse(input);
  let parallel = Math.min(count, limits.max_parallel);
  if (limits.worker_memory_mb) {
    const availableMb = Math.floor(availableBytes / (1024 * 1024)) - limits.reserve_memory_mb;
    parallel = Math.min(parallel, Math.floor(availableMb / limits.worker_memory_mb));
  }
  if (parallel < 1) throw new Error("Insufficient resource headroom to launch one worker within its memory cap");
  return parallel;
}

/** Drain admitted work on failure; never leave background siblings running after rejection. */
export async function mapBounded<T, R>(items: readonly T[], concurrency: number, action: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Worker concurrency must be a positive integer");
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await action(items[index]); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return results;
}

type AdmissionAttempt = {
  slots: number;
  memoryReason?: string;
  costBlocked?: string;
  reservations: WorkerReservation[];
};

/**
 * Decide how many workers fit right now. Memory admission subtracts outstanding
 * reservations from the injected free-memory reading; the cost cap is applied on
 * top and is local to the team.
 */
function decideAdmission(
  baseBytes: number,
  reservedBytes: number,
  remaining: number,
  limits: ParsedLimits,
  completedCost: number,
): AdmissionAttempt {
  let memorySlots: number;
  let memoryReason: string | undefined;
  try {
    memorySlots = workerConcurrency(remaining, limits, Math.max(0, baseBytes - reservedBytes));
  } catch (error) {
    memorySlots = 0;
    memoryReason = (error as Error).message;
  }
  if (memorySlots < 1) return { slots: 0, memoryReason, reservations: [] };

  let slots = memorySlots;
  if (limits.max_cost_usd !== undefined) {
    slots = Math.min(slots, Math.floor((limits.max_cost_usd - completedCost) / limits.worker_cost_reservation_usd!));
    if (slots < 1) {
      return { slots: 0, costBlocked: "Remaining team cost budget cannot reserve another worker", reservations: [] };
    }
  }
  return { slots, reservations: [] };
}

/**
 * The per-project admission decision. The lock and the reservations coordinate
 * teams launched from the same project root. The lock is held only while
 * deciding: read free memory and the reservations other teams are still
 * holding, choose the wave, write this team's own reservations, then release.
 * A reservation counts until its worker's runtime process has started and
 * reported (or until it ages past the 60 s fallback), so a later decision only
 * subtracts memory that is not yet visible in `freemem()`.
 */
async function admitAcrossTeams(
  root: string,
  availableBytes: () => number,
  remaining: number,
  workerMemoryMb: number,
  limits: ParsedLimits,
  completedCost: number,
  now: () => number,
): Promise<AdmissionAttempt> {
  const lockPath = workerAdmissionLockPath(root);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const release = await acquireExclusiveFileLock(lockPath, {
    label: "worker admission",
    timeoutMs: ADMISSION_LOCK_TIMEOUT_MS,
    staleMs: ADMISSION_LOCK_STALE_MS,
  });
  try {
    const baseBytes = availableBytes();
    const active = await readActiveReservations(root, now());
    const reservedBytes = active.reduce((sum, reservation) => sum + reservation.reserved_mb, 0) * MEMORY_BYTES_PER_MB;
    const attempt = decideAdmission(baseBytes, reservedBytes, remaining, limits, completedCost);
    if (attempt.slots >= 1) {
      attempt.reservations = await writeReservations(root, attempt.slots, workerMemoryMb, now());
    }
    return attempt;
  } finally {
    await release();
  }
}

async function readActiveReservations(root: string, nowMs: number): Promise<WorkerReservation[]> {
  const dir = reservationsDir(root);
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const candidates: Array<{ path: string; reserved_mb: number; pid: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(dir, entry.name);
    let parsed;
    try { parsed = ReservationFileSchema.safeParse(JSON.parse(await readFile(file, "utf-8"))); }
    catch { parsed = undefined; }
    if (parsed === undefined || !parsed.success) {
      await rm(file, { force: true }).catch(() => undefined);
      continue;
    }
    const createdAt = Date.parse(parsed.data.created_at);
    if (!Number.isFinite(createdAt) || nowMs - createdAt >= parsed.data.release_after_ms) {
      await rm(file, { force: true }).catch(() => undefined);
      continue;
    }
    candidates.push({ path: file, reserved_mb: parsed.data.reserved_mb, pid: parsed.data.pid });
  }
  if (candidates.length === 0) return [];
  // A reservation ends as soon as its worker's runtime process has started and
  // reported; only an owner that has not yet reported (or crashed) still holds
  // memory that is invisible to `freemem()`, and it is bounded by the fallback.
  const reported = await reportedWorkerPids(root, nowMs);
  const active: WorkerReservation[] = [];
  for (const candidate of candidates) {
    if (reported.has(candidate.pid)) {
      await rm(candidate.path, { force: true }).catch(() => undefined);
      continue;
    }
    active.push({ path: candidate.path, reserved_mb: candidate.reserved_mb });
  }
  return active;
}

/**
 * Controller pids whose worker has started and reported: a project-root live-run
 * entry that has not settled and already carries a heartbeat (the runtime process
 * is running) or a measured peak memory (its memory is visible). A reservation
 * written by that process must not be subtracted a second time. Discovery is
 * best-effort and side-effect free (`persist: false`); a failure means no
 * reservation is released early and the 60 s fallback still applies.
 */
async function reportedWorkerPids(root: string, nowMs: number): Promise<Set<number>> {
  let records: LiveRunRecord[];
  try { records = await discoverRuns(root, { persist: false, now: nowMs }); }
  catch { return new Set(); }
  const pids = new Set<number>();
  for (const record of records) {
    if (record.settled_at !== undefined) continue;
    if (record.heartbeat_at !== undefined || record.peak_memory_bytes !== undefined) {
      pids.add(record.controller_pid);
    }
  }
  return pids;
}

async function writeReservations(
  root: string,
  count: number,
  reservedMb: number,
  nowMs: number,
): Promise<WorkerReservation[]> {
  const dir = reservationsDir(root);
  await mkdir(dir, { recursive: true });
  const created = new Date(nowMs).toISOString();
  const written: WorkerReservation[] = [];
  for (let index = 0; index < count; index++) {
    const file = path.join(dir, `res-${process.pid}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({
      reserved_mb: reservedMb,
      created_at: created,
      release_after_ms: WORKER_RESERVATION_RELEASE_MS,
      pid: process.pid,
      worker: `slot-${index}`,
    }), "utf-8");
    written.push({ path: file, reserved_mb: reservedMb });
  }
  return written;
}

async function releaseReservations(reservations: readonly WorkerReservation[]): Promise<void> {
  for (const reservation of reservations) {
    await rm(reservation.path, { force: true }).catch(() => undefined);
  }
}

/**
 * Re-admit only after a whole wave settles. Cost reservations govern admission,
 * not provider billing: an in-flight worker can exceed its reservation.
 *
 * Memory admission coordinates teams per project when `root` is set: a shared
 * lock decides every team launched from the same project root's wave against
 * the same free-memory reading plus the reservations other teams have not yet
 * released. When headroom is short the wave waits
 * (polling every 10 s) up to the team's `admission_timeout_ms` instead of
 * failing; after the timeout the team is blocked with the current reason.
 *
 * An unknown completed cost blocks further paid admission unless the team opted
 * into `unknown_cost: "admit"`. Opting in never prices unknown spend as zero: it
 * simply lets the next wave through, and every wave admitted that way is reported
 * through `onAdmission` so the caller can record it explicitly.
 */
export async function mapResourceWaves<T, R>(
  items: readonly T[], input: TeamResourceLimits, action: (item: T) => Promise<R>,
  options: {
    costOf: (result: R, item: T) => Promise<number | undefined>;
    blocked: (item: T, reason: string) => Promise<R>;
    availableBytes?: () => number;
    onAdmission?: (note: string) => Promise<void> | void;
    /** Project root enabling cross-team admission (lock + reservations) and waiting. */
    root?: string;
    /** Called once per wait for memory headroom, with a human-readable reason. */
    onWait?: (note: string) => Promise<void> | void;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    pollIntervalMs?: number;
  },
): Promise<R[]> {
  const limits = TeamResourceLimitsSchema.parse(input);
  const availableBytes = options.availableBytes ?? freemem;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? delay;
  const pollIntervalMs = options.pollIntervalMs ?? WORKER_ADMISSION_POLL_MS;
  const workerMemoryMb = limits.worker_memory_mb;
  const acrossTeams = options.root !== undefined && workerMemoryMb !== undefined;
  const waitDeadlineMs = now() + limits.admission_timeout_ms;

  const results: R[] = [];
  let completedCost = 0;
  let blockedReason: string | undefined;
  let waveNumber = 0;
  let unknownCostOutstanding = false;
  let waitCount = 0;
  while (results.length < items.length && !blockedReason) {
    const remaining = items.length - results.length;
    const attempt = acrossTeams
      ? await admitAcrossTeams(options.root!, availableBytes, remaining, workerMemoryMb!, limits, completedCost, now)
      : decideAdmission(availableBytes(), 0, remaining, limits, completedCost);

    if (attempt.costBlocked !== undefined) { blockedReason = attempt.costBlocked; break; }
    if (attempt.slots < 1) {
      const reason = attempt.memoryReason ?? "Insufficient resource headroom to launch one worker within its memory cap";
      if (acrossTeams && now() < waitDeadlineMs) {
        waitCount += 1;
        await options.onWait?.(`wait ${waitCount} for worker memory headroom (${reason}); retrying in ${Math.round(pollIntervalMs / 1000)}s`);
        await sleep(pollIntervalMs);
        continue;
      }
      blockedReason = reason;
      break;
    }

    waveNumber += 1;
    if (unknownCostOutstanding) {
      await options.onAdmission?.(`wave ${waveNumber} admitted with unknown cost by policy unknown_cost=admit`);
    }
    const wave = items.slice(results.length, results.length + attempt.slots);
    try {
      const completed = await mapBounded(wave, attempt.slots, action);
      results.push(...completed);
      unknownCostOutstanding = false;
      if (limits.max_cost_usd !== undefined) {
        for (let index = 0; index < completed.length; index++) {
          let cost: number | undefined;
          try { cost = await options.costOf(completed[index], wave[index]); }
          catch { blockedReason = "Completed worker cost accounting is unavailable"; break; }
          if (cost === undefined || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(completedCost + cost)) {
            if (limits.unknown_cost === "block") {
              blockedReason = "Completed worker cost is unknown; refusing further paid admission";
              break;
            }
            unknownCostOutstanding = true;
            continue;
          }
          completedCost += cost;
        }
      }
    } finally {
      await releaseReservations(attempt.reservations);
    }
  }
  while (results.length < items.length) {
    results.push(await options.blocked(items[results.length], blockedReason!));
  }
  return results;
}
