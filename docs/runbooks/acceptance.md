# Acceptance evidence

Register one small mission per mechanism in `acceptance/registry.yaml`. Build the CLI, configure an installed adapter, and select a permitted model before running against a fresh workspace. The command below invokes live runtimes and can incur provider charges:

```text
node dist/cli.js acceptance run --all --workspace <fresh-workspace> --model <permitted-model>
```

Inspect results with `uh acceptance status --json`, then generate a local report with `uh acceptance report`. Canonical runtime artifacts are stored in the selected workspace; generated evidence is written under ignored `acceptance/evidence/<capability>/`. Keep execution records in private local or CI storage, not in the public source repository.

Evidence records include actual `fact_sources`; registry `expected.fact_sources` selects each field from the first or last sorted attempt and is not itself compared. A capability without fresh passing real-runtime evidence is **unproven**, whatever the test suite or fixture smoke says. A failed real run is retained as failed evidence; expectations must not be changed merely to make a run pass.

Run the campaign at one harness commit before evaluating freshness. The report drift check compares the registry and available local evidence with the generated report. A clean checkout ships no local execution records, so its report does not claim live proof. Fixture-only capabilities render `fixture_only` without real evidence; attempted fixture missions retain their actual outcome. Review any generated report before publication: local run identifiers, timestamps, paths, transcripts and account information are not public documentation.
