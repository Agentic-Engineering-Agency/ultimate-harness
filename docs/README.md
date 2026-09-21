# Ultimate Harness Documentation

Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents.

The core design goal is **portable discipline**: a project should be able to use multiple coding-agent runtimes without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints.

For the active roadmap (epics, in-flight slices, recently shipped), see [ROADMAP.md](./ROADMAP.md).

## Start here

0. [Quickstart](./quickstart.md) — install, initialize, run, verify, and inspect a mission.
- [Orchestrator guide](./orchestrator-guide.md) — mission lifecycle, team execution, observability, human decisions and CLI reference.
1. [Configuration](./configuration.md) — project state, env vars, and runtime overrides.
2. [Runtime targets](./runtime-targets.md) — supported runtimes and adapter boundaries.
3. [Vision](./VISION.md) — what UH is, who it's for, and what we won't accept.
4. [Glossary](./glossary.md) — shared terms used across the project.
5. [Product requirements](./product/prd.md) — what the harness is for and who it serves.
6. [Architecture overview](./architecture/overview.md) — major components and boundaries.
7. [Runtime adapter contract](./architecture/runtime-adapter-contract.md) — what every adapter implements.
8. [Mission packet schema](./architecture/mission-packet-schema.md) — the portable work-request format.
- [Native runtime events](./architecture/runtime-events.md) — adapter event contracts, supervision and accounting boundaries.
- [Tool guard](./tool-guard.md) — path-only policy, enforcement seams, denial reasons, and artifacts.
9. [Verification and promotion](./architecture/verification-and-promotion.md) — how sandbox work becomes canonical work.
10. [BMAD agent map](./workflows/bmad-agent-map.md) — how BMAD-style roles map into Ultimate Harness.

## Adapters

| Adapter | Status | Doc / Runbook |
|---|---|---|
| `hermes` | active | [Runtime adapter contract](./architecture/runtime-adapter-contract.md) defines the shape; `src/adapters/hermes.ts` is the reference implementation. |
| `codex` | active | [Codex adapter design](./architecture/adapter-codex.md), [Codex E2E smoke](./runbooks/codex-e2e-smoke.md) |
| `hermes-proxy` | active | [Hermes proxy adapter](./architecture/adapter-hermes-proxy.md), [setup](./runbooks/hermes-proxy-setup.md), [E2E smoke](./runbooks/hermes-proxy-e2e-smoke.md) |
| `openrouter` | active | [OpenRouter setup](./runbooks/openrouter-setup.md) |
| `anthropic` | experimental | [Anthropic setup](./runbooks/anthropic-setup.md) — native pay-per-token Messages API (UH-136). |
| `pi` | active | [Pi setup](./runbooks/pi-setup.md) |
| `oh-my-pi` | active | [Anthropic via oh-my-pi](./runbooks/anthropic-via-omp.md) — covers the OMP routing path and its ToS posture. |
| `command-code` | active | [Tool guard](./tool-guard.md), [Acceptance runbook](./runbooks/acceptance.md) |
| `claude-code` | integration incomplete | [Runtime targets](./runtime-targets.md#claude-code-boundaries) — native CLI execution and current limitations. |

- [Acceptance status](./acceptance/README.md) — generated view of the registry and locally available evidence; a clean checkout contains no execution history.
- [Acceptance runbook](./runbooks/acceptance.md) — register, run, inspect, and regenerate acceptance evidence.
For issue-level state and upcoming epics, see [ROADMAP.md](./ROADMAP.md).

## Documentation map

### Research

- [Inspiration systems](./research/inspiration-systems.md)
- [research/landscape-register.md](./research/landscape-register.md): dated, primary-source register of what existing systems do for each 1.0 build item, with per-row verification status and re-check triggers.
- [Comparison matrix](./research/comparison-matrix.md)
- [Adopt / reject / defer decisions](./research/adopt-reject-defer.md)

### Product

- [Quickstart](./quickstart.md)
- [Configuration](./configuration.md)
- [Runtime targets](./runtime-targets.md)
- [Optional telemetry](./telemetry.md)
- [Troubleshooting](./troubleshooting.md)
- [PRD](./product/prd.md)
- [MVP scope](./product/mvp-scope.md)
- [Non-goals](./product/non-goals.md)
- [Personas](./product/personas.md)

### Architecture

- [Overview](./architecture/overview.md)
- [Entities](./architecture/entities.md)
- [Runtime adapter contract](./architecture/runtime-adapter-contract.md)
- [Delegation and containment](./architecture/delegation-and-containment.md)
- [Codex adapter design](./architecture/adapter-codex.md)
- [Hermes proxy adapter design](./architecture/adapter-hermes-proxy.md)
- [TUI architecture](./architecture/tui.md)
- [Plugin development](./plugin-development.md)
- [Mission packet schema](./architecture/mission-packet-schema.md)
- [.harness artifacts](./architecture/harness-artifacts.md)
- [Skill format](./architecture/skill-format.md)
- [Sandboxing](./architecture/sandboxing.md)
- [AgentFS sandbox backend (design)](./architecture/sandbox-agentfs.md)
- [Verification and promotion](./architecture/verification-and-promotion.md)
- [SDD + TDD + cross-runtime QA](./architecture/sdd-tdd-qa.md)
- [Progressive decisions](./architecture/progressive-decisions.md) — implemented semantic evaluation and proposed policy flows.
- [Telar planning/governance and UH Run Control boundary](./architecture/telar-integration.md)

### Runbooks

- [Codex E2E smoke](./runbooks/codex-e2e-smoke.md)
- [Anthropic via oh-my-pi](./runbooks/anthropic-via-omp.md)
- [Hermes proxy setup](./runbooks/hermes-proxy-setup.md)
- [Hermes proxy E2E smoke](./runbooks/hermes-proxy-e2e-smoke.md)
- [Hermes dashboard plugin](./runbooks/hermes-dashboard-plugin.md)
- [Using `uh tui`](./runbooks/using-the-tui.md)
- [Honcho persistent memory](./runbooks/honcho-memory.md)
- [Publishing](./runbooks/publishing.md)
- [Resource-wave smoke](./runbooks/resource-wave-smoke.md)
- [Worker-contract smoke](./runbooks/worker-contract-smoke.md)
- [Tool-guard smoke](./runbooks/tool-guard-smoke.md)
- [Supervisor-loop smoke](./runbooks/supervisor-loop-smoke.md)

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
