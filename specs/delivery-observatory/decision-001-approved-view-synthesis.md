# Decision 001: Approved view synthesis

Date: 2026-08-23

Status: approved by the human operator.

## Decision

Build one Delivery Observatory inside the existing Hermes shell.

- Operate uses the work-first composition for current work and selected-work context.
- Review uses the decisions-first composition for questions, gates, scope changes, and tradeoffs.
  It is read-only and links to Telar or the authoritative system.
- Observe uses the evidence-first composition for the Evidence Reel, safe evidence metadata,
  outcomes, DORA, and same-task-shape Pareto analysis.
- Shell, filters, selected work, epistemic/freshness vocabulary, and contract snapshot are shared.
- Each table, metric family, inspector, and control has one owning view; other views summarize or
  link rather than duplicate it.
- Learn and Configure stay outside this implementation except for existing navigation.
- Internal named module slots may support future role presets. The MVP exposes no freeform canvas,
  widget catalog, drag-and-drop layout, or layout persistence.

## Consequences

The three concept images remain complementary fidelity references. No single image is implemented
as a separate dashboard. Backend normalization, source limitations, privacy rules, and selected
state remain identical across all three task views.

The legacy run-to-run compare renderer and control are retired because they expose raw
diff/event/result bodies and duplicate comparison semantics. Existing compare deep links degrade
to the selected run drilldown; the backend compatibility route remains unchanged. Observe owns
future comparison and only renders cohorts that satisfy the task-shape and Pareto contract.
