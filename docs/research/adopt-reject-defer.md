# Adopt / Reject / Defer Decision Log

## Adopt now

| Decision | Rationale | Source influence |
|---|---|---|
| Artifact-first docs/specs/plans | Prevents semantics from living only in chat context. | OpenSpec, BMAD, GSD |
| Runtime-agnostic adapter contract | Allows Codex, Claude Code, Pi, oh-my-pi, Hermes, and future runtimes. | Pi, oh-my-pi, OpenSpec, superpowers |
| Mission packet as portable work unit | Gives every runtime the same goal, constraints, context, checks, and expected outputs. | GSD phase plans, OpenSpec changes, BMAD workflows |
| Sandbox abstraction | Safe agent work requires isolated changes and promotion control. | AgentFS, superpowers worktrees, oh-my-pi isolation |
| Verification and promotion lifecycle | Agent output is not done until checked and approved. | superpowers reviews, OpenSpec verify/archive, AgentFS inspect/promote model |
| BMAD-style roles as workflow roles | Analyst/PM/Architect/QA/Writer roles are useful for docs and planning. | BMAD Method |
| Human-readable first, machine-readable second | Early schemas should be understandable before they are frozen. | OpenSpec, matt-pocock/skills |
| Staged workflow profile family (`plan → prd → exec → verify → fix`) | Both OMC and OMX prove a named staged pipeline beats free-form prompting for orchestrable work. Lands next to `tdd` (UH-55) and `qa` (UH-56). | oh-my-claudecode, oh-my-codex |
| Adversarial QA workflow profile (`adversarial-qa`) | Hostile-scenario modeling + prompt-injection + interrupt/resume coverage + cleanup evidence is a discipline UH does not yet have. Complementary to UH-56 cross-runtime QA. | oh-my-codex (`$ultraqa`) |
| `team N:role` mission shape with adapter-bound workers | Lets a single mission fan out across multiple adapters with worktree-isolated workers; the leader integrates. Extends UH-56 `mission run-all` from comparison to collaboration. | oh-my-claudecode, oh-my-codex |
| Per-worker worktree auto-isolation as default for fan-out | Makes the safe-by-default behavior explicit, not opt-in. Matches UH-43's sandbox manager and UH-25's worktree mode. | oh-my-codex (`.omx/team/<name>/worktrees/worker-N`) |
| Companion `design.md` artifact alongside `mission.yaml` | Materializes design intent in a versioned file instead of a chat scrollback. Tightens UH-54's SDD acceptance criteria contract. | oh-my-codex (`$design` + `DESIGN.md`) |

## Reject for MVP

| Rejected idea | Why |
|---|---|
| A single blessed runtime | Violates runtime-agnostic direction. |
| A full autonomous mega-orchestrator | Too early; artifact model and adapters must be proven first. |
| Treating BMAD as the whole product | BMAD is one inspiration system, not the harness ontology. |
| Direct mutation of canonical working tree by agents | Undermines sandboxing, review, auditability, and promotion. |
| Tool-specific slash commands as core API | Slash commands can be adapters, but core contracts should be data/API driven. |
| Opaque agent transcripts as the only audit log | Audit records must include structured evidence and promoted artifacts. |
| Mode-flag profiles (`--yolo`/`--high`/`--xhigh`/`--madmax`) | UH's `runtime_config.thinking` is already typed and reviewable; slang flags hide real configuration. |
| Single multiplexer as the worker host contract (tmux-only) | `omx-mux` ties worker coordination to tmux. UH workers stay multiplexer-agnostic — tmux is one host, not the contract. |
| `swarm` / `ralph` / `ralplan` / `ulw` as core vocabulary | Useful as workflow-profile names, but UH's canonical nouns remain `mission` and `workflow`. |

## Defer

| Deferred idea | Why defer | Revisit when |
|---|---|---|
| Choosing TypeScript/Rust/Python package architecture | Docs should justify runtime choices first. | Adapter contract and CLI MVP are ready. |
| Full AgentFS integration | Need a sandbox interface and git worktree baseline first. | Worktree sandbox is modeled and verification lifecycle is stable. |
| Web dashboard | CLI/docs/artifact discipline are more important now. | Audit trail and mission status format are stable. |
| Two-way Linear/GitHub sync automation | Useful but not core product semantics. | Product docs and issue metadata conventions are stable. |
| Runtime marketplace | Requires stable adapter manifest and conformance tests. | At least two adapters exist. |
| Discord / Telegram / Slack notification integrations | Useful operator surface but post-MVP; do not displace artifact-first audit. | After UH-Epic 3 (Hermes Dashboard) ships and the artifact pipeline is the canonical surface. |
| `omx` / `omc`-style native plugin marketplace integration | UH already targets the Hermes Dashboard plugin path (Epic 3). | After Epic 3 lands and we have signal on operator demand. |
| Per-language shell registry (OMX `omx-sparkshell` registries) | Useful but UH's verification.checks already cover this via mission-declared commands. | If UH ever needs runtime-aware command suggestion. |
