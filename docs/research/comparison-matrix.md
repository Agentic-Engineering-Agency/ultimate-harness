# Comparison Matrix

| System | Core abstraction | Workflow model | Roles/personas | State persistence | Spec format | Skill/capability format | Sandbox/isolation | Verification | Human checkpoints | Runtime portability | Copy into UH | Avoid in UH |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Specsafe | Issue/spec safety layer | Issue-driven enhancements | Not primary | GitHub issues | Issue/spec references | Integration-specific | Not primary | Spec safety implied | Issue review | IDE/CLI integration oriented | Traceability and integration roadmap | IDE-first lock-in |
| BMAD | Agile AI development method | Structured lifecycle workflows | Analyst, PM, Architect, Dev, QA, UX, etc. | Project/module files | Workflow artifacts | Agents/modules | Not core | Workflow reviews | Multiple approvals | Works through AI IDE installs | Role separation and lifecycle stages | Letting BMAD own the ontology |
| superpowers | Skills + coding methodology | Brainstorm → worktree → plan → TDD → review → finish | Skill-driven subagents/reviewers | Skill docs, plans, branches | Design/plan docs | Markdown skills | Git worktrees | Tests + reviews | Design approval, reviews, merge choice | Multiple agent hosts | Mandatory skill discovery and review loops | Single host/plugin assumptions |
| GSD | Context-engineered command loop | New project → discuss → plan → execute → verify | Fresh subagents | Project context and phase docs | Requirements/roadmaps/plans | Commands/prompts | Fresh contexts, not primarily FS | Verification loops | Phase gates | Multi-tool but Claude Code-centered | Context-rot mitigation and phase sizing | Permission model assumptions |
| matt-pocock/skills | Small engineering skills | Clarify → shared language → implement/debug/review | Skill-specific | `CONTEXT.md` and docs | Docs/tickets | Small reusable skills | Not primary | Engineering feedback loops | Clarification checkpoints | Agent-agnostic | Small practical skills and shared language | Over-process or verbose ceremonies |
| oh-my-openagent | Opinionated agent harness | Packaged workflows + hooks + routing | Multiple configured agents | Config, hooks, sessions | Harness config/docs | Agents, hooks, MCP tools | Runtime-dependent | Hooks/reviews | Workflow discipline | OpenCode-first, multi-model | Batteries-included defaults and hooks | Becoming a plugin distro |
| OpenSpec | Change artifact folder | Propose → apply → archive | Assistant commands | `openspec/changes/...` | Proposal, specs, design, tasks | Commands/skills | Not primary | Verify command and tasks | Propose/archive approvals | 25+ assistants | Artifact-guided lifecycle | Spec-only worldview |
| Pi / oh-my-pi | Terminal agent harness | Interactive/JSON/RPC/SDK; sessions and branches | Subagents | Session trees, config | Prompt/session artifacts | Skills/extensions/packages | Worktrees, FUSE overlay, ProjFS in oh-my-pi | Review command, LSP/tests | User steering and review | Multi-provider, embeddable | Adapter target and possible engine | Premature engine commitment |
| AgentFS | Agent filesystem | Init/mount/exec/run/sync | Not role-based | DB-backed filesystem | Filesystem state | MCP FS tools | Copy-on-write, overlay, sandbox | Inspect deltas/sync | Promotion by inspection | CLI/MCP | Sandbox backend design | Equating with git branches |

## Matrix conclusions

1. **Ultimate Harness should be artifact-first, not runtime-first.** OpenSpec, BMAD, superpowers, and GSD all succeed when important state survives outside chat.
2. **Runtime adapters must be structured, not shell-only.** Pi, oh-my-pi, and oh-my-openagent show rich runtime state; adapters need lifecycle, logs, artifacts, diffs, and verification reporting.
3. **Skills should be portable procedures with metadata.** superpowers and matt-pocock/skills show the value of small procedural units, but Ultimate Harness should allow richer machine-readable metadata over time.
4. **Sandboxing is a primary differentiator.** AgentFS and git worktrees should both be modeled because they isolate different classes of risk.
5. **BMAD is a workflow profile family.** It informs role mapping, but should not dominate the whole design.
