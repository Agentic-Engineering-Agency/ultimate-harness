# Codex Runtime Adapter

## Purpose

The Codex adapter maps Ultimate Harness missions onto the OpenAI Codex CLI
(`codex`). It exists alongside the Hermes adapter and shares the same
[runtime adapter contract](./runtime-adapter-contract.md): mission packets in,
structured runtime sessions and artifacts out, no implicit promotion.

This document is the design — not the implementation. Wiring lives in a
follow-up issue. The manifest stub is at `.harness/adapters/codex.yaml`.

## Invocation

Codex is launched non-interactively through `codex exec` (alias `codex e`).
The adapter never opens a TTY; missions run unattended inside a sandbox
managed by both Codex and the harness.

Baseline command:

```text
codex exec \
  --sandbox workspace-write \
  --cd <sandbox-path> \
  --json \
  --output-last-message <mission-dir>/runtime-final.txt \
  --skip-git-repo-check \
  "<mission-prompt>"
```

Flag rationale:

- `exec` — non-interactive mode. Required; the harness owns the lifecycle and
  must not depend on a human keypress inside Codex.
- `--sandbox workspace-write` — Codex confines writes to the sandbox cwd and
  blocks unrelated filesystem effects. This is the recommended replacement for
  the deprecated `--full-auto` macro.
- `--ask-for-approval` was retired in `codex-cli 0.130`. Under
  `--sandbox workspace-write`, in-sandbox actions are auto-approved without
  an explicit flag. Elevation prompts (network access, writes outside the
  sandbox) still surface; the adapter exposes them as `runtime.blocked`
  events rather than answering them. The `approval_policy` runtime_config
  key is retained for backward-compat with manifests written against
  pre-0.130 codex CLIs but is currently a no-op (see UH-30).
- `--cd <sandbox-path>` — pins Codex to the worktree allocated by the sandbox
  backend. The adapter never invokes Codex from the canonical repo root.
- `--json` — emits a JSON Lines event stream on stdout. The adapter consumes
  it to build `runtime-session.yaml` and `events.ndjson`.
- `--output-last-message <path>` — writes the final assistant message to a
  known file so the adapter does not have to re-parse the JSONL tail to
  recover the summary.

### `--full-auto` compatibility

`codex exec --full-auto` is retained by Codex as a deprecated compatibility
flag that prints a warning on every run. The adapter does **not** emit it.
A `compat_full_auto: true` field on the adapter config is reserved for users
pinned to older Codex builds that lack `--sandbox`; when set, the adapter
substitutes `--full-auto` and records a `runtime.deprecated_flag` event.

### Elevated mode

`--sandbox danger-full-access` is permitted only when the mission explicitly
declares `sandbox.escalation: danger-full-access` and the workflow profile
allows it. The adapter refuses to silently upgrade.

## Capability flags

Declared in `.harness/adapters/codex.yaml` so the registry and mission
compiler can route work correctly. The adapter advertises:

| Capability    | Value | Meaning                                                                 |
| ------------- | ----- | ----------------------------------------------------------------------- |
| `interactive` | false | `codex exec` is one-shot; the adapter does not stream a chat session.   |
| `oneShot`     | true  | The adapter executes a mission to completion and exits.                 |
| `background`  | true  | Runs unattended; the harness owns supervision and cancellation.         |
| `worktree`    | true  | Requires a git-worktree sandbox; cwd must be the allocated worktree.    |
| `jsonOutput`  | true  | Consumes `codex exec --json` JSONL events for structured reporting.     |
| `mcp`         | true  | Honors MCP tools configured in the user's `~/.codex/config.toml`.       |

These map onto the contract vocabulary as: `non_interactive_run`,
`structured_events`, `sandbox_native`, `json_output`, `diff_output`,
`file_tools`. `interactive_steering`, `subagents`, `skills`, and `browser`
are intentionally **not** advertised; missions that require them must route
to a different adapter.

## Mission-prompt input shape

The adapter compiles the mission packet into a single prompt string passed as
the trailing positional argument to `codex exec`. The shape is the same
Markdown block used by Hermes (`buildMissionPrompt`) so prompts stay
runtime-portable:

```text
# Mission: <mission.name>

<mission.description>

## Workflow: <workflow.name>

### <phase.name> (<phase.agent_role>)
<phase.description>

## Related Issues
- [<source>] <reference> (<url>)

## Read First
- <path>

## Expected Artifacts
- <path> (<type>)

## Verification Checks
- <check>

Execute this mission and produce the expected artifacts.
```

Codex-specific additions appended after the shared body:

- A `## Sandbox` block stating the worktree path and the active sandbox flag,
  so the model does not propose `cd` outside its scope.
- A `## Constraints` block enumerating mission `constraints[]` verbatim.
- A trailing instruction to emit a final summary block (see below) as the
  last assistant message so `--output-last-message` captures it cleanly.

The prompt is persisted to `.harness/missions/<id>/prompt.md` exactly as
sent. The mission id appears in the first line so it survives any log dump.

## Run-result block format

The prompt asks Codex to end with a fenced block that the adapter parses into
`runtime-session.yaml` and the canonical `uh.runtime-result.v0` shape:

````text
```yaml
schema_version: uh.runtime-result.v0
mission_id: <mission.id>
runtime:
  adapter_id: codex
  session_id: <codex-thread-id>
status: completed   # completed | failed | cancelled | blocked
summary: <one-line summary>
artifacts:
  - path: <path>
    kind: <documentation|code|test|config>
    status: <created|modified|deleted>
changes:
  diff_ref: .harness/missions/<id>/diff.patch
  files_changed:
    - <path>
checks_suggested:
  - <command or named check>
blockers: []
logs:
  - .harness/missions/<id>/runtime.log
```
````

If the model omits the block, the adapter synthesizes one from the JSONL
event stream and the captured diff, and stamps `status: blocked` with a
`runtime.missing_result_block` finding. The harness never trusts the model's
status word alone — `status: completed` requires a non-empty diff *and*
either an empty `blockers[]` or explicit waiver.

## stdout/stderr/diff capture

Each mission run produces a fixed set of files inside
`.harness/missions/<id>/`:

| File                  | Source                                                              |
| --------------------- | ------------------------------------------------------------------- |
| `prompt.md`           | Compiled mission prompt sent to Codex.                              |
| `runtime.log`         | Raw stdout (JSONL stream) tee'd as the child writes.                |
| `runtime.stderr.log`  | Raw stderr from `codex exec`.                                       |
| `events.ndjson`       | Normalized lifecycle events derived from the JSONL stream.          |
| `runtime-final.txt`   | Final assistant message captured via `--output-last-message`.       |
| `runtime-session.yaml`| `uh.runtime-session.v0` document with command, args, exit code.     |
| `diff.patch`          | `git diff` against the sandbox base ref at collection time.         |
| `artifacts/`          | Files emitted outside the worktree's tracked paths, copied in.      |

Capture rules:

1. The adapter spawns Codex with `stdio: ["pipe", "pipe", "pipe"]` and
   streams stdout/stderr to disk as bytes arrive. No buffering of full output
   in memory; this mirrors the Hermes adapter's `child.stdout.on("data", …)`
   pattern.
2. JSONL parsing is line-incremental. Unparseable lines are written to
   `runtime.log` verbatim and surfaced as `runtime.parse_error` events;
   they do not abort the run.
3. `diff.patch` is produced by `git -C <sandbox-path> diff --binary
   <base-ref>...HEAD` after Codex exits (or after cancellation). Untracked
   files are appended via `git ls-files --others --exclude-standard` plus
   `git diff --no-index /dev/null <path>` so reviewers see them too.
4. All artifact paths are validated to live inside the mission directory
   before writing, using the same `assertPathInsideMissionDir` guard the
   Hermes adapter uses. Symlinked mission directories are refused.

## Verification triggering

The Codex adapter does not run verification itself. After `collect`, it:

1. Maps each entry in `mission.verification.required_checks[]` into the
   `checks_suggested[]` list of the runtime result, preserving order.
2. Appends Codex-derived suggestions from the JSONL stream: any
   `item.kind: command` that exited non-zero becomes a `re-run` suggestion,
   any new test file becomes a `run-tests <path>` suggestion.
3. Emits a `runtime.verification_ready` event so the harness can invoke
   `uh verify <mission-id>`. The verify command is the system of record for
   pass/fail; the adapter only stages the intent.

Mission `verification.review_gates[]` are passed through unchanged and
surface in the review step that follows verification.

## Default flags

The manifest's `config` block carries the runtime defaults. They are
overridable per-mission via workflow profiles.

| Config field        | Default              | Notes                                                  |
| ------------------- | -------------------- | ------------------------------------------------------ |
| `cli_command`       | `codex`              | Resolved through `PATH`.                               |
| `default_toolsets`  | `[]`                 | Codex tool surface is controlled in `~/.codex/config`. |
| `default_provider`  | `""`                 | Unused; provider is configured in Codex itself.        |
| `default_model`     | `""`                 | Empty means "let Codex pick its configured default".   |
| `worktree_mode`     | `true`               | Codex always runs in an allocated worktree.            |
| `pass_session_id`   | `false`              | Codex assigns its own thread id; the adapter records it.|

Hard-coded launch flags (not in the manifest because they are part of the
adapter contract, not user policy):

- `exec`
- `--sandbox workspace-write`
- `--cd <sandbox-path>`
- `--json`
- `--output-last-message <mission-dir>/runtime-final.txt`
- `--skip-git-repo-check`

The mission prompt is the trailing positional argument.

## Risks and limits

- **Sandbox depth.** `--sandbox workspace-write` constrains Codex but does
  not isolate environment variables, shell aliases, or network access. The
  git-worktree sandbox backend gives filesystem isolation; network policy is
  out of scope for this adapter.
- **Deprecated `--full-auto`.** The flag still works but Codex warns on every
  run and may remove it. The adapter avoids it by default; the
  `compat_full_auto` escape hatch exists only for pinned older builds.
- **Elevation prompts block progress.** In `codex-cli 0.130+`, any operation
  outside the sandbox (network, writes outside cwd) still surfaces as an
  elevation request. The adapter exposes it as a `runtime.blocked` event
  rather than auto-approving, to avoid silently widening permissions.
- **JSONL schema drift.** Codex event types (`thread.started`, `turn.*`,
  `item.*`, `mcp_tool_call`, …) evolve. The adapter parses by event name
  with a fallback bucket; unknown events are stored verbatim so we do not
  drop signal during version upgrades.
- **Final-message reliability.** Models occasionally skip the requested
  YAML result block. The adapter's synthesis path handles this but the
  reconstructed result is marked `synthesized: true` and downgrades to
  `status: blocked` if the diff is also empty.
- **MCP scope.** Codex's MCP tools run with the user's full config; the
  adapter inherits whatever servers are registered. Missions that must
  disable specific MCP servers need to declare it as a constraint —
  the adapter cannot reach into `~/.codex/config.toml` for them.
- **Resume semantics.** `codex exec resume` is available but the harness
  does not use it for MVP missions: every mission run is treated as a fresh
  thread so audit boundaries stay clean. A `resume_session_id` config flag is
  reserved for future iteration.
- **No subagent fan-out.** Codex runs as a single thread. Missions that
  expect parallel subagent execution must route to an adapter that
  advertises `subagents`.

## Implementation status (2026-05-17)

- The adapter is now wired as `experimental` in `src/adapters/codex.ts` (CLI transport via `codex exec`, JSONL parsing, final-message capture, diff capture, runtime-result emission). End-to-end against the real Codex backend is gated on subscription quota and is NOT yet verified.
- Local CLI probed: `codex-cli 0.130.0`. Supports `--cd`, `--sandbox`, `--ask-for-approval`, `--json`, `--output-last-message`, `--skip-git-repo-check`.
- Quota / auth failures are classified as `runtime-result.status: blocked` with an explicit remediation message; they are NOT failures of the mission.

## Why no direct ChatGPT backend OAuth client

- Both `NousResearch/hermes-agent` and `can1357/oh-my-pi` treat the Codex backend (`https://chatgpt.com/backend-api`) as a specialized OAuth-backed surface (`OpenAI-Beta: responses=experimental`, `chatgpt-account-id` from a JWT claim, `originator` header). Implementing that wire protocol inside Ultimate Harness would duplicate fragile semi-private behavior and require credential/refresh storage decisions.
- The official `codex exec` CLI already owns OAuth, account state, session ids, and rate-limit handling, and exposes the exact non-interactive primitives we need. Using it as the transport is the smallest correct slice.
- Reuse of broker/gateway patterns (oh-my-pi `auth-broker`/`auth-gateway`) is parked as a future option — see `architecture/adapter-pi-and-oh-my-pi.md`.
