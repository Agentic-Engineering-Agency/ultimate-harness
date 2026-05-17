# Ultimate Harness — Roadmap

Last updated: 2026-05-17. Source of truth for issue state is [Linear](https://linear.app/agentic-eng); this file is a human-readable index.

## Now

Two epics in flight, executed in order (TUI follows hermes-proxy because the dashboard view needs a stable adapter surface to render).

### Epic 1 — Hermes proxy adapter ([UH-32](https://linear.app/agentic-eng/issue/UH-32))

Ship a UH adapter targeting Hermes v0.14.0's `hermes proxy` local OAI-compatible endpoint. Cleanest ToS-positioned path to Claude Pro / ChatGPT Pro / SuperGrok subscription routing — Hermes's officially sanctioned bypass, not OMP's stealth surface.

| Step | Issue | Slice | Size |
|---|---|---|---|
| 1 | [UH-36](https://linear.app/agentic-eng/issue/UH-36) | Spike: probe `hermes proxy` end-to-end, document the wire | S (4h) |
| 2 | [UH-35](https://linear.app/agentic-eng/issue/UH-35) | Schema + manifest + template + dispatch stub | S |
| 3 | [UH-39](https://linear.app/agentic-eng/issue/UH-39) | Adapter implementation: planner, runner, parser, sentinel, blocked classification | M |
| 4 | [UH-37](https://linear.app/agentic-eng/issue/UH-37) | CLI dispatch: replace stub, sandbox routing parity, `[BLOCKED]` shape | S |
| 5 | [UH-40](https://linear.app/agentic-eng/issue/UH-40) | Architecture doc + setup runbook | S |
| 6 | [UH-38](https://linear.app/agentic-eng/issue/UH-38) | E2E smoke + adapter promotion to `status: active` | S |

### Epic 2 — Interactive TUI for UH ([UH-41](https://linear.app/agentic-eng/issue/UH-41))

Build `uh tui` on [OpenTUI](https://opentui.com) — the same engine OpenCode uses in production (native Zig core, TypeScript bindings, Bun-first, MIT-licensed). Replaces today's `cat`-driven mission review with a navigable live terminal app using OpenTUI's `Diff`, `Code` (tree-sitter), `ScrollBox`, `Select`, and `Input` components.

| Step | Issue | Slice | Size |
|---|---|---|---|
| 1 | [UH-45](https://linear.app/agentic-eng/issue/UH-45) | Spike: install opentui, framework choice (vanilla / React / Solid), hello-world bound to UH state | S |
| 2 | [UH-46](https://linear.app/agentic-eng/issue/UH-46) | Dashboard: live adapters + missions + sandboxes (three-pane) | M |
| 3 | [UH-47](https://linear.app/agentic-eng/issue/UH-47) | Mission browser: drilldown with `Code` + `Diff` viewers | M |
| 4 | [UH-44](https://linear.app/agentic-eng/issue/UH-44) | Mission run flow: trigger from TUI, stream events live | M |
| 5 | [UH-43](https://linear.app/agentic-eng/issue/UH-43) | Adapter + sandbox manager: live checks, create/discard from inside | M |
| 6 | [UH-42](https://linear.app/agentic-eng/issue/UH-42) | Polish: keymap overlay, theming, error states, exit handling, Agent Skill install | S |

## Shipped this cycle (2026-05-13 → 2026-05-17)

| Issue | Title |
|---|---|
| UH-23 | Codex adapter — CLI transport via `codex exec` |
| UH-24 | Cancelled (Anthropic ToS friction; superseded by UH-27 + UH-32) |
| UH-25 | oh-my-pi adapter + `runtime_config` bucket + dispatch table + sandbox routing parity |
| UH-26 | Per-runtime strict `runtime_config` validation (typo safety) |
| UH-27 | Per-mission `runtime_config_overrides` + Anthropic-via-OMP path |
| UH-28 | Runtime-final-message capture protocol (shared sentinel) |
| UH-29 | `createSandbox` seeds bound mission into the worktree |
| UH-30 | Codex CLI flag drift + child-stdin close + codex `status: active` |
| UH-31 | Minimum Hermes ≥ 0.14.0 version pin |
| UH-33 | `runtime_config_overrides` parity for hermes + codex |
| UH-34 | Diff capture includes untracked new files |

**Adapter status as of this cycle:**

| Adapter | Status |
|---|---|
| hermes | active (pinned ≥ 0.14.0) |
| codex | active (verified against codex-cli 0.130.0 in UH-30 smoke) |
| oh-my-pi | experimental |

## Medium-term proposals (not filed)

These are tracked in narrative form until they earn the priority to be filed:

- **Native ANTHROPIC_API_KEY adapter** — mostly superseded by UH-32 for subscription users; file only if pay-per-token demand surfaces.
- **OpenRouter / Vercel AI Gateway adapter** — cheapest pay-per-token path; complementary to UH-32.
- **Cross-runtime QA harness** — `uh mission run-all --runtimes hermes,codex,oh-my-pi,hermes-proxy <file>` with side-by-side diff/sentinel comparison.
- **Sandbox backend abstraction** — `directory` and `container` backends alongside `git-worktree`.
- **Verify-then-promote auto-trigger** — opt-in workflow-driven auto-promote gate.
- **Cleanup design-only `claude-code` stub** — redundant after UH-27 + UH-32.

## Strategic (decisions needed)

- **Pi adapter implementation** — design-only stub today; tied to OMP cadence.
- **Mission capability declarations + adapter matching enforcement** — manifest `capabilities:` is advisory-only today.
- **Muta integration** — UH-as-consumer, UH-as-component, or independent? Needs a co-founder conversation.

## References

- [Documentation home](./README.md)
- [Architecture overview](./architecture/overview.md)
- [Runtime adapter contract](./architecture/runtime-adapter-contract.md) (includes UH-28 sentinel protocol)
- [Codex E2E smoke runbook](./runbooks/codex-e2e-smoke.md)
- [Anthropic-via-OMP runbook](./runbooks/anthropic-via-omp.md) (notes the ToS posture that UH-32's hermes-proxy supersedes)
