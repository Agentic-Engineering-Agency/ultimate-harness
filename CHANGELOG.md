# Changelog

All notable changes to `@agenticengineeringagency/ultimate-harness` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [SemVer](https://semver.org/spec/v2.0.0.html).

Issues are tracked in [Linear](https://linear.app/agentic-eng); PRs live in [GitHub](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pulls).

## [Unreleased]

### Changed

- **Capability enforcement is now WARN-by-default (UH-138).** Mission `capabilities` mismatches at `run` / `dry-run` / `run-all` preflight previously blocked with a hard error (since v0.7.0). They now emit a `[WARN]` per unmet tag and the run proceeds. Pass `--strict` to restore the hard error. `--force` still bypasses the capability check (and `runtime_requirements`) entirely. `runtime_requirements` remain typed, always-error preconditions.

  Migration: if you relied on a capability mismatch blocking a run, add `--strict` to those invocations (or to CI).

## [0.9.0] — 2026-05-29

Milestone **"Memory & adapter matrix"** ([Linear UH-131 / UH-136 / UH-137](https://linear.app/agenticengineering-agency/team/UH/active); GitHub PRs #204–#206 / #214 / #215 / #216). Bundles everything merged to `dev` since v0.8.0: a native pay-per-token Anthropic adapter (experimental), harness-side Honcho memory operations with a per-mission opt-out, the team-run dogfood verdict/artifact fixes, and the Phase-0 DX hardening (real `uh --version`, opt-in telemetry primitive, adoption docs, curated npm allowlist, CI plugin gates).

### Added

- **Native Anthropic adapter** ([UH-136](https://linear.app/agenticengineering-agency/issue/UH-136), [#214](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/214)) — `status: experimental`. The official, ToS-clean pay-per-token path through the Anthropic Messages API, complementing the OAuth-backed `hermes-proxy` and the OMP stealth surface. API key via `ANTHROPIC_API_KEY` (env-only, never the manifest); a missing key degrades `uh adapter check anthropic` gracefully (the CI-skip signal) and makes `mission run` fail fast via a plan error. Blocked-output classification on auth / rate-limit / model-not-found / network failures. Registered as a first-class routable adapter (`anthropic`) with an optional opt-in live-smoke CI job.
- **Honcho memory operations** ([UH-137](https://linear.app/agenticengineering-agency/issue/UH-137), [#215](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/215)) — `honcho_search` / `honcho_remember` exposed as harness-side memory operations, plus a per-mission `runtime_config.honcho_memory` opt-out honored by every Honcho-aware adapter (`oh-my-pi` / `codex` / `pi` / `hermes`). Builds on the v0.6.0 enrichment + `recordMissionExchange` wiring; memory stays off by default in tests and is a silent no-op when Honcho is unconfigured. Tunable via `HONCHO_SEARCH_LIMIT` (default 8) and `HONCHO_TOOL_PREVIEW_LENGTH` (default 500).
- **DX hardening (Phase 0)** ([UH-131](https://linear.app/agenticengineering-agency/issue/UH-131), [#204](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/204) / [#205](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/205) / [#206](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/206)) — `uh --version` now reads the real version from `package.json`; an opt-in PostHog telemetry primitive (`UH_TELEMETRY`, unwired pending the [UH-135](https://linear.app/agenticengineering-agency/issue/UH-135) follow-up); adoption docs (`docs/{quickstart,configuration,runtime-targets,telemetry,troubleshooting,plugin-development}.md`); a curated npm `files:` allowlist; and CI plugin gates.

### Changed

- **UH-129 team `integration_report_path` default** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — now defaults under `.harness/missions/<id>/team/` instead of the mission root, keeping team artifacts scoped per mission.
- Pinned the Hermes plugin test dependencies for deterministic CI ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)).

### Fixed

- **UH-127 verdict reclassification** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — team runs that partially succeed are now classified `passed_partial` instead of a false `BLOCKED`.
- **UH-128 per-worker artifact bleed** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — fixed cross-worker artifact contamination in team missions; each worker's artifacts stay isolated to its own worktree.
- **UH-130 constraints-advisory warning** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — surfaces an advisory warning when mission constraints are present but not enforced.

### Notes

- The native Anthropic adapter ships **experimental**: registered and routable, but not yet graduated to `active`. Graduation follows a live-smoke promotion record like the other adapters.
- The telemetry primitive is **unwired** — no events are emitted yet. It exists as the opt-in seam; instrumentation lands in the [UH-135](https://linear.app/agenticengineering-agency/issue/UH-135) follow-up. UH still ships no telemetry by default.
- **Deferred to v0.10.0+**: capability-declaration enforcement (manifest/mission `capabilities:` binding, warn + `--strict`); the telemetry instrumentation follow-up (UH-135).

## [0.8.0] — 2026-05-25

Milestone **"Sandbox isolation"** (GitHub milestone v0.8.0, issues #154 / #155 / #156). Promotes the `container` sandbox backend from a fail-fast stub to a real OpenSandbox-gated execution-isolation tier and graduates `oh-my-pi` to `active`.

### Added

- **`container` sandbox backend — OpenSandbox-gated execution isolation** (#155): replaces the #137 stub. `ContainerBackend` reuses `DirectoryBackend` for host-side materialization (so porcelain dirty detection + promotion are unchanged) and routes mission/verification commands through the OpenSandbox seam (`runOpenSandboxCommand` → `runOpenSandboxTemplate`). Env contract: `UH_OPENSANDBOX_ENABLED=1` + `UH_OPENSANDBOX_EXEC_COMMAND` (must contain `{command}`; optional `{cwd}`, `{image}`, `{timeout_ms}` placeholders); optional `UH_OPENSANDBOX_CREATE_COMMAND`, `UH_OPENSANDBOX_DELETE_COMMAND`, `UH_OPENSANDBOX_IMAGE` (default `python:3.12`), `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` (positive int ms, default 30000). Mock mode (`UH_OPENSANDBOX_MODE=mock`) for CI / dirty-roundtrip tests. Local smoke + claim-boundary table: [`docs/runbooks/container-sandbox.md`](docs/runbooks/container-sandbox.md). ADR: [`docs/architecture/sandbox-backends.md`](docs/architecture/sandbox-backends.md) (includes #154 spike + #157 lifecycle hardening sections).
- **`oh-my-pi` graduated to `status: active`** (#156): after the ToS posture documented in [`docs/runbooks/anthropic-via-omp.md`](docs/runbooks/anthropic-via-omp.md) and an `uh adapter check oh-my-pi` PASS against `omp/15.2.4`. The adapter manifest, scaffold template (`uh adapter add oh-my-pi`), README adapter table + capability summary, ROADMAP, and the docs-site mirror all reflect `active`. Mirrors the v0.7.0 vanilla `pi` graduation — same surface, same posture, same opt-in responsibility model. The runbook gained a dated v0.8.0 graduation subsection; the ToS-clean alternative (native `ANTHROPIC_API_KEY` adapter) is still planned for v0.9.0.

### Changed

- `runOpenSandboxTemplate` spawns commands in the sandbox-bound `cwd` (the host worktree) rather than `process.cwd()` so `verify` / create / delete templates with relative paths resolve against the sandbox (#157).
- `ContainerBackend.teardown` runs `UH_OPENSANDBOX_DELETE_COMMAND` unconditionally when configured; forced / orphan discards spawn from `ctx.root` when the worktree has already been removed so external sandbox resources cannot leak (#157).
- Lifecycle timeouts are configurable via `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` (positive int ms, default 30000), with fail-fast validation surfacing the variable name on bad input (#157).

### Notes

- **No fallback to a lean in-house OCI/docker-CLI backend is authorized by this release** — the ADR pivot rule stands. The container path is OpenSandbox-only unless the lead approves a pivot.
- **CI does not exercise live container execution** — Depot runners have no container runtime. The OpenSandbox mock mode covers schema + lifecycle plumbing in CI; live evidence is in [`docs/runbooks/container-sandbox.md`](docs/runbooks/container-sandbox.md).
- **macOS isolation reality** — on macOS the boundary is the host's Linux VM (Docker Desktop / OrbStack / Colima). Firecracker / KVM / gVisor / Kata claims require a Linux host with a configured secure runtime, per the ADR per-OS table.
- **Deferred to v0.9.0+**: AgentFS as a filesystem backend (FS-only, not execution); native Anthropic adapter; Honcho MCP tools + opt-out; capability-declaration enforcement (`--strict`).

## [0.7.0] — 2026-05-24

Milestone **"Adapter expansion & sandbox backends"** (GitHub issues #133–#141 under the `v0.7.0` milestone; Linear UH-112–UH-121 — backfilled when the Linear workspace was upgraded post-release). Builds on v0.6.0's cost-aware routing by adding cheaper routing targets and broader sandbox isolation.

### Added

- **OpenRouter adapter** (#134) — OpenAI-compat HTTP client for openrouter.ai, the cheapest pay-per-token routing target. API key via `OPENROUTER_API_KEY` (never stored in the manifest); a missing key degrades `uh adapter check openrouter` gracefully (the CI-skip signal) and makes `mission run` fail fast via a plan error. Optional HTTP-Referer / X-Title ranking headers. Registered as a first-class routable adapter (auto-route, capabilities, `uh adapter add openrouter`).
- **Vanilla `pi` adapter** (#135, #150) — the base pi agent CLI that oh-my-pi (`omp`) extends; CLI-exec (`pi --print --mode json --no-session`), `config.cli_command` overridable. Registered active (TEAM_ADAPTER_IDS, capabilities, `uh adapter add pi`). Flag surface + output parsing verified against live `pi` v0.73.1 (#150 fixed the parser to read pi's `message_end`/content-block shape).
- **Sandbox backend abstraction + `directory` backend** (#136) — a `SandboxBackend` interface behind `uh sandbox create --backend <git-worktree|directory>`. The `directory` backend is a self-contained local clone (hard-linked objects) that does not register with the parent repo's worktree list or branch namespace.
- **`container` sandbox backend** (#137) — registered as a fail-fast stub with an ADR ([`docs/architecture/sandbox-backends.md`](docs/architecture/sandbox-backends.md)); the implementation is deferred pending a container runtime in CI.
- **Verify-then-promote auto-trigger** (#139) — opt-in `sandbox.promotion_policy: auto-on-verify`; a passed `uh verify` auto-promotes. The default `human-approved` still requires a manual `uh mission promote`; a typo'd policy never auto-promotes.
- **OpenRouter setup runbook** plus ROADMAP / README adapter-table updates (#140).

### Changed

- Extracted the mission-artifact helper block (path-safety guards + prompt/session/event writers) duplicated across `hermes` / `codex` / `oh-my-pi` / `hermes-proxy` into a single `src/adapters/_artifact-context.ts` (#133). Pure, behaviour-neutral refactor.

### Notes

- **Capability-match enforcement** (#138) was found already implemented (`enforceRuntimePreflight` → `assertRuntimeRequirements`, with a `--force` escape hatch) and was closed as evidence-ready; the ROADMAP "advisory-only" note was stale.
- **Deferred:** `oh-my-pi` graduation to `active` (ToS posture) — tracked on the road-to-1.0. (The vanilla `pi` adapter shipped in this release; see Added.)

## [0.6.0] — 2026-05-23

Epic 7 (adapter capability routing + cost) and Epic 8 (SDD hardening) completed, plus a suite-health pass and CI/release hygiene. Several v0.5.0 gaps were corrected: the UH-101 auto-router (claimed shipped but absent) was implemented, and token-usage capture (assumed by the cost features) was added.

### Added

- **Honcho memory for `codex` + `hermes`** ([UH-59](https://linear.app/agenticengineering-agency/issue/UH-59) follow-up): both adapters now enrich the dispatched prompt with persistent memory and record the exchange after a run (mirroring `oh-my-pi`); env-gated and a no-op when Honcho is disabled. Adds `basePrompt` to their run plans.
- **Spec-adherence judge** (Epic 8 / [UH-110](https://linear.app/agenticengineering-agency/issue/UH-110)): `uh validate --judge --spec <path>` grades whether the diff (`<base>...HEAD`) satisfies a spec's acceptance criteria via an LLM, returning a structured `{adherence, missing_ac, evidence}` verdict (exit 1 on `fail`). Opt-in; dispatches a one-shot through a configured hermes-proxy runtime. New `src/harness/spec-judge.ts` (pure prompt/verdict, injectable runner).
- **Spec template library** (Epic 8 / [UH-111](https://linear.app/agenticengineering-agency/issue/UH-111)): `uh spec template [feature|epic] [--out <path>] [--list]` emits starter `uh.spec.v0` documents. Templates are source-of-truth TS constants (ship in the package) mirrored to `docs/specs/templates/`, with a drift-guard test. New `src/harness/spec-templates.ts`.
- **Running-now grid** (Epic 6 / [UH-97](https://linear.app/agenticengineering-agency/issue/UH-97)): `GET /api/uh/runs/active` scans each mission's `latest.json` for in-flight runs; the dashboard Overview shows a "Running now (N)" card (auto-hidden when idle) linking into each live run.
- **Per-run cost gauge** (Epic 6 / [UH-96](https://linear.app/agenticengineering-agency/issue/UH-96)): the dashboard `LiveEventsPane` header shows live token totals (↑input ↓output) and estimated USD, aggregated from `runtime.usage` events. `$/Mtok` rates are sourced from the harness via `GET /api/uh/adapters/capabilities` (new `cost_classes` field) — no duplicated rate constants in the frontend. New `apps/hermes-plugin/dashboard/src/cost-gauge.ts`.
- **hermes-proxy live capability probe** (Epic 7 / [UH-103](https://linear.app/agenticengineering-agency/issue/UH-103)): `uh adapter capabilities --probe` fetches `<endpoint>/capabilities` and merges a (partial) capability document over the static manifest, falling back to static on 404/error/malformed. Forward-looking — proxies don't serve this yet, so it's a safe no-op today. New `src/adapters/capabilities/hermes-proxy-probe.ts`.
- **Cost forecast** (Epic 7 / [UH-104](https://linear.app/agenticengineering-agency/issue/UH-104)): `uh adapter cost-forecast --mission <id> [--adapter auto|<id>]` averages a mission's past-run `runtime.usage` tokens (heuristic fallback when no history) and prices them by the adapter's cost class. New `uh adapter capabilities --json`. Plugin endpoints `GET /api/uh/adapters/capabilities` + `POST /api/uh/missions/{id}/cost-forecast` shell the CLI so cost math stays single-sourced. New `src/harness/cost-forecast.ts`.
- **Token-usage capture**: adapters now emit a `runtime.usage` event per run (prerequisite for cost-forecast + the dashboard cost gauge). hermes-proxy records **real** tokens from the OpenAI-style `usage` field; codex / hermes / oh-my-pi emit a deterministic estimate (chars/4) tagged `source: "estimated"`. New `src/harness/usage.ts`.
- **Adapter auto-routing** (Epic 7 / [UH-101](https://linear.app/agenticengineering-agency/issue/UH-101)): `uh mission run --auto` selects the cheapest installed adapter whose capability manifest satisfies the mission's `runtime_requirements`; `--auto --explain` prints the decision matrix. New `src/harness/auto-route.ts` (`chooseAdapter`), reusing `evaluateAdapterEligibility` (UH-102) and `compareCostClass`. Closes a gap where v0.5.0 listed UH-101 as shipped but the routing code was never landed.

### Fixed

- `Publish package` workflow re-ran on every push to `main`, failing with `403 cannot publish over the previously published versions`; now gated to `v*` tags / releases / manual dispatch with an idempotency guard that skips when the version already exists ([UH-91](https://linear.app/agenticengineering-agency/issue/UH-91), [#112](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/112)). npm publish was never actually blocked — 0.3.0/0.4.0/0.5.0 are all live.

### Changed

- Test suite is hermetic and deterministic ([#113](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/113)): Honcho memory forced off by default in tests (the suite was hitting the live Honcho API via a developer's `HONCHO_API_KEY`), wall-clock assertions gated behind `UH_PERF=1`, and generous timeouts for real-subprocess tests.

## [0.5.0] — 2026-05-20

Epics 6–8 integrated on `dev` from feature branches (live observability, adapter auto-routing, SDD hardening). Execution spec: [`docs/specs/epics-6-7-8.md`](docs/specs/epics-6-7-8.md).

### Added

**Epic 6 — Hermes plugin live runs & observability**

- Disk-backed SSE endpoint tailing per-run `events.ndjson` with keepalive and byte-offset resume ([UH-93](https://linear.app/agenticengineering-agency/issue/UH-93)).
- `LiveEventsPane` in mission drilldown reusing run-modal tail patterns ([UH-94](https://linear.app/agenticengineering-agency/issue/UH-94)).
- Cancel running mission by `run_id` from drilldown, Run modal, and `uh mission cancel` CLI ([UH-95](https://linear.app/agenticengineering-agency/issue/UH-95)).
- Runbook: [`docs/runbooks/plugin-live-events-smoke.md`](docs/runbooks/plugin-live-events-smoke.md).

**Epic 7 — Adapter capability matrix & runtime auto-routing**

- `AdapterCapabilities` Zod schema and per-adapter manifests (`hermes`, `hermes-proxy`, `codex`, `oh-my-pi`) ([UH-100](https://linear.app/agenticengineering-agency/issue/UH-100)).
- `chooseAdapter` + `uh mission run --auto` routing by mission `runtime_requirements` and installed adapters ([UH-101](https://linear.app/agenticengineering-agency/issue/UH-101)).
- Preflight validator enforcing `runtime_requirements` separately from mission `capabilities` ([UH-102](https://linear.app/agenticengineering-agency/issue/UH-102)).
- Static cost-class table for routing hints ([`src/harness/cost-table.ts`](src/harness/cost-table.ts)).

**Epic 8 — Spec-Driven Development hardening**

- Spec loader + `uh propose --from <spec.md>` mission bootstrap ([UH-107](https://linear.app/agenticengineering-agency/issue/UH-107)).
- `uh spec scaffold` — acceptance-criteria → Vitest `it.todo` scaffold generator ([UH-108](https://linear.app/agenticengineering-agency/issue/UH-108)).
- `spec-stale` validate-drift kind + `--strict-spec` CLI flag ([UH-109](https://linear.app/agenticengineering-agency/issue/UH-109)).

### Changed

- Hermes plugin bundle ships at **43.4 KB** (50 KB cap). Plugin manifest version **0.5.0**.

### Known follow-ups

- [UH-91](https://linear.app/agenticengineering-agency/issue/UH-91) — npm publish workflow fix landed in v0.6.0 (#112, idempotency guard + `v*` tag gate); npm `latest` has been current through v0.6.0 / v0.7.0 / v0.8.0.
- Linear epics UH-92 (Epic 6) / UH-99 (Epic 7) / UH-106 (Epic 8) and the child issues UH-93–UH-97 / UH-100–UH-104 / UH-107–UH-111 were backfilled to Linear when the workspace was upgraded post-release; previously this block noted they were "not filed via MCP during this cut".
- Later/Optional slices UH-98 + UH-105 were canceled (no operator gap surfaced) and recorded in Linear as such; UH-110 / UH-111 shipped in v0.6.0.

## [0.4.0] — 2026-05-20

### Fixed

- `runtime.cancelled` event handler now emits a single-line stderr warning when no `latest.json` pointer exists (instead of silently skipping). Quiet via `UH_QUIET_CANCEL=1` for tests. Closes the operator-visibility gap left open by UH-82.

### Added

- Run history retention policy: plugin manifest `max_runs_per_mission` cap (default null = unlimited). Oldest per-run dirs are pruned on each new run; `runs/index.json` entries persist with `archived: true` so the audit trail is preserved ([UH-90](https://linear.app/agenticengineering-agency/issue/UH-90)).
- New `orphaned-run-dir` drift kind for `uh validate --repair`: detects `.harness/missions/<id>/runs/<run_id>/` directories that have no corresponding entry in `runs/index.json` (idempotent `rm -rf` repair). Closes a UH-82 follow-up.
- `uh mission run --runtime-config-overrides <json>` flag merges JSON-encoded overrides on top of the mission's `runtime_config_overrides` block. The Hermes plugin Run modal now passes user-supplied overrides through ([UH-81](https://linear.app/agenticengineering-agency/issue/UH-81)).
- Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/` with a `latest.json` pointer and append-only `runs/index.json` history. Concurrent runs of the same mission no longer interleave; the Hermes plugin's per-run route now serves the correct run ([UH-82](https://linear.app/agenticengineering-agency/issue/UH-82)).
- Recent runs pane on the Hermes Dashboard Mission detail tab with sortable columns, status-chip filtering, and run-id prefix search. Click a row to drill into that run's artifacts ([UH-85](https://linear.app/agenticengineering-agency/issue/UH-85), [UH-86](https://linear.app/agenticengineering-agency/issue/UH-86), [UH-88](https://linear.app/agenticengineering-agency/issue/UH-88)).
- `UH_TUI_THEME=dark|light|system` palette switch with full `src/tui/theme.ts` palette module ([UH-48](https://linear.app/agenticengineering-agency/issue/UH-48)).
- Ctrl+Z / `fg` suspend-resume lifecycle in the TUI, backed by OpenTUI 0.2.13's `renderer.suspend()` / `renderer.resume()` ([UH-50](https://linear.app/agenticengineering-agency/issue/UH-50)).
- `uh tui screenshot --view <name> --out <path>` automated capture pipeline with `overview` / `missions` / `sandboxes` / `workflows` views ([UH-51](https://linear.app/agenticengineering-agency/issue/UH-51)).
- `e` opens the current mission manifest in `$EDITOR` from the TUI mission detail view, suspending and resuming the renderer cleanly ([UH-49](https://linear.app/agenticengineering-agency/issue/UH-49)).
- Compare two runs side-by-side: new `MissionCompare` view with runtime-result field diff, prompt.md line diff (LCS-based, no new dep), and events.ndjson side-by-side stream. Triggered via "Compare" mode on the Recent runs pane ([UH-89](https://linear.app/agenticengineering-agency/issue/UH-89)).
- Replay a historical run: "Replay" button on Recent runs rows + per-run drilldown opens the Run modal pre-filled with the source run's `runtime_config_overrides`; `runs/index.json` carries the `replay_of` lineage ([UH-87](https://linear.app/agenticengineering-agency/issue/UH-87)).

### Changed

- `uh mission run` now accepts `--run-id <id>` for deterministic per-run artifact paths; the Hermes plugin passes the id it generates so dashboard, CLI, and on-disk artifacts all agree. The previous 409 `run_already_active` guard is gone — per-run directories make concurrent same-mission runs safe.
- `RunHermesResult` / `RunCodexResult` / `RunOhMyPiResult` / hermes-proxy `RunResult` now carry the `runId` of the directory they wrote.
- `runtime-result.yaml` is still mirrored to the mission root after each run, so `uh status`, validate-drift, and the dashboard's `last_run` field keep working without learning per-run paths.

## [0.3.0] — 2026-05-20

Two epics shipped end-to-end plus a deep discipline-layer pass distilled from [GSD-2](https://github.com/gsd-build/gsd-2) research. 26+ correctness findings caught and fixed under [Codex](https://github.com/apps/chatgpt-codex-connector) adversarial review across 13 rounds on the Hermes plugin alone.

### Added

- **Epic 3 — Hermes Dashboard plugin** ([UH-60](https://linear.app/agenticengineering-agency/issue/UH-60), [#89](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89))
  - Drop-in Hermes plugin at `apps/hermes-plugin/` exposing UH from the Hermes web UI: adapter health, mission browser, run trigger with SSE live tail, prompt/final-message/diff/runtime-result drilldown, workflow + verification viewers, theme YAML, sessions cross-link, first-run wizard, install runbook (UH-61..UH-69).
  - FastAPI bridge that shells out to the `uh` CLI; no daemon, no FFI, no Hermes fork. Watchdog enforces `UH_RUN_TIMEOUT_S`. Solid bundle ships at 25.5 KB (50 KB cap).
- **Epic 4 — Team mission shape** ([UH-70](https://linear.app/agenticengineering-agency/issue/UH-70), [#87](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/87) + [#88](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/88) + [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90))
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
- **Honcho persistent-memory extension** ([UH-59](https://linear.app/agenticengineering-agency/issue/UH-59), [#83](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/83)) — env-driven enrich/record at the harness layer for `oh-my-pi`, with fail-fast misconfig and graceful network degradation.

### Changed

- `mission run` now writes `events.ndjson`, `runtime-result.yaml`, `final-message.md`, and (for team missions) `integration-report.md` under `.harness/missions/<id>/`; per-run subdirectories are a follow-up ([UH-82](https://linear.app/agenticengineering-agency/issue/UH-82)).
- All adapters (`hermes`, `hermes-proxy`, `codex`, `oh-my-pi`) now consume a single pre-inlined dispatch-context contract (UH-80), removing per-adapter prompt drift.

### Fixed

- Codex adversarial review on PR #89 caught and fixed 26+ correctness issues before merge: SSE drain races, cancel-vs-natural-exit races, watchdog leaks, path traversal, symlink artifact disclosure, `_active_runs` unbounded growth, started-byte-offset capture order, `get_mission` blast radius on corrupt YAML, `runId` sanitization, concurrent-run guard (409), `is_run_scoped` mislabeling, `decodeURIComponent` crash on malformed hash, and more. Detail: [PR #89 conversation](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89).
- PR #87 Codex pass caught the team-mission `MergeOutcome.failed` propagation gap; fixed in [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90).

### Known follow-ups (filed)

- [UH-81](https://linear.app/agenticengineering-agency/issue/UH-81) — Real `--runtime-config-overrides` CLI support. The Hermes plugin's Run modal currently 400-rejects non-empty overrides (`overrides_not_yet_supported`).
- [UH-82](https://linear.app/agenticengineering-agency/issue/UH-82) — Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/`. The plugin's per-run route surfaces `is_run_scoped: false` + banner.
- [UH-83](https://linear.app/agenticengineering-agency/issue/UH-83) — Activate `.github/workflows/release-plugin.yml` (staged at `docs/ci/release-plugin.yml.example`).

## [0.2.0] — 2026-05-19

### Added

- **Epic 1 — Hermes proxy adapter** ([UH-32](https://linear.app/agenticengineering-agency/issue/UH-32)) promoted to `status: active` after live E2E smoke against `hermes proxy start --provider nous` ([#49](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/49)..[#55](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/55)).
- **Epic 2 — Interactive TUI** ([UH-41](https://linear.app/agenticengineering-agency/issue/UH-41)) on OpenTUI (Solid bindings, Bun preload): dashboard, mission browser, run flow, adapter+sandbox manager, keymap overlay, per-project persistence ([#52](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/52), [#57](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/57), [#59](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/59), [#61](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61), [#63](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/63), [#64](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/64), [#65](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/65)).
- Spec-Driven Development discipline ([UH-54](https://linear.app/agenticengineering-agency/issue/UH-54), [#68](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/68)) — structured `acceptance_criteria` with per-AC verify.
- Test-Driven Development discipline ([UH-55](https://linear.app/agenticengineering-agency/issue/UH-55), [#69](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/69)) — `tdd` workflow profile + test-first verify gate.
- Cross-runtime QA harness ([UH-56](https://linear.app/agenticengineering-agency/issue/UH-56), [#70](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/70)) — `uh mission run-all` with side-by-side adapter comparison.
- Runtime intelligence + operator polish ([UH-57](https://linear.app/agenticengineering-agency/issue/UH-57), [#77](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/77)) — TUI screenshot capture, adapter-check age footer, `runtime.cancelled` event, mission capability enforcement.
- Package rename + CI publish ([UH-58](https://linear.app/agenticengineering-agency/issue/UH-58), [#79](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/79)) — `@agenticengineeringagency/ultimate-harness` with `publishConfig.access=public`, dry-run + release-publish workflow.

## [0.1.0] — 2026-05-17

Initial public release. Adapter framework (`hermes`, `codex`, `oh-my-pi`), mission schema, runtime-result artifact contract, verification + promotion pipeline.

[0.6.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/tag/v0.1.0
