# Fleet: adapters, tiers, and the guard

The command-code adapter, session templates and their tiers, and the tool-guard denial classes with what each denial text means. Sources: `docs/tool-guard.md`, `docs/architecture/session-templates.md`, `docs/runtime-targets.md`, `src/cli.ts`.

## The command-code adapter

Command Code (`command-code`) is a local CLI adapter that runs missions in print mode, where no operator can answer a permission prompt. Two facts follow from print mode:

- A mission must declare a `guard` block or an explicit `runtime_config.permission_mode`. Without either, planning refuses before process spawn — including for custom CLI commands.
- When a guard policy is present, UH resolves `permission_mode: "guard"`, appends `--yolo`, and leaves all authorization to the `PreToolUse` hook and the guard. A mission may instead set `runtime_config.permission_mode: "yolo"` explicitly; this also appends `--yolo` without installing a guard. The durable `runtime-control.json` receipt records `permission_mode` as `guard`, `yolo`, or explicit `prompt`.

`runtime_config.role` defaults to `worker`. An orchestrator mission must still declare a guard; the guard artifact then carries `controller_commands: true`, and the hook admits only harness controller commands while agent CLIs, native sub-agent tools, and `--force`-style invocations stay denied. The orchestrator prompt ends with a fixed delegation paragraph: delegate only through harness commands, give every delegated worker its own mission packet and bound sandbox, wait for a worker settlement line before depending on its output, and never do a worker job yourself. Fleet admission reads `role`, so a model authorized only as `worker` is refused as an orchestrator.

Every adapter writes the same artifact set (`runtime-session.yaml`, `events.ndjson`, `runtime-result.yaml`, `runtime-final.txt`, `diff.patch`); command-code additionally writes the guard artifacts when a guard is active (below). Command-code is one of the runtimes that supports bounded native session recovery. Inspect the planned command without running anything with `uh mission dry-run`, and check an adapter is installed and configured with `uh adapter check <runtime>`.

### Guard artifacts and fail-closed behaviour

When a guard is active, each run directory gets:

- `tool-guard.json` (schema `uh.tool-guard.v0`): the worker root, the protected paths, and the resolved policy fields (`write_roots`, `deny_git_mutations`, `deny_package_installs`, `deny_network_clients`, `agent_clients`).
- `tool-guard.log`: newline-delimited JSON, one line per hook invocation — denials and allowed calls alike — each with `ts`, `tool`, `class`, `target`, and `reason`.

For guarded command-code runs, the supervisor requires the first completed tool call to have matching guard-log evidence. If it does not, it stops with `stop_code: "policy"` and reason `Guard hook did not run; refusing to continue with permissions enabled`, and the run records `guard_armed: false`; a guarded run records `guard_armed: true` once the first completed call has matching evidence. The guard is an enforcement seam, not an operating-system sandbox: an unmanaged process that bypasses the runtime event or hook seam is outside this mechanism.

## Guard classes and denial texts

The guard is a per-tool-call contract boundary. It is path-only and content-blind: it classifies the requested tool and command, resolves target paths, and compares those paths with the configured write roots and protected roots. It does not inspect file contents, diff bodies, replacement text, or report text — an allowed output may quote a forbidden path without attempting to write there.

Every denial reason begins with `CONTRACT:` and ends with the same instruction:

> Do not retry this by another route; record it in your final message and continue with the rest of the task.

| Class | Trigger | What the text directs |
|---|---|---|
| `write_outside` | A write-class tool or shell write target is outside `write_roots`. | "write only under \<roots\>. Put the file under \<first write root\> instead." |
| `git_mutation` | A shell command contains a Git mutation verb (`commit`, `checkout`, `stash`, `reset`, `add`, `merge`, `rebase`, `push`, `switch`, `restore`, `clean`). | "no git mutations; the harness commits for you. Use read-only git (status, diff, log) or skip it." |
| `delete_outside` | A delete tool or shell delete targets outside `write_roots`, or a delete target cannot be resolved. | "deletes and process kills only inside \<roots\>." |
| `kill_or_format` | The command contains `taskkill`, `stop-process`, `kill -9`, or `format <drive>:`. | Same deletion/process text as `delete_outside`. |
| `package_install` | A command invokes `pip`, `pip3`, `uv`, `conda`, `npm`, `pnpm`, or `yarn` with `install`, `add`, or `i`. | "no package installs. Use what is installed; if a dependency is missing, end with BLOCKED: \<dependency\>." |
| `network_client` | A command invokes `curl`, `wget`, `invoke-webrequest`, `iwr`, `invoke-restmethod`, or `irm` while network denial is enabled. | "no network or agent clients. Everything you need is on disk; if it is not, end with BLOCKED: \<what is missing\>." |
| `agent_client` | A command would start a configured agent client, or a UH command that starts paid runtimes (`uh mission run`, `run-all`, `run-team`, `uh acceptance run`, also through `node`/`bun` and `dist/cli.js`); native sub-agent tools are denied by tool name for every role. | "no sub-agents. Workers do not start agents, agent CLIs or harness runs. Do the work yourself; if part of it exceeds your scope, end with ESCALATE: \<what your orchestrator should delegate\>." |
| `guard_tamper` | A write, delete, copy, move, or redirection targets the guard policy or log, or an absolute target contains a `.harness`, `.commandcode`, `.omp`, or `.pi` path segment. | "the harness policy and its state are not yours to change." |
| `protected_root` | A write-class tool or shell mutation targets a protected root. | "\<protected root\> belongs to the harness and is read-only." |
| `containment_escape` | A command would launch a process outside the supervised process tree (scheduled-task, service, CIM process creation, `setsid`, `disown`, `at`, `crontab`, or `nohup` followed by `&`, among others). Applies to every role and every policy; no guard field lifts it. | "no launches outside the supervised process tree. Run the work in the foreground of this run instead." |

Ordering and consequences: `guard_tamper` is checked before other mutation classes and is a hard policy stop; otherwise `protected_root` is produced before the write/delete class when a target is under a protected root. Reads are never denied merely because their path is protected. Denials count against the run's denial budget (`max_denials`) and stop the run with `stop_code: "denial_budget"` when reached; a protected-root mutation or a guard-tamper denial instead stops the run immediately with `stop_code: "policy"` — a hard stop that is never automatically resumed.

The mission's `guard` block is strict; unknown fields are rejected. `agent_clients` is always enforced; an explicit empty list is the only opt-out. `allow_native_subagents: true` lets the runtime use its own sub-agent tool while agent CLIs and UH runs stay denied; every delegated agent is still held to the assigned route, and a different provider or model stops the run with `route_mismatch`.

## Session templates and tiers

Session templates are reusable, tiered execution configurations stored under `.harness/templates/<id>.yaml`, schema `uh.session-template.v0`. They answer "how is an attempt executed" — adapter, model, limits, recovery, guard defaults — as opposed to workflow profiles, which define "what phases a mission runs".

- **Tiers:** `low-cost`, `balanced`, or `exhaustive`.
- **Containment:** `standard` (default) or `strict`. A strict template is refused — `[BLOCKED]`, exit `2`, before any runtime is spawned — unless the resulting configuration has non-empty relative `write_roots` (a root of `.` or an absolute path is refused), keeps `allow_native_subagents` off, and keeps network clients denied.
- **Fields:** `adapter`, `runtime_config_overrides`, `limits` (turn, time, stall, thinking, denial, repeated-failure, and output limits, plus `protected_paths`; never `memory_mb`), `recovery` (`max_resumes`, `notes`, `on_deadline`), `guard`, `worker_rules` (short rules appended to the dispatch prompt's constraints, after the mission's own — for example "this runtime works in many small turns"), `attempts` (1–8 parallel attempts for exhaustive search), and `notes`.

Adopt a template on `uh mission run` or `uh mission dry-run` with `--template <id>`. Merge semantics are "most specific wins": mission values beat template values, and template values beat harness defaults. `guard.write_roots` is never widened — if the mission defines `write_roots` (even empty), the template's are ignored. An explicit `--runtime-config-overrides <json>` wins over both. When `--runtime` is omitted the template's `adapter` is used; a conflicting `--runtime` is refused. `--auto` cannot be combined with `--template`. Fleet admission runs after the template is applied, so a template cannot route a run around spend authorization.

A team worker can also name a template (`team.workers[].template: <id>`). The worker's contract takes the template's `runtime_config_overrides`, `limits`, `recovery`, and `worker_rules` as defaults; the worker spec and the worker's own `mission_id` packet win over the template. An unknown template id fails the whole team before any worker starts. The template's `worker_rules` land in the worker's rendered constraints.

When `.harness/project-brief.md` exists, its text is rendered into every dispatch prompt as a `## Project facts` section, so workers stop re-reading the project configuration to learn it. The section is capped at 4,000 characters with a truncation note. `uh mission dry-run` prints the rendered prompt, so the section is visible there too.

A run that adopts a template records the applied descriptor in the run directory as `session-template.json` (`template_id`, `tier`, `containment`, `overridden_by_mission`). `indexRuns` reads it into the run record, and `uh observatory runs --group-by template` (or `tier`) aggregates pass rates, cost, and duration per tier so reliable configurations can be promoted into standard templates.
