---
title: Observability and cost
description: How UH records what runs did, what they cost, and how to compare runtimes honestly.
---

## Per-run facts

Every run leaves `events.ndjson`, `run-digest.json`, `runtime-result.yaml` and `diff.patch`. `uh report <run-id>` (v0.11) turns them into a disk-only report with no model call: tools used, files written, denials, loop signals and efficiency.

## Cost, with provenance

- **Forecast.** `uh adapter cost-forecast` estimates a mission's token cost from the `COST_CLASSES` rates in `cost-forecast.ts`.
- **Actual.** `runtime-accounting.ts#resolveRunCost` resolves each run's cost as `reported` (the runtime said so), `estimated` (token counts times `.harness/prices.yaml`), or **unknown**, with the reason. Unknown is never counted as zero; incomplete token counters are never priced; a missing or malformed price table prices nothing. Team budget admission treats `estimated` like `reported`.

## Delivery observatory

`uh observatory` (`src/harness/delivery-observatory/`) projects the run store into views without persisting new state:

| Command | What it does |
|---|---|
| `observatory snapshot` | a `delivery-observatory.v1` snapshot for dashboards (the Hermes plugin reads it) |
| `observatory runs [--mission] [--group-by runtime|model|workflow|stop-code]` | the experience store: settled runs grouped, with a success-rate versus cost Pareto frontier (v0.11) |
| `observatory compare` | two run arms compared with Wilson score intervals and cost per success, without pretending unpriced runs are free (v0.11) |
| `observatory export <mission> --otlp` | one run as OTLP/JSON with the GenAI semantic conventions (`invoke_agent`, `chat`, `execute_tool`). Tool arguments, results, messages and prompts are never exported (v0.11) |

`uh experiment plan | run | report` (v0.11) runs seeded, held-out comparisons of templates or runtimes under a matched budget.

`otlp-push.ts#pushOtlpTraces` (push to an OTLP HTTP endpoint) exists with bounded retries, but no command calls it yet.

## Product telemetry

Off by default. Enabled only with `UH_TELEMETRY=posthog` and `UH_POSTHOG_API_KEY`. It may send only a sanitized command name, status, exit code, duration, package version and platform: never paths, prompts, model output or secrets. Delivery is a detached beacon process (`telemetry-beacon.ts`) that refuses private endpoints, so telemetry never delays or fails a command. See [telemetry](/source/docs/telemetry/).

## Acceptance campaign (v0.11)

`acceptance/registry.yaml` lists 37 capability checks, each paired between the oh-my-pi and Command Code fleets (`<id>-cmdc`), plus guard probes. `uh acceptance run` executes them for real against a runtime; evidence is written to the gitignored `acceptance/evidence/`, bound to an input digest so stale evidence is detected; `uh acceptance report` renders `docs/acceptance/README.md`.

As of 2026-09-23 no capability has live evidence recorded in the repository (33 unproven, 3 fixture-only). Producing that evidence is a [1.0 criterion](/release/plan/#phase-4-100).
