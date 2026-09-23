---
title: Mental model
description: The handful of nouns UH is built from, and the rules that bind them.
---

UH has a small vocabulary. Learn these and the CLI reads naturally.

## The nouns

| Noun | What it is | Lives at |
|---|---|---|
| **Project** | A repository that has adopted UH. Holds project policy: fleet routes, guard defaults, telemetry opt-in. | `.harness/project.yaml` |
| **Workflow profile** | A named procedure for a class of work (`spec-first-feature`, `bugfix-contained`, `research-docs`, ...). Decides which steps and gates apply. | `.harness/workflows/*.yaml` |
| **Skill** | Reusable procedural know-how a mission can select. Markdown first. | `.harness/skills/` |
| **Mission** (packet) | One bounded unit of work: objective, inputs to read, constraints, expected artifacts, verification checks, acceptance criteria, limits, runtime overrides. Runtime-neutral. | `.harness/missions/<id>/mission.yaml` |
| **Adapter** | The thin layer that turns a mission into one runtime's command or API call and turns that runtime's output back into UH events. | `src/adapters/`, manifest in `.harness/adapters/` |
| **Sandbox** | Where the run happens: a git worktree (default), a directory copy, or a container. The canonical tree is never the working directory unless you pass `--no-sandbox`. | `.harness/sandboxes/` |
| **Run** (attempt) | One supervised execution of a mission by one adapter. Has a run id, a live control file, an event stream and a terminal result. | `.harness/missions/<id>/...` |
| **Verification** | The mission's declared checks run by the harness, then optionally a bounded model judge ("System One") for criteria that have no command. Three verdicts, not two. | `verification.yaml` |
| **Review** | An independent agent grades the finished report against the request ids it was allowed to address. | review packet + report |
| **Promotion** / **land** | The recorded human decision that moves sandbox output into canonical state. `promoted` is refused unless verification passed. | `promotion.yaml` |

## The rules

These come from [VISION](/source/docs/vision/) and are enforced in code, not by convention.

1. **Schemas, not conventions.** Every persisted file is parsed by a Zod schema with a version id such as `uh.mission.v0`. Unknown fields and typos fail at load time.
2. **Fail loudly.** A missing runtime, malformed manifest or unknown model stops with the path and field at fault. No silent fallbacks.
3. **Filesystem first, daemon never.** State is YAML and NDJSON on disk; every command is a short process. `uh ps` works because every run registers itself on disk, not in memory.
4. **Human gates are explicit.** Verification can be automatic. Promotion never is.
5. **Same prompt on every adapter.** A mission renders one logical prompt; adapter preludes only add.
6. **Workers stay in their lane.** A worker cannot start paid runtimes, other agent CLIs, native sub-agents or processes outside its tree, and cannot write outside its roots. The guard denies it and supervision stops the run with a named stop code.

## Where UH stops

In the governed delivery architecture, UH is **Run Control** only. Business intent, identity, authority and the normalized ledger belong to Telar; UH resolves and supervises live execution. See [Telar integration](/source/docs/architecture/telar-integration/).
