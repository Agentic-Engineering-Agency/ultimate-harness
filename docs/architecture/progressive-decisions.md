# Progressive governed decisions

Status: partially implemented; unimplemented flows below remain specifications.

## Implemented integration and verification boundary

Verification and independent-review collection now persist
`uh.decision-receipt.v0` artifacts under the owning mission's
`decision-receipts/` directory and append `decision.recorded` lifecycle events.
Receipts distinguish disabled credentials, unavailable providers, malformed
responses, advisory recommendations, and recommendations that changed the
consumer's disposition. They retain digests rather than raw prompts, source
content, provider error messages, or provider responses. Human acceptance remains
required; a semantic pass does not override a deterministic failure.

Provider-free regression coverage exercises a consumed remediation decision,
transport failure, malformed success responses, receipt validation, and omission
of synthetic private-data sentinels. The verification integration also exercises
a real failing subprocess against a synthetic semantic pass: the deterministic
failure remains failed and raw output, command names, diffs, and workspace paths
are excluded from the provider request.

Both callers project evidence into check dispositions, criterion identifiers and
descriptions, severities, and review input/claim states. They do not send full
mission packets, source diffs, raw logs, or review evidence text. Criterion
descriptions remain task content, not a guarantee of anonymity; these projections
are not yet a general-purpose privacy filter or a measured minimum-token design.
Live judgment quality, confidence-policy enforcement, and the other decision
flows specified below remain unverified or unimplemented.

## Goal

Add a narrow semantic-recommendation layer to Ultimate Harness (UH) without
turning a model into an authority. TypeSafe System One/JEV may recommend a
runtime/model route, an acceptance disposition, a review escalation, a scope
change disposition, or retry/stop. UH remains responsible for deterministic
eligibility, tool guards, protected paths, resource admission, recovery limits,
human approval, and artifact publication.

## Ownership and authority

- Telar owns intent, scope, route policy, human gates, stable identity, and
  cross-project governance. UH consumes only the execution-relevant mission
  contract and does not mutate Telar state.
- UH owns live route resolution, adapter execution, supervision, recovery,
  verification, integration, and promotion mechanics.
- JEV is a typed semantic recommender. It cannot grant a capability, widen a
  runtime/model allowlist, increase a budget, bypass a guard, downgrade a human
  gate, approve a scope expansion, or publish a policy.
- Target policy (not implemented): missing, failed, malformed, or low-confidence
  responses must be non-authorizing; current callers do not enforce a confidence threshold.
- Existing deterministic failures always win. A semantic `pass` cannot turn a
  failed check, protected-path stop, route mismatch, resource refusal, or
  required human gate into success.

## Persisted contracts

Proposed, **not accepted by the current mission schema**: an optional `decision_policy` block:

```yaml
decision_policy:
  enabled: true
  min_confidence: 0.75
  allowed_runtimes: [oh-my-pi, command-code]
  allowed_models: [openai-codex/gpt-5.6-luna]
  require_provider_for_route: true
  require_provider_for_retry: true
```

The block is additive and strict. `allowed_runtimes` is applied in deterministic
adapter eligibility. `allowed_models` is the only model set from which a JEV
recommendation may be applied. Provider requirements are opt-in so legacy
missions retain their deterministic behavior while progressive missions can
fail closed when semantic input is required.

`src/schema/decisions.ts` defines `uh.decision-receipt.v0`. A receipt contains
only decision kind, typed recommendation (when valid), status, authorizer,
human-required flag, confidence, provider/model, bounded usage and latency,
input/response digests, reason, state transition, and timestamp. It contains no
prompt, transcript, raw provider answer, command output, secret, or private
source document. Receipts live under
`.harness/missions/<mission>/decision-receipts/`; a compact allowlisted state
transition is also appended to the mission event stream.

Receipt statuses are:

- `applied`: a recommendation was used only within deterministic eligibility;
- `advisory`: recorded but no authority-bearing effect was applied;
- `awaiting-human`: a human decision is still required;
- `denied`: deterministic policy rejected the recommendation or action;
- `unavailable`: no configured provider or provider transport failure;
- `malformed`: the provider response did not satisfy the typed answer contract;
- `uncertain`: confidence was absent or below `min_confidence`.

## Decision flows

### Runtime/model selection

`uh mission run --auto` first computes `chooseAdapter`, including capability,
network, context, cost-class, and `allowed_runtimes` filters. JEV may select
only one of those eligible adapters and, separately, one model in
`allowed_models`. An explicit CLI model override wins over a semantic
recommendation. Invalid, uncertain, or unavailable recommendations preserve
the deterministic incumbent unless `require_provider_for_route` is true, in
which case launch is blocked before process spawn.

### Acceptance

`uh verify` runs required checks, acceptance checks, output verification, and
TDD checks first. JEV receives only counts/IDs/statuses/severities and finding
classes. A semantic remediation or tamper recommendation can harden a
verification result to failure; semantic pass is advisory and never approves
promotion. Deterministic check failures and blocked human checks are retained.

### Review/escalation

Independent review collection uses a compact JEV review/escalation question
against hash-bound evidence summaries. JEV can request escalation or stop, but
cannot accept a review, promote source work, or downgrade a required gate.
Review provenance, captured-input hashes, and human acceptance remain
mechanical requirements.

### Scope-change requests

The CLI exposes `uh mission decision scope-change`. It hashes the requested
scope and sends only bounded metadata to JEV. Every result is recorded as
`awaiting-human` (or an explicit unavailable/malformed/uncertain/denied state)
and `applied: false`; no mission packet, scope, allowlist, or budget changes.
Human approval must occur through the existing authority surface.

### Retry/stop

Before a bounded native recovery resume, UH checks its existing deterministic
stop-code/session/max-resume policy. JEV may narrow that action to stop or
request human deferral; it cannot make a non-resumable stop resumable. A valid
retry is applied only when deterministic recovery eligibility passes. With an
optional provider, an unavailable provider leaves the deterministic recovery
policy as the authorizer and is explicitly recorded; malformed or uncertain
answers do not retry. `require_provider_for_retry` blocks retry when JEV is
unavailable.

## Platform and integration constraints

The implementation uses Node 20 Web APIs, existing artifact path guards, and
existing adapter/recovery seams; it introduces no OS-specific process logic.
Windows Job supervision, POSIX process-group cleanup, directory/git-worktree
sandboxes, team resource waves, and container refusal behavior remain outside
semantic decision code. No Runlayer SDK or cross-project dependency is added.

Runlayer lessons are limited to first-party documentation: identity and policy
are separate, policy is least-privilege and evaluated before action, human
approval adds a checkpoint rather than granting access, hooks default
fail-closed, and bounded telemetry/outputs are appropriate. Those lessons map
to UH's deterministic guard plus semantic-receipt split; Runlayer does not
become a UH authority or runtime dependency.

Telar and telar-demo remain read-only references. Telar owns planning,
identity, route policy, and human authority; UH returns operational receipts.
The implementation does not create a shared package, copy Telar decisions, or
let a model act as a cross-project approver.

## Verification obligations

Required future coverage includes allowed-route/model enforcement, low confidence,
mandatory human scope gating, deterministic-denial precedence, and recovery
retry narrowing. These are obligations, not completed test or campaign claims.
Existing provider-free checks are listed at the top of this document. Integrated live acceptance is incomplete. See the
[roadmap](../ROADMAP.md#governed-decisions) for unresolved policy, transport,
privacy and evidence-integrity work.
