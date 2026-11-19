# Resource-wave smoke

Exercises resource-wave admission and settlement through the built CLI using deterministic fixtures, without calling a model. `tests/runtime-resources.test.ts` covers admission arithmetic; this procedure checks the command path described in [runtime targets](../runtime-targets.md). It does not establish live-provider acceptance.

## What it runs

`scripts/smoke/resource-wave/run.mjs` creates a throwaway git project per scenario under a short temporary root, registers the `oh-my-pi` adapter with its `cli_command` pointed at `scripts/smoke/resource-wave/fake-omp.mjs`, writes a three-worker team mission with `max_parallel: 2` and a `0.5` USD reservation per worker, and runs `uh mission run-team wave --retain`. The fixture attests a fixed route, writes one file per worker, sleeps briefly, and reports usage with or without a cost total.

| Scenario | Resources | Expected canonical outcome |
|---|---|---|
| A | `max_cost_usd: 1.2` | Two workers admitted and succeed; the third is `blocked`; team `blocked` with `admission_blocked_reason` "Remaining team cost budget cannot reserve another worker"; parent `cost_usd` is the measured 1.0 |
| B | `max_cost_usd: 3` | Second wave admitted; all three succeed; team `passed`; exit 0 |
| C | fixture reports no cost | First wave succeeds; the second is blocked with "Completed worker cost is unknown; refusing further paid admission"; parent `cost_usd` stays unknown, never zero |
| D | `worker_memory_mb: 999999` | Refused before any worktree or launch: "Insufficient resource headroom to launch one worker within its memory cap" |

## Running it

```sh
npm run build
node scripts/smoke/resource-wave/run.mjs          # all four
node scripts/smoke/resource-wave/run.mjs A C      # a subset
UH_SMOKE_DEEP=1 node scripts/smoke/resource-wave/run.mjs B   # nest the project so the worker run directory is deep
```

Windows only: a memory cap requires the native Job guardian, and the team runner refuses it elsewhere. Set `UH_SMOKE_ROOT` to move the throwaway projects; keep it short. Projects are retained for inspection: the canonical facts are under `<project>/.harness/missions/wave/runs/<parent-run>/team-state.json`, and each worker's result under `.harness/missions/wave/team/artifacts/<parent-run>/workers/<worker>/`.

## What it does not prove

- Provider billing. The fixture's cost is a reported number; UH labels it `runtime_estimate`. Cost admission is a reservation control, not a charge cap.
- Model behaviour. The fixture never reads the prompt.
- Deep project paths, unless run with `UH_SMOKE_DEEP=1`. That mode nests the project so the worker run directory exceeds the classic Windows path limit; it is the regression check for the guardian executable location and for the guardian's own extended-length path handling.

