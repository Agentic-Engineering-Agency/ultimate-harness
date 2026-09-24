import { z } from "zod";
import { TEAM_ADAPTER_IDS } from "./mission.js";
import {
  RuntimeLimitsSchema,
  RuntimeRecoveryPolicySchema,
  ToolGuardFieldsSchema,
} from "./runtime-control.js";

const SafeIdentifierSchema = z
  .string()
  .min(1, { message: "id must not be empty" })
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: "id must start with [a-zA-Z0-9] and use only [a-zA-Z0-9._-]",
  })
  .refine((id) => id !== "." && id !== "..", {
    message: "id must not be '.' or '..'",
  });

export const SessionTemplateTierSchema = z.enum(["low-cost", "balanced", "exhaustive"]);
export type SessionTemplateTier = z.infer<typeof SessionTemplateTierSchema>;

export const SessionTemplateContainmentSchema = z.enum(["standard", "strict"]);
export type SessionTemplateContainment = z.infer<typeof SessionTemplateContainmentSchema>;

export const SessionTemplateLimitsSchema = RuntimeLimitsSchema.omit({ memory_mb: true }).strict();
export type SessionTemplateLimits = z.infer<typeof SessionTemplateLimitsSchema>;

export const SessionTemplateSchema = z
  .object({
    schema_version: z.literal("uh.session-template.v0"),
    id: SafeIdentifierSchema,
    title: z.string().min(1),
    tier: SessionTemplateTierSchema,
    containment: SessionTemplateContainmentSchema.default("standard"),
    adapter: z.enum(TEAM_ADAPTER_IDS),
    runtime_config_overrides: z.record(z.string(), z.unknown()).default({}),
    limits: SessionTemplateLimitsSchema.default({}),
    recovery: RuntimeRecoveryPolicySchema.optional(),
    guard: ToolGuardFieldsSchema.optional(),
    attempts: z.number().int().min(1).max(8).default(1),
    notes: z.string().optional(),
  })
  .strict();

export type SessionTemplate = z.infer<typeof SessionTemplateSchema>;
export type SessionTemplateInput = z.input<typeof SessionTemplateSchema>;

export function validateSessionTemplate(data: unknown): SessionTemplate {
  return SessionTemplateSchema.parse(data);
}
