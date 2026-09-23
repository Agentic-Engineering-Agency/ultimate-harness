---
title: 'Surfaces: TUI, plugin, MCP'
description: The human and machine interfaces over the .harness store, and the rule that keeps them honest.
---

The rule: **surfaces read harness files and call the public CLI; they never define their own contracts.** That keeps every surface consistent with `uh status` and keeps the CLI the single writer.

## CLI

The primary surface. Every command that prints structured output has a `--json` form with a versioned schema id (`uh.status.v0`, `uh.ps.v0`, ...), and `uh mission run` ends with a single `UH_RESULT {json}` line and a meaningful exit code, so other agents and scripts can drive UH. See the [CLI reference](/reference/cli/).

## TUI: Mission Control

`uh tui` spawns Bun to run `src/tui/index.tsx` with OpenTUI and Solid. It is the one command that requires Bun; everything else runs on Node 20+. `uh tui --once` prints a single frame, and `uh tui screenshot --view overview|missions|sandboxes|workflows` renders a view for docs and tests. Main files: `model.ts` and `state.ts` (read-only projections of `.harness/`), `dashboard.tsx`, `run-orchestrator.ts` (starts runs through the CLI). See [TUI architecture](/source/docs/architecture/tui/) and [using the TUI](/source/docs/runbooks/using-the-tui/).

## Hermes dashboard plugin

`apps/hermes-plugin/` plugs a Delivery Observatory into the Hermes Agent dashboard.

- **Backend:** `dashboard/plugin_api.py`, a FastAPI router that shells out to `uh` (path from `UH_CLI_BIN`). Routes cover status, observatory snapshot, adapter capabilities, missions, runs (including active runs and SSE event tails), run, cancel, compare, workflows and verification.
- **Frontend:** `dashboard/src/*.tsx`, bundled by esbuild into `dashboard/dist/`. It uses the Hermes dashboard SDK; React and Hermes UI dependencies are not bundled, which keeps the bundle small (a size guard enforces it).
- **Tests:** isolated pytest suite in `dashboard/tests/`; `bun run plugin:test`.
- **Releases:** tagged separately as `plugin-vX.Y.Z` by `release-plugin.yml`. The plugin still reports version 0.9.0 on the v0.11 line.

See [plugin development](/source/docs/plugin-development/) and the [dashboard runbook](/source/docs/runbooks/hermes-dashboard-plugin/).

## MCP server (v0.11)

`uh mcp serve` answers newline-delimited JSON-RPC on stdio (protocol revisions 2026-07-28 stateless and 2025-11-25) with three read-only tools: `uh_status`, `uh_runs`, `uh_run`. Identifiers are validated before any path is built, every returned path is relative to the project, and no prompt, runtime output or file content is returned. It lets an MCP client (an IDE agent, Claude, a dashboard) watch runs without being able to change them.

## Library

`src/index.ts` exports a small programmatic API: init, status, validate, verify, promote, paths and the adapter registry. The package has no `exports` map yet, which is a [debt item](/release/debt/) before 1.0 promises the library surface.

## This documentation site

`apps/site/`, an Astro Starlight static site on Cloudflare. See [This site](/contributing/site/).
