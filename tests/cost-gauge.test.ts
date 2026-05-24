import { describe, expect, test } from "vitest";
import {
  aggregateUsage,
  computeGauge,
  costClassForRuntime,
  estimateCostUsd,
  formatUsd,
  type CapabilitiesResponse,
} from "../apps/hermes-plugin/dashboard/src/cost-gauge.js";
import type { LiveEventRow } from "../apps/hermes-plugin/dashboard/src/live-events-utils.js";

function usageRow(input: number, output: number, runtime = "hermes-proxy", id = 1): LiveEventRow {
  return {
    id,
    ts: id,
    line: "",
    severity: "info",
    isUsage: true,
    raw: { event: "runtime.usage", runtime, input_tokens: input, output_tokens: output },
  };
}

function plainRow(id = 99): LiveEventRow {
  return { id, ts: id, line: "x", severity: "info", isUsage: false, raw: { event: "runtime.started" } };
}

const caps: CapabilitiesResponse = {
  adapters: [
    { id: "hermes-proxy", cost_class: "cheap" },
    { id: "codex", cost_class: "standard" },
  ],
  cost_classes: {
    free: { input: 0, output: 0 },
    cheap: { input: 0.25, output: 1.0 },
    standard: { input: 3.0, output: 15.0 },
    premium: { input: 15.0, output: 75.0 },
  },
};

describe("aggregateUsage", () => {
  test("sums usage rows, ignores non-usage, tracks runtime + samples", () => {
    const totals = aggregateUsage([usageRow(100, 50, "codex", 1), plainRow(2), usageRow(200, 100, "codex", 3)]);
    expect(totals).toEqual({ input_tokens: 300, output_tokens: 150, total_tokens: 450, runtime: "codex", samples: 2 });
  });

  test("empty when no usage rows", () => {
    expect(aggregateUsage([plainRow()])).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      runtime: undefined,
      samples: 0,
    });
  });
});

describe("costClassForRuntime / estimateCostUsd / formatUsd", () => {
  test("maps runtime to cost class", () => {
    expect(costClassForRuntime(caps, "codex")).toBe("standard");
    expect(costClassForRuntime(caps, "unknown")).toBeUndefined();
    expect(costClassForRuntime(null, "codex")).toBeUndefined();
  });

  test("prices tokens with a rate", () => {
    expect(estimateCostUsd(1_000_000, 1_000_000, { input: 3, output: 15 })).toBeCloseTo(18, 6);
    expect(estimateCostUsd(100, 50, undefined)).toBeUndefined();
  });

  test("formats USD with small-value precision", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0021)).toBe("$0.0021");
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});

describe("computeGauge", () => {
  test("full view-model with rates", () => {
    const g = computeGauge([usageRow(1_000_000, 1_000_000, "codex")], caps);
    expect(g.totals.total_tokens).toBe(2_000_000);
    expect(g.costClass).toBe("standard");
    expect(g.costUsd).toBeCloseTo(18, 6);
  });

  test("tokens-only when capabilities unavailable", () => {
    const g = computeGauge([usageRow(100, 50, "codex")], null);
    expect(g.totals.input_tokens).toBe(100);
    expect(g.costClass).toBeUndefined();
    expect(g.costUsd).toBeUndefined();
  });
});
