# Ultimate Harness

Ultimate Harness is an early-stage **runtime-agnostic software-development harness** for agentic engineering work.

It sits above coding agents and agent runtimes. Instead of becoming “one more coding agent,” it standardizes the durable artifacts and lifecycle around agentic work:

```text
request / issue / spec
  -> workflow profile
  -> mission packet
  -> runtime adapter
  -> runtime execution with sandbox policy
  -> verification result
  -> human review
  -> promotion into canonical project state
```

The goal is to combine proven patterns from specification-driven development, agent workflow systems, skill libraries, and sandboxing tools into a practical harness for planning, specifying, executing, verifying, and safely iterating on software work.

## Current status

Ultimate Harness `v0.1.0` ships an end-to-end working CLI and schema-backed artifact lifecycle. It can initialize a harness project, propose and create mission packets, validate configured artifacts, list/check adapter manifests through the runtime registry, manage git-worktree sandboxes, register and check skills, render/run missions through the Hermes adapter, write runtime and verification artifacts, and record promotion decisions. See the [v0.1.0 release notes](https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/tag/v0.1.0).

The design remains runtime-agnostic. Hermes is the first runtime adapter implemented; additional coding-agent runtimes can target the same mission, runtime-session, verification, and promotion contracts.

Codex is wired as an experimental adapter that drives the `codex exec` CLI inside a `workspace-write` sandbox with `--ask-for-approval never` and consumes the JSONL event stream. End-to-end runs against the real Codex backend require an unexhausted ChatGPT subscription quota; in the meantime the adapter classifies quota/auth failures as a `blocked` runtime-result with a clear remediation message. See `docs/architecture/adapter-codex.md`.

Start with the documentation spine for product and architecture context:

- [Documentation home](./docs/README.md)
- [Glossary](./docs/glossary.md)
- [Product requirements](./docs/product/prd.md)
- [MVP scope](./docs/product/mvp-scope.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Runtime adapter contract](./docs/architecture/runtime-adapter-contract.md)
- [Mission packet schema](./docs/architecture/mission-packet-schema.md)
- [Verification and promotion lifecycle](./docs/architecture/verification-and-promotion.md)
- [BMAD-style agent map](./docs/workflows/bmad-agent-map.md)

## Quick start

Install dependencies and build the CLI:

```sh
bun install
bun run build
```

Run the CLI during development:

```sh
bun run dev -- --help
# or
npx tsx src/cli.ts --help
```

Run the built CLI directly:

```sh
node dist/cli.js --help
node dist/cli.js init
node dist/cli.js status
```

Use the package bin locally after building:

```sh
npm link
uh --help
uh init
uh status
```

`package.json` exposes the `uh` binary as `./dist/cli.js`, so build before using the linked command. This package is currently private and intended for local development rather than publishing.

## CLI usage

Common commands:

```sh
uh init [--root <path>]
uh status [--root <path>]
uh validate <file>
uh validate --all-workflows [--root <path>]
uh validate --all-missions [--root <path>]
uh adapter list [--root <path>]
uh adapter check [runtime] [--root <path>]
uh mission create <id> --title <title> --workflow <profile> --objective <text> [--root <path>] [--force]
uh propose <id> --title <title> --workflow <profile> --objective <text> [--priority <p>] [--issue <provider:id[:url]>...] [--read-first <path>...] [--expected-output <path>...] [--required-check <name[=command]>...] [--review-gate <name>...] [--constraint <text>...] [--source-link <url>...] [--required-skill <name>...] [--suggested-skill <name>...] [--completion <text>...] [--repo-root <path>] [--sandbox-backend <name>] [--promotion-policy <name>] [--output <path>] [--root <path>] [--force]
uh mission dry-run [file] --runtime hermes [--root <path>]
uh mission run [file] --runtime hermes [--root <path>]
uh verify <mission-id> [--root <path>] [--timeout-ms <ms>]
uh promote <mission-id> --approved-by <name> [--decision promoted|rejected|deferred] [--change <path>...] [--sandbox-id <id>] [--root <path>]
uh sandbox create <id> --mission <mission-id> [--base <ref>] [--root <path>]
uh sandbox list [--root <path>]
uh sandbox status <id> [--root <path>]
uh sandbox discard <id> [--force] [--root <path>]
uh skill add <skill-dir> [--root <path>]
uh skill list [--root <path>]
uh skill check <skill-id> [--root <path>]
```

## Example lifecycle

Run the lifecycle from the project root:

```sh
# 1. Initialize .harness/ project state.
uh init

# 2. Ensure the Hermes adapter manifest exists, then confirm the runtime is available.
#    In this repository, .harness/adapters/hermes.yaml is already present.
#    In a new project, uh init creates .harness/adapters/; copy or write a manifest after init.
#    For example: cp path/to/hermes.yaml .harness/adapters/hermes.yaml
uh adapter check hermes

# 3. Create a mission packet using an existing workflow profile.
uh mission create m9-readme-polish \
  --title "README usage docs and installability polish" \
  --workflow spec-first-feature \
  --objective "Update README usage docs and verify the CLI is installable."

# 4. Edit the generated mission packet and add at least one executable required check
#    before verifying. For example, update this block in
#    .harness/missions/m9-readme-polish/mission.yaml:
#
#    verification:
#      required_checks:
#        - name: cli-help
#          command: node dist/cli.js --help
#      review_gates:
#        - spec-compliance
#        - implementation-quality

# 5. Validate mission packets.
uh validate --all-missions

# 6. Render the runtime prompt and command without executing Hermes.
uh mission dry-run .harness/missions/m9-readme-polish/mission.yaml --runtime hermes

# 7. Execute the mission through the Hermes runtime adapter.
uh mission run .harness/missions/m9-readme-polish/mission.yaml --runtime hermes

# 8. Run the mission's declared verification checks and write verification.yaml.
#    Continue to promotion only if this command reports passed checks.
uh verify m9-readme-polish

# 9. Record a human promotion decision after verification passes.
#    The default decision is promoted, which is blocked unless verification.yaml is passed.
uh promote m9-readme-polish \
  --approved-by "Reviewer Name" \
  --change README.md

# 10. Inspect current harness state.
uh status
```

Notes:

- `uh mission create` writes `.harness/missions/<id>/mission.yaml` and requires the named workflow profile to exist in `.harness/workflows/<profile>.yaml`.
- `uh mission dry-run` renders the prompt and command but does not invoke the runtime. For mission files under `.harness/missions/<id>/mission.yaml`, it also persists planning artifacts such as `prompt.md` and `runtime-session.yaml` with planned status.
- `uh mission run` currently supports `--runtime hermes`.
- `uh verify` only runs checks declared in the mission packet. A freshly scaffolded mission has no required checks until you add them.
- `uh promote` with `--decision promoted` requires a passed `verification.yaml`; rejected and deferred decisions can still be recorded as explicit review outcomes.

## Durable artifacts

Ultimate Harness records durable files under `.harness/` so agentic work can be inspected, resumed, audited, and promoted safely.

Mission-scoped artifacts:

- `.harness/missions/<id>/mission.yaml` — schema-backed mission packet containing objective, workflow profile, constraints, expected outputs, sandbox policy, and verification gates.
- `.harness/missions/<id>/prompt.md` — rendered runtime prompt produced by the Hermes adapter for a mission run.
- `.harness/missions/<id>/runtime-session.yaml` — runtime session record with runtime name, command, args, status, timestamps, and exit code.
- `.harness/missions/<id>/events.ndjson` — mission event stream for runtime lifecycle and related audit events.
- `.harness/missions/<id>/verification.yaml` — verification result produced by `uh verify`.
- `.harness/missions/<id>/promotion.yaml` — human promotion, rejection, or deferral record produced by `uh promote`.

Project-scoped artifacts include `.harness/project.yaml`, workflow profiles in `.harness/workflows/`, adapter configuration in `.harness/adapters/`, indexes for skills and sandboxes, and `.harness/audit/events.ndjson`.

## Safety model

Ultimate Harness is designed around explicit gates instead of direct, unchecked mutation of canonical project state:

- Schemas validate project, workflow, mission, runtime-session, verification, and promotion artifacts.
- Mission IDs, workflow profile names, and artifact paths are constrained to avoid path traversal.
- Runtime artifact persistence refuses symlinked `.harness`, missions, mission directories, or artifact files where that would make writes unsafe.
- Missions model their expected sandbox policy in mission/runtime configuration, with `git-worktree` modeled as the current mission packet default backend.
- The current Hermes adapter launches Hermes from the project root (`cwd` is the harness root). It records and passes through runtime planning details, but the adapter itself does not enforce an OS/filesystem sandbox automatically.
- Promotion is a separate human approval step. A `promoted` decision is blocked unless the mission has a passed `verification.yaml`.
- Event streams and YAML records provide an audit trail for runtime execution, verification, and promotion decisions.

## Inspiration

Ultimate Harness studies and selectively integrates ideas from:

- [Specsafe](https://github.com/Agentic-Engineering-Agency/specsafe/issues) — specification safety and issue-driven development practices.
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) — structured agent roles, planning, and delivery workflows.
- [superpowers](https://github.com/obra/superpowers) — composable agent capabilities and disciplined software-development skills.
- [GSD](https://github.com/gsd-build/get-shit-done) — context engineering, fresh-context execution, and durable project context.
- [matt-pocock/skills](https://github.com/mattpocock/skills) — focused reusable engineering skills.
- [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) — open multi-agent harness patterns.
- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — artifact-guided specification workflows.
- [Pi](https://pi.dev/) and [oh-my-pi](https://github.com/can1357/oh-my-pi) — customizable terminal agent harnesses and possible runtime targets.
- [AgentFS](https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md) — copy-on-write agent filesystem and sandboxing patterns.

See the [comparison matrix](./docs/research/comparison-matrix.md) and [adopt/reject/defer log](./docs/research/adopt-reject-defer.md) for the current design position.

## Project vision

Ultimate Harness aims to provide:

- Specification-first planning and execution.
- Portable mission packets for bounded agentic work.
- Runtime adapters for multiple coding agents.
- Reusable skills and workflow profiles.
- Sandboxed environments for safer autonomous development.
- Structured verification and human approval gates.
- Clear audit trails for decisions, file changes, checks, and promotion.
