# Workflow Overview

A workflow profile defines how a class of work moves from request to promoted output.

## Initial workflow profiles

| Profile | Purpose | Primary outputs |
|---|---|---|
| `research-docs` | Research and documentation sprint before implementation. | Research matrix, PRD, architecture docs, glossary. |
| `spec-first-feature` | Build a feature from issue/spec through sandboxed implementation. | Spec, plan, mission, code, verification, promotion. |
| `bugfix-contained` | Fix a bounded defect safely. | Repro notes, failing test, patch, verification. |
| `adapter-design` | Design and validate a runtime adapter. | Adapter manifest, capability map, conformance notes. |
| `skill-authoring` | Create/refine reusable skills. | Skill doc, examples, validation checklist. |

## Common stages

1. Intake request and issue references.
2. Select workflow profile.
3. Load relevant skills and context.
4. Produce or update spec/plan.
5. Compile mission packet.
6. Create sandbox.
7. Execute through runtime adapter.
8. Collect results.
9. Verify and review.
10. Promote or discard.
11. Write audit trail.
