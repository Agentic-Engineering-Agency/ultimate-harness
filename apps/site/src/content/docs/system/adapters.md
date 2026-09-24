---
title: Runtime adapters
description: The ten runtimes UH can drive, how an adapter is built, and how UH chooses between them.
---

An adapter turns a runtime-neutral mission into one runtime's command line or API call, and turns that runtime's output back into UH events and a `runtime-result.yaml`. The agent is a swappable dependency: the same mission renders the same logical prompt on every adapter.

## The ten adapters

| Adapter | Kind | Status | Supervision and guard | Resume | Notes |
|---|---|---|---|---|---|
| `oh-my-pi` | CLI, `omp --print --mode json` | active | full: guard hook, arming, supervision | yes | Default harness. A per-run `omp-overlay.yml` pins every OMP model role to the assigned model and disables native sub-agents. Read the [Anthropic-via-OMP runbook](/source/docs/runbooks/anthropic-via-omp/) before routing Claude through it. |
| `command-code` | CLI | active (v0.11) | full, with a 40 KB read-window rule | yes | Persistent sessions, process trees. `runtime_config.role: orchestrator` lets it run controller commands. |
| `claude-code` | CLI, stream-json | integration incomplete (v0.11) | full, PreToolUse hook | yes | Used for orchestrator missions. See the runtime targets page for current limits. |
| `codex` | CLI, JSONL | active | supervision, no hook | no | `codex exec --sandbox workspace-write --json`; optional `runtime_config.model` with route attestation. |
| `hermes` | CLI | active | process runner, no hook | no | Reference adapter, Hermes Agent 0.14 or newer. |
| `pi` | CLI | active | own spawn, not on the shared process runner | no | The base CLI that oh-my-pi extends. |
| `acp` | JSON-RPC 2.0 over stdio | active (v0.11) | own client with permission handling | no | Agent-Client Protocol v1: any ACP agent, headless. |
| `hermes-proxy` | HTTP, OpenAI compatible | active | HTTP | no | Sanctioned OAuth-backed subscription routing via a local `hermes proxy`. |
| `openrouter` | HTTP | active | HTTP | no | Cheapest pay-per-token route. `OPENROUTER_API_KEY` from the environment. |
| `anthropic` | HTTP, Messages API | experimental on `main`, active on v0.11 | HTTP | no | `ANTHROPIC_API_KEY` from the environment. |

Only oh-my-pi, Command Code and Claude Code have the complete supervision stack (in-runtime guard hook, arming, supervision, resume). Treat the others as trusted-output runtimes: their results are verified, but their tool calls are not intercepted.

## Anatomy of an adapter

Each `src/adapters/<runtime>.ts`:

1. **Registers** with `runtimeRegistry.register(id, checker)`. `src/harness/registry.ts` loads `.harness/adapters/*.yaml` (`uh.adapter.v0`) and matches manifests to registered adapters.
2. **Declares a strict `runtime_config` schema** via `registerRuntimeConfigSchema` in `src/schema/adapter.ts`. Mission `runtime_config_overrides` merge over the manifest and are validated by the same schema, so a typo fails at load time.
3. **Exports** `check*` (is it installed and reachable), `plan*Run` (pure: command, args, env), `dryRun*` and `run*`.
4. **Ships a capability manifest** in `src/adapters/capabilities/<runtime>.ts` (`uh.adapter-capabilities.v0`): cost class (`cheap`, `standard`, `premium`), context window, sandbox support (`agentfs`, `none`, `remote-only`), tool surface.
5. **Participates in the cross-cutting protocols:** the `uh-runtime-final-message` sentinel (UH-28), strict config validation (UH-26), mission overrides (UH-27/33), untracked-file diff capture (UH-34).

To add a runtime, follow the [runtime adapter contract](/source/docs/architecture/runtime-adapter-contract/) and wire the id into `RUNTIME_WIRINGS` in `src/cli.ts` and `TEAM_ADAPTER_IDS` in `src/schema/mission.ts`.

## How UH chooses an adapter

With `--runtime`, you choose. With `--auto` or a mission `decision_policy`, `auto-route.ts#chooseSemanticRoute` decides in two levels:

1. **Level 0, deterministic eligibility.** Filters by `runtime_requirements`, required capabilities, `decision_policy.allowed_runtimes` and the project fleet, then sorts by cost class, context window and id.
2. **Level 1, semantic recommendation.** A bounded model call classifies the task's complexity and recommends an adapter and model, but only from Level 0's survivors and only above `min_confidence`.

The decision, with its confidence and alternatives, is written as a `uh.decision-receipt.v0`.

## Fleet admission and route attestation (v0.11)

Two separate controls make sure the model you pay for is the one that runs:

- **Fleet admission, before spawn.** `fleet.routes` in `.harness/project.yaml` lists the models the project authorizes per adapter and role. `uh mission run`, `run-all` and every `run-team` worker are refused when the assigned model is missing or outside the fleet. `--force` does not bypass it. A project without a `fleet` block is unaffected.
- **Route attestation, during the run.** Supervision reads the runtime's own reports of which provider and model served the session, including sub-agents' routes from structured tool metadata (never tool arguments or text). A mismatch stops the run with `route_mismatch`, naming the route.

Provider and model ids are compared case-insensitively with an optional provider prefix. There is no alias table and no partial matching.

## Credentials

Runtime credentials never enter `.harness/`. `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and `TYPESAFE_API_KEY` come from the environment; CLI runtimes keep their own login. `uh adapter check <runtime>` degrades gracefully and says what is missing.

## Further reading

- [Runtime targets](/source/docs/runtime-targets/) and per-runtime runbooks under [Source documents](/source/docs/).
- [Adapter contract](/source/docs/architecture/runtime-adapter-contract/).
