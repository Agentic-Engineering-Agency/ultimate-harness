import { z } from "zod";

export const COST_CLASSES = {
  free: { input: 0, output: 0 },
  cheap: { input: 0.25, output: 1.0 },
  standard: { input: 3.0, output: 15.0 },
  premium: { input: 15.0, output: 75.0 },
} as const;

export const CostClassSchema = z.enum(["free", "cheap", "standard", "premium"]);
export type CostClass = z.infer<typeof CostClassSchema>;

export const ToolCapabilitySchema = z.object({
  shell: z.boolean(),
  fs_read: z.boolean(),
  fs_write: z.boolean(),
  network: z.boolean(),
  custom: z.array(z.string()).default([]),
});

export const SandboxCapabilitySchema = z.enum([
  "none",
  "agentfs",
  "container",
  "remote-only",
]);

export const AdapterCapabilitiesSchema = z.object({
  schema: z.literal("uh.adapter-capabilities.v0"),
  id: z.string().min(1),
  display_name: z.string(),
  tools: ToolCapabilitySchema,
  sandbox: SandboxCapabilitySchema,
  max_context_tokens: z.number().int().positive(),
  cost_class: CostClassSchema,
  supports_runtime_config_overrides: z.boolean(),
  supports_cancel: z.boolean(),
  supports_replay: z.boolean(),
  notes: z.string().optional(),
});

export type ToolCapability = z.infer<typeof ToolCapabilitySchema>;
export type SandboxCapability = z.infer<typeof SandboxCapabilitySchema>;
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;

export function validateAdapterCapabilities(data: unknown): AdapterCapabilities {
  return AdapterCapabilitiesSchema.parse(data);
}
