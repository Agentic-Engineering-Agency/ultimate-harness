# Sandboxing

## Goal

Agent-generated work should happen in an isolated environment by default, then be inspected, verified, reviewed, and promoted.

## Sandbox lifecycle

1. **Create** — allocate an isolated workspace linked to a mission.
2. **Hydrate** — provide required project files, specs, skills, and context.
3. **Execute** — runtime works inside the sandbox.
4. **Inspect** — collect file changes, logs, generated artifacts, and diffs.
5. **Verify** — run checks and review gates.
6. **Promote** — apply approved outputs to canonical state.
7. **Discard/archive** — preserve audit metadata and remove workspace if appropriate.

## Index concurrency and repair

The registry at `.harness/sandboxes/index.yaml` is shared mutable state: every `uh sandbox` command reads the whole document, edits it in memory, and writes it back, so without coordination two concurrent commands (e.g. three `uh sandbox create` started together) each read the same snapshot and the last writer silently discards the others' registrations. Every index mutation — create, discard, and repair — therefore goes through one serialized helper: it acquires an exclusive lock file beside the index (created with the exclusive flag, with a short bounded backoff so it never waits forever), breaks and records a lock that is older than a stale threshold and whose recorded owner process is gone, re-reads the index and applies exactly one change while holding the lock, writes the document atomically via write-then-rename, and releases the lock in a `finally` block. When a lost registration is already feared, `uh sandbox repair` re-registers each sandbox whose worktree exists under `.harness/sandboxes/<id>/worktree` but whose index entry is missing — recovering the bound mission from the worktree's seeded mission packet and reporting every repaired entry — while never touching a valid existing entry or a corrupt index.

## Git worktree backend

Strengths:
- Familiar Git workflow.
- Easy diff/review/branch promotion.
- Good for code changes and documentation edits.
- Works without a new filesystem dependency.

Limitations:
- Does not isolate all filesystem effects outside the repo.
- Runtime caches/config may still be shared.
- Cleanup requires care to avoid deleting user work.

## AgentFS backend

Strengths:
- Copy-on-write filesystem model.
- Can run commands inside mounted/overlay filesystems.
- Supports database-backed state, sync, encryption options, and MCP filesystem tooling.
- Better fit for inspecting and syncing agent filesystem deltas.

Limitations:
- Platform behavior differs between Linux and macOS.
- Operational complexity is higher than worktrees.
- Requires a stable promotion model before deep integration.

## Backend interface

```yaml
create(mission_id, base_ref, options) -> sandbox_id
path(sandbox_id) -> filesystem_path
status(sandbox_id) -> created | running | dirty | verified | promoted | discarded
collect_diff(sandbox_id) -> diff_ref
list_changes(sandbox_id) -> changed_files
run_check(sandbox_id, command) -> check_result
promote(sandbox_id, selected_changes) -> promotion_result
discard(sandbox_id) -> discard_result
```

## Required safety rules

- A mission must know which sandbox it is using.
- Promotion must record exactly what changed.
- Discard must not delete unrecorded human work.
- Sandbox escapes must be recorded as security findings.
- Writes outside the allowed project/sandbox scope require explicit policy.
