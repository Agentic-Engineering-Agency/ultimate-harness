# Acceptance missions

Acceptance missions measure harness mechanisms against a real runtime, not model creativity. Every mission follows these rules:

- State one exact, small action with an exact file and exact content; avoid vague design objectives.
- Use the lightest initialized workflow profile (`bugfix-contained`) rather than `spec-first-feature`.
- Team missions use `verification.required_checks` with the `noop` check (`node -e "process.exit(0)"`), `sandbox.backend: git-worktree`, and `promotion_policy: human-approved`.
- Use `max_turns: 12` for ordinary actions and `thinking: low` unless the mechanism under test requires otherwise.
- Tell workers not to run git or install packages, and keep files under `out/` except an explicitly named protected-path probe.
- Register structural expected outcomes only: statuses, stop codes, and canonical records, never model wording.
- Evidence records runtime-reported usage and cost with provenance. Missing cost remains unknown, even when token counters are available; a runtime estimate is not a provider invoice.

Run the registered missions with `uh acceptance run --all --workspace <fresh-dir>`, inspect `uh acceptance status --json`, and regenerate the report with `uh acceptance report`. A capability without fresh passing real-runtime evidence remains unproven regardless of tests or fixture smokes.

Operational rule: do not overlap an acceptance campaign with `npm run build` or any command that removes and recreates `dist/`; the campaign snapshots and preloads its runtime modules once at startup.

Mechanisms that cannot be observed through a real runtime are registered with `real_mission: not_applicable`, a reason, and state `fixture_only`; fixture smoke evidence is informational and never counted as proven or failed.

Registry entries include an inventory `capability` id; expected `fact_sources` is a selection instruction: each named field is read from the first or last sorted attempt. Evidence records retain the actual source used for each field; sources are informational and are never compared as outcome facts.

The report is generated from the registry and locally available evidence; the drift test compares `docs/acceptance/README.md` with a fresh render. The public repository contains reusable definitions and support fixtures, not local execution history. Generated evidence under `acceptance/evidence/` is ignored and belongs in private local or CI artifact storage. A clean checkout therefore reports no live proof until an authorized campaign is run. Run at one commit and regenerate the local report before assessing freshness. Do not commit run identities, transcripts, personal paths, or account data with a generated report.
