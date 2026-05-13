# Verification and Promotion Lifecycle

## Principle

Agent output is not complete when the runtime says it is done. It is complete only when required checks pass, review gates are satisfied, and approved artifacts are promoted.

## Lifecycle

```text
Runtime result
  -> collect artifacts/diff/logs
  -> run automated checks
  -> perform spec compliance review
  -> perform code/docs quality review
  -> perform sandbox/security review
  -> human approval decision
  -> promote selected changes
  -> write audit event
```

## Verification result draft

```yaml
schema_version: uh.verification-result.v0
mission_id: mission-2026-05-13-docs-spine
status: passed # passed | failed | blocked | waived
checks:
  - name: docs-tree-exists
    type: command
    command: find docs -type f | sort
    status: passed
  - name: spec-compliance
    type: review
    reviewer: qa-agent
    status: passed
    notes: All required docs exist and map to handoff criteria.
findings:
  - severity: info
    message: AgentFS backend remains interface-level for MVP.
approvals:
  - gate: human-promotion
    status: pending
```

## Review gates

1. **Spec compliance** — does output satisfy the mission and linked issue/spec?
2. **Quality** — is the implementation/docs clear, maintainable, and minimal?
3. **Verification** — did required checks run and pass?
4. **Security/sandbox** — did the runtime stay within permitted boundaries?
5. **Human promotion** — should changes become canonical?

## Promotion record draft

```yaml
schema_version: uh.promotion.v0
mission_id: mission-2026-05-13-docs-spine
sandbox_id: sandbox-abc123
decision: promoted
approved_by: Lalo
promoted_at: 2026-05-13T00:00:00Z
changes:
  - docs/README.md
  - docs/glossary.md
audit_event_id: audit-...
```

## Promotion policies

- `human-approved` — default. Requires explicit human approval.
- `review-agent-approved` — allowed only for low-risk generated docs or tests when configured.
- `auto-promote-on-green` — deferred; too risky for MVP.
- `manual-only` — harness records evidence but a human applies changes.
