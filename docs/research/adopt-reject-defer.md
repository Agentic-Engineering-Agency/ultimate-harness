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
| Three-verdict runtime-result status (`pass / needs-attention / needs-remediation`) + manual `uh mission verdict` override | The middle state is a known UH gap; today's binary `passed/failed` (with `blocked` as a side-channel) hides operator-actionable failures. The override is the standard recovery path for paused validation. | gsd-pi (`/gsd verdict`, ADR-017) |
| Drift detection + idempotent repair registry for `uh validate` | UH's `uh validate` is single-pass and catches schema drift only. GSD-2's six-kind drift registry (`stale-worker`, `unregistered-milestone`, `roadmap-divergence`, `missing-completion-timestamp`, `merge-state`, `stale-render`) with cap=2 retry-then-settle is the right shape for catching orphaned worktrees, ROADMAP↔Linear drift, missing completion timestamps, and similar consistency bugs. | gsd-pi (ADR-017) |
| `uh status --json` LLM-less query mode | Returns phase / next dispatch / cost as JSON without spawning a model call (~50ms). Lets the Hermes Dashboard plugin (Epic 3, UH-62 backend) poll one endpoint instead of multiple subcommands. | gsd-pi (`gsd headless query`) |
| Canonical `docs/VISION.md` with explicit "what we won't accept" | Tightens contributor expectations and inhibits enterprise-pattern creep. UH's principles today are scattered across `docs/architecture/` and `docs/product/`. | gsd-pi VISION.md |

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
| SQLite DB as authoritative runtime state | UH's YAML/JSON artifact model is intentionally diffable and reviewable in git; trading that for DB authority is a different product. Revisit only if drift bugs make the artifact model untenable. |
| Branchless worktree architecture | UH-72 is committed to branch-per-worker for cross-runtime parity and integration-report traceability. The branchless model is a coherent alternative for single-runtime harnesses, not multi-adapter ones. |
| External state directory | UH's `.harness/` lives in-repo on purpose so mission artifacts are git-trackable and PR-reviewable. External state hurts portability. |
| `$GSD` / on-chain token coupling | Out of scope for UH; no tokenomics layer planned. |

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
| Migrating UH to Pi SDK as the engine | Already deferred; GSD-2 proves Pi SDK is viable for a serious harness, but UH stays adapter-portable until adapter contract is mature. | After adapter contract conformance tests exist and there are no remaining adapter-specific behavior gaps. |
| Bundled VS Code extension + 10-tab web visualizer | UH's TUI + Hermes Dashboard plugin (Epic 3) already cover the operator surfaces. | If operator demand for IDE-side integration outweighs the maintenance load. |
| Auto-mode multi-mission state machine (auto-advance across many missions) | UH today runs single missions explicitly invoked. `gsd auto` shows what cross-mission autopilot looks like; needs a clear UH product story before being built. | After Epic 3 + Epic 4 ship and operators ask for it. |
| Two-terminal coordination via shared DB | Requires the SQLite authority pattern above; deferred together. | Same as the SQLite item. |
