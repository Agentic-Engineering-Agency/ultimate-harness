import { z } from "zod";

export const AdapterConfigSchema = z.object({
  cli_command: z.string().min(1).optional(),
  default_toolsets: z.array(z.string()).optional().default([]),
  default_provider: z.string().optional().default(""),
  default_model: z.string().optional().default(""),
  worktree_mode: z.boolean().optional().default(false),
  pass_session_id: z.boolean().optional().default(true),
  runtime_config: z.record(z.string(), z.unknown()).optional().default({}),
});

export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;

export const AdapterSchema = z.object({
  schema_version: z.literal("uh.adapter.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  runtime: z.string().min(1),
  capabilities: z.array(z.string()).optional().default([]),
  status: z.enum(["active", "experimental", "deprecated"]).default("active"),
  config: AdapterConfigSchema.optional(),
});

export type AdapterDocument = z.infer<typeof AdapterSchema>;

export function validateAdapter(data: unknown): AdapterDocument {
  return AdapterSchema.parse(data);
}
