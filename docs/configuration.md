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

## Runtime Config Overrides

Missions can override adapter defaults without editing shared manifests:

```yaml
runtime_config_overrides:
  model: openai/gpt-4o-mini
  request_timeout_ms: 120000
```

Overrides are strict-validated for runtimes with registered schemas, so typoed keys fail fast.
