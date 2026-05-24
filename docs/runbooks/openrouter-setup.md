# OpenRouter setup

The `openrouter` adapter is an OpenAI-compatible HTTP client for
[openrouter.ai](https://openrouter.ai) — the cheapest pay-per-token routing
target, complementary to the subscription-backed `hermes-proxy`. It speaks the
standard `/chat/completions` API, so any model in OpenRouter's catalog is
reachable by id.

## 1. Get an API key

Create a key at <https://openrouter.ai/keys>. Export it (the adapter reads it
from the environment — it is **never** stored in the manifest):

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

Without the key, `uh adapter check openrouter` reports `found: false` with a
"set OPENROUTER_API_KEY" message (this is also the CI-skip signal), and
`uh mission run --runtime openrouter` fails fast with a clear plan error.

## 2. Add the adapter manifest

```bash
uh adapter add openrouter
```

This writes `.harness/adapters/openrouter.yaml`:

```yaml
schema_version: uh.adapter.v0
id: openrouter
runtime: openrouter
status: active
config:
  runtime_config:
    endpoint: "https://openrouter.ai/api/v1"
    model: "openai/gpt-4o-mini"
    request_timeout_ms: 120000
    extra_headers: {}
```

`runtime_config` keys (strict — typos are rejected at load):

| Key | Required | Default | Notes |
|---|---|---|---|
| `endpoint` | no | `https://openrouter.ai/api/v1` | OpenAI-compat base URL |
| `model` | **yes** | — | any OpenRouter model id, e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, `qwen/qwen-2.5-72b-instruct` |
| `request_timeout_ms` | no | `120000` | per-request timeout |
| `extra_headers` | no | `{}` | extra request headers (lower-cased) |
| `referer` | no | — | sets `HTTP-Referer` (OpenRouter app ranking) |
| `title` | no | — | sets `X-Title` (OpenRouter app ranking) |

## 3. Verify + run

```bash
uh adapter check openrouter                 # GET /models with your key
uh mission dry-run <mission> --runtime openrouter
uh mission run <mission> --runtime openrouter
```

Per-mission model override:

```yaml
# mission.yaml
runtime_config_overrides:
  model: "anthropic/claude-3.5-sonnet"
```

## 4. Cost routing

`openrouter` carries `cost_class: cheap`, so `uh mission run --auto` will pick it
when it's the cheapest installed adapter that satisfies the mission's
`runtime_requirements`. Use `uh mission run --auto --explain` to see the decision
matrix.

## Notes

- **Live smoke is deferred** in CI until an `OPENROUTER_API_KEY` repo secret is
  provided; the adapter's unit tests are fully HTTP-mocked and need no key.
- Enumerate available model ids:
  `curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/models | jq '.data[].id'`.
