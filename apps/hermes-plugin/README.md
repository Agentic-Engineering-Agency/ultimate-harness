# Hermes Dashboard Plugin for Ultimate Harness

Drop-in extension for the [Hermes Agent dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard) that exposes UH end-to-end from the web UI: adapter health, mission list, mission run trigger + live event tail, artifact drilldown (prompt / final message / diff / runtime-result / events / verification), a sortable Recent runs pane with status-chip + run_id prefix filters that deep-links into per-run artifacts, workflow viewer + editor, mission wizard, and a `sessions:bottom` slot that deep-links Hermes sessions back to their UH missions.

## Install from source

```bash
cd /absolute/path/to/ultimate-harness
bun run plugin:build
apps/hermes-plugin/hermes-local.sh enable

# Keep the observed project explicit. This stays in the foreground and does
# not install a login item or LaunchAgent.
UH_PROJECT_ROOT=/absolute/path/to/harness-project \
  apps/hermes-plugin/hermes-local.sh start
```

`enable` links the complete `apps/hermes-plugin/` package at
`~/.hermes/plugins/uh`, links the theme, and runs
`hermes plugins enable uh --no-allow-tool-override`. A normal dashboard start
discovers the UI and mounts the backend together; the old dashboard-only
symlink plus unauthenticated rescan is not a complete Hermes plugin install.

Useful lifecycle commands:

```bash
apps/hermes-plugin/hermes-local.sh status
apps/hermes-plugin/hermes-local.sh disable
apps/hermes-plugin/hermes-local.sh enable
apps/hermes-plugin/hermes-local.sh rollback
```

`disable` preserves the links. `rollback` disables UH and removes only links
that resolve to this package; it refuses to replace or remove unmanaged paths.
After `start`, open `http://127.0.0.1:9119/uh` — the **Ultimate Harness** tab
appears after **Sessions**.

## Hermes 0.20.5 packaging compatibility

Hermes discovers a dashboard-only directory for rendering, but its plugin CLI
does not consider that directory an installed plugin. With only
`~/.hermes/plugins/uh/dashboard`, Hermes Agent v0.20.5 reports:

```text
$ hermes plugins enable uh --no-allow-tool-override
Plugin 'uh' is not installed or bundled.
```

The package therefore includes a root `plugin.yaml` plus a no-op
`__init__.py`. The manifest declares metadata only—no tools, hooks,
capabilities, environment access, or replacement authority. The Python
registration seam intentionally registers nothing; dashboard actions continue
to use the public `uh` CLI and `.harness/` artifacts.

## Development loop

```bash
bun run plugin:build      # one-shot esbuild bundle -> dashboard/dist/
bun run plugin:watch      # rebuild on save
bun run plugin:test       # pytest on dashboard/tests/
bun run plugin:typecheck  # tsc against dashboard/tsconfig.json
```

The Python backend lives in `dashboard/plugin_api.py` and exposes a FastAPI `APIRouter` the dashboard auto-mounts at `/api/plugins/uh/`. The TypeScript bundle lives in `dashboard/src/` and is compiled to a minified IIFE in `dashboard/dist/index.js` (≤ 50 KB, React/UI-kit external — both come from `window.__HERMES_PLUGIN_SDK__`).

See [`docs/runbooks/hermes-dashboard-plugin.md`](../../docs/runbooks/hermes-dashboard-plugin.md) for the full operator runbook (install, troubleshooting, screenshots).

## Layout

```
apps/hermes-plugin/
├── plugin.yaml             # Hermes package identity; metadata only
├── __init__.py             # no-op native registration seam
├── hermes-local.sh         # reversible local link + lifecycle helper
├── dashboard/
│   ├── manifest.json       # tab metadata
│   ├── src/                # TSX sources (bundled by esbuild)
│   ├── dist/               # esbuild output (gitignored except for releases)
│   ├── plugin_api.py       # FastAPI router (UH-62)
│   ├── tests/              # pytest suite
│   └── tsconfig.json       # editor IntelliSense only; NOT in repo typecheck
├── theme/
│   └── ultimate-harness.yaml  # UH-69 theme
└── esbuild.config.mjs      # bundle build script
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `UH_PROJECT_ROOT` | `os.getcwd()` of the dashboard | Where `.harness/` is rooted. Defaults to the dashboard's working directory. |
| `UH_CLI_BIN` | `uh` | Path to the `uh` binary. Set this if the dashboard host doesn't have `uh` on `$PATH`. |
| `UH_READ_TIMEOUT_S` | `30` | Timeout (seconds) for read commands (`uh adapter check`, etc.). |
| `UH_RUN_TIMEOUT_S` | `3600` | Timeout for `uh mission run`. |
| `UH_MAX_ARTIFACT_BYTES` | `5242880` (5 MB) | Cap on artifact bodies served to the UI. Larger files return HTTP 413. |
| `UH_MAX_OVERRIDES_JSON_BYTES` | `8192` | Cap on the `runtime_config_overrides` JSON forwarded to `uh mission run`. |

### Manifest `config` block

`apps/hermes-plugin/dashboard/manifest.json` exposes a `config` object the dashboard reads at plugin-load:

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `max_runs_per_mission` | `int \| null` | `null` (unlimited) | Retention cap (UH-90). Before each new run the plugin prunes oldest per-run dirs back to this many; the `runs/index.json` entries persist with `archived: true` so the audit trail survives. `0` is treated as `null` (unlimited) with a load-time warning. JSON has no comments, so the cap is documented here. |
