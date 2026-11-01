# Quickstart

Ultimate Harness ships the `uh` CLI for runtime-agnostic agentic engineering workflows.

## Install

```sh
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

For local development:

```sh
bun install --frozen-lockfile
bun run build
node dist/cli.js --help
```

## Initialize A Project

```sh
uh init
uh status
uh adapter capabilities
```

This creates `.harness/` with schema-backed project, adapter, workflow, sandbox, skill, mission, and audit artifacts.

## Create And Run A Mission

```sh
uh mission create m1-example \
  --title "Example mission" \
  --workflow spec-first-feature \
  --objective "Demonstrate the mission lifecycle"

uh validate --all-missions
uh mission dry-run .harness/missions/m1-example/mission.yaml --runtime codex
uh mission run .harness/missions/m1-example/mission.yaml --runtime codex
uh verify m1-example
uh status --json
```

Use `dry-run` before a real runtime invocation when checking command shape, sandbox routing, or runtime config overrides.

## Watch And Control Runs

```sh
uh ps                          # every run: liveness, turns, denials, last tool, stalled tools
uh wait <run-id>               # block until it settles; exit code says how
uh report <run-id>             # what it did: tools, files written, denials, efficiency
uh steer <run-id> "<message>"  # stop the attempt and resume it with a new first instruction
uh kill <run-id>               # stop it and prove it is dead
```

Run ids come from the `Run id:` line of `uh mission run`, the `UH_RESULT` line, or `uh ps`. The [operator handbook](./handbook/README.md) covers team missions, independent review, post-checks, `uh queue` and `uh land`; [known issues](./known-issues.md) lists what does not work yet.

## Human Surfaces

```sh
uh tui --once
uh tui
```

`uh tui` requires Bun and opens the OpenTUI/Solid Mission Control surface. Node-only users can continue to use every other `uh` command.
