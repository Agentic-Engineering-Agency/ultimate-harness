# Capability inventory: what UH claims, what is unit-tested, what is proven live

Scope: every capability UH claims through the `uh` CLI, the `CHANGELOG.md`
sections `[Unreleased]`, `[0.11.0]`, `[0.10.0]`, `[0.9.0]`, `[0.8.0]`,
`[0.7.0]` and `[0.6.0]`, the `docs/ROADMAP.md` "Now" section, and
`docs/acceptance/README.md`.

Authority order: `src/cli.ts` command registrations first (one row per leaf
command), then `CHANGELOG.md` claims (merged into a command row when they are
the same thing), then the roadmap and acceptance registry.

Class definitions (per mission):

- **proven** — acceptance evidence marked `passed` at the current commit.
- **unit-only** — at least one test file exercises the implementation with
  fixtures, fakes or injected process state, and there is no live evidence.
- **untested** — no test file references the implementation.
- **unknown** — could not determine; the notes column says why.

Method: `src/cli.ts` was read in full for leaf registrations. Test coverage is
derived from the import graph under `tests/` and from CLI-subprocess test files
(`tests/cli-*.test.ts`, `tests/sandbox.test.ts`, `tests/skill.test.ts`,
`tests/propose.test.ts`). Live evidence was checked directly: there is no
`acceptance/evidence/` directory in this checkout, no `.harness/missions/*/runs/`
directory, and no `latest.json` anywhere. Every acceptance entry therefore has
**no** live evidence, and **no row can be `proven`**. `docs/acceptance/README.md`
reports 19 `unproven` and 1 `fixture_only` (`R10-stall`); that matches the
registry in `acceptance/registry.yaml`.

## 1. Capability table

| capability | where implemented (file: exported function) | unit tests | acceptance id | live evidence | class | notes |
|---|---|---|---|---|---|---|
| `uh init` | src/cli.ts: `init` action; src/harness/init.ts: `initializeHarness` | tests/init.test.ts; tests/cli-smoke.test.ts | none | none | unit-only | cli-smoke spawns the real CLI against a temp project. |
| `uh validate` (file / --all-workflows / --all-missions) | src/harness/validate.ts: `validateFile`, `validateAllWorkflows`, `validateAllMissions` | tests/validate.test.ts; tests/cli-smoke.test.ts | none | none | unit-only | Fixture YAML only. |
| `uh validate --repair` drift detection | src/harness/validate/drift/registry.ts: `runDrift`, `groupByKind`, `DRIFT_KINDS` | tests/validate-drift.test.ts; tests/validate-drift-spec-stale.test.ts | none | none | unit-only | Each drift kind is a pure function over fixture files. |
| `uh validate --judge` spec-adherence judge | src/harness/spec-judge.ts: `judgeSpecAdherence`, `oneShotOpenAI`; src/harness/spec-loader.ts: `loadSpecFile` | tests/spec-judge.test.ts | none | none | unit-only | The model runner is injected; no live hermes-proxy call is made. |
| `uh status` | src/harness/status.ts: `getStatus` | tests/status.test.ts | none | none | unit-only | Reads fixture `.harness/` state. |
| `uh status --json` | src/harness/status-json.ts: `getStatusJson`, `STATUS_JSON_SCHEMA` | tests/status-json.test.ts; tests/cli-smoke.test.ts | none | none | unit-only | cli-smoke asserts `schema_version: uh.status.v0`. |
| `uh acceptance run` | src/harness/acceptance.ts: `runAcceptance` | tests/acceptance.test.ts | none | none | unit-only | `runAcceptance` is tested through fixture seams only; no registered capability has ever executed live (docs/acceptance/README.md: all unproven). |
| `uh acceptance status` | src/harness/acceptance.ts: `acceptanceStatus`, `classifyAcceptance` | tests/acceptance.test.ts | none | none | unit-only | Classification logic tested; no evidence files exist to classify. |
| `uh acceptance report` | src/harness/acceptance.ts: `writeAcceptanceReport`, `renderAcceptanceReport` | tests/acceptance.test.ts | none | none | unit-only | Rendering tested; the generated docs/acceptance/README.md is the product. |
| `uh observatory snapshot --json` | src/harness/delivery-observatory/project.ts: `projectDeliveryObservatory` | tests/delivery-observatory.test.ts; tests/runtime-events.test.ts | none | none | unit-only | Reads fixture run artifacts. |
| `uh observatory runs` (+ `--group-by`) | src/harness/experience-store.ts: `indexRuns`, `summarizeRuns`, `paretoFrontier` | tests/experience-store.test.ts; tests/cli-observatory.test.ts | none | none | unit-only | CLI test feeds synthetic run directories. |
| `uh observatory compare` | src/harness/run-comparison.ts: `compareArms`, `attemptsToMatch`, `bestOfN` | tests/run-comparison.test.ts; tests/cli-observatory.test.ts | none | none | unit-only | Wilson-interval math over fixture runs; no real run set compared. |
| `uh observatory export --otlp` | src/harness/otel-export.ts: `exportRunToOtlp` | tests/otel-export.test.ts; tests/cli-observatory.test.ts | none | none | unit-only | Converts a fixture run directory; no trace ever shipped to a collector. |
| `uh verify` | src/harness/verify.ts: `verifyMission` | tests/verify.test.ts; tests/independent-review.test.ts; tests/team-run.test.ts | none | none | unit-only | Checks run real shell commands in a temp tree, but no mission was ever verified live. |
| `uh promote` | src/harness/promote.ts: `promoteMission` | tests/promote.test.ts | none | none | unit-only | Fixture verification.yaml; no promoted mission in this repo. |
| `uh propose` | src/harness/propose.ts: `proposeMission` | tests/propose.test.ts | none | none | unit-only | propose.test.ts spawns the real CLI and validates the written mission. |
| `uh propose --from` spec bootstrap | src/harness/propose.ts: `proposeMissionFromSpec`; src/harness/spec-loader.ts | tests/spec-loader.test.ts | none | none | unit-only | Fixture `.spec.md` inputs. |
| `uh spec scaffold` | src/harness/test-scaffold.ts: `scaffoldTestsFromSpec`, `parseScaffoldLang` | tests/spec-scaffold.test.ts | none | none | unit-only | Writes Vitest `it.todo` stubs; scaffolding only. |
| `uh spec template` | src/harness/spec-templates.ts: `getSpecTemplate`, `listSpecTemplates` | tests/spec-templates.test.ts | none | none | unit-only | Pure string output. |
| `uh adapter list` | src/harness/registry.ts: `runtimeRegistry.list` | tests/registry.test.ts; tests/adapter.test.ts | none | none | unit-only | Fixture manifests. |
| `uh adapter check` | src/harness/registry.ts: `runtimeRegistry.check` | tests/registry.test.ts | none | none | unit-only | Checker behaviour tested with injected checkers; real `hermes`/`codex` binaries are not proven. |
| `uh adapter add` | src/harness/adapter-add.ts: `addAdapter`, `listAdapterTemplates` | tests/cli-template.test.ts; tests/claude-code.test.ts; tests/acp.test.ts | none | none | unit-only | Writes the built-in manifest template. |
| `uh adapter capabilities` | src/adapters/capabilities/index.ts: `CAPABILITIES`, `listAdapterIds` | tests/adapter-capabilities.test.ts; tests/cli-smoke.test.ts | none | none | unit-only | Static capability table. |
| `uh adapter capabilities --probe` | src/adapters/capabilities/hermes-proxy-probe.ts: `probeHermesProxyCapabilities` | tests/hermes-proxy-probe.test.ts | none | none | unit-only | Fetch is stubbed; no live `/capabilities` endpoint is hit. |
| `uh adapter cost-forecast` | src/harness/cost-forecast.ts: `forecastCost`, `costUsd`, `readUsageHistory`; src/harness/cost-table.ts | tests/cost-forecast.test.ts | none | none | unit-only | Heuristic fallback over fixture usage history. |
| `uh mission review-prepare` | src/harness/independent-review.ts: `prepareIndependentReview` | tests/independent-review.test.ts | none | none | unit-only | Builds the review packet; no reviewer runtime is launched. |
| `uh mission review-collect` | src/harness/independent-review.ts: `collectIndependentReview`, `validateIndependentReviewReport` | tests/independent-review.test.ts | none | none | unit-only | Hash-bound report validation over fixtures. |
| `uh mission create` | src/harness/mission.ts: `createMission` | tests/mission.test.ts | none | none | unit-only | Writes a scaffold mission packet. |
| `uh mission new` (+ `--design`) | src/harness/mission.ts: `createMission` (`withDesign`) | tests/mission-design.test.ts | none | none | unit-only | design.md backfill is asserted against the written file. |
| `uh mission show` | src/cli.ts: `mission show` action (inline `loadMissionFile` + design.md readback) | none | none | none | untested | No test invokes `mission show`. `loadMissionFile` is exercised elsewhere, but the command's own formatting and design.md readback are uncovered. |
| `uh mission verdict` | src/harness/verdict.ts: `recordManualVerdict` | tests/verdict.test.ts | none | none | unit-only | Mutates a fixture runtime-result.yaml. |
| `uh mission dry-run` | src/cli.ts wiring; src/adapters/*.ts `dryRun*` (e.g. `dryRunOhMyPi`, `dryRunCodex`, `dryRunCommandCode`) | tests/dry-run-overrides.test.ts; tests/cli-template.test.ts | none | none | unit-only | Prints a planned command; never spawns a runtime. |
| `uh mission run` | src/cli.ts `RUNTIME_WIRINGS`; src/adapters/*.ts `run*` runners; src/harness/runtime-attempt.ts | tests/cli-observatory.test.ts; tests/prompt-transmission.test.ts; tests/runtime-*.test.ts | none | none | unit-only | cli-observatory drives the real CLI but every run settles `blocked`; adapter run tests inject fake runners. No adapter dispatch has ever completed live here. |
| `uh mission cancel` | src/harness/mission-cancel.ts: `cancelLocalMissionRun`, `cancelMissionRunViaPlugin` | tests/mission-cancel.test.ts; tests/runtime-settlement.test.ts; tests/runtime-process.test.ts | R5 | none | unit-only | Tests use synthesized run artifacts and injected process state; the live guardian-receipt settlement path is never exercised. |
| `uh mission run-all` | src/harness/run-all.ts: `runMissionAcrossRuntimes`, `persistRuntimeComparison` | tests/run-all.test.ts | none | none | unit-only | `runtimeRunner` is injected; no multi-adapter run happened. |
| `uh mission run-team` | src/harness/team-run.ts: `runTeamMission` | tests/team-run.test.ts; tests/team-salvage.test.ts; tests/team-commit-hygiene.test.ts; tests/worktree-lock.test.ts | C1, S1, S2, S3 | none | unit-only | `runnerFor` and `verifier` are injected fakes; no worker wave has ever run. |
| `uh sandbox create` | src/harness/sandbox.ts: `createSandbox` | tests/sandbox.test.ts | none | none | unit-only | Real git worktree creation against a temp repo, but no mission used it. |
| `uh sandbox list` | src/harness/sandbox.ts: `listSandboxes` | tests/sandbox.test.ts | none | none | unit-only | CLI-level test. |
| `uh sandbox status` | src/harness/sandbox.ts: `getSandboxStatus` | tests/sandbox.test.ts | none | none | unit-only | CLI-level test. |
| `uh sandbox discard` | src/harness/sandbox.ts: `discardSandbox` | tests/sandbox.test.ts | none | none | unit-only | CLI-level test. |
| `uh skill add` | src/harness/skill.ts: `addSkill` | tests/skill.test.ts | none | none | unit-only | CLI-level test. |
| `uh skill list` | src/harness/skill.ts: `listSkills` | tests/skill.test.ts | none | none | unit-only | CLI-level test. |
| `uh skill check` | src/harness/skill.ts: `checkSkill` | tests/skill.test.ts | none | none | unit-only | CLI-level test. |
| `uh tui` | src/cli.ts `tui` action spawning Bun; src/tui/index.tsx and src/tui/*.ts | tests/cli-tui.test.ts; tests/tui-state.test.ts; tests/tui-model.test.ts; tests/tui-keymap.test.ts; tests/tui-theme.test.ts | none | none | unit-only | cli-tui only asserts registration/help; the OpenTUI/Solid render is never exercised in the suite. |
| `uh tui screenshot` | src/tui/screenshot-pipeline.ts; src/tui/screenshot.tsx | tests/tui-screenshot-pipeline.test.ts | none | none | unit-only | Pure frame pipeline tested; Bun render invocation not. |
| `uh mcp serve` | src/harness/mcp-server.ts: `serveMcpStdio`, `createMcpServer` | tests/mcp-server.test.ts; tests/cli-mcp.test.ts | none | none | unit-only | cli-mcp speaks real JSON-RPC over stdio to the spawned CLI. |
| ACP runtime adapter (`acp`) | src/adapters/acp.ts: `runAcp`, `checkAcp`, `planAcpRun`, `AcpClient`, `extractAcpAgentText` | tests/acp.test.ts | none | none | unit-only | Tests drive a scripted ACP client; no live ACP agent process is run. |
| Progressive semantic routing | src/harness/auto-route.ts: `chooseSemanticRoute` | tests/auto-route.test.ts | none | none | unit-only | The TypeSafe System One classifier is injected/faked; no live classification. |
| Mission `decision_policy` schema | src/schema/mission.ts: `DecisionPolicySchema` | tests/auto-route.test.ts; tests/typesafe.test.ts | none | none | unit-only | Schema parse tests only. |
| `guard.allow_native_subagents` + native sub-agent denial | src/harness/tool-guard.ts: `decideToolCall` | tests/tool-guard-agent-clients.test.ts | none | none | unit-only | Pure decision function. |
| Delegated-agent route attestation | src/harness/runtime-supervision.ts: `nativeDelegatedRoutes` | tests/runtime-delegated-route.test.ts | none | none | unit-only | Synthetic native event streams. |
| oh-my-pi per-run `omp-overlay.yml` | src/adapters/oh-my-pi.ts: `planOhMyPiRun` | tests/oh-my-pi-route-overlay.test.ts | none | none | unit-only | Asserts generated config content. |
| Project fleet policy | src/harness/fleet-policy.ts: `decideFleetAdmission`, `assertFleetAdmission`, `authorizedFleetAdapters` | tests/fleet-policy.test.ts | none | none | unit-only | Fixture `fleet.routes`. |
| Codex `runtime_config.model` + route attestation | src/adapters/codex.ts: run/plan exports | tests/codex.test.ts | none | none | unit-only | Fake runner; codex CLI never invoked. |
| `containment_escape` guard class | src/harness/tool-guard.ts: `decideToolCall` | tests/tool-guard-containment.test.ts | none | none | unit-only | Pure decision function. |
| `guard_tamper` guard class | src/harness/tool-guard.ts: `decideToolCall` | tests/tool-guard.test.ts | none | none | unit-only | Pure decision function. |
| `limits.max_thinking_ms` reasoning liveness | src/harness/runtime-supervision.ts: `RuntimeSupervision` | tests/runtime-supervision.test.ts | none | none | unit-only | Synthetic event windows. |
| Terminal contract (`UH_RESULT`, exit codes) | src/harness/exit-codes.ts: `exitCodeForRun`; src/cli.ts settlement payload | tests/exit-codes.test.ts; tests/cli-observatory.test.ts | none | none | unit-only | cli-observatory asserts blocked=2 and relative run_dir; no passing/cancelled live run. |
| Native event-stream loop-probe | src/harness/loop-probe.ts | tests/loop-probe.test.ts | none | none | unit-only | Fixture ndjson streams. |
| OTLP trace push client | src/harness/otlp-push.ts: `pushOtlpTraces` | tests/otlp-push.test.ts | none | none | unit-only | NOT exposed by any `uh` leaf command in src/cli.ts; tests inject a fetch, no live collector. |
| Team run salvage | src/harness/team-run.ts (salvage path) | tests/team-salvage.test.ts | none | none | unit-only | Injected workers; eligible branches are fixture worktrees. |
| Guarded project-root refusal (`mission run` without sandbox) | src/cli.ts: `mission run` sandbox guard block | tests/cli-observatory.test.ts | none | none | unit-only | The test asserts the refusal and the blocked UH_RESULT; it never runs a guarded worker in a root. |
| Token usage capture (`runtime.usage`) | src/harness/usage.ts: `usageFromOpenAI`, `estimateUsage`, `aggregateRuntimeUsage`, `estimateConfiguredCost` | tests/usage.test.ts | none | none | unit-only | Parsers tested on fixture payloads. |
| Guarded Command Code print-mode (fail-closed hooks) | src/adapters/command-code.ts: `planCommandCodeRun`, `runCommandCode`, `checkCommandCode` | tests/command-code.test.ts | G1 | none | unit-only | Plan/parse unit tests; registry G1 probes remain unproven. |
| Native Anthropic adapter (`anthropic`) | src/adapters/anthropic.ts | tests/anthropic.test.ts | none | none | unit-only | No live Messages-API call; graduation to `active` is pending live smoke (CHANGELOG 0.9.0). |
| Honcho memory operations + opt-out | src/extensions/honcho-memory/index.ts, client.ts, config.ts | tests/extension-honcho-memory.test.ts; tests/hermes.test.ts | none | none | unit-only | Fake client; real Honcho API never contacted. |
| Telemetry primitive (PostHog) | src/harness/telemetry.ts: `installTelemetryHooks` | tests/telemetry.test.ts | none | none | unit-only | CHANGELOG 0.9.0 marks it unwired: no events emitted, no PostHog call. |
| `container` sandbox backend | src/harness/sandbox-backends.ts: `ContainerBackend`, `runOpenSandboxCommand` | tests/sandbox-backends.test.ts; tests/sandbox.test.ts | none | none | unit-only | OpenSandbox mock mode only; CHANGELOG 0.8.0 states CI has no container runtime. |
| `directory` sandbox backend | src/harness/sandbox-backends.ts: `DirectoryBackend` | tests/sandbox-backends.test.ts | none | none | unit-only | Local clone backend; real git against a temp repo. |
| Verify-then-promote `auto-on-verify` | src/harness/verify.ts + src/harness/promote.ts auto-promote path | tests/verify.test.ts; tests/promote.test.ts | none | none | unit-only | Fixture verification result triggers the write. |
| OpenRouter adapter (`openrouter`) | src/adapters/openrouter.ts | tests/openrouter.test.ts | none | none | unit-only | No live HTTP; `OPENROUTER_API_KEY` path unproven. |
| `pi` adapter | src/adapters/pi.ts | tests/pi.test.ts | none | none | unit-only | Plan/parse tests against fixture output. |
| `oh-my-pi` adapter (`oh-my-pi`) | src/adapters/oh-my-pi.ts | tests/oh-my-pi.test.ts; tests/oh-my-pi-route-overlay.test.ts | none | none | unit-only | Injected `OhMyPiRunner`; `omp` binary never launched. |
| `hermes` adapter | src/adapters/hermes.ts | tests/hermes.test.ts; tests/adapter.test.ts | none | none | unit-only | Plan/run with injected runner. |
| `hermes-proxy` adapter | src/adapters/hermes-proxy.ts | tests/hermes-proxy.test.ts | none | none | unit-only | SSE parser + plan tests; no live proxy. |
| `codex` adapter | src/adapters/codex.ts | tests/codex.test.ts | none | none | unit-only | Injected runner; codex CLI never launched. |
| `claude-code` adapter | src/adapters/claude-code.ts | tests/claude-code.test.ts | none | none | unit-only | CHANGELOG 0.11.0 says "End-to-end coordinator delegation is not yet validated". |
| Adapter auto-routing `chooseAdapter` (UH-101) | src/harness/auto-route.ts: `chooseAdapter`, `formatAutoRouteExplain` | tests/auto-route.test.ts | none | none | unit-only | Deterministic selection over a fixture capability table. |
| Runtime requirements preflight | src/harness/runtime-requirements.ts: `assertRuntimeRequirements` | tests/runtime-requirements.test.ts | none | none | unit-only | Fixture missions. |
| Mission capability matching | src/harness/capabilities.ts: `assertRuntimeCapabilities` | tests/capabilities.test.ts | none | none | unit-only | Fixture manifests. |
| Runtime supervision (denial budget, protected-path stop, repeated failure, turn limit) | src/harness/runtime-supervision.ts: `RuntimeSupervision` | tests/runtime-supervision.test.ts; tests/tool-guard.test.ts | G2, G3, R7 | none | unit-only | Synthetic event streams; registry G2/G3/R7 probes unproven. |
| Deadline grace delivery | src/harness/runtime-recovery.ts (on_deadline path) | tests/runtime-recovery.test.ts; tests/runtime-settlement.test.ts | R11 | none | unit-only | Fixture control receipts; registry R11-deadline-grace unproven. |
| Controller-loss recovery | src/harness/runtime-settlement.ts: `reconcileRuntimeSettlement`; src/harness/runtime-recovery.ts | tests/runtime-settlement.test.ts | R10 | none | unit-only | Synthesized settled attempt; registry R10-controller-loss unproven. |
| Stall recovery | src/harness/runtime-supervision.ts + src/harness/runtime-recovery.ts | tests/runtime-supervision.test.ts; tests/runtime-recovery.test.ts | R10 | none | unit-only | Registry R10-stall is the single fixture_only entry in docs/acceptance/README.md; no real stall has been produced. |
| Repeated-failure stop and recovery | src/harness/runtime-supervision.ts + src/harness/runtime-recovery.ts | tests/runtime-recovery.test.ts | R7 | none | unit-only | Registry R7-repeated-failure unproven. |
| Missing worker output handling | src/harness/team-run.ts | tests/team-run.test.ts | C1 | none | unit-only | Registry C1-missing-output unproven. |
| Team resource-wave admission | src/harness/runtime-resources.ts: `mapResourceWaves`, `mapBounded`, `workerConcurrency`; src/harness/team-run.ts | tests/runtime-resources.test.ts; tests/team-run.test.ts | S1, S2, S3 | none | unit-only | Registry S1/S2/S3 unproven. |
| Unknown-cost / budget-exhausted admission | src/harness/runtime-accounting.ts: `readRuntimeAccounting`; src/harness/team-run.ts | tests/runtime-accounting.test.ts; tests/team-run.test.ts | S3 | none | unit-only | Registry S3-unknown-cost and S3-budget-exhausted unproven. |
| Guardian ownership / settlement receipt | src/harness/runtime-settlement.ts; src/harness/windows-job.ps1, windows-job.cs | tests/runtime-settlement.test.ts | R5 | none | unit-only | Registry R5 and R5-deep-path unproven; the live Windows guardian has not produced a receipt here. |
| Forward-slash artifact paths | src/harness/artifact-paths.ts: `relativeArtifactPath` | tests/artifact-paths.test.ts; tests/per-run-artifact-dirs.test.ts | X1 | none | unit-only | Registry X1-paths unproven. |
| Per-run artifact directories | src/harness/run-id.ts: `ensureRunDir`, `writeLatestPointer`, `appendRunsIndexEntry`, `mirrorRuntimeResultToLatest` | tests/per-run-artifact-dirs.test.ts; tests/artifact-transaction.test.ts | none | none | unit-only | Fixture mission directories. |
| Run history retention (prune) | src/harness/run-id.ts: `pruneOldRuns` | tests/prune-old-runs.test.ts; tests/artifact-transaction.test.ts | none | none | unit-only | Prunes fixture run dirs; plugin retention endpoint tested separately. |
| Independent review (packet + assessment) | src/harness/independent-review.ts; src/harness/independent-review-execution.ts | tests/independent-review.test.ts | none | none | unit-only | Advisory artifact only; no reviewer run live. |
| TypeSafe System One integration | src/harness/typesafe.ts; src/harness/decision-receipts.ts: `recordAcceptanceDecision` | tests/typesafe.test.ts; tests/decision-receipts.test.ts | none | none | unit-only | Provider injected; receipts written from fixtures, never from a live model. |
| Dispatch context contract | src/harness/dispatch-context.ts: `buildDispatchContext`; src/harness/render-prompt.ts: `renderPrompt` | tests/dispatch-context.test.ts | none | none | unit-only | Rendered prompt compared to fixtures. |
| Tool guard (path-only policy) | src/harness/tool-guard.ts: `decideToolCall` | tests/tool-guard.test.ts; tests/tool-guard-cwd.test.ts; tests/tool-guard-containment.test.ts; tests/tool-guard-agent-clients.test.ts | G1, G3 | none | none | unit-only | Pure decision function; registry G1/G3 probes unproven. |
| Hermes Dashboard plugin | apps/hermes-plugin/dashboard (JS bundle + Python FastAPI bridge) | TS: tests/plugin-helpers.test.ts, tests/plugin-router.test.ts, tests/plugin-bundle-size.test.ts, tests/recent-runs-pane.test.ts, tests/replay-mode.test.ts, tests/cost-gauge.test.ts, tests/prompt-line-diff.test.ts, tests/runtime-result-diff.test.ts, tests/live-events-utils.test.ts; Python: apps/hermes-plugin/dashboard/tests/*.py | none | none | unknown | The Python pytest bridge suite exists but is not executed by `bun run test` here, so the bridge's live behaviour is neither proven nor disproven from this checkout. |
| ACP session template + runbook | .harness/templates/acp-worker.yaml; docs/runbooks/acp-setup.md | tests/acp.test.ts (schema/plan coverage only) | none | none | unit-only | Template is a data file; no live ACP run. |

## 2. Operating loop, in order

The capabilities an orchestrator depends on to run one team wave safely, with
the class from the table above and one sentence on what a live proof would have
to show.

| step | capability (table row) | class | what a live proof would have to show |
|---|---|---|---|
| dispatch | `uh mission run` / `uh mission run-team` worker dispatch | unit-only | A real adapter process started in a bound worktree reaches a terminal `runtime-result.yaml` with the assigned route attested, not a `blocked` fixture settlement. |
| guard | Tool guard + `guard.allow_native_subagents` | unit-only | A live worker's blocked write/agent-client command is denied by the real hook and the denial is counted in `runtime-control.json`, while benign commands (`grep -r omp src`) are not denied. |
| supervision limits | Runtime supervision (turn, wall, stall, denial, repetition, output limits) | unit-only | A live run actually trips each limit and the matching `stop_code` is written with the owned process tree settled, not simulated. |
| cancel | `uh mission cancel` local + plugin paths | unit-only | A freshly launched live run is cancelled and settles `status: cancelled` with a guardian receipt, exactly the behaviour that was missing. |
| liveness | loop-probe + `limits.max_thinking_ms` + heartbeat staleness | unit-only | A live stalled or looping worker is classified as not-live, and a reasoning-only worker is correctly distinguished from a stuck one. |
| salvage | team-run salvage of limit/deadline-stopped workers | unit-only | A live worker stopped by a limit, whose declared outputs and checks pass, is retained and listed as an eligible branch in the integration report. |
| integrate | team-run leader mechanical integration (merge/cherry-pick/rebase) | unit-only | Several live worker branches are merged into a leader worktree and the integrated tree is committed, with conflicts and outcomes recorded. |
| verify | `uh verify` (checks, ACs, declared-output checks) | unit-only | A live mission's real commands run in the bound sandbox and produce a `verification.yaml` whose status matches reality. |
| promote | `uh promote` + `auto-on-verify` policy | unit-only | A verified mission actually promotes (or is refused) into the canonical tree and writes `promotion.yaml`, respecting human authority. |
| resume | runtime-recovery resume of eligible stops | unit-only | A live run stopped with an eligible stop code resumes from its saved native session and preserves prior work. |
| cost accounting | runtime-accounting + token-usage capture | unit-only | Real provider usage is captured and summed per worker, with missing counters remaining `unknown` and blocking further paid admission. |
| comparison | `uh observatory compare` over real run sets | unit-only | Two arms built from genuinely executed live runs are compared with Wilson intervals and honest unknown-cost handling. |

## 3. Counts per class

Table 1 (capabilities) has 98 data rows:

- proven: 0
- unit-only: 96
- untested: 1 (`uh mission show`)
- unknown: 1 (Hermes Dashboard plugin Python bridge)

Table 2 (operating loop) has 12 data rows, all `unit-only`, so the document
totals are 110 data rows and 114 pipe-lines (including the 4 header/separator
rows). No row anywhere is `proven`: `acceptance/evidence/` does not exist in this
checkout, there are no `.harness/missions/*/runs/` directories, and
`docs/acceptance/README.md` classifies every registered capability as `unproven`
except `R10-stall` (`fixture_only`).

## 4. The ten rows most dangerous to leave unproven

1. `uh mission run` — the dispatch path every other capability hangs off; only its `blocked` settlement has ever been observed through the CLI.
2. `uh mission run-team` — the whole orchestrator wave (dispatch, waves, integrate, verify) is exercised only through injected fakes, so a real wave can still be unbuilt.
3. `uh mission cancel` — cancellation is exactly the behaviour that turned out never to have been built, and its tests use synthesized artifacts rather than a live process tree.
4. Tool guard / guard classes (`G1`, `G3`) — the safety boundary that stops protected-path writes and agent-client spawns has never fired against a real runtime.
5. Runtime supervision limits (`G2`, `R7`) — the guarantee that a task stops at its denial budget, turn cap or repeated failure is only proven on synthetic event streams.
6. Deadline grace (`R11`) — the claim that a cut-off worker still leaves an `INCOMPLETE` deliverable is unproven; the registry only has a deadline entry with no evidence.
7. Team cost admission (`S3`) — unknown-cost and budget-exhausted admission gate real spend, and neither has ever blocked a live paid worker.
8. `uh verify` + promotion gate — the mechanism that decides whether work is acceptable and promoted has never run against a live mission result.
9. `uh acceptance run` — the evidence mechanism itself; because it has never executed a live capability, all 20 registry entries are unproven by construction.
10. Live adapter dispatch for `oh-my-pi` / `codex` / `hermes` — no adapter runner has completed a real run in this checkout, so per-runtime behaviour is inferred only from injected-runner tests.

## 5. Capabilities added since this inventory

Sections 1 to 4 predate the v0.12.0 development line and were not regenerated. The rows below list what was added
since, with the class rules of section 1. "Operational use" is not acceptance evidence: it records whether the
capability has been exercised in this project's own work (local run records, not present in a clean checkout), so a
row can be used daily and still be `unit-only`. [Known issues](../known-issues.md) lists every open defect.

| capability | where implemented | unit tests | operational use | class | notes |
|---|---|---|---|---|---|
| `uh ps` (+ stalled-tool segment) | src/harness/live-runs.ts | tests/live-runs.test.ts | daily | unit-only | Claude Code and ACP runs show `turns=0` (known issue). |
| `uh wait` | src/harness/wait.ts | tests/cli-wait.test.ts | daily | unit-only | Once returned `orphaned` for a passed run (known issue). |
| `uh kill` | src/harness/kill.ts | tests/kill.test.ts | daily, including `--orphans` | unit-only | |
| `uh steer` | src/harness/steer.ts | tests/steer-resume.test.ts | used | unit-only | Steering an orchestrator orphans its workers (known issue). |
| `uh report` / run digest | src/harness/report.ts, src/harness/run-digest.ts | tests/report.test.ts; tests/run-digest.test.ts | rarely | unit-only | |
| `uh mission check` / `uh mission put` | src/harness/mission-check.ts, src/harness/mission-put.ts | tests/mission-check.test.ts; tests/mission-put.test.ts | daily | unit-only | A team packet needs its worker packets in the same `put`. |
| `uh mission run --post-checks` | src/harness/post-checks.ts | tests/post-checks.test.ts | used as a hidden grader | unit-only | Failed runs correctly when the hidden check failed. |
| `uh queue` | src/harness/queue.ts | tests/queue.test.ts | none | unit-only | Fake launchers only. |
| `uh land` | src/harness/land.ts | tests/land.test.ts | first live use refused | unit-only | Review root is wrong when the project is a linked worktree (known issue). |
| `uh notify` | src/harness/notifications.ts | tests/notifications.test.ts | test deliveries only | unit-only | Real settled runs have not delivered (known issue). |
| `uh note` / `uh ledger` | src/harness/interventions.ts | tests/interventions.test.ts | little | unit-only | |
| Team memory admission | src/harness/runtime-resources.ts | tests/memory-admission.test.ts | every team run | unit-only | Reservation release by controller pid is an open hypothesis. |
| Command Code read windows | src/extensions/tool-guard/core.ts, cmdc-hook.ts | tests/cmdc-read-window.test.ts; tests/cmdc-hook.test.ts | every Command Code run | unit-only | Mitigates upstream #859 for reads only. |
| ACP `mcp_servers`, `env`, sandbox records | src/adapters/acp.ts | tests/acp.test.ts; tests/acp-sandbox-artifacts.test.ts | one live review over opencode | unit-only | |
| oh-my-pi `runtime_config.tools` | src/adapters/oh-my-pi.ts | tests/oh-my-pi.test.ts | none | unit-only | |
| `context.project_brief` | src/harness/dispatch-context.ts | tests/dispatch-context.test.ts | every worker prompt | unit-only | |
| `uh mcp serve` | src/harness/mcp-server.ts | tests/mcp-server.test.ts; tests/cli-mcp.test.ts | none from a real client | unit-only | |
| Shared hive (`uh hive`) | not in this branch | — | — | — | Finished on a separate branch (known issue). |
