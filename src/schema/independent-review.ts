import { z } from "zod";
import { VerdictValueSchema, VerificationCheckSchema } from "./artifacts.js";

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const EvidenceSchema = z.string().trim().min(1);

export const IndependentReviewBindingSchema = z.object({
  request_path: z.string().min(1),
  request_sha256: DigestSchema,
  report_path: z.string().min(1),
  runtime: z.enum(["oh-my-pi", "command-code", "claude-code"]),
  model: z.string().trim().min(1),
}).strict();
export type IndependentReviewBinding = z.infer<typeof IndependentReviewBindingSchema>;

const ReviewInputFileSchema = z.object({
  original_path: z.string().min(1),
  // `changed` files come from the worker's real diff (git diff --name-only); a
  // deleted file is recorded as `absent`, never `missing`.
  kind: z.enum(["contract", "output", "changed"]),
  state: z.enum(["present", "missing", "absent"]),
  snapshot_path: z.string().min(1).optional(),
  sha256: DigestSchema.optional(),
  verification: VerificationCheckSchema.optional(),
}).strict().superRefine((file, ctx) => {
  if ((file.state === "present") !== (file.snapshot_path !== undefined && file.sha256 !== undefined)) {
    ctx.addIssue({ code: "custom", message: "Present review inputs require a snapshot and digest" });
  }
  if (file.state !== "present" && (file.snapshot_path !== undefined || file.sha256 !== undefined)) {
    ctx.addIssue({ code: "custom", message: "Missing or absent review inputs cannot claim snapshot evidence" });
  }
});

export const IndependentReviewRequestSchema = z.object({
  schema_version: z.literal("uh.independent-review-request.v0"),
  review_id: z.string().min(1),
  sources: z.array(z.object({
    mission_id: z.string().min(1),
  source_root: z.string().min(1),
    files: z.array(ReviewInputFileSchema).min(1),
    reference_paths: z.array(z.string()),
    acceptance: z.array(z.object({ id: z.string().min(1), description: EvidenceSchema }).strict()),
    checks: z.array(z.object({ id: z.string().min(1), description: EvidenceSchema }).strict()),
  }).strict()).min(1),
}).strict().superRefine((request, ctx) => {
  const ids = new Set<string>();
  for (const source of request.sources) {
    if (ids.has(source.mission_id)) ctx.addIssue({ code: "custom", message: "Duplicate review source mission" });
    ids.add(source.mission_id);
    if (source.files.filter(file => file.kind === "contract" && file.state === "present").length !== 1) {
      ctx.addIssue({ code: "custom", message: "Each review source requires exactly one captured contract" });
    }
  }
});
export type IndependentReviewRequest = z.infer<typeof IndependentReviewRequestSchema>;

const ReviewedCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["passed", "failed", "blocked"]),
  evidence: EvidenceSchema,
}).strict();

/** Verified observations that no listed id covers; never graded, never part of the recommendation. */
export const IndependentReviewObservationSchema = z.object({
  title: EvidenceSchema,
  evidence: EvidenceSchema,
  relates_to: z.string().optional(),
  severity: z.enum(["info", "warn"]).optional(),
}).strict();

export const IndependentReviewReportSchema = z.object({
  schema_version: z.literal("uh.independent-review-report.v0"),
  request_sha256: DigestSchema,
  sources: z.array(z.object({
    mission_id: z.string().min(1),
    claims_checked: z.array(z.object({
      claim: EvidenceSchema,
      source: EvidenceSchema,
      observed: EvidenceSchema,
      verdict: z.enum(["supported", "contradicted", "unverified"]),
    }).strict()).min(1),
    acceptance: z.array(ReviewedCheckSchema),
    checks: z.array(ReviewedCheckSchema),
    findings: z.array(z.object({
      severity: z.enum(["error", "warning", "info"]),
      detail: EvidenceSchema,
      evidence: EvidenceSchema,
    }).strict()),
    observations: z.array(IndependentReviewObservationSchema).optional(),
    verdict: VerdictValueSchema,
    reason: EvidenceSchema,
  }).strict()).min(1),
}).strict();
export type IndependentReviewReport = z.infer<typeof IndependentReviewReportSchema>;

/**
 * A reviewer finding preserved on the canonical assessment so the recommendation
 * carries its stated reasons. `source` is the source mission the finding came from.
 */
export const IndependentReviewAssessmentFindingSchema = z.object({
  source: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  detail: EvidenceSchema,
  evidence: EvidenceSchema,
}).strict();

/**
 * A per-claim summary preserved on the canonical assessment. `source` is the
 * source mission the claim came from; `evidence_source` is the claim's own
 * referenced source, copied from the report's `claims_checked[].source`.
 */
export const IndependentReviewAssessmentClaimSchema = z.object({
  source: z.string().min(1),
  claim: EvidenceSchema,
  verdict: z.enum(["supported", "contradicted", "unverified"]),
  evidence_source: EvidenceSchema,
}).strict();

export const IndependentReviewAssessmentSchema = z.object({
  schema_version: z.literal("uh.independent-review-assessment.v0"),
  review_id: z.string().min(1),
  run_id: z.string().min(1),
  request_sha256: DigestSchema,
  recommendation: VerdictValueSchema,
  human_acceptance_required: z.literal(true),
  observations: z.array(IndependentReviewObservationSchema.extend({
    source: z.string().min(1),
  }).strict()).optional(),
  findings: z.array(IndependentReviewAssessmentFindingSchema).optional(),
  claims: z.array(IndependentReviewAssessmentClaimSchema).optional(),
}).strict();
