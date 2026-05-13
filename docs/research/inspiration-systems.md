# Inspiration Systems

Ultimate Harness intentionally borrows from several systems while avoiding capture by any single one. The goal is not to reimplement BMAD, OpenSpec, GSD, or Pi; it is to extract portable patterns that survive across runtimes.

## Specsafe

Specsafe is currently represented by a public issue tracker focused on specification safety and integrations with development tools such as Aider, Cursor, Continue, Zed, Google Antigravity IDE, and Google Workspace APIs. For Ultimate Harness, Specsafe contributes the principle that work should be traceable to explicit issues/specifications and that assistant integrations should be designed as first-class surfaces, not one-off prompts.

**Copy:** issue/spec traceability and integration mindset.  
**Avoid:** depending on any single IDE integration as the core abstraction.

## BMAD Method

BMAD Method is an AI-driven agile development framework built around specialized agents, structured workflows, and adaptive planning depth. Its agents include product, architecture, development, UX, and other lifecycle roles. It is valuable as a role model for separating analysis, product definition, architecture, workflow design, implementation, and QA.

**Copy:** role separation, lifecycle workflows, facilitated collaboration, scale-adaptive planning.  
**Avoid:** letting BMAD terminology become the product ontology; BMAD should be one workflow profile family, not the harness itself.

## superpowers

superpowers is an agentic skills framework and software development methodology. It requires agents to check for relevant skills, use planning and TDD workflows, work in isolated branches/worktrees, and request reviews. Its strongest contribution is a compact, skill-driven discipline layer that can be applied to multiple coding agents.

**Copy:** mandatory skill discovery, bite-sized plans, TDD, subagent review loops, worktree awareness.  
**Avoid:** assuming one skill format or one agent host is universal.

## GSD

GSD is a lightweight meta-prompting, context-engineering, and spec-driven development system for AI coding tools. It emphasizes avoiding context rot by delegating heavy work to fresh contexts and maintaining durable project context through a small command loop.

**Copy:** context hygiene, phase-sized execution, fresh-context delegation, durable project state.  
**Avoid:** optimizing only for Claude Code-style slash-command UX.

## matt-pocock/skills

Matt Pocock's skills are small, composable engineering workflows intended to preserve real engineering discipline with AI agents. The key insight is that skills should improve communication, shared language, debugging, feedback loops, and architecture quality without creating a heavyweight process owner.

**Copy:** small composable skills, shared language docs, practical engineering taste, model-agnostic usage.  
**Avoid:** treating skills as merely prompt snippets; they should carry verification and workflow hooks when useful.

## oh-my-openagent

oh-my-openagent is an opinionated OpenCode-oriented harness/plugin that packages agents, hooks, model routing, MCP integrations, and workflow discipline. It shows the value of a batteries-included agent environment and open multi-model orchestration.

**Copy:** packaged defaults, model/runtime routing, hooks, MCP awareness, open-agent ecosystem perspective.  
**Avoid:** making Ultimate Harness a preconfigured IDE/plugin distribution instead of a portable artifact layer.

## OpenSpec

OpenSpec is a spec-driven development framework for AI coding assistants. It uses a proposal/apply/archive lifecycle and change folders containing proposal, specs, design, and tasks. Its main contribution is a lightweight artifact-guided workflow that keeps requirements outside chat history.

**Copy:** artifact-first proposal/design/tasks lifecycle, archive/update discipline, assistant portability.  
**Avoid:** collapsing every mission into a spec change; some missions are research, verification, or skill authoring.

## Pi and oh-my-pi

Pi is a minimal, customizable terminal coding harness with interactive, print/JSON, RPC, and SDK modes. oh-my-pi extends the Pi lineage into a batteries-included terminal agent with LSP, subagents, browser, Python, MCP, sessions, branches, skills, hooks, and isolation backends.

**Copy:** runtime customizability, JSON/RPC/embed surfaces, session trees, tool-rich execution, subagents.  
**Avoid:** assuming the core project engine must be Pi before adapter and artifact contracts are proven.

## AgentFS

AgentFS provides database-backed agent filesystems, overlay/copy-on-write execution, command execution inside mounted filesystems, sync, encryption, MCP filesystem tools, and platform-specific sandbox behavior. It is directly relevant to Ultimate Harness because sandboxing and promotion are core product values.

**Copy:** copy-on-write filesystem model, explicit mount/exec/run lifecycle, inspectable deltas, syncable state, sandbox boundary concepts.  
**Avoid:** treating AgentFS and git worktrees as interchangeable; they solve overlapping but different isolation problems.


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
