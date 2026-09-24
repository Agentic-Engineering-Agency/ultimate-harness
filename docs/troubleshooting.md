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

## `Invalid mission id` From `run-team`, `report` Or `steer`

`uh mission run-team` takes a mission id (`wave-a`), not a path to `mission.yaml`. `uh report` and `uh steer` take a run id or a unique prefix of one, not a mission id; find it with `uh ps --all`.

## `mission put` Refuses A Team Packet

A team packet installs its worker packets only when they are given in the same call:

```sh
uh mission put team.yaml worker-a.yaml worker-b.yaml
```

## `uh land` Says There Is No Collected Review

`uh land` reads collected reviews from the project that owns the worker worktrees. If the reviews live somewhere else, pass that project explicitly:

```sh
uh land --worker-branch <branch> --onto <target> --message-file <file> --review-root <project>
```

A review counts only when it names the branch's team mission and its captured file hashes match the branch tip; after any change to a reviewed file, collect a new review. `uh land` also refuses a dirty target worktree and a worker branch without a retained worktree; run teams with `--retain`.

## Command Code Exits With `write EOF`

Command Code 1.62.1 crashes after a single tool result of roughly 70K characters or more ([CommandCodeAI/command-code#859](https://github.com/CommandCodeAI/command-code/issues/859)). The guard makes large file reads windowed; keep shell output small in Command Code packets (no recursive listings, no whole-file dumps, no full test-suite output).

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
