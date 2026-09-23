---
title: CLI commands
description: Every uh command and subcommand on the v0.11 line, with what it does and whether it is on main yet.
---

Verified from `--help` on the v0.11 stack tip (`db90516`). Commands marked **v0.11** are not on `main` or npm yet. Run `uh <command> --help` for flags.

## Top-level commands

| Command | Purpose | |
|---|---|---|
| `uh init` | Create a `.harness/` project | |
| `uh validate [file]` | Validate a YAML artifact. `--repair` / `--json` add drift detection; `--judge --spec` grades spec adherence with a model | |
| `uh status` | Project state; `--json` needs no model | |
| `uh verify <mission-id>` | Run required checks, then the optional model judge; writes `verification.yaml` | |
| `uh promote <mission-id>` | Record a human promotion decision (`--approved-by`) | |
| `uh propose [id]` | Generate a mission packet from issue metadata or a `.spec.md` | |
| `uh tui` | Interactive Mission Control (spawns Bun); `uh tui screenshot --view <view>` | |
| `uh ps` | Live runs; exit 3 when any run is orphaned | v0.11 |
| `uh kill [run-id]` | Stop runs by id or prefix, `--mission`, `--role`, `--team`, `--all` or `--orphans`, and prove they are gone | v0.11 |
| `uh wait [run-id]` | Block until runs settle (exit 0, 1, 3, 4; 2 when nothing matches) | v0.11 |
| `uh resume <run-id>` | Resume a settled run's native session as a new run | v0.11 |
| `uh steer <run-id> <message>` | Stop the attempt and resume it with a new first instruction | v0.11 |
| `uh report <run-id>` | Disk-only report of what a run did, no model call | v0.11 |
| `uh land` | Gated cherry-pick of verified, reviewed worker branches onto a target | v0.11 |
| `uh note <text>` | Record an intervention on the ledger | v0.11 |

## `uh mission`

| Subcommand | Purpose | |
|---|---|---|
| `create <id>`, `new <id>` | Scaffold a packet (`new` adds `design.md`) | |
| `show <mission-id>` | Print a mission | |
| `verdict <mission-id> <value>` | Record a manual verdict | |
| `dry-run [file]` | Route and render without launching | |
| `run [file]` | Supervised run; `--runtime`, `--auto`, `--template`, `--post-checks`, `--quiet`, `--no-sandbox`, `--force` | |
| `cancel` | Cancel a run through its controller | |
| `run-all <mission-id>` | One mission on several runtimes | |
| `run-team <mission-id>` | Worker waves in worktrees, mechanical integration, verify | |
| `check <file>` | Validate a packet without launching | v0.11 |
| `put <files...>` | Validate and install packets atomically | v0.11 |
| `review-prepare <id>`, `review-collect <id>` | Independent review round trip | v0.11 |

## Other groups

| Group | Subcommands | |
|---|---|---|
| `uh adapter` | `list`, `check [runtime]`, `add <runtime>`, `capabilities`, `cost-forecast` | |
| `uh sandbox` | `create <id>`, `list`, `status <id>`, `discard <id>`; `repair` (v0.11) | |
| `uh skill` | `add <dir>`, `list`, `check <id>` | |
| `uh spec` | `scaffold` (tests from acceptance criteria), `template [name]` | |
| `uh observatory` | `snapshot`; `runs`, `compare`, `export <mission-id> --otlp` (v0.11) | |
| `uh queue` | `run <file>`, `status <queue-id>` | v0.11 |
| `uh hive` | `import <file>`, `show`, `verify` | v0.11 |
| `uh ledger` | `list`, `summary`, `land <id>`, `confirm <id>`, `import <file>` | v0.11 |
| `uh notify` | `detect`, `list`, `test` | v0.11 |
| `uh acceptance` | `run [capability]`, `status`, `rebind`, `report` | v0.11 |
| `uh experiment` | `plan <id>`, `run <id>`, `report <id>` | v0.11 |
| `uh mcp` | `serve` | v0.11 |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | passed |
| 1 | failed |
| 2 | blocked (refused before spawn, or nothing matched for `wait`) |
| 3 | an orphaned run exists (`ps`, `wait`) |
| 4 | `wait` timed out |
| 130 | cancelled |
| 143 | terminated by signal |

## Environment variables

| Variable | Used for |
|---|---|
| `OPENROUTER_API_KEY` | `openrouter` adapter |
| `ANTHROPIC_API_KEY` | `anthropic` adapter |
| `TYPESAFE_API_KEY`, `UH_TYPESAFE_MODEL` | System One verification judge and semantic routing |
| `HONCHO_*` | optional Honcho memory |
| `UH_TELEMETRY=posthog`, `UH_POSTHOG_API_KEY` | opt-in product telemetry |
| `UH_CLI_BIN` | the `uh` binary the Hermes plugin calls |
| `UH_TOOL_GUARD_POLICY`, `UH_TOOL_GUARD_LOG` | set by UH for guard hooks; not for manual use |

Several of these are missing from `.env.example` (see the [debt register](/release/debt/)).
