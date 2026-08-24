# Delivery Observatory Contract v1

Status: implemented for the first local observatory slice. This document defines the producer-neutral
projection consumed by the UI; it does not authorize a new controller, producer mutation, or
deployment.

## Boundary

The observatory is a read-only operational projection. Telar owns policy, intent, normalized ledger
semantics, and human gates. Ultimate Harness remains the only Run Control. SpecSafe owns
repository-local assurance. OMP Pantheon and other harnesses remain Execution Adapters. The UI may
request a refresh from an adapter; it may not dispatch, cancel, approve, promote, or rewrite source
state through this contract.

`delivery-observatory.v1` is deliberately independent of Codex, Orca, Paperclip, Ultimate Harness,
and any one telemetry vendor. Producer-specific fields stay in raw source records. Adapters emit
only the safe normalized fields below.

## Implemented local adapter

The MVP adapter is `ultimate-harness-filesystem.v1`. It reads only the project manifest, mission
packets, run indexes, runtime receipts, and verification receipts under the selected UH project.
`uh observatory snapshot --json` performs the projection; Hermes transports the same validated
document at `GET /observatory/snapshot`. The UI polls every 30 seconds while visible.

The source is marked `filesystem`, coverage is `partial`, and each artifact fact becomes stale after
24 hours. The poll itself has a 60-second source staleness window. Model route, provider, reasoning
effort, tokens, cost, authority links, DORA, product metrics, and Pareto remain explicitly unknown
because this adapter has no verified source for them. Streaming and producer-specific snapshot
importers remain seams, not implemented capabilities.

## Safety rules

An adapter must reject or omit, before serialization:

- secrets, credentials, cookies, environment values, auth state, or provider tokens;
- prompt, message, completion, memory, transcript, or private-conversation bodies;
- raw logs, shell commands, stderr/stdout bodies, diffs, or arbitrary event payloads;
- absolute or personal filesystem paths, home-directory fragments, private URLs, and opaque account
  identifiers;
- artifact contents unless a separate classified evidence viewer is explicitly authorized.

The contract may carry a positively classified display label, a stable opaque ID, digest, media
type, byte count, and access classification. Evidence v1 is metadata-only: it carries no locator,
even a repository-relative one, and never carries the sensitive body.
Adapters fail closed on a field they cannot classify. Redaction counts and coverage gaps remain
visible so omission cannot look like completeness.

## Orthogonal state model

Every material fact carries three independent dimensions:

| Dimension | Values | Meaning |
|---|---|---|
| Assertion | `observed`, `inferred`, `proposed`, `unknown` | How the statement is known |
| Operation | `queued`, `active`, `blocked`, `awaiting_human`, `succeeded`, `failed`, `cancelled`, `uncertain`, `unknown` | What the work is doing |
| Freshness | `fresh`, `stale`, `expired`, `unknown` | Whether the observation is timely enough for its source policy |
| Source health | `reachable`, `degraded`, `unavailable`, `unauthorized` | Whether the source can currently be read under its authorization |

`blocked` is not an epistemic status. `stale` is not a failure. `unknown` is never converted to
zero, false, idle, or success. Inferences must cite the observed facts and inference rule that
produced them. Proposals must name their approving authority and never appear as live state.

## Envelope

```yaml
contract_version: delivery-observatory.v1
snapshot_id: stable-opaque-id
generated_at: RFC3339
projection_status: ready | partial | blocked
window:
  from: RFC3339 | null
  to: RFC3339
redaction:
  policy_version: delivery-observatory-redaction.v1
  fields_omitted: integer
  records_rejected: integer
sources: []
projects: []
work_items: []
agents: []
attempts: []
events: []
decisions: []
evidence: []
metric_series: []
```

The initial serializer is strict: unknown keys fail validation at adapter boundaries. v1 has no
arbitrary metadata or extension bag. Any new field requires a reviewed contract revision; a
breaking change requires a new major version.

Scalar observations use a tagged value so missing data cannot collapse to zero or a copied
requested value:

```yaml
state: known | unknown
value: typed-value # present only when known
method: measured | reported | derived | estimated # present only when known
evidence_refs: [evidence-id]
reason_code: not_reported | unsupported | unauthorized | stale_source | conflicting_sources | not_comparable # present only when unknown
```

## Provenance and freshness

Each source declares:

```yaml
source_id: local-stable-id
adapter_id: adapter-name-and-version
producer: producer-name-and-observed-version-or-unknown
transport: live_stream | live_poll | filesystem | snapshot
health: reachable | degraded | unavailable | unauthorized
assertion: observed | proposed
observed_at: RFC3339 | null
ingested_at: RFC3339
freshness:
  status: fresh | stale | expired | unknown
  stale_after_ms: integer | null
  reason: safe-short-label | null
coverage:
  status: complete | partial | unknown
  omitted_fields: integer
  rejected_records: integer
  unavailable_capabilities: [safe-capability-id]
```

A snapshot source is always labeled `snapshot` in the UI with its capture timestamp. It never
silently upgrades to a live transport. A source that has not been refreshed inside its declared
window is stale even if its last value looked healthy. Fixtures additionally carry a permanent
`DEMO FIXTURE - NOT LIVE` label and disable current-time and automatic-refresh claims.

## Core records

### Work item

```yaml
work_item_id: opaque-stable-id
source_id: source-id
project_ref: project-id
scope_ref: scope-id | null
safe_title: bounded-display-label
phase: discovery | design | plan | execute | review | verify | integrate | release | unknown
operation: { status: active, reason: null }
assertion: { status: observed, evidence_refs: [evidence-id], rule_ref: null }
freshness: { status: fresh, observed_at: RFC3339, stale_after_ms: 60000 }
owner_agent_ref: agent-id | null
elapsed_ms: integer | null
blocker_refs: [decision-or-event-id]
last_evidence_ref: evidence-id | null
attention_refs: [decision-id]
risk: low | medium | high | critical | unknown
```

### Agent

Stable agent identity is separate from a concrete model route.

```yaml
agent_id: stable-id
safe_name: display-name
roles: [planner | executor | reviewer | integrator | judge]
purpose_ref: safe-profile-ref | null
family_profile_ref: immutable-ref | null
active_attempt_refs: [attempt-id]
operation: { status: active | blocked | unknown, reason: safe-reason | null }
assertion: { status: observed | proposed | unknown, evidence_refs: [] }
freshness: { status: fresh | stale | unknown, observed_at: RFC3339 | null }
```

### Attempt and route

Every fallback is its own attempt. The chain links attempts; it does not overwrite a failed route.

```yaml
attempt_id: stable-id
work_item_ref: work-item-id
agent_ref: agent-id | null
task_shape_ref: versioned-cohort-id
requested_route:
  family_profile_ref: immutable-ref | null
  model: tagged-known-or-unknown
  provider: tagged-known-or-unknown
  harness: tagged-known-or-unknown
  adapter: tagged-known-or-unknown
  reasoning_effort: tagged-known-or-unknown
resolved_route:
  family_profile_ref: immutable-ref | null
  model: tagged-known-or-unknown
  provider: tagged-known-or-unknown
  model_version: tagged-known-or-unknown
  harness: tagged-known-or-unknown
  adapter: tagged-known-or-unknown
  reasoning_effort: tagged-known-or-unknown
fallback:
  applied: tagged-known-or-unknown
  reason: safe-reason-code | null
  prior_attempt_refs: [attempt-id]
  semantic_loss: none | declared | unknown
context:
  manifest_ref: evidence-id | null
  included_ref_count: tagged-known-or-unknown
  excluded_ref_count: tagged-known-or-unknown
  truncation: tagged-known-or-unknown
usage:
  input_tokens: tagged-known-or-unknown
  output_tokens: tagged-known-or-unknown
  reasoning_tokens: tagged-known-or-unknown
  cache_read_tokens: tagged-known-or-unknown
  cache_write_tokens: tagged-known-or-unknown
  total_tokens: tagged-known-or-unknown
economics:
  amount: tagged-known-or-unknown
  currency: tagged-known-or-unknown
  confidence: tagged-known-or-unknown
timing:
  queued_ms: tagged-known-or-unknown
  provider_ms: tagged-known-or-unknown
  tool_ms: tagged-known-or-unknown
  execution_ms: tagged-known-or-unknown
  end_to_end_ms: tagged-known-or-unknown
outcome:
  status: accepted | rejected | abstained | failed | cancelled | uncertain | unknown
  rework_count: tagged-known-or-unknown
  errors_detected: tagged-known-or-unknown
  errors_escaped: tagged-known-or-unknown
  quality_score: tagged-known-or-unknown
  quality_scale_ref: versioned-rubric | null
assertion: { status: observed | inferred | proposed | unknown, evidence_refs: [] }
freshness: { status: fresh | stale | unknown, observed_at: RFC3339 | null }
```

### Timeline event

`kind` is one of `decision`, `dispatch`, `review`, `gate`, `test`, `artifact`, `failure`, or
`status_change`. The record carries a source-local sequence or cursor, `occurred_at`, `observed_at`,
`ingested_at`, safe summary, correlated IDs, assertion, operation, freshness, and evidence
references. The UI may time-sort events for display, but cannot claim a total causal order across
sources. A timeline event never carries a raw log line or message body.

### Decision inbox item

```yaml
decision_id: stable-id
kind: question | human_gate | scope_change
safe_question: bounded-display-copy
authority_ref: human-or-role-id
state: open | awaiting_answer | decided | dismissed | expired
risk: low | medium | high | critical | unknown
opened_at: RFC3339
due_at: RFC3339 | null
decision_ref: evidence-id | null
affected_work_item_refs: [work-item-id]
assertion: { status: observed | proposed | unknown, evidence_refs: [] }
freshness: { status: fresh | stale | unknown, observed_at: RFC3339 | null }
```

### Safe evidence reference

```yaml
evidence_id: stable-id
kind: plan | diagram | adr | story | test | review | deployment_receipt | route_receipt | other
safe_title: display-label
project_ref: project-id
digest: sha256 | null
media_type: media-type | null
observed_at: RFC3339 | null
classification: public | internal | restricted
availability: available | missing | withheld | unknown
```

Evidence v1 is display-only metadata. Opening evidence is deferred to a separately authorized,
contained viewer. `restricted` evidence is shown as withheld metadata only.

## Metrics and comparison

Metrics remain nullable and provenance-bound. A metric series names its task-shape cohort, formula
version, source set, numerator, denominator, unit, window, confidence, and missing-data policy.
Supported first-view families are:

- cost per accepted outcome, token usage, queue/provider/tool/end-to-end latency;
- rework, detected and escaped errors, acceptance rate, and quality/cost/time;
- DORA and product metrics only when a verified source and denominator exist.

The comparator groups by compatible `task_shape_ref`, risk tier, context regime, evaluation rubric,
and time window before comparing routes. It shows raw values, coverage, uncertainty, and the Pareto
frontier. It never produces an all-against-all leaderboard or a universal winning model.

## Verified initial source registry

| Source | Mode | First version | Explicit limitation |
|---|---|---|---|
| Ultimate Harness `.harness/` artifacts through a dedicated safe projector and public CLI snapshot | filesystem + live poll | adapter | Existing raw plugin endpoints are not a safe source; liveness, verification, and usage must retain uncertainty |
| Repo-local Codex coordination board | filesystem poll, read-only after schema conformance | bounded adapter | Minimal active-claim metadata only; claimed paths, archives, prompts, transcripts, reasoning, commentary, and tool output are excluded |
| Codex app task list | timestamped snapshot | snapshot seam only | No supported local streaming API has been verified; private conversation content is excluded |
| Telar ADRs, routing policy, and normalized-ledger design | timestamped snapshot | evidence/reference projection | Planning authority and proposed contracts, not observed execution |
| SpecSafe repo-local assurance artifacts | timestamped snapshot until a stable machine API is verified | evidence/reference projection | Assurance only; no routing or run-control inference |
| OMP Pantheon adapter manifests | timestamped snapshot until an adapter receipt is present in UH | evidence/reference projection | Adapter capability does not prove the actual model used |
| Prism Arena benchmark exports | optional static cohort import | deferred | Only comparable inside its own declared task shapes and rubrics |

No direct Orca or Paperclip adapter enters v1. Their seam remains `snapshot` until a supported,
authorized API with safe field-level semantics is verified.

## UI projections

The contract supports ten projections through one store and three task views:

1. **Operate:** Now joins work items to active attempts, blockers, last evidence, attention, and the
   selected work's role chain.
2. **Review:** the read-only decision inbox owns questions, gates, scope changes, and route
   tradeoffs; action links target Telar or the declared authority.
3. **Observe:** the Evidence Reel owns normalized safe events, evidence metadata, metrics, DORA,
   and the task-shape Pareto frontier.
4. **Shared shell:** filters cover project, scope, agent, family/model, harness, state, risk, and
   date. Selection and source freshness survive view changes.
5. **Meeting mode:** a sequential read-only presentation of Now, decisions, progress, and evidence
   over the same validated snapshot. It does not create another truth; unsafe fields are removed
   before transport, not hidden by CSS.
6. **System states:** loading, error, empty, stale, blocked, and unknown.

Each record family has one primary renderer. Another view may show a bounded count or link but may
not duplicate the owning table, metric family, inspector, or controls. The implementation may use
named internal module slots so future role presets can reorder approved modules. v1 exposes no
freeform canvas, widget catalog, arbitrary layout persistence, or user-authored query surface.

## Compatibility and evolution

- Breaking changes require a new contract version and an explicit adapter/UI migration.
- v1 snapshots are immutable. Refresh creates a new `snapshot_id`.
- Adapters declare supported contract versions; no best-effort coercion is allowed.
- Producers retain their native records. The projection is disposable and rebuildable.
- A future streaming transport carries the same validated record shapes plus cursor and sequence;
  it does not create a second live schema.
