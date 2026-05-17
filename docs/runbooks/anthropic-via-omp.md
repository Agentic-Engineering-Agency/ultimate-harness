# Anthropic via oh-my-pi (UH-27)

## What this runbook covers

Routing Claude models through Ultimate Harness without building a native
Anthropic adapter — by using the existing `oh-my-pi` adapter (shipped in
UH-25) and the new mission-level `runtime_config_overrides` (UH-27) to
select an Anthropic-tier model per mission.

```yaml
# .harness/missions/<id>/mission.yaml
runtime_config_overrides:
  model: anthropic/claude-opus-4-7
  thinking: medium
```

Adapter manifest at `.harness/adapters/oh-my-pi.yaml` does NOT need to
change; the default `model: ""` stays empty so other missions keep their
own model choice.

## Auth & ToS posture — read this before adopting

**OMP's anthropic provider authenticates against Claude Pro/Max via a
PKCE flow that uses Claude Code's OAuth `client_id`** (base64-decoded in
`packages/ai/src/utils/oauth/anthropic.ts`). On the wire, OMP additionally
applies a "stealth surface" so Anthropic's server-side detection does not
reject the request:

- Claude Code system-prompt prefix: `"You are a Claude agent, built on
  Anthropic's Claude Agent SDK."` (see OMP `claudeCodeSystemInstruction`)
- `proxy_*` tool name prefix (matches Claude Code's convention)
- `User-Agent: claude-cli/<version>` plus `claudeCodeHeaders` and the
  Claude Code beta-feature header set
- Node TLS ciphersuite ordering matching Claude Code's binary
  (`CLAUDE_CODE_TLS_CIPHERS = tls.DEFAULT_CIPHERS`)

**Anthropic Consumer ToS (Feb 20, 2026) explicitly prohibits using
subscription OAuth tokens outside Claude Code.** Server-side detection
has been live since Jan 9, 2026 (it killed OpenCode, Roo Code, Cline).
OMP's stealth surface currently bypasses that detection — but this is a
cat-and-mouse posture, not a stable contract:

- If Anthropic tightens detection (e.g. adds tool-name-pattern matching),
  every mission using this route fails together until OMP catches up.
- A ToS escalation by Anthropic against the `client_id` would invalidate
  every Claude Max user's tokens.
- Reputationally, UH's posture inherits OMP's posture; if that becomes a
  problem, switch missions to a paid `ANTHROPIC_API_KEY` route
  (a future UH issue may add a native adapter).

You are responsible for accepting this risk on your Anthropic account.
This runbook does not endorse the route — it documents it because UH-26
made the override path explicit and UH-27 chose to wire it.

## Prerequisites

1. OMP installed and on `PATH` (`omp --version` ≥ `15.1.3`).
2. Claude Pro or Claude Max subscription, logged in via OMP:
   ```
   omp auth login anthropic
   ```
   This runs the PKCE flow on `localhost:54545`; on success OMP stores a
   refreshable OAuth token in its credential database.
3. UH `.harness/adapters/oh-my-pi.yaml` present (created by `uh init`).
   The manifest's `config.runtime_config.model:` may stay empty — the
   mission-level override fills it in per-mission.

## Smoke test sequence

The reference mission lives at `examples/missions/anthropic-via-omp-smoke.yaml`.
Copy it under `.harness/missions/<id>/mission.yaml` in a host project to
exercise the path:

```
uh mission dry-run .harness/missions/anthropic-via-omp-smoke/mission.yaml \
  --runtime oh-my-pi
```

The dry-run output should include `--model anthropic/claude-opus-4-7` in
the planned `args`. Then:

```
uh mission run .harness/missions/anthropic-via-omp-smoke/mission.yaml \
  --runtime oh-my-pi
```

Watch `.harness/missions/<id>/runtime.stdout.log` for OMP's NDJSON event
stream. A successful run produces:

- `runtime-final.txt` containing the assistant's last message
- `events.ndjson` with `runtime.started` → `oh-my-pi.message`* →
  `runtime.finished`
- `runtime-result.yaml` with `status: passed`

## Failure modes & what to do

| Symptom | Likely cause | Remediation |
|---|---|---|
| `401 Unauthorized` in stderr | OMP token expired or revoked | `omp auth login anthropic` to refresh |
| `runtime-result.yaml: status: blocked` + "auth or quota error" | Detected by `detectOhMyPiQuotaError`; usually a tightened Anthropic server-side block | Check OMP release notes for stealth-surface updates; pin a known-good OMP version |
| `Mission runtime_config_overrides validation failed` | Typo or unknown key in mission override | Diff against `OhMyPiRuntimeConfigSchema` in `src/adapters/oh-my-pi.ts` |
| Hangs without final message | OMP exited before emitting an assistant event | `runtime-result.yaml: status: blocked`; inspect stderr; common cause is upstream rate-limit |

## Mission override schema

Mission-level `runtime_config_overrides` is validated by the same strict
`OhMyPiRuntimeConfigSchema` as the adapter manifest, after merging.
Valid keys:

- `mode`: `json | text | rpc | rpc-ui` (default `json`; `rpc-ui` is rejected
  for headless runs)
- `thinking`: `"" | minimal | low | medium | high | xhigh`
- `allow_extensions`: boolean
- `allow_skills`: boolean
- `model`: arbitrary string; OMP routes `anthropic/...`, `openai/...`,
  `openrouter/...`, etc.

Unknown keys raise a load-time Zod error — same typo safety as the
adapter manifest after UH-26.

## Out of scope for UH-27

- Per-runtime override merging for `hermes` and `codex` adapters (parity
  follow-up: file UH-31 when needed).
- Native Anthropic adapter using `ANTHROPIC_API_KEY` (the ToS-clean
  alternative; file as UH-29 when desired).
- OpenRouter/Vercel AI Gateway routing (file as UH-30).
