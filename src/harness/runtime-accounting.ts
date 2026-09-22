import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { RuntimeResultSchema, type RuntimeResultDocument } from "../schema/artifacts.js";
import { RuntimeRecoveryRecordSchema } from "../schema/runtime-control.js";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId } from "./run-id.js";
import { aggregateRuntimeUsage, isUsageNumber, type RuntimeAccountingFacts, type RuntimeUsage } from "./usage.js";

/** Account for each recorded native recovery attempt once, including failures and missing measurements. */
export async function readRuntimeAccounting(root: string, missionId: string, runIds: string[]): Promise<{ facts: RuntimeAccountingFacts; attemptRunIds: string[]; receipts: Array<{ runId: string; digest: string }> }> {
  assertSafeMissionId(missionId);
  const missionDir = path.join(root, ".harness", "missions", missionId);
  const seen = new Set<string>();
  const results: Array<RuntimeResultDocument | undefined> = [];
  const receipts: Array<{ runId: string; digest: string }> = [];
  for (const initialRunId of runIds) {
    let runId: string | undefined = initialRunId;
    const chain = new Set<string>();
    while (runId) {
      assertValidRunId(runId);
      if (chain.has(runId)) throw new Error("Circular runtime recovery lineage");
      chain.add(runId);
      if (seen.has(runId)) break;
      seen.add(runId);
      const directory = path.join(missionDir, "runs", runId);
      const resultPath = path.join(directory, "runtime-result.yaml");
      const recoveryPath = path.join(directory, "runtime-recovery.json");
      for (const file of [directory, resultPath, recoveryPath]) await assertWritableArtifact(missionDir, file);
      try {
        const raw = await readFile(resultPath, "utf8");
        const result = RuntimeResultSchema.parse(parse(raw));
        if (result.mission_id !== missionId) throw new Error("Runtime accounting identity mismatch");
        results.push(result);
        receipts.push({ runId, digest: `sha256:${createHash("sha256").update(raw).digest("hex")}` });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        results.push(undefined);
      }
      try {
        const recovery = RuntimeRecoveryRecordSchema.parse(JSON.parse(await readFile(recoveryPath, "utf8")));
        runId = recovery.source_run_id;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        runId = undefined;
      }
    }
  }
  return { facts: aggregateRuntimeUsage(results), attemptRunIds: [...seen], receipts };
}

/* -------------------------------------------------------------------------- */
/* Cost provenance                                                            */
/* -------------------------------------------------------------------------- */

/** Where a run's cost came from, or why it is unknown. */
export type ResolvedRunCost = {
  cost_usd?: number;
  cost_source?: "reported" | "estimated";
  cost_unknown_reason?: string;
};

/** What a run's native event stream discloses about tokens and price. */
export type NativeCostFacts = {
  /** Per-request token sums, present only for counters the stream reported for every request. */
  usage?: RuntimeUsage;
  /** A USD amount the stream itself reported, when it carried one. */
  reported_cost_usd?: number;
  /** The model the stream attributed usage to, when it named exactly one. */
  model?: string;
  /** True when at least one native event carried a usage object. */
  token_counts?: boolean;
};

/** Command Code names token counters in camelCase; canonical usage uses snake_case. */
const TOKEN_FIELDS = [
  { canonical: "input_tokens", aliases: ["inputTokens", "input_tokens"] },
  { canonical: "output_tokens", aliases: ["outputTokens", "output_tokens"] },
  { canonical: "cache_read_tokens", aliases: ["cacheReadTokens", "cache_read_tokens"] },
  { canonical: "cache_write_tokens", aliases: ["cacheWriteTokens", "cache_write_tokens"] },
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function firstNumber(record: Record<string, unknown> | undefined, keys: readonly string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (isUsageNumber(value)) return value;
  }
  return undefined;
}

/** The usage object an event may carry at the top level, on its message, or on its result. */
function usageObjectOf(event: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(event.usage) ?? asRecord(asRecord(event.message)?.usage) ?? asRecord(asRecord(event.result)?.usage);
}

/**
 * Reduce a native event stream to the tokens and price it discloses.
 *
 * Real Command Code streams carry a `model_request_end` event per request with
 * `usage.inputTokens` and friends and no price anywhere; the reduced fixtures
 * under `tests/fixtures/runtime-events/` (and the acceptance "costless" wrapper)
 * carry no usage at all. Both cases must stay unknown rather than be priced from
 * a guessed rate.
 */
export function nativeCostFactsFromEvents(lines: Iterable<string>): NativeCostFacts {
  const totals = new Map<string, number>();
  const incomplete = new Set<string>();
  const models = new Set<string>();
  let tokenCounts = false;
  let reportedCost: number | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(trimmed); } catch { continue; }
    const event = asRecord(parsed);
    if (!event) continue;
    const model = typeof event.model === "string" ? event.model : asRecord(event.message)?.model;
    if (typeof model === "string") models.add(model);
    const usage = usageObjectOf(event);
    // A usage object with no token counter (e.g. a terminal record that only
    // carries a price) is not a token measurement and must not invalidate the
    // counters other events reported.
    const counted = usage ? TOKEN_FIELDS.map((field) => [field.canonical, firstNumber(usage, field.aliases)] as const) : [];
    if (counted.some(([, value]) => value !== undefined)) {
      tokenCounts = true;
      for (const [canonical, value] of counted) {
        if (value === undefined) { incomplete.add(canonical); continue; }
        if (!incomplete.has(canonical)) totals.set(canonical, (totals.get(canonical) ?? 0) + value);
      }
    }
    const eventCost = firstNumber(event, ["cost_usd", "total_cost_usd"])
      ?? firstNumber(usage, ["cost_usd", "costUsd", "total_cost_usd"]);
    if (eventCost !== undefined) reportedCost = eventCost;
  }
  const facts: NativeCostFacts = {};
  if (tokenCounts) facts.token_counts = true;
  if (reportedCost !== undefined) facts.reported_cost_usd = reportedCost;
  if (models.size === 1) facts.model = [...models][0];
  const usage: RuntimeUsage = { source: "runtime" };
  for (const field of TOKEN_FIELDS) {
    const total = totals.get(field.canonical);
    if (total !== undefined) (usage as unknown as Record<string, number>)[field.canonical] = total;
  }
  if (Object.keys(usage).length > 1) facts.usage = usage;
  return facts;
}

/** Read a run's native event stream; a missing or unreadable log discloses nothing. */
export async function readNativeCostFacts(runDir: string): Promise<NativeCostFacts> {
  let raw: string;
  try { raw = await readFile(path.join(runDir, "events.ndjson"), "utf8"); }
  catch { return {}; }
  return nativeCostFactsFromEvents(raw.split(/\r?\n/));
}

/**
 * Resolve a run's cost and its provenance. A price the runtime reported is
 * `reported`; a harness-computed amount is `estimated`; when nothing priced the
 * run it stays unknown with a reason — never zero, never a guessed number.
 */
export function resolveRunCost(input: {
  runtime?: string;
  resultCostUsd?: number;
  resultCostBasis?: string;
  native?: NativeCostFacts;
}): ResolvedRunCost {
  if (isUsageNumber(input.resultCostUsd)) {
    return {
      cost_usd: input.resultCostUsd,
      cost_source: input.resultCostBasis === "provider_reported" ? "reported" : "estimated",
    };
  }
  if (isUsageNumber(input.native?.reported_cost_usd)) {
    return { cost_usd: input.native.reported_cost_usd, cost_source: "reported" };
  }
  const model = input.native?.model;
  if (input.native?.token_counts) {
    return { cost_unknown_reason: `native stream reported token counts but no price${model ? ` for ${model}` : ""}` };
  }
  if (input.runtime === "command-code") {
    return { cost_unknown_reason: "command-code native stream carries neither usage counters nor a price" };
  }
  return { cost_unknown_reason: "runtime reported no cost" };
}
