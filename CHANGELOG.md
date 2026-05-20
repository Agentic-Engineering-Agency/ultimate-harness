# Changelog

All notable changes to `@agenticengineeringagency/ultimate-harness` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [SemVer](https://semver.org/spec/v2.0.0.html).

Issues are tracked in [Linear](https://linear.app/agentic-eng); PRs live in [GitHub](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pulls).

## [Unreleased]

### Fixed

- `runtime.cancelled` event handler now emits a single-line stderr warning when no `latest.json` pointer exists (instead of silently skipping). Quiet via `UH_QUIET_CANCEL=1` for tests. Closes the operator-visibility gap left open by UH-82.

### Added

- Run history retention policy: plugin manifest `max_runs_per_mission` cap (default null = unlimited). Oldest per-run dirs are pruned on each new run; `runs/index.json` entries persist with `archived: true` so the audit trail is preserved ([UH-90](https://linear.app/agentic-eng/issue/UH-90)).
- New `orphaned-run-dir` drift kind for `uh validate --repair`: detects `.harness/missions/<id>/runs/<run_id>/` directories that have no corresponding entry in `runs/index.json` (idempotent `rm -rf` repair). Closes a UH-82 follow-up.
- `uh mission run --runtime-config-overrides <json>` flag merges JSON-encoded overrides on top of the mission's `runtime_config_overrides` block. The Hermes plugin Run modal now passes user-supplied overrides through ([UH-81](https://linear.app/agentic-eng/issue/UH-81)).
- Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/` with a `latest.json` pointer and append-only `runs/index.json` history. Concurrent runs of the same mission no longer interleave; the Hermes plugin's per-run route now serves the correct run ([UH-82](https://linear.app/agentic-eng/issue/UH-82)).
- Recent runs pane on the Hermes Dashboard Mission detail tab with sortable columns, status-chip filtering, and run-id prefix search. Click a row to drill into that run's artifacts ([UH-85](https://linear.app/agentic-eng/issue/UH-85), [UH-86](https://linear.app/agentic-eng/issue/UH-86), [UH-88](https://linear.app/agentic-eng/issue/UH-88)).
- `UH_TUI_THEME=dark|light|system` palette switch with full `src/tui/theme.ts` palette module ([UH-48](https://linear.app/agentic-eng/issue/UH-48)).
- Ctrl+Z / `fg` suspend-resume lifecycle in the TUI, backed by OpenTUI 0.2.13's `renderer.suspend()` / `renderer.resume()` ([UH-50](https://linear.app/agentic-eng/issue/UH-50)).
- `uh tui screenshot --view <name> --out <path>` automated capture pipeline with `overview` / `missions` / `sandboxes` / `workflows` views ([UH-51](https://linear.app/agentic-eng/issue/UH-51)).
- `e` opens the current mission manifest in `$EDITOR` from the TUI mission detail view, suspending and resuming the renderer cleanly ([UH-49](https://linear.app/agentic-eng/issue/UH-49)).
- Compare two runs side-by-side: new `MissionCompare` view with runtime-result field diff, prompt.md line diff, and events.ndjson side-by-side stream. Triggered via "Compare" mode on the Recent runs pane ([UH-89](https://linear.app/agentic-eng/issue/UH-89)).
- Replay a historical run: "Replay" button on Recent runs rows + per-run drilldown opens the Run modal pre-filled with the source run's `runtime_config_overrides`; `runs/index.json` carries the `replay_of` lineage ([UH-87](https://linear.app/agentic-eng/issue/UH-87)).

### Changed

- `uh mission run` now accepts `--run-id <id>` for deterministic per-run artifact paths; the Hermes plugin passes the id it generates so dashboard, CLI, and on-disk artifacts all agree. The previous 409 `run_already_active` guard is gone — per-run directories make concurrent same-mission runs safe.
- `RunHermesResult` / `RunCodexResult` / `RunOhMyPiResult` / hermes-proxy `RunResult` now carry the `runId` of the directory they wrote.
- `runtime-result.yaml` is still mirrored to the mission root after each run, so `uh status`, validate-drift, and the dashboard's `last_run` field keep working without learning per-run paths.

## [0.3.0] — 2026-05-20

Two epics shipped end-to-end plus a deep discipline-layer pass distilled from [GSD-2](https://github.com/gsd-build/gsd-2) research. 26+ correctness findings caught and fixed under [Codex](https://github.com/apps/chatgpt-codex-connector) adversarial review across 13 rounds on the Hermes plugin alone.

### Added

- **Epic 3 — Hermes Dashboard plugin** ([UH-60](https://linear.app/agentic-eng/issue/UH-60), [#89](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89))
  - Drop-in Hermes plugin at `apps/hermes-plugin/` exposing UH from the Hermes web UI: adapter health, mission browser, run trigger with SSE live tail, prompt/final-message/diff/runtime-result drilldown, workflow + verification viewers, theme YAML, sessions cross-link, first-run wizard, install runbook (UH-61..UH-69).
  - FastAPI bridge that shells out to the `uh` CLI; no daemon, no FFI, no Hermes fork. Watchdog enforces `UH_RUN_TIMEOUT_S`. Solid bundle ships at 25.5 KB (50 KB cap).
- **Epic 4 — Team mission shape** ([UH-70](https://linear.app/agentic-eng/issue/UH-70), [#87](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/87) + [#88](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/88) + [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90))
  - New `team` mission shape with adapter-bound workers, per-worker worktree auto-isolation, leader integrator role, `integration-report.md` artifact (UH-71/72).
  - New workflow profiles: `staged` (`plan → prd → exec → verify → fix`) and `adversarial-qa` (OMX `$ultraqa` analog) with `gate-6-no-leaked-artifacts` fail-closed gate (UH-73/74).
  - Companion `design.md` artifact alongside `mission.yaml` (UH-75).
  - Three-state `MergeOutcome` (`clean | conflicted | failed`) and `writeIntegrationReport` verdict propagation.
- **Discipline layer from GSD-2 research** ([#88](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/88))
  - Three-verdict runtime-result status (`pass / needs-attention / needs-remediation`) plus `uh mission verdict` manual override (UH-76).
  - `uh validate` drift detection + idempotent repair registry: orphaned worktree, stale render, stale worker, truncated `events.ndjson`, missing completion timestamp, ROADMAP↔Linear divergence (UH-77).
  - `uh status --json` LLM-less query mode feeding the Hermes Dashboard (UH-78).
  - Canonical `docs/VISION.md` with explicit "what we won't accept" (UH-79).
  - Pre-inlined dispatch context contract formalized across all four adapters (UH-80).
- **Honcho persistent-memory extension** ([UH-59](https://linear.app/agentic-eng/issue/UH-59), [#83](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/83)) — env-driven enrich/record at the harness layer for `oh-my-pi`, with fail-fast misconfig and graceful network degradation.

### Changed

- `mission run` now writes `events.ndjson`, `runtime-result.yaml`, `final-message.md`, and (for team missions) `integration-report.md` under `.harness/missions/<id>/`; per-run subdirectories are a follow-up ([UH-82](https://linear.app/agentic-eng/issue/UH-82)).
- All adapters (`hermes`, `hermes-proxy`, `codex`, `oh-my-pi`) now consume a single pre-inlined dispatch-context contract (UH-80), removing per-adapter prompt drift.

### Fixed

- Codex adversarial review on PR #89 caught and fixed 26+ correctness issues before merge: SSE drain races, cancel-vs-natural-exit races, watchdog leaks, path traversal, symlink artifact disclosure, `_active_runs` unbounded growth, started-byte-offset capture order, `get_mission` blast radius on corrupt YAML, `runId` sanitization, concurrent-run guard (409), `is_run_scoped` mislabeling, `decodeURIComponent` crash on malformed hash, and more. Detail: [PR #89 conversation](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89).
- PR #87 Codex pass caught the team-mission `MergeOutcome.failed` propagation gap; fixed in [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90).

### Known follow-ups (filed)

- [UH-81](https://linear.app/agentic-eng/issue/UH-81) — Real `--runtime-config-overrides` CLI support. The Hermes plugin's Run modal currently 400-rejects non-empty overrides (`overrides_not_yet_supported`).
- [UH-82](https://linear.app/agentic-eng/issue/UH-82) — Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/`. The plugin's per-run route surfaces `is_run_scoped: false` + banner.
- [UH-83](https://linear.app/agentic-eng/issue/UH-83) — Activate `.github/workflows/release-plugin.yml` (staged at `docs/ci/release-plugin.yml.example`).

## [0.2.0] — 2026-05-19

### Added

- **Epic 1 — Hermes proxy adapter** ([UH-32](https://linear.app/agentic-eng/issue/UH-32)) promoted to `status: active` after live E2E smoke against `hermes proxy start --provider nous` ([#49](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/49)..[#55](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/55)).
- **Epic 2 — Interactive TUI** ([UH-41](https://linear.app/agentic-eng/issue/UH-41)) on OpenTUI (Solid bindings, Bun preload): dashboard, mission browser, run flow, adapter+sandbox manager, keymap overlay, per-project persistence ([#52](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/52), [#57](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/57), [#59](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/59), [#61](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61), [#63](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/63), [#64](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/64), [#65](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/65)).
- Spec-Driven Development discipline ([UH-54](https://linear.app/agentic-eng/issue/UH-54), [#68](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/68)) — structured `acceptance_criteria` with per-AC verify.
- Test-Driven Development discipline ([UH-55](https://linear.app/agentic-eng/issue/UH-55), [#69](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/69)) — `tdd` workflow profile + test-first verify gate.
- Cross-runtime QA harness ([UH-56](https://linear.app/agentic-eng/issue/UH-56), [#70](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/70)) — `uh mission run-all` with side-by-side adapter comparison.
- Runtime intelligence + operator polish ([UH-57](https://linear.app/agentic-eng/issue/UH-57), [#77](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/77)) — TUI screenshot capture, adapter-check age footer, `runtime.cancelled` event, mission capability enforcement.
- Package rename + CI publish ([UH-58](https://linear.app/agentic-eng/issue/UH-58), [#79](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/79)) — `@agenticengineeringagency/ultimate-harness` with `publishConfig.access=public`, dry-run + release-publish workflow.

## [0.1.0] — 2026-05-17

Initial public release. Adapter framework (`hermes`, `codex`, `oh-my-pi`), mission schema, runtime-result artifact contract, verification + promotion pipeline.

[0.3.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/tag/v0.1.0
