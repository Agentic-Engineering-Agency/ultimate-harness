# Plugin Development

The Hermes dashboard plugin lives under `apps/hermes-plugin/` and consumes the public `uh` CLI plus `.harness/` artifacts.

## Layout

```text
apps/hermes-plugin/
  esbuild.config.mjs
  dashboard/
    manifest.json
    plugin_api.py
    requirements-dev.txt
    src/
    tests/
  theme/
    ultimate-harness.yaml
```

## Development Commands

```sh
bun run plugin:build
bun run plugin:watch
bun run plugin:typecheck
python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt
bun run plugin:test
```

`plugin:build` writes `dashboard/dist/index.js` and `dashboard/dist/style.css`. The bundle is size-guarded by Vitest and should keep React/Hermes dashboard UI dependencies external through `window.__HERMES_PLUGIN_SDK__`.

## Python Test Isolation

The plugin API tests use FastAPI/httpx fixtures and fake the `uh` runner. They should not call a real runtime, mutate a developer's home directory, or depend on a live Hermes dashboard.

The test-only Python dependencies are pinned by role in `dashboard/requirements-dev.txt`. Runtime dependencies are supplied by the Hermes dashboard host process when the plugin is installed.

## Boundaries

- The plugin may shell out to `uh`; it should not import private CLI internals.
- Keep backend endpoints bounded to `.harness/` state and explicit mission run requests.
- Do not forward secrets, prompts, or full agent output to telemetry or third-party services.

See [`runbooks/hermes-dashboard-plugin.md`](./runbooks/hermes-dashboard-plugin.md) for operator install and troubleshooting.
