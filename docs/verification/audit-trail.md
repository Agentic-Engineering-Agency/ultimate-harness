# Audit Trail

## Purpose

The audit trail answers:

- Why was this work started?
- Which issue/spec/mission authorized it?
- Which runtime performed it?
- What context and skills were used?
- What changed?
- Which checks ran?
- Who approved promotion?

## Event format draft

```json
{"schema_version":"uh.audit-event.v0","event_id":"audit-001","timestamp":"2026-05-13T00:00:00Z","mission_id":"mission-2026-05-13-docs-spine","type":"mission.created","actor":"human","summary":"Created docs spine mission"}
{"schema_version":"uh.audit-event.v0","event_id":"audit-002","timestamp":"2026-05-13T00:01:00Z","mission_id":"mission-2026-05-13-docs-spine","type":"runtime.launched","actor":"adapter:hermes","summary":"Launched Hermes runtime session"}
{"schema_version":"uh.audit-event.v0","event_id":"audit-003","timestamp":"2026-05-13T00:10:00Z","mission_id":"mission-2026-05-13-docs-spine","type":"verification.completed","actor":"qa-agent","summary":"Documentation checks passed"}
```

## Storage

Project-level events belong in `.harness/audit/events.ndjson`. Mission-specific events may also be copied to `.harness/missions/<id>/events.ndjson` for local inspection.

## Rules

- Audit records should be append-only.
- Do not store secrets.
- Link to artifacts by path or hash.
- Record waivers explicitly.
- Promotion requires an audit event.
