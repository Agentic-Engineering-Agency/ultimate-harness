# Adapter: Claude Code

Status: **planned** (design only, no runtime wiring yet)

Runtime adapter that drives Anthropic's [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI as an Ultimate Harness runtime. Claude Code is a long-running interactive coding agent with first-class tool support (file edits, shell, web fetch, MCP servers). This adapter pins it into a structured, non-interactive lane that the harness can observe, verify, and promote.

Refer to [`runtime-adapter-contract.md`](./runtime-adapter-contract.md) for the lifecycle methods and result schema every adapter must satisfy. This document fills in the Claude-Code-specific decisions.

## Invocation

The adapter shells out to the official `claude` CLI in headless (non-interactive) mode:

```bash
claude \
  -p "$MISSION_PROMPT" \
  --output-format stream-json \
  --include-partial-messages \
  --permission-mode plan \
  --allowed-tools "Read,Edit,Write,Bash(git diff:*),Bash(git status:*),Bash(npm test:*),Bash(bun test:*)" \
  --disallowed-tools "Bash(rm:*),Bash(git push:*),Bash(git reset:*),WebFetch" \
  --add-dir "$SANDBOX_ROOT" \
  --session-id "$RUNTIME_SESSION_ID"
```

Key flags and why:

- `-p / --print`: non-interactive single-turn execution. Required so the adapter can drive a mission to completion without a TTY.
- `--output-format stream-json`: emits one JSON event per line (system init, assistant turns, tool calls, tool results, final result). The adapter parses this stream into the structured events that [`observe`](./runtime-adapter-contract.md#observersession_id) must yield.
- `--include-partial-messages`: surfaces streaming deltas so long-running tool calls do not look stalled.
- `--permission-mode`: default `plan` (read-only exploration); promoted to `acceptEdits` only after `prepare()` confirms the mission's promotion policy allows in-sandbox writes. The harness never grants `bypassPermissions`.
- `--allowed-tools` / `--disallowed-tools`: explicit allowlist of file and bash operations plus an explicit denylist for destructive or out-of-sandbox actions. The adapter composes the final tool list from mission capabilities; missing capabilities collapse to a deny.
- `--add-dir`: bounds tool access to the sandbox worktree. The adapter refuses to launch if this directory is outside the configured sandbox root.
- `--session-id`: deterministic UUID issued by the harness so logs, transcripts, and resume points all key off the same id.

Resume of a partial run uses `claude --resume "$RUNTIME_SESSION_ID" -p "$STEERING_MESSAGE"` and is recorded as an audit event.

## Capability flags

Declared in the manifest's `capabilities` array; consumed by `prepare()` to refuse incompatible missions.

| Flag                  | Supported | Notes |
| --------------------- | --------- | ----- |
| `cli-execution`       | yes       | Headless `claude -p` is the only invocation mode. |
| `structured-events`   | yes       | Provided by `--output-format stream-json`. |
| `non-interactive-run` | yes       | Default mode for harness missions. |
| `interactive-steering`| partial   | Via `claude --resume`; recorded as audit events, never silent. |
| `file-tools`          | yes       | `Read`, `Write`, `Edit` allowed inside `--add-dir`. |
| `shell-tools`         | scoped    | `Bash` is allowlisted per-command; destructive verbs denied. |
| `subagents`           | yes       | Claude Code Task tool; capped by `max_subagent_depth` in config. |
| `skills`              | yes       | Skills loaded via Claude's plugin/skill mechanism, mapped from the mission `required_skills`. |
| `browser-tools`       | no        | `WebFetch`/`WebSearch` denied by default; opt-in per mission only. |
| `worktree-isolation`  | yes       | Adapter only launches inside a prepared sandbox worktree. |
| `diff-output`         | yes       | Adapter captures `git diff` against the sandbox base ref. |
| `json-output`         | yes       | Final result block is parsed into `uh.runtime-result.v0`. |

## Mission-prompt input

`prepare()` materializes a Claude-Code prompt from the `uh.mission.v0` packet. The prompt is plain Markdown (Claude Code does not support a richer input schema), structured as:

```markdown
# Mission <mission_id>: <title>

## Objective
<mission.objective>

## Constraints
- <constraint 1>
- ...

## Read first
- <path 1>
- <path 2>

## Required skills
- <skill 1>

## Expected outputs
- <expected output path or artifact>

## Completion criteria
- <criterion 1>

## Verification checks (run before declaring done)
- <required check name>: <command if provided>

## Harness rules
- Stay inside the sandbox (`<SANDBOX_ROOT>`).
- Do not run `git push`, `git reset`, or `rm -rf`.
- When done, print a fenced ```uh-runtime-result``` block matching `uh.runtime-result.v0`.
```

The mission id is interpolated into the prompt header and the system prompt (via `--append-system-prompt`) so it appears in every transcript line.

## Run-result format

Claude Code does not natively emit `uh.runtime-result.v0`. The adapter extracts results in two stages:

1. **Structured stream parse.** Every JSON event from `--output-format stream-json` is appended to `.harness/missions/<mission_id>/runtime.log`. Tool-call events feed the `observe()` stream verbatim.
2. **Final result block.** The adapter requires the agent's last assistant message to contain a fenced ```uh-runtime-result``` YAML block. `collect()` parses that block, validates it against `uh.runtime-result.v0`, and merges it with adapter-derived data (session id, diff ref, logs path).

If the block is absent or invalid, `collect()` synthesizes a result with `status: failed` and a `blockers` entry pointing at `runtime.log`. The mission never silently completes without a valid result block.

Minimal expected shape:

```yaml
schema_version: uh.runtime-result.v0
mission_id: mission-2026-05-17-example
runtime:
  adapter_id: claude-code
  session_id: <UUID>
status: completed
summary: "<one-line outcome>"
artifacts: []
changes:
  diff_ref: .harness/missions/<mission_id>/diff.patch
  files_changed: []
checks_suggested: []
blockers: []
logs:
  - .harness/missions/<mission_id>/runtime.log
```

## Sandbox/worktree assumptions

- The adapter only runs inside a git-worktree sandbox prepared by the harness (`supported_sandbox_backends: [git-worktree]`). `agentfs` is deferred until UH-9 lands.
- `prepare()` records the base commit SHA. `collect()` produces `diff.patch` via `git diff --binary <base> -- .` so promotion can replay the change set onto canonical state.
- `--add-dir` is set to the sandbox root and nothing else; the adapter refuses to launch when the resolved worktree path is outside the configured project root.
- The adapter does not assume Claude Code can clone repos, manage worktrees, or switch branches; the harness owns sandbox lifecycle.
- Environment is scrubbed: `HOME`, `CLAUDE_CONFIG_DIR`, and `XDG_CONFIG_HOME` are pinned to a session-scoped directory under `.harness/runtime/claude-code/<session_id>/` so a mission cannot leak credentials between runs.

## Verification triggering

- Verification is **not** the adapter's responsibility — it is `uh verify`'s. The adapter exposes `checks_suggested` from the final result block so the harness can pick them up.
- Required checks declared on the mission (`mission.verification.required_checks`) are echoed back into the prompt under "Verification checks" so the agent runs them inside the sandbox before reporting completion. Their pass/fail outcome belongs in the result block.
- After `collect()` returns, the harness calls `uh verify <mission_id>` which is the authoritative gate. Failing verification flips the mission to `verification-failed` regardless of what the agent reported.
- Steering messages sent via `claude --resume` are written as audit entries on the runtime session so the verification audit trail stays intact.

## Recommended use cases

Best fit:

- Documentation refactors, architecture writeups, and multi-file Markdown work where Claude's long context and Read/Edit tools shine.
- Mission packets with explicit `read_first` paths and a small, well-scoped objective — Claude Code performs well when it can plan inside `--permission-mode plan` before editing.
- Missions that benefit from subagents (Task tool) for parallel exploration of independent files.
- Code-review and triage missions where the agent must inspect many files but only emit a structured report.

Less ideal:

- Long-running execution that needs deterministic, replayable steps (Hermes' structured events are more granular).
- Missions requiring direct browser automation — `WebFetch`/`WebSearch` are denied by default for safety.
- Missions where the desired outcome is "run this exact command and parse the output" — a thinner shell adapter is cheaper.

## Risks and limits

- **Vendor lock-in.** The adapter depends on Anthropic's CLI, output format, and permission model. Breaking changes to `--output-format stream-json` or the permissions schema break the adapter.
- **Tool allowlist drift.** Claude Code may introduce new built-in tools (e.g., a new `WebFetch` variant). The adapter must default-deny unknown tools and surface them as blockers, not silently allow.
- **Cost.** Claude Code missions can be token-heavy; the adapter must record session token usage (from the final `result` event) so missions can fail on a configurable budget.
- **Non-determinism.** Same prompt + same sandbox != same diff. Verification, not output equality, is the contract.
- **Permission-mode escalation.** `acceptEdits` is dangerously close to `bypassPermissions`. The adapter never accepts a mission that requests `bypassPermissions`; promotion to `acceptEdits` requires an explicit mission flag and is recorded in the audit trail.
- **Resume race.** `claude --resume` over an in-flight session id corrupts the transcript. The adapter holds a per-session lock and serializes steering messages.
- **Result-block compliance.** Claude can forget to emit the `uh-runtime-result` fence. The adapter retries once with an explicit reminder via `--resume`; a second miss is reported as `status: failed`.
