/**
 * UH-111 — spec template library.
 *
 * Starter `.spec.md` documents that conform to `uh.spec.v0` (see
 * src/harness/spec-loader.ts). These constants are the source of truth and
 * ship in the package; identical copies live under `docs/specs/templates/`
 * for discoverability, kept in sync by a drift test.
 */

const FEATURE_TEMPLATE = `---
schema: uh.spec.v0
id: UH-000
title: Feature title
status: draft
owners: [LaloLalo1999]
linear: UH-000
---

## Goal

One paragraph describing what this feature does and why it matters. Replace
this text; the section must not be empty.

## Non-goals

- What this feature explicitly will not do.

## Acceptance criteria

1. First observable, testable behavior the feature must exhibit.
2. Second criterion — each numbered item becomes one generated test.

## Risks

- Known risk, tricky area, or dependency to watch.

## Open questions

- Anything unresolved before implementation (may be removed once answered).
`;

const EPIC_TEMPLATE = `---
schema: uh.spec.v0
id: UH-000
title: Epic title
status: draft
owners: [LaloLalo1999]
linear: UH-000
---

## Goal

One paragraph framing the epic: the strategic outcome and why it is worth a
multi-slice effort. Replace this text; the section must not be empty.

## Non-goals

- Scope explicitly deferred or excluded from this epic.

## Acceptance criteria

1. Epic-level outcome that signals the epic is done.
2. A second measurable outcome across the slices.

## Risks

- Cross-cutting risk spanning the slices (integration, perf, drift).

## Open questions

- Sequencing, ownership, or design decisions still open.
`;

export const SPEC_TEMPLATES: Record<string, string> = {
  feature: FEATURE_TEMPLATE,
  epic: EPIC_TEMPLATE,
};

export function listSpecTemplates(): string[] {
  return Object.keys(SPEC_TEMPLATES).sort();
}

export function getSpecTemplate(name: string): string {
  const tpl = SPEC_TEMPLATES[name];
  if (tpl === undefined) {
    throw new Error(`Unknown spec template "${name}". Available: ${listSpecTemplates().join(", ")}`);
  }
  return tpl;
}
