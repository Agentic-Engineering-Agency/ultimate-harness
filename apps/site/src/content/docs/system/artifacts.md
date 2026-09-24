---
title: Artifacts and schemas
description: Every file UH persists, its schema version id, and who writes it.
---

Everything UH knows is on disk under `.harness/` (plus a few files outside it), and every persisted document carries a `schema_version` checked by a Zod schema in `src/schema/`. This page is the map. It describes the v0.11 line; files marked **v0.11** are not on `main` yet.

:::caution[Contracts are still v0]
Every id below is `.v0`, which promises nothing about compatibility. Freezing the ones 1.0 promises as `.v1` is a [1.0 hardening item](/release/plan/#phase-3-10-hardening). The repository's own [`harness-artifacts.md`](/source/docs/architecture/harness-artifacts/) still shows only the 0.9-era subset.
:::

## Project level

| Path | Schema | Written by |
|---|---|---|
| `.harness/project.yaml` | `uh.project.v0` (fleet, notifications and land sections in v0.11) | `uh init`, hand edits |
| `.harness/project-brief.md` | free text, capped when injected | hand edits |
| `.harness/prices.yaml` | `uh.prices.v0` (v0.11): operator USD rates per model | hand edits |
| `.harness/adapters/*.yaml` | `uh.adapter.v0` + a strict per-runtime `runtime_config` schema | `uh adapter add` |
| `.harness/workflows/*.yaml` | `uh.workflow.v0` | `uh init`, hand edits |
| `.harness/templates/*.yaml` | `uh.session-template.v0` (v0.11) | hand edits |
| `.harness/skills/index.yaml` | `uh.skills-index.v0` | `uh skill add` |
| `.harness/specs/{active,archive}/` | `uh.spec.v0` | hand edits, `uh spec` |
| `.harness/sandboxes/index.yaml`, `<id>/metadata.yaml`, `<id>/worktree` | `uh.sandboxes-index.v0` | `uh sandbox create` |
| `.harness/audit/events.ndjson` | event lines | every lifecycle command |

## Coordination (v0.11)

| Path | Schema | Notes |
|---|---|---|
| `.harness/live-runs/<run-id>.json` | `uh.live-run.v0` (defined in `live-runs.ts`, not `src/schema`) | One per attempt, at the project root. Backs `uh ps`, `wait`, `kill`. |
| `.harness/hive/items.yaml`, `facts.ndjson`, `claims.ndjson` | `src/schema/hive.ts` (no version literal yet) | Only the controller writes. Facts are hash-chained and cite evidence. |
| `.harness/ledger/interventions.ndjson` | `uh.intervention.v0` | Hash-chained. Steer, kill, review, settlement and replace events are recorded automatically. |
| `.harness/land/decisions.ndjson` | land decision lines | Hash-chained record of every `uh land`. |
| `.harness/queue/<id>/state.json` | `uh.queue.v0` (the queue input file has no version literal) | `uh queue run` state, resumable. |
| `.harness/notifications/deliveries.ndjson` | delivery lines | Every notification attempt. |
| `.harness/experiments/<id>.yaml` and `<id>/{plan.json, runs.ndjson, report.json}` | `uh.experiment.v0` | `uh experiment`. |

## Per mission: `.harness/missions/<id>/`

| File | Schema |
|---|---|
| `mission.yaml` | `uh.mission.v0` |
| `design.md`; `plan.md`, `prd.md`, `verify-report.md`, `fix-report.md` (staged workflow, library-only) | free text |
| `events.ndjson` | lifecycle and adapter events |
| `verification.yaml` | `uh.verification-result.v0` |
| `promotion.yaml` | `uh.promotion.v0` |
| `runtime-result.yaml` | mirror of the latest run's result |
| `latest.json` | `uh.latest-run.v0` |
| `runs/index.json` | `uh.runs-index.v0` |
| `decision-receipts/<id>.json` | `uh.decision-receipt.v0` (routing and acceptance decisions) |
| `review-request.json`, `out/review-report.json`, `review-assessment.json` | `uh.independent-review-{request,report,assessment}.v0` (v0.11) |
| `team/workers/<role>-<n>/`, `team/leader/`, `integration-report.md` | team worktrees and report |

## Per run: `.harness/missions/<id>/runs/<run-id>/`

Run ids look like `20260923T074812Z-a1b2c3`.

| File | Schema | Purpose |
|---|---|---|
| `prompt.md` | | the rendered prompt |
| `runtime-session.yaml` | `uh.runtime-session.v0` | command, args, status, timestamps, exit code |
| `events.ndjson` | | normalized native event stream |
| `runtime.stdout.log`, `runtime.stderr.log` | | raw output |
| `runtime-final.txt` | | the model's final message, extracted from the `uh-runtime-final-message` fence |
| `diff.patch` | | `git diff` including untracked new files |
| `runtime-result.yaml` | `uh.runtime-result.v0` | terminal status, stop code, usage, cost and its provenance |
| `runtime-control.json` | `uh.runtime-control.v0` (v0.11) | live control file: heartbeat, pids, settlement receipt |
| `runtime-recovery.json` | `uh.runtime-recovery.v0` | resume attempts |
| `cancel-request.json`, `steer-request.json`, `steer-record.json`, `resume-link.json` | `uh.runtime-cancel-request.v0`, `uh.runtime-steer-request.v0`, `uh.steer-record.v0`, `uh.resume-link.v0` | run control messages |
| `tool-guard.json`, `tool-guard.log`, `tool-guard.arm.log` | `uh.tool-guard.v0` | applied guard policy, decisions, arming probes |
| `run-digest.json` | `uh.run-digest.v0` | live digest behind `uh ps` and `uh report` |
| `team-state.json` | `uh.team-run.v0` | team parent state |
| `session-template.json`, `experiment.json`, `windows-job-result.json` | | provenance and platform records |

## Outside `.harness/`

| Path | Schema |
|---|---|
| `acceptance/registry.yaml` | `uh.acceptance-registry.v0` (37 entries, paired oh-my-pi and Command Code) |
| `acceptance/evidence/**` (gitignored) | `uh.acceptance-evidence.v0`, bound to an input digest |
| `$XDG_CONFIG_HOME/uh/tui-state.json` | `uh.tui-state.v0` |
| user-level `notifications.yaml` | notification sinks |
| `~/.honcho/config.json` | Honcho memory |

## CLI output documents

Machine-readable command output is versioned too, so scripts can depend on it: `uh.status.v0`, `uh.ps.v0`, `uh.kill.v0`, `uh.wait.v0`, `uh.report.v0`, `uh.validate-drift.v0`, `uh.notify.{detect,list,test}.v0`. The observatory already uses `delivery-observatory.v1` and `delivery-observatory-redaction.v1`, which makes it the only contract that has been frozen.

## Safety properties of the store

- Mission ids, workflow names and artifact paths are constrained so they cannot traverse out of `.harness/`.
- Artifact writes refuse a symlinked `.harness`, mission directory or target.
- Terminal writes are strict; periodic heartbeats retry renames with backoff because Windows refuses a rename while another process has the file open.
- A settlement conflict between `runtime-result.yaml` and the control receipt is appended as a `settlement_conflict` record, never silently resolved.
