---
title: Working in the repo
description: Commands, gates and rules for changing Ultimate Harness itself.
---

The authoritative rules are in [`AGENTS.md`](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/main/AGENTS.md) (loaded by Claude Code through `CLAUDE.md`, by Command Code as its memory file, and by oh-my-pi). This page summarizes them and adds the context a new maintainer needs.

## Where code goes

| Change | Put it in | Not in |
|---|---|---|
| A new command | a command module that `src/cli.ts` registers | inline in `src/cli.ts` |
| Lifecycle behavior | `src/harness/` | the CLI or an adapter |
| A persisted YAML or JSON shape | a Zod schema in `src/schema/` first, then the code that writes it | an ad-hoc object |
| Runtime-specific execution | `src/adapters/<runtime>.ts` (+ manifest capabilities) | `src/harness/` |
| A human surface | `src/tui/` reading harness files, or the Hermes plugin calling the public `uh` CLI | private TUI internals, new parallel contracts |

`src/cli.ts` is supposed to be a thin dispatcher. It is 1,803 lines on `main` and 3,709 on the v0.11 line, so splitting it is item one on the [debt register](/release/debt/).

## Commands

| Purpose | Command |
|---|---|
| Install | `bun install --frozen-lockfile` |
| CLI help smoke | `bun run dev -- --help` |
| Typecheck | `bun run typecheck` |
| Build | `bun run build` |
| Test | `bun run test` |
| Plugin build / typecheck / test | `bun run plugin:build`, `bun run plugin:typecheck`, `bun run plugin:test` |
| Plugin Python deps | `python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt` |
| Publish dry run | `NPM_CONFIG_TOKEN=dry-run-token bun run publish:dry-run` |
| Docs site | `cd apps/site && bun run build` |

## Gates

- **Every change:** the smallest relevant smoke, `bun run typecheck`, `bun run test`.
- **CLI or schema work:** help and version, command parsing, `uh status --json`, malformed-artifact rejection, and the built `dist/cli.js` surface.
- **Plugin work:** build, typecheck, isolated Python tests and the bundle-size guard.
- **Release preflight:** install, typecheck, build, tests, plugin typecheck and tests, package metadata tests, and a publish dry run. Nothing is written to npm from a laptop.

CI (`.github/workflows/ci.yml`) runs all of these on Blacksmith runners for every PR.

## Hard rules

- Never commit secrets, provider keys, tokens, Cloudflare IDs or database URLs. New configuration gets a safe placeholder in `.env.example`.
- Do not deploy, publish, invoke paid AI, or add dependencies without an explicit need and authorization.
- Runtime credentials stay outside `.harness/`.
- Telemetry is PostHog only, off by default (`UH_TELEMETRY=posthog` plus `UH_POSTHOG_API_KEY`), and may record only command name, status, exit code, duration, package version and platform.
- Node-compatible commands must work without Bun, except `uh tui`.

## GitNexus

**Optional** (owner decision, 2026-09-23). When GitNexus tools are available, upstream `gitnexus_impact` before changing a widely used symbol and `gitnexus_detect_changes()` before committing are useful checks; without them, use grep. Most workers cannot run GitNexus and their guard may deny it, which is why the mandatory rule was dropped.

`main`'s `AGENTS.md` still says mandatory until the v0.11 stack merges; PR [#246](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/246) (commit `ffc1f8d`) carries the change.

## Agent configuration directories

The repo carries configuration for several agent harnesses. They are generated or mirrored, not independent:

| Directory | For | Source |
|---|---|---|
| `.harness/` | UH itself: project, adapters, workflows, missions, templates | hand-edited, schema-validated |
| `.omp/` | oh-my-pi, the default harness | workspace standards |
| `.commandcode/settings.json` | Command Code (alternate) | generated from `scripts/harness-matrix.json`, never hand-edit |
| `.claude/` | Claude Code skills (GitNexus) | generated |
| `.hermes/` | Hermes Agent | workspace standards |
