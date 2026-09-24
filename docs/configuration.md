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
