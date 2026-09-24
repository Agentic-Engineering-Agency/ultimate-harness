# Worker-contract smoke

Exercises team contract derivation, route overrides, turn limits and output verification through the built CLI with deterministic fixtures. See [runtime targets](../runtime-targets.md) and the [mission schema](../architecture/mission-packet-schema.md). This procedure does not establish live-provider acceptance.

## What it runs

`scripts/smoke/worker-contract/run.mjs` creates a throwaway git project under a temporary directory, registers the `oh-my-pi` adapter pointing `cli_command` to `scripts/smoke/resource-wave/fake-omp.mjs`, writes a two-worker team mission `contract`, and runs `uh mission run-team contract --retain`.

The mission defines separate worker contracts:
- `alpha`: assigned role `alpha`, objective `Produce alpha's answer`, runtime model override `fixture/model-a`, turn limit `max_turns: 3`, and declared expected output file `out/answer-alpha.txt`.
- `beta`: assigned role `beta`, runtime model override `fixture/model-b`, turn limit `max_turns: 7`, and declared expected output file `out/report.md`.
- `leader`: mechanical integrator using `oh-my-pi`.
- `verification`: a noop required check that exits with code 0.

The mock runner simulates execution by parsing its working directory name, writing `out/answer-<worker>.txt`, attesting the requested model route, and emitting runtime usage.

| Entity | Role / Target | Expected canonical outcome |
| --- | --- | --- |
| `alpha` | Worker | Succeeded; output `out/answer-alpha.txt` passed verification; attested model `model-a`; turn limit recorded as `max_turns: 3`. |
| `beta` | Worker | Blocked; declared output `out/report.md` missing (`Declared output out/report.md: Declared output is missing, unreadable, or outside the workspace`); attested model `model-b`; turn limit recorded as `max_turns: 7`. |
| `leader` | Mechanical lead | Merges `alpha` cleanly; skips `beta` due to `blocked` status; verification checks pass. |
| `team` | Mission run | Overall status `passed_partial`; process exit code `0`. |

## Running it

```sh
npm run build
node scripts/smoke/worker-contract/run.mjs
```

The throwaway project is retained at `<temp>/uh-worker-contract` for inspection:
- Canonical team state: `<project>/.harness/missions/contract/runs/<parent-run>/team-state.json`
- Worker artifact roots: `<project>/.harness/missions/contract/team/artifacts/<parent-run>/workers/<worker>/`
- Worker derived packets: `<artifact_scope>/.harness/missions/contract/mission.yaml`
- Worker runtime results: `<artifact_scope>/.harness/missions/contract/runs/<worker-run>/runtime-result.yaml`

## What it does not prove

- Model intelligence or prompt compliance. The fixture emits deterministic responses and does not invoke an LLM.
- Provider billing or network transport. Attested routes and token usages are simulated by the fixture.
- Complex git merge conflict resolution. The smoke exercises clean branch merging for the surviving worker and excludes the blocked worker.
