export type ObservatoryAssertion = "observed" | "inferred" | "proposed" | "unknown";
export type ObservatoryFreshness = "fresh" | "stale" | "expired" | "unknown";
export type ObservatoryOperation = "queued" | "active" | "blocked" | "awaiting_human" | "succeeded" | "failed" | "cancelled" | "uncertain" | "unknown";

export type ObservatoryValue =
  | { state: "known"; value: string | number | boolean; method: "measured" | "reported" | "derived" | "estimated"; evidence_refs: string[] }
  | { state: "unknown"; reason_code: string };

export interface ObservatoryFactState {
  assertion: ObservatoryAssertion;
  freshness: ObservatoryFreshness;
  observed_at: string | null;
}

export interface ObservatorySource {
  source_id: string;
  adapter_id: string;
  producer: string;
  transport: "live_stream" | "live_poll" | "filesystem" | "snapshot";
  health: "reachable" | "degraded" | "unavailable" | "unauthorized";
  observed_at: string | null;
  ingested_at: string;
  freshness: ObservatoryFreshness;
  stale_after_ms: number | null;
  coverage: "complete" | "partial" | "unknown";
  omitted_fields: number;
  rejected_records: number;
  unavailable_capabilities: string[];
}

export interface ObservatoryWorkItem {
  work_item_id: string;
  source_id: string;
  project_ref: string;
  safe_title: string;
  phase: string;
  operation: ObservatoryOperation;
  state: ObservatoryFactState;
  elapsed_ms: number | null;
  owner_agent_ref: string | null;
  requested_model: ObservatoryValue;
  resolved_model: ObservatoryValue;
  provider: ObservatoryValue;
  harness: ObservatoryValue;
  adapter: ObservatoryValue;
  reasoning_effort: ObservatoryValue;
  cost: ObservatoryValue;
  tokens: ObservatoryValue;
  latency_ms: ObservatoryValue;
  blocker_refs: string[];
  attention_refs: string[];
  last_evidence_ref: string | null;
  risk: "low" | "medium" | "high" | "critical" | "unknown";
}

export interface ObservatoryAgent {
  agent_id: string;
  safe_name: string;
  roles: Array<"planner" | "executor" | "reviewer" | "integrator" | "judge">;
  family_profile_ref: string | null;
  operation: ObservatoryOperation;
  state: ObservatoryFactState;
}

export interface ObservatoryDecision {
  decision_id: string;
  kind: "question" | "human_gate" | "scope_change";
  safe_question: string;
  authority_label: string;
  authority_href: string | null;
  state: "open" | "awaiting_answer" | "decided" | "dismissed" | "expired";
  risk: "low" | "medium" | "high" | "critical" | "unknown";
  opened_at: string | null;
  affected_work_item_refs: string[];
  fact: ObservatoryFactState;
}

export interface ObservatoryEvidence {
  evidence_id: string;
  kind: "plan" | "diagram" | "adr" | "story" | "test" | "review" | "deployment_receipt" | "route_receipt" | "other";
  safe_title: string;
  project_ref: string;
  digest: string | null;
  media_type: string | null;
  observed_at: string | null;
  classification: "public" | "internal" | "restricted";
  availability: "available" | "missing" | "withheld" | "unknown";
}

export interface ObservatoryEvent {
  event_id: string;
  kind: "decision" | "dispatch" | "review" | "gate" | "test" | "artifact" | "failure" | "status_change";
  occurred_at: string | null;
  safe_summary: string;
  work_item_ref: string | null;
  evidence_refs: string[];
  state: ObservatoryFactState;
}

export interface ObservatoryMetric {
  metric_id: string;
  family: "cost" | "tokens" | "latency" | "quality" | "rework" | "acceptance" | "dora" | "product" | "pareto";
  safe_label: string;
  task_shape_ref: string | null;
  value: ObservatoryValue;
  unit: string;
  coverage: "complete" | "partial" | "unknown";
}

export interface DeliveryObservatorySnapshot {
  contract_version: "delivery-observatory.v1";
  snapshot_id: string;
  generated_at: string;
  projection_status: "ready" | "partial" | "blocked";
  window: { from: string | null; to: string };
  redaction: { policy_version: string; fields_omitted: number; records_rejected: number };
  sources: ObservatorySource[];
  projects: Array<{ project_id: string; safe_name: string }>;
  work_items: ObservatoryWorkItem[];
  agents: ObservatoryAgent[];
  events: ObservatoryEvent[];
  decisions: ObservatoryDecision[];
  evidence: ObservatoryEvidence[];
  metrics: ObservatoryMetric[];
}
