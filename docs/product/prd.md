# Product Requirements Document

## Problem

AI coding agents are powerful but inconsistent across tools. Each runtime has different prompts, session state, permissions, sandboxes, skills, review loops, and artifact conventions. Teams lose continuity when switching between Codex, Claude Code, Pi, Hermes, or other agents. Work often remains trapped in chat transcripts, making it hard to audit what was requested, what changed, which checks ran, and who approved promotion.

## Product thesis

Ultimate Harness provides a runtime-agnostic layer that turns agentic work into durable, inspectable, verifiable missions. It separates **what work should happen** from **which runtime performs it**.

## Goals

1. Define portable project, workflow, skill, mission, sandbox, verification, and promotion artifacts.
2. Support multiple runtimes through structured adapters.
3. Preserve human-readable context and audit history outside chat.
4. Make sandboxed agent execution and controlled promotion the default path.
5. Enable BMAD-style specialist collaboration without coupling to BMAD as a dependency.

## Users

- Founders/builders using multiple coding agents and wanting reliable output.
- Agent platform developers building reusable workflows.
- Technical leads who need auditability and human approval before promotion.
- Skill authors who want procedures to work across runtimes.

## Functional requirements

### FR1 — Documentation spine
The repo must define the product vocabulary, core entities, MVP boundary, workflow profiles, adapter contract, mission packet schema, sandbox model, and verification lifecycle.

### FR2 — Mission packets
The harness must express a bounded unit of work as a portable mission packet containing goal, inputs, context references, constraints, skills, expected outputs, checks, and promotion policy.

### FR3 — Runtime adapters
The harness must define a contract for preparing, launching, observing, collecting, verifying, and closing runtime sessions.

### FR4 — Sandbox abstraction
The harness must distinguish sandbox backends such as git worktrees and AgentFS and define how outputs move through review to promotion.

### FR5 — Workflow profiles
The harness must describe repeatable workflows for research docs, spec-first features, contained bug fixes, adapter design, and skill authoring.

### FR6 — Verification results
The harness must produce structured verification evidence linked to issues/specs/missions.

## Non-functional requirements

- Runtime-agnostic by design.
- Human-readable artifacts first.
- Schemas versioned and traceable.
- Safe defaults: no direct canonical mutation by agents unless explicitly configured.
- Minimal MVP: avoid dashboard/orchestrator bloat.

## Success metrics

- A new contributor can understand the project from docs without asking for hidden chat context.
- A runtime adapter implementer can design Codex, Claude Code, Pi, or Hermes adapters from the contract.
- A mission packet example is clear enough to be executed manually before code exists.
- Verification and promotion requirements are explicit enough to prevent unreviewed agent changes from becoming canonical.
