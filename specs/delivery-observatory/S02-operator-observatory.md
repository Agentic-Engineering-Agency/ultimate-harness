# S02: Usable operator Observatory

Status: implemented locally; desktop/mobile visual QA and finish review are waiting for the required
BrowserOS Neo connector.

## Goal

Render the approved Briefing Reel synthesis in Hermes so the operator can move between operation,
review, and evidence without losing filters, selection, provenance, or freshness.

## Changes

- Add one safe `GET /observatory/snapshot` endpoint that invokes the public UH CLI with timeout,
  output-size, contract-version, and safe-error guards.
- Optionally add a safe invalidation stream that carries snapshot identity and capture time only;
  reconnect always refetches the authoritative snapshot.
- Add one frontend snapshot store for data, filters, selection, refresh status, last success, and
  meeting mode.
- Extend the existing Operate, Review, and Observe navigation rather than adding a second tab system.
  Operate owns Now and the selected-work/role summary; Review owns the read-only decision queue,
  gates, and tradeoffs; Observe owns the Evidence Reel, evidence metadata, outcomes, DORA, and
  task-shape Pareto view.
- Share shell, filters, selected work, state vocabulary, source freshness, and one snapshot store.
  Views do no metric calculation or producer inference.
- Define named internal module slots for future role presets, but expose no freeform canvas,
  drag-and-drop layout, widget catalog, or per-user layout configuration.
- Implement meeting mode as a read-only Now -> progress -> blockers -> decisions -> evidence
  presentation over the same validated snapshot. It never conceals facts or creates a second truth.
- Retain data after a refresh failure only when it is visibly reclassified stale or unavailable.

## Interaction and state requirements

- Filters cover project, scope, agent, family/model, harness, operation, truth, freshness, risk, and
  date without hiding unavailable-source limitations.
- Decision items are read-only in v1; action labels explain where authority lives.
- A table, metric family, inspector, or control appears in only its owning view. Other views link or
  summarize instead of copying it.
- Loading, error, empty, partial, blocked, stale, expired, unauthorized, snapshot, and unknown each
  have explicit text and recovery guidance.
- Status never relies on color alone. Tables and lists use native semantic controls, not clickable
  rows or `div` buttons.
- Live announcements are summarized, rate-limited, and pausable. Reduced motion disables automatic
  spatial movement.

## Tests

- Backend tests use a fake public UH CLI and cover malformed JSON, incompatible versions, safe
  errors, and successful contract transport. Timeout and oversized-output guards are implemented;
  transport caching remains an S03 hardening item.
- Projector tests cover valid projection, private-metadata refusal, and honest empty/unknown output.
- Store and component coverage beyond the compiled/typechecked MVP remains an S03 hardening item.
- The Observatory never calls run, cancel, verify, promote, prompt, raw-event, result-body, or
  compare-body routes.

## Playable checkpoint

Start a local UH run or load a timestamped real snapshot. The Observatory updates phase, blocker,
last safe evidence, and attention without opening raw data. A repository with no current runs shows
an honest empty/unknown state. QA fixtures show a permanent `DEMO FIXTURE - NOT LIVE` banner.

## Exit gate

The synthesized desktop composition, mobile adaptation, meeting flow, and primary system states
pass an operator walkthrough before additional sources are added.
