# Experiments: Matched-Budget Runs Over a Seeded Held-Out Split

## What an experiment is

The experience store indexes settled runs and `uh observatory compare` compares
two arms of a set of runs that already exist. An **experiment** is the thing
that produces comparable runs on purpose: a task set with executable checks,
partitioned into a `search` and a `held_out` split, executed under two or more
configurations (arms) at a matched budget, and reported honestly against the
baseline of simply repeating the cheaper configuration.

An experiment is declared in `.harness/experiments/<id>.yaml` and validated
against the strict `uh.experiment.v0` schema (`src/schema/experiment.ts`). Its
tasks are mission ids under `.harness/missions/`, and every task mission must
declare `verification.required_checks` — a task with no executable check cannot
be scored.

```yaml
schema_version: uh.experiment.v0
id: denial-tone
title: Guard denial tone
tasks: [mission-a, mission-b, mission-c, mission-d]
split:
  seed: 7
  held_out_fraction: 0.34        # default
arms:
  - id: terse
    template: balanced
  - id: explanatory
    template: balanced
    runtime_config_overrides:
      denial_tone: explanatory
    attempts_per_task: 1          # default
budget:
  max_runs: 40
  max_total_cost_usd: 25
baseline:
  arm: terse
  parallel_attempts: 1            # default
```

## The invariants

- **The evaluator lives outside the loop.** A run is scored by the task's own
  `verification.required_checks` and its settled run record, never by the model
  that produced it: pass rate comes from `status`, denials from `denials`, the
  guard classes from the `tool-guard.log`, and cost from the priced run record.
- **Held-out acceptance is not optional.** The split partitions the tasks, and
  the report always presents each partition separately. A gain that appears only
  on `search` tasks is not a gain; published harness-evolution work shows search
  gains vanishing on held-out tasks, so the report never pools the two.
- **The budget is matched.** Arms are interleaved at every attempt level
  (`planExperiment`), so a budget stop trims each arm by the same amount and can
  never favour one arm. When a budget line is reached the remaining plan entries
  are recorded as skipped with reason `budget`, and skipped rows are never
  counted as evidence.
- **Optimizer tokens are counted.** Token totals and cost are read from the run
  record the experience store already builds. Unknown cost is never treated as
  zero: it stays `unknown` in the report, and an unpriced run contributes
  nothing to the cost budget (so it can neither look free nor silently spend
  past the cap).
- **Determinism.** A seeded split is a pure function of `seed` and
  `held_out_fraction` (mulberry32), so a seed always names the same partition
  and the seed is part of every output. An explicit `split.held_out` list is
  used verbatim.

## File layout

```
.harness/experiments/
  <id>.yaml          # the spec (uh.experiment.v0)
  <id>/
    plan.json        # seed, split sizes, and the ordered {task, arm, attempt, split} plan
    runs.ndjson      # one row per plan entry: the settled record, or a budget skip
    report.json      # per-split per-arm summary, arm comparisons, baseline repeats
    report.md        # the same report as markdown
```

`runExperiment` writes a `experiment.json` (`{ id, arm, split }`) into each
run's directory under `.harness/missions/<task>/runs/<run_id>/`, the same way a
session template records `session-template.json`. `indexRuns` reads it into the
run record's optional `experiment` field, so an operator can group a mission's
runs by experiment and arm.

## Module and CLI surface

`src/harness/experiment.ts` is pure except for the injected runner:
`splitTasks(spec)` and `planExperiment(spec)` are deterministic and
side-effect-free, and `runExperiment(root, spec, { runner, now })` owns only the
budget loop, the persistence, and the tagging. The runner has the shape of the
per-runtime `runtimeRunner` seam in `harness/run-all.ts`: tests inject a fake and
never start a model runtime. `summarizeExperiment(runs, spec)` groups rows by
split and arm, calls the same `compareArms` the observatory uses for every arm
pair within a split, and adds the baseline arm's best-of-n and
attempts-to-match lines.

```
uh experiment plan <id>              # seed, split sizes, arm-interleaved plan
uh experiment run <id> [--json]      # execute and persist plan/runs/report
uh experiment report <id> [--json]   # summarize persisted runs against the baseline
```

Human output prints the seed, the split sizes, each arm per split with its
Wilson interval, the mean denials and the `guard_tamper` / `containment_escape`
stop counts, the verdict sentence, and the plain-repeats line.
