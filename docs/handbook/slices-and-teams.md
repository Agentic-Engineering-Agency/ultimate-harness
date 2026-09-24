# Slices and teams

How to write a mission packet, how team missions fan out into per-worker packets, how resource waves admit workers, and what happens to stopped workers. Sources: `docs/architecture/mission-packet-schema.md`, `docs/runtime-targets.md`, `src/cli.ts`.

## The mission packet

A mission packet (`uh.mission.v0`) is the portable work request sent to a runtime adapter. It must be clear enough for a human to execute manually and structured enough for a runtime adapter to launch automatically. Create one with `uh mission create` (or `uh propose` from a spec):

```bash
uh mission create <mission-id> --title <title> --workflow <workflow-profile> --objective <objective>
```

Required top-level fields: `schema_version` (exactly `uh.mission.v0`), `id`, `workflow_profile`, and `title` or `name`. For a team mission, `shape: team` plus a `team` block are also required.

A single-agent slice declares, at minimum:

```yaml
schema_version: uh.mission.v0
id: <mission-id>
title: <title>
workflow_profile: <workflow-profile>
objective: <objective>
context:
  read_first:
    - <ordered context paths>
constraints:
  - <hard limits for the runtime>
guard:
  write_roots: [<roots>]
skills:
  required: []
  suggested: []
expected_outputs:
  files:
    - <path the mission must produce>
sandbox:
  backend: git-worktree
  promotion_policy: human-approved
verification:
  required_checks:
    - <runnable commands or named manual checks>
acceptance_criteria:
  - id: <stable-criterion-id>
    description: <criterion>
    check_command: <command>
    severity: block
```

Field rules that matter operationally:

- `acceptance_criteria` entries carry a stable `id`, a `description`, an optional `check_command` (defaulted from `verification.required_checks` when omitted), and a `severity` of `block` (verification fails when the criterion fails) or `warn` (recorded, not blocking). When `acceptance_criteria` is absent, every entry under `completion_criteria` is auto-promoted to a `severity: warn` criterion. `uh verify` writes a per-criterion entry into `verification.yaml`.
- `tdd.enforce_tests_first: true` opts the mission into a test-first verification gate that adds a blocking `ac-tdd-tests-precede-code` criterion; missions without a `tdd` block are unaffected.
- `expected_outputs` should include every path the work must produce. Mission-level expected outputs are a leader-stage verification concern, evaluated against the integrated repository tree.
- `sandbox.promotion_policy` must be explicit; `human-approved` means sandbox work becomes canonical only through a recorded decision (`uh promote`).

Execution limits (`limits.max_turns`, `limits.timeout_ms`, `limits.stall_timeout_ms`, `limits.max_denials`, `limits.max_repeated_failures`, `limits.max_output_bytes`, and `limits.protected_paths`) are enforced by UH supervision for every runtime. `limits.memory_mb` is not a valid field; memory is a team-resource concern (below). See [packet-rules.md](./packet-rules.md) for the rule about declaring `max_turns` at both top level and in `limits`.

## Team missions

A team mission adds `shape: team` and a `team` block: `workers[]` with per-worker packets, and a `leader` that integrates their work. Worker roles must be unique. Each worker entry accepts a contract:

| Field | Meaning |
| --- | --- |
| `adapter` | Accepted adapter id (required). |
| `template` | Optional session template id (`.harness/templates/<id>.yaml`). The worker's contract takes the template's `runtime_config_overrides`, `limits`, `recovery`, and `worker_rules` as defaults; the worker spec and the worker's own `mission_id` packet win. A worker with a template may omit `adapter`; the template's adapter is then used by the team run, `uh mission check` and the delivery observatory, and a worker with neither fails validation. An unknown id fails the team before any worker starts. |
| `role` | Non-empty, unique worker role (required). |
| `mission_id` | Optional distinct worker mission: the worker's contract and runtime packet are resolved from that mission's `mission.yaml` instead of inheriting the parent packet. |
| `objective` | Worker-specific objective, combined with the parent mission objective when present; the worker inherits the parent objective when omitted. |
| `runtime_config_overrides` | Runtime configuration merged over top-level mission overrides, worker values taking precedence (for example `model`). |
| `limits` | Runtime execution limits for this worker (such as `max_turns`, `timeout_ms`, `max_denials`); land under `runtime_config_overrides.limits`. Per-worker `memory_mb` is not allowed here. |
| `guard` | Per-worker tool guard fields: write roots and the git, package, network, and agent-client denial switches. |
| `expected_outputs` | Output artifact paths this worker must produce; evaluated in the worker worktree after the runner returns. |
| `seed` | Non-negative integer injected into the derived packet constraints for randomized steps. |

During dispatch the harness writes the derived packet into the worker worktree and to the worker's artifact scope; when the worker runner returns, the worktree copy is restored to the canonical parent bytes before the git commit, so worker branches never commit derived packet mutations and the artifact scope preserves the exact derived packet the worker received.

If a worker declares `expected_outputs.files` and any declared file is missing or fails verification, the worker settles `blocked` (not succeeded), the team state records a `blocked_reason` naming the file, and the worker's branch is not committed and is excluded from leader integration.

Execute a team mission with:

```bash
uh mission run-team <mission-id> --base-ref <ref> --strategy merge
```

Strategies are `merge`, `cherry-pick`, or `rebase`. The leader merges changes and invokes verification; it does not perform a separate model synthesis run. A `PARTIAL` outcome is a non-blocking success: fewer than all workers landed but the integrated subset passed verification. Worktrees are cleaned up on a full pass and preserved on failure unless `--retain` says otherwise.

`--base-ref` is resolved to a commit id once, before any worker starts, so every worker and the leader branch from the same commit. That commit is recorded as `git config branch.<branch>.base` and on each worker's team-state record as `base_commit`; independent review reads the fork point back from the config instead of falling back to a wide range. When a branch is deleted, its `branch.<name>` config section is removed with it.

A fresh worker worktree reports a clean tree: the harness writes a worktree-local `.harness/.gitignore` that ignores itself, and marks the tracked files it rewrites under the protected roots (`.harness`, `.commandcode`, `.omp`, `.pi`) with `git update-index --skip-worktree` in that worktree only. Worker commits are unaffected, since they never stage protected paths.

Worker commits use the repository's configured `user.name` and `user.email` as author and committer, falling back to `uh team worker <uh-team@example.com>` only when the repository has no identity configured.

On Windows, when the repository does not already set `core.longpaths`, worktree setup enables it in the repository's local config and records a note saying so. Only when it cannot be enabled does setup check each worktree: if the worktree path plus the longest tracked path at the base ref exceeds 259 characters, the team fails with a message giving both lengths instead of a partial checkout. Setup errors keep up to 2,000 characters of git's stderr.

Relaunching a team whose previous run was killed is guarded. A team run is refused while a live run of the same team is registered, naming the run ids. Otherwise, retained branches or worktree paths refuse by default; re-run with:

```bash
uh mission run-team <mission-id> --replace
```

`--replace` removes the retained worktrees, renames each old branch to `uh/archive/<team>/<timestamp>/<role>` (unmerged work is kept, never deleted), and renames the old `.harness/missions/<team>/team` directory to `team.<timestamp>` before relaunching.

## Resource waves

Team workers run in resource-admitted waves. `team.resources` controls admission:

| Field | Admission behavior |
| --- | --- |
| `max_parallel` | Caps workers admitted to a wave. Defaults to `4`. |
| `worker_memory_mb` | Caps concurrency using available memory. A memory cap requires the native Windows runner and native `oh-my-pi` or `command-code` workers. |
| `reserve_memory_mb` | Memory subtracted before calculating concurrency. Defaults to `1024` MB. |
| `max_cost_usd` | Upper bound used to calculate remaining admission reservations. |
| `worker_cost_reservation_usd` | Per-worker reservation charged to admission. Both cost fields are required together. |
| `unknown_cost` | What an unknown completed worker cost does to the next wave: `block` (default) or `admit`. |

Memory admission is scoped **per project**, not machine-wide. The admission lock and the reservations it guards live under this project root's `.harness/worker-admission/`, so they coordinate teams launched from the same project root; two teams started from different checkouts decide independently.

The harness re-admits a wave only after every worker admitted to the prior wave settles. If memory admission cannot launch one worker, or remaining cost cannot reserve one worker, the remaining workers are marked `blocked` and the team records `admission_blocked_reason`; a team with that reason stays `blocked` in its final status.

A memory reservation counts against another team's decision only while its worker's runtime process has not yet started reporting. As soon as the worker reports — a project-root live-run entry with a heartbeat, or its measured memory visible — the memory is already in the free-memory reading, so the reservation stops counting to avoid double counting it. An owner that never reports (or crashed) falls back to a fixed 60 s trust window, after which its reservation is dropped.

**The unknown-cost admission rule:** with the default `unknown_cost: block`, unknown or invalid completed cost — including unavailable accounting — blocks further paid admission. It is never treated as zero. Cost admission is a reservation control, not a provider charge cap: an in-flight worker can exceed its reservation, so this is not a guaranteed spending ceiling. A worker that was never invoked contributes nothing, because no runner ran for it.

**Opting in with `unknown_cost: admit`:** fleets that cannot report price at all (Command Code reports usage but no provider cost) would otherwise deadlock on the first wave boundary, because a team with more workers than `max_parallel` can never finish. Setting `unknown_cost: admit` lets a later wave proceed when a completed worker's cost is unknown. It changes nothing else: known costs are still summed and still count against `max_cost_usd` exactly as before, unknown spend is still never recorded as zero, and unavailable accounting (a cost lookup that throws) still blocks. Every wave admitted while unknown spend is outstanding records an explicit admission note instead of assuming a number:

```
wave 2 admitted with unknown cost by policy unknown_cost=admit
```

Those notes are durable facts, not log noise. They land in `team-state.json` as `admission_notes[]` and in the integration report as `- Cost admission: <note>` lines, so a settlement or cost review can tell admitted-but-unpriced waves apart from waves whose cost was measured. A team with only notes and no `admission_blocked_reason` is not blocked by them.

## Salvage of stopped workers

A worker that settles `failed` with a recoverable stop code (`turn_limit`, `timeout`, `deadline`, `stall`, or `policy`) may still hold usable work. The team state records a `salvage` entry for it with:

- `eligible` — the worktree held changes outside the protected roots;
- `outputs_passed` and `checks_passed` — the worker's declared outputs and its `verification.required_checks` were both re-run in the worker worktree through the same verifier the leader uses;
- the worker `branch`.

The worktree is committed to that branch with the existing hygiene rules only when both passed. The leader never merges a failed worker automatically, and a `policy` stop always requires a human. Workers that failed for other reasons (`route_mismatch`, `route_unverified`, `runtime_error`, `cancelled`, blocked) are not evaluated. Salvage never changes the team status: a team with a failed worker is still not passed. The integration report lists eligible stopped workers under a "Verified work from stopped workers" section with their stop code and branch.

Canonical team artifacts: parent state and result live at `.harness/missions/<mission>/runs/<parent-run>/team-state.json` and `runtime-result.yaml`; worker artifact roots live at `.harness/missions/<mission>/team/artifacts/<parent-run>/workers/<worker>/`. In `team-state.json`, each `workers[]` entry carries the resolved `contract`, `outputs` verification records, `blocked_reason` when blocked, and `salvage` when applicable.
