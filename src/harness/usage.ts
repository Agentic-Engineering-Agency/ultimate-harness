/**
 * Token-usage capture for runtime events (prerequisite for cost-forecast and
 * the dashboard cost gauge).
 *
 * Adapters emit a `runtime.usage` event per run. Where the runtime reports real
 * token counts (e.g. hermes-proxy returns OpenAI-style `usage`), `source` is
 * "runtime". Where it does not (codex CLI, hermes CLI, oh-my-pi), we record a
 * deterministic estimate from prompt/output character length tagged
 * `source: "estimated"` so downstream consumers can weight or label it.
 */

export type UsageSource = "runtime" | "estimated";

export interface RuntimeUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  source: UsageSource;
  model?: string;
}

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
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    total_tokens: usage.total_tokens,
    source: usage.source,
  };
  if (usage.model) event.model = usage.model;
  return event;
}
