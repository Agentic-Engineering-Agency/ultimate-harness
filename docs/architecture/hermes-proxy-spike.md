# hermes-proxy wire-format spike (UH-36)

Closes the discovery phase of [UH-32](https://linear.app/agenticengineering-agency/issue/UH-32). Findings feed:

* [UH-35](https://linear.app/agenticengineering-agency/issue/UH-35) — schema + manifest fields for `runtime_config`.
* [UH-39](https://linear.app/agenticengineering-agency/issue/UH-39) — adapter implementation: planner / runner / parser / sentinel / blocked classification.
* [UH-37](https://linear.app/agenticengineering-agency/issue/UH-37) — CLI dispatch + sandbox routing parity.
* [UH-40](https://linear.app/agenticengineering-agency/issue/UH-40) — operator runbook.
* [UH-38](https://linear.app/agenticengineering-agency/issue/UH-38) — E2E smoke + promotion criteria.

> **Scope:** read-only research. No production code changed in this slice.

## 1. Environment

* Hermes Agent **`v0.14.0 (2026.5.16)`** — installed at `/Users/eduardojaviergarcialopez/.hermes/hermes-agent`, Python 3.11.14, OpenAI SDK 2.24.0. Confirmed minimum version per [UH-31](https://linear.app/agenticengineering-agency/issue/UH-31) (`MINIMUM_HERMES_VERSION = 0.14.0`).
* Proxy launched on the workstation with:
  ```
  hermes proxy start --provider nous
  ```
  Listening on **`http://127.0.0.1:8645/v1`**. Forwards per-request to the upstream provider, attaching credentials owned by the local `hermes auth` store.

## 2. CLI surface (v0.14.0)

```
$ hermes proxy --help
usage: hermes proxy [-h] {start,status,providers} ...

  start       Run the proxy in the foreground
  status      Show which proxy upstreams are ready
  providers   List available proxy upstream providers

$ hermes proxy start --help
  --provider PROVIDER    Upstream provider (default: nous).
  --host HOST            Bind address (default: 127.0.0.1).
  --port PORT            Bind port (default: 8645).
```

**Providers available in `0.14.0`:** *only* `nous` (Nous Portal). The handoff narrative and UH-32 epic description mention Claude Pro / ChatGPT Pro / SuperGrok backends — these are **not yet shipped as first-class `hermes proxy` providers**. They are reachable today only because Nous Portal itself fans out to multiple upstream model backends server-side; the UH adapter does **not** need to know about the upstream provider beyond what model id to request.

**Implication for the adapter:** treat the upstream as opaque OAI-compat. `runtime_config` exposes the `endpoint`, `model`, and an `auth_token` (any non-empty string; the proxy ignores the value and attaches its own credentials). When/if Hermes ships a `claude` provider, no schema change is needed — operators just point at a proxy started with `--provider claude`.

## 3. Routes forwarded by the proxy

Confirmed by probing each route directly:

| Route                           | Status      | Notes                                                                            |
|---------------------------------|-------------|----------------------------------------------------------------------------------|
| `POST /v1/chat/completions`     | forwarded   | OpenAI Chat Completions wire shape. Supports `stream: true` (SSE).               |
| `POST /v1/completions`          | forwarded   | Legacy text-completion shape; not used by UH.                                    |
| `POST /v1/embeddings`           | forwarded   | Out of scope for UH today.                                                       |
| `GET  /v1/models`               | forwarded   | Requires valid upstream auth before model listing succeeds.                      |
| anything else (e.g. `/v1/health`, `/`) | **404**     | Returns `{"error":{"type":"path_not_allowed","code":"path_not_allowed", …}}`.   |

**Server header** observed: `Server: Python/3.11 aiohttp/3.13.4`. No CORS headers, no rate-limit headers in any observed response.

## 4. Auth handoff

* The proxy **requires** the `Authorization: Bearer <value>` header on every call. Missing or malformed → `401`.
* The proxy **ignores the bearer value** — it attaches *its own* credentials (resolved from `hermes auth`) to the upstream request. UH can send any non-empty bearer; the canonical placeholder used in the spike was `Bearer probe`.
* When upstream credentials are stale / missing / refresh-token-revoked:
  ```
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {"error": {
    "message": "Failed to refresh Nous Portal credentials: Invalid refresh token",
    "type": "upstream_auth_failed",
    "code": "upstream_auth_failed"
  }}
  ```
  Operator remediation lives entirely outside UH — `hermes auth status <provider>` and the provider-specific re-auth flow (`hermes auth add nous`, vendor OAuth dance). The UH adapter MUST surface this as `runtime-result.status: blocked` with a clear pointer to `hermes auth status`.

## 5. Error envelope (canonical)

Every error observed in the spike — across `401` and `404` — returns the same shape:

```json
{ "error": { "message": "…", "type": "…", "code": "…" } }
```

| `type`                | HTTP | Adapter classification (UH-39)                           |
|-----------------------|------|----------------------------------------------------------|
| `upstream_auth_failed`| 401  | **blocked** — operator re-auth required.                 |
| `path_not_allowed`    | 404  | **failed** — configuration error; surfaces config bug.   |
| (future) quota / rate | 429  | **blocked** — re-run later, no diff produced.            |
| (future) server_error | 5xx  | **failed** — non-deterministic; capture body verbatim.   |

Streaming requests with `stream: true` that fail at the proxy layer still return a **single JSON body** with the error envelope (not an SSE error event). The adapter therefore MUST tolerate both wire shapes — JSON or SSE — depending on whether the proxy reached the upstream.

## 6. Successful-path expectations (NOT live-verified)

A successful path could not be live-verified in this spike because the local `nous` provider credentials are stale:

```
$ hermes auth status nous
nous: logged out (Invalid refresh token)
```

The OAI-compat shape is contractual, so the adapter is designed against the standard wire (matching OpenAI Chat Completions API verbatim):

* Non-streaming success → `200`, body shape:
  ```json
  {
    "id": "chatcmpl-…",
    "object": "chat.completion",
    "created": 1755568000,
    "model": "hermes-4-405b",
    "choices": [{ "index": 0, "message": { "role": "assistant", "content": "…" }, "finish_reason": "stop" }],
    "usage": { "prompt_tokens": …, "completion_tokens": …, "total_tokens": … }
  }
  ```
* Streaming success → `text/event-stream`, `data: { … delta … }\n\n` chunks terminated by `data: [DONE]\n\n`.

UH-38 (E2E smoke) is gated on the operator re-authenticating Hermes against the upstream provider. Once green, the smoke run will be captured in `docs/runbooks/hermes-proxy-smoke.md`.

## 7. Recommendations for UH-35 (`HermesProxyRuntimeConfigSchema`)

```ts
export const HermesProxyRuntimeConfigSchema = z.object({
  /**
   * Proxy endpoint, including `/v1`. Default matches `hermes proxy start`'s
   * out-of-box bind (127.0.0.1:8645). Operators expose 0.0.0.0 + LAN-bind
   * via `hermes proxy start --host 0.0.0.0` if they want shared access.
   */
  endpoint: z.string().url().default("http://127.0.0.1:8645/v1"),

  /**
   * Model identifier passed verbatim in the `model` field. Whatever the
   * upstream provider exposes (e.g. `hermes-4-405b`, `claude-opus-4-7`,
   * `gpt-5-pro`). Required — there is no useful default.
   */
  model: z.string().min(1),

  /**
   * Bearer value sent on every request. The proxy ignores the value but
   * REQUIRES the header to be present. Defaults to `"hermes-proxy"` (any
   * non-empty placeholder works).
   */
  auth_token: z.string().min(1).default("hermes-proxy"),

  /**
   * Optional system prompt prefix. When set, prepended as a `system` message
   * before the buildMissionPrompt() user message. Lets operators inject
   * provider-specific persona/policy text without editing mission templates.
   */
  system_prompt: z.string().optional(),

  /**
   * Sampling controls forwarded to the upstream. Standard OAI knobs only.
   */
  temperature: z.number().min(0).max(2).default(0),
  max_tokens: z.number().int().positive().optional(),

  /**
   * Request timeout in ms. Long-context missions hit 405B routing latencies
   * north of 90s; the default leaves headroom for one model retry server-side.
   */
  request_timeout_ms: z.number().int().positive().default(300_000),

  /**
   * Whether to stream. Streaming is preferred so the harness can flush
   * stdout to `runtime-session.yaml`'s stdout.log in near-real-time and
   * surface the sentinel block as soon as the model emits it.
   */
  stream: z.boolean().default(true),
}).strict();
```

All keys above are validated through the existing `registerRuntimeConfigSchema("hermes-proxy", …)` plumbing established in [UH-26](https://linear.app/agenticengineering-agency/issue/UH-26).

## 8. Recommendations for UH-39 (adapter shape)

Hermes-proxy is fundamentally different from `hermes` / `codex` / `oh-my-pi`: **no subprocess, no stdout stream from a CLI**. It is an HTTP client. Concrete deltas vs the existing spawn-based adapters:

1. **No `command` / `args`.** The dry-run record's `command` field should be set to `"POST <endpoint>/chat/completions"` for human readability and the `args` array should contain the JSON request body (pretty-printed) for parity with `dryRunHermes`.
2. **stdout = the model's assistant message content** (or, for streaming, the concatenated `delta.content` chunks). Stderr remains a real string but typically empty; non-200 bodies are appended to stderr for forensics.
3. **Final-message sentinel ([UH-28](https://linear.app/agenticengineering-agency/issue/UH-28)).** The mission prompt MUST include `runtimeFinalMessageInstruction()`. The assistant's final message is scanned with `extractRuntimeFinalMessageSentinel(content)`. `runtime-final.txt` is written exactly as in hermes/codex/oh-my-pi.
4. **Diff capture ([UH-34](https://linear.app/agenticengineering-agency/issue/UH-34)).** Delegate to `captureDiffWithUntracked(cwd)`. Note: the model itself does **not** mutate the working tree in v1 — it returns proposed changes in its message body and the harness applies them in a future slice. For UH-32's v1, the adapter produces an empty diff in the common case (the assistant's message content becomes the artifact). This matches the [UH-27 / UH-33](https://linear.app/agenticengineering-agency/issue/UH-33) "model emits assistant message + harness applies" pattern already supported elsewhere.
5. **Sandbox seed ([UH-29](https://linear.app/agenticengineering-agency/issue/UH-29)).** Free — `createSandbox` already copies the bound mission dir.
6. **Blocked classification (the key spike output):**
   * `upstream_auth_failed` → `runtime-result.status: blocked`, `errors: ["hermes-proxy: upstream auth invalid; run `hermes auth status <provider>`"]`.
   * HTTP 429 with any code → `blocked` with the upstream `Retry-After` header surfaced if present.
   * HTTP 5xx → `failed` (config / upstream outage).
   * Network unreachable (ECONNREFUSED, ETIMEDOUT) → `blocked`, `errors: ["hermes-proxy: cannot reach <endpoint>; is `hermes proxy start` running?"]`.
   * 200 with no `choices[0].message.content` → `failed` (empty assistant message).
   * 200 but no `uh-runtime-final-message` block in the content → `passed` with a warning, mirroring oh-my-pi behavior (sentinel is recommended, not required).
7. **Dispatch wiring:** add to `RUNTIME_WIRINGS` with `surfaceBlocked: true` (consistent with codex and oh-my-pi — blocked auth must non-zero-exit for CI/verification gates).

## 9. Adapter manifest (recommendation for UH-35)

```yaml
# .harness/adapters/hermes-proxy.yaml
id: hermes-proxy
runtime: hermes-proxy
status: experimental                 # UH-38 promotes to active
description: |
  HTTP client targeting a local `hermes proxy` instance.
  Provider-agnostic OAI-compat routing for OAuth-backed subscriptions
  (Nous Portal in 0.14.0; future Hermes versions may add claude/chatgpt/supergrok).
config:
  runtime_config:
    endpoint: "http://127.0.0.1:8645/v1"
    model: "hermes-4-405b"
    auth_token: "hermes-proxy"
    temperature: 0
    request_timeout_ms: 300000
    stream: true
capabilities:
  - subscription-auth
  - oai-compat
```

`cli_command` is **not** populated — there is no spawn target. `adapter check hermes-proxy` should perform a lightweight `GET <endpoint>/models` and surface the same wire-shape error envelope it would surface during a mission run.

## 10. Adapter check shape (recommendation for UH-39 / UH-37)

`uh adapter check hermes-proxy` should do roughly:

1. Read the manifest. Validate `runtime_config` via the registered Zod schema (UH-26 path).
2. `fetch(`<endpoint>/models`, { headers: { authorization: `Bearer <auth_token>` } })`.
3. Map response:
   * `200` with a `data: [...]` array → `available: true`, surface model ids.
   * `401 upstream_auth_failed` → `available: false`, `errors: ["upstream auth invalid — run `hermes auth status <provider>`"]`.
   * `404 path_not_allowed` on `/models` → `available: false`, `errors: ["proxy version mismatch: /models not forwarded"]` (would only trigger if Hermes changes the route set).
   * `ECONNREFUSED` → `available: false`, `errors: ["proxy unreachable at <endpoint>; run `hermes proxy start`"]`.
4. Return `AdapterCheckResult` identical in shape to the hermes / codex / oh-my-pi checkers.

## 11. Known gotchas

* **No upstream model list without auth.** `GET /v1/models` requires valid upstream creds. So `adapter check` cannot enumerate models when the user is logged out — the check must report "configured but locked" rather than "broken".
* **No `--ask-for-approval`-style flag drift surface.** HTTP wire is contractually stable across hermes versions (OAI-compat is the contract). Version skew should be invisible. [UH-30](https://linear.app/agenticengineering-agency/issue/UH-30) doesn't recur.
* **Streaming + error mix.** A request with `stream: true` that fails at the proxy returns one JSON body (not SSE). Parser MUST sniff `content-type` before assuming SSE.
* **No file mutation channel in v1.** The model returns its full deliverable in the assistant message content; the harness applies. If we later wire OAI-compat **tool use**, that's a separate epic — not in UH-32 scope.
* **Provider expansion is out-of-band.** When Hermes adds a `claude` provider, it ships as a new `--provider claude` startup flag — no UH change required, since UH only talks to `localhost:8645/v1`.

## 12. Acceptance for downstream slices

* **UH-35** lands `.harness/adapters/hermes-proxy.yaml`, `src/adapters/hermes-proxy.ts` (schema-only export), and the `uh adapter add hermes-proxy` template. No HTTP behaviour yet.
* **UH-39** lands `planHermesProxyRun`, `runHermesProxy`, `dryRunHermesProxy`, the runtime checker, sentinel extraction, blocked classification, and unit tests with an injectable `fetchImpl` (so tests deterministically simulate 200 / 401 / 404 / 429 / ECONNREFUSED).
* **UH-37** replaces the dispatch stub with the real functions, adds `surfaceBlocked: true`, and proves sandbox routing parity.
* **UH-40** publishes `docs/architecture/adapter-hermes-proxy.md` + `docs/runbooks/hermes-proxy-setup.md` cross-referencing this spike.
* **UH-38** runs `uh mission run --runtime hermes-proxy` end-to-end against a re-authenticated upstream, captures the receipt in `docs/runbooks/hermes-proxy-smoke.md`, and promotes the manifest from `experimental` to `active`.

## 13. Blocker passed to operator

UH-38 cannot complete until `hermes auth status nous` (or whatever provider becomes the smoke target) reports a non-expired refresh token. The current state is:

```
nous: logged out (Invalid refresh token)
```

Re-auth is owned by the operator (`hermes auth add nous` or equivalent). All earlier slices (UH-35 / UH-39 / UH-37 / UH-40) are unblocked and proceed without a live upstream.
