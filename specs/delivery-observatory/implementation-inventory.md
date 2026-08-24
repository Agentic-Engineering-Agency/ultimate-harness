# Delivery Observatory implementation inventory

Status: implemented inventory; visual finish gate pending.

## Primary tasks by view

- **Operate:** choose one current work item and understand its phase, route, elapsed time, blocker,
  last evidence, and human-attention state.
- **Review:** triage decisions, gates, and tradeoffs, then open the named authority. The Observatory
  never approves, rejects, or edits a decision.
- **Observe:** inspect the Evidence Reel and determine whether outcomes, DORA, and task-shape Pareto
  claims are supported by comparable, fresh evidence.

## Shared shell

- Product label, source-health/freshness strip, snapshot timestamp, meeting-mode toggle, and one
  compact filter rail.
- Operate, Review, and Observe retain the same selected work item and filters.
- One epistemic legend: observed, inferred, proposed, unknown; operation and freshness remain
  separate dimensions.
- Existing Learn and Configure navigation is not recreated or extended inside the plugin.

## Internal module slots

Slots are implementation seams, not user-configurable widgets.

| Slot | Owner | Module family |
|---|---|---|
| `primary` | active view | Now worklist / decision queue / Evidence Reel |
| `context` | shared selection | selected-work summary and safe route metadata |
| `supporting` | active view | role map / tradeoff summary / outcomes |
| `footer` | Observe or meeting | DORA, Pareto, source coverage |

No drag-and-drop, resize controls, widget catalog, saved layout, or duplicate renderer exists in
the MVP.

## Reused visual language

- Hermes SDK components and CSS variables; no new package or copied third-party code.
- Dark forge surfaces, orange operational accent, cool evidence accent, compact sans labels, mono
  identifiers, thin rules, and restrained notched geometry.
- Existing 30-second visibility-aware polling pattern, adapted to one snapshot request.

## Core interactions

- Native tabs, buttons, links, selects, and list selection with visible focus.
- Filters update one in-memory store; unavailable dimensions stay visible as unavailable.
- Review authority actions are ordinary links and say `Open in Telar` or `Open authority`; absent
  safe authority links render `Authority unavailable` without an inert control.
- Meeting mode orders progress, blockers, decisions, and evidence without changing source facts.
- Refresh failure retains the last good snapshot only after marking it stale or unavailable.

## Responsive and system states

- Desktop: compact rail plus one dominant column and one bounded context column.
- Mobile: tabs and filters remain reachable; modules stack in primary-task order; no horizontal
  table dependency.
- Explicit loading, error, empty, partial, blocked, stale, expired, unauthorized, snapshot, and
  unknown copy. Reduced motion disables automatic transitions and scrolling.

## Fidelity boundary

The approved work-first, decisions-first, and evidence-first concepts are synthesized into one
shell. They are not three dashboards and do not introduce a configurable canvas. A direction
contract is emitted at the plugin product root because the Hermes host, not this plugin, owns the
document body.
