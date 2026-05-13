import { z } from "zod";

export const SkillEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.string().optional(),
  path: z.string().optional(),
  required: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const SkillsIndexSchema = z.object({
  schema_version: z.literal("uh.skills-index.v0"),
  skills: z.array(SkillEntrySchema),
});

export const SandboxStatusSchema = z.enum([
  "created",
  "running",
  "dirty",
  "verified",
  "promoted",
  "discarded",
]);

export const SandboxEntrySchema = z.object({
  id: z.string().min(1),
  mission_id: z.string().min(1),
  backend: z.string().min(1),
  path: z.string().optional(),
  status: SandboxStatusSchema,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const SandboxesIndexSchema = z.object({
  schema_version: z.literal("uh.sandboxes-index.v0"),
  sandboxes: z.array(SandboxEntrySchema),
});

export const VerificationStatusSchema = z.enum(["passed", "failed", "blocked", "waived"]);

export const VerificationCheckSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  status: VerificationStatusSchema,
  command: z.string().optional(),
  reviewer: z.string().optional(),
  notes: z.string().optional(),
});

export const VerificationFindingSchema = z.object({
  severity: z.string().min(1),
  message: z.string().min(1),
});

export const VerificationApprovalSchema = z.object({
  gate: z.string().min(1),
  status: z.string().min(1),
});

export const VerificationResultSchema = z.object({
  schema_version: z.literal("uh.verification-result.v0"),
  mission_id: z.string().min(1),
  status: VerificationStatusSchema,
  checks: z.array(VerificationCheckSchema),
  findings: z.array(VerificationFindingSchema).optional(),
  approvals: z.array(VerificationApprovalSchema).optional(),
});

export const PromotionSchema = z.object({
  schema_version: z.literal("uh.promotion.v0"),
  mission_id: z.string().min(1),
  sandbox_id: z.string().optional(),
  decision: z.enum(["promoted", "rejected", "deferred"]),
  approved_by: z.string().optional(),
  promoted_at: z.string().optional(),
  changes: z.array(z.string()).optional(),
  audit_event_id: z.string().optional(),
});

export const RuntimeSessionStatusSchema = z.enum(["planned", "running", "succeeded", "failed"]);

export const RuntimeSessionSchema = z.object({
  schema_version: z.literal("uh.runtime-session.v0"),
  mission_id: z.string().min(1),
  runtime: z.string().min(1),
  status: RuntimeSessionStatusSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  exit_code: z.number().int().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  stdout_path: z.string().optional(),
  stderr_path: z.string().optional(),
}).strict();

export type SkillsIndexDocument = z.infer<typeof SkillsIndexSchema>;
export type SandboxesIndexDocument = z.infer<typeof SandboxesIndexSchema>;
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;
export type VerificationResultDocument = z.infer<typeof VerificationResultSchema>;
export type PromotionDocument = z.infer<typeof PromotionSchema>;
export type RuntimeSessionDocument = z.infer<typeof RuntimeSessionSchema>;
export type RuntimeSessionStatus = z.infer<typeof RuntimeSessionStatusSchema>;

export function validateSkillsIndex(data: unknown): SkillsIndexDocument {
  return SkillsIndexSchema.parse(data);
}

export function validateSandboxesIndex(data: unknown): SandboxesIndexDocument {
  return SandboxesIndexSchema.parse(data);
}

export function validateVerificationResult(data: unknown): VerificationResultDocument {
  return VerificationResultSchema.parse(data);
}

export function validatePromotion(data: unknown): PromotionDocument {
  return PromotionSchema.parse(data);
}

export function validateRuntimeSession(data: unknown): RuntimeSessionDocument {
  return RuntimeSessionSchema.parse(data);
}
