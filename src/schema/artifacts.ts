import { z } from "zod";

export const SkillEntrySchema = z.object({
  // Backward-compatible fields kept so older skills indexes still validate.
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.string().optional(),
  path: z.string().optional(),
  required: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  // UH-6 skill format fields.
  id: z.string().min(1).optional(),
  triggers: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
});

export const SkillFrontmatterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  triggers: z.array(z.string()).optional().default([]),
  prerequisites: z.array(z.string()).optional().default([]),
  related: z.array(z.string()).optional().default([]),
}).strict();

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

export const AcceptanceCriterionResultSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  status: VerificationStatusSchema,
  severity: z.enum(["block", "warn"]),
  check_command: z.string().optional(),
  exit_code: z.number().int().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  stdout_snippet: z.string().optional(),
  stderr_snippet: z.string().optional(),
});

export const VerificationResultSchema = z.object({
  schema_version: z.literal("uh.verification-result.v0"),
  mission_id: z.string().min(1),
  status: VerificationStatusSchema,
  checks: z.array(VerificationCheckSchema),
  findings: z.array(VerificationFindingSchema).optional(),
  approvals: z.array(VerificationApprovalSchema).optional(),
  acceptance_criteria: z.array(AcceptanceCriterionResultSchema).optional(),
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

/**
 * Final structured outcome of a runtime adapter invocation.
 *
 * Boring on purpose: just enough to point a reviewer at the captured
 * stdout/stderr/diff and tell them whether the run passed, failed, was
 * blocked (e.g. missing/malformed result block from the model), or was
 * cancelled. Adapters compile this from runner output and persist it as
 * `runtime-result.yaml` next to the other mission artifacts.
 *
 * Status mapping:
 *  - `passed`    : runtime exited 0 AND emitted a valid runtime-result block.
 *  - `failed`    : runtime spawn error, timeout, or non-zero exit.
 *  - `blocked`   : runtime exited 0 but did not emit a parseable result block.
 *  - `cancelled` : explicitly cancelled by the harness (reserved).
 */
export const RuntimeResultStatusSchema = z.enum(["passed", "failed", "blocked", "cancelled"]);

/**
 * UH-76 three-verdict overlay on top of the binary runtime-result status.
 *
 * - `pass` — runtime succeeded and human review is comfortable signing off.
 * - `needs-attention` — runtime succeeded but a reviewer flagged risk worth
 *   addressing before promotion. Non-blocking; serves as a paper trail.
 * - `needs-remediation` — work must change before this can move on.
 *
 * `recorded_by: "auto"` lets adapters/heuristics seed a default verdict;
 * `recorded_by: "manual"` is the human override. Non-pass manual verdicts
 * MUST carry a rationale so the audit trail explains the call.
 */
export const VerdictValueSchema = z.enum(["pass", "needs-attention", "needs-remediation"]);
export const VerdictRecordedBySchema = z.enum(["auto", "manual"]);

export const RuntimeResultVerdictSchema = z.object({
  value: VerdictValueSchema,
  rationale: z.string(),
  recorded_by: VerdictRecordedBySchema,
  recorded_at: z.string().min(1),
}).strict().superRefine((verdict, ctx) => {
  if (verdict.recorded_by === "manual" && verdict.value !== "pass" && verdict.rationale.trim().length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "Manual non-pass verdicts require a non-empty rationale",
      path: ["rationale"],
    });
  }
});

export const RuntimeResultSchema = z.object({
  schema_version: z.literal("uh.runtime-result.v0"),
  mission_id: z.string().min(1),
  runtime: z.string().min(1),
  status: RuntimeResultStatusSchema,
  started_at: z.string().min(1),
  finished_at: z.string().min(1),
  exit_code: z.number().int().optional(),
  prompt_path: z.string().min(1),
  stdout_path: z.string().min(1),
  stderr_path: z.string().min(1),
  diff_path: z.string().min(1).optional(),
  errors: z.array(z.string()).default([]),
  notes: z.string().optional(),
  verdict: RuntimeResultVerdictSchema.optional(),
}).strict();

export type SkillsIndexDocument = z.infer<typeof SkillsIndexSchema>;
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type SandboxesIndexDocument = z.infer<typeof SandboxesIndexSchema>;
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;
export type VerificationResultDocument = z.infer<typeof VerificationResultSchema>;
export type PromotionDocument = z.infer<typeof PromotionSchema>;
export type RuntimeSessionDocument = z.infer<typeof RuntimeSessionSchema>;
export type RuntimeSessionStatus = z.infer<typeof RuntimeSessionStatusSchema>;
export type RuntimeResultStatus = z.infer<typeof RuntimeResultStatusSchema>;
export type RuntimeResultDocument = z.infer<typeof RuntimeResultSchema>;
export type VerdictValue = z.infer<typeof VerdictValueSchema>;
export type VerdictRecordedBy = z.infer<typeof VerdictRecordedBySchema>;
export type RuntimeResultVerdict = z.infer<typeof RuntimeResultVerdictSchema>;

export function validateSkillsIndex(data: unknown): SkillsIndexDocument {
  return SkillsIndexSchema.parse(data);
}

export function validateSkillFrontmatter(data: unknown): SkillFrontmatter {
  return SkillFrontmatterSchema.parse(data);
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

export function validateRuntimeResult(data: unknown): RuntimeResultDocument {
  return RuntimeResultSchema.parse(data);
}
