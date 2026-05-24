import { z } from "zod";
import {
  CostClassSchema,
  SandboxCapabilitySchema,
  ToolCapabilitySchema,
  type AdapterCapabilities,
} from "../../schema/adapter-capabilities.js";
import { hermesProxyCapabilities } from "./hermes-proxy.js";

/**
 * UH-103 — forward-looking live capability probe for hermes-proxy.
 *
 * The static manifest ({@link hermesProxyCapabilities}) is the source of truth
 * today; OpenAI-compatible proxies expose `/models` but not a capability
 * document. This probe optimistically fetches `<endpoint>/capabilities` and, if
 * a proxy ever serves a (partial) capability document, merges it over the
 * static manifest. On any failure — 404 today, network error, malformed body —
 * it falls back to the static manifest. Safe to call now; useful later.
 */

export const HermesProxyProbeSchema = z
  .object({
    tools: ToolCapabilitySchema.partial().optional(),
    sandbox: SandboxCapabilitySchema.optional(),
    max_context_tokens: z.number().int().positive().optional(),
    cost_class: CostClassSchema.optional(),
    supports_runtime_config_overrides: z.boolean().optional(),
    supports_cancel: z.boolean().optional(),
    supports_replay: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strip();
export type HermesProxyProbe = z.infer<typeof HermesProxyProbeSchema>;

/** Merge a partial probe document over a base manifest (probe wins per-field). */
export function mergeProbedCapabilities(
  base: AdapterCapabilities,
  probed: HermesProxyProbe,
): AdapterCapabilities {
  return {
    ...base,
    ...(probed.sandbox !== undefined ? { sandbox: probed.sandbox } : {}),
    ...(probed.max_context_tokens !== undefined ? { max_context_tokens: probed.max_context_tokens } : {}),
    ...(probed.cost_class !== undefined ? { cost_class: probed.cost_class } : {}),
    ...(probed.supports_runtime_config_overrides !== undefined
      ? { supports_runtime_config_overrides: probed.supports_runtime_config_overrides }
      : {}),
    ...(probed.supports_cancel !== undefined ? { supports_cancel: probed.supports_cancel } : {}),
    ...(probed.supports_replay !== undefined ? { supports_replay: probed.supports_replay } : {}),
    ...(probed.notes !== undefined ? { notes: probed.notes } : {}),
    tools: probed.tools ? { ...base.tools, ...probed.tools } : base.tools,
  };
}

export interface ProbeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ProbeResult {
  capabilities: AdapterCapabilities;
  /** "probe" when the proxy returned a valid document; "static" on fallback. */
  source: "probe" | "static";
}

export async function probeHermesProxyCapabilities(
  endpoint: string,
  opts: ProbeOptions = {},
): Promise<ProbeResult> {
  const base = hermesProxyCapabilities as AdapterCapabilities;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${endpoint.replace(/\/$/, "")}/capabilities`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return { capabilities: base, source: "static" };
    const json: unknown = await res.json();
    const parsed = HermesProxyProbeSchema.safeParse(json);
    if (!parsed.success) return { capabilities: base, source: "static" };
    return { capabilities: mergeProbedCapabilities(base, parsed.data), source: "probe" };
  } catch {
    return { capabilities: base, source: "static" };
  } finally {
    clearTimeout(timer);
  }
}
