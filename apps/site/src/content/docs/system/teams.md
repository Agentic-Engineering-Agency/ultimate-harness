---
title: Teams, queue and land
description: Running many workers and many missions, sharing what they learn, and landing the result.
---

Everything on this page is on the **v0.11** line except the basic `run-team`, which exists on `main` in an earlier form.

## Team runs: `uh mission run-team`

`src/harness/team-run.ts`. A team mission fans one objective out to workers, each in its own git worktree, then integrates mechanically. There is no leader model: integration is a git merge plus verification.

1. **Plan.** `planTeamRun` is pure. It computes workers per role, branches (`uh/team/<mission>/<role>-<n>`) and worktree paths (checked against Windows `MAX_PATH`).
2. **Admit in waves.** `runtime-resources.ts#mapResourceWaves` starts workers in waves that fit the machine: free memory against a per-worker estimate (median recorded peak, default 700 MB), `reserve_memory_mb`, a machine-wide lock, `max_cost_usd`, and `unknown_cost: block | admit`. Fleet admission applies to every worker.
3. **Run.** Each worker is a normal supervised run with its own guard and limits. Worker commits exclude harness-written files by pathspec; a worker that only touched harness state produces no commit.
4. **Salvage.** A worker stopped by a limit or deadline keeps its branch if its declared outputs and checks still pass.
5. **Integrate and verify.** The leader worktree merges worker branches, then `verifyMission` runs there.
6. **Settle.** `passed`, `passed_partial`, `blocked` or `failed`, written to `team-state.json` (`uh.team-run.v0`). Worktrees are kept on failure for inspection. `notifyTeamSettled` fires.

Worktrees are created with `git worktree add --lock --reason` and unlocked before removal; UH never runs a global `git worktree prune`.

## Queue: `uh queue run <queue.yaml>`

`src/harness/queue.ts#runQueue` launches missions in `after`-dependency order, holding at most an orchestrator cap of concurrent runs and a memory floor. It settles each entry from its run records rather than from the child process's exit code, and can resume after an interruption. State lives in `.harness/queue/<id>/state.json`.

## Waiting and watching

- `uh ps` lists every run registered under `.harness/live-runs/`: mission, team role, runtime and model, verdict (`live`, `orphaned`, `stale`, `settled`), turns, denials, heartbeat age, last tool and native pids. Exit code 3 if any run is orphaned.
- `uh wait <run-id> | --mission | --team` blocks until runs settle without polling from the caller.
- `uh notify` configures sinks (a command, a webhook, or presets for Hermes, Apprise, ntfy and Windows toasts) for `run.settled`, `team.settled`, `run.orphaned` and `alert`. There is no default sink; every delivery is logged.

## The hive: shared, tamper-evident memory

`src/harness/hive.ts`. Agents working on related missions need shared facts ("the auth module uses X") and open items, without trusting each other's claims.

- **Only the controller writes.** Workers cannot write, delete or read the hive files directly; the guard classifies it as `guard_tamper`. They get verified facts injected into their dispatch context.
- **Facts cite evidence** and are appended to a hash chain in `facts.ndjson`. `uh verify` records passes as facts.
- **Claims** are recorded but never injected into prompts.
- `uh hive import <checklist.md>` loads items, `uh hive show` reads, and `uh hive verify` checks the hive, ledger and land hash chains.

## The intervention ledger

`src/harness/interventions.ts`. Every human or automated correction (steer, kill, review outcome, settlement, replacement) is appended to `.harness/ledger/interventions.ndjson` with a hash chain. `uh note "<text>"` adds one by hand; `uh ledger list | summary | land | confirm | import` manages status and owner confirmation. The point is to learn which countermeasures work, not only to log.

## Landing: `uh land`

`src/harness/land.ts#landWorkerBranches` moves verified, reviewed worker branches onto a target branch, or leaves the target untouched:

1. **Gates.** Intact hive chains; a passed verification for each branch; an independent review bound to each branch's tip commit (`--accept-review` to override, recorded).
2. **Clean target** with its HEAD recorded.
3. **Checks** from `project.yaml` `land.checks` (default `bun run typecheck` and `bun run test`).
4. **Forbidden-pattern scan** on the combined diff.
5. **Commit**, then **build** (default `bun run build`).
6. **Fast-forward** requested checkouts.

Any failure restores the target to the recorded HEAD. Every decision is appended to the hash-chained `.harness/land/decisions.ndjson`.

## Handbook

The operator handbook on the release line walks through all of this with examples: [slices and teams](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/db90516688f6e0e90b70a6b97fed87c621a841e5/docs/handbook/slices-and-teams.md), [closing the loop](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/db90516688f6e0e90b70a6b97fed87c621a841e5/docs/handbook/closing-the-loop.md), [intervention ledger](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/db90516688f6e0e90b70a6b97fed87c621a841e5/docs/handbook/intervention-ledger.md), [notifications](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/db90516688f6e0e90b70a6b97fed87c621a841e5/docs/handbook/notifications.md). Once v0.11 merges, these appear under Source documents on this site automatically.
