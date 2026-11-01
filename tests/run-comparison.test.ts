import { describe, expect, test } from "vitest";
import type { RunRecord } from "../src/harness/experience-store.js";
import {
  attemptsToMatch,
  bestOfN,
  compareArms,
  summarizeArm,
  wilsonInterval,
} from "../src/harness/run-comparison.js";

const record = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  mission_id: "mission-a",
  run_id: "run",
  status: "passed",
  ...overrides,
});

const arm = (passed: number, failed: number, extra: Partial<RunRecord> = {}): RunRecord[] => [
  ...Array.from({ length: passed }, (_, i) => record({ run_id: `pass-${i}`, ...extra })),
  ...Array.from({ length: failed }, (_, i) => record({ run_id: `fail-${i}`, status: "failed", ...extra })),
];

const priced = (records: RunRecord[], cost: number): RunRecord[] =>
  records.map((value) => ({ ...value, cost_usd: cost }));

const round = (value: number): number => Number(value.toFixed(4));

describe("wilsonInterval", () => {
  test("matches the published Wilson score interval for 8 of 10 at 95%", () => {
    const interval = wilsonInterval(8, 10);
    expect(round(interval.low)).toBe(0.4902);
    expect(round(interval.high)).toBe(0.9433);
    expect(interval.low).toBeCloseTo(0.490157, 5);
    expect(interval.high).toBeCloseTo(0.943319, 5);
  });

  test("is maximally uncertain for an empty arm and clamps perfect arms", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(wilsonInterval(5, 0)).toEqual({ low: 0, high: 1 });
    expect(round(wilsonInterval(5, 5).low)).toBe(0.5655);
    expect(round(wilsonInterval(5, 5).high)).toBe(1);
    expect(wilsonInterval(0, 10).low).toBeLessThan(0.0001);
    expect(wilsonInterval(0, 10).high).toBeCloseTo(0.277538, 5);
    expect(wilsonInterval(0, 10).high).toBeLessThanOrEqual(1);
  });

  test("narrows with more runs at the same rate", () => {
    const small = wilsonInterval(4, 5);
    const large = wilsonInterval(80, 100);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
    expect(round(large.low)).toBe(0.7112);
    expect(round(large.high)).toBe(0.8666);
  });
});

describe("summarizeArm", () => {
  test("reports runs, passes, rate, interval and cost for a fully priced arm", () => {
    const summary = summarizeArm([
      record({ run_id: "r1", cost_usd: 1, duration_ms: 1000 }),
      record({ run_id: "r2", cost_usd: 2, duration_ms: 3000 }),
      record({ run_id: "r3", status: "failed", cost_usd: 3, duration_ms: 2000 }),
    ]);
    expect(summary).toMatchObject({
      runs: 3,
      passed: 2,
      success_rate: 2 / 3,
      known_cost_runs: 3,
      total_cost_usd: 6,
      mean_cost_usd: 2,
      cost_per_success_usd: 3,
      mean_duration_ms: 2000,
    });
    expect(summary.interval).toEqual(wilsonInterval(2, 3));
  });

  test("keeps unknown cost unknown and never divides by zero successes", () => {
    const summary = summarizeArm([
      record({ run_id: "r1" }),
      record({ run_id: "r2", status: "failed" }),
    ]);
    expect(summary.passed).toBe(1);
    expect(summary.known_cost_runs).toBe(0);
    expect(summary.total_cost_usd).toBeUndefined();
    expect(summary.mean_cost_usd).toBeUndefined();
    expect(summary.cost_per_success_usd).toBeUndefined();
    expect(summary.mean_duration_ms).toBeUndefined();
  });

  test("cost per success is undefined when nothing passed even though cost is known", () => {
    const summary = summarizeArm([record({ status: "failed", cost_usd: 4 }), record({ status: "failed", cost_usd: 5 })]);
    expect(summary).toMatchObject({ runs: 2, passed: 0, total_cost_usd: 9, mean_cost_usd: 4.5 });
    expect(summary.cost_per_success_usd).toBeUndefined();
  });

  test("prices only the runs that report cost instead of padding with zeros", () => {
    const summary = summarizeArm([
      record({ run_id: "priced", cost_usd: 1.5 }),
      record({ run_id: "free-pass" }),
      record({ run_id: "unpriced-fail", status: "failed", cost_usd: undefined }),
    ]);
    expect(summary).toMatchObject({
      runs: 3, passed: 2, known_cost_runs: 1, total_cost_usd: 1.5, mean_cost_usd: 1.5, cost_per_success_usd: 0.75,
    });
  });

  test("an empty arm has no runs, no cost, and the full 0 to 1 interval", () => {
    expect(summarizeArm([])).toEqual({
      runs: 0,
      passed: 0,
      success_rate: 0,
      interval: { low: 0, high: 1 },
      known_cost_runs: 0,
      total_cost_usd: undefined,
      mean_cost_usd: undefined,
      cost_per_success_usd: undefined,
      mean_duration_ms: undefined,
    });
  });
});

describe("compareArms", () => {
  test("insufficient_data when either arm has fewer than 5 runs, even with disjoint intervals", () => {
    const comparison = compareArms(arm(4, 0), arm(0, 10));
    expect(comparison.a.runs).toBe(4);
    expect(comparison.intervals_overlap).toBe(false);
    expect(comparison.verdict).toBe("insufficient_data");
    expect(comparison.delta_success_rate).toBeCloseTo(1, 10);

    expect(compareArms(arm(5, 0), arm(0, 0)).verdict).toBe("insufficient_data");
    expect(compareArms(arm(4, 0), arm(0, 5)).verdict).toBe("insufficient_data");
  });

  test("no_clear_difference when intervals overlap despite a big-looking rate gap", () => {
    const comparison = compareArms(arm(8, 2), arm(5, 5));
    expect(comparison.a.success_rate).toBe(0.8);
    expect(comparison.b.success_rate).toBe(0.5);
    expect(comparison.intervals_overlap).toBe(true);
    expect(comparison.verdict).toBe("no_clear_difference");
    expect(comparison.delta_success_rate).toBeCloseTo(0.3, 10);
  });

  test("a_better when 10 of 10 beats 1 of 10 with disjoint intervals", () => {
    const comparison = compareArms(arm(10, 0), arm(1, 9));
    expect(comparison.intervals_overlap).toBe(false);
    expect(comparison.verdict).toBe("a_better");
    expect(comparison.delta_success_rate).toBeCloseTo(0.9, 10);
  });

  test("b_better is the mirror image of a_better", () => {
    const comparison = compareArms(arm(1, 9), arm(10, 0));
    expect(comparison.intervals_overlap).toBe(false);
    expect(comparison.verdict).toBe("b_better");
    expect(comparison.delta_success_rate).toBeCloseTo(-0.9, 10);
  });

  test("5 of 5 versus 0 of 5 is the smallest honest a_better", () => {
    const comparison = compareArms(arm(5, 0), arm(0, 5));
    expect(round(comparison.a.interval.low)).toBe(0.5655);
    expect(round(comparison.b.interval.high)).toBe(0.4345);
    expect(comparison.intervals_overlap).toBe(false);
    expect(comparison.verdict).toBe("a_better");
    expect(comparison.delta_success_rate).toBeCloseTo(1, 10);
  });

  test("9 of 10 versus 2 of 10 separates, and is the shape the CLI fixture uses", () => {
    const comparison = compareArms(arm(9, 1), arm(2, 8));
    expect(round(comparison.a.interval.low)).toBe(0.5958);
    expect(round(comparison.b.interval.high)).toBe(0.5098);
    expect(comparison.intervals_overlap).toBe(false);
    expect(comparison.verdict).toBe("a_better");
  });

  test("cheaper_per_success names the cheaper arm only when both are priced", () => {
    expect(compareArms(priced(arm(10, 0), 1), priced(arm(2, 8), 4)).cheaper_per_success).toBe("a");
    expect(compareArms(priced(arm(2, 8), 1), priced(arm(10, 0), 4)).cheaper_per_success).toBe("b");
    expect(compareArms(priced(arm(10, 0), 3), priced(arm(5, 0), 3)).cheaper_per_success).toBe("unknown");
    expect(compareArms(arm(5, 0), priced(arm(1, 4), 2)).cheaper_per_success).toBe("unknown");
    expect(compareArms(priced(arm(0, 5), 2), priced(arm(1, 4), 2)).cheaper_per_success).toBe("unknown");
  });

  test("an arm can be better on outcome and worse on cost, and both are reported", () => {
    const stronger = compareArms(priced(arm(10, 0), 9), priced(arm(2, 8), 1));
    expect(stronger.verdict).toBe("a_better");
    expect(stronger.cheaper_per_success).toBe("b");
    expect(stronger.a.cost_per_success_usd).toBe(9);
    expect(stronger.b.cost_per_success_usd).toBe(5);
  });

  test("carries both arm summaries through", () => {
    const comparison = compareArms(arm(8, 2), arm(5, 5));
    expect(comparison.a).toEqual(summarizeArm(arm(8, 2)));
    expect(comparison.b).toEqual(summarizeArm(arm(5, 5)));
  });
});

describe("bestOfN and attemptsToMatch", () => {
  test("best-of-n is the chance at least one attempt passes", () => {
    expect(bestOfN(0.5, 1)).toBe(0.5);
    expect(bestOfN(0.5, 3)).toBe(0.875);
    expect(bestOfN(0.2, 5)).toBeCloseTo(0.67232, 5);
    expect(bestOfN(0, 10)).toBe(0);
    expect(bestOfN(1, 4)).toBe(1);
    expect(bestOfN(0.5, 0)).toBe(0);
  });

  test("attemptsToMatch finds the smallest n that reaches the target", () => {
    expect(attemptsToMatch(0.5, 0.9)).toBe(4);
    expect(attemptsToMatch(0.8, 0.99)).toBe(3);
    expect(attemptsToMatch(0.2, 0.9)).toBe(11);
  });

  test("a baseline that never passes cannot be repeated into success", () => {
    expect(attemptsToMatch(0, 0.5)).toBeUndefined();
    expect(attemptsToMatch(0, 0)).toBeUndefined();
  });

  test("caps at 16 when repeats cannot reach the target within the cap", () => {
    expect(attemptsToMatch(0.1, 0.99)).toBe(16);
    expect(bestOfN(0.1, 16)).toBeLessThan(0.99);
    expect(attemptsToMatch(0.5, 0.99999)).toBe(16);
    expect(bestOfN(0.5, 16)).toBeLessThan(0.99999);
    expect(attemptsToMatch(0.2, 1)).toBe(16);
  });

  test("one attempt suffices when the baseline already matches the target", () => {
    expect(attemptsToMatch(0.9, 0.9)).toBe(1);
    expect(attemptsToMatch(0.9, 0.5)).toBe(1);
    expect(attemptsToMatch(0.9, 0)).toBe(1);
  });
});
