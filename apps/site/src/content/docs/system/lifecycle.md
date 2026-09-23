---
title: The lifecycle
description: What happens, command by command and file by file, from an idea to landed code.
---

Every stage is a short CLI invocation that reads and writes files under `.harness/`. No stage needs a long-running process, and every stage can be inspected with `uh status`, `uh ps` or by reading the YAML.

```text
 uh init
   |
 uh propose / uh mission create / uh mission put     -> missions/<id>/mission.yaml
   |
 uh mission check                                    validate paths, roots, overrides; no launch
   |
 uh sandbox create  (or a team/queue creates them)   -> sandboxes/<id>/worktree
   |
 uh mission run | run-all | run-team | uh queue run  -> missions/<id>/runs/<run-id>/...
   |        \__ uh ps / wait / report / steer / kill / resume   (v0.11 run control)
   |
 uh verify                                           -> verification.yaml
   |
 uh mission review-prepare / review-collect          -> review-*.json           (v0.11)
   |
 uh land  (worker branches)  or  uh promote          -> land/decisions.ndjson, promotion.yaml
```

## 1. Initialize

`uh init` (`src/harness/init.ts#initializeHarness`) creates `.harness/project.yaml`, `adapters/`, `workflows/` (with the default workflow profiles), `skills/index.yaml`, `specs/{active,archive}`, `missions/`, `sandboxes/index.yaml` and `audit/events.ndjson`. `uh adapter add <runtime>` writes a built-in adapter manifest.

## 2. Specify and plan

- **Specs** use `uh.spec.v0` (`spec-loader.ts`). `uh spec template` prints a feature or epic template; `uh spec scaffold` turns acceptance criteria into starter tests (`test-scaffold.ts`).
- **Propose.** `uh propose` (`propose.ts`) generates a mission packet from issue metadata or a `.spec.md`.
- **Create.** `uh mission create|new` scaffolds a packet (and a `design.md`) by hand.
- **Check and install (v0.11).** `uh mission check` validates `read_first` paths, write roots, "change only" paths, grounding literals and runtime overrides against each adapter's own planner, without launching. `uh mission put` installs whole packets atomically. It exists because orchestrator agents are not allowed to write under `.harness/` directly.
- **Drift.** `uh validate --repair` detects eight kinds of drift (orphaned worktrees, stale workers, truncated event logs, stale specs, roadmap and Linear divergence, ...). `uh validate --judge --spec` grades spec adherence with a model.

A mission packet (`uh.mission.v0`) carries: identity and intent (objective, workflow profile, context, constraints, grounding, skills), outputs and completion (expected outputs, completion and acceptance criteria, TDD, verification checks), runtime selection (capabilities, runtime requirements, decision policy, runtime config overrides), execution (guard, sandbox, limits, independent review), and team shape. See the [mission packet schema](/source/docs/architecture/mission-packet-schema/).

## 3. Run

`uh mission run` (in `src/cli.ts`) goes through these steps in order. Any of them can stop the run before a runtime is spawned, and each one names the field at fault.

1. **Session template** (v0.11). `--template` or the mission adopts `.harness/templates/<id>.yaml` (`uh.session-template.v0`: adapter, overrides, limits, recovery, guard defaults, a budget tier). Mission values win; write roots are never widened; a strict template refuses loose missions.
2. **Routing.** With `--auto` or `decision_policy.enabled`, `auto-route.ts#chooseSemanticRoute` picks the adapter. Level 0 is deterministic eligibility (requirements, capabilities, `allowed_runtimes`, fleet), sorted by cost class and context window. Level 1 is a bounded model recommendation that can only choose among Level 0 survivors. The choice is saved as a `uh.decision-receipt.v0`.
3. **Preflight.** `capabilities.ts#assertRuntimeCapabilities` and `runtime-requirements.ts#assertRuntimeRequirements`. `--force` bypasses these two only. The unpublished v0.10.0 turns capability mismatches into warnings with `--strict` to block (see [release plan](/release/plan/), decision D1).
4. **Sandbox routing.** `sandbox.ts#resolveSandboxMissionRoot`. The mission needs a bound sandbox, or `--no-sandbox`. Orchestrator-role Claude Code and Command Code runs may use the project root, limited to their guard's write roots.
5. **Fleet admission** (v0.11). `fleet-policy.ts#assertFleetAdmission` refuses a model that `project.yaml` `fleet.routes` does not authorize for this adapter and role. `--force` cannot bypass it.
6. **Execute.** `runtime-recovery.ts#runWithRuntimeRecovery` calls the adapter, handles automatic resume up to `max_resumes`, deadline grace, and steer requests. Inside the adapter, see [Supervision and the guard](/system/supervision/).
7. **Settle.** The run's control file and result are reconciled, post-checks (`--post-checks`, which the agent never sees) are graded, the diff is captured with untracked files, cost is resolved, and a single `UH_RESULT {json}` line is printed. Exit codes: `0` passed, `1` failed, `2` blocked, `130` cancelled, `143` signal.

`uh mission dry-run` runs steps 1 to 5 and renders the prompt and command, then stops. `uh mission run-all` runs one mission on several runtimes for comparison. `uh mission run-team` and `uh queue run` are covered in [Teams, queue and land](/system/teams/).

## 4. Verify

`uh verify <mission>` (`verify.ts#verifyMission`):

1. Runs the deterministic checks: `required_checks`, acceptance criteria that have a `check_command`, expected-artifact checks, and a TDD classifier over the diff.
2. For criteria without a command, asks a bounded model judge (TypeSafe "System One", `typesafe.ts#evaluateThreeVerdict`) one yes/no question per criterion plus a fixed battery about the report. The outcome is composed in code with named thresholds: **pass**, **needs-attention** or **needs-remediation**.
3. A deterministic failure can never be overturned by the model. A `policy` stop counts as tamper and fails. If the provider is unavailable the judgment is `uncertain` and nothing is applied.

It writes `verification.yaml` (`uh.verification-result.v0`), records passes in the hive, and auto-promotes only if the workflow's `promotion_policy` is `auto-on-verify`. Mission `constraints[]` are advisory; the guard and limits are what enforce.

## 5. Review (v0.11)

`uh mission review-prepare` builds a review packet: the JSON schema it emits enumerates exactly the acceptance and check ids the request allows, and the review mission gets a guard policy that only lets it write the report. A second agent runs it; `uh mission review-collect` validates the report into `review-assessment.json`. See the [review round trip](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/db90516688f6e0e90b70a6b97fed87c621a841e5/docs/handbook/review-round-trip.md).

## 6. Promote or land

- **`uh promote`** (`promote.ts`) writes `promotion.yaml` (`uh.promotion.v0`) with `--approved-by`. It refuses `promoted` unless verification passed. It records a decision and does not merge anything.
- **`uh land`** (v0.11, `land.ts#landWorkerBranches`) actually moves code: it checks hive chain integrity, a passed verification per branch and a review bound to the branch tip; requires a clean target; runs `land.checks` from `project.yaml` (default typecheck and test); scans for forbidden patterns; commits; builds; and fast-forwards. Any failure restores the target. Each decision is appended to the hash-chained `.harness/land/decisions.ndjson`.
