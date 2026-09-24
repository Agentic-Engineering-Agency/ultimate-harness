---
title: Install and first run
description: Install the uh CLI, initialize a project and run a first mission end to end.
---

## Requirements

| Need | Version | Why |
|---|---|---|
| Node.js | 20 or newer | Every `uh` command except `uh tui` runs on plain Node. |
| Bun | 1.3.14 or newer | Package manager for the repo, and the runtime for `uh tui` (OpenTUI/Solid TSX). |
| git | any recent | Sandboxes are git worktrees by default. |
| A runtime CLI or key | per adapter | For example `codex`, `omp`, `cmd`, `hermes`, or `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` in the environment. |

Runtime credentials never go into `.harness/`. API keys come from the environment; CLI runtimes keep their own login.

## Install

```sh
bun add -g @agenticengineeringagency/ultimate-harness
uh --help
```

From a clone, for development:

```sh
bun install --frozen-lockfile
bun run build
node dist/cli.js --help      # the built CLI
bun run dev -- --help        # tsx, no build step
```

## First mission

```sh
uh init                                   # creates .harness/ with schema-backed state
uh adapter capabilities                   # what each adapter can do
uh adapter check codex                    # is this runtime installed and reachable?

uh mission create m1-example \
  --title "Example mission" \
  --workflow spec-first-feature \
  --objective "Demonstrate the mission lifecycle"
uh validate --all-missions

uh mission dry-run .harness/missions/m1-example/mission.yaml --runtime codex   # render, do not launch
uh mission run     .harness/missions/m1-example/mission.yaml --runtime codex   # launch, supervised

uh verify m1-example                                          # run the mission's declared checks
uh promote m1-example --approved-by "Reviewer Name" --change README.md
uh status --json
```

`dry-run` renders the exact prompt, command, sandbox routing and runtime overrides without spending anything. Use it before every real run while you learn the system.

## Watching runs (v0.11)

```sh
uh ps                          # every run: liveness, turns, denials, last tool
uh wait <run-id>               # block until it settles; exit code says how
uh report <run-id>             # tools, files written, denials, efficiency
uh steer <run-id> "<message>"  # stop and resume with a new first instruction
uh kill <run-id>               # stop it and prove it is dead
```

`uh mission run` ends with a single `UH_RESULT {json}` line and exits `0` passed, `1` failed, `2` blocked, `130` cancelled, so scripts and orchestrators can drive it.

## Human surfaces

```sh
uh tui --once   # print one frame of Mission Control
uh tui          # interactive; needs Bun
```

The Hermes dashboard plugin (`apps/hermes-plugin`) and `uh mcp serve` (v0.11) read the same `.harness/` files. See [Surfaces](/system/surfaces/).

## Next

- [Mental model](/start/mental-model/) for the vocabulary.
- [The lifecycle](/system/lifecycle/) for what each command does to disk.
- [Source quickstart](/source/docs/quickstart/) for the repository's own quickstart.
