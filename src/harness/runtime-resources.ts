import { freemem } from "node:os";
import { TeamResourceLimitsSchema, type TeamResourceLimits } from "../schema/runtime-control.js";


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

/**
 * Re-admit only after a whole wave settles. Cost reservations govern admission,
 * not provider billing: an in-flight worker can exceed its reservation.
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
  },
): Promise<R[]> {
  const limits = TeamResourceLimitsSchema.parse(input);
  const results: R[] = [];
  let completedCost = 0;
  let blockedReason: string | undefined;
  let waveNumber = 0;
  let unknownCostOutstanding = false;
  while (results.length < items.length && !blockedReason) {
    let slots: number;
    try { slots = workerConcurrency(items.length - results.length, limits, (options.availableBytes ?? freemem)()); }
    catch (error) { blockedReason = (error as Error).message; break; }
    if (limits.max_cost_usd !== undefined) {
      slots = Math.min(slots, Math.floor((limits.max_cost_usd - completedCost) / limits.worker_cost_reservation_usd!));
      if (slots < 1) { blockedReason = "Remaining team cost budget cannot reserve another worker"; break; }
    }
    waveNumber += 1;
    if (unknownCostOutstanding) {
      await options.onAdmission?.(`wave ${waveNumber} admitted with unknown cost by policy unknown_cost=admit`);
    }
    const wave = items.slice(results.length, results.length + slots);
    const completed = await mapBounded(wave, slots, action);
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
  }
  while (results.length < items.length) {
    results.push(await options.blocked(items[results.length], blockedReason!));
  }
  return results;
}
