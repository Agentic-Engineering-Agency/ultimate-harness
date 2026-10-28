# Configuration

Ultimate Harness keeps durable project state in `.harness/` and keeps secrets outside versioned artifacts.

## Project State

`uh init` writes:

- `.harness/project.yaml`
- `.harness/workflows/*.yaml`
- `.harness/skills/index.yaml`
- `.harness/sandboxes/index.yaml`
- `.harness/audit/events.ndjson`

`uh init` creates the `.harness/adapters/` directory but does not write adapter manifests. Use `uh adapter add <runtime>` to write `.harness/adapters/<runtime>.yaml`.

## Audit and Decision Logs

The harness has three distinct durable log locations:

| Path | Receives |
| --- | --- |
| `.harness/audit/events.ndjson` | Project-level events, including the `project.init` event written by `uh init`. |
| `.harness/audit.log` | Text lines appended when `uh mission verdict` records a manual verdict. |
| `.harness/missions/<mission-id>/events.ndjson` | Mission-scoped lifecycle events, including promotion events appended by `uh promote`. |

Validate state with:

```sh
uh validate .harness/project.yaml
uh validate --all-workflows
uh validate --all-missions
```

## Environment Variables

Use `.env.example` as a placeholder reference only. Real values should come from a local shell, CI secret store, or runtime-specific credential manager.

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter adapter authentication. |
| `UH_TELEMETRY` | Set to `posthog`, `1`, or `true` to opt in to telemetry. Defaults off. |
| `UH_POSTHOG_API_KEY` | PostHog project API key for optional telemetry. |
| `UH_POSTHOG_HOST` | PostHog capture host. Defaults to `https://us.i.posthog.com`. |
| `UH_PROJECT_ROOT` | Hermes plugin project root override. |
| `UH_CLI_BIN` | Hermes plugin path to the `uh` binary. |
| `UH_READ_TIMEOUT_S` | Hermes plugin read-command timeout. |
| `UH_RUN_TIMEOUT_S` | Hermes plugin mission-run timeout. |
| `HONCHO_API_KEY` | Honcho persistent-memory key. Enables the extension when set (unless `HONCHO_ENABLED=false`). See the [Honcho runbook](runbooks/honcho-memory.md). |
| `HONCHO_ENABLED` | Force the Honcho memory extension on/off (`true`/`false`). Defaults to on when a key is resolvable. |
| `HONCHO_SEARCH_LIMIT` | Max snippets returned by `honcho_search`. Defaults to 8. |
| `HONCHO_TOOL_PREVIEW_LENGTH` | Per-snippet char cap for `honcho_search`. Defaults to 500. |
| `TYPESAFE_API_KEY` | Enables TypeSafe System One judgments in verification and independent-review collection. Recommendations can harden a result but cannot override deterministic failure or authorize promotion. See [progressive decisions](./architecture/progressive-decisions.md) for limitations. |

## Operator Price Table

`.harness/prices.yaml` (schema `uh.prices.v0`) is the operator-maintained price table the harness uses to estimate a run's cost when its native event stream reports token counts but no price. The harness never ships or invents a price: a model missing from the table keeps its cost unknown, with the reason naming the model and this file.

```yaml
# .harness/prices.yaml
schema_version: uh.prices.v0
models:
  # Model ids match case-insensitively against the model the native stream reports.
  # <provider>/<model-id>:
  #   input_usd_per_million: <USD per million input tokens>
  #   output_usd_per_million: <USD per million output tokens>
  #   cache_read_usd_per_million: <USD per million cache-read tokens>
  #   cache_write_usd_per_million: <USD per million cache-write tokens>
  #   source: <where these numbers came from, e.g. the provider's published list price and the date you verified it>
```

- All four rate fields are USD per million tokens.
- `source` is required and records the provenance of the numbers; fill it in.
- A missing or malformed table prices nothing: runs whose cost cannot be resolved stay unknown rather than being estimated from a guessed rate.
- A stream whose token counters are partially reported is never priced from the partial measurement.
- Command Code runs price from their native `model_request_end` usage; team admission (`run-team`) treats an estimated cost the same as a reported one when reserving team budget.

## Capability vs runtime_requirements enforcement

A mission can constrain which runtime may execute it in two independent, separately-checked ways:

| | `capabilities` | `runtime_requirements` |
|---|---|---|
| Shape | open `string[]` of free-form tags (`needs_browser`, `mcp:playwright`, …) | typed object (`needs_network`, `needs_shell`, `needs_fs_write`, `min_context_tokens`, `max_cost_class`) |
| Matched against | the resolved adapter **manifest**'s declared `capabilities` (set-containment) | the adapter's **typed** capability table |
| Default severity | **warn** (run proceeds) | **error** (always) |
| `--strict` | escalates each mismatch to an error | no effect (already always-error) |
| `--force` | bypassed entirely | bypassed entirely |
| Also gates | — | `--auto` adapter routing |

Both are checked as a preflight on `uh mission run`, `uh mission dry-run`, and `uh mission run-all`, after the runtime is chosen.

> History: capability enforcement shipped in v0.7.0 as a **hard error**. v0.10.0 (UH-138) inverts the default to **warn** and adds `--strict`. `runtime_requirements` have always been hard errors and are unchanged.

Flag matrix:

| Flags | Missing capability tag | No non-deprecated manifest | `runtime_requirements` unmet |
|---|---|---|---|
| (default) | `[WARN]` per tag, proceeds | `[WARN]`, proceeds | **error** |
| `--strict` | **error** | **error** | **error** |
| `--force` | bypassed (`[WARN]` bypass line) | bypassed (`[WARN]` bypass line) | bypassed |

Exact `[WARN]` message formats:

```text
[WARN] mission <id>: capability "<cap>" not declared by runtime "<runtime>" (adapter <adapterId>); proceeding — pass --strict to fail
[WARN] mission <id>: no non-deprecated adapter manifest for runtime "<runtime>"; capability check skipped — pass --strict to fail
[WARN] mission <id>: --force bypassed capability check for runtime "<runtime>"
```

## Runtime Config Overrides

Missions can override adapter defaults without editing shared manifests:

```yaml
runtime_config_overrides:
  model: openai/gpt-4o-mini
  request_timeout_ms: 120000
```

Overrides are strict-validated for runtimes with registered schemas, so typoed keys fail fast.

### Common `runtime_config` keys

| Key | Runtimes | Purpose |
| --- | --- | --- |
| `honcho_memory` | `oh-my-pi`, `codex`, `pi`, `hermes` | Per-mission Honcho opt-out (boolean). Omitted/`true` keeps Honcho memory on (when configured); `false` skips all Honcho enrich/record activity and the `honcho_search` / `honcho_remember` tools for that mission. See the [Honcho runbook](runbooks/honcho-memory.md). |
| `tools` | `oh-my-pi` | Allowlist of omp tool names passed as `--tools=<list>`; at least one entry, no duplicates. Omit to keep omp's default tool set. |
| `mcp_servers` | `acp` | stdio or http MCP servers passed to `session/new` in the ACP v1 shape. Env and header values go only on the wire. See [acp-setup.md](runbooks/acp-setup.md). |
| `env` | `acp` | `drop` (exact names or `PREFIX*` patterns, case-insensitive on Windows) then `set` (name to value) applied to the server's environment before spawn. |
| `role` | `command-code`, `claude-code` | `orchestrator` arms the guard with controller commands and lets the mission run in the project root without `--no-sandbox`; its writes stay inside its declared write roots. |

## Project `land` block

`uh land` reads an optional `land` block from `.harness/project.yaml`. Each absent field keeps its default: checks `bun run typecheck` and `bun run test`, the build `bun run build`, and the forbidden patterns `co-authored-by`, `anthropic`, `claude-session`, `generated with` and the robot emoji, matched case-insensitively against the staged diff and the commit message. See [closing-the-loop.md](handbook/closing-the-loop.md).

```yaml
land:
  checks:
    - name: typecheck
      command: bun run typecheck
  forbidden_patterns: [co-authored-by]
  build: bun run build
```

## Mission `context.project_brief`

`.harness/project-brief.md` is rendered once into every worker prompt as Project facts, capped at 4,000 characters. A mission sets `context.project_brief: false` to leave it out, for example a read-only review whose task differs from a code worker's; `uh mission dry-run` then prints `Project facts: off (context.project_brief: false)`.
