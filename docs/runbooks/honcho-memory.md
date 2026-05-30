# Honcho persistent memory with the `oh-my-pi` adapter

> Status: shipped in v0.4.0 (UH-NN)
> Companion design doc: [extension-honcho-memory.md](../architecture/extension-honcho-memory.md)

UH ships a built-in extension that injects [Honcho](https://honcho.dev)
memory into mission prompts and persists each exchange back to Honcho.
It runs at the **harness layer**, so it works whether or not the user has
the `@agney/pi-honcho-memory` pi extension installed, and the persisted
`prompt.txt` artifact reflects exactly what the agent saw.

## What it does

1. **Bootstrap once per process.** First mission run lazily connects to
   Honcho, resolves the user/AI peers, and creates/joins the session.
2. **Inject memory into the prompt.** The cached `[Persistent memory]`
   block (user profile + project summary) is appended to the mission
   prompt before `planOhMyPiRun` finalizes args and persists `prompt.txt`.
3. **Save the exchange on completion.** After `collectOhMyPiSession`
   extracts the final assistant message, UH enqueues a user-prompt and
   assistant-final pair on the session. `flushPendingHonchoSaves()` is
   awaited before `runOhMyPi` returns so saves cannot leak past process
   exit.

## Enabling

Set environment variables before invoking `uh`:

```bash
export HONCHO_API_KEY=hch-...            # required
export HONCHO_ENABLED=true               # optional; auto-on when key is set
export HONCHO_WORKSPACE_ID=uh            # optional; defaults to "uh"
export HONCHO_PEER_NAME=lalo             # optional; defaults to $USER
export HONCHO_AI_PEER=ultimate-harness   # optional; defaults to "ultimate-harness"
export HONCHO_SESSION_STRATEGY=repo      # repo | git-branch | directory
export HONCHO_CONTEXT_TOKENS=1200        # token budget for fetched memory
export HONCHO_MAX_MESSAGE_LENGTH=8000    # skip exchanges above this length

uh run missions/M-001-example.yaml
```

Or share `~/.honcho/config.json` with the pi extension. UH reads the
`hosts.uh` namespace (with `hosts.pi` as a fallback for shared fields):

```jsonc
{
  "apiKey": "hch-...",
  "peerName": "lalo",
  "hosts": {
    "uh": {
      "workspace": "uh",
      "aiPeer": "ultimate-harness",
      "sessionStrategy": "repo",
      "contextTokens": 1200,
      "maxMessageLength": 8000
    }
  }
}
```

Env vars always override the file. `HONCHO_ENABLED=false` disables the
extension even when an API key is present — useful for CI runs that
must not pollute long-term memory.

## Verifying it is working

After enabling, run any oh-my-pi mission. Open the persisted prompt:

```bash
uh run missions/your-mission.yaml
cat .uh/missions/<id>/prompt.txt | tail -n 20
```

You should see a block like:

```
[Persistent memory]
User profile:
Name: Eduardo Javier García López (Lalo); Role: ...

Project summary:
Ultimate Harness (uh) at ~/AgenticEngineering/ultimate-harness. ...
```

If the block is missing:

| Symptom                                  | Likely cause                      | Fix                              |
| ---------------------------------------- | --------------------------------- | -------------------------------- |
| No block, no warning                     | `HONCHO_ENABLED` unset, no key    | Export `HONCHO_API_KEY`          |
| Throw `HONCHO_API_KEY is missing`        | `HONCHO_ENABLED=true`, no key     | Unset flag or set key            |
| `[honcho-memory] bootstrap failed: ...`  | Honcho unreachable / bad key      | Check `HONCHO_URL`, key, network |
| `[honcho-memory] memory fetch failed`    | Network blip after bootstrap      | Re-run; cache stays warm         |

All non-config failures log to stderr and let the mission run continue
without memory — runtime correctness is never traded for memory.

## Session keys

`HONCHO_SESSION_STRATEGY` controls how memory is scoped:

- `repo` (default) — derived from `git remote get-url origin`. Shares
  memory across worktrees of the same repository, which matches Lalo's
  parallel-worktree workflow.
- `git-branch` — `repo` + branch suffix. Use when feature branches need
  separate memory (rare).
- `directory` — falls back to `cwd_<basename>_<hash>`. Use outside git
  checkouts or for one-off scratch dirs.

The key is logged via the Honcho client when verbose logging is enabled
in the SDK.

## Disabling temporarily

Process-wide, via env:

```bash
HONCHO_ENABLED=false uh run missions/your-mission.yaml
```

Or simply unset `HONCHO_API_KEY` for the call.

### Per-mission opt-out (UH-137)

To disable Honcho for a single mission without touching env, set
`honcho_memory: false` in the mission's `runtime_config_overrides` (or the
adapter manifest's `runtime_config`):

```yaml
runtime_config_overrides:
  honcho_memory: false
```

`false` skips **all** Honcho activity for that run — no memory injection, no
exchange save, and the `honcho_search` / `honcho_remember` tools become
no-ops. Omitting the key (or `true`) keeps the default-ON behavior. The key is
validated by each Honcho-aware adapter's strict schema (`oh-my-pi`, `codex`,
`pi`, `hermes`), so a non-boolean value fails fast.

## Mission memory tools: `honcho_search` / `honcho_remember` (UH-137)

Two memory operations are available alongside the prompt enrichment:

- `honcho_search(query)` — semantic search over the session's memories;
  returns up to `HONCHO_SEARCH_LIMIT` snippets (each truncated to
  `HONCHO_TOOL_PREVIEW_LENGTH` chars).
- `honcho_remember(content)` — persist a free-form memory for later recall.

> **Mechanism (be honest about it):** UH runs each runtime as a subprocess CLI
> and does **not** expose an MCP tool-calling channel the agent can invoke
> mid-mission. These two are therefore **harness-side operations** built on
> the existing Honcho client and surfaced through the same memory hook — they
> are **not** model-callable MCP tools yet. Exposing them as real MCP tools to
> the spawned runtime is a tracked follow-up. They honor the same posture as
> the rest of the extension: disabled config → no-op; missing key → fail-fast;
> network blip → stderr warning + the mission continues.

Both respect the `honcho_memory: false` opt-out above.

## Inspecting what was saved

Honcho exposes a CLI and a web console for browsing peers, sessions,
and conversations. Search for the session key UH derived to find that
repo's stream of exchanges.

## Limitations of the current cut

- `honcho_search` / `honcho_remember` are harness-side operations, not yet
  exposed as model-callable MCP tools to the spawned runtime (see "Mission
  memory tools" above for the mechanism). True in-mission tool-calling is a
  tracked follow-up.
- Memory cache is per-process. A daemon mode could refresh between
  missions; today every `uh run` is its own process.
