/**
 * Outcome-vs-cost comparison of two run arms (for example two session
 * templates) with honest uncertainty. Pure: no I/O, no clock, no env.
 *
 * Spec notes:
 * - Success rates carry a Wilson score interval, never a bare percentage, so a
 *   handful of runs cannot be read as a signal.
 * - Unknown cost stays unknown. Missing `cost_usd` is never treated as free, so
 *   an arm with unpriced runs can never look "cheaper per success".
 * - A changed configuration only earns a "better" verdict when the intervals do
 *   not overlap AND it beats plain repeated attempts of the baseline, which is
 *   what `bestOfN` / `attemptsToMatch` make visible.
 */
import type { RunRecord } from "./experience-store.js";

/** Smallest runs-per-arm count below which no difference is reportable. */
export const MIN_ARM_RUNS = 5;

/** Ceiling on reported best-of-n attempts; beyond this the answer is "too many". */
export const BEST_OF_N_CAP = 16;

export type WilsonInterval = { low: number; high: number };

export type ArmSummary = {
  runs: number;
  passed: number;
  success_rate: number;
  interval: WilsonInterval;
  known_cost_runs: number;
  total_cost_usd: number | undefined;
  mean_cost_usd: number | undefined;
  cost_per_success_usd: number | undefined;
  mean_duration_ms: number | undefined;
};

export type ComparisonVerdict =
  | "insufficient_data"
  | "no_clear_difference"
  | "a_better"
  | "b_better";

export type CheaperPerSuccess = "a" | "b" | "unknown";

export type ArmComparison = {
  a: ArmSummary;
  b: ArmSummary;
  delta_success_rate: number;
  intervals_overlap: boolean;
  cheaper_per_success: CheaperPerSuccess;
  verdict: ComparisonVerdict;
};

const isKnownNonNegative = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const meanOf = (values: number[]): number | undefined =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

/**
 * Wilson score interval for `successes` out of `n` attempts at z-score `z`
 * (1.96 is 95%). An empty arm is maximally uncertain: `{ low: 0, high: 1 }`.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): WilsonInterval {
  if (!Number.isFinite(n) || n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    low: Math.max(0, centre - halfWidth),
    high: Math.min(1, centre + halfWidth),
  };
}

/** Summarize one arm's records; unknown cost and duration stay undefined. */
export function summarizeArm(records: readonly RunRecord[]): ArmSummary {
  const runs = records.length;
  const passed = records.filter((record) => record.status === "passed").length;
  const costs = records.map((record) => record.cost_usd).filter(isKnownNonNegative);
  const durations = records.map((record) => record.duration_ms).filter(isKnownNonNegative);
  const totalCostUsd = costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : undefined;
  return {
    runs,
    passed,
    success_rate: runs ? passed / runs : 0,
    interval: wilsonInterval(passed, runs),
    known_cost_runs: costs.length,
    total_cost_usd: totalCostUsd,
    mean_cost_usd: meanOf(costs),
    cost_per_success_usd: totalCostUsd !== undefined && passed > 0 ? totalCostUsd / passed : undefined,
    mean_duration_ms: meanOf(durations),
  };
}

const intervalsOverlap = (a: WilsonInterval, b: WilsonInterval): boolean =>
  !(a.high < b.low || b.high < a.low);

function cheaperPerSuccess(a: ArmSummary, b: ArmSummary): CheaperPerSuccess {
  if (a.cost_per_success_usd === undefined || b.cost_per_success_usd === undefined) return "unknown";
  if (a.cost_per_success_usd < b.cost_per_success_usd) return "a";
  if (b.cost_per_success_usd < a.cost_per_success_usd) return "b";
  return "unknown";
}

/**
 * Compare two arms. `insufficient_data` wins over everything; otherwise
 * overlapping Wilson intervals mean no clear difference, and only
 * non-overlapping intervals name a better arm.
 */
export function compareArms(a: readonly RunRecord[], b: readonly RunRecord[]): ArmComparison {
  const summaryA = summarizeArm(a);
  const summaryB = summarizeArm(b);
  const overlap = intervalsOverlap(summaryA.interval, summaryB.interval);
  let verdict: ComparisonVerdict;
  if (summaryA.runs < MIN_ARM_RUNS || summaryB.runs < MIN_ARM_RUNS) {
    verdict = "insufficient_data";
  } else if (overlap) {
    verdict = "no_clear_difference";
  } else {
    verdict = summaryA.success_rate > summaryB.success_rate ? "a_better" : "b_better";
  }
  return {
    a: summaryA,
    b: summaryB,
    delta_success_rate: summaryA.success_rate - summaryB.success_rate,
    intervals_overlap: overlap,
    cheaper_per_success: cheaperPerSuccess(summaryA, summaryB),
    verdict,
  };
}

/** Chance at least one of `n` independent attempts passes at rate `p`. */
export function bestOfN(successRate: number, n: number): number {
  if (n <= 0) return 0;
  return 1 - Math.pow(1 - successRate, n);
}

/**
 * Smallest number of plain repeated attempts of the baseline that reaches
 * `targetRate`, capped at {@link BEST_OF_N_CAP}. Undefined when the baseline
 * never passes, so repeats cannot buy any chance at all.
 */
export function attemptsToMatch(baselineRate: number, targetRate: number): number | undefined {
  if (!(baselineRate > 0)) return undefined;
  if (targetRate <= 0) return 1;
  for (let n = 1; n <= BEST_OF_N_CAP; n += 1) {
    if (bestOfN(baselineRate, n) >= targetRate) return n;
  }
  return BEST_OF_N_CAP;
}
