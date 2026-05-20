# Hermes Dashboard Plugin for Ultimate Harness

Drop-in extension for the [Hermes Agent dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard) that exposes UH end-to-end from the web UI: adapter health, mission list, mission run trigger + live event tail, artifact drilldown (prompt / final message / diff / runtime-result / events / verification), workflow viewer + editor, mission wizard, and a `sessions:bottom` slot that deep-links Hermes sessions back to their UH missions.

## Install (one-liner)

```bash
# Latest release tarball will publish to GitHub Releases (UH-68).
mkdir -p ~/.hermes/plugins/uh && \
  curl -sSL https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/latest/download/hermes-plugin.tar.gz \
  | tar -xz -C ~/.hermes/plugins/uh --strip-components=2

# Also install the matching theme:
mkdir -p ~/.hermes/dashboard-themes && \
  cp ~/.hermes/plugins/uh/dashboard/../theme/ultimate-harness.yaml ~/.hermes/dashboard-themes/

# Force-rescan so the dashboard picks it up without a restart.
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

Until UH-68 publishes a tarball, the canonical install path is a symlink from the worktree:

```bash
ln -snf "$PWD/apps/hermes-plugin/dashboard" ~/.hermes/plugins/uh/dashboard
ln -snf "$PWD/apps/hermes-plugin/theme/ultimate-harness.yaml" ~/.hermes/dashboard-themes/ultimate-harness.yaml
```

Now refresh the dashboard at `http://127.0.0.1:9119/` — the **Ultimate Harness** tab appears after **Sessions**.

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
