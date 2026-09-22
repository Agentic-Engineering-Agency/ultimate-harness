# Acceptance evidence

Register one small mission per mechanism in `acceptance/registry.yaml`. Build the CLI, configure an installed adapter, and select a permitted model before running against a fresh workspace. The command below invokes live runtimes and can incur provider charges:

```text
node dist/cli.js acceptance run --all --workspace <fresh-workspace> --model <permitted-model>
```

## Command Code fleet campaign

The oh-my-pi runtime has no usable model on this machine, so the live campaign runs on the command-code fleet. Every capability has a `command-code` registry entry: the 17 `<id>-cmdc` ports (model `qwen/qwen3.8-flash`, carried by the registry, so no `--model` override is needed) plus the three `G1-cmdc-*` entries. `uh acceptance run` takes one capability at a time, so the exact campaign command iterates the command-code entries against one fresh workspace. `cmdc` must resolve on `PATH` first (the hook-broken probe resolves the `acceptance/support/cmdc.cmd` shim; see the registry notes). The command below invokes live runtimes and can incur provider charges:

```sh
for capability in C1-cmdc S1-cmdc S2-cmdc S3-cmdc G2-cmdc R5-cmdc policy-cmdc R10-stall-cmdc R10-controller-loss-cmdc R7-turn-cap-cmdc R7-repeated-failure-cmdc C1-missing-output-cmdc S3-budget-exhausted-cmdc S3-unknown-cost-cmdc R5-deep-path-cmdc X1-paths-cmdc R11-deadline-grace-cmdc G1-cmdc-guard G1-cmdc-shell-policy G1-cmdc-hook-broken; do
  node dist/cli.js acceptance run "$capability" --workspace <fresh-workspace>
done
```

`R10-stall-cmdc` is fixture-only and prints `FIXTURE` without running; `G2-cmdc` hits its denial budget through real guard denials, and `S3-unknown-cost-cmdc` strips runtime usage through `acceptance/support/costless-wrapper-cmdc.mjs` so admission is refused on unknown cost.

Inspect results with `uh acceptance status --json`, then generate a local report with `uh acceptance report`. Canonical runtime artifacts are stored in the selected workspace; generated evidence is written under ignored `acceptance/evidence/<capability>/`. Keep execution records in private local or CI storage, not in the public source repository.

Evidence records include actual `fact_sources`; registry `expected.fact_sources` selects each field from the first or last sorted attempt and is not itself compared. A capability without fresh passing real-runtime evidence is **unproven**, whatever the test suite or fixture smoke says. A failed real run is retained as failed evidence; expectations must not be changed merely to make a run pass.

Run the campaign at one harness commit before evaluating freshness. The report drift check compares the registry and available local evidence with the generated report. A clean checkout ships no local execution records, so its report does not claim live proof. Fixture-only capabilities render `fixture_only` without real evidence; attempted fixture missions retain their actual outcome. Review any generated report before publication: local run identifiers, timestamps, paths, transcripts and account information are not public documentation.

## Support shims and failed evidence

Registry entries may declare `support_shim` (for example `cmdc.cmd` on the hook-broken probe): the runner prepends the copied `acceptance/support` directory to the child process PATH for that run only, records `shim_on_path: true` in the evidence, and every other capability keeps the untouched parent PATH. When a capability fails, read the failed evidence and its artifact root first — run directories, the tool-guard log, `fact_sources` — before changing anything: expectations describe the mechanism, so a failure usually means the runner or the budget mis-modeled reality (for example a turn budget exhausted by exploratory tool calls), not that the expectation should move.
