# BMAD Agent Map

BMAD is used as an inspiration pattern for role separation. Ultimate Harness should not depend on BMAD or force BMAD terminology into every workflow.

## Role mapping

| BMAD-style role | Ultimate Harness responsibility | Typical artifacts |
|---|---|---|
| Analyst | Research source systems, compare patterns, identify risks. | Research notes, comparison matrix, adopt/reject/defer log. |
| Product Manager | Convert research and user goals into product requirements. | PRD, MVP scope, non-goals, personas. |
| Architect | Define entities, boundaries, adapter contracts, schemas, sandboxing. | Architecture overview, entity model, mission schema, adapter contract. |
| Scrum Master / Workflow Designer | Turn product/architecture into repeatable workflow profiles. | Workflow docs, mission templates, task breakdowns. |
| Developer | Execute missions through a runtime adapter in a sandbox. | Code/docs changes, runtime result, diffs. |
| QA / Test Architect | Define and apply verification strategy and review gates. | Check results, review findings, verification reports. |
| Technical Writer | Make docs navigable and readable to new contributors. | `docs/README.md`, glossary, README updates. |

## BMAD-inspired documentation sprint

1. Analyst creates research matrix.
2. PM writes PRD/MVP/non-goals/personas.
3. Architect defines artifacts, entities, schemas, adapter contract, sandboxing, verification.
4. Workflow designer writes workflow profiles.
5. QA defines verification strategy, checks, gates, audit trail.
6. Technical writer updates navigation and root README.

## Guardrails

- BMAD roles are hats, not permanent actors.
- A single agent may play multiple roles if artifacts remain clear.
- Role output must be traceable and reviewable.
- Do not import BMAD as a dependency unless the project explicitly chooses it later.
