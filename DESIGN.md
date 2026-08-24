---
name: Ultimate Harness Delivery Observatory
description: A dark-forge operator instrument for moving from current work to authority to safe evidence.
colors:
  forge-bg: "#0e0f17"
  panel: "#151823"
  panel-raised: "#1a1e2b"
  source-surface: "#11141d"
  state-surface: "#11131c"
  line: "#303546"
  line-soft: "#242938"
  text: "#f4f6fb"
  muted: "#aeb7ca"
  evidence: "#d4e2ff"
  operational: "#ff8a40"
  operational-ink: "#16110e"
  operational-soft: "#2a1c18"
  attention: "#ffd1ab"
  success: "#8ed8ad"
  error: "#ffaaa1"
  stale-surface: "#241b16"
  error-surface: "#241717"
typography:
  display:
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "42px"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-sans, Inter, ui-sans-serif, system-ui, sans-serif)"
    fontSize: "10px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.06em"
  mono:
    fontFamily: "var(--font-mono, ui-monospace, monospace)"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  control: "8px"
  callout: "10px"
  state: "12px"
  shell: "14px"
  pill: "999px"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  2xl: "30px"
components:
  observatory-shell:
    backgroundColor: "{colors.forge-bg}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.shell}"
    padding: "clamp(14px, 2vw, 24px)"
  button-outline:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    height: "38px"
  button-meeting-active:
    backgroundColor: "{colors.operational}"
    textColor: "{colors.operational-ink}"
    typography: "{typography.label}"
    height: "38px"
  filter-select:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "6px 28px 6px 8px"
    height: "36px"
  view-tab-selected:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    padding: "11px 14px"
    height: "58px"
  work-item-selected:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "11px 12px"
    height: "68px"
  notched-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "18px"
  attention-callout:
    backgroundColor: "{colors.operational-soft}"
    textColor: "{colors.attention}"
    rounded: "{rounded.callout}"
    padding: "11px 12px"
  system-state:
    backgroundColor: "{colors.state-surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.state}"
    padding: "20px"
---

# Design System: Ultimate Harness Delivery Observatory

## Overview

**Creative North Star: "The Briefing Reel"**

The Delivery Observatory is a compact operator instrument inside Hermes: one selected thread moves
from current work, to the authority that owns a decision, to the evidence that supports an outcome.
It is dense enough for operational review but quiet enough that uncertainty, freshness, and human
attention remain legible. It must never drift into a marketing page, a generic analytics dashboard,
or a second Run Control.

The approved work-first, decisions-first, and evidence-first concept images under
`.impeccable/mocks/` are complementary direction references, not three products and not a shipped
feature inventory. The delivered synthesis is defined by
[`DeliveryObservatory.tsx`](apps/hermes-plugin/dashboard/src/DeliveryObservatory.tsx), the shared
state in [`observatory-store.ts`](apps/hermes-plugin/dashboard/src/observatory-store.ts), and the
Observatory-specific rules in
[`styles.css`](apps/hermes-plugin/dashboard/src/styles.css). The product boundary and rationale live
in [`PRODUCT.md`](PRODUCT.md), the approved-view decision in
[`specs/delivery-observatory/decision-001-approved-view-synthesis.md`](specs/delivery-observatory/decision-001-approved-view-synthesis.md),
and the data semantics in
[`docs/architecture/delivery-observatory-contract.md`](docs/architecture/delivery-observatory-contract.md).

**The Host-and-Instrument Rule.** Hermes owns the outer application shell, sidebar, plugin heading,
active theme, and SDK controls. The Observatory owns only the scoped `.uh-do-*` instrument beginning
at the Delivery Observatory block in `apps/hermes-plugin/dashboard/src/styles.css`. Generic `.uh-*`
styles earlier in that file belong to existing plugin surfaces; they are not Observatory tokens.
Continue to use Hermes `UI.Button` and the host-provided `--font-sans` and `--font-mono` variables.
Do not copy the outer Hermes chrome or freeze a font seen in one host screenshot into the plugin.

**The One-Thread Rule.** Operate is work-first, Review is decisions-first and strictly read-only,
and Observe is evidence-first. Filters and the selected work item remain stable while the view
changes. Each record family has one primary renderer; another view may summarize or count it, but
must not duplicate its table, inspector, metric family, or controls.

**The Fixed-Composition Rule.** The implementation may expose the named internal slots `primary`,
`context`, `supporting`, and `footer` to code. They are seams for future role presets, not widgets.
A preset may reorder approved modules while preserving ownership, store, semantics, and responsive
order. It must never introduce a freeform canvas, drag-and-drop, resize controls, a widget catalog,
saved layouts, or a user-authored query surface.

**Key Characteristics:**

- Shared Hermes shell with one scoped dark-forge work surface.
- Operate / work, Review / decisions, Observe / evidence, with retained selection.
- Orange for operational attention; cool ice for evidence and focus.
- Thin rules, tonal layering, restrained notched geometry, and almost no shadow.
- Explicit provenance, source health, coverage, redaction, freshness, and unknown values.
- Responsive structure rather than fluid product typography or a configurable canvas.

## Colors

The palette is a restrained dark forge: near-black working space, cool slate structure, pale text,
ice evidence, and a scarce orange operational signal. The YAML tokens above are normative.

### Primary

- **Operational Orange** (`operational`) marks the selected tab underline, loading pulse, Evidence
  Reel markers, authority links, and active meeting control. It signals action or attention; it is
  never background decoration.
- **Operational Ember** (`operational-soft`) is the low-chroma background for blockers, read-only
  authority notices, and attention callouts. Pair it with `attention`, not generic gray text.

### Secondary

- **Evidence Ice** (`evidence`) identifies source facts, counts, focus outlines, and observed
  evidence. It is informational and must not be confused with an operation state.
- **Verified Green** (`success`) and **Failure Coral** (`error`) support explicit success/failure
  labels. The words and semantic control remain mandatory; color never carries state alone.

### Neutral

- **Forge Background** (`forge-bg`) is the Observatory workspace.
- **Panel** and **Raised Panel** (`panel`, `panel-raised`) separate bounded context and selection
  without card-grid decoration.
- **Source Surface** and **State Surface** (`source-surface`, `state-surface`) distinguish provenance
  and system messages from work content.
- **Primary Text** and **Muted Text** (`text`, `muted`) create the compact reading hierarchy.
- **Structural Rule** and **Soft Rule** (`line`, `line-soft`) organize the interface with one-pixel
  boundaries.
- **Stale Surface** and **Error Surface** (`stale-surface`, `error-surface`) reclassify degraded data
  visibly without pretending that stale and failed mean the same thing.

**The Scarce Orange Rule.** Orange is reserved for selected state, operational attention, and the
path through evidence. If orange is carrying decoration or several inactive modules at once, the
screen has lost its hierarchy.

**The Orthogonal State Rule.** Assertion (`observed`, `inferred`, `proposed`, `unknown`), operation
(`queued`, `active`, `blocked`, `awaiting_human`, `succeeded`, `failed`, `cancelled`, `uncertain`,
`unknown`), freshness (`fresh`, `stale`, `expired`, `unknown`), and source health (`reachable`,
`degraded`, `unavailable`, `unauthorized`) are independent. `blocked` is not epistemic, `stale` is
not failure, and `unknown` is never painted as zero, idle, false, success, or verified.

## Typography

- **Display Font:** host `--font-sans`, with Inter / UI sans / system sans fallbacks.
- **Body Font:** host `--font-sans`, with Inter / UI sans / system sans fallbacks.
- **Label/Mono Font:** host `--font-mono`, with UI monospace / monospace fallbacks.

**Character:** The Observatory supplies a compact type scale and delegates family selection to the
Hermes theme. The final captures may render the host sans variable with a more editorial face; that
rendering is host-owned. Data, timestamps, elapsed time, and compact counts use mono so operational
facts remain easy to scan.

### Hierarchy

- **Display** (700, `42px`, `0.96`, `-0.03em`) is reserved for “Delivery Observatory”; at the mobile
  breakpoint it becomes `30px`.
- **Headline** (700, `28px`, `1.05`, `-0.025em`) names the owning task region; it becomes `22px` on
  narrow screens.
- **Title** (700, `15px`, `1.35`) names work items, decisions, receipts, and bounded panels.
- **Body** (400, `12px`, `1.5`) carries explanations and recovery guidance. Explanatory prose stays
  within `68ch`; decision questions stay within `65ch`.
- **Label** (650, `10px`, `0.06em`) is the limited uppercase vocabulary for filter labels and compact
  controls. Do not add an eyebrow above every section.
- **Mono** (400, `11px`, `1.2`) carries timestamps, elapsed values, counts, and identifiers—not
  paragraphs or authority questions.

**The Host Typeface Rule.** Preserve the CSS variable boundary. A future screen may tune sizes and
weights within this scale, but it must not add a display font dependency or hardcode the current
Hermes theme's resolved family.

**The Instrument Label Rule.** Use uppercase tracking only where the interface behaves like an
instrument label. Headings and prose remain sentence case; statuses remain lowercase literal
vocabulary.

## Elevation

The Observatory is flat by default. Depth comes from adjacent tones, one-pixel rules, selection
fill, and a clipped corner—not from stacks of floating cards. The outer `.uh-do-root` alone uses the
existing shell separation shadow (`0 16px 42px rgba(0, 0, 0, 0.26)`) with its `1px` boundary. Child
modules carry no drop shadow.

### Shadow Vocabulary

- **Host separation** (`0 16px 42px rgba(0, 0, 0, 0.26)`): only the complete Observatory surface may
  use it to sit within the larger Hermes application.
- **Selected work inset** (`inset 1px 0 0 #ff8a40`): a narrow, structural marker paired with selected
  fill and `aria-pressed`; it is not a decorative side stripe.

**The Flat-Within Rule.** Never apply the root shadow to a context panel, decision, metric, receipt,
or empty state. If a child needs hierarchy, change its tone or boundary before adding elevation.

**The Notch Rule.** Context, receipts, and decisions may use the restrained clipped top-right corner
defined in `apps/hermes-plugin/dashboard/src/styles.css`. The desktop cuts are `14px` for context and
evidence and `10px` for decisions. Below `840px`, remove the clip so stacked modules remain simple
and robust.

## Components

Components are familiar product controls with a shared focus treatment. Every button, select, and
link inside the Observatory uses a `2px` Evidence Ice focus outline with a `3px` offset. The
implementation in `apps/hermes-plugin/dashboard/src/DeliveryObservatory.tsx` is the semantic source
of truth; styles must not turn non-interactive containers into controls.

### Shared shell and source strip

The header pairs the product title with host `UI.Button` controls for Refresh and Meeting mode.
Refresh exposes its refreshing label and disabled state. Meeting mode is a toggle with
`aria-pressed`; its active form uses Operational Orange. The source strip always keeps transport,
health, freshness, observed time, redaction count, and coverage at the point of use. A timestamped
snapshot must say “Timestamped snapshot”; a refresh failure must mark retained data stale.

### Filters

Use native `select` controls in one horizontally scrollable rail. Project, operation, and risk are
the delivered active dimensions. Unavailable dimensions stay visible and disabled with explanatory
screen-reader text; they do not disappear or imply support. Desktop controls are `36px` high and
mobile controls are at least `44px` high.

### View tabs and selection

Operate, Review, and Observe form one `tablist`. The active tab alone has `tabIndex=0`; Left and
Right Arrow move focus and selection with wraparound. The active panel is labelled by its tab and is
itself focusable. Work items are real buttons in a list, use `aria-pressed`, preserve selection
through the shared store, and reduce from four visual columns to two on narrow screens.

### Task-owned modules

| View | Primary module | Supporting contract |
|---|---|---|
| Operate | Current work list | Selected-work safe route facts and role summary |
| Review | Human decision queue | Read-only authority notice and selected-work context |
| Observe | Evidence Reel | Receipt metadata and honest outcome/compare abstention |

Review never provides approve, reject, or scope-change controls. It may offer an ordinary link to
Telar or the named authority when the contract supplies one; otherwise it renders unavailable text,
not an inert button. Observe shows evidence metadata only and never opens an artifact body.

### Pills, stamps, and rules

Operation pills and epistemic/freshness stamps use a compact `999px` capsule with literal text.
The Evidence Reel uses a one-pixel vertical rule and orange outlined markers; its ordering is a
display order and must not be described as global causal truth. Metrics use a joined ruled grid, not
independent statistic cards, and remain “Unknown” until a verified comparable source reports them.

### Meeting mode

Meeting mode is a read-only projection of the same validated snapshot. It removes the view tablist
and presents Progress as the dominant region beside Blockers, Decisions, and Evidence. It may count
or summarize owned records but must not create a second store, hide facts with CSS, or introduce
meeting-only truth. “Exit meeting” is the only mode-changing control.

### System states

- **Loading:** announce “Reading the safe local projection…” with `role=status` and the orange pulse.
- **Initial unavailable/error:** state that delivery data is unavailable, no fixture was substituted,
  and the authorized local source must be started before refresh.
- **Refresh error with prior data:** use `role=alert`, retain the last good snapshot, and explicitly
  relabel it stale.
- **Empty:** explain whether filters matched no work, no decision was observed, or no timeline/evidence
  metadata exists; include the next safe recovery step and preserve partial-coverage language.
- **Unknown:** render the word “Unknown” and retain its safe reason code; never substitute `0`.
- **Blocked, partial, stale, expired, and unauthorized:** preserve the literal contract vocabulary.
  The delivered MVP has explicit blocked, partial, and stale presentations. `expired` and
  `unauthorized` are contract values, but the current UI has no dedicated renderer for either; do
  not describe vocabulary support as a shipped state screen.

### Responsive behavior and motion

At full width, Operate and Review use a `1.75fr / 0.75fr` task-and-context grid; Observe uses
`1.65fr / 0.75fr`. At `840px` and below, both become one column, notches disappear, and metrics use
two columns. At `560px` and below, the root padding is `12px`, the shell radius is `10px`, headers and
source metadata stack, work rows use two columns, metrics use one column, and meeting mode becomes a
single sequence. Filters remain horizontally scrollable and tabs remain reachable. The 200% zoom
behavior follows the same structural collapse; do not solve zoom by shrinking text.

The only delivered continuous motion is the loading pulse. Under
`prefers-reduced-motion: reduce`, all Observatory animation, transition, and smooth scrolling are
disabled. Do not add page-load choreography or decorative motion.

## Do's and Don'ts

### Do:

- **Do** preserve one selected thread as the operator moves from work to authority to evidence.
- **Do** use the shared snapshot store in `apps/hermes-plugin/dashboard/src/observatory-store.ts` for
  filters, view, meeting mode, refresh state, and selection.
- **Do** keep provenance and freshness visible beside the fact: transport, as-of time, health,
  coverage, redaction, assertion, and freshness are part of the interface.
- **Do** use native buttons, links, selects, lists, definition lists, tabs, tab panels, headings, and
  live regions with visible keyboard focus.
- **Do** keep Review strictly read-only and route decisions to Telar or the named authority.
- **Do** label loading, error, empty, stale, blocked, partial, and unknown states in text and provide
  safe recovery guidance.
- **Do** expose only the safe evidence metadata authorized by the versioned contract. The delivered
  Receipts panel renders bounded title, kind, classification, and availability; it does not render a
  locator or body.
- **Do** let a future role preset reorder only the named `primary`, `context`, `supporting`, and
  `footer` modules while preserving renderer ownership and responsive reading order.

### Don't:

- **Don't** turn the Observatory into a marketing page, a generic executive KPI wall, a planning
  authority, an assurance system, an execution adapter, or a shadow controller.
- **Don't** copy mock-only density or controls from `.impeccable/mocks/` into the product without a
  separately approved, implemented contract. The approved images are fidelity references.
- **Don't** expose secrets, credentials, prompt bodies, messages, completions, memories, private
  conversations, raw logs, commands, stdout/stderr, diffs, personal filesystem paths, private URLs,
  account identifiers, or confidential source content.
- **Don't** expose artifact bodies or locators. Evidence v1 is safe metadata only; restricted
  evidence is withheld metadata.
- **Don't** present fixtures or synthetic demonstrations as current data. A QA fixture requires the
  permanent label `DEMO FIXTURE - NOT LIVE` and no automatic refresh claim.
- **Don't** convert unknown to zero, false, idle, success, verified, or the requested route. Actual
  model/provider/adapter facts appear only when the execution adapter reports them.
- **Don't** treat runtime success as verification, a stale run pointer as liveness, stale as failure,
  or timeline display order as universal causal order.
- **Don't** show a Pareto chart, winner, universal score, DORA metric, cost, latency, or quality value
  without verified provenance and a comparable task-shape cohort; show an explicit abstention.
- **Don't** duplicate a table, metric family, inspector, or control across views.
- **Don't** add a freeform canvas, widget catalog, drag-and-drop, resizing, layout persistence, or
  user-authored query surface. Future presets are bounded compositions, not configuration tools.
- **Don't** add nested cards, decorative shadows, gradient text, glassmorphism, side-stripe accents,
  or repeated uppercase eyebrows. Thin rules and one restrained notch carry the visual identity.
