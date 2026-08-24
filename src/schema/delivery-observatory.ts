import { z } from "zod";

export const DELIVERY_OBSERVATORY_CONTRACT_VERSION = "delivery-observatory.v1" as const;
export const DELIVERY_OBSERVATORY_REDACTION_VERSION = "delivery-observatory-redaction.v1" as const;

const AssertionSchema = z.enum(["observed", "inferred", "proposed", "unknown"]);
const FreshnessSchema = z.enum(["fresh", "stale", "expired", "unknown"]);
const OperationSchema = z.enum([
  "queued", "active", "blocked", "awaiting_human", "succeeded", "failed", "cancelled", "uncertain", "unknown",
]);
const RiskSchema = z.enum(["low", "medium", "high", "critical", "unknown"]);

export const ObservatoryUnknownValueSchema = z.object({
  state: z.literal("unknown"),
  reason_code: z.enum([
    "not_reported", "unsupported", "unauthorized", "stale_source", "conflicting_sources", "not_comparable",
  ]),
}).strict();

export const ObservatoryKnownValueSchema = z.object({
  state: z.literal("known"),
  value: z.union([z.string(), z.number(), z.boolean()]),
  method: z.enum(["measured", "reported", "derived", "estimated"]),
  evidence_refs: z.array(z.string()),
}).strict();

export const ObservatoryValueSchema = z.discriminatedUnion("state", [
  ObservatoryKnownValueSchema,
  ObservatoryUnknownValueSchema,
]);

const FactStateSchema = z.object({
  assertion: AssertionSchema,
  freshness: FreshnessSchema,
  observed_at: z.string().nullable(),
}).strict();

export const ObservatorySourceSchema = z.object({
  source_id: z.string(),
  adapter_id: z.string(),
  producer: z.string(),
  transport: z.enum(["live_stream", "live_poll", "filesystem", "snapshot"]),
  health: z.enum(["reachable", "degraded", "unavailable", "unauthorized"]),
  observed_at: z.string().nullable(),
  ingested_at: z.string(),
  freshness: FreshnessSchema,
  stale_after_ms: z.number().int().nonnegative().nullable(),
  coverage: z.enum(["complete", "partial", "unknown"]),
  omitted_fields: z.number().int().nonnegative(),
  rejected_records: z.number().int().nonnegative(),
  unavailable_capabilities: z.array(z.string()),
}).strict();

export const ObservatoryWorkItemSchema = z.object({
  work_item_id: z.string(),
  source_id: z.string(),
  project_ref: z.string(),
  safe_title: z.string().max(160),
  phase: z.enum(["discovery", "design", "plan", "execute", "review", "verify", "integrate", "release", "unknown"]),
  operation: OperationSchema,
  state: FactStateSchema,
  elapsed_ms: z.number().int().nonnegative().nullable(),
  owner_agent_ref: z.string().nullable(),
  requested_model: ObservatoryValueSchema,
  resolved_model: ObservatoryValueSchema,
  provider: ObservatoryValueSchema,
  harness: ObservatoryValueSchema,
  adapter: ObservatoryValueSchema,
  reasoning_effort: ObservatoryValueSchema,
  cost: ObservatoryValueSchema,
  tokens: ObservatoryValueSchema,
  latency_ms: ObservatoryValueSchema,
  blocker_refs: z.array(z.string()),
  attention_refs: z.array(z.string()),
  last_evidence_ref: z.string().nullable(),
  risk: RiskSchema,
}).strict();

export const ObservatoryAgentSchema = z.object({
  agent_id: z.string(),
  safe_name: z.string().max(80),
  roles: z.array(z.enum(["planner", "executor", "reviewer", "integrator", "judge"])),
  family_profile_ref: z.string().nullable(),
  operation: OperationSchema,
  state: FactStateSchema,
}).strict();

export const ObservatoryDecisionSchema = z.object({
  decision_id: z.string(),
  kind: z.enum(["question", "human_gate", "scope_change"]),
  safe_question: z.string().max(220),
  authority_label: z.string().max(80),
  authority_href: z.string().url().nullable(),
  state: z.enum(["open", "awaiting_answer", "decided", "dismissed", "expired"]),
  risk: RiskSchema,
  opened_at: z.string().nullable(),
  affected_work_item_refs: z.array(z.string()),
  fact: FactStateSchema,
}).strict();

export const ObservatoryEvidenceSchema = z.object({
  evidence_id: z.string(),
  kind: z.enum(["plan", "diagram", "adr", "story", "test", "review", "deployment_receipt", "route_receipt", "other"]),
  safe_title: z.string().max(160),
  project_ref: z.string(),
  digest: z.string().nullable(),
  media_type: z.string().nullable(),
  observed_at: z.string().nullable(),
  classification: z.enum(["public", "internal", "restricted"]),
  availability: z.enum(["available", "missing", "withheld", "unknown"]),
}).strict();

export const ObservatoryEventSchema = z.object({
  event_id: z.string(),
  kind: z.enum(["decision", "dispatch", "review", "gate", "test", "artifact", "failure", "status_change"]),
  occurred_at: z.string().nullable(),
  safe_summary: z.string().max(180),
  work_item_ref: z.string().nullable(),
  evidence_refs: z.array(z.string()),
  state: FactStateSchema,
}).strict();

export const ObservatoryMetricSchema = z.object({
  metric_id: z.string(),
  family: z.enum(["cost", "tokens", "latency", "quality", "rework", "acceptance", "dora", "product", "pareto"]),
  safe_label: z.string().max(120),
  task_shape_ref: z.string().nullable(),
  value: ObservatoryValueSchema,
  unit: z.string(),
  coverage: z.enum(["complete", "partial", "unknown"]),
}).strict();

export const DeliveryObservatorySnapshotSchema = z.object({
  contract_version: z.literal(DELIVERY_OBSERVATORY_CONTRACT_VERSION),
  snapshot_id: z.string(),
  generated_at: z.string(),
  projection_status: z.enum(["ready", "partial", "blocked"]),
  window: z.object({ from: z.string().nullable(), to: z.string() }).strict(),
  redaction: z.object({
    policy_version: z.literal(DELIVERY_OBSERVATORY_REDACTION_VERSION),
    fields_omitted: z.number().int().nonnegative(),
    records_rejected: z.number().int().nonnegative(),
  }).strict(),
  sources: z.array(ObservatorySourceSchema),
  projects: z.array(z.object({ project_id: z.string(), safe_name: z.string().max(120) }).strict()),
  work_items: z.array(ObservatoryWorkItemSchema),
  agents: z.array(ObservatoryAgentSchema),
  events: z.array(ObservatoryEventSchema),
  decisions: z.array(ObservatoryDecisionSchema),
  evidence: z.array(ObservatoryEvidenceSchema),
  metrics: z.array(ObservatoryMetricSchema),
}).strict();

export type ObservatoryValue = z.infer<typeof ObservatoryValueSchema>;
export type DeliveryObservatorySnapshot = z.infer<typeof DeliveryObservatorySnapshotSchema>;

export function validateDeliveryObservatorySnapshot(data: unknown): DeliveryObservatorySnapshot {
  return DeliveryObservatorySnapshotSchema.parse(data);
}
