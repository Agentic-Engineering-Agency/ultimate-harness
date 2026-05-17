# Ultimate Harness Documentation

Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents.

The core design goal is **portable discipline**: a project should be able to use multiple coding-agent runtimes without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints.

For the active roadmap (epics, in-flight slices, recently shipped), see [ROADMAP.md](./ROADMAP.md).

## Start here

1. [Glossary](./glossary.md) — shared terms used across the project.
2. [Product requirements](./product/prd.md) — what the harness is for and who it serves.
3. [MVP scope](./product/mvp-scope.md) — what must exist before implementation grows.
4. [Architecture overview](./architecture/overview.md) — major components and boundaries.
5. [Core entities](./architecture/entities.md) — canonical vocabulary for data and artifacts.
6. [Runtime adapter contract](./architecture/runtime-adapter-contract.md) — what every adapter implements (includes the UH-28 runtime-final-message protocol).
7. [Mission packet schema](./architecture/mission-packet-schema.md) — the portable work-request format.
8. [Verification and promotion](./architecture/verification-and-promotion.md) — how sandbox work becomes canonical work.
9. [BMAD agent map](./workflows/bmad-agent-map.md) — how BMAD-style roles map into Ultimate Harness.

## Adapters

| Adapter | Status | Doc / Runbook |
|---|---|---|
| `hermes` | active | [Runtime adapter contract](./architecture/runtime-adapter-contract.md) defines the shape; `src/adapters/hermes.ts` is the reference implementation. |
| `codex` | active | [`architecture/adapter-codex.md`](./architecture/adapter-codex.md), [`runbooks/codex-e2e-smoke.md`](./runbooks/codex-e2e-smoke.md) |
| `oh-my-pi` | experimental | [`runbooks/anthropic-via-omp.md`](./runbooks/anthropic-via-omp.md) — covers the Anthropic-via-OMP routing path and its ToS posture. |

In flight (see [ROADMAP.md](./ROADMAP.md)):

- `hermes-proxy` — clean ToS-positioned path to subscription routing via Hermes v0.14.0's `hermes proxy` local OAI-compat endpoint (epic [UH-32](https://linear.app/agentic-eng/issue/UH-32)).
- `uh tui` — interactive terminal UI built on OpenTUI (epic [UH-41](https://linear.app/agentic-eng/issue/UH-41)).

## Documentation map

### Research

- [Inspiration systems](./research/inspiration-systems.md)
- [Comparison matrix](./research/comparison-matrix.md)
- [Adopt / reject / defer decisions](./research/adopt-reject-defer.md)

### Product

- [PRD](./product/prd.md)
- [MVP scope](./product/mvp-scope.md)
- [Non-goals](./product/non-goals.md)
- [Personas](./product/personas.md)

### Architecture

- [Overview](./architecture/overview.md)
- [Entities](./architecture/entities.md)
- [Runtime adapter contract](./architecture/runtime-adapter-contract.md)
- [Codex adapter design](./architecture/adapter-codex.md)
- [Mission packet schema](./architecture/mission-packet-schema.md)
- [.harness artifacts](./architecture/harness-artifacts.md)
- [Skill format](./architecture/skill-format.md)
- [Sandboxing](./architecture/sandboxing.md)
- [AgentFS sandbox backend (design)](./architecture/sandbox-agentfs.md)
- [Verification and promotion](./architecture/verification-and-promotion.md)

### Runbooks

- [Codex E2E smoke](./runbooks/codex-e2e-smoke.md)
- [Anthropic via oh-my-pi](./runbooks/anthropic-via-omp.md)

### Workflows

- [Workflow overview](./workflows/overview.md)
- [Research to spec](./workflows/research-to-spec.md)
- [Spec to plan](./workflows/spec-to-plan.md)
- [Plan to mission](./workflows/plan-to-mission.md)
- [Mission to sandbox](./workflows/mission-to-sandbox.md)
- [Verify, review, promote](./workflows/verify-review-promote.md)
- [BMAD agent map](./workflows/bmad-agent-map.md)

### Verification

- [Strategy](./verification/strategy.md)
- [Checks](./verification/checks.md)
- [Review gates](./verification/review-gates.md)
- [Audit trail](./verification/audit-trail.md)
