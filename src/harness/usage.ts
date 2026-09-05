/**
 * Token-usage capture for runtime events (prerequisite for cost-forecast and
 * the dashboard cost gauge).
 *
 * Adapters emit a `runtime.usage` event per run. Where the runtime reports real
 * token counts, `source` is "runtime". Adapters that cannot report usage may
 * omit the event; consumers must preserve unknown facts rather than replacing
 * them with an estimate.
 */
import { RuntimeUsageSchema } from "../schema/artifacts.js";
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

/**
 * Extract real usage from an OpenAI-style `usage` object
 * (`{ prompt_tokens, completion_tokens, total_tokens }`). Returns null when the
 * shape is absent or carries no token counts so callers can fall back to
 * {@link estimateUsage}.
 */
export function usageFromOpenAI(usage: unknown, model?: string): RuntimeUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const input = typeof u.prompt_tokens === "number" ? u.prompt_tokens : undefined;
  const output = typeof u.completion_tokens === "number" ? u.completion_tokens : undefined;
  if (input === undefined && output === undefined) return null;
  const i = input ?? 0;
  const o = output ?? 0;
  const total = typeof u.total_tokens === "number" ? u.total_tokens : i + o;
  const result: RuntimeUsage = { input_tokens: i, output_tokens: o, total_tokens: total, source: "runtime" };
  if (model) result.model = model;
  return result;
}

/**
 * Extract real usage from an Anthropic Messages-API `usage` object
 * (`{ input_tokens, output_tokens }`). Returns null when the shape is absent or
 * carries no token counts so callers can fall back to {@link estimateUsage}.
 */
export function usageFromAnthropic(usage: unknown, model?: string): RuntimeUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  if (input === undefined && output === undefined) return null;
  const i = input ?? 0;
  const o = output ?? 0;
  const result: RuntimeUsage = { input_tokens: i, output_tokens: o, total_tokens: i + o, source: "runtime" };
  if (model) result.model = model;
  return result;
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
  return event;
}
