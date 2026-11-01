# Acceptance

Acceptance evidence is real-runtime evidence, separate from test and fixture status. One small mission per mechanism is registered in `acceptance/registry.yaml` (schema `uh.acceptance-registry.v0`); running a capability executes its mission for real and records what actually happened. Sources: `docs/runbooks/acceptance.md`, `acceptance/registry.yaml`, `src/harness/acceptance.ts`, `src/cli.ts`.

## The registry

Each registry entry declares:

- `title`, `capability`, `mission` (path to the mission file under `acceptance/missions/`), and `shape` (`single` or `team`);
- `runtime` and optionally `model` — registry-declared models mean no `--model` override is needed for those entries;
- `expected` — the facts a passing run must show (status, stop codes, worker states, declared outputs, required records, and `fact_sources` selectors described below);
- `freshness_days` — how long passing evidence stays fresh (30 days across the current registry);
- optional `support_shim` (a directory prepended to the child process PATH for that run only, recorded as `shim_on_path: true`), and `real_mission: not_applicable` with a `reason` for fixture-only mechanisms.

The registry's `expected.fact_sources` selects, per field, whether the expected fact is compared against the first or last sorted attempt of the run; it is not itself compared.

## Running one capability or the fleet campaign

Build the CLI, configure an installed adapter, and select a permitted model before running against a fresh workspace. `uh acceptance run` takes one capability at a time, so a campaign iterates the chosen runtime's entries against one fresh workspace. The command below invokes live runtimes and can incur provider charges:

```sh
# One capability.
uh acceptance run <capability> --workspace <fresh-workspace>

# Every registered capability.
uh acceptance run --all --workspace <fresh-workspace> --model <permitted-model>
```

Options: `--runtime` and `--model` override the registry runtime and model; `--keep` retains the run workspace. Each run materializes a snapshot of the harness under `<workspace>/.acceptance-runtime` (dist and src, plus a junction to the nearest `node_modules` found by walking up from the harness root). When no `node_modules` exists anywhere above the root, the run refuses loudly with exit `2` and names the searched path instead of spawning a snapshot CLI that dies on a missing module.

The live fleet campaign in this checkout targets the command-code fleet: every capability has a `command-code` registry entry — the seventeen `<capability>-cmdc` ports (model carried by the registry) plus the three `G1-cmdc-*` entries. The exact campaign command iterates those entries, one `uh acceptance run` per capability, against one fresh workspace; the entry notes flag the special cases (`R10-stall-cmdc` is fixture-only and prints `FIXTURE` without running, `G2-cmdc` hits its denial budget through real guard denials, and `S3-unknown-cost-cmdc` strips runtime usage so admission is refused on unknown cost).

## Inspecting results

```sh
# Classify evidence by freshness and outcome.
uh acceptance status --json

# Generate a local human-readable report.
uh acceptance report
```

Canonical runtime artifacts are stored in the selected workspace; generated evidence is written under ignored `acceptance/evidence/<capability>/`. Keep execution records in private local or CI storage, not in the public source repository. Review any generated report before publication: local run identifiers, timestamps, paths, transcripts and account information are not public documentation. Run the campaign at one harness commit before evaluating freshness; the committed-report drift check renders the report against an empty evidence root, so local campaign records never fail the check.

## Evidence records

Every evidence record includes actual `fact_sources`, the mission CLI outcome as `cli: { exit_code, stderr_tail, stdout_tail }`, and the run's outcome. A run that produced no observed status keeps that fact visible instead of fabricating `status: failed`, and its FAIL line ends with the first line of the CLI stderr so the cause is readable without hand-running the snapshot CLI.

When a capability fails, read the failed evidence and its artifact root first — run directories, the tool-guard log, `fact_sources` — before changing anything: expectations describe the mechanism, so a failure usually means the runner or the budget mis-modeled reality, not that the expectation should move. A failed real run is retained as failed evidence; expectations must not be changed merely to make a run pass.

## Freshness per commit

`uh acceptance status` classifies every capability by comparing its latest evidence with the current harness commit and the registry's `freshness_days`:

| State | Meaning |
|---|---|
| `unproven` | No evidence exists for the capability. |
| `failed` | The latest evidence records a failed outcome. |
| `stale` | The evidence was recorded at a different harness commit than the current one, or its age exceeds `freshness_days`. |
| `proven` | Fresh passing evidence at the current commit, within the freshness window. |
| `fixture_only` | A `real_mission: not_applicable` capability without evidence; attempted fixture missions retain their actual outcome. |

## What "proven" means

A capability without fresh passing real-runtime evidence is **unproven**, whatever the test suite or fixture smoke says. Proven means: a real run of the registered mission, on a real installed adapter, produced evidence matching the registry's expected facts, at the current harness commit, within the freshness window. A clean checkout ships no local execution records, so its report does not claim live proof.
