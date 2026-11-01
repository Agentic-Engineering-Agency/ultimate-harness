/**
 * Token-usage capture for runtime events (prerequisite for cost-forecast and
 * the dashboard cost gauge).
 *
 * Adapters emit a `runtime.usage` event per run. Where the runtime reports real
 * token counts, `source` is "runtime". Adapters that cannot report usage may
 * omit the event; consumers must preserve unknown facts rather than replacing
 * them with an estimate.
 */
import { RuntimeUsageSchema, type RuntimeResultDocument, type RuntimePricing } from "../schema/artifacts.js";
import type { infer as Infer } from "zod";

export type RuntimeUsage = Infer<typeof RuntimeUsageSchema>;
export type UsageSource = RuntimeUsage["source"];

/** ~4 characters per token — the standard rough heuristic for English/code. */
const CHARS_PER_TOKEN = 4;

function tokensFromChars(text: string | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Deterministic estimate from prompt + output text. */
export function estimateUsage(promptText: string | undefined, outputText: string | undefined): RuntimeUsage {
  const input = tokensFromChars(promptText);
  const output = tokensFromChars(outputText);
  return { input_tokens: input, output_tokens: output, total_tokens: input + output, source: "estimated" };
}

export function isUsageNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Extract real usage from an OpenAI-style `usage` object
 * (`{ prompt_tokens, completion_tokens, total_tokens }`). Returns null when the
 * shape is absent or carries no token counts; missing counters remain unknown.
 */
export function usageFromOpenAI(usage: unknown, model?: string): RuntimeUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const input = isUsageNumber(u.prompt_tokens) ? u.prompt_tokens : undefined;
  const output = isUsageNumber(u.completion_tokens) ? u.completion_tokens : undefined;
  const total = isUsageNumber(u.total_tokens) ? u.total_tokens
    : input !== undefined && output !== undefined ? input + output : undefined;
  if (input === undefined && output === undefined && total === undefined) return null;
  return { source: "runtime", input_tokens: input, output_tokens: output, total_tokens: total, ...(model ? { model } : {}) };
}

/**
 * Extract real usage from an Anthropic Messages-API `usage` object
 * (`{ input_tokens, output_tokens }`). Returns null when the shape is absent or
 * carries no token counts; missing counters remain unknown.
 */
export function usageFromAnthropic(usage: unknown, model?: string): RuntimeUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const input = isUsageNumber(u.input_tokens) ? u.input_tokens : undefined;
  const output = isUsageNumber(u.output_tokens) ? u.output_tokens : undefined;
  const cacheRead = isUsageNumber(u.cache_read_input_tokens) ? u.cache_read_input_tokens : undefined;
  const cacheWrite = isUsageNumber(u.cache_creation_input_tokens) ? u.cache_creation_input_tokens : undefined;
  if (input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined) return null;
  const total = input !== undefined && output !== undefined && cacheRead !== undefined && cacheWrite !== undefined
    ? input + output + cacheRead + cacheWrite : undefined;
  return { source: "runtime", input_tokens: input, output_tokens: output, total_tokens: total,
    cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite, ...(model ? { model } : {}) };
}

/** Build a `runtime.usage` NDJSON event payload. */
export function buildUsageEvent(
  runtime: string,
  missionId: string,
  usage: RuntimeUsage,
  timestamp: string,
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event: "runtime.usage",
    timestamp,
    runtime,
    mission_id: missionId,
    source: usage.source,
  };
  if (usage.input_tokens !== undefined) event.input_tokens = usage.input_tokens;
  if (usage.output_tokens !== undefined) event.output_tokens = usage.output_tokens;
  if (usage.total_tokens !== undefined) event.total_tokens = usage.total_tokens;
  if (usage.model) event.model = usage.model;
  if (usage.provider) event.provider = usage.provider;
  if (usage.cache_read_tokens !== undefined) event.cache_read_tokens = usage.cache_read_tokens;
  if (usage.cache_write_tokens !== undefined) event.cache_write_tokens = usage.cache_write_tokens;
  if (usage.cost_usd !== undefined) event.cost_usd = usage.cost_usd;
  if (usage.cost_basis) event.cost_basis = usage.cost_basis;
  return event;
}

export type RuntimeAccountingFacts = Pick<RuntimeResultDocument, "provider" | "model" | "usage" | "cost_usd" | "cost_basis">;

/** Sum only complete measurements; heterogeneous routes do not erase known spend. */
export function aggregateRuntimeUsage(results: Array<RuntimeAccountingFacts | undefined>): RuntimeAccountingFacts {
  if (results.length === 0 || results.some(result => !result)) return {};
  const complete = results as RuntimeAccountingFacts[];
  const first = complete[0];
  const facts: RuntimeAccountingFacts = {};
  if (first.provider && complete.every(result => result.provider === first.provider)) facts.provider = first.provider;
  if (first.model && complete.every(result => result.model === first.model)) facts.model = first.model;
  const costs = complete.map(result => result.cost_usd ?? result.usage?.cost_usd);
  if (costs.every(isUsageNumber)) {
    const total = costs.reduce((sum, cost) => sum + cost, 0);
    if (isUsageNumber(total)) {
      facts.cost_usd = total;
      const bases = complete.map(result => result.cost_basis ??
        (result.cost_usd === undefined || result.cost_usd === result.usage?.cost_usd ? result.usage?.cost_basis : undefined));
      if (bases.every(basis => basis !== undefined)) facts.cost_basis = bases.every(basis => basis === bases[0]) ? bases[0] : "mixed";
    }
  }
  const usages = complete.map(result => result.usage);
  if (usages.every((usage): usage is RuntimeUsage => usage !== undefined)) {
    const usage: RuntimeUsage = { source: usages.some(item => item.source === "estimated") ? "estimated" : "runtime" };
    if (facts.provider) usage.provider = facts.provider;
    if (facts.model) usage.model = facts.model;
    let measurements = 0;
    for (const field of ["input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens"] as const) {
      if (usages.every(item => isUsageNumber(item[field]))) {
        const total = usages.reduce((sum, item) => sum + item[field]!, 0);
        if (isUsageNumber(total)) { usage[field] = total; measurements++; }
      }
    }
    if (facts.cost_usd !== undefined) {
      usage.cost_usd = facts.cost_usd;
      usage.cost_basis = facts.cost_basis;
      measurements++;
    }
    if (measurements) facts.usage = usage;
  }
  return facts;
}

/** Price only complete measured counters against the exact observed model. */
export function estimateConfiguredCost(usage: RuntimeUsage, model: string | undefined, pricing: RuntimePricing | undefined): number | undefined {
  if (!pricing || model !== pricing.model || usage.source !== "runtime") return undefined;
  const { input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite } = usage;
  if (!isUsageNumber(input) || !isUsageNumber(output) || !isUsageNumber(cacheRead) || !isUsageNumber(cacheWrite)) return undefined;
  const uncached = input - (pricing.input_includes_cache_read ? cacheRead : 0) - (pricing.input_includes_cache_write ? cacheWrite : 0);
  if (uncached < 0) return undefined;
  const cost = (uncached * pricing.input_usd_per_million + output * pricing.output_usd_per_million
    + cacheRead * pricing.cache_read_usd_per_million + cacheWrite * pricing.cache_write_usd_per_million) / 1_000_000;
  return isUsageNumber(cost) ? cost : undefined;
}
