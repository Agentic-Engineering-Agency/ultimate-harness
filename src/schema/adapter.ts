import { z } from "zod";

/**
 * Adapter manifest schema with per-runtime runtime_config validation.
 *
 * Two-step validation:
 *  1. Parse the envelope (shared fields, loose runtime_config) against
 *     `RawAdapterSchema`.
 *  2. Look up a runtime-specific schema in `runtimeConfigRegistry` (populated
 *     by each adapter module at import time) and strictly validate the
 *     manifest's `config.runtime_config` against it. Strict means typos like
 *     `sandbox_modd` raise a Zod error instead of being silently dropped.
 *
 * Runtimes without a registered schema (design-only stubs such as
 * `claude-code` and `pi`) keep the loose record shape so their manifests
 * still validate while no adapter module exists.
 */

export const BaseAdapterConfigSchema = z.object({
  cli_command: z.string().min(1).optional(),
  default_toolsets: z.array(z.string()).optional().default([]),
  default_provider: z.string().optional().default(""),
  default_model: z.string().optional().default(""),
  worktree_mode: z.boolean().optional().default(false),
  pass_session_id: z.boolean().optional().default(true),
  runtime_config: z.record(z.string(), z.unknown()).optional().default({}),
});

export type AdapterConfig = z.infer<typeof BaseAdapterConfigSchema>;
// Retained for backwards compatibility with consumers importing the old name.
export const AdapterConfigSchema = BaseAdapterConfigSchema;

const RawAdapterSchema = z.object({
  schema_version: z.literal("uh.adapter.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  runtime: z.string().min(1),
  capabilities: z.array(z.string()).optional().default([]),
  status: z.enum(["active", "experimental", "deprecated"]).default("active"),
  config: BaseAdapterConfigSchema.optional(),
});

export type AdapterDocument = z.infer<typeof RawAdapterSchema>;

const runtimeConfigRegistry = new Map<string, z.ZodTypeAny>();

/**
 * Register a strict Zod schema for a runtime's `config.runtime_config` bucket.
 *
 * Adapter modules call this at import time. The schema MUST be `.strict()` so
 * unknown keys (typos) raise a validation error instead of being dropped.
 * Re-registering replaces the previous entry.
 */
export function registerRuntimeConfigSchema(runtime: string, schema: z.ZodTypeAny): void {
  runtimeConfigRegistry.set(runtime, schema);
}

/** Test helper: clear all registered schemas. NEVER call from production code. */
export function _clearRuntimeConfigRegistry(): void {
  runtimeConfigRegistry.clear();
}

/** Returns the registered schema for a runtime, or undefined when none is registered. */
export function getRuntimeConfigSchema(runtime: string): z.ZodTypeAny | undefined {
  return runtimeConfigRegistry.get(runtime);
}

export function validateAdapter(data: unknown): AdapterDocument {
  const parsed = RawAdapterSchema.parse(data);
  const schema = runtimeConfigRegistry.get(parsed.runtime);
  if (!schema || !parsed.config) {
    return parsed;
  }
  const runtimeConfig = parsed.config.runtime_config ?? {};
  let validated: unknown;
  try {
    validated = schema.parse(runtimeConfig);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? `config.runtime_config.${issue.path.join(".")}` : "config.runtime_config";
          return `${path}: ${issue.message}`;
        })
        .join("; ");
      throw new Error(`Adapter runtime_config validation failed for runtime "${parsed.runtime}": ${issues}`);
    }
    throw err;
  }
  parsed.config.runtime_config = validated as Record<string, unknown>;
  return parsed;
}
