# S03: Outcomes, bounded sources, and hardening

Status: deferred. The MVP renders explicit metric and Pareto abstentions; it does not fabricate a
cohort, add unverified adapters, or claim this hardening slice complete.

## Goal

Add honest outcome metrics, task-shape comparison, and the smallest bounded set of verified local
sources, then close privacy, accessibility, performance, and operational QA.

## Changes

- Compute metrics in the UH projector with typed unit, window, formula version, method, confidence,
  source references, and missing-data reason.
- Add semantic outcome tables and dependency-free SVG only where the relation is materially easier
  to understand visually.
- Compute Pareto frontiers only inside an approved comparable cohort; list exclusions and abstain
  when the cohort is insufficient.
- Add the repo-local Codex coordination adapter only after its installed schema passes conformance.
  It exposes bounded active-claim metadata and never paths, archives, prompts, transcripts,
  reasoning, commentary, or tool output.
- Add a strict versioned snapshot importer for Telar, SpecSafe, OMP, Codex app state, and other
  sources without verified live APIs. Snapshots are contained, symlink-safe, timestamped, immutable,
  and visibly labeled.
- Keep Orca and Paperclip unsupported or snapshot-only until a documented authorized interface is
  verified. Prism Arena remains historical task-shape evidence, never current work.

## Metric rules

- Cost per accepted outcome, tokens, latency, rework, detected/escaped errors, acceptance, and
  quality/cost/time appear only with a verified numerator, denominator, unit, and window.
- DORA and product metrics remain unknown until authoritative deployment and product sources exist.
- Measured and estimated values are visually and structurally distinct.
- The comparability key includes task-shape/version, scope, risk, context regime, tool regime,
  evaluator/rubric, currency/price source, and window.
- No universal score, route winner, or all-against-all leaderboard.

## Tests

- Metrics cover zero versus unknown, missing denominators, mixed methods, stale sources, currency,
  incompatible windows, and confidence.
- Pareto covers dominance, ties, incomplete candidates, incompatible cohorts, exclusion counts,
  and insufficient-data abstention; every chart has an equivalent accessible table.
- Snapshot import covers expiry, wrong version/project/kind, symlink escape, tampering, oversize,
  fixture mixing, and snapshot falsely claiming live transport.
- Claim-board conformance proves cross-project notices are rejected and no transcript-like data is
  serialized.
- Measure projection and bundle performance from reproducible fixtures before setting thresholds;
  do not invent an SLA without a baseline.

## Playable checkpoint

A real local UH source and any approved snapshots show their exact transport, as-of time, freshness,
coverage, and limitations. A comparable cohort produces an explainable frontier; incompatible or
insufficient data produces an explicit refusal rather than a chart-shaped guess.

## Exit gate

Run all repository gates, desktop/tablet/mobile and 200% zoom screenshots, VoiceOver, keyboard,
contrast, reduced-motion, system-state, detector, finish-reviewer, documenter, and unprimed human
review. The handoff records real sources, unsupported sources, measured limits, and how to run the
local dashboard without publishing or deploying it.
