# Ultimate Harness

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the local operator of an agentic-engineering fleet. They need to understand
current work, decisions, evidence, risk, cost, latency, and quality without reconstructing state
from private chats or raw logs. A meeting mode supports a short progress and decision review with
collaborators while preserving the same evidence boundaries.

## Product Purpose

Ultimate Harness is the single Run Control that resolves and executes authorized routes across
runtime adapters. Its Delivery Observatory surface turns verified run-control facts and safe local
projections into an operational view of active work, human attention, evidence, and outcomes.
Success means the operator can tell what is happening, what is blocked, what is known, what is
stale, and what decision is needed from one local surface.

## Positioning

Ultimate Harness does not become the planning authority, assurance system, or execution adapter.
It remains Run Control while a versioned Delivery Observatory Contract lets the UI consume safe,
normalized observations from Telar policy and ledger projections, Ultimate Harness run artifacts,
SpecSafe assurance, OMP execution, and future verified adapters without coupling the UI to any one
producer.

## Operating Context

- Telar owns intent, planning, route policy, normalized ledger, and human gates.
- Ultimate Harness owns live route resolution and execution.
- SpecSafe owns repository-local planning, TDD, QA, and assurance evidence.
- OMP Pantheon is an Execution Adapter; Impeccable is a Design Adapter.
- The current local Hermes dashboard plugin already reads `.harness/` artifacts, polls status, and
  tails run events over SSE.
- Repo-local Codex coordination claims are a bounded, read-only source of active-work metadata.
- Sources without a verified live API enter through timestamped snapshots and must be visibly
  marked as snapshots.

## Capabilities and Constraints

- Show active work, phase, owner or agent, actual route when observed, elapsed time, blockers,
  evidence, and human attention.
- Support a unified timeline, role map, decision inbox, safe evidence, outcome metrics,
  task-shape comparison, Pareto analysis, filters, and meeting mode.
- Present them through one Hermes shell: Operate is work-first, Review is decisions-first and
  read-only, and Observe is evidence-first. Learn and Configure remain outside the Observatory MVP.
- Keep modules composable behind named internal slots for future role presets without exposing a
  freeform widget canvas or layout configurator in v1.
- Distinguish `observed`, `inferred`, `proposed`, `blocked`, `stale`, and `unknown`; zero is never
  substituted for unknown.
- Every attempt may record requested and actual model, provider, version, fallback, reasoning
  effort, included and excluded context references, cost, token usage, and latency.
- Never expose secrets, prompt bodies, private conversations, raw logs, personal filesystem paths,
  credentials, or confidential source content.
- Fixtures and synthetic demonstrations are never presented as current data.
- The first implementation reuses the existing Hermes plugin stack and dependencies. A new
  dependency, migration, deployment, publication, or irreversible decision requires approval.

## Brand Commitments

Preserve the existing Ultimate Harness workbench identity and terminology: a dark forge palette,
orange operational accent, cool evidence text, compact sans and mono typography, notched geometry,
and familiar control affordances. The product is an operator instrument, not a marketing page.

## Evidence on Hand

- Existing Hermes plugin views, polling, SSE, mission and run drilldown, verification views, and
  local Python API under `apps/hermes-plugin/dashboard/`.
- Versioned `.harness/` project, adapter, mission, workflow, sandbox, audit, and run contracts.
- Telar ADRs and architecture documents describing the policy, route-resolution, attempt, and
  normalized-ledger boundaries.
- SpecSafe assurance workflow documents and OMP Pantheon adapter contracts.
- Prism Arena's local task-shape comparison and blind-review patterns as product reference only;
  no code is copied.
- There is no verified public Codex, Orca, or Paperclip streaming API in this repository. Their
  first safe integration is therefore snapshot-only until a supported API is verified.

## Product Principles

1. Evidence before status language.
2. One Run Control, several bounded adapters, no shadow controller.
3. Freshness and provenance stay visible at the point of use.
4. Human attention is a first-class queue, not an annotation hidden in logs.
5. Compare routes only inside comparable task shapes and show tradeoffs, not a universal winner.

## Accessibility & Inclusion

The surface must be keyboard-operable, responsive on desktop and mobile, respect reduced motion,
and provide explicit loading, error, empty, stale, blocked, and unknown states without relying on
color alone.
