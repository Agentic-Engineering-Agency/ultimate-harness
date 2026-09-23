# Operator handbook

This handbook is the reference an operator — or an orchestrating agent — reads before driving Ultimate Harness. It is written for someone about to dispatch work, watch it run, stop it, verify it, review it, integrate it, and prove it landed. Every command shown here exists in `src/cli.ts`, and every page names the files in this checkout that its facts come from. No page documents behaviour that cannot be found in those sources.

## What Ultimate Harness is

Ultimate Harness (UH) is a runtime-agnostic discipline layer for agentic software development. It is not a coding agent. It is the control plane that keeps work auditable, reproducible, and safe to promote into a real codebase regardless of which coding agent did the work. The agent runtime is a swappable backend (Hermes, Codex, Command Code, oh-my-pi, and others); the discipline — specs, mission packets, sandbox boundaries, verification artifacts, audit trail, human approval gates — is not.

Principles that shape everything an operator does:

- **Schemas, not conventions.** Every persisted artifact (`.harness/` YAML, JSON, and NDJSON on disk) is validated against a versioned Zod schema. There is no daemon: anything that reads or mutates state is a short CLI invocation.
- **No hidden state.** If `uh status` does not see it on disk, it does not exist.
- **Explicit human gates.** Sandbox work never becomes canonical work without a recorded promotion decision. Verification can run automatically; promotion never does.
- **Fail loudly.** A missing runtime, malformed manifest, or wrong configuration fails with the specific path, id, or field at fault. There are no silent fallbacks.

Sources: `docs/VISION.md`, `docs/architecture/overview.md`.

## The operating loop

An operator drives UH as a loop. Each stage below names the handbook page that covers it.

1. **Dispatch.** Write a mission packet (`uh.mission.v0`) and execute it with `uh mission run`, or fan a team mission out into per-worker packets with `uh mission run-team`. `uh queue run` launches a list of missions in order under an orchestrator cap and a free-memory floor, and resumes after a crash. Every run and dry-run prints a `Sandbox:` line naming where execution goes before anything is spawned. → [slices-and-teams.md](./slices-and-teams.md)
2. **Guard.** A per-tool-call contract boundary — write roots, git, package, network, and agent-client denials — is resolved from the mission's `guard` block and enforced through runtime hooks. Denials are recorded and counted against the run's denial budget. → [fleet.md](./fleet.md), [packet-rules.md](./packet-rules.md)
3. **Supervise.** The harness supervises each attempt independently of model compliance: turn, time, output, denial-budget, and repeated-failure limits; stall detection; protected-path policy. When a limit is reached, the run stops with a structured stop code recorded in `runtime-control.json`. → [fleet.md](./fleet.md)
4. **Watch and stop.** `uh ps` lists every run discoverable from the project root with a liveness verdict (`live`, `orphaned`, `stale`, `settled`). `uh wait` blocks until matched runs settle so orchestrators do not poll. `uh kill` stops runs and proves they are dead. `uh mission cancel` cancels an owned local run by request. → [run-control.md](./run-control.md)
5. **Settle.** `uh mission run` always prints, as the last line of stdout, a machine-parseable settlement line `UH_RESULT <single-line-json>` with `mission_id`, `run_id`, `runtime`, `status` (`passed`, `failed`, `blocked`, `cancelled`), optional `stop_code`, `exit_code`, and `run_dir`. Exit codes are deterministic: `0` passed, `1` failed, `2` blocked, `130` cancelled. Settled runs, teams and alerts can reach configured notification sinks. Sources: `docs/runtime-targets.md`. → [notifications.md](./notifications.md)
6. **Verify.** `uh verify <mission-id>` runs the mission's required checks and acceptance criteria and writes `verification.yaml`. `uh mission run --post-checks <file>` adds operator checks the agent never sees and fails the run when one fails. Sources: `docs/architecture/mission-packet-schema.md`. → [closing-the-loop.md](./closing-the-loop.md)
7. **Review.** Independent review is an advisory round trip: prepare a review packet, run a reviewer in a sandbox bound to it, and collect a validated recommendation with three possible verdicts (pass / needs-attention / needs-remediation). It never grants acceptance by itself. → [review-round-trip.md](./review-round-trip.md)
8. **Integrate.** A team mission's leader merges worker branches mechanically and invokes verification; no leader model is invoked. Eligible stopped workers can contribute verified work without being merged as-is. `uh land` puts verified, reviewed worker branches on a target branch as one commit after the full checks, an attribution scan and the build, or restores the target exactly. → [slices-and-teams.md](./slices-and-teams.md), [closing-the-loop.md](./closing-the-loop.md)
9. **Prove.** Acceptance evidence is real-runtime evidence, registered per capability and classified by freshness and outcome at the current harness commit. `uh promote` records the human promotion decision; it is never automatic. → [acceptance.md](./acceptance.md)

## The pages

| Page | Covers | Primary sources |
|---|---|---|
| [run-control.md](./run-control.md) | `uh ps`, `uh wait`, `uh kill`, `uh mission cancel`, liveness verdicts, orphans, team cascade | `docs/runbooks/run-control.md`, `src/harness/live-runs.ts`, `src/harness/wait.ts` |
| [slices-and-teams.md](./slices-and-teams.md) | Writing mission packets, team missions with per-worker packets, resource waves, the unknown-cost admission rule, salvage of stopped workers | `docs/architecture/mission-packet-schema.md`, `docs/runtime-targets.md` |
| [review-round-trip.md](./review-round-trip.md) | `review-prepare`, sandbox create, run, `review-collect`, what the validator requires, the observations outlet | `docs/runbooks/independent-review.md`, `src/harness/independent-review.ts` |
| [acceptance.md](./acceptance.md) | The capability registry, running one capability or the fleet campaign, evidence records, freshness per commit, what "proven" means | `docs/runbooks/acceptance.md`, `acceptance/registry.yaml` |
| [fleet.md](./fleet.md) | The command-code adapter, session templates and tiers, guard classes and their exact denial texts | `docs/tool-guard.md`, `docs/architecture/session-templates.md`, `docs/runtime-targets.md` |
| [packet-rules.md](./packet-rules.md) | Rules for packets that survive the guard and the reviewer | `docs/architecture/mission-packet-schema.md`, `docs/tool-guard.md`, `docs/runbooks/independent-review.md`, `docs/runtime-targets.md` |
| [intervention-ledger.md](./intervention-ledger.md) | The append-only intervention ledger (`uh note`, `uh ledger`), automatic capture triggers, cause/qualifier taxonomies, and landing countermeasures | `src/schema/intervention.ts`, `src/harness/interventions.ts`, `src/cli.ts` |
| [closing-the-loop.md](./closing-the-loop.md) | Operator post-checks, `uh queue`, `uh land` and its gates, worker commit identity | `src/harness/post-checks.ts`, `src/harness/queue.ts`, `src/harness/land.ts` |
| [notifications.md](./notifications.md) | Notification sinks and presets, `uh notify detect`, `list` and `test` | `src/harness/notifications.ts`, `src/schema/project.ts` |
## Conventions used in this handbook

- Commands are shown as they would be typed at a project root. Placeholders such as `<mission-id>`, `<run-id>`, or `<fresh-workspace>` stand for values you choose; none refer to a real run.
- `[BLOCKED]` marks a refusal that exits with code `2` before a runtime is spawned. `[FAIL]` marks a command error that exits non-zero.
- Sandbox work is never run in the project root implicitly: `uh mission run` refuses to fall back to the root silently when sandbox routing was requested and no sandbox is bound. Root execution is only reachable through an explicit `--no-sandbox`.
