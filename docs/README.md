# Ultimate Harness Documentation

Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents and runtimes.

The core design goal is **portable discipline**: a project should be able to use Codex, Claude Code, Pi/oh-my-pi, Hermes, or a future runtime without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints.


For the active roadmap (epics, in-flight slices, recently shipped), see [ROADMAP.md](./ROADMAP.md).
## Start here

1. [Glossary](./glossary.md) — shared terms used across the project.
2. [Product requirements](./product/prd.md) — what the harness is for and who it serves.
3. [MVP scope](./product/mvp-scope.md) — what must exist before implementation grows.
4. [Architecture overview](./architecture/overview.md) — major components and boundaries.
5. [Core entities](./architecture/entities.md) — canonical vocabulary for data and artifacts.
6. [Runtime adapter contract](./architecture/runtime-adapter-contract.md) — what all agent runtimes must implement.
7. [Mission packet schema](./architecture/mission-packet-schema.md) — the first portable work-request format.
8. [Verification and promotion](./architecture/verification-and-promotion.md) — how sandbox work becomes canonical work.
9. [BMAD agent map](./workflows/bmad-agent-map.md) — how BMAD-style roles map into Ultimate Harness.

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
- [Mission packet schema](./architecture/mission-packet-schema.md)
- [.harness artifacts](./architecture/harness-artifacts.md)
- [Sandboxing](./architecture/sandboxing.md)
- [Verification and promotion](./architecture/verification-and-promotion.md)
- `architecture/adapter-codex.md` — Codex CLI adapter design + 2026-05-17 implementation status. Experimental; gated on subscription quota for live end-to-end runs.
- `architecture/adapter-pi-and-oh-my-pi.md` — near-term planning doc for Pi and oh-my-pi runtime inclusion (Options A/B/C; recommends starting with the `omp` CLI direct-invocation pattern).

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

## Current status

Ultimate Harness now has an early working CLI and schema-backed artifact lifecycle. The docs remain the product and architecture spine for the implementation: use them to understand the artifact model, adapter contract, mission packet, sandbox policy model, verification lifecycle, and promotion gates as the CLI continues to grow.


## Sources used in this documentation sprint

- Specsafe issue tracker: <https://github.com/Agentic-Engineering-Agency/specsafe/issues>
- BMAD Method: <https://github.com/bmad-code-org/BMAD-METHOD>
- superpowers: <https://github.com/obra/superpowers>
- GSD: <https://github.com/gsd-build/get-shit-done>
- matt-pocock/skills: <https://github.com/mattpocock/skills>
- oh-my-openagent: <https://github.com/code-yeongyu/oh-my-openagent>
- OpenSpec: <https://github.com/Fission-AI/OpenSpec>
- oh-my-pi: <https://github.com/can1357/oh-my-pi>
- Pi: <https://pi.dev/>
- AgentFS manual: <https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md>
