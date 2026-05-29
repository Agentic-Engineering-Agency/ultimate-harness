# Anthropic adapter setup (UH-136)

The `anthropic` adapter is a first-class HTTP client for the official
pay-per-token **Anthropic Messages API**
(`POST https://api.anthropic.com/v1/messages`). It talks directly to
Anthropic's metered API with your own key.

Status: **experimental**.

> ToS / posture: this is the official, sanctioned, pay-per-token API. It is
> distinct from:
>
> - `hermes-proxy` — OAuth-backed **subscription** routing via a local Hermes
>   proxy, and
> - `oh-my-pi` (and `docs/runbooks/anthropic-via-omp.md`) — routing through the
>   OMP credential store.
>
> Use `anthropic` when you want to pay Anthropic per token with your own API
> key, with no proxy in the path.

## 1. Get an API key

Create a key at <https://console.anthropic.com/settings/keys>. Export it (the
adapter reads it from the environment and never persists it to the manifest):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 2. Add the adapter manifest

```bash
uh adapter add anthropic
```

This writes `.harness/adapters/anthropic.yaml`:

```yaml
schema_version: uh.adapter.v0
id: anthropic
name: Anthropic
runtime: anthropic
capabilities:
  - messages-api
  - http-transport
  - sentinel-protocol
  - pay-per-token
status: experimental
config:
  runtime_config:
    base_url: "https://api.anthropic.com/v1"
    model: "claude-sonnet-4-6"
    max_tokens: 8192
    request_timeout_ms: 120000
    extra_headers: {}
```

## 3. Verify connectivity

```bash
uh adapter check anthropic
```

A healthy check prints the reachable endpoint and the number of models the key
can see. A missing key degrades gracefully (`found:false`) so CI can skip the
live smoke job.

## 4. Run a mission

```bash
uh run <mission-id> --runtime anthropic
```

## Notes

- The API key is read from `ANTHROPIC_API_KEY` and never written to the
  manifest.
- The Messages API requires `max_tokens`; the manifest default is `8192`.
- The pinned API version header is `anthropic-version: 2023-06-01`.
- `request_timeout_ms` bounds each HTTP call (default 120 000 ms).
- `base_url` can be overridden (e.g. for a gateway); the adapter appends
  `/messages` and `/models`.
- `extra_headers` lets you pass any forward-compat header (e.g.
  `anthropic-beta`).
- Token usage is captured from the response `usage` object
  (`{ input_tokens, output_tokens }`) and emitted as a `runtime.usage` event.
- See `docs/runbooks/openrouter-setup.md` for the cheapest OpenAI-compat
  pay-per-token alternative, and `docs/runbooks/anthropic-via-omp.md` for the
  subscription-routing path and its ToS posture.
```
