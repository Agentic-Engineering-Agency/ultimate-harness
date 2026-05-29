# Ultimate Harness Agent Guide

## Repo Map

- `src/cli.ts` is the `uh` command surface. Keep it as a thin dispatcher over harness modules.
- `src/harness/` owns project initialization, schemas, runtime dispatch, mission lifecycle, verification, promotion, sandboxes, drift validation, and telemetry helpers.
- `src/adapters/` owns runtime-specific execution for `hermes`, `codex`, `hermes-proxy`, `openrouter`, `pi`, and `oh-my-pi`.
- `src/schema/` owns Zod-backed artifact contracts. Persisted YAML/JSON changes should start here.
- `src/tui/` owns the OpenTUI/Solid Mission Control surface. It reads harness artifacts and calls CLI-safe primitives; it must not invent separate data contracts.
- `apps/hermes-plugin/` owns the Hermes dashboard plugin. TypeScript dashboard code bundles through esbuild; `dashboard/plugin_api.py` is tested with isolated pytest fixtures.
- `docs/` is shipped in the npm package. Keep quickstart, configuration, runtime, TUI, plugin, telemetry, troubleshooting, architecture, and runbooks current.
- `tests/` is Vitest coverage for CLI, schemas, runtime adapters, TUI model/state, packaging, and plugin bundle smoke.

## Runtime Support Matrix

| Runtime | Adapter | Status | Credential Boundary |
| --- | --- | --- | --- |
| Hermes Agent | `hermes` | active | Local Hermes CLI/config only. |
| Codex CLI | `codex` | active | Codex auth stays outside UH artifacts. |
| Hermes Proxy | `hermes-proxy` | active | Endpoint/model in manifest; OAuth/session secrets outside repo. |
| OpenRouter | `openrouter` | active | `OPENROUTER_API_KEY` from environment only. |
| Pi CLI | `pi` | active | Provider auth outside repo. |
| oh-my-pi | `oh-my-pi` | active | User opt-in runtime; auth outside repo. |

Node-compatible CLI commands must continue to work without Bun except `uh tui`, which intentionally spawns Bun for OpenTUI/Solid TSX execution.

## TUI And Plugin Boundaries

- TUI code consumes harness files and primitives; schema or artifact changes belong in `src/schema/` and `src/harness/` first.
- The Hermes plugin consumes the public `uh` CLI and local `.harness/` artifacts. Do not make it depend on private TUI internals.
- Plugin dashboard tests are Python-only and isolated under `apps/hermes-plugin/dashboard/tests/`; install their dependencies from `apps/hermes-plugin/dashboard/requirements-dev.txt`.
- Keep plugin bundles small and dashboard-SDK based. Do not bundle React or Hermes dashboard UI dependencies.

## Safety Rules

- Never commit real secrets, provider keys, tokens, webhook secrets, Cloudflare IDs, database URLs, auth secrets, payment keys, or production-only credentials.
- Do not deploy, run production migrations, send real emails, charge cards, invoke paid AI calls, contact prospects, or trigger outbound workflows unless explicitly requested.
- Update `.env.example` with safe placeholders when adding configurable environment variables.
- Prefer small, reversible changes and existing package/runtime patterns. Do not add dependencies without a clear need.
- Remove Opik/Bugsink assumptions if found. Telemetry must be PostHog-only, off by default, and opt-in.

## Optional Telemetry Rules

- Telemetry is disabled by default.
- Opt in with `UH_TELEMETRY=posthog` plus `UH_POSTHOG_API_KEY`.
- Capture aggregate command outcomes only: sanitized command name, status, exit code, duration, package version, and platform metadata.
- Never capture repo paths, config secrets, prompts, model outputs, agent responses, uploaded documents, raw payment data, or private legal/financial facts.

## Commands

```sh
bun install --frozen-lockfile
bun run dev -- --help
bun run typecheck
bun run build
bun run test
bun run tui-spike
bun run plugin:build
bun run plugin:watch
bun run plugin:typecheck
python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt
bun run plugin:test
NPM_CONFIG_TOKEN=dry-run-token bun run publish:dry-run
bun run clean
```

## Validation Checklist

- CLI help/version smoke passes.
- Command parsing and `uh status --json` tests pass.
- Schema/config validation rejects malformed files.
- Built package exposes `dist/cli.js`.
- Plugin bundle builds and remains under the bundle-size guard.
- Plugin Python tests pass from an isolated test environment.
- Publish dry-run succeeds without writing to npm.

## Release Boundaries

- Public package: `@agenticengineeringagency/ultimate-harness`.
- Bin command: `uh`.
- Release preflight: install, typecheck, build, tests, plugin typecheck/test, package metadata tests, publish dry-run.
- Publishing requires npm token configuration in CI; dry-runs use a dummy token-shaped value.
- Do not publish from local work unless explicitly requested.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ultimate-harness** (6349 symbols, 9711 relationships, 299 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ultimate-harness/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ultimate-harness/clusters` | All functional areas |
| `gitnexus://repo/ultimate-harness/processes` | All execution flows |
| `gitnexus://repo/ultimate-harness/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
