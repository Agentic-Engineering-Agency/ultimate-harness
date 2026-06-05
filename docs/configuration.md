# Configuration

Ultimate Harness keeps durable project state in `.harness/` and keeps secrets outside versioned artifacts.

## Project State

`uh init` writes:

- `.harness/project.yaml`
- `.harness/adapters/*.yaml`
- `.harness/workflows/*.yaml`
- `.harness/skills/index.yaml`
- `.harness/sandboxes/index.yaml`
- `.harness/audit/events.ndjson`

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
