# Delivery Observatory

Status: local MVP implemented on 2026-08-23; visual finish gate waiting for BrowserOS Neo.

## Outcome

Add a read-only operational Observatory to the existing Hermes plugin so a local operator can
understand active agentic work, attention, evidence, route facts, cost, latency, and quality without
opening private chats or raw producer records.

Ultimate Harness remains the only Run Control. The Observatory is a disposable projection, not a
ledger or controller. Telar retains intent, route policy, normalized-ledger semantics, and human
authority; SpecSafe retains repository-local assurance; OMP Pantheon remains an execution adapter;
Impeccable remains the design adapter.

The normative projection is [Delivery Observatory Contract v1](../../docs/architecture/delivery-observatory-contract.md).

## Verified starting point

- The chosen home is `apps/hermes-plugin/dashboard`, reusing its FastAPI, TypeScript, React host,
  polling, SSE, theme tokens, and tests. No new dependency is approved or required.
- Existing Prompt, Events, Compare, mission, and run-result payloads contain raw bodies or locators.
  The Observatory must not consume or re-export them.
- A runtime result of `passed` is not a verification receipt, and a `running` pointer is not proof
  of process liveness. The projection keeps both states uncertain unless evidence exists.
- The current checkout has no canonical current run set to present as live data. Empty and unknown
  are valid initial states; fixtures may appear only in an explicitly watermarked QA mode.
- Telar, SpecSafe, and OMP integration contracts are planning evidence or snapshots until their
  machine interfaces are implemented and approved.
- Prism Arena is a design and task-shape reference only. No code is copied from it.

## Slice graph

```text
S01 safe contract and projection
        |
        v
S02 usable operator Observatory
        |
        v
S03 outcomes, bounded sources, and hardening
```

Each slice is independently playable and remains read-only.

| Slice | Playable checkpoint | Human gate |
|---|---|---|
| [S01](S01-safe-contract-and-projection.md) | `uh observatory snapshot --json` produces an honest, path-free snapshot from verified UH artifacts | Contract, privacy, and authority review |
| [S02](S02-operator-observatory.md) | Now, timeline, agents, decisions, evidence, filters, and meeting mode operate from one safe snapshot | Approved visual composition and operator walkthrough |
| [S03](S03-outcomes-sources-and-hardening.md) | Metrics and Pareto abstain honestly; bounded real sources and snapshots show freshness and limitations | Source-owner, accessibility, privacy, and launch review |

## Approved synthesis

The selected direction is **Briefing Reel**: one Delivery Observatory inside the existing Hermes
shell. The three approved compositions are not separate products; they are task-focused projections
of one contract and one selected state.

1. **Operate / work first:** active work is the primary task. It owns the compact work table and
   selected-work summary.
2. **Review / decisions first:** questions, gates, scope changes, and tradeoffs are primary. It is
   strictly read-only and links to Telar or the real authority.
3. **Observe / evidence first:** the Evidence Reel, evidence metadata, outcomes, DORA, and
   task-shape Pareto analysis are primary.

The shell, filters, selected work, epistemic/freshness vocabulary, and snapshot store are shared.
Tables, metrics, inspectors, and controls have one owner and are not duplicated across views.
Learn and Configure retain their existing navigation and remain outside this slice. The internal
module boundary permits future role presets through named slots, but the MVP exposes no freeform
widget canvas or layout configuration. See
[Decision 001](decision-001-approved-view-synthesis.md).

## Locked rules

- Projection and Observatory routes are GET/read-only; no dispatch, cancellation, approval,
  promotion, or producer repair.
- Only a UH projector parses native artifacts. The Python layer transports validated public CLI
  output; the UI renders one snapshot store and never reconstructs truth.
- Unknown values are tagged and cannot become zero, idle, success, verified, or a copy of the
  requested route.
- Evidence v1 is metadata-only: bounded title, opaque ID, digest, classification, availability, and
  timestamps. No paths or bodies.
- Actual route facts are shown only when reported by the execution adapter.
- Timeline ordering retains source-local sequence and does not claim a global causal order.
- Meeting mode is a read-only presentation over the same validated snapshot, not a second truth or
  a CSS concealment layer.
- Fixture mode carries a permanent `DEMO FIXTURE - NOT LIVE` label and cannot auto-refresh.
- Comparable cohorts declare task-shape version, risk, context regime, tool regime, rubric, price
  source, and window. Incomparable or insufficient data causes abstention.

## Deferred decisions

1. Decide whether the no-raw-content rule should later retire the remaining legacy Prompt and
   Events surfaces. The MVP does not consume them; the unsafe Compare entry point was removed from
   current navigation while existing run deep links continue to open the safe drilldown.
2. Approve the safe-title policy. The conservative default is an opaque work ID plus a title that a
   source explicitly classifies for operator display; human names are excluded by default.
3. Approve source-specific staleness windows and valid process-liveness evidence. Until then, the
   UI displays source policy as unknown and never infers a live process.
4. Approve the task-shape comparability key and minimum cohort. Until then, Pareto visibly abstains.

## Required verification after implementation

- Root: `bun run typecheck` and `bun run test`.
- Plugin: `bun run plugin:build`, `bun run plugin:typecheck`, and `bun run plugin:test`.
- Existing React externalization and 50 KiB bundle gates remain green.
- Real local smoke plus screenshots at desktop, tablet, 390 px mobile, and 200% zoom.
- Keyboard, VoiceOver, reduced-motion, focus, contrast, long-label, empty, error, partial, blocked,
  stale, unknown, snapshot, Pareto-refusal, and Pareto-frontier reviews.
- Screenshot detector, finish reviewer, and documenter run only after the approved UI exists.
