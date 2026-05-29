# Troubleshooting

## `uh` Is Not Found

Confirm the global Bun bin directory is on PATH:

```sh
bun pm bin -g
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

For local development, build first:

```sh
bun run build
node dist/cli.js --help
```

## `uh tui` Says Bun Is Required

The CLI is Node-compatible, but the OpenTUI/Solid TUI intentionally runs through Bun so TSX can load with the Solid preload.

```sh
bun --version
uh tui --once
```

## Adapter Check Fails

Use the runtime-specific runbook:

- [`runbooks/codex-e2e-smoke.md`](./runbooks/codex-e2e-smoke.md)
- [`runbooks/hermes-proxy-setup.md`](./runbooks/hermes-proxy-setup.md)
- [`runbooks/openrouter-setup.md`](./runbooks/openrouter-setup.md)
- [`runbooks/pi-setup.md`](./runbooks/pi-setup.md)
- [`runbooks/anthropic-via-omp.md`](./runbooks/anthropic-via-omp.md)

Do not put provider keys into adapter manifests. Use environment variables or the runtime's own credential store.

## Plugin Tests Cannot Import FastAPI Or httpx

Install the plugin test dependencies:

```sh
python -m pip install -r apps/hermes-plugin/dashboard/requirements-dev.txt
bun run plugin:test
```

The tests use fake runners and isolated temp `.harness/` state; failures usually indicate missing Python dependencies or a plugin API regression.

## Publish Dry-Run Requires A Token

Scoped package dry-runs expect a token-shaped value. CI uses a dummy value for dry-runs:

```sh
NPM_CONFIG_TOKEN=dry-run-token bun run publish:dry-run
```

Real publishing requires the `NPM_CONFIG_TOKEN` repository secret and should only run through the release workflow.
