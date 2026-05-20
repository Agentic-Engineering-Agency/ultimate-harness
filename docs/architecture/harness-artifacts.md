# `.harness/` Artifact Structure

## Purpose

`.harness/` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears.

## Draft layout

```text
.harness/
  project.yaml
  adapters/
    hermes.yaml
    codex.yaml
    claude-code.yaml
    pi.yaml
  workflows/
    research-docs.yaml
    spec-first-feature.yaml
    bugfix-contained.yaml
    adapter-design.yaml
    skill-authoring.yaml
  skills/
    index.yaml
  specs/
    active/
    archive/
  missions/
    mission-2026-05-13-docs-spine/
      mission.yaml                # canonical mission packet
      design.md                   # optional UH-75 design companion
      verification.yaml           # output of `uh verify`
      promotion.yaml              # promotion decision (after merge)
      runtime-result.yaml         # MIRROR of the latest run's result
      latest.json                 # pointer at the most recent run (UH-82)
      runs/
        index.json                # append-only chronological run history
        <run_id>/                 # per-run artifact directory (UH-82)
          prompt.md
          runtime-session.yaml
          events.ndjson
          runtime.stdout.log
          runtime.stderr.log
          diff.patch
          runtime-result.yaml
          runtime-final.txt
  sandboxes/
    index.yaml
  audit/
    events.ndjson
```

## File responsibilities

- `project.yaml` — project identity, issue sources, schema versions, defaults.
- `adapters/*.yaml` — adapter manifests and capabilities.
- `workflows/*.yaml` — workflow profile definitions.
- `skills/index.yaml` — discoverable skill metadata and locations.
- `specs/active/` — current canonical specs.
- `specs/archive/` — superseded or completed specs.
- `missions/<id>/mission.yaml` — canonical mission packet.
- `missions/<id>/design.md` — optional UH-75 design companion (Why / What / How).
- `missions/<id>/verification.yaml` — checks and results.
- `missions/<id>/promotion.yaml` — promotion decision and applied refs.
- `missions/<id>/runtime-result.yaml` — MIRROR of the latest run's `runtime-result.yaml`. Atomic copy from `runs/<run_id>/runtime-result.yaml` on every run completion, so `uh status`, validate-drift, and the dashboard's `last_run` field can read "the latest result" without learning per-run paths (UH-82).
- `missions/<id>/latest.json` — pointer at the most recent run: `{schema_version, run_id, started_at, finished_at?, status}` (UH-82). Written before any artifact lands so in-flight runs are visible; rewritten on terminal status.
- `missions/<id>/runs/index.json` — append-only chronological list of runs with status flips in place (`running` → `passed|failed|blocked|cancelled|timeout`). Capped consumer responsibility — readers slice newest-first as needed (UH-82).
- `missions/<id>/runs/<run_id>/` — per-run artifact directory. Holds the run's `prompt.md`, `runtime-session.yaml`, `events.ndjson`, `runtime.stdout.log`, `runtime.stderr.log`, `diff.patch`, `runtime-result.yaml`, and `runtime-final.txt`. Concurrent runs of the same mission are safe because each lands under its own `<run_id>` (UH-82).
- `sandboxes/index.yaml` — active/discarded/promoted sandboxes.
- `audit/events.ndjson` — append-only project-level timeline.

## Design notes

- `.harness/` should be checked into git except large logs or secrets.
- Secrets must never be stored in `.harness/`.
- Generated artifacts remain non-canonical until promoted.
- Runtime-specific details belong under mission/session records, not in core specs.
