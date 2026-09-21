# Mission Packet Schema

## Purpose

A mission packet is the portable work request sent to a runtime adapter. It must be clear enough for a human to execute manually and structured enough for a runtime adapter to launch automatically.

## Draft schema: `uh.mission.v0`

A single-agent mission:

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
guard:
  write_roots: [out]
  deny_git_mutations: true
  deny_package_installs: true
  deny_network_clients: true
  agent_clients: [omp, cmdc, codex, pi, hermes, aider, gemini, claude, opencode, qwen, goose, cursor-agent]
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

A team mission adds `shape: team` and a `team` block:

```yaml
schema_version: uh.mission.v0
id: mission-docs-spine
title: Create documentation spine for Ultimate Harness
workflow_profile: research-docs
shape: team
team:
  workers:
    - adapter: oh-my-pi
      role: documentation
      objective: Author architecture documentation for runtime adapters.
      runtime_config_overrides:
        model: openai-codex/gpt-5.6-luna
      limits:
        max_turns: 10
      expected_outputs:
        files:
          - docs/architecture/runtime-adapter-contract.md
      seed: 42
    - adapter: command-code
      role: review
  leader:
    adapter: oh-my-pi
    role: integrator
  resources:
    max_parallel: 2
    worker_memory_mb: 2048
    reserve_memory_mb: 1024
    max_cost_usd: 5
    worker_cost_reservation_usd: 1
```

## Required fields

The mission schema requires these top-level values:

| Field | Requirement |
| --- | --- |
| `schema_version` | Exactly `uh.mission.v0`. |
| `id` | A non-empty string. |
| `workflow_profile` | A non-empty string. |
| `title` or `name` | At least one must be a non-empty string. |
| `team` | Required when `shape: team`; it must contain at least one worker and a leader. |

For a team, each worker requires an accepted `adapter` id and a non-empty `role`; the worker `count` is optional. The leader requires an accepted `adapter` id, while its `role` is optional. Team worker roles must be unique. Other mission fields are optional and receive schema defaults.

## Tool guard block

`guard` is optional on the mission and on each `team.workers[]` entry. It defines the per-tool-call contract applied by the native `oh-my-pi` and `command-code` adapters. The input block is strict; unknown fields are rejected.

| Field | Meaning | Default |
| --- | --- | --- |
| `write_roots` | Roots in which write and delete targets are allowed. | `["."]` |
| `deny_git_mutations` | Deny shell Git mutations. | `true` |
| `deny_package_installs` | Deny package-manager install or add commands. | `true` |
| `deny_network_clients` | Deny network clients. | `true`, or `false` when `runtime_requirements.needs_network` is true and the field is omitted |
| `agent_clients` | Executable names treated as agent clients. Always enforced; an explicit empty list is the only opt-out. | `["omp", "cmdc", "codex", "pi", "hermes", "aider", "gemini", "claude", "opencode", "qwen", "goose", "cursor-agent"]` |

The mission transform resolves a supplied mission block with `resolveToolGuardPolicy`; a worker block is retained as the worker's guard contract. The guard compares target paths only and does not inspect file content. Protected roots are a separate supervisor policy; their defaults are `.harness`, `.commandcode`, `.omp`, `.pi`, and `.git`. The adapter writes the resolved policy and the protected paths to `tool-guard.json` in each run directory. See [Tool Guard](../tool-guard.md) and [Native Runtime Events](./runtime-events.md).

## Team block

`team.workers` lists worker adapter assignments, and `team.leader` identifies the adapter that integrates their work. `team.resources` is optional:

| Field | Meaning |
| --- | --- |
| `max_parallel` | Maximum worker count admitted in one wave. Defaults to `4`. |
| `worker_memory_mb` | Optional per-worker memory cap used to calculate wave concurrency. |
| `reserve_memory_mb` | Memory reserved before worker admission. Defaults to `1024` MB. |
| `max_cost_usd` | Optional completed-cost amount used for admission reservations. |
| `worker_cost_reservation_usd` | Reservation charged to admission for each worker. |

`max_cost_usd` and `worker_cost_reservation_usd` must be supplied together. Resource admission is described in [Runtime Targets](../runtime-targets.md#team-resource-admission).

### Worker contract

Each worker entry in `team.workers` accepts an optional contract defining worker-specific objectives, runtime overrides, limits, expected outputs, and seed values:

| Field | Meaning | How it reaches worker |
| --- | --- | --- |
| `objective` | Worker-specific task objective. When specified, it is combined with the parent mission objective as `<worker objective>\n\nTeam objective: <parent objective>`. When omitted, the worker inherits the parent objective. | Prompt |
| `runtime_config_overrides` | Runtime configuration overrides merged over top-level mission overrides, with worker-level values taking precedence. Used for adapter-specific parameters such as `model`. See [Runtime Supervision and Recovery](../runtime-targets.md#runtime-supervision-and-recovery) for execution `limits` and `recovery` configuration. | Runtime configuration |
| `limits` | Runtime execution limits for this worker (such as `max_turns`, `timeout_ms`, `startup_timeout_ms`, `stall_timeout_ms`, `max_output_bytes`, `max_denials`, and `max_repeated_failures`). These land under `runtime_config_overrides.limits`. | Runtime configuration |
| `guard` | Per-tool guard fields for this worker: write roots and Git, package, network, and agent-client denial switches. | Runtime enforcement |
| `expected_outputs` | Output artifact paths that this worker must produce (`expected_outputs.files`). Evaluated in the worker worktree after the runner returns. | Prompt and settlement |
| `seed` | Non-negative integer for randomized steps. Injected into the derived packet constraints as `Seed: <seed>. Use it for every randomized step and print it in your final message.` | Prompt |

Per-worker memory cannot be declared in worker `limits`. Per-worker memory is governed exclusively by `team.resources.worker_memory_mb`. Declaring `limits.memory_mb` causes schema validation to fail with: `Per-worker memory is governed by team.resources.worker_memory_mb`.

When a worker declares `expected_outputs.files`, the harness inspects the worker worktree upon completion. If any declared output file is missing or fails verification:
- The worker settles with status `blocked` rather than `succeeded`.
- `team-state.json` records `blocked_reason` explaining the failure (for example, `Declared output out/report.md: Declared output is missing, unreadable, or outside the workspace`).
- The worker's branch is not committed and is excluded from leader integration.

Mission-level `expected_outputs` remain a leader-stage verification concern evaluated against the integrated repository tree.

## Field rules

- `schema_version` is required and must be versioned.
- `id` must be stable and audit-safe.
- `issue_refs` should include all external trackers when available.
- `workflow_profile` must match a defined profile.
- `context.read_first` should be ordered.
- `constraints` are hard limits for the runtime.
- `skills.required` must be loaded/applied by capable runtimes.
- `expected_outputs` should include paths and artifact kinds where possible.
- `sandbox.promotion_policy` must be explicit.
- `verification.required_checks` should be runnable commands or named manual checks.
- `acceptance_criteria` (Spec-Driven Development, UH-54) declare each criterion with a stable `id`, a `description`, an optional `check_command` (defaulted from the global `verification.required_checks` when omitted) and a `severity` of `block` (verification fails when this AC fails) or `warn` (recorded for the audit trail, not blocking).
- When `acceptance_criteria` is absent, every entry under `completion_criteria` is auto-promoted to a `severity: warn` AC. Existing missions continue to validate without edits.
- `uh verify` writes a per-AC entry into `verification.yaml#acceptance_criteria[]` (id / description / status / severity / exit_code / duration_ms / stdout_snippet / stderr_snippet) and emits an `acceptance.checked` row in `events.ndjson` for live observers (TUI / replay tools).
- `tdd` (Test-Driven Development, UH-55) opts the mission into a test-first verification gate.
  - `tdd.enforce_tests_first: true` — when set, `uh verify` reads `diff.patch` and adds a synthetic `acceptance_criteria` entry `ac-tdd-tests-precede-code` (severity `block`).
  - The synthetic AC **passes** when the diff touches at least one test path; **fails** when the diff touches source paths without any test changes; and **blocks** the run when `diff.patch` is missing.
  - `tdd.test_paths` / `tdd.source_paths` are glob arrays; defaults are conventional (`tests/**`, `src/**`, plus `*.{test,spec}.{ts,tsx,js,jsx}` patterns and `__tests__/**`).
  - Missions without a `tdd` block are unaffected — TDD is opt-in.
