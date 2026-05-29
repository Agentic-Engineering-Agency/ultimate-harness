# Optional Telemetry

Ultimate Harness telemetry is PostHog-only, disabled by default, and designed for aggregate command health rather than usage surveillance.

## Opt In

```sh
export UH_TELEMETRY=posthog
export UH_POSTHOG_API_KEY=ph_project_api_key
export UH_POSTHOG_HOST=https://us.i.posthog.com
uh status
```

`UH_TELEMETRY=1` and `UH_TELEMETRY=true` are accepted aliases. Without an explicit opt-in and API key, no telemetry request is sent.

## Captured

- Sanitized command path, for example `uh status` or `uh adapter capabilities`.
- Outcome status and exit code.
- Duration in milliseconds.
- UH package version.
- Platform, architecture, Node version, and OS release.

## Never Captured

- Repository paths or current working directories.
- Adapter manifests, runtime config secrets, tokens, or API keys.
- Prompts, agent outputs, final messages, diffs, uploaded documents, or artifact bodies.
- Raw payment, legal, financial, customer, or prospect data.

Telemetry is best-effort. Network errors are ignored and must never change CLI behavior.
