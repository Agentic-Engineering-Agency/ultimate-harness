# Ultimate Harness

Ultimate Harness is a **runtime-agnostic software-development harness** for agentic engineering work.

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

UH ships an end-to-end CLI with a schema-backed artifact lifecycle and six wired adapters (`hermes`, `codex`, `hermes-proxy`, `openrouter`, `pi`, `oh-my-pi` — all active). Sandboxes support `git-worktree` (default) and `directory` backends, plus a `container` execution-isolation backend gated through OpenSandbox (v0.8.0). Latest release: **v0.8.0** on [npm](https://www.npmjs.com/package/@agenticengineeringagency/ultimate-harness). See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for status and [`CHANGELOG.md`](./CHANGELOG.md) for release notes.

| Adapter | Status | Notes |
|---|---|---|
| `hermes` | active | Reference adapter. Pinned to Hermes Agent ≥ 0.14.0. |
| `codex` | active | Drives `codex exec --sandbox workspace-write --json --output-last-message` against `codex-cli ≥ 0.130.0`. Verified end-to-end against the live ChatGPT backend. |
| `oh-my-pi` | active | Drives `omp --print --mode json`. Missions can route to any OMP-supported model (including Anthropic-tier via OMP's stealth surface) by setting `runtime_config_overrides.model:`. Graduated to `active` in v0.8.0 (#156). **Read [`docs/runbooks/anthropic-via-omp.md`](./docs/runbooks/anthropic-via-omp.md) before routing Claude through OMP** — the ToS posture is documented there; users opt in. |
| `hermes-proxy` | active | HTTP client targeting a local `hermes proxy` instance (Hermes Agent ≥ 0.14.0). Officially sanctioned OAuth-backed subscription routing — replaces the OMP stealth path. See [`docs/architecture/adapter-hermes-proxy.md`](./docs/architecture/adapter-hermes-proxy.md) and [`docs/runbooks/hermes-proxy-setup.md`](./docs/runbooks/hermes-proxy-setup.md). |
| `openrouter` | active | OpenAI-compat HTTP client for [openrouter.ai](https://openrouter.ai) — the cheapest pay-per-token routing target. API key via `OPENROUTER_API_KEY` (never the manifest); a missing key makes `uh adapter check openrouter` degrade gracefully. See [`docs/runbooks/openrouter-setup.md`](./docs/runbooks/openrouter-setup.md). |
| `pi` | active | Drives the vanilla `pi` agent CLI (`pi --print --mode json --no-session`) — the base CLI that oh-my-pi extends. `config.cli_command` overridable. See [`docs/runbooks/pi-setup.md`](./docs/runbooks/pi-setup.md). |

Cross-cutting protocols every adapter participates in:

- **UH-28 runtime-final-message capture** — every adapter prompts the model to emit a fenced `uh-runtime-final-message` block; the harness extracts it into `runtime-final.txt` for cross-runtime parity. See the protocol section of [`docs/architecture/runtime-adapter-contract.md`](./docs/architecture/runtime-adapter-contract.md).
- **UH-26 per-runtime strict `runtime_config` validation** — typos in adapter manifests fail at load time.
- **UH-27 / UH-33 mission `runtime_config_overrides`** — missions override adapter defaults per-run with the same typo safety.
- **UH-34 untracked-file diff capture** — `diff.patch` includes brand-new files, not just modified-tracked ones.

## Documentation

Start with the [quickstart](./docs/quickstart.md), the [configuration guide](./docs/configuration.md), the [vision](./docs/VISION.md), the [documentation home](./docs/README.md), and the [roadmap](./docs/ROADMAP.md). Direct links:

- [Quickstart](./docs/quickstart.md)
- [Configuration](./docs/configuration.md)
- [Runtime targets](./docs/runtime-targets.md)
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

# Confirm a runtime is available (active: hermes, codex, hermes-proxy, openrouter, pi, oh-my-pi).
uh adapter check hermes

# Create and validate a mission packet.
uh mission create m1-example \
  --title "Example mission" \
  --workflow spec-first-feature \
  --objective "Demonstrate the mission lifecycle"
uh validate --all-missions

# Render the runtime invocation without launching.
uh mission dry-run .harness/missions/m1-example/mission.yaml --runtime hermes

# Execute the mission. --runtime accepts: hermes | codex | hermes-proxy | openrouter | pi | oh-my-pi.
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
