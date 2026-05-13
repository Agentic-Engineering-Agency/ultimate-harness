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
