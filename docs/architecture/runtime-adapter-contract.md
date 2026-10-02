# Runtime Adapter Contract

## Purpose

Runtime adapters let Ultimate Harness execute the same mission through different coding agents without changing the mission semantics.

Adapters must provide structured lifecycle reporting. A shell command is not enough.

## Adapter manifest

```yaml
schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
version: 0.1.0
runtime_kind: hermes
capabilities:
  interactive: true
  non_interactive: true
  structured_events: true
  sandbox_required: true
  subagents: true
  skills: true
  file_tools: true
  browser_tools: true
supported_sandbox_backends:
  - git-worktree
  - agentfs
input_formats:
  - uh.mission.v0
output_formats:
  - uh.runtime-result.v0
```

## Required lifecycle methods

### `prepare(mission, sandbox)`
Validates mission compatibility, resolves skills/context, checks runtime availability, and returns a launch plan.

### `launch(prepared_mission)`
Starts the runtime session and returns a `runtime_session_id`.

### `observe(runtime_session_id)`
Returns structured events: status, logs, tool calls, file changes, questions, blockers, and partial artifacts.

### `send(runtime_session_id, message)`
Optional for interactive steering. Must record steering messages in the audit trail.

### `collect(runtime_session_id)`
Collects final artifacts: summary, changed files, diffs, logs, generated docs, verification suggestions, and open blockers.

### `cancel(runtime_session_id, reason)`
Stops a running mission safely and records partial state.

### `close(runtime_session_id)`
Releases runtime resources and finalizes session metadata.

## Runtime result shape

```yaml
schema_version: uh.runtime-result.v0
mission_id: mission-2026-05-13-docs-spine
runtime:
  adapter_id: hermes
  session_id: hermes-session-abc123
status: completed # completed | failed | cancelled | blocked
summary: "Created documentation spine."
artifacts:
  - path: docs/architecture/runtime-adapter-contract.md
    kind: documentation
    status: created
changes:
  diff_ref: .harness/missions/mission-.../diff.patch
  files_changed:
    - docs/architecture/runtime-adapter-contract.md
checks_suggested:
  - markdown-link-check docs/**/*.md
blockers: []
logs:
  - .harness/missions/mission-.../runtime.log
```

## Capability model

Adapters should declare capabilities rather than relying on implicit behavior:

- `structured_events`
- `interactive_steering`
- `non_interactive_run`
- `skills`
- `subagents`
- `browser`
- `terminal`
- `file_tools`
- `sandbox_native`
- `json_output`
- `diff_output`


Mission packets may declare `capabilities: [...]` using the same ids.
`uh mission dry-run`, `uh mission run`, and `uh mission run-all` now
enforce the selected runtime adapter's declared capabilities before
dispatch. A mismatch blocks with a missing-capability error unless the
operator passes `--force`; missions without `capabilities` preserve the
legacy no-op behavior.

## Adapter responsibilities

Adapters must:

1. Refuse missions requiring unsupported capabilities.
2. Preserve mission IDs in prompts/logs/results.
3. Avoid writing directly to canonical state unless promotion policy explicitly allows it.
4. Return enough evidence for verification and review.
5. Separate runtime errors from mission failures.
6. Capture user/human steering as audit events.

## Adapter non-responsibilities

Adapters should not:

- Decide product scope.
- Rewrite specs without a workflow step.
- Promote changes without approval.
- Invent undocumented entity names.

## Runtime-final-message capture protocol (UH-28)

Every adapter participates in a uniform protocol for capturing the
mission's final summary message into `runtime-final.txt`:

### Prompt-side contract

The harness appends the following instruction block to the mission
prompt before handing it to the runtime (`runtimeFinalMessageInstruction()`
in `src/harness/runtime-final-message.ts`):

```text
## Runtime final message

At the very end of your response, emit your one-paragraph summary inside
a fenced code block tagged `uh-runtime-final-message`:

```uh-runtime-final-message
<one-paragraph summary of what you did, what changed, and any caveats>
```

This fenced block MUST be the last block in your output. The harness
extracts its content verbatim into `runtime-final.txt`.
```

### Extraction-side contract

Each adapter calls `extractRuntimeFinalMessageSentinel(text)` over the
captured model output and writes the matched content into
`runtime-final.txt`. When the sentinel is absent, the adapter falls back
to its runtime-native capture path (see table below).

The extractor:

- Matches `` ```uh-runtime-final-message ``` `` fenced blocks anywhere in
  the captured text.
- Returns the LAST occurrence (a mission may emit interim drafts; only
  the terminal block is authoritative).
- Tolerates CRLF line endings, leading/trailing whitespace inside the
  fence, and optional spaces after the opening tag.
- Returns `null` when no sentinel block is present.

### Per-adapter resolution

| Adapter   | Sentinel scan target                                       | Fallback when sentinel absent                                 |
|-----------|------------------------------------------------------------|---------------------------------------------------------------|
| codex     | Content of `--output-last-message` file (raw text)         | Raw file content (Codex's native final message)               |
| oh-my-pi  | Heuristic-extracted last assistant text (JSON-decoded)     | Heuristic last assistant text (unchanged from pre-UH-28)      |
| hermes    | Hermes stdout text                                         | Empty file (Hermes does not produce a native summary today)   |

### Status semantics

- The sentinel does NOT change `runtime-result.status`. Status remains
  driven by exit code, runtime-native signals (Codex's
  `--output-last-message` presence, Hermes' `uh.runtime-result.v0`
  block, oh-my-pi's heuristic finalMessage non-empty check).
- A mission may emit a runtime-result `status: passed` even when the
  sentinel is omitted, as long as the runtime-native fallback path
  satisfies the adapter's success criteria. The sentinel is the
  *preferred* summary source, not a *required* one.

### Why a single shared protocol

Before UH-28 each adapter rolled its own final-message capture:
Codex used a side-channel file, Hermes had no `runtime-final.txt` at all,
oh-my-pi did a JSON heuristic. UH-28 lets missions explicitly bound the
summary independent of runtime quirks, which:

1. Makes the summary deterministic across runtimes for cross-runtime
   QA comparisons.
2. Removes the need for adapter-specific prompt instructions (each
   buildMissionPrompt now appends the same sentinel block).
3. Lets the harness add structured terminal annotations in the future
   (e.g. `uh-runtime-blockers`, `uh-runtime-next-steps`) using the
   same extraction pattern.
