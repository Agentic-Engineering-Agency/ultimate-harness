# Ultimate Harness Agent Rules

Runtime-agnostic CLI and artifact lifecycle for planning, running, verifying, and promoting agentic software work.

Workspace standards apply here: [../docs/standards/README.md](../docs/standards/README.md).
This file adds only what is specific to this repo. Where they conflict, this file wins, and the conflict is recorded under `## Deviations`.

## Stack

- Language / runtime: strict TypeScript targeting Node.js 20+; Bun 1.3.14+ drives packaging and the OpenTUI/Solid TSX surface; plugin dashboard tests use Python and pytest.
- Framework / platform: Commander, Zod, YAML, OpenTUI/Solid, esbuild, Vitest, and a Hermes dashboard plugin.
- Runtime adapters: `hermes`, `codex`, `hermes-proxy`, `openrouter`, `pi`, and `oh-my-pi` are active; native `anthropic` is experimental.
- Package manager: Bun.

## Non-negotiables

- Keep `src/cli.ts` a thin dispatcher. Put lifecycle behavior in `src/harness/`, persisted contracts in `src/schema/`, and runtime-specific execution in `src/adapters/`.
- Start persisted YAML or JSON changes in the Zod schemas. The TUI consumes harness files and CLI-safe primitives; it must not create parallel contracts.
- Node-compatible CLI commands must work without Bun except `uh tui`, which intentionally spawns Bun for OpenTUI/Solid TSX execution.
- Keep the Hermes plugin on the public `uh` CLI and local `.harness/` artifacts, never private TUI internals. Keep its bundle small and dashboard-SDK based; do not bundle React or Hermes dashboard UI dependencies.
- Keep plugin Python tests isolated under `apps/hermes-plugin/dashboard/tests/` and install their dependencies from `apps/hermes-plugin/dashboard/requirements-dev.txt`.
- Never commit real secrets, provider keys, tokens, webhook secrets, Cloudflare IDs, database URLs, auth secrets, payment keys, or production-only credentials. Update `.env.example` with safe placeholders for new configuration.
- Do not deploy, migrate production, send real email, charge cards, invoke paid AI, contact prospects, trigger outbound workflows, publish locally, or add dependencies without explicit need and authorization.
- Runtime credentials stay outside UH artifacts; `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` come from the environment, and other adapter auth remains in its owning CLI or external session.
- Telemetry is PostHog-only, disabled by default, and enabled only with `UH_TELEMETRY=posthog` plus `UH_POSTHOG_API_KEY`; remove Opik or Bugsink assumptions.
- Telemetry may capture only sanitized command name, status, exit code, duration, package version, and platform metadata. Never capture repo paths, secrets, prompts, model output, agent responses, documents, raw payment data, or private legal or financial facts.
- Before editing a function, class, or method, run upstream `gitnexus_impact`, report callers, affected flows, and risk, and warn before proceeding on HIGH or CRITICAL risk; never ignore those warnings.
- Use `gitnexus_query` for unfamiliar concepts and `gitnexus_context` for symbol context. Rename with `gitnexus_rename`, never find-and-replace.
- Run `gitnexus_detect_changes()` before committing. If GitNexus reports a stale index, run `npx gitnexus analyze` first.

## Commands

| Purpose | Command |
|---|---|
| Install | `bun install --frozen-lockfile` |
| CLI help smoke | `bun run dev -- --help` |
| Typecheck | `bun run typecheck` |
| Build | `bun run build` |
| Test | `bun run test` |
| TUI spike | `bun run tui-spike` |
| Build plugin | `bun run plugin:build` |
| Watch plugin | `bun run plugin:watch` |
| Typecheck plugin | `bun run plugin:typecheck` |
| Install plugin test dependencies | `python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt` |
| Test plugin | `bun run plugin:test` |
| Publish dry run | `NPM_CONFIG_TOKEN=dry-run-token bun run publish:dry-run` |
| Clean | `bun run clean` |

## Verification gates

- Required for every change: the smallest relevant smoke plus `bun run typecheck` and `bun run test`.
- CLI and schema work must cover help/version, command parsing, `uh status --json`, malformed artifact rejection, and the built `dist/cli.js` package surface as applicable.
- Plugin work requires its build, typecheck, isolated Python tests, and bundle-size guard.
- Release preflight requires install, typecheck, build, tests, plugin typecheck/test, package metadata tests, and publish dry-run without writing to npm.

## Read order

1. `README.md` and `docs/quickstart.md`
2. `docs/architecture/` and the relevant runtime, TUI, plugin, telemetry, or runbook document
3. `specs/` for active specifications; specs do not live under `docs/`
4. GitNexus `context`, `clusters`, `processes`, or `process/{name}` resources for codebase and flow discovery
5. The matching `.claude/skills/gitnexus/` exploring, impact-analysis, debugging, refactoring, guide, or CLI skill before that task kind

## Scope discipline

- Default to small, reversible changes that reuse existing package and runtime patterns.
- Keep shipped `docs/`, tests, and plugin coverage current when their owned contract changes.
- The public package is `@agenticengineeringagency/ultimate-harness` and its bin is `uh`; do not alter release boundaries incidentally.

## Command Code (alternate harness)

Command Code is an **alternate** executor available in this repo, admitted for a named
capability gap (taste learning, checkpoints/rewind, plan-mode review, headless `cmd -p` runs,
native MCP with per-server permission gating). It reads this `AGENTS.md` as its memory file, so
this file remains the single instruction source. It is **not** the default — OMP is. The
generated `.commandcode/settings.json` mirrors the OMP discipline in Command Code's permission
rules and is materialized from `scripts/harness-matrix.json`; never hand-edit it. See
`docs/standards/harness.md` (Command Code section) and `docs/research/command-code-evaluation.md`.

## Deviations

- GitNexus impact analysis is mandatory before symbol edits because this repo relies on its indexed cross-runtime execution graph.
