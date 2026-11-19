import { z } from "zod";

export const DecisionKindSchema = z.enum([
  "runtime-selection",
  "acceptance",
  "scope-change",
  "review-escalation",
  "retry-stop",
]);

export const DecisionStatusSchema = z.enum([
  "applied",
  "advisory",
  "awaiting-human",
  "denied",
  "unavailable",
  "malformed",
  "uncertain",
]);

export const DecisionProviderStatusSchema = z.enum([
  "not-requested",
  "disabled",
  "available",
  "unavailable",
  "malformed",
  "uncertain",
]);

export const DecisionAuthorizerSchema = z.enum(["none", "deterministic", "jev", "human", "shadow"]);

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase SHA-256 digest");

export const RuntimeSelectionRecommendationSchema = z.object({
  kind: z.literal("runtime-selection"),
  runtime: z.string().min(1),
  model: z.string().min(1).optional(),
}).strict();

export const AcceptanceRecommendationSchema = z.object({
  kind: z.literal("acceptance"),
  outcome: z.enum(["pass", "needs-attention", "needs-remediation"]),
}).strict();

export const ScopeChangeRecommendationSchema = z.object({
  kind: z.literal("scope-change"),
  outcome: z.enum(["approve", "reject", "needs-human"]),
}).strict();

export const ReviewEscalationRecommendationSchema = z.object({
  kind: z.literal("review-escalation"),
  outcome: z.enum(["continue", "escalate", "stop"]),
}).strict();

export const RetryStopRecommendationSchema = z.object({
  kind: z.literal("retry-stop"),
  outcome: z.enum(["retry", "stop", "defer"]),
}).strict();

/** The provider outcome kinds the shadow loop watchdog may record. */
export const LoopWatchdogOutcomeSchema = z.enum(["ok", "disabled", "unavailable", "malformed"]);

/** The deterministic, model-free loop signals recorded alongside an evaluation. */
export const LoopWatchdogSignalsSchema = z.object({
  identical_repeats: z.number().int().nonnegative(),
  alternating_pairs: z.number().int().nonnegative(),
  distinct_targets: z.number().int().nonnegative(),
}).strict();

/** One typed provider answer, reduced to the fields the probe is allowed to publish. */
export const LoopWatchdogAnswerSchema = z.object({
  noul: z.number().min(0).max(1).optional(),
  choice: z.string().optional(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
}).strict();

export const DecisionRecommendationSchema = z.discriminatedUnion("kind", [
  RuntimeSelectionRecommendationSchema,
  AcceptanceRecommendationSchema,
  ScopeChangeRecommendationSchema,
  ReviewEscalationRecommendationSchema,
  RetryStopRecommendationSchema,
]);

export const DecisionProviderSchema = z.object({
  name: z.literal("typesafe"),
  model: z.string().min(1).optional(),
  latency_ms: z.number().int().nonnegative().optional(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict();

export const DecisionStateTransitionSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  unlocked: z.array(z.string().min(1).max(120)).max(8),
}).strict();

export const DecisionReceiptSchema = z.object({
  schema_version: z.literal("uh.decision-receipt.v0"),
  decision_id: z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/),
  mission_id: z.string().min(1),
  run_id: z.string().min(1).optional(),
  kind: DecisionKindSchema,
  status: DecisionStatusSchema,
  provider_status: DecisionProviderStatusSchema,
  authorizer: DecisionAuthorizerSchema,
  applied: z.boolean(),
  deterministic_fallback: z.boolean().optional(),
  human_required: z.boolean(),
  confidence: z.number().finite().min(0).max(1).optional(),
  recommendation: DecisionRecommendationSchema.optional(),
  provider: DecisionProviderSchema.optional(),
  input_sha256: DigestSchema,
  response_sha256: DigestSchema.optional(),
  reason: z.string().min(1).max(500),
  state_transition: DecisionStateTransitionSchema,
  created_at: z.string().datetime({ offset: true }),
  /** Shadow loop-watchdog fields. Optional and strict: existing records are unchanged. */
  loop_signals: LoopWatchdogSignalsSchema.optional(),
  provider_outcome: LoopWatchdogOutcomeSchema.optional(),
  answers: z.record(z.string(), LoopWatchdogAnswerSchema).optional(),
}).strict();

export type DecisionKind = z.infer<typeof DecisionKindSchema>;
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;
export type DecisionProviderStatus = z.infer<typeof DecisionProviderStatusSchema>;
export type DecisionAuthorizer = z.infer<typeof DecisionAuthorizerSchema>;
export type DecisionRecommendation = z.infer<typeof DecisionRecommendationSchema>;
export type DecisionReceipt = z.infer<typeof DecisionReceiptSchema>;
export type DecisionProvider = z.infer<typeof DecisionProviderSchema>;
export type LoopWatchdogOutcome = z.infer<typeof LoopWatchdogOutcomeSchema>;
export type LoopWatchdogSignals = z.infer<typeof LoopWatchdogSignalsSchema>;
export type LoopWatchdogAnswer = z.infer<typeof LoopWatchdogAnswerSchema>;

export function validateDecisionReceipt(data: unknown): DecisionReceipt {
  return DecisionReceiptSchema.parse(data);
}
