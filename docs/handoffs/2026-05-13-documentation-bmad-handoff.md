# Ultimate Harness Documentation Handoff — BMAD-Oriented Research & Docs Sprint

> **For next agent:** Start here. This repo is intentionally early-stage; your job is to turn the high-level vision into a deep documentation spine before implementation accelerates.

**Date:** 2026-05-13  
**Repo:** `~/AgenticEngineering/ultimate-harness`  
**GitHub:** https://github.com/Agentic-Engineering-Agency/ultimate-harness  
**Linear project:** https://linear.app/agentic-eng/project/ultimate-harness-6928debf7da2  
**Linear team:** `UH` / Ultimate Harness, child of `AE` / Agentic Engineering

---

## 1. Current project state

Ultimate Harness is a runtime-agnostic software-development harness intended to sit above coding agents and agent runtimes. The current README defines the project as a “super harness” combining the strongest ideas from:

- Specsafe — specification safety and issue-driven development practices.
- BMAD Method — structured agent roles, planning, and delivery workflows.
- superpowers — composable agent capabilities / skills.
- GSD — disciplined execution workflows and durable project context.
- matt-pocock/skills — focused reusable development skills.
- oh-my-openagent — open agent ecosystem patterns.
- OpenSpec — open specification workflows.
- oh-my-pi / Pi — possible core project engine.
- AgentFS — sandboxing and filesystem-effect isolation.

The repository is currently mostly conceptual: `README.md` plus Git metadata. There is no implemented package structure yet. Do not assume a language/runtime has been chosen.

---

## 2. Linear / GitHub synchronization state

The project has 21 open GitHub issues synced to Linear issues. Linear issue identifiers are now `UH-*` after the Ultimate Harness subteam was created.

GitHub issue list:

| GitHub | Linear | Title | Workstream |
|---:|---|---|---|
| #1 | UH-21 | Define runtime-agnostic harness direction in README | Architecture |
| #2 | UH-20 | Define runtime adapter contract | Architecture |
| #3 | UH-19 | Define mission packet schema | Architecture |
| #4 | UH-18 | Design `.harness` artifact structure | Architecture |
| #5 | UH-17 | Implement initial `uh` CLI skeleton | CLI |
| #6 | UH-16 | Implement `uh init` | CLI |
| #7 | UH-15 | Implement `uh propose` | CLI |
| #8 | UH-14 | Implement `uh status` | CLI |
| #9 | UH-13 | Design Codex runtime adapter | Runtime adapter |
| #10 | UH-12 | Design Claude Code runtime adapter | Runtime adapter |
| #11 | UH-11 | Design Pi and oh-my-pi runtime adapters | Runtime adapter |
| #12 | UH-10 | Design Hermes runtime adapter | Runtime adapter |
| #13 | UH-9 | Design git worktree sandbox backend | Sandboxing |
| #14 | UH-8 | Design AgentFS sandbox backend | Sandboxing |
| #15 | UH-7 | Define verification and promotion lifecycle | Verification |
| #16 | UH-6 | Define Ultimate Harness skill format | Skills |
| #17 | UH-5 | Define initial workflow profiles | Workflow |
| #18 | UH-4 | Implement runtime registry scaffold | Runtime adapter |
| #19 | UH-3 | Implement mission prompt generation | Runtime adapter |
| #20 | UH-2 | Implement first Hermes adapter MVP | Runtime adapter |
| #21 | UH-1 | Add comparative analysis of inspiration systems | Docs |

Linear custom views created:

- UH — All Active: https://linear.app/agentic-eng/view/c1309049c897
- UH — Architecture & Specs: https://linear.app/agentic-eng/view/fc6216e0de3b
- UH — CLI Skeleton: https://linear.app/agentic-eng/view/ebffca1d10fa
- UH — Runtime Adapters: https://linear.app/agentic-eng/view/71c1460e1915
- UH — Safety / Skills / Workflows: https://linear.app/agentic-eng/view/480f61951b0e

---

## 3. Immediate mission for the next agent

**Primary mission:** Build the documentation foundation deeply enough that a later implementation agent can start coding without inventing product semantics.

Prioritize documentation over code. The best next result is not a CLI; it is a precise docs/spec package that answers:

1. What is Ultimate Harness?
2. What problem does it solve beyond existing tools?
3. What are the core entities: project, mission, runtime adapter, skill, workflow profile, sandbox, verification result, promotion?
4. Which ideas are adopted from each inspiration system, which are rejected, and why?
5. How would BMAD-style agents collaborate inside this harness?
6. What is the MVP boundary?
7. What docs must exist before implementation begins?

---

## 4. Recommended BMAD-style agent workflow

Use BMAD as an inspiration pattern, not as a dependency unless explicitly requested. The recommended workflow is:

### Phase A — Analyst / Researcher

**Agent persona:** BMAD Analyst  
**Goal:** Produce a comparative research matrix of all inspiration systems.

Deliverables:

- `docs/research/inspiration-systems.md`
- `docs/research/comparison-matrix.md`
- `docs/research/adopt-reject-defer.md`

Minimum comparison dimensions:

- Core abstraction
- Workflow model
- Agent roles/personas
- State persistence model
- Spec format
- Skill/capability format
- Sandbox/isolation model
- Verification model
- Human approval checkpoints
- Runtime portability
- Gaps/risks
- Ideas Ultimate Harness should copy
- Ideas Ultimate Harness should avoid

### Phase B — Product Manager

**Agent persona:** BMAD PM  
**Goal:** Convert research into product requirements.

Deliverables:

- `docs/product/prd.md`
- `docs/product/mvp-scope.md`
- `docs/product/non-goals.md`
- `docs/product/personas.md`

Important product constraints:

- Runtime-agnostic first. Do not accidentally become “a wrapper for one agent.”
- Human-readable artifacts first. Machine-readable schemas second.
- Verification and auditability are first-class.
- Sandboxing is part of the core value proposition, not an optional plugin.
- Avoid overbuilding a massive orchestrator before the artifact model is clear.

### Phase C — Architect

**Agent persona:** BMAD Architect  
**Goal:** Define the harness architecture and entity model.

Deliverables:

- `docs/architecture/overview.md`
- `docs/architecture/entities.md`
- `docs/architecture/runtime-adapter-contract.md`
- `docs/architecture/mission-packet-schema.md`
- `docs/architecture/harness-artifacts.md`
- `docs/architecture/sandboxing.md`
- `docs/architecture/verification-and-promotion.md`

Key architecture questions:

- What does `.harness/` contain?
- What is a “mission packet”?
- What must every runtime adapter implement?
- How does a runtime report progress, diffs, logs, test results, and blockers?
- How are files promoted from sandbox to working tree?
- How are specs versioned and traced to issues?
- How are skills discovered, selected, and invoked?

### Phase D — Scrum Master / Workflow Designer

**Agent persona:** BMAD SM / Workflow Designer  
**Goal:** Define the first usable workflows.

Deliverables:

- `docs/workflows/overview.md`
- `docs/workflows/research-to-spec.md`
- `docs/workflows/spec-to-plan.md`
- `docs/workflows/plan-to-mission.md`
- `docs/workflows/mission-to-sandbox.md`
- `docs/workflows/verify-review-promote.md`
- `docs/workflows/bmad-agent-map.md`

Initial workflow profiles to design:

1. `research-docs` — research-heavy documentation sprint.
2. `spec-first-feature` — normal feature development from issue/spec to PR.
3. `bugfix-contained` — bounded bugfix in sandbox.
4. `adapter-design` — design and validate a new runtime adapter.
5. `skill-authoring` — create or refine a reusable skill.

### Phase E — QA / Test Architect

**Agent persona:** BMAD QA / Test Architect  
**Goal:** Define how Ultimate Harness verifies itself and its generated work.

Deliverables:

- `docs/verification/strategy.md`
- `docs/verification/checks.md`
- `docs/verification/review-gates.md`
- `docs/verification/audit-trail.md`

Verification must include:

- Static checks
- Test commands
- Diff review
- Spec compliance review
- Security/sandbox boundary review
- Human promotion approval
- Traceability back to issue/spec/mission

### Phase F — Technical Writer / Documentarian

**Agent persona:** BMAD Doc Writer  
**Goal:** Create the repo’s navigable documentation home.

Deliverables:

- `docs/README.md`
- `docs/glossary.md`
- Updated root `README.md`
- `docs/index.md` if using docs site tooling later

Make the docs readable to someone who has never seen BMAD, Specsafe, Pi, AgentFS, or Hermes.

---

## 5. Suggested documentation tree

Create this first; add content incrementally:

```text
docs/
  README.md
  glossary.md
  handoffs/
    2026-05-13-documentation-bmad-handoff.md
  research/
    inspiration-systems.md
    comparison-matrix.md
    adopt-reject-defer.md
  product/
    prd.md
    mvp-scope.md
    non-goals.md
    personas.md
  architecture/
    overview.md
    entities.md
    runtime-adapter-contract.md
    mission-packet-schema.md
    harness-artifacts.md
    sandboxing.md
    verification-and-promotion.md
  workflows/
    overview.md
    research-to-spec.md
    spec-to-plan.md
    plan-to-mission.md
    mission-to-sandbox.md
    verify-review-promote.md
    bmad-agent-map.md
  verification/
    strategy.md
    checks.md
    review-gates.md
    audit-trail.md
```

---

## 6. Proposed first execution order

Do not start by coding. Use this sequence:

1. Read `README.md`.
2. Read GitHub issues #1–#4, #15–#17, #21.
3. Research BMAD, Specsafe, superpowers, GSD, matt-pocock/skills, oh-my-openagent, OpenSpec, Pi/oh-my-pi, AgentFS.
4. Create `docs/README.md` and `docs/glossary.md` as navigation anchors.
5. Create the research matrix.
6. Create PRD and MVP scope.
7. Create architecture docs for entities, mission packets, adapter contract, artifacts, sandboxing, verification.
8. Create workflow docs with BMAD agent mapping.
9. Update root `README.md` to link the new docs.
10. Only then consider implementation issues.

---

## 7. Suggested prompt for the next agent

Copy/paste this into the next agent:

```text
You are continuing the Ultimate Harness project at ~/AgenticEngineering/ultimate-harness.

First read docs/handoffs/2026-05-13-documentation-bmad-handoff.md and README.md.

Your mission is documentation-first: create a deep documentation spine for Ultimate Harness before implementation. Use BMAD-style agent roles/workflows as an inspiration model: Analyst, PM, Architect, Workflow Designer/Scrum Master, QA/Test Architect, and Technical Writer.

Do not implement the CLI yet. Instead:
1. Research and compare the inspiration systems listed in README.md.
2. Create the docs tree proposed in the handoff.
3. Fill in at least the research matrix, PRD, MVP scope, architecture overview, entities, runtime adapter contract, mission packet schema, .harness artifact structure, verification lifecycle, and BMAD agent map.
4. Keep every claim traceable to source repos/docs where possible.
5. Update root README.md with links to the new docs.
6. Commit the documentation work in logical commits.

The GitHub issues are synced to Linear UH-* issues; use GitHub for code-linked discussion and Linear for planning/status.
```

---

## 8. Acceptance criteria for the documentation sprint

A high-quality first docs sprint is complete when:

- The docs tree exists and is navigable from `docs/README.md`.
- The root README links to docs and explains the project in clearer terms.
- There is a comparison matrix for all inspiration systems.
- There is an explicit adopt/reject/defer decision log.
- The core entities are defined consistently.
- The runtime adapter contract has enough detail to guide Codex, Claude Code, Pi/oh-my-pi, and Hermes adapter design.
- The mission packet schema is defined with example YAML/JSON.
- The `.harness/` artifact layout is specified.
- Sandboxing and promotion lifecycle are documented.
- BMAD-style agent roles are mapped to Ultimate Harness workflows.
- The docs clearly state what is MVP vs later.

---

## 9. Important cautions

- Do not let BMAD dominate the design. BMAD is one inspiration system, not the whole product.
- Do not collapse runtime adapters into shell commands only; adapters need structured lifecycle/state reporting.
- Do not treat Git worktrees and AgentFS as interchangeable; compare them carefully.
- Do not invent schemas casually. Prefer examples, then stabilize names.
- Do not choose a package/runtime until docs justify it.
- Do not erase the early-stage exploratory nature; document assumptions and open questions.

---

## 10. Useful commands

```bash
cd ~/AgenticEngineering/ultimate-harness

git status --short

gh issue list --limit 30 --json number,title,url,labels

gh issue view 21 --json number,title,body,url,labels
```

If Linear MCP is available in Hermes, use `mcp_linear_*` tools after restarting Hermes. Otherwise use GitHub issues as the durable synced issue list.
