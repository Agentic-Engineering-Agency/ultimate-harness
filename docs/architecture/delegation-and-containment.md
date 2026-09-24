# Delegation and containment

## Goal

A worker does the work it was given, inside the directory it was given, on the
model it was assigned, and nothing else. Anything a worker cannot do within
those limits goes back to its orchestrator. These rules are enforced by the
harness and do not depend on the model following instructions.

## Who may start an agent

Only an orchestrator starts agents, and only through the harness
(`uh mission run`, `run-all`, `run-team`). Every run started that way gets a
guard, an assigned route, cost accounting and artifacts. An agent started any
other way has none of those, so no other way is allowed.

| Route a worker might take | Enforcement |
|---|---|
| An agent CLI from the shell (`omp`, `codex`, `claude`, ...) | `agent_client`, judged by executable position: segment heads, launcher targets (`npx`, `env`, `xargs`, `&`), nested shell bodies, command substitutions. A name that appears as an argument, search pattern or path is not an invocation. |
| The harness itself (`uh mission run`, `node dist/cli.js mission run-team`, `uh acceptance run`) | `agent_client`. Read-only harness commands stay available. The Claude Code orchestrator role keeps an allowance for controller commands only. |
| The runtime's own sub-agent tool (`task`, `agent`, `subagent`, ...) | Denied by tool name for every role. `guard.allow_native_subagents: true` allows one level on the assigned route. |
| A runtime configured to delegate on its own | The oh-my-pi adapter writes a per-run configuration overlay that removes the sub-agent tool and pins every model role. |

A denied worker is told to end with `ESCALATE: <what its orchestrator should
delegate>`. Agent-client denial is independent of network denial: a mission
that needs the network still may not start agents. An explicit empty
`agent_clients` list is the only opt-out.

## Routes

A route is a provider and a model. A mission pins one; the run is held to it.

- **Pinning.** `--model` style flags pin only a runtime's top-level session.
  Runtimes that resolve helper, summary or sub-agent models from operator-global
  settings must have those roles pinned as well. The oh-my-pi overlay does this;
  custom role names the harness does not know are covered by attestation below.
- **Attestation.** Supervision reads route metadata from native model and
  message events, and from the structured progress metadata of delegation
  tools. A route outside the assignment stops the run with `route_mismatch` and
  names the route. A run that never attests its route ends `route_unverified`.
  Tool arguments and message text are never read for this.
- **Comparison.** Identifiers are compared after trimming and lowercasing, and
  an optional provider prefix is reconciled. There is no alias table and no
  partial matching: a different model is a mismatch.
- **Authorization.** `fleet.routes` in the project file lists which model may
  run on which adapter in which role. A run outside it, or with no assigned
  model, is refused before spawn. `--force` does not bypass spend authorization.

## The working directory

Reading anywhere is allowed. Writing is allowed only under the mission's write
roots inside the worker root.

- Relative write, delete, copy and redirection targets are resolved against the
  effective directory of the command, not the worker root. `cd`, `pushd`,
  `popd`, `Set-Location` and `Push-Location` are tracked through the segments of
  a command, inside nested shell bodies, and from an explicit `cwd` on the tool
  input. A directory change the guard cannot resolve statically denies every
  later write in that command.
- Harness state inside the worker root (`.harness`, `.commandcode`, `.omp`,
  `.pi`, `.git`) is `protected_root`; supervision stops the run with `policy`.
- The guard policy and log, and harness state outside the worker root, are
  `guard_tamper`; supervision stops the run with `policy`. A budgeted denial is
  the wrong response to an attempt to change the rules.
- The guard is content-blind. It judges tool names, executable positions and
  paths, never file contents or replacement text.

## The process tree

The harness owns the worker's process tree: a Windows Job Object with
kill-on-close and an optional memory cap, a process group on POSIX. Launch
routes that leave that tree are denied as `containment_escape`:
`Win32_Process.Create` through WMI or CIM, scheduled tasks, services, `setsid`,
`systemd-run`, `disown`, `at`, `batch`, `crontab` edits and backgrounded
`nohup`. Windows nests job objects, so a harness run started inside another
harness run stays inside the outer job and its limits can only be tighter.

On Windows the guardian also attaches the worker to a headless pseudoconsole
(`CreatePseudoConsole`, carried through `STARTUPINFOEX` and
`PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE`), so the worker and every descendant that
inherits a console run in one console that has no window and is never handed to
a default terminal — without it, an implicit console allocation is what a
default terminal such as Windows Terminal turns into a visible window. The
pseudoconsole's output is drained and discarded, and the worker's stdout and
stderr stay on the pipes the supervisor already reads. The guardian receipt
records whether the pseudoconsole was used and falls back to `CREATE_NO_WINDOW`
when the API is unavailable. A descendant that itself requests a new console
(for example through `windowsHide`/`CREATE_NO_WINDOW`) still allocates one, which
no parent can override.

In a container without an init process, orphaned descendants are never reaped.
Run the harness under an init (`docker run --init` or tini).

## Liveness

A stall is the absence of progress while no tool is in flight. Text deltas are
not progress, so repetitive output cannot defeat the stall budget. Reasoning
output is liveness, because a model that plans a change before its first tool
call is working; it is bounded by `max_thinking_ms` (default four times the
stall timeout), and a stretch whose text repeats does not count as live. Only
lengths and window counts are kept; reasoning text is never persisted.

## Observers

Status tools, dashboards and orchestrators read run artifacts while a run is
live. A reader must never be able to fail a run. Files that are replaced by
rename retry on `EPERM`, `EACCES` and `EBUSY` with bounded backoff; a periodic
heartbeat that cannot be persisted is skipped, not fatal; terminal writes stay
strict because losing them loses evidence.

## Running the harness on its own repository

- Worktrees are created locked (`git worktree add --lock --reason`) and
  unlocked before removal. The harness never runs a global `git worktree prune`,
  because it deletes the registration of any worktree whose directory is missing
  at that moment, including ones owned by another controller.
- Before removing a worktree, the harness deletes every link and junction inside
  it without following them. Git for Windows' `git worktree remove` recurses into
  a junction and deletes its target, so a `node_modules` junction would otherwise
  empty the checkout it points at.
- `uh mission run` refuses to run in the project root unless `--no-sandbox` is
  explicit. A lost sandbox registration must not turn into edits of the live tree.
- A worker's commit contains only the worker's own work. Protected roots are
  excluded by pathspec, which also covers files the repository already tracks.
- The build that verifies a worker's change is the orchestrator's build, not the
  one the worker just edited. The evaluator stays outside the loop it evaluates.

## Known limits

- The guard sees shell commands and file tools. A runtime tool that executes
  code in-process (an `eval` or `python` tool) can write without a path the
  guard can judge. Withhold such tools unless a mission opts in.
- Tool flags and hooks are not an operating-system security boundary. Credential
  scoping and isolated worker homes remain roadmap work.
- Rebuilding the harness while a run is live can replace the guard hook under a
  running worker. Hooks should be published to a content-addressed location per
  run, as the Windows guardian already is.
