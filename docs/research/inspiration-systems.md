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

## GSD v1 (Get Shit Done)

The original GSD was a lightweight meta-prompting, context-engineering, and spec-driven development system for AI coding tools, distributed as markdown prompts installed into `~/.claude/commands/`. It emphasized avoiding context rot by delegating heavy work to fresh contexts and maintaining durable project context through a small command loop. Hard limits surfaced quickly: no real context control, "auto mode" was the LLM looping itself, no crash recovery, no observability — but the framing was a forcing function for the v2 successor below.

**Copy:** context hygiene, phase-sized execution, fresh-context delegation, durable project state.
**Avoid:** optimizing only for Claude Code-style slash-command UX.

## GSD 2 (`gsd-pi`)

GSD-2 ([gsd-build/gsd-2](https://github.com/gsd-build/gsd-2), ~7.6k stars, MIT) is the v2 rewrite of GSD as a **real coding agent CLI built on the Pi SDK** (`pi-mono`) — same Pi lineage UH already tracks as an adapter target. The README's tagline says it directly: *"It's not a prompt framework anymore — it's a TypeScript application that controls the agent session."* Published as `gsd-pi` on npm; current version is v3.x despite the repo name.

The architecture is the most-developed of any harness UH has inspected:

1. **SQLite-authoritative runtime state.** A project-root `gsd.db` is the single source of truth for milestones, slices, tasks, requirements, summaries, completion status, durable decisions, and project knowledge. Markdown under `.gsd/` (`STATE.md`, `DECISIONS.md`, `KNOWLEDGE.md`, etc.) is a rendered projection, not a runtime fallback. UH today is the inverse — YAML/JSON artifacts are authoritative and there is no DB — but GSD-2's pattern (DB authoritative, markdown as projection) is a direct answer to the kinds of drift bugs UH's `uh validate` will eventually need to catch.
2. **Three-verdict milestone validation.** GSD-2's `validate-milestone` gate produces one of `pass | needs-attention | needs-remediation`. The `/gsd verdict <pass|needs-attention|needs-remediation> --rationale <…>` command is the manual-override surface for paused validation. UH currently has a binary `passed | failed | blocked` status; the **needs-attention** verdict is a known gap (it maps roughly to `blocked` but with explicit operator-actionable semantics).
3. **Drift detection registry (ADR-017).** Six named drift kinds (`stale-worker`, `unregistered-milestone`, `roadmap-divergence`, `missing-completion-timestamp`, `merge-state`, `stale-render`), each with a focused detector + idempotent repair handler, registered in a single registry with a cap=2 retry-then-settle contract. This is exactly the subsystem `uh validate` should grow.
4. **Auto-mode = state-machine over DB, not LLM self-loop.** `/gsd auto` is a state machine reading `gsd.db`. Each unit gets a fresh agent session via Pi SDK, with the dispatch prompt pre-inlining task plans, slice plans, prior summaries, dependency summaries, roadmap excerpts, and decisions. Stuck detection is a sliding-window scan over dispatch patterns; soft/idle/hard timeouts have separate semantics. UH's mission-run pipeline already pre-inlines context (`buildMissionPrompt`); GSD-2 shows what "auto-advance across many missions" would look like.
5. **Headless mode with JSON query.** `gsd headless query` returns phase, next dispatch preview, and parallel worker costs as a JSON object **without spawning an LLM session** (~50ms). Exit codes are structured (0 complete, 1 error/timeout, 2 blocked). This is a perfect contract for a UH `uh status --json` mode that the Hermes Dashboard plugin (Epic 3, UH-62 backend) can poll instead of shelling out to each subcommand individually.
6. **Two-terminal coordination via DB.** Terminal 1 runs `/gsd auto`; terminal 2 runs `/gsd discuss` / `/gsd status` / `/gsd queue`. Both coordinate through the SQLite database — decisions in terminal 2 are picked up at the next phase boundary without stopping auto mode. UH has no equivalent today (mission runs are single-process).
7. **Capability-aware model routing (ADR-004).** A `before_model_select` hook + capability scoring + task metadata extraction route each unit to the right model based on declared capabilities, not hard-coded mappings. UH today routes per-adapter; capability-aware *within* an adapter is a future extension.
8. **VISION.md as canonical principles doc.** A short repo-root `VISION.md` enumerates principles (*Extension-first*, *Simplicity over abstraction*, *Tests are the contract*, *Ship fast, fix fast*, *Provider-agnostic*) and explicit "what we won't accept" (enterprise patterns, framework swaps, cosmetic refactors, complexity without user value, heavy orchestration layers). UH's principles are scattered across `docs/architecture/` and `docs/product/`; a single `VISION.md` would tighten the contract for contributors.
9. **Branchless worktree architecture (ADR-001) + external state directory (ADR-002).** Two architectural choices UH explicitly does *not* want to copy — UH-72 commits to branch-per-worker for cross-runtime parity, and UH's `.harness/` lives in-repo so mission artifacts are git-trackable. Worth documenting the trade-off so the decision is durable.
10. **Extensions framework.** `gsd extensions install / update / uninstall / list / info / validate` + topological load order + `@gsd-extensions/<name>` namespace + per-unit-type skill manifest resolver. UH already targets the Hermes Dashboard plugin path (Epic 3); a UH extensions framework would be additive but not load-bearing in MVP.

**Copy:** three-verdict runtime-result status (`pass | needs-attention | needs-remediation`) + manual `uh mission verdict` override; drift detection + idempotent repair registry under `uh validate`; `uh status --json` LLM-less query mode for the Hermes Dashboard backend; canonical `docs/VISION.md` matching GSD-2's principle list (especially "build on top of agent infrastructure, don't wrap it"); pre-inlined dispatch context formalization (UH's `buildMissionPrompt` already does this — make the contract explicit).
**Avoid:** SQLite DB as authoritative runtime state for now (UH's YAML/JSON artifact model is intentionally diffable and reviewable; revisit only if drift bugs make the artifact model untenable); branchless worktree architecture (UH-72 stays branch-per-worker); external state directory (UH's `.harness/` is in-repo by design); bundling a VS Code extension or a 10-tab web visualizer in core (Hermes Dashboard plugin Epic 3 + TUI already cover these surfaces); a `$GSD` token / on-chain coupling (out of scope).

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

## oh-my-claudecode (OMC)

OMC is a TypeScript-based plugin/CLI hybrid for Claude Code by [@Yeachan-Heo](https://github.com/Yeachan-Heo) (~34k stars, MIT). It ships 19 specialized agents (`explore`, `analyst`, `planner`, `architect`, `debugger`, `executor`, `code-simplifier`, `security-reviewer`, `code-reviewer`, `critic`, `document-specialist`, `test-engineer`, `designer`, `writer`, `qa-tester`, `scientist`, `git-master`, `tracer`, `verifier`) + 36 skills, with model-tier routing (Opus for architecture, Sonnet for standard work, Haiku for quick lookups). Distribution is dual-headed: Claude Code plugin marketplace install **or** standalone npm CLI (`oh-my-claude-sisyphus`). The canonical workflow is a staged team pipeline (`team-plan → team-prd → team-exec → team-verify → team-fix (loop)`) with two operator surfaces: in-session slash commands (`/team`, `/autopilot`, `/ralph`, `/ultrawork`, `/deep-interview`) **and** terminal CLI (`omc team ...`, `omc ask ...`) that spawn real `gemini`/`codex` CLI workers in tmux panes for cross-provider orchestration.

Three signals stand out for UH:

1. **Staged team pipeline as a first-class profile.** OMC compiles the lifecycle into named phases the runtime understands, not a free-form prompt. UH's workflow profiles already model phases — the staging shape (`plan/prd/exec/verify/fix`) is a direct parallel UH should support as a workflow profile family alongside `tdd` (UH-55) and the cross-runtime QA work (UH-56).
2. **Operator-surface duality.** OMC exposes the same orchestration via in-session commands and terminal CLI. UH's CLI + TUI already cover this; the lesson is that the **shape** (`team N:role "task"`) translates between them losslessly. The TUI's `R` runs map cleanly onto the same shape if UH adopts the `N:role` syntax.
3. **Real cross-CLI workers in tmux.** Rather than abstract away the underlying agents, OMC spawns real `gemini` / `codex` / `claude` processes in tmux panes and lets the conductor synthesize results. UH's adapter contract already supports this conceptually; the explicit "let workers be different runtimes" framing is what UH's `mission run-all` (UH-56) hints at but does not yet codify as a mission shape.

**Copy:** staged team pipeline (`plan → prd → exec → verify → fix`) as a workflow profile family; `team N:role` mission shape with adapter-bound workers; model-tier routing as a per-role hint in workflow profiles; in-session command surface kept structurally identical to CLI.
**Avoid:** tmux as the canonical worker host (UH stays portable across hosts — workers are adapter spawns, not tmux panes); Claude Code plugin marketplace lock-in (UH's Hermes-dashboard plugin path stays the same canonical surface); `swarm`/`team`/`ralph`/`ralplan` as core vocabulary — UH keeps "mission" and "workflow" as the canonical nouns and treats OMC keywords as workflow-profile names.

## oh-my-codex (OMX)

OMX is the sister project for OpenAI Codex CLI from the same author (~29k stars, MIT). Where OMC is TypeScript-on-Claude-Code, **OMX is Rust** — multi-crate workspace (`omx-runtime-core` with `engine`/`replay`/`mailbox`/`authority`/`dispatch`, `omx-mux` first-class tmux library, `omx-sparkshell` with per-language shell registries for c_cpp / csharp / go / java_kotlin / node_js / python / ruby / rust / swift, `omx-api`, `omx-explore`). Distribution is npm shim (`oh-my-codex`) plus a Codex plugin layout under `plugins/oh-my-codex/`. Operator surface is `$`-prefixed in-Codex skills (`$deep-interview`, `$ralplan`, `$team`, `$ralph`, `$ultragoal`, `$ultraqa`, `$design`) plus an `omx` CLI (`omx --madmax --high`, `omx doctor`, `omx exec`, `omx team status`, `omx update`).

Five signals stand out for UH:

1. **Adversarial UltraQA (`$ultraqa`).** A workflow that explicitly requires hostile-scenario modeling, prompt-injection attempts, interrupt/cancel/resume coverage, stale-state checks, cleanup evidence, and reproducible verdicts before declaring a mission complete. UH's cross-runtime QA (UH-56) currently asserts behavioral parity across adapters; UltraQA-style adversarial coverage is a complementary discipline layer, not a replacement.
2. **Automatic per-worker worktree isolation.** Every team worker gets `.omx/team/<name>/worktrees/worker-N` as a detached branch; the leader integrates via merge/cherry-pick/rebase and reports conflicts in `integration-report.md`. UH already has worktree-mode adapters (UH-25) and the sandbox manager (UH-43); OMX shows what "isolation is the default for every parallel worker" looks like as a contract.
3. **Hermes MCP Bridge.** OMX has a documented "bounded, opt-in coordination bridge" that exposes audited session status, follow-up dispatch, safe artifact reads, log tails, and final reports to Hermes without leaking tmux scrollback. Direct relevance to UH Epic 3 (Hermes Dashboard plugin) — OMX has already solved the artifact-redaction problem.
4. **Canonical `$design` workflow with `DESIGN.md`.** A repo-local source of truth for product/UI decisions, mirrored as a skill. UH already does this informally under `docs/architecture/` and `docs/product/`; making it explicit as a workflow profile + canonical artifact (`design.md` next to each mission) would tighten the SDD contract (UH-54).
5. **Launch profiles + policy env.** `--yolo` / `--high` / `--xhigh` / `--madmax` + `OMX_LAUNCH_POLICY=direct|tmux|detached-tmux|auto` separates "how aggressively to reason" from "where to host the worker". UH conflates these today: `runtime_config.thinking` controls reasoning and `worktree_mode` controls hosting, but there is no unified `launch_policy`. Worth modelling.

**Copy:** adversarial UltraQA discipline as a workflow profile (`adversarial-qa` next to UH-55 `tdd` and UH-56 `qa`); per-worker worktree auto-isolation as the default for `mission run-all`; OMX's Hermes MCP Bridge artifact-redaction contract as the reference for UH Epic 3 (UH-62 backend); `design.md` companion artifact alongside `mission.yaml` to materialize SDD intent; durable project memory directory convention (`.omx/` → UH's `.harness/` already, but mirror the `AGENTS.md` / `DESIGN.md` first-class file pattern).
**Avoid:** rewriting UH in Rust (TypeScript/Bun lineage stays); `--yolo`/`--madmax` mode names (UH's runtime_config + verification gates are typed and reviewable, not slang); coupling worker coordination to a single multiplexer (`omx-mux` is tmux-only; UH workers stay multiplexer-agnostic — `tmux` is one host, not the contract).

## Combined OMC/OMX takeaways

The two projects share a structural pattern worth naming:

- **Staged pipeline as canonical workflow shape.** Both ship `team-plan → team-prd → team-exec → team-verify → team-fix (loop)` (OMC) or the looser `$ralplan → $ralph` (OMX). UH's existing workflow profiles can absorb this as a new family — call it `staged`.
- **Operator surface duality.** Both ship in-session shortcuts AND terminal CLI for the same operations. UH already has CLI + TUI; the Hermes-dashboard plugin (Epic 3) makes it three. The contract that should hold: the same mission shape works from all three surfaces.
- **Adapter as worker.** Both treat the underlying coding agent (Claude Code / Codex / Gemini) as a swappable worker spawn — exactly UH's adapter contract. The novel framing they add: a single mission can fan out to **multiple different adapters in parallel** as workers, and the leader/conductor integrates. This is UH-56 `mission run-all` extended from "compare runtimes" to "collaborate across runtimes".
- **First-class durable state in a hidden dotdir.** `.claude/`, `.omx/`, `.harness/` — same pattern. UH is already aligned.

The right UH-side translation: introduce a `team` mission **shape** (not a new runtime), where the mission declares `workers: [{adapter, role, count}]`, the harness fans out under existing worktree isolation, and the existing verification + final-message pipeline runs over the integrated result. This is the most natural place to spend the OMC/OMX learning — see UH-70 (epic) + UH-71/UH-72/UH-73 (slices) plus UH-74 (adversarial QA) and UH-75 (companion `design.md`) below.


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
- oh-my-claudecode: <https://github.com/Yeachan-Heo/oh-my-claudecode> · landing <https://oh-my-claudecode.dev>
- oh-my-codex: <https://github.com/Yeachan-Heo/oh-my-codex> · landing <https://oh-my-codex.dev>
- GSD 2 (`gsd-pi`): <https://github.com/gsd-build/gsd-2> · npm <https://www.npmjs.com/package/gsd-pi> · VISION <https://github.com/gsd-build/gsd-2/blob/main/VISION.md>
