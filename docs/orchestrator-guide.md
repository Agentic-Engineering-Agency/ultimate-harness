# Orchestrator Guide to Ultimate Harness

This guide describes how to operate Ultimate Harness as an orchestrator of coding agents. It covers core entities, lifecycle operations, team execution, observability, human decision gates, configuration surfaces, and verified command syntax.

## 1. The mental model in five nouns

### Mission
A mission is a bounded unit of software work with a defined objective, context, constraints, expected outputs, verification checks, and promotion policy. It lives on disk under `.harness/missions/<id>/mission.yaml`, with an optional companion design document at `.harness/missions/<id>/design.md`. It is created by `uh propose`, `uh mission create`, `uh mission new`, or by direct authoring of schema-conforming YAML files. It is read by `uh validate`, `uh mission dry-run`, `uh mission run`, `uh mission run-all`, `uh mission run-team`, `uh verify`, `uh status`, and `uh observatory`.

### Run (attempt)
A run is a single execution attempt of a mission by a runtime adapter against an assigned sandbox workspace. It lives on disk under `.harness/missions/<id>/runs/<run_id>/`, with the latest result mirrored at `.harness/missions/<id>/runtime-result.yaml`, the active pointer at `.harness/missions/<id>/latest.json`, and chronological history recorded in `.harness/missions/<id>/runs/index.json`. It is created by `uh mission run`, `uh mission run-all`, or `uh mission run-team`. It is read by `uh status`, `uh verify`, `uh mission cancel`, `uh mission verdict`, and `uh observatory snapshot --json`.

### Sandbox
A sandbox is an isolated execution workspace where a runtime inspects repository context and writes file modifications without mutating the canonical working tree. It lives on disk at a dedicated path outside the main tree, with registration recorded in `.harness/sandboxes/index.yaml`. It is created by `uh sandbox create`. It is read by `uh sandbox list`, `uh sandbox status`, `uh sandbox discard`, `uh mission dry-run`, `uh mission run`, `uh verify`, and `uh promote`.

### Verification
Verification is structured evidence recording the execution of automated commands, acceptance criteria, and review gate evaluations against produced changes. It lives on disk at `.harness/missions/<id>/verification.yaml`. It is created by `uh verify`, or by the mechanical leader step in `uh mission run-team`. It is read by `uh promote`, `uh status`, and `uh observatory snapshot --json`.

### Promotion
Promotion is a safe, auditable transition that incorporates approved sandbox outputs into the canonical working tree and marks generated artifacts as accepted. It lives on disk at `.harness/missions/<id>/promotion.yaml` with an accompanying event recorded in `.harness/missions/<id>/events.ndjson`. It is created by `uh promote`, or automatically executed when a mission specifies the `auto-on-verify` promotion policy and passes verification. It is read by `uh status` and `uh observatory snapshot --json`.

### Extensions of mission
Ultimate Harness provides two extensions to single-agent missions:

| Extension | Purpose | Definition and execution |
|---|---|---|
| Team mission | Coordinates multiple concurrent workers in isolated worktrees followed by mechanical integration and verification. | Configured by setting `shape: team` and specifying a `team` block in `mission.yaml`. Executed via `uh mission run-team`. |
| Independent review | Validates completed mission outputs against captured contracts and SHA-256 snapshots without model execution. | Prepared via `uh mission review-prepare`, executed in an isolated directory sandbox via `uh mission run`, and validated via `uh mission review-collect`. |

## 2. A day as the orchestrator

Follow these steps in sequence to manage agentic work from project setup to artifact promotion.

### Step 1: Initialize a project
Initialize the `.harness/` directory structure in your repository root.

- Command:
```sh
uh init
```
- Artifact produced or changed: Creates `.harness/project.yaml`, `.harness/skills/index.yaml`, `.harness/sandboxes/index.yaml`, `.harness/audit/events.ndjson`, and starter profiles in `.harness/workflows/`.
- What to look at to know it worked: Run `uh validate .harness/project.yaml`. The output reports valid project metadata.
- What to do when it did not: If `.harness/project.yaml` already exists, run `uh init --force` to overwrite it. If directory creation fails, verify write permissions on the target directory.

### Step 2: Register the adapters you will use
Add configuration manifests for each agent runtime you plan to dispatch.

- Command:
```sh
uh adapter add hermes
uh adapter add codex
uh adapter add oh-my-pi
```
- Artifact produced or changed: Writes adapter manifest templates to `.harness/adapters/<runtime>.yaml`.
- What to look at to know it worked: Run `uh adapter list` to confirm registered manifests. Run `uh adapter check <runtime>` to verify CLI binary availability and configuration prerequisites. Run `uh adapter capabilities` to view declared tools, sandbox support, and cost classes.
- What to do when it did not: If a manifest already exists, use `uh adapter add <runtime> --force`. If `uh adapter check` reports missing dependencies, install the external runtime binary or configure required environment variables.

### Step 3: Write a mission
Create a mission packet file defining the unit of work.

```yaml
schema_version: uh.mission.v0
id: m1-token-refresh
title: Implement authentication token refresh endpoint
workflow_profile: spec-first-feature
priority: medium
objective: Add a refresh token rotation endpoint with unit tests.
context:
  read_first:
    - src/auth/tokens.ts
  source_links: []
constraints:
  - Do not modify existing session cookie semantics.
skills:
  required: []
  suggested: []
expected_outputs:
  files:
    - src/auth/refresh.ts
    - tests/auth/refresh.test.ts
sandbox:
  backend: git-worktree
  promotion_policy: human-approved
verification:
  required_checks:
    - name: unit-tests
      command: npm test
  review_gates:
    - spec-compliance
acceptance_criteria:
  - id: ac-refresh-success
    description: Refresh endpoint returns 200 on valid token.
    check_command: npm test -- -t "refresh valid"
    severity: block
```

Field explanations:
- `schema_version`: Must be the literal string `uh.mission.v0`.
- `id`: Unique, audit-safe identifier for the mission.
- `title`: Short descriptive name for the work.
- `workflow_profile`: Named workflow profile matching a definition in `.harness/workflows/`.
- `priority`: Work priority level (`low`, `medium`, `high`, `critical`).
- `objective`: Concise text describing the target goal.
- `context.read_first`: Ordered list of repository files the runtime must inspect first.
- `context.source_links`: Relevant reference URLs.
- `constraints`: Inviolable behavioral constraints and negative instructions.
- `skills.required`: Procedural skills that capable runtimes must load.
- `skills.suggested`: Recommended skills for the work.
- `expected_outputs.files`: List of paths the runtime is expected to produce or modify.
- `sandbox.backend`: Sandbox driver name (`git-worktree`, `directory`, or `container`).
- `sandbox.promotion_policy`: Promotion gate rule (`human-approved` or `auto-on-verify`).
- `verification.required_checks`: Named commands executed by `uh verify`.
- `verification.review_gates`: Named human or automated review gates.
- `acceptance_criteria`: Granular criteria with unique `id`, `description`, optional `check_command`, and `severity` (`block` or `warn`).

- Command:
```sh
uh propose m1-token-refresh --title "Implement authentication token refresh endpoint" --workflow spec-first-feature --objective "Add a refresh token rotation endpoint with unit tests."
```
- Artifact produced or changed: Writes `.harness/missions/m1-token-refresh/mission.yaml`.
- What to look at to know it worked: Run `uh validate .harness/missions/m1-token-refresh/mission.yaml`. Validation outputs report valid mission schema.
- What to do when it did not: Examine validation error messages. Ensure acceptance criterion IDs are unique, required fields are populated, and the YAML syntax is correct.

### Step 4: Bind a sandbox
Create an isolated workspace bound to the mission.

- Command:
```sh
uh sandbox create sb-m1-token-refresh --mission m1-token-refresh --backend git-worktree --base HEAD
```
- Artifact produced or changed: Materializes a git worktree at `.harness/sandboxes/sb-m1-token-refresh/` and registers the entry in `.harness/sandboxes/index.yaml`.
- What to look at to know it worked: Run `uh sandbox list` or `uh sandbox status sb-m1-token-refresh`. The sandbox entry shows status `created`.
- What to do when it did not: Ensure the repository has at least one committed git revision. If the worktree path or git branch already exists, discard the conflicting sandbox using `uh sandbox discard sb-m1-token-refresh --force`.

### Step 5: Run it
Execute the mission against the configured runtime.

- Command:
```sh
uh mission dry-run .harness/missions/m1-token-refresh/mission.yaml --runtime codex
uh mission run .harness/missions/m1-token-refresh/mission.yaml --runtime codex
```
- Routing: both commands print a `Sandbox:` line showing where execution goes — `Sandbox: sb-m1-token-refresh (.harness/sandboxes/sb-m1-token-refresh/worktree)` for the bound sandbox, or `Sandbox: none (project root, --no-sandbox)` when root execution was requested explicitly. `uh mission run` refuses to fall back to the project root silently: with no bound sandbox and no `--no-sandbox` it prints `[BLOCKED] mission m1-token-refresh has no bound sandbox; create one with "uh sandbox create <sandbox-id> --mission m1-token-refresh" or pass --no-sandbox to run in the project root`, exits `2`, settles `UH_RESULT` with status `blocked`, and creates no run directory. `uh mission dry-run` never blocks; it only reports the routing. Pass `--no-sandbox` only when editing the live working tree is what you intend.
- Artifact produced or changed: Automatically routes execution into the bound sandbox. Writes per-run artifacts under `.harness/missions/m1-token-refresh/runs/<run_id>/`: `prompt.md`, `runtime-session.yaml`, `events.ndjson`, `runtime.stdout.log`, `runtime.stderr.log`, `diff.patch`, `runtime-result.yaml`, and `runtime-final.txt`. Updates `.harness/missions/m1-token-refresh/latest.json`, appends to `runs/index.json`, and mirrors `.harness/missions/m1-token-refresh/runtime-result.yaml`.
- What to look at to know it worked: The command completes with exit code 0. Inspect `.harness/missions/m1-token-refresh/runtime-result.yaml` to confirm `status: passed`.
- What to do when it did not: Inspect `runtime.stderr.log` and `runtime-result.yaml` in the run directory. If capabilities mismatch, inspect `uh adapter capabilities` or pass `--force` to bypass capability matching. If the run was refused with `has no bound sandbox`, the registration is missing or discarded — recreate it with `uh sandbox create <sandbox-id> --mission m1-token-refresh` (see Step 4) and check `uh sandbox list`.

### Step 6: Watch it
Observe progress and project state during or after execution.

- Command:
```sh
uh status --json
uh observatory snapshot --json
```
- Artifact produced or changed: No artifacts are modified. These commands read active project state.
- What to look at to know it worked: `uh status --json` returns JSON containing `active_missions_count`, adapter health, and sandbox counts. `uh observatory snapshot --json` returns work item operations, agent states, and fresh timestamps.
- What to do when it did not: If observatory reports `stale` or `unknown`, check if the runtime process stalled or terminated unexpectedly. If a local run is hung, cancel it with `uh mission cancel --mission m1-token-refresh --run-id <run_id>`. Interactive steering of a running worker is not available yet (see [roadmap: mission authoring and coordination](./ROADMAP.md#mission-authoring-and-coordination)).

### When the harness stops a worker, and when it resumes

During execution via `uh mission run`, the harness supervisor monitors runtime progress against configured limits, tool hook denial budgets, command failure counts, and protected-path safety rules. When an execution anomaly occurs, the harness halts the worker process tree and records a canonical control receipt at `.harness/missions/<id>/runs/<run_id>/runtime-control.json`.

#### What the control receipt shows

The control receipt captures the supervisor's exact determination:
- `status`: Execution status (`running`, `passed`, `failed`, `blocked`, or `cancelled`).
- `stop_code`: Machine-readable reason for the stoppage (such as `denial_budget`, `repeated_failure`, `stall`, `timeout`, `startup`, `turn_limit`, `deadline`, or `policy`).
- `stop_reason`: Detailed explanatory string, including the specific action, command, hook message, or path that triggered the stop (for example, `Protected path write attempted: .harness/adapters/oh-my-pi.yaml` or `3 hook-denied calls; last: write_file out/c.txt: writes are temporarily locked`).
- `turns`: Number of completed interaction turns.
- `denials`: Total number of counted guard denials: native hook-block events and completed tool results whose reason begins with `CONTRACT:`. A call ID is counted once.
- `inflight_tools`: Number of tool calls currently executing when the receipt was written.
- `controller_pid`: Process ID of the runtime controller.

Operators can inspect this receipt directly on disk or observe the run's operational health using `uh status --json` and `uh observatory snapshot --json`. If a run must be terminated manually before natural settlement, operators can invoke `uh mission cancel --mission <id> --run-id <run_id>`.

#### Which stops resume automatically, and how many times

When the mission or adapter configures a bounded recovery policy (`recovery.max_resumes` and `recovery.notes`), `uh mission run` automatically initiates a recovery attempt for transient operational halts:
- **Eligible stop codes**: `denial_budget`, `repeated_failure`, `stall`, `timeout`, and `startup`.
- **Requirements**: The stopped attempt must have recorded a valid native `session_id`, must have settled cleanly, and the total resume count must be less than `recovery.max_resumes`.
- **Attempt count**: Resumption repeats up to `recovery.max_resumes` times (for example, `max_resumes: 2` allows up to two resume attempts after the initial failure). Each resume generates a distinct run directory (`runs/<new_run_id>/`) and appends to `runs/index.json`.
- **Stops that do not auto-resume**: `turn_limit`, `output_limit`, `cancelled`, `runtime_error`, `controller_error`, `route_mismatch`, and `route_unverified` do not automatically resume. A `controller_lost` stop indicates the controller process died unexpectedly; an operator can resume it by executing `uh mission run <file> --runtime <runtime> --runtime-config-overrides '{"resume_from_run": "<run_id>"}'`, which reconciles settlement before attaching to the saved session.

#### What the worker is told on resume

A resumed worker is not restarted from scratch. The harness preserves the native transcript and invokes the runtime with instructions to continue the existing session. In addition to operator recovery notes, `prepareRuntimeResume` composes a mandatory warning derived from the previous run's control receipt:

```text
<recovery.notes>
You were stopped: <stop_reason>. Do not repeat that action. Inspect existing outputs before continuing.
```

This ensures the agent understands why its previous action was blocked, prevents it from repeating the failing command or prohibited write, and prompts it to evaluate outputs already produced on disk. The resumed attempt records these facts in `.harness/missions/<id>/runs/<run_id>/runtime-recovery.json`.
#### Deadline grace delivery

Configure `runtime_config.recovery.on_deadline` when a worker must leave a reviewable deliverable instead of being cut off at its ordinary wall-time or turn limit:

```yaml
recovery:
  max_resumes: 0
  notes: "Preserve the current findings."
  on_deadline:
    grace_turns: 2
    grace_timeout_ms: 300000
    notes: "Use the existing output directory."
```

The supervisor converts the ordinary limit into a `deadline` stop at the configured grace boundary and records the remaining budget in `runtime-control.json`. UH resumes the saved native session exactly once with the mandatory instruction to write what it has, mark the deliverable `INCOMPLETE`, and end with `Missing for the next step`; this grace attempt is never resumed. The resumed run writes `runtime-recovery.json` with `grace: true` and `runtime-result.yaml` with `completion: "incomplete"` plus `incomplete_reason`; it is surfaced as passed only when the runtime completed and its declared outputs verify, otherwise the final run is failed.

#### Policy stops are final

A stop with code `policy` indicates that the worker attempted to modify a protected root (such as `.harness`, `.git`, `.omp`, `.pi`, or `.commandcode`). A `policy` stop is final:
- The supervisor evaluates the protected path on the first tool event for the call (`tool_queued`, `tool_execution_start`, or `tool_running`), because runtimes expose different event names.
- Bounded recovery refuses to resume: `prepareRuntimeResume` throws an explicit error when attempting to resume a `policy` stop.
- The attempt cannot be resumed automatically or manually. To proceed, the operator must inspect the mission constraints, correct the objective or worker instructions, and launch a fresh attempt.

#### Declaring a guard and reading its log

Declare the guard at mission level when every worker in the mission shares the same tool contract:

```yaml
guard:
  write_roots: [out]
  deny_git_mutations: true
  deny_package_installs: true
  deny_network_clients: true
  agent_clients: [omp, cmdc, codex, pi, hermes, aider, gemini]
```

For a team, a worker may declare its own `guard` block under `team.workers[]`. Omitted fields receive schema defaults. `write_roots` controls write and delete targets; protected roots are a separate supervisor policy and default to `.harness`, `.commandcode`, `.omp`, `.pi`, and `.git`. The guard is path-only and content-blind.

Validate and inspect the plan before starting:

```sh
uh validate --all-missions
uh mission dry-run .harness/missions/m1-token-refresh/mission.yaml
```

After `uh mission run`, read the applied policy and decisions in the selected run directory:

```text
.harness/missions/m1-token-refresh/runs/<run_id>/tool-guard.json
.harness/missions/m1-token-refresh/runs/<run_id>/tool-guard.log
```

`tool-guard.json` records the resolved policy, `worker_root`, and `protected_paths`. Each line of `tool-guard.log` is JSON with `ts`, `tool`, `class`, `target` (the resolved target or tool-name fallback), and the exact denial `reason`. The denial budget is visible in `runtime-control.json`; a protected-root mutation is a final `policy` stop. See [Tool Guard](tool-guard.md) and [Native Runtime Events](architecture/runtime-events.md).

### Step 7: Verify
Execute required automated checks and evaluate acceptance criteria.

- Command:
```sh
uh verify m1-token-refresh
```
- Artifact produced or changed: Runs configured checks inside the bound sandbox worktree. Writes `.harness/missions/m1-token-refresh/verification.yaml`. Appends `acceptance.checked` events to `.harness/missions/m1-token-refresh/events.ndjson`.
- What to look at to know it worked: Output prints check results. Inspect `.harness/missions/m1-token-refresh/verification.yaml` to confirm `status: passed`.
- What to do when it did not: If status is `failed` or `blocked`, check stdout and stderr snippets in `verification.yaml` under each failed check. Fix issues by running another attempt or adjusting commands.

### Step 8: Review
Evaluate quality, diffs, and independent review evidence.

- Command:
Inspect `.harness/missions/m1-token-refresh/runs/<run_id>/diff.patch` and `runtime-final.txt`. For formal independent review:
```sh
uh mission review-prepare rev-m1 --sources '[{"missionId":"m1-token-refresh"}]' --runtime codex --model <model>
uh sandbox create sb-rev-m1 --mission rev-m1 --backend directory
uh mission run .harness/missions/rev-m1/mission.yaml --runtime codex
uh mission review-collect rev-m1
uh mission verdict m1-token-refresh pass --rationale "All acceptance criteria verified."
```
- `review-prepare` creates `.harness/missions/rev-m1/mission.yaml` with source input digests and assigns the reviewer output to the permitted `out/review-report.json` workspace path. The reviewer writes that report in its isolated workspace; the trusted controller keeps request, schema, and assessment artifacts under `.harness`. `review-collect` validates evidence and emits `review-assessment.json`.
- What to look at to know it worked: `runtime-result.yaml` contains `verdict.value: pass`. `review-assessment.json` confirms valid artifact hashes and records `human_acceptance_required: true`.
- What to do when it did not: If review assessment returns `needs-remediation`, examine missing outputs or failed criteria. Multiple reviewers and cross-family reviewer packets are not available yet (see [roadmap](./ROADMAP.md#review-protection-and-output-contracts)).

### Step 9: Promote or reject
Record the formal promotion or rejection decision.

- Command:
```sh
uh promote m1-token-refresh --approved-by "Lead Orchestrator" --decision promoted --change src/auth/refresh.ts --change tests/auth/refresh.test.ts --sandbox-id sb-m1-token-refresh
```
To reject instead:
```sh
uh promote m1-token-refresh --approved-by "Lead Orchestrator" --decision rejected
```
- Artifact produced or changed: Writes `.harness/missions/m1-token-refresh/promotion.yaml` and appends `promotion.recorded` to `.harness/missions/m1-token-refresh/events.ndjson`.
- What to look at to know it worked: Inspect `.harness/missions/m1-token-refresh/promotion.yaml` to confirm `decision: promoted` and `approved_by: "Lead Orchestrator"`.
- What to do when it did not: If promotion fails with a verification requirement error, run `uh verify m1-token-refresh` and ensure all blocking criteria pass before promoting. Ensure `--approved-by` is non-empty.

### Step 10: Clean up
Dispose of the sandbox workspace once work is complete.

- Command:
```sh
uh sandbox discard sb-m1-token-refresh --force
```
- Artifact produced or changed: Removes the sandbox worktree directory from disk and updates `.harness/sandboxes/index.yaml` marking status as `discarded`.
- What to look at to know it worked: Run `uh sandbox list`. The sandbox is either removed or marked `discarded`. The filesystem path is deleted.
- What to do when it did not: Pass `--force` if the worktree contains uncommitted files. Use `--keep-branch` if the git branch should be preserved for debugging.

## 3. Running a team

### Team mission shape
A team mission divides work across multiple concurrent workers and coordinates integration through a mechanical leader. Configure a team mission by setting `shape: team` in `mission.yaml`:

```yaml
schema_version: uh.mission.v0
id: m2-team-refactor
title: Parallel refactoring of core modules
workflow_profile: spec-first-feature
priority: high
objective: Refactor parser and serializer modules concurrently.
shape: team
team:
  workers:
    - role: parser-worker
      adapter: codex
      count: 1
    - role: serializer-worker
      adapter: hermes
      count: 1
  leader:
    role: integration-lead
    adapter: codex
  resources:
    max_parallel: 2
    worker_memory_mb: 2048
    reserve_memory_mb: 1024
    max_cost_usd: 10.0
    worker_cost_reservation_usd: 2.0
expected_outputs:
  files:
    - src/parser.ts
    - src/serializer.ts
sandbox:
  backend: git-worktree
  promotion_policy: human-approved
verification:
  required_checks:
    - name: build-and-test
      command: npm test
```

### Giving each worker its own contract

By default, workers inherit the top-level mission objective and adapter configuration. When workers perform distinct subtasks, define a contract on individual workers under `team.workers`:

```yaml
team:
  workers:
    - role: parser-worker
      adapter: oh-my-pi
      objective: Refactor the token parser to use streaming AST nodes.
      runtime_config_overrides:
        model: openai-codex/gpt-5.6-luna
      limits:
        max_turns: 8
      expected_outputs:
        files:
          - src/parser.ts
      seed: 101
    - role: serializer-worker
      adapter: oh-my-pi
      objective: Refactor the AST serializer for streaming output.
      runtime_config_overrides:
        model: google-antigravity/gemini-3.8-flash
      limits:
        max_turns: 5
      expected_outputs:
        files:
          - src/serializer.ts
      seed: 202
  leader:
    adapter: oh-my-pi
```

During execution, the harness derives a specialized mission packet for each worker:
- **Objective**: The worker `objective` is combined with the team objective (`<worker objective>\n\nTeam objective: <parent objective>`). When omitted, the worker inherits the team objective.
- **Runtime overrides**: Worker `runtime_config_overrides` take precedence over mission-level overrides, and worker `limits` land under `runtime_config_overrides.limits`. Per-worker memory limits cannot be declared under `limits`; per-worker memory is governed by `team.resources.worker_memory_mb`.
- **Seed**: A `seed` value is injected into the worker packet's constraints (`Seed: <seed>. Use it for every randomized step and print it in your final message.`).
- **Packet isolation**: The derived packet is written to the worker worktree and to `<artifact_scope>/.harness/missions/<id>/mission.yaml`. Before the worker's changes are committed, the worktree copy is restored to the canonical packet, so worker branches never differ on it.

#### Settlement outcome

When a worker returns, the harness evaluates its declared `expected_outputs.files` inside the worker worktree:
- **Output verification passed**: When every declared output file exists and satisfies verification, the worker settles with status `succeeded`, commits its worktree changes, and qualifies for leader integration.
- **Output verification failed or missing**: If any declared output file is missing or fails verification, the worker settles with status `blocked`. The failure reason is recorded in `blocked_reason` in `team-state.json` (for example, `Declared output src/serializer.ts: Declared output is missing, unreadable, or outside the workspace`). The worker's branch is not committed and is excluded from leader integration.
- **Team impact**: If at least one worker succeeds and integrates cleanly and verification checks pass on the integrated tree, the overall team run settles as `passed_partial`. If no workers integrate or verification fails, the team settles as `blocked` or `failed`.

Execute the team mission with:

```sh
uh mission run-team m2-team-refactor
```

### Resources: memory and cost admission

Team execution admits workers in resource-bounded waves. Before each wave, the harness computes slots from `max_parallel` and, when configured, current available memory after `reserve_memory_mb`. It then limits slots to the remaining `worker_cost_reservation_usd` reservations under `max_cost_usd`; both cost fields are required together.

The harness waits for every admitted worker in a wave to settle before admitting the next wave. A memory cap requires Windows with native `oh-my-pi` or `command-code` workers, and execution refuses other environments or adapters. Unknown or invalid completed cost blocks further paid admission and is never treated as zero. A worker that was never invoked contributes no cost because no runner ran. Admission-blocked workers receive `admission_blocked_reason`, and the final team status remains `blocked`.

Cost admission reserves launch capacity. It is not a provider charge cap, and it is not a guaranteed spending ceiling. See [Runtime Targets](runtime-targets.md#team-resource-admission) for the field reference.

### What the leader does mechanically
Execute a team mission with:
```sh
uh mission run-team m2-team-refactor --base-ref HEAD --strategy merge
```
The leader role in `uh mission run-team` is entirely mechanical. No leader language model is invoked. The leader performs the following steps:
1. Creates a dedicated leader worktree and separate worker worktrees from `--base-ref` (default `HEAD`).
2. Dispatches workers in resource-bounded waves into their respective worktrees.
3. Captures worker execution artifacts under `.harness/missions/<mission>/team/artifacts/<parent-run>/workers/<worker>/`.
4. Applies the chosen integration strategy (`merge`, `cherry-pick`, or `rebase`, default `merge`) to incorporate worker branches into the leader worktree.
5. Runs verification checks inside the integrated leader worktree.
6. Writes `.harness/missions/<mission>/runs/<parent-run>/team-state.json` (`uh.team-run.v0`) and the integration report.
7. Copies leader verification output to the parent run's `verification.yaml`.
8. Cleans up worker and leader worktrees on `passed`, but preserves worktrees on `failed` or when `--retain` is specified.

### What blocked versus passed_partial mean

| Team run status | Meaning | Condition |
|---|---|---|
| `passed` | Full success | Every worker integrated cleanly without merge conflicts, and verification passed on the integrated result. |
| `passed_partial` | Non-blocking partial success | Some workers failed or had merge conflicts, but at least one worker integrated cleanly and verification passed on the integrated subset. Callers gating on success treat this as success with caveats. |
| `blocked` | Execution blocked | Verification failed to pass, or zero workers could be integrated due to conflicts, or admission was blocked by memory headroom or cost reservation limits. |
| `failed` | Hard verification failure | Verification explicitly executed and returned status `failed`. |

### Current limits
The team implementation has documented capability boundaries:
- Parallel-derived memory caps: Per-worker memory caps derived from declared child process counts are not available yet. See [roadmap](./ROADMAP.md#runtime-reliability-and-accounting).
- Independent review breadth: One review packet binds to one reviewer runtime and model; multiple reviewers, different model families, and wave-level reviewer packets are not available yet. See [roadmap](./ROADMAP.md#review-protection-and-output-contracts).
- Credential scoping and deny-read: Credentials remain environment-scoped for HTTP adapters and review packets disable shared memory/extensions/skills, but private per-worker homes, provider-only credential scope, deny-read, and protection-verifying preflight are not available yet. See [roadmap](./ROADMAP.md#review-protection-and-output-contracts).
- Steering channel: Mid-run message delivery to a running worker is not available yet. See [roadmap: mission authoring and coordination](./ROADMAP.md#mission-authoring-and-coordination).

## 4. What you can observe, and where

### Per-run artifacts
Every execution attempt generates an isolated artifact directory under `.harness/missions/<id>/runs/<run_id>/`:

| Artifact | Schema or format | Contents |
|---|---|---|
| `prompt.md` | Markdown text | The exact rendered prompt sent to the runtime adapter, including the final sentinel instruction. |
| `runtime-session.yaml` | `uh.runtime-session.v0` | Session identity, runtime kind, start time, finish time, and session status (`planned`, `running`, `succeeded`, `failed`). |
| `events.ndjson` | Line-delimited JSON | Real-time event trace capturing lifecycle transitions, tool calls, and audit records. |
| `runtime.stdout.log` | Raw text | Captured standard output from the runtime process. |
| `runtime.stderr.log` | Raw text | Captured standard error from the runtime process. |
| `diff.patch` | Unified diff | Git diff of changes made in the sandbox during the run. |
| `runtime-result.yaml` | `uh.runtime-result.v0` | Execution status (`passed`, `failed`, `blocked`, `cancelled`), exit code, usage counters, cost estimate, and errors. |
| `runtime-final.txt` | Raw text | Summary message extracted from the terminal `uh-runtime-final-message` block. |

In addition to per-run directories, the mission directory maintains aggregate pointers:
- `.harness/missions/<id>/latest.json`: Pointer object containing `{ schema_version, run_id, started_at, finished_at, status }`.
- `.harness/missions/<id>/runtime-result.yaml`: Atomic mirror of the latest run's `runtime-result.yaml`.
- `.harness/missions/<id>/runs/index.json`: Chronological array of all runs with terminal statuses.

### Inspecting project state with `uh status --json`
Run `uh status --json` to inspect project health without invoking an LLM. It emits the UH-78 JSON document:
- `name`: Name of the project from `.harness/project.yaml`.
- `schema_version`: Project schema version.
- `adapters`: Array of registered adapters with `id`, `name`, and `status`.
- `workflow_profiles_count`: Number of workflow profiles in `.harness/workflows/`.
- `active_missions_count`: Number of mission directories in `.harness/missions/`.
- `recent_audit_events`: Number of event lines in `.harness/audit/events.ndjson`.
- `skills_indexed_count`: Number of indexed skills in `.harness/skills/index.yaml`.
- `sandboxes`: Object containing `total` and `by_status` breakdown (`created`, `running`, `dirty`, `discarded`, `promoted`).
- `verified_missions_count`: Number of missions with passing `verification.yaml`.
- `promoted_missions_count`: Number of missions with valid `promotion.yaml`.

### Delivery Observatory snapshot fields
Run `uh observatory snapshot --json` to generate a read-only `delivery-observatory.v1` projection. Orchestrators use the following fields:
- `projection_status`: `ready`, `partial`, or `blocked`.
- `work_items`: Array of work items representing missions. Key fields include:
  - `work_item_id`: Stable mission identifier.
  - `phase`: Current lifecycle phase (`discovery`, `design`, `plan`, `execute`, `review`, `verify`, `integrate`, `release`, `unknown`).
  - `operation`: Operational state (`queued`, `active`, `blocked`, `awaiting_human`, `succeeded`, `failed`, `cancelled`, `uncertain`, `unknown`).
  - `state`: Fact assertion state (`observed`, `inferred`, `proposed`, `unknown`) and evidence references.
  - `elapsed_ms`: Elapsed execution time in milliseconds.
  - `blocker_refs`: Identifiers of blocking events or decisions.
  - `attention_refs`: Identifiers of items awaiting review or human decisions.
- `agents`: Array of registered agents with active roles and operational state.
- `decisions`: Open questions and human gates with state (`open`, `awaiting_answer`, `decided`, `dismissed`, `expired`).
- `events`: Normalized timeline events (`decision`, `dispatch`, `review`, `gate`, `test`, `artifact`, `failure`, `status_change`).
- `redaction`: Audit counts of omitted sensitive fields and rejected records.

### What remains unknown by design
The filesystem observatory adapter emits strictly verified evidence and does not fabricate missing numbers. Under the orthogonal state model, unverified facts are explicitly tagged `{ state: "unknown", reason_code: "not_reported" }`.
- Route and model: The exact model and provider remain `unknown` unless verified by native runtime event attestation.
- Token counts: Input, output, and cache token counters remain `unknown` when an adapter does not report native usage metrics.
- Token costs: USD costs are list-price or configured estimates, not billing receipts. If token usage counters are absent, cost remains `unknown`.
- Metrics: DORA metrics, product metrics, and Pareto comparisons remain `unknown` in the local filesystem projection because no verified upstream telemetry source exists.

## 5. Where a human decision is required

Four specific lifecycle points require explicit human decisions.

### 1. Promotion policy selection and promotion decision
The promotion policy dictates whether human approval is required before changes become canonical.
- Policy values in `mission.yaml` under `sandbox.promotion_policy`:
  - `human-approved`: Default policy. Requires an explicit human promotion command.
  - `auto-on-verify`: Changes auto-promote upon a passing `uh verify`.
  - Any unrecognized policy name falls back safely to `human-approved`.
- Command recording the decision:
```sh
uh promote <mission-id> --approved-by "<name>" --decision <promoted|rejected|deferred> [--change <path>...] [--sandbox-id <id>]
```
- What it writes: Writes `.harness/missions/<mission-id>/promotion.yaml` validated against `uh.promotion.v0`. Appends an audit event (`promotion.recorded`) to `.harness/missions/<mission-id>/events.ndjson`.

### 2. Manual verdicts
An orchestrator can record a manual review verdict on a mission result.
- Verdict values:
  - `pass`: Approves the mission result.
  - `needs-attention`: Flags issues requiring human follow-up. Requires `--rationale`.
  - `needs-remediation`: Flags issues requiring code changes. Requires `--rationale`.
- Command recording the decision:
```sh
uh mission verdict <mission-id> <pass|needs-attention|needs-remediation> [--rationale "<text>"]
```
- What it writes: Mutates `.harness/missions/<mission-id>/runtime-result.yaml` in place by adding a `verdict` block (`value`, `rationale`, `recorded_by: "manual"`, `recorded_at`). Appends a timestamped log line to `.harness/audit.log` matching `<timestamp> verdict.recorded <mission_id> <value> by=manual`.

### 3. Review assessments
Independent review packets assess completed work without modifying source files.
- Role: Advisory peer assessment.
- Commands recording preparation and assessment:
```sh
uh mission review-prepare <review-id> --sources '[{"missionId":"<mission-id>"}]' --runtime <runtime> --model <model>
uh mission review-collect <review-id>
```
- What it writes: `review-collect` validates hashes and writes `review-assessment.json` in the review mission directory, keeps the reviewer's report there as `review-report.json`, and discards the review sandbox unless `--keep-workspace` is passed.
- Decision boundary: `review-assessment.json` always records `human_acceptance_required: true`. It is purely advisory. It never grants human acceptance, never records an owner verdict, and never promotes source work. An orchestrator must independently review findings and execute `uh mission verdict` or `uh promote`.

### 4. Cancellation
An orchestrator can terminate an active run before natural settlement.
- Command recording the decision:
```sh
uh mission cancel --mission <id> --run-id <run_id> [--plugin-url <url>]
```
- What it writes: For local runs, writes `.harness/missions/<id>/runs/<run_id>/cancel-request.json` (`uh.runtime-cancel-request.v0`). Signals the owned process tree or Windows Job. Updates `runtime-result.yaml` to `status: cancelled`. Updates `runtime-session.yaml` to `status: failed` with exit code 143. Updates `runs/index.json`. Updates `latest.json` and mirrored `runtime-result.yaml` if this was the latest run. Appends a terminal cancellation event to `events.ndjson`.

## 6. Configuration surface

### Files edited by an orchestrator

| File path | Purpose | Editable fields |
|---|---|---|
| `.harness/project.yaml` | Project identity and defaults. | `id`, `name`, `root_path`, `issue_sources`, `default_workflow_profiles`, `artifact_schema_version`. |
| `.harness/adapters/<runtime>.yaml` | Adapter manifests and capabilities. | `name`, `runtime_kind`, `capabilities`, `supported_sandbox_backends`, `default_model`, `limits`. |
| `.harness/missions/<id>/mission.yaml` | Per-mission runtime overrides under `runtime_config_overrides`. | `model`, `request_timeout_ms`, `limits` (`timeout_ms`, `startup_timeout_ms`, `stall_timeout_ms`, `max_output_bytes`), `honcho_memory`. |
| `.harness/missions/<id>/mission.yaml` | Team resource boundaries under `team.resources`. | `max_parallel`, `worker_memory_mb`, `reserve_memory_mb`, `max_cost_usd`, `worker_cost_reservation_usd`. |

### Environment variables outside artifacts
Keep credentials and machine-level settings in environment variables rather than persisting them in repository files:

| Environment variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Authentication key for OpenRouter HTTP adapter. |
| `UH_TELEMETRY` | Telemetry opt-in toggle (`posthog`, `1`, or `true`). |
| `UH_POSTHOG_API_KEY` | PostHog API key for optional telemetry capture. |
| `UH_POSTHOG_HOST` | PostHog capture host endpoint. |
| `UH_PROJECT_ROOT` | Project root override for Hermes plugin. |
| `UH_CLI_BIN` | Path to `uh` CLI binary for Hermes plugin. |
| `UH_READ_TIMEOUT_S` | Hermes plugin read command timeout in seconds. |
| `UH_RUN_TIMEOUT_S` | Hermes plugin mission run timeout in seconds. |
| `UH_PLUGIN_URL` | Base API URL for Hermes plugin runs. |
| `HONCHO_API_KEY` | Authentication key for Honcho persistent memory. |
| `HONCHO_ENABLED` | Boolean flag (`true` or `false`) controlling Honcho memory. |
| `HONCHO_SEARCH_LIMIT` | Maximum snippets returned by Honcho search queries. |
| `HONCHO_TOOL_PREVIEW_LENGTH` | Character cap per snippet in Honcho search results. |
| `UH_OPENSANDBOX_SHELL` | Shell executable for OpenSandbox command templates on Windows. |
| `UH_OPENSANDBOX_DELETE_COMMAND` | Teardown command template for container sandboxes. |
| `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` | Timeout in milliseconds for container sandbox creation and deletion. |

## 7. Command proof table

Every command and flag mentioned in this guide is verified against the built CLI help output:

| Command and flag invocation | Exact line from built CLI help output |
|---|---|
| `uh init` | `init [options]                  Initialize a .harness project in the current or specified directory` |
| `uh init --root <path>` | `--root <path>  Root directory to initialize (default: cwd)` |
| `uh init --force` | `--force        Overwrite existing .harness/project.yaml` |
| `uh validate` | `validate [options] [file]       Validate a harness YAML artifact (and optionally drift-detect under --repair / --json)` |
| `uh validate [file]` | `file             Path to YAML file (default: .harness/project.yaml)` |
| `uh validate --root <path>` | `--root <path>    Root directory (default: cwd)` |
| `uh validate --all-workflows` | `--all-workflows  Validate all workflow profiles` |
| `uh validate --all-missions` | `--all-missions   Validate all mission files` |
| `uh validate --repair` | `--repair         Run drift detection with auto-repair (idempotent)` |
| `uh validate --strict-spec` | `--strict-spec    Run drift detection; spec-stale issues are errors (default: warn)` |
| `uh validate --json` | `--json           Emit drift detection output as JSON instead of human text` |
| `uh validate --judge` | `--judge          Grade spec adherence with an LLM (requires --spec + a hermes-proxy runtime)` |
| `uh validate --spec <path>` | `--spec <path>    Spec file to judge (with --judge)` |
| `uh validate --base <ref>` | `--base <ref>     Base ref for the judge diff (default: dev)` |
| `uh status` | `status [options]                Report the current state of the harness project (use --json for the LLM-less query mode)` |
| `uh status --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh status --cwd <path>` | `--cwd <path>   Override the working directory used for resolving the project root` |
| `uh status --json` | `--json         Emit the UH-78 status JSON document instead of human text` |
| `uh observatory` | `observatory                     Read Delivery Observatory projections` |
| `uh observatory snapshot` | `snapshot [options]  Emit a delivery-observatory.v1 safe local snapshot` |
| `uh observatory snapshot --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh observatory snapshot --json` | `--json         Emit JSON (required for the v1 contract)` |
| `uh verify` | `verify [options] <mission-id>   Run a mission's required verification checks and write verification.yaml` |
| `uh verify <mission-id>` | `mission-id         Mission id` |
| `uh verify --root <path>` | `--root <path>      Root directory (default: cwd)` |
| `uh verify --timeout-ms <ms>` | `--timeout-ms <ms>  Verification command timeout in milliseconds (default: 30000)` |
| `uh verify --no-sandbox` | `--no-sandbox       Force checks to run in the harness root instead of auto-routing into the bound sandbox worktree` |
| `uh promote` | `promote [options] <mission-id>  Write a safe promotion record for a mission` |
| `uh promote <mission-id>` | `mission-id             Mission id` |
| `uh promote --root <path>` | `--root <path>          Root directory (default: cwd)` |
| `uh promote --approved-by <name>` | `--approved-by <name>   Approver name` |
| `uh promote --decision <decision>` | `--decision <decision>  Promotion decision: promoted, rejected, or deferred (default: "promoted")` |
| `uh promote --change <path>` | `--change <path>        Changed path to include in the promotion record (default: [])` |
| `uh promote --sandbox-id <id>` | `--sandbox-id <id>      Sandbox id associated with this promotion` |
| `uh propose` | `propose [options] [id]          Generate a mission packet from request/issue metadata or a .spec.md file` |
| `uh propose [id]` | `id                                 Mission id (defaults to spec front-matter id when --from is set)` |
| `uh propose --from <spec.md>` | `--from <spec.md>                   Load mission fields from a uh.spec.v0 markdown spec` |
| `uh propose --title <title>` | `--title <title>                    Mission title (required without --from)` |
| `uh propose --workflow <profile>` | `--workflow <profile>               Workflow profile (default: spec-first-feature with --from)` |
| `uh propose --objective <text>` | `--objective <text>                 Mission objective (defaults to spec ## Goal with --from)` |
| `uh propose --priority <priority>` | `--priority <priority>              Mission priority (default: medium)` |
| `uh propose --issue <provider:id[:url]>` | `--issue <provider:id[:url]>        Issue ref; repeatable (default: [])` |
| `uh propose --read-first <path>` | `--read-first <path>                Read-first context path; repeatable (default: [])` |
| `uh propose --source-link <url>` | `--source-link <url>                Source link; repeatable (default: [])` |
| `uh propose --repo-root <path>` | `--repo-root <path>                 Repository root recorded in mission context` |
| `uh propose --constraint <text>` | `--constraint <text>                Mission constraint; repeatable (default: [])` |
| `uh propose --required-skill <name>` | `--required-skill <name>            Required skill; repeatable (default: [])` |
| `uh propose --suggested-skill <name>` | `--suggested-skill <name>           Suggested skill; repeatable (default: [])` |
| `uh propose --expected-output <path>` | `--expected-output <path>           Expected output file path; repeatable (default: [])` |
| `uh propose --completion <text>` | `--completion <text>                Completion criterion; repeatable (default: [])` |
| `uh propose --required-check <name[=command]>` | `--required-check <name[=command]>  Required verification check; repeatable.` |
| `uh propose --review-gate <name>` | `--review-gate <name>               Review gate; repeatable (default: [])` |
| `uh propose --sandbox-backend <name>` | `--sandbox-backend <name>           Sandbox backend (default: git-worktree)` |
| `uh propose --promotion-policy <name>` | `--promotion-policy <name>          Promotion policy (default: human-approved)` |
| `uh propose --output <path>` | `--output <path>                    Explicit output path (default: .harness/missions/<id>/mission.yaml)` |
| `uh propose --root <path>` | `--root <path>                      Root directory (default: cwd)` |
| `uh propose --force` | `--force                            Overwrite existing mission file` |
| `uh spec scaffold` | `scaffold [options]         Generate starter tests from uh.spec.v0 acceptance criteria` |
| `uh spec scaffold --from <path>` | `--from <path>  Path to .spec.md file` |
| `uh spec scaffold --lang <lang>` | `--lang <lang>  Target language: ts | py` |
| `uh spec scaffold --out <path>` | `--out <path>   Output test file path` |
| `uh spec template` | `template [options] [name]  Print a starter uh.spec.v0 spec template (feature | epic)` |
| `uh spec template [name]` | `name          Template name; omit (or --list) to list available templates` |
| `uh spec template --out <path>` | `--out <path>  Write the template to a file instead of stdout` |
| `uh spec template --list` | `--list        List available templates` |
| `uh adapter list` | `list [options]             List configured adapter manifests` |
| `uh adapter list --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh adapter check` | `check [options] [runtime]  Check if a runtime adapter is available and configured` |
| `uh adapter check [runtime]` | `runtime        Runtime id to check; defaults to every configured adapter` |
| `uh adapter check --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh adapter add` | `add [options] <runtime>    Write a built-in adapter manifest template into .harness/adapters/` |
| `uh adapter add <runtime>` | `runtime        Runtime template id (one of: anthropic, claude-code, codex, command-code, hermes, hermes-proxy, oh-my-pi, openrouter, pi)` |
| `uh adapter add --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh adapter add --force` | `--force        Overwrite an existing manifest at the same path` |
| `uh adapter capabilities` | `capabilities [options]     Show adapter capability manifests (tools, sandbox, cost class, context window)` |
| `uh adapter capabilities --json` | `--json         Emit a JSON array for tooling` |
| `uh adapter capabilities --probe` | `--probe        Live-probe hermes-proxy /capabilities and merge over the static manifest` |
| `uh adapter capabilities --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh adapter cost-forecast` | `cost-forecast [options]    Forecast token cost for a mission from its run history (heuristic fallback)` |
| `uh adapter cost-forecast --mission <id>` | `--mission <id>       Mission id` |
| `uh adapter cost-forecast --adapter <adapter>` | `--adapter <adapter>  Adapter id or 'auto' (default: "auto")` |
| `uh adapter cost-forecast --root <path>` | `--root <path>        Root directory (default: cwd)` |
| `uh adapter cost-forecast --json` | `--json               Emit JSON` |
| `uh mission review-prepare` | `review-prepare [options] <id>           Capture complete review inputs and emit an advisory independent-review mission; does not start a runtime` |
| `uh mission review-prepare <id>` | `id                    New review mission id` |
| `uh mission review-prepare --sources <json>` | `--sources <json>      JSON array of {missionId, workspaceRoot?}; roots default to each source mission's bound workspace` |
| `uh mission review-prepare --runtime <runtime>` | `--runtime <runtime>   oh-my-pi, command-code, or claude-code` |
| `uh mission review-prepare --model <model>` | `--model <model>       Explicit independent reviewer model` |
| `uh mission review-prepare --workflow <profile>` | `--workflow <profile>  Review workflow (default: "research-docs")` |
| `uh mission review-prepare --root <path>` | `--root <path>         Root directory (default: cwd)` |
| `uh mission review-collect` | `review-collect [options] <id>           Validate review provenance and evidence; never grants human acceptance or promotes source work` |
| `uh mission review-collect <id>` | `id             Review mission id` |
| `uh mission review-collect --root <path>` | `--root <path>  Canonical project root (default: cwd)` |
| `uh mission review-collect --keep-workspace` | `--keep-workspace  Keep the review's sandbox after collecting (default: discard it)` |
| `uh mission create` | `create [options] <id>                   Create a scaffold mission packet` |
| `uh mission create <id>` | `id                    Mission id` |
| `uh mission create --title <title>` | `--title <title>       Mission title` |
| `uh mission create --workflow <profile>` | `--workflow <profile>  Workflow profile` |
| `uh mission create --objective <text>` | `--objective <text>    Mission objective` |
| `uh mission create --root <path>` | `--root <path>         Root directory (default: cwd)` |
| `uh mission create --force` | `--force               Overwrite existing mission.yaml` |
| `uh mission new` | `new [options] <id>                      Scaffold mission.yaml (and optionally a companion design.md)` |
| `uh mission new <id>` | `id                    Mission id` |
| `uh mission new --title <title>` | `--title <title>       Mission title` |
| `uh mission new --workflow <profile>` | `--workflow <profile>  Workflow profile` |
| `uh mission new --objective <text>` | `--objective <text>    Mission objective` |
| `uh mission new --design` | `--design              Also scaffold a companion design.md (UH-75)` |
| `uh mission new --design-path <path>` | `--design-path <path>  Override the design.md filename relative to the mission directory` |
| `uh mission new --root <path>` | `--root <path>         Root directory (default: cwd)` |
| `uh mission new --force` | `--force               Overwrite existing mission.yaml and design.md` |
| `uh mission show` | `show [options] <mission-id>             Show a mission's metadata and design.md companion when present` |
| `uh mission show <mission-id>` | `mission-id     Mission id` |
| `uh mission show --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh mission verdict` | `verdict [options] <mission-id> <value>  Record a manual verdict (pass | needs-attention | needs-remediation) on a mission` |
| `uh mission verdict <mission-id>` | `mission-id           Mission id` |
| `uh mission verdict <value>` | `value                Verdict value: pass | needs-attention | needs-remediation` |
| `uh mission verdict --rationale <text>` | `--rationale <text>   Free-text rationale (required for non-pass)` |
| `uh mission verdict --missiondir <path>` | `--missiondir <path>  Override the mission directory (default: .harness/missions/<id>)` |
| `uh mission verdict --root <path>` | `--root <path>        Root directory (default: cwd)` |
| `uh mission dry-run` | `dry-run [options] [file]                Show what command would be executed without running it` |
| `uh mission dry-run [file]` | `file                 Mission file path` |
| `uh mission dry-run --runtime <runtime>` | `--runtime <runtime>  Runtime to use (default: hermes)` |
| `uh mission dry-run --root <path>` | `--root <path>        Root directory (default: cwd)` |
| `uh mission dry-run --no-sandbox` | `--no-sandbox         Do not auto-route into the mission's bound sandbox worktree` |
| `uh mission dry-run --force` | `--force              Bypass mission capability matching for this runtime` |
| `uh mission run` | `run [options] [file]                    Execute a mission against a configured runtime` |
| `uh mission run [file]` | `file                               Mission file path` |
| `uh mission run --runtime <runtime>` | `--runtime <runtime>                Runtime to use (default: hermes)` |
| `uh mission run --root <path>` | `--root <path>                      Root directory (default: cwd)` |
| `uh mission run --no-sandbox` | `--no-sandbox                       Do not auto-route into the mission's bound sandbox worktree` |
| `uh mission run --force` | `--force                            Bypass mission capability matching for this runtime` |
| `uh mission run --runtime-config-overrides <json>` | `--runtime-config-overrides <json>  JSON object of runtime_config overrides applied on top of the mission file (e.g. '{"model":"gpt-5"}')` |
| `uh mission run --run-id <id>` | `--run-id <id>                      Explicit run id; auto-generated if omitted` |
| `uh mission run --auto` | `--auto                             Auto-select the cheapest installed adapter that satisfies the mission's runtime_requirements` |
| `uh mission run --explain` | `--explain                          With --auto, print the adapter decision matrix` |
| `uh mission cancel` | `cancel [options]                        Cancel an owned local mission run; use --plugin-url only for plugin-managed runs` |
| `uh mission cancel --mission <id>` | `--mission <id>      Mission id (validated; run lookup uses --run-id)` |
| `uh mission cancel --run-id <id>` | `--run-id <id>       Run id to cancel` |
| `uh mission cancel --root <path>` | `--root <path>       Root directory (default: cwd)` |
| `uh mission cancel --plugin-url <url>` | `--plugin-url <url>  Explicit Hermes plugin API base URL for plugin-managed runs` |
| `uh mission run-all` | `run-all [options] <mission-id>          Run a mission across multiple adapter runtimes and produce a side-by-side comparison` |
| `uh mission run-all <mission-id>` | `mission-id         Mission id (must exist in .harness/missions/)` |
| `uh mission run-all --runtimes <list>` | `--runtimes <list>  Comma-separated runtime list (default: every active adapter)` |
| `uh mission run-all --root <path>` | `--root <path>      Root directory (default: cwd)` |
| `uh mission run-all --serial` | `--serial           Run runtimes sequentially instead of in parallel` |
| `uh mission run-all --force` | `--force            Bypass mission capability matching for selected runtimes` |
| `uh mission run-team` | `run-team [options] <mission-id>         Run resource-bounded worker waves in separate worktrees, then mechanically integrate and verify; no leader model is invoked` |
| `uh mission run-team <mission-id>` | `mission-id             Mission id (must exist in .harness/missions/, with team shape)` |
| `uh mission run-team --root <path>` | `--root <path>          Root directory (default: cwd)` |
| `uh mission run-team --base-ref <ref>` | `--base-ref <ref>       Base git ref for worker / leader worktrees (default: HEAD)` |
| `uh mission run-team --retain` | `--retain               Preserve worktrees on success (default: cleanup on PASS, preserve on FAIL)` |
| `uh mission run-team --strategy <strategy>` | `--strategy <strategy>  Leader integration strategy: merge|cherry-pick|rebase (default: merge) (default: "merge")` |
| `uh sandbox create` | `create [options] <id>   Create a new sandbox bound to a mission` |
| `uh sandbox create <id>` | `id                Sandbox id` |
| `uh sandbox create --mission <id>` | `--mission <id>    Mission id this sandbox belongs to` |
| `uh sandbox create --base <ref>` | `--base <ref>      Base git ref to branch from (default: HEAD)` |
| `uh sandbox create --backend <name>` | `--backend <name>  Sandbox backend: git-worktree (default), directory, or container (OpenSandbox-configured; see docs/runbooks/container-sandbox.md)` |
| `uh sandbox create --root <path>` | `--root <path>     Root directory (default: cwd)` |
| `uh sandbox list` | `list [options]          List registered sandboxes` |
| `uh sandbox list --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh sandbox status` | `status [options] <id>   Show a sandbox's metadata and working tree status` |
| `uh sandbox status <id>` | `id             Sandbox id` |
| `uh sandbox status --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh sandbox discard` | `discard [options] <id>  Remove a sandbox worktree and registry entry` |
| `uh sandbox discard <id>` | `id             Sandbox id` |
| `uh sandbox discard --force` | `--force        Discard even if the worktree has uncommitted changes` |
| `uh sandbox discard --keep-branch` | `--keep-branch  Preserve the git branch after removing the worktree` |
| `uh sandbox discard --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh skill add` | `add [options] <dir>   Register a skill from a directory containing SKILL.md` |
| `uh skill add <dir>` | `dir            Path to skill directory containing SKILL.md` |
| `uh skill add --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh skill list` | `list [options]        List registered skills` |
| `uh skill list --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh skill check` | `check [options] <id>  Re-validate an indexed skill against its on-disk SKILL.md` |
| `uh skill check <id>` | `id             Skill id` |
| `uh skill check --root <path>` | `--root <path>  Root directory (default: cwd)` |
| `uh tui` | `tui [options] [command]                 Open the interactive terminal UI (Mission Control)` |
| `uh tui --root <path>` | `--root <path>                    Root directory (default: cwd)` |
| `uh tui --once` | `--once                           Render one frame and exit (CI / smoke / docs)` |
| `uh tui --screenshot <path>` | `--screenshot <path>              Capture one deterministic text frame to PATH (CI / docs)` |
| `uh tui --screenshot-size <cols>x<rows>` | `--screenshot-size <cols>x<rows>  Screenshot frame size (default: 120x36)` |
| `uh tui screenshot` | `screenshot [options]             Render a single TUI view to ANSI text (CI / docs)` |
| `uh tui screenshot --view <name>` | `--view <name>         View to capture: overview | missions | sandboxes | workflows` |
| `uh tui screenshot --out <path>` | `--out <path>          Output file path; use `-` or omit for stdout` |
| `uh tui screenshot --root <path>` | `--root <path>         Root directory (default: cwd)` |
| `uh tui screenshot --size <cols>x<rows>` | `--size <cols>x<rows>  Frame size (default: 120x36)` |
