# Runtime Targets

Ultimate Harness is runtime-agnostic: mission packets and verification artifacts stay stable while adapters translate a mission into each agent runtime's command or HTTP call.

| Runtime | Adapter ID | Invocation Shape | Notes |
| --- | --- | --- | --- |
| Hermes Agent | `hermes` | Local CLI | Reference adapter. |
| Codex CLI | `codex` | `codex exec` | Uses workspace-write sandboxing and JSON output. |
| Hermes Proxy | `hermes-proxy` | Local HTTP endpoint | Subscription-backed OAuth route through Hermes Proxy. |
| OpenRouter | `openrouter` | OpenAI-compatible HTTP | Requires `OPENROUTER_API_KEY`. |
| Pi CLI | `pi` | Local CLI | Base Pi command surface. |
| oh-my-pi | `oh-my-pi` | Local CLI | Opt-in OMP route with documented posture. |
| Command Code | `command-code` | Local CLI | Print-mode runner; requires a guard or explicit `runtime_config.permission_mode`. `runtime_config.role: orchestrator` arms harness-only controller commands. |
| Claude Code | `claude-code` | Native CLI with stream JSON | Worker guard required; integrated coordinator acceptance remains incomplete. |
| Anthropic Messages API | `anthropic` | Local HTTP API | Native Anthropic Messages API adapter. |
| Agent-Client Protocol | `acp` | Local stdio (JSON-RPC 2.0) | Standard ACP v1 runner for headless agent processes (OpenHands, Zed, custom). See [runbook](./runbooks/acp-setup.md). |

Command Code print-mode missions must declare a `guard` block or an explicit `runtime_config.permission_mode`; without either, planning refuses before process spawn, including custom CLI commands. See [Tool Guard](./tool-guard.md) for the permission-mode and hook boundary.

`runtime_config.role` defaults to `worker`. An orchestrator mission must still declare a `guard` block; the guard artifact then carries `controller_commands: true`, and the Command Code `PreToolUse` hook admits only harness controller commands (`uh mission ...`, `node dist/cli.js mission ...`, and the other controller verbs) while agent CLIs, native sub-agent tools and `--force`-style invocations stay denied. The orchestrator prompt ends with a fixed delegation paragraph: delegate only through harness commands, give every delegated worker its own mission packet and bound sandbox, wait for a worker settlement line before depending on its output, and never do a worker job yourself. Fleet admission reads `role`, so a model authorized only as `worker` is refused as an orchestrator.

### Claude Code boundaries

The native adapter is distinct from the HTTP Anthropic adapter. Authentication
remains owned by the installed Claude CLI; UH does not copy credentials into
mission artifacts.

Worker execution requires a mission guard and `permission_mode: default`.
Coordinator execution uses `role: orchestrator`, a restricted native tool set
(`Bash`, `Read`, `Write`, `Edit`) and strict empty MCP configuration. A coordinator
run also requires a declared guard, because its native write grant is derived from
that guard's `write_roots`: every root becomes exactly one `Write(<root>/**)` and
one `Edit(<root>/**)` rule, so a mission that lets the orchestrator report under
`out` grants nothing outside `out`. A root that names the worker root (`.`) or
escapes it (`../x`, an absolute path) is refused while planning rather than
widening the grant to the whole checkout. The UH `PreToolUse` hook still judges
every call, so a natively allowed path can still be denied by policy; the rules
only remove the print-mode denial that would otherwise happen before the hook runs.
This does not establish isolation from inherited memory, settings, skills or
arbitrary caller flags. A UH hook allow also does not grant native shell permission.

Use an explicit supported model and inspect the planned command before execution.
The current default includes a context suffix that can differ from native model
attestation; alias compatibility remains unresolved. Saved-run recovery and
direct session resume are mutually exclusive.

Available native message counters are persisted during execution and retained
after interruption. Missing counters remain unknown. Live usage is observational,
not a token/context budget. See [native events](./architecture/runtime-events.md)
and [remaining runtime work](./ROADMAP.md#runtime-reliability-and-accounting).

### oh-my-pi route isolation

OMP resolves helper and sub-agent models from the operator's global `modelRoles`, and
`task.eager` can make it delegate without being asked. `--model` pins only the top-level
session. Each UH run therefore writes `omp-overlay.yml` into the run directory and passes it
with `--config`; an overlay outranks OMP's project and global settings per key. The overlay
pins the `default`, `smol`, `slow`, `plan`, `task`, `commit`, `advisor`, `tiny`, `vision` and
`designer` roles to the assigned model, sets `task.eager: default`, disables the advisor, and
sets `task.maxRecursionDepth` to `0`, which removes the native `task` tool. A mission whose guard
sets `allow_native_subagents: true` gets depth `1` on the same pinned roles. Custom role names in
the operator's settings are not known to UH; delegated-route attestation is the backstop for
those. Behavior verified against oh-my-pi source at commit `3ed46dc`
(`config/settings.ts` merge precedence, `task/types.ts` `canSpawnAtDepth`).

## Adapter Contracts

All adapters should:

- Render the same mission packet into a runtime prompt.
- Write `runtime-session.yaml`, `events.ndjson`, `runtime-result.yaml`, `runtime-final.txt`, and `diff.patch`.
- Respect sandbox routing unless explicitly bypassed.
- Redact or avoid secrets in persisted artifacts.
- Support `dry-run` where possible so CI and reviewers can inspect command shape safely.

See [`architecture/runtime-adapter-contract.md`](./architecture/runtime-adapter-contract.md) for the detailed protocol.

## Canonical Team Artifacts

`mission run-team` keeps execution worktrees separate from durable facts:

- Parent state and result: `.harness/missions/<mission>/runs/<parent-run>/team-state.json` and `runtime-result.yaml`.
- Worker artifact roots: `.harness/missions/<mission>/team/artifacts/<parent-run>/workers/<worker>/`. Each contains the adapter's normal `.harness/missions/<mission>/runs/<worker-run>/` artifacts, and `<artifact_scope>/.harness/missions/<id>/mission.yaml` is the exact derived packet the worker received.
- Leader verification: copied to the parent run's `verification.yaml` before successful worktree cleanup. The selected parent also updates the existing mission mirrors and run index.

In `team-state.json`, each entry in `workers[]` includes canonical execution state and worker contract tracking:

- `contract`: the resolved worker contract containing `objective`, `runtime_config_overrides`, `limits` (without `memory_mb`), `expected_outputs`, `constraints`, and `seed`. When a worker specifies `mission_id`, its contract and runtime packet are resolved from `.harness/missions/<mission_id>/mission.yaml` rather than inheriting the parent mission packet.
- `outputs`: an array of output verification records (`path`, `status` of `"passed"` or `"failed"`, and optional `notes`) produced when the worker specifies `expected_outputs.files`.
- `blocked_reason`: explanation recorded when a worker settles as `blocked`, such as a declared output verification failure (`Declared output <path>: ...`) or an admission refusal.
- `salvage`: recorded only for a worker that settles as `failed` with a recoverable stop code (`turn_limit`, `timeout`, `deadline`, `stall`, or `policy`). It carries `eligible` (the worktree held changes outside the protected roots), `outputs_passed` and `checks_passed` (the worker's declared outputs and its `verification.required_checks` were both re-run in the worker worktree through the same verifier the leader uses), and the worker `branch`. The worktree is committed to that branch with the existing hygiene rules only when both passed; the leader never merges a failed worker automatically, and a `policy` stop always requires a human. Workers that failed for any other reason (`route_mismatch`, `route_unverified`, `runtime_error`, `cancelled`, blocked) are not evaluated. Salvage never changes the team status: a team with a failed worker is still not passed. The integration report lists eligible stopped workers under a `Verified work from stopped workers` section with their stop code and branch.

During worker dispatch, the harness writes the derived packet to the worker worktree and to `<artifact_scope>/.harness/missions/<id>/mission.yaml`. When the worker runner returns, the worktree copy is restored to the canonical parent bytes before git commit, ensuring worker branches never commit derived packet mutations while `<artifact_scope>/.harness/missions/<id>/mission.yaml` preserves the exact derived packet the worker received.

Custom `TeamRuntimeRunner` implementations receive a fourth context argument containing `artifactRoot` and `runId`. Forward these to the adapter while keeping execution in the supplied worker root. Concurrent workers must not share the host mission's latest pointer.

The existing Observatory reads these canonical facts during and after execution. Complete, consistent worker reports supply aggregate route and usage values; missing measurements remain unknown. `--retain` controls worktrees, not canonical fact retention. The leader merges changes and invokes verification; it does not perform a separate model synthesis run.

### Distinct Worker Missions (`mission_id`)

Team workers can declare an optional `mission_id`. When set, the harness loads `.harness/missions/<mission_id>/mission.yaml` as the worker's base contract:

```yaml
team:
  workers:
    - role: reviewer
      adapter: oh-my-pi
      mission_id: review-worker-mission
```

The worker receives its own `objective`, `expected_outputs`, and `constraints`, and its worktree packet is seeded with that mission specification. Worker-level overrides (such as `runtime_config_overrides` or `limits`) merge on top of the resolved worker mission. When `mission_id` is omitted, workers inherit the parent mission contract as before.

## TypeSafe System One (JEV) Semantic Evaluation

When `TYPESAFE_API_KEY` is present, verification and independent-review collection
can request a typed three-verdict/tamper judgment from `jev-latest`.

- Requests contain compact check/criterion dispositions, descriptions, severities
  and review evidence states—not full mission packets, diffs or raw output.
- Confidence is a provider-reported value, not an independently calibrated
  correctness probability. A confidence threshold is not currently enforced.
- A semantic pass cannot override deterministic failure. A remediation or tamper
  recommendation can harden the consumer's disposition.
- The controller persists a decision receipt and event, including disabled,
  unavailable or malformed outcomes, without raw provider responses.
- Missing credentials preserve native verification. Provider timeout policy,
  complete response-envelope validation and privacy filtering for arbitrary
  criterion descriptions remain unresolved.

This is not semantic runtime routing, scope approval or retry authorization.
See [progressive decisions](./architecture/progressive-decisions.md) and the
[roadmap](./ROADMAP.md#governed-decisions).

## Team Resource Admission

Team workers run in resource-admitted waves. Before each wave, the harness checks the configured parallel limit and, when a memory cap is present, current available memory after the reserved amount. It then limits the wave to the remaining cost reservations when both cost fields are configured.

| Resource field | Admission behavior |
| --- | --- |
| `max_parallel` | Caps workers admitted to a wave. Defaults to `4`. |
| `worker_memory_mb` | Caps concurrency using available memory. A memory cap requires the native Windows runner. |
| `reserve_memory_mb` | Subtracted from available memory before calculating concurrency. Defaults to `1024` MB. |
| `max_cost_usd` | Upper bound used to calculate remaining admission reservations. |
| `worker_cost_reservation_usd` | Per-worker reservation used with `max_cost_usd`. Both cost fields are required together. |

The harness re-admits a wave only after every worker admitted to the prior wave settles. If memory admission cannot launch one worker, or remaining cost cannot reserve one worker, the remaining workers are marked `blocked` and the team records `admission_blocked_reason`. A team with that reason remains `blocked` in its final status.

Unknown or invalid completed cost, including unavailable accounting, blocks further paid admission. It is never treated as zero. A worker that was never invoked contributes nothing because no runner ran for it. Cost admission is a reservation control, not a provider charge cap. An in-flight worker can exceed its reservation, so this is not a guaranteed spending ceiling.

When `worker_memory_mb` is set, execution refuses to proceed unless the process is on Windows and every worker uses the native `oh-my-pi` or `command-code` runner.

## Runtime Supervision and Recovery

The harness supervises individual mission attempts through `RuntimeSupervision`, enforcing runtime limits, tool hook denial budgets, repeated command failure thresholds, and protected-path safety independent of model compliance. When a limit is reached or a safety rule is violated, the supervisor halts execution and writes a control receipt to `.harness/missions/<mission>/runs/<run_id>/runtime-control.json` recording `status`, `stop_code`, and `stop_reason`.

Denial accounting has two native forms. The supervisor counts hook events (`tool_hook_blocked`, `tool_call_blocked`, and `tool_denied`) and completed tool results whose recursively inspected `result`, `text`, or `content` contains a string beginning with `CONTRACT:`. A call ID is counted once even when the same result is observed again. The oh-my-pi extension normally reaches this path through a `tool_execution_end` error result; Command Code normally emits the hook events. See [Native Runtime Events](./architecture/runtime-events.md) for the runtime-specific shapes.
For guarded Command Code calls, a completed tool without guard-log evidence stops with `Guard hook did not run` unless a native pre-hook event was observed, in which case the reason identifies that the hook ran but could not log.
### Stop Codes
| Stop code | Trigger | Resumable |
| --- | --- | --- |
| `startup` | Wall time exceeds `startup_timeout_ms` before the runtime shows readiness: a tool starts or the model responds. A session banner alone is not readiness. | Yes |
| `stall` | Time since last progress event exceeds `stall_timeout_ms` while no tool is in flight (`inflight.size === 0`), or an uninterrupted reasoning stretch reaches `max_thinking_ms` (defaulting to `4 * stall_timeout_ms`). | Yes |
| `timeout` | Attempt wall time exceeds `timeout_ms`. | Yes |
| `deadline` | A configured `recovery.on_deadline` grace window begins before `timeout_ms` or `max_turns` is exhausted; the stop reason reports the budget remaining for the grace attempt. The same code is used if the bounded grace attempt itself exceeds its grace budget. | One grace attempt only |
| `repeated_failure` | The identical shell command fails `max_repeated_failures` times (non-zero exit code or error result). | Yes |
| `denial_budget` | Hook events are observed, or completed tool results carry `CONTRACT:` reasons, until the denial count reaches `max_denials`. | Yes |
| `turn_limit` | The attempt reaches or exceeds `max_turns` during turn evaluation (`turn_start` or `turn_end`), or the runtime's own native turn cap ends the run: a terminal `result` event with `stopReason: "max_turns"` settles as `turn_limit`, with the stop reason naming the native cap and the turn count. | No |
| `output_limit` | Output size exceeds `max_output_bytes`. | No |
| `policy` | A write-class tool or shell mutation verb attempts to modify a protected root. | No |
| `route_mismatch` | Runtime reports a provider or model route outside the expected assignment, at the top level or for a delegated sub-agent reported in native tool metadata. | No |
| `route_unverified` | Runtime completes without attesting the configured provider or model route. | No |
| `cancelled` | The attempt was cancelled by operator request (`uh mission cancel`, `SIGINT`, or `SIGTERM`). | No |
| `runtime_error` | The runtime adapter terminates abnormally or encounters an unhandled runtime failure. A native terminal stop whose reason is not a recognized budget cap settles here, and the native reason is always copied into `stop_reason` (never empty). | No |
| `controller_error` | The harness controller encounters an internal execution error. | No |
| `controller_lost` | The controller or launcher process terminates unexpectedly before settlement. Requires explicit manual resume via `resume_from_run` (which reconciles settlement first); not automatically resumed in the recovery loop. | Manual only |

### Completion and exit-code rule
Completion requires clean native terminal facts and the runtime final-message sentinel. `nativeRuntimeCompleted` requires a native terminal event with no native terminal failure, supervision stop, cancellation, timeout, spawn error, or recorded errors, plus a non-empty final message. A launcher exit code alone does not prove completion.

When a run has a completed native terminal event and a valid sentinel, a later non-zero launcher exit does not overturn the passed native result. The result records the code and sets `exit_code_ignored_reason` to `runtime exited non-zero after completed native terminal event`. A non-zero exit before clean native completion remains a failure; an exit-zero run without a native terminal event or parseable final sentinel is not passed.

The native terminal event is runtime-specific: oh-my-pi emits `agent_end`; Command Code emits `run_end` and `result`. See [Native Runtime Events](./architecture/runtime-events.md).

### Native turn and time caps

Mission `limits.max_turns` and `limits.timeout_ms` are enforced by UH supervision for every runtime. Some runtimes also impose their own native caps; where a native flag exists it must be reachable from the mission's `limits`, and where a native default applies silently it must be recorded in the plan. Audit as of the turn-cap fix:

| Runtime | Native turn cap | Mission `limits.max_turns` reaches it | Native default recording | Native time cap | Native terminal stop mapping |
| --- | --- | --- | --- | --- | --- |
| `command-code` | `--max-turns` flag; print mode caps at 100 turns by default (exit 8) | Yes — precedence: explicit top-level `max_turns`, else `limits.max_turns`, else no flag | `native_default_turn_cap: 100` recorded on the plan (visible in dry-run) when neither field is configured | none — no native flag; `limits.timeout_ms` is UH-supervised | `stopReason: "max_turns"` → `turn_limit`; `max_time`/`timeout` → `timeout`; any other failing native stop → `runtime_error` with the native reason copied into `stop_reason` |
| `claude-code` | `--max-turns` flag; no cap when the flag is absent | Yes — same precedence as command-code | n/a (no native default cap) | none — UH-supervised | failing native stops → `runtime_error` with the native reason copied |
| `oh-my-pi` | none | enforced by UH supervision (`turn_start`/`turn_end`) | n/a | none — UH-supervised | `error`/`aborted` → `runtime_error` with the reason copied |
| `codex` | none | enforced by UH supervision | n/a | none — UH-supervised | failing native stops → `runtime_error` with the reason copied |
| `hermes` | none | enforced by UH supervision | n/a | none — UH-supervised | — |
| `hermes-proxy` | none | enforced by UH supervision | n/a | `request_timeout_ms` per HTTP request (adapter config, not `limits`) | — |
| `openrouter` | none | enforced by UH supervision | n/a | `request_timeout_ms` per HTTP request (adapter config, not `limits`) | — |
| `anthropic` | none | enforced by UH supervision | n/a | `request_timeout_ms` per HTTP request (adapter config, not `limits`); `max_tokens` is a per-response output cap configured via `runtime_config.max_tokens` | — |
| `pi` | none | enforced by UH supervision | n/a | none — UH-supervised | — |
| `acp` | none set by UH; an ACP agent may stop itself with `max_turn_requests` | UH supervision; the agent's own cap is not configurable from `limits` | n/a | `timeout_ms` per request (adapter config, not `limits`) | `max_tokens`/`max_turn_requests` → `blocked`; `refusal` → failed; `cancelled` → cancelled |


### Recovery Policy

Bounded session recovery allows transiently halted attempts to continue from their saved native session transcript. The recovery policy is defined by `RuntimeRecoveryPolicySchema`:

- `recovery.max_resumes`: Non-negative integer specifying the maximum number of automatic resume attempts permitted (for example, `max_resumes: 2`). When `0`, recovery is disabled.
- `recovery.on_deadline` (optional): `{ grace_turns, grace_timeout_ms, notes }` enables deadline delivery. `grace_turns` defaults to `3` and `grace_timeout_ms` to `300000`; the optional notes are prepended to the mandatory delivery instruction.
- `recovery.notes`: Non-empty string providing guidance instructions injected into the resumed session prompt (for example, `notes: "Inspect existing outputs before continuing."`).

Recovery policies are declared under `recovery` in `runtime_config` within an adapter manifest (`.harness/adapters/<runtime>.yaml`) or overridden per mission via `runtime_config_overrides.recovery` in `mission.yaml` (or via the `--runtime-config-overrides` CLI flag). Bounded native session recovery is supported for the `oh-my-pi` and `command-code` runtimes.
Attempts that halt with `startup`, `stall`, `timeout`, `repeated_failure`, or `denial_budget` are automatically resumed by `runWithRuntimeRecovery` if the previous attempt recorded a native `session_id` and the resume count has not reached `recovery.max_resumes`. When `on_deadline` is configured, `timeout` and `max_turns` are converted into one `deadline` stop at the grace boundary and resumed exactly once regardless of `max_resumes`; that grace attempt is never resumed. Stops caused by `policy`, `route_mismatch`, or `route_unverified` represent hard violations and are explicitly refused by `prepareRuntimeResume`.

### Resume Note Composition and Recovery Records

When resuming an attempt, `prepareRuntimeResume` composes a single recovery note that combines the configured recovery notes with the specific stoppage cause:

```text
<notes>
You were stopped: <stop_reason>. Do not repeat that action. Inspect existing outputs before continuing.
```

where `<stop_reason>` is `control.stop_reason ?? control.stop_code`.

The resumed attempt receives a synthetic prompt section formatted by `recoveryPrompt`:

```markdown
## Recovery of prior attempt <source_run_id>
Continue the saved native session. Inspect existing outputs and prior tool results; do not repeat completed work.
<combined_notes>
For a `deadline` stop, the grace prompt instead appends the configured `on_deadline.notes` (when present) followed by: `Your time budget is exhausted. Write your deliverable now with everything you have found so far. Mark it clearly as INCOMPLETE at the top, and end it with a section titled "Missing for the next step" listing what you did not get to and where you stopped. Do not start new investigation. Then stop.` The grace result records `completion: "incomplete"` and `incomplete_reason`; if its own grace budget is exceeded, the run remains failed and is not resumed.
```

Each resumed attempt generates a new run ID and persists a recovery record at `.harness/missions/<mission>/runs/<run_id>/runtime-recovery.json` conforming to `RuntimeRecoveryRecordSchema`:

- `schema_version`: Exactly `uh.runtime-recovery.v0`.
- `source_run_id`: Run ID of the halted attempt being resumed.
- `session_id`: Native session identifier preserved from the prior attempt.
- `notes`: The combined resume notes string.
- `source_stop_code`: Optional `RuntimeStopCode` from the prior attempt's control receipt.
- `grace`: Boolean identifying the one deadline-delivery attempt; ordinary recovery records are `false`.
- `source_stop_reason`: Optional string recording the prior attempt's stop reason.

### Protected-Path Rule

The supervisor monitors tool calls to prevent accidental or unauthorized modification of harness configuration, adapter metadata, and repository control state. It evaluates a protected path on the first tool event observed for each call ID, rather than assuming that every runtime emits the same queue event:
- **Hard policy stop**: When a mutation target lies under any protected root, the supervisor halts the run on that call's first tool event (`tool_queued`, `tool_execution_start`, or `tool_running`) with `stop_code: "policy"` and `stop_reason: "Protected path write attempted: <target>"`. Policy stops are final and cannot be resumed automatically or manually.

- **Default protected roots**: Defined by `DEFAULT_PROTECTED_PATHS` as `[".harness", ".commandcode", ".omp", ".pi", ".git"]`. Missions or worker contracts can override this list via `limits.protected_paths` with an array of non-empty relative path strings.
- **Write-class tools**: The supervisor intercepts calls to write-class tools: `write_file`, `edit_file`, `write`, `edit`, `multi_edit`, `create_file`, `apply_patch`, `delete_file`, `remove`, and `move_file`.
- **Shell-class tools**: The supervisor monitors commands executed via shell tools: `bash`, `shell`, `run_command`, `powershell`, and `cmd`.
- **Mutation verbs**: Shell commands are tokenized to identify mutation verbs: `rm`, `del`, `rmdir`, `mv`, `move`, `cp`, `copy`, `tee`, `sed`, `set-content`, `out-file`, `add-content`, `remove-item`, `move-item`, `copy-item`, and `new-item`.
- **Redirection operators**: Targets following `>` and `>>` shell redirection operators are extracted as mutation targets.
- **Path resolution and normalization**: Candidate paths are normalized by converting backslashes to forward slashes, stripping enclosing quotes, resolving relative segments (`.` and `..`), and lowercasing. An absolute path that lies inside the working directory is compared relative to it; an absolute path outside the working directory is not a protected-root match.
- **Reads never stop**: Read-class tools (such as `read_file`, `read`, or `view`) and non-mutating shell commands (such as `cat`, `grep`, or `ls`) are never intercepted or stopped.
- **File content is never inspected**: The supervisor validates only target paths against protected roots. File contents, diff bodies, and replacement texts are never inspected.

### Stall and Turn Rules

- **Reasoning rule:** `thinking_delta`, `thinking_start`, `thinking_end`, and native `message_update` thinking events count as liveness. Reasoning is tracked as an uninterrupted stretch until a tool event, turn boundary, or message end; `max_thinking_ms` bounds that stretch, and defaults to four times `stall_timeout_ms`. Once the stretch has seen 4,096 characters, a repeated 64-character window occurring in more than 30% of the bounded 16,384-character sample makes it non-live, so it no longer refreshes the stall clock. Reasoning text is never persisted or logged. Text deltas remain non-progress.
- **Turn limit rule**: When `max_turns` is configured, turn counts are evaluated at `turn_start` (`turns >= max_turns`) and `turn_end` (`turns > max_turns`). Exceeding the turn limit halts the run with `stop_code: "turn_limit"`.

## Native OMP Interruption

For a running native OMP mission, the CLI handles `SIGINT` and `SIGTERM`, cancels the owned runtime process tree, and synchronously settles the selected run before exiting with code `143`. Windows cleanup targets the owned PID tree; POSIX cleanup targets the owned process group.

The runtime result, run index, latest pointer, and terminal event report `cancelled`. The existing session schema has no `cancelled` state: its terminal representation is `failed` with exit code `143` and a finish timestamp. Mission mirrors update only for the selected run, and partial sandbox files remain available.

An uncatchable OS force-kill cannot execute this finalization path.

## Terminal Contract

Hosts such as terminal multiplexers and desktop orchestrators run `uh` as an ordinary process in a managed terminal and wait on its output and exit code.

### Mission Run Terminal Contract

`uh mission run [file] [options]` executes a mission and reports settlement status to host environments.

#### Quiet Mode (`--quiet`)
- `--quiet`: Suppresses runtime stdout and stderr streams. All harness lifecycle messages, preflight checks, and settlement markers continue to print normally. Without `--quiet`, default behavior is unchanged.

#### Settlement Line
At the conclusion of a mission run, `uh mission run` always prints, as the **LAST line of stdout**, one machine-parseable settlement line:

```
UH_RESULT <single-line-json>
```

The payload is a JSON object with the following fields:
- `mission_id` (string): The identifier of the mission.
- `run_id` (string): The specific run identifier.
- `runtime` (string): The active runtime adapter id.
- `status` (string): Outcome status (`passed`, `failed`, `blocked`, or `cancelled`).
- `stop_code` (string, optional): The stop code (e.g., `timeout`, `turn_limit`, `policy`), omitted when none.
- `exit_code` (number): The process exit code for the run.
- `run_dir` (string): Forward-slash relative path to the run directory from the project root (e.g. `.harness/missions/<mission_id>/runs/<run_id>`). Never contains absolute paths.

#### Exit Codes
`uh mission run` maps settlement outcomes to deterministic exit codes via `exitCodeForRun(status, stopCode)`:
- `0` (`passed`): Mission run succeeded.
- `1` (`failed`): Mission run failed or encountered an unhandled failure.
- `2` (`blocked`): Mission run was blocked, including preflight checks, auto-route refusals, missing-sandbox refusals, and fleet budget limits that print `[BLOCKED]`.
- `130` (`cancelled`): Mission run was cancelled by the harness or via cancellation request.
- `143`: Reserved for `SIGINT`/`SIGTERM` process termination.

#### Sandbox Routing

Every mission run and dry-run prints one `Sandbox:` line naming where execution goes, so the routing decision is visible before anything is spawned or spent:

- Bound sandbox: `Sandbox: <sandbox-id> (<worktree path>)`.
- `--no-sandbox`: `Sandbox: none (project root, --no-sandbox)`.

`uh mission run` refuses to fall back to the project root silently. When sandbox routing was requested (that is, `--no-sandbox` was absent) and the mission has no bound sandbox, it exits before creating a run directory or spawning a process:

```
[BLOCKED] mission <id> has no bound sandbox; create one with "uh sandbox create <sandbox-id> --mission <id>" or pass --no-sandbox to run in the project root
```

Exit code is `2` (`blocked`) and the settlement line is still the last stdout line, with `status: "blocked"`, the `run_id` that would have been used, and the `run_dir` that was deliberately not created. Root execution is only reachable through an explicit `--no-sandbox`, because a guarded worker running in the project root edits the operator's live working tree.

`uh mission dry-run` prints the same `Sandbox:` line and never blocks on a missing binding — it shows `Sandbox: none (project root)` and continues. `uh mission run-all` and `uh mission run-team` are unaffected: they create and clean up their own worktrees instead of using sandbox routing, and `uh acceptance run` passes `--no-sandbox` because each campaign creates its own isolated workspace.

### Observatory Subcommands

#### `uh observatory runs`
Inspect indexed run history or compute performance summaries across run groups:

```bash
uh observatory runs [--mission <id>] [--group-by runtime|model|workflow_profile|stop_code] [--json]
```

- **Without `--group-by`**: Lists run records from `indexRuns`.
  - Human output: A plain aligned table of runs showing `MISSION_ID`, `RUN_ID`, `RUNTIME`, `MODEL`, `WORKFLOW_PROFILE`, `STATUS`, `STOP_CODE`, `DURATION`, and `COST`.
  - `--json`: Prints raw `RunRecord[]` array.
  - Unknown/undefined metrics always render as `unknown`, never as `0` or `$0`.
- **With `--group-by <dimension>`**: Aggregates runs with `summarizeRuns` across `runtime`, `model`, `workflow_profile`, or `stop_code`, identifying groups on the `paretoFrontier`.
  - Human output: An aligned table displaying group summaries with a `PARETO` column marking frontier groups (`yes`/`no`).
  - `--json`: Prints raw structures: `{ summaries, pareto_frontier }`.
  - Missing values render as `unknown`, never as `0`.

#### `uh observatory export`
Export a mission run's distributed trace in OpenTelemetry (OTLP) format using `exportRunToOtlp`:

```bash
uh observatory export <mission-id> --otlp [--run-id <id>] [--out <file>] [--include-tool-targets]
```

- `<mission-id>`: Target mission identifier.
- `--otlp`: Mandatory flag specifying OTLP trace export format.
- `--run-id <id>`: Specific run to export; defaults to the mission's latest run when omitted.
- `--out <file>`: Writes the JSON trace to the given file, which must resolve strictly inside the project root. When omitted, trace JSON outputs directly to `stdout`.
- `--include-tool-targets`: Includes target paths/commands in tool execution spans.
