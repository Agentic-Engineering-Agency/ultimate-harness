# Ultimate Harness

Ultimate Harness is a **runtime-agnostic software-development harness** for agentic engineering work.

In the governed delivery architecture, UH is the sole **Meta Harness / Run
Control**: Telar owns business intent, policy, stable identity, authority, and
the normalized ledger; UH resolves and supervises live execution through
replaceable runtime adapters. See the
[Telar–UH boundary](./docs/architecture/telar-integration.md).

It sits above coding agents and agent runtimes. Instead of becoming "one more coding agent", it standardizes the durable artifacts and lifecycle around agentic work:

```text
request / issue / spec
  -> workflow profile
  -> mission packet
  -> runtime adapter
  -> runtime execution with sandbox policy
  -> verification result
  -> human review
  -> promotion into canonical project state
```

The goal is to combine proven patterns from specification-driven development, agent workflow systems, skill libraries, and sandboxing tools into a practical harness for planning, specifying, executing, verifying, and safely iterating on software work.

## Current status

UH ships an end-to-end CLI with a schema-backed artifact lifecycle and ten runtime adapters (table below). Sandboxes support `git-worktree` (default) and `directory` backends, plus a `container` execution-isolation backend gated through OpenSandbox (v0.8.0). The latest version on [npm](https://www.npmjs.com/package/@agenticengineeringagency/ultimate-harness) is **v0.9.0**; `0.11.0` and the current `0.12.0` development line are not published. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for status, [`CHANGELOG.md`](./CHANGELOG.md) for release notes, and [`docs/known-issues.md`](./docs/known-issues.md) for open defects and unproven claims.

| Adapter | Status | Notes |
|---|---|---|
| `hermes` | active | Reference adapter. Pinned to Hermes Agent ≥ 0.14.0. |
| `codex` | active | Drives `codex exec --sandbox workspace-write --json --output-last-message` against `codex-cli ≥ 0.130.0`. Verified end-to-end against the live ChatGPT backend. |
| `oh-my-pi` | active | Drives `omp --print --mode json`. Missions can route to any OMP-supported model (including Anthropic-tier via OMP's stealth surface) by setting `runtime_config_overrides.model:`. Graduated to `active` in v0.8.0 (#156). **Read [`docs/runbooks/anthropic-via-omp.md`](./docs/runbooks/anthropic-via-omp.md) before routing Claude through OMP** — the ToS posture is documented there; users opt in. |
| `hermes-proxy` | active | HTTP client targeting a local `hermes proxy` instance (Hermes Agent ≥ 0.14.0). Officially sanctioned OAuth-backed subscription routing — replaces the OMP stealth path. See [`docs/architecture/adapter-hermes-proxy.md`](./docs/architecture/adapter-hermes-proxy.md) and [`docs/runbooks/hermes-proxy-setup.md`](./docs/runbooks/hermes-proxy-setup.md). |
| `openrouter` | active | OpenAI-compat HTTP client for [openrouter.ai](https://openrouter.ai) — the cheapest pay-per-token routing target. API key via `OPENROUTER_API_KEY` (never the manifest); a missing key makes `uh adapter check openrouter` degrade gracefully. See [`docs/runbooks/openrouter-setup.md`](./docs/runbooks/openrouter-setup.md). |
| `pi` | active | Drives the vanilla `pi` agent CLI (`pi --print --mode json --no-session`) — the base CLI that oh-my-pi extends. `config.cli_command` overridable. See [`docs/runbooks/pi-setup.md`](./docs/runbooks/pi-setup.md). |
| `anthropic` | active | Native pay-per-token Anthropic Messages API — the official, ToS-clean alternative to the OMP stealth path. API key via `ANTHROPIC_API_KEY`. |
| `command-code` | active | Command Code native execution with persistent sessions, process trees, and Tool Guard supervision. |
| `claude-code` | integration incomplete | Claude Code adapter with structured event capture and saved-session recovery; used for orchestrator missions. See [runtime targets](./docs/runtime-targets.md#claude-code-boundaries) for current limitations. |
| `acp` | active | Agent-Client Protocol (ACP) v1 runner for headless agent orchestration via standard JSON-RPC 2.0 over stdio. See [`docs/runbooks/acp-setup.md`](./docs/runbooks/acp-setup.md). |

The unpublished `0.11.0` added native `command-code` and `claude-code` adapters,
runtime supervision and recovery improvements, platform neutrality fixes, and
semantic evaluation during verification and independent review. The current
`0.12.0` development line adds the run-control and delivery-loop commands below.
See [Changelog](./CHANGELOG.md), [runtime limitations](./docs/runtime-targets.md),
and the [roadmap](./docs/ROADMAP.md).

## Operating runs

Every command below reads or writes records under `.harness/`; none needs a model.

| Need | Command | Guide |
|---|---|---|
| See what is running, per run: mission, runtime and model, liveness, turns, denials, last tool, stalled tools | `uh ps` | [run control](./docs/handbook/run-control.md) |
| Block until runs settle, without polling | `uh wait <run-id>` / `--mission` / `--team` | [run control](./docs/handbook/run-control.md) |
| What a run is doing or did: tools, files written, denials, loop signals, efficiency | `uh report <run-id>` | [run control runbook](./docs/runbooks/run-control.md) |
| Redirect or stop a run | `uh steer <run-id> <message>`, `uh kill`, `uh mission cancel` | [run control](./docs/handbook/run-control.md) |
| Fan a mission out to workers in their own worktrees | `uh mission run-team <id>` | [slices and teams](./docs/handbook/slices-and-teams.md) |
| Validate and install mission packets | `uh mission check`, `uh mission put` | [packet rules](./docs/handbook/packet-rules.md) |
| Independent review of finished work | `uh mission review-prepare` / `review-collect` | [review round trip](./docs/handbook/review-round-trip.md) |
| Grade a run with checks the agent never sees | `uh mission run --post-checks <file>` | [closing the loop](./docs/handbook/closing-the-loop.md) |
| Launch missions in order under an orchestrator cap | `uh queue run <queue.yaml>` | [closing the loop](./docs/handbook/closing-the-loop.md) |
| Land verified, reviewed worker branches or leave the target untouched | `uh land` | [closing the loop](./docs/handbook/closing-the-loop.md) |
| Be told when runs settle | `uh notify` | [notifications](./docs/handbook/notifications.md) |
| Record corrections and their countermeasures | `uh note`, `uh ledger` | [intervention ledger](./docs/handbook/intervention-ledger.md) |
| Read the run store from an MCP client | `uh mcp serve` | [MCP server](./docs/runbooks/mcp-server.md) |

The [operator handbook](./docs/handbook/README.md) walks the whole loop.

Cross-cutting protocols every adapter participates in:

- **UH-28 runtime-final-message capture** — every adapter prompts the model to emit a fenced `uh-runtime-final-message` block; the harness extracts it into `runtime-final.txt` for cross-runtime parity. See the protocol section of [`docs/architecture/runtime-adapter-contract.md`](./docs/architecture/runtime-adapter-contract.md).
- **UH-26 per-runtime strict `runtime_config` validation** — typos in adapter manifests fail at load time.
- **UH-27 / UH-33 mission `runtime_config_overrides`** — missions override adapter defaults per-run with the same typo safety.
- **UH-34 untracked-file diff capture** — `diff.patch` includes brand-new files, not just modified-tracked ones.

## Documentation

Start with the [quickstart](./docs/quickstart.md), the [configuration guide](./docs/configuration.md), the [vision](./docs/VISION.md), the [documentation home](./docs/README.md), and the [roadmap](./docs/ROADMAP.md). Direct links:

- [Quickstart](./docs/quickstart.md)
- [Operator handbook](./docs/handbook/README.md)
- [Known issues](./docs/known-issues.md)
- [Configuration](./docs/configuration.md)
- [Runtime targets](./docs/runtime-targets.md)
- [Tool guard](./docs/tool-guard.md)
- [TUI architecture](./docs/architecture/tui.md)
- [Plugin development](./docs/plugin-development.md)
- [Optional telemetry](./docs/telemetry.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [VISION — what UH is, who it's for, and what we won't accept](./docs/VISION.md)
- [Glossary](./docs/glossary.md)
- [Product requirements](./docs/product/prd.md)
- [MVP scope](./docs/product/mvp-scope.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Runtime adapter contract](./docs/architecture/runtime-adapter-contract.md) — includes the UH-28 sentinel protocol
- [Mission packet schema](./docs/architecture/mission-packet-schema.md)
- [Verification and promotion lifecycle](./docs/architecture/verification-and-promotion.md)
- [Progressive decisions](./docs/architecture/progressive-decisions.md) — implemented semantic evaluation, authority boundaries, and proposed policy flows.
- [Telar governance and UH Run Control boundary](./docs/architecture/telar-integration.md)

Runbooks:

- [Codex E2E smoke](./docs/runbooks/codex-e2e-smoke.md)
- [Anthropic via oh-my-pi](./docs/runbooks/anthropic-via-omp.md)
- [Hermes Proxy setup](./docs/runbooks/hermes-proxy-setup.md)
- [Hermes Proxy E2E smoke (UH-38 promotion record)](./docs/runbooks/hermes-proxy-e2e-smoke.md)
- [OpenRouter setup](./docs/runbooks/openrouter-setup.md)
- [Sandbox backends](./docs/architecture/sandbox-backends.md)
- [Container sandbox / OpenSandbox smoke](./docs/runbooks/container-sandbox.md)
- [Publishing](./docs/runbooks/publishing.md)
- [Honcho persistent memory (oh-my-pi)](./docs/runbooks/honcho-memory.md)
- [Run control](./docs/runbooks/run-control.md)
- [Independent review](./docs/runbooks/independent-review.md)
- [Acceptance](./docs/runbooks/acceptance.md)
- [ACP setup](./docs/runbooks/acp-setup.md)
- [MCP server](./docs/runbooks/mcp-server.md)

## Install

```sh
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

The package is published to the npm registry and is installable with Bun's
package manager. The CLI binary is `uh`.

## Quick start
```sh
bun install
bun run build
```

```sh
# Initialize .harness/ project state.
uh init

# Confirm a runtime is available (see the adapter table above).
uh adapter check hermes

# Create and validate a mission packet.
uh mission create m1-example \
  --title "Example mission" \
  --workflow spec-first-feature \
  --objective "Demonstrate the mission lifecycle"
uh validate --all-missions

# Render the runtime invocation without launching.
uh mission dry-run .harness/missions/m1-example/mission.yaml --runtime hermes

# Execute the mission using an installed adapter; see `uh mission run --help` for supported runtimes.
uh mission run .harness/missions/m1-example/mission.yaml --runtime hermes

# Run the mission's declared verification checks.
uh verify m1-example

# Record a human promotion decision.
uh promote m1-example --approved-by "Reviewer Name" --change README.md

# Inspect harness state.
uh status
```

For the package bin and dev loop:

```sh
bun run dev -- --help       # tsx-driven dev runner
node dist/cli.js --help     # built CLI
npm link && uh --help       # local bin install after build
```

The package is public. Release readiness is checked with `bun run build`, `bun run test`, plugin checks, and `bun run publish:dry-run`.

## Mission-level runtime overrides

Missions select which model / runtime config to use per-run without editing the shared adapter manifest:

```yaml
# .harness/missions/<id>/mission.yaml
runtime_config_overrides:
  model: anthropic/claude-opus-4-7
  thinking: medium
```

Mission overrides merge over the adapter manifest's `config.runtime_config` and are strict-validated by the per-runtime Zod schema, so typos fail fast.

## Durable artifacts

Mission-scoped:

- `mission.yaml` — schema-backed mission packet.
- `prompt.md` — rendered runtime prompt for the run.
- `runtime-session.yaml` — runtime command, args, status, timestamps, exit code.
- `events.ndjson` — runtime lifecycle + adapter-specific event stream.
- `runtime-final.txt` — model's one-paragraph summary (UH-28 sentinel-extracted when present).
- `runtime-result.yaml` — terminal status + artifact refs.
- `diff.patch` — `git diff` including untracked new files (UH-34).
- `verification.yaml` — `uh verify` output.
- `promotion.yaml` — human approval / rejection / deferral.

Project-scoped: `.harness/project.yaml`, `.harness/workflows/`, `.harness/adapters/`, `.harness/sandboxes/`, `.harness/skills/`, `.harness/audit/events.ndjson`.

## Safety model

Ultimate Harness is designed around explicit gates rather than direct mutation of canonical state:

- Schemas validate every persisted artifact (`uh.project.v0`, `uh.workflow.v0`, `uh.mission.v0`, `uh.runtime-session.v0`, `uh.runtime-result.v0`, `uh.verification.v0`, `uh.promotion.v0`).
- Mission IDs, workflow profile names, and artifact paths are constrained to avoid path traversal.
- Runtime artifact persistence refuses symlinked `.harness`, mission directories, or artifact targets.
- Sandboxes are git-worktree-backed; missions run with `cwd` set to the sandbox path. Bound mission packets are seeded into the worktree at create time (UH-29).
- Codex runs with `--sandbox workspace-write`; oh-my-pi runs with `--no-extensions --no-skills` by default.
- Promotion is a separate human approval step. A `promoted` decision is blocked unless `verification.yaml` is passed.
- Event streams and YAML records provide an audit trail for execution, verification, and promotion.

## Inspiration

Ultimate Harness studies and selectively integrates ideas from:

- [Specsafe](https://github.com/Agentic-Engineering-Agency/specsafe/issues) — specification safety and issue-driven development.
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) — structured agent roles and delivery workflows.
- [superpowers](https://github.com/obra/superpowers) — composable agent capabilities.
- [GSD](https://github.com/gsd-build/get-shit-done) — fresh-context execution and durable project context.
- [matt-pocock/skills](https://github.com/mattpocock/skills) — focused reusable engineering skills.
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — multi-agent harness patterns.
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — artifact-guided specification workflows.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — wired as the reference adapter.
- [Codex CLI](https://github.com/openai/codex) — wired adapter for OpenAI's coding agent.
- [oh-my-pi](https://github.com/can1357/oh-my-pi) and [Pi](https://pi.dev/) — both wired and active: `oh-my-pi` graduated to `active` in v0.8.0 (#156); the vanilla `pi` adapter graduated in v0.7.0 (#135/#150).
- [AgentFS](https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md) — copy-on-write sandboxing patterns (design at [`docs/architecture/sandbox-agentfs.md`](./docs/architecture/sandbox-agentfs.md)).

See the [comparison matrix](./docs/research/comparison-matrix.md) and [adopt/reject/defer log](./docs/research/adopt-reject-defer.md) for the current design position.

## Project vision

- Specification-first planning and execution.
- Portable mission packets for bounded agentic work.
- Runtime adapters for multiple coding agents.
- Reusable skills and workflow profiles.
- Sandboxed environments for safer autonomous development.
- Structured verification and human approval gates.
- Clear audit trails for decisions, file changes, checks, and promotion.
