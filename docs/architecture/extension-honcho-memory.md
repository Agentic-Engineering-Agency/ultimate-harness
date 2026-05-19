# Honcho Memory Extension (OMP adapter)

Status: in-flight (UH-NN)
Original work: [`@agney/pi-honcho-memory@0.1.0`](https://www.npmjs.com/package/@agney/pi-honcho-memory) (pi extension)

## Why

The pi extension lives **inside** the pi runtime: it hooks `session_start`,
`before_agent_start`, and `agent_end` via `ExtensionAPI` and mutates the
system prompt in-process. When UH runs missions through the `oh-my-pi`
adapter, pi extensions only run if the user has them installed locally and
`allow_extensions: true` is set on the mission. That is brittle:

- UH publishes missions, but cannot guarantee pi extensions are installed.
- Other adapters (`codex`, `hermes`, `hermes-proxy`) cannot reuse a pi-only
  extension at all.
- Memory injection at the pi layer is invisible to the UH artifact pipeline
  (`prompt.txt`, `runtime-session.yaml`) — the persisted prompt diverges
  from what the model actually saw.

## Shape

A UH-side, adapter-agnostic module at `src/extensions/honcho-memory/`
exposing a small functional surface that adapters call at well-defined
points in their lifecycle:

```
enrichMissionPrompt(prompt, { cwd, missionId }): Promise<string>
recordMissionExchange(prompt, finalMessage, { cwd, missionId }): Promise<void>
flushPendingHonchoSaves(): Promise<void>
resolveHonchoMemoryConfig(): Promise<HonchoMemoryConfig>
```

The first cut wires `oh-my-pi`; `codex` and `hermes` follow the same
contract once smoke-tested.

## Lifecycle mapping (pi -> UH)

| pi extension hook       | UH adapter call site                      |
| ----------------------- | ----------------------------------------- |
| `session_start`         | first `enrichMissionPrompt` call (lazy)   |
| `before_agent_start`    | `planOhMyPiRun` after `buildMissionPrompt`|
| `agent_end`             | `collectOhMyPiSession` after final-msg    |
| `session_shutdown`      | `flushPendingHonchoSaves` in CLI exit     |

Lazy bootstrap matches the pi extension's "warm cache before first prompt"
behavior. The UH adapter awaits the first enrich call, so the initial
mission always sees memory; subsequent missions in the same process hit
the in-memory cache.

## Config

Same env vars as the pi extension to share `~/.honcho/config.json`:

```
HONCHO_ENABLED              opt-in flag; defaults to true if HONCHO_API_KEY set
HONCHO_API_KEY              required when enabled
HONCHO_URL                  optional base URL
HONCHO_WORKSPACE_ID         defaults to "uh"
HONCHO_PEER_NAME            defaults to $USER
HONCHO_AI_PEER              defaults to "ultimate-harness"
HONCHO_SESSION_STRATEGY     repo | git-branch | directory (default repo)
HONCHO_CONTEXT_TOKENS       default 1200
HONCHO_MAX_MESSAGE_LENGTH   default 8000
```

File config (highest-priority env override):

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
      "maxMessageLength": 8000,
      "endpoint": null
    }
  }
}
```

The `hosts.uh` namespace is independent of `hosts.pi`, so a developer can
run the pi extension and the UH adapter side-by-side with different peers
or workspaces.

## Failure modes (fail-fast on config, graceful on network)

| Condition                                  | Behavior                          |
| ------------------------------------------ | --------------------------------- |
| `HONCHO_ENABLED=false` or unset, no key    | no-op (memory disabled)           |
| `HONCHO_ENABLED=true`, key missing         | throw at first enrich call        |
| Network failure during bootstrap/fetch     | log to stderr, return unchanged   |
| Network failure during save                | log to stderr, keep cached state  |

Config errors break the run because they indicate operator mistakes;
runtime network errors degrade silently because the user did everything
right and the network blinked.

## Prompt injection format

Identical to the pi extension so user-facing copy stays consistent:

```
[Persistent memory]
User profile:
<peer representation>

Project summary:
<session summary>
```

Block is appended to the mission prompt after the `Execute this mission`
footer but before the runtime-final-message instruction, so the model sees
memory as the last system context before the action prompt.

## Artifact alignment

The enriched prompt is written to `prompt.txt` and the runtime-session
artifact — adapters call `enrichMissionPrompt` *before* persisting the
prompt. This matters because:

- `runtime-session.yaml` becomes a faithful record of model input.
- Replays reproduce the same memory snapshot (when paired with
  `Honcho.session.replay()` in a future iteration).
- Verification diffs can spot regressions in memory format.

## SDK dep

`@honcho-ai/sdk@^2.0.1` is added as a runtime dep. We import it dynamically
inside the client module so that environments without Honcho configured pay
no startup cost.

## Open follow-ups

- `codex` and `hermes` adapter wiring (UH-NN).
- Runtime-config opt-out per mission (`runtime_config.honcho_memory: false`).
- `honcho_search` / `honcho_remember` exposed to missions as MCP tools.
- Replay/recall hooks for the verification phase.
