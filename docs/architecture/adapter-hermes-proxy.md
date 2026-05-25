# Hermes Proxy Runtime Adapter

## Purpose

The `hermes-proxy` adapter maps Ultimate Harness missions onto a local **`hermes proxy`** instance (shipped in [Hermes Agent ≥ 0.14.0](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16)). The proxy is an OpenAI-compatible local HTTP server that attaches a user's own OAuth-authenticated subscription credentials to outbound requests — UH speaks plain OAI-compat over HTTP and Hermes handles the upstream auth.

It exists alongside the spawn-based adapters (`hermes`, `codex`, `oh-my-pi`) and shares the same [runtime adapter contract](./runtime-adapter-contract.md): mission packets in, structured runtime sessions and artifacts out, no implicit promotion.

The wire-format discovery work is captured in [`hermes-proxy-spike.md`](./hermes-proxy-spike.md) (UH-36). This doc focuses on the adapter's design.

## ToS positioning

Two paths exist today for routing UH missions through a subscription (Claude / ChatGPT / SuperGrok / Nous Portal):

| Path | Mechanism | ToS posture |
|---|---|---|
| **`hermes-proxy`** (this adapter) | Hermes-shipped local OAI-compat proxy. UA / headers / auth attach are owned by Hermes. | **Sanctioned.** Hermes ships this as an officially supported integration point. |
| `anthropic-via-omp` (see `docs/runbooks/anthropic-via-omp.md`) | OMP routes via stealth surface (UA spoofing, OAuth token injection). | **Risky.** Subscription ToS prohibits third-party token injection (Anthropic Feb 2026 update). |

UH supports both; the runbooks document the trade-offs. For new deployments, prefer `hermes-proxy` whenever the upstream is available.

## Transport

HTTP. Not a subprocess.

```
                                      ┌──────────────────────────┐
   UH adapter                         │ hermes proxy             │
   ─────────                          │ (local process, port     │
                                      │  8645 by default)        │
   fetch(<endpoint>/chat/completions) │                          │
   ─────────────────────────────────▶ │  attaches user's real    │
                                      │  OAuth credentials       │
   SSE stream (or JSON)               │                          │
   ◀───────────────────────────────── │  forwards upstream       │
                                      │  (Nous Portal /          │
                                      │   OpenRouter / etc.)     │
                                      └──────────────────────────┘
```

The proxy listens on `127.0.0.1:8645/v1` by default. It forwards `/chat/completions`, `/completions`, `/embeddings`, `/models` only — anything else returns `path_not_allowed`. Bearer auth is required on every request, but the proxy ignores the bearer value and attaches its own credentials.

In `0.14.0` the upstream provider is `nous` (Nous Portal). Nous Portal itself fans out across multiple model backends (OpenRouter, Anthropic, etc.) — UH treats the upstream as opaque.

## Schema

`HermesProxyRuntimeConfigSchema` (strict, registered via `registerRuntimeConfigSchema`):

```ts
{
  endpoint: z.string().url(),                          // required, includes /v1 prefix
  model: z.string().min(1),                            // required, passed verbatim
  provider: z.enum(["nous","claude","chatgpt","supergrok"]).optional(),
  request_timeout_ms: z.number().int().positive().default(120_000),
  extra_headers: z.record(z.string(), z.string()).default({}),
}
```

Strictness means typos like `endpoiint` or `modle` fail at adapter-load or mission-override time instead of being silently dropped. Mission `runtime_config_overrides` are merged on top, then re-validated through the same schema (UH-27 / UH-33 parity).

## Lifecycle

```
                ┌──────────────────────────────────────────┐
                │ uh mission run --runtime hermes-proxy …  │
                └──────────────────┬───────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ planHermesProxyRun                      │
              │  load adapter + mission                 │
              │  merge runtime_config_overrides         │
              │  strict-reparse                         │
              │  build OAI request body                 │
              │  append UH-28 sentinel to prompt        │
              └────────────────────┬────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ runtime.started event +                 │
              │ runtime-session.yaml (status: running)  │
              └────────────────────┬────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ defaultHermesProxyRunner                │
              │  fetch(endpoint/chat/completions)       │
              │  AbortController honors timeout         │
              │  sniff Content-Type:                    │
              │    text/event-stream → SSE decode       │
              │    application/json → JSON parse        │
              │  accumulate assistant content           │
              │  capture httpStatus / errorEnvelope /   │
              │   networkError / events                 │
              └────────────────────┬────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ captureDiffWithUntracked (UH-34)        │
              │  → diff.patch (tracked + untracked)     │
              └────────────────────┬────────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │ collectHermesProxySession               │
              │  classify status (see table below)      │
              │  extract UH-28 sentinel → runtime-final │
              │  write runtime-result.yaml              │
              │  append runtime.finished event          │
              └─────────────────────────────────────────┘
```

## Status classification

| Condition | Status | Error hint |
|---|---|---|
| `networkError` matches `ECONNREFUSED` | blocked | `endpoint unreachable: <endpoint> (is `hermes proxy start` running?)` |
| `networkError` matches `ETIMEDOUT` / `ENETUNREACH` | blocked | verbatim network error |
| Other `networkError` | failed | verbatim |
| `runner.timedOut` | failed | `request timed out after <ms> ms` |
| `errorEnvelope.type === upstream_auth_failed` (or message matches `auth(entication)?` / `invalid_api_key`) | blocked | `upstream auth failed: <message> (run `hermes auth status <provider>` to re-auth)` |
| HTTP 401 / 403 | blocked | re-auth hint with provider name |
| HTTP 404 with envelope mentioning `model` | blocked | `model "<id>" not available on this proxy` |
| Other HTTP 4xx / 5xx | failed | verbatim envelope |
| `runner.exitCode !== 0` | failed | empty-message hint if applicable |
| HTTP 200 + empty content | failed | `empty assistant message` |
| HTTP 200 + content (with UH-28 sentinel) | passed | `runtime-final.txt` ← sentinel content |
| HTTP 200 + content (no sentinel) | passed | `runtime-final.txt` ← `""` (matches oh-my-pi) |

`surfaceBlocked: true` is set in `RUNTIME_WIRINGS["hermes-proxy"]`, so the CLI exits non-zero on `blocked` results — verification gates upstream see the failure cleanly.

## Adapter check

`uh adapter check hermes-proxy` performs a live `GET <endpoint>/models` probe (5-second `AbortController` timeout). Maps to `AdapterCheckResult`:

| Response | `found` | `version` / `errors` |
|---|---|---|
| 200 + JSON `{ data: [...] }` | true | `proxy reachable at <endpoint> (<N> models available)` |
| 401 / 403 | false | re-auth hint with provider name |
| 404 | false | `proxy version may not forward /models` |
| ECONNREFUSED / fetch failed | false | `endpoint unreachable: <endpoint> (is `hermes proxy start` running?)` |
| Timeout (5s) | false | `adapter check timed out after 5000 ms` |
| Other HTTP errors | false | verbatim envelope |
| Missing `endpoint` in `runtime_config` | false | `missing endpoint in runtime_config` |

The 5-second budget is constant (`HERMES_PROXY_CHECK_TIMEOUT_MS`) — separate from the per-mission `request_timeout_ms` to keep `adapter check` snappy.

## Comparison vs other adapters

| Adapter | Transport | Auth surface | Upstream control |
|---|---|---|---|
| `hermes` | Spawn (`hermes chat -q`) | Hermes-owned (per its config) | Whatever the user's `hermes` config routes to |
| `codex` | Spawn (`codex exec`) | ChatGPT subscription via codex-cli | ChatGPT only |
| `oh-my-pi` | Spawn (`omp --print --mode json`) | OMP's own credential store | Multi-provider, including the stealth `anthropic-via-omp` path |
| **`hermes-proxy`** | **HTTP (fetch)** | **Hermes proxy attaches credentials downstream** | **Any provider hermes proxy supports — currently `nous`** |

## Capabilities (manifest)

```yaml
capabilities:
  - subscription-auth      # routes via user's own subscription
  - oai-compat             # request/response shape is OpenAI Chat Completions
  - http-transport         # not a subprocess
  - sentinel-protocol      # UH-28 sentinel respected
```

## Risks / limits (v1)

- **No tool-use channel.** The model returns its full deliverable in the assistant message content; the harness does not apply structured file mutations. Future slice can wire OAI-compat tool calls into the runner's `events` and into the diff-application pipeline.
- **No proxy lifecycle management.** UH does not start, stop, or supervise the proxy. The operator runs `hermes proxy start` in a separate process (see [runbook](../runbooks/hermes-proxy-setup.md)).
- **Auth state is opaque to UH.** When the proxy returns `upstream_auth_failed`, UH surfaces a re-auth hint pointing at `hermes auth status <provider>`. The actual re-auth flow is provider-specific and lives outside UH.
- **Model catalog depends on the upstream.** As of Hermes 0.14.0, `hermes proxy start --provider nous` routes via Nous Portal, which itself proxies through OpenRouter. The available model ids are whatever OpenRouter exposes — not the Hermes-native model names. Run `uh adapter check hermes-proxy` to enumerate.
- **Request body is minimal.** Today only `{ model, messages, stream: true }` is sent. Sampling controls (`temperature`, `max_tokens`) are not in the UH-35 schema; adding them is a future schema bump.

## References

- [UH-32 epic](https://linear.app/agenticengineering-agency/issue/UH-32)
- [UH-36 spike (wire format)](./hermes-proxy-spike.md)
- [Operator runbook](../runbooks/hermes-proxy-setup.md)
- [Runtime adapter contract](./runtime-adapter-contract.md)
- [Sentinel protocol (UH-28)](../../src/harness/runtime-final-message.ts)
- [Diff capture helper (UH-34)](../../src/harness/diff-capture.ts)

## Promotion record

Adapter promoted from `experimental` → `active` on **2026-05-18** ([UH-38](https://linear.app/agenticengineering-agency/issue/UH-38)). Smoke evidence + receipts: [`docs/runbooks/hermes-proxy-e2e-smoke.md`](../runbooks/hermes-proxy-e2e-smoke.md).
