/**
 * UH-96 — per-run token/cost gauge.
 *
 * Pure aggregation over the `runtime.usage` events emitted by adapters
 * (src/harness/usage.ts) plus pricing from the `cost_classes` rate table the
 * backend exposes via `GET /api/uh/adapters/capabilities` (so the $/Mtok rates
 * stay single-sourced in the harness — no duplicated constants here).
 */
import type { LiveEventRow } from "./live-events-utils.js";

export type CostClass = "free" | "cheap" | "standard" | "premium";

export interface CostRate {
  input: number;
  output: number;
}

export interface CapabilitiesResponse {
  adapters: Array<{ id: string; cost_class: CostClass }>;
  cost_classes?: Record<CostClass, CostRate>;
}

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Runtime id from the most recent usage event (maps to a cost class). */
  runtime?: string;
  /** Number of runtime.usage events seen. */
  samples: number;
}

export function aggregateUsage(events: LiveEventRow[]): UsageTotals {
  let input = 0;
  let output = 0;
  let runtime: string | undefined;
  let samples = 0;
  for (const e of events) {
    if (!e.isUsage || !e.raw) continue;
    samples += 1;
    if (typeof e.raw.input_tokens === "number") input += e.raw.input_tokens;
    if (typeof e.raw.output_tokens === "number") output += e.raw.output_tokens;
    if (typeof e.raw.runtime === "string") runtime = e.raw.runtime;
  }
  return { input_tokens: input, output_tokens: output, total_tokens: input + output, runtime, samples };
}

export function costClassForRuntime(
  caps: CapabilitiesResponse | null,
  runtime: string | undefined,
): CostClass | undefined {
  if (!caps || !runtime) return undefined;
  return caps.adapters.find((a) => a.id === runtime)?.cost_class;
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  rate: CostRate | undefined,
): number | undefined {
  if (!rate) return undefined;
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/** Resolve the full gauge view-model from raw events + capabilities. */
export function computeGauge(
  events: LiveEventRow[],
  caps: CapabilitiesResponse | null,
): { totals: UsageTotals; costUsd: number | undefined; costClass: CostClass | undefined } {
  const totals = aggregateUsage(events);
  const costClass = costClassForRuntime(caps, totals.runtime);
  const rate = costClass ? caps?.cost_classes?.[costClass] : undefined;
  const costUsd = estimateCostUsd(totals.input_tokens, totals.output_tokens, rate);
  return { totals, costUsd, costClass };
}
