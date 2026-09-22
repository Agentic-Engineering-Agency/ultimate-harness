# Run control

How to see what is running, what it is doing, and what to do when a controller
is gone.

## Who is running

Every runtime attempt claims a live-run entry at the PROJECT root the moment it
claims its attempt (`claimRuntimeAttempt`). `uh ps` reads that registry, merges
in whatever each run's `runtime-control.json` currently says, and scans the
harness tree for pre-registry `runtime-control.json` files. The answer comes
back in under a second even on a large fixture, and it never needs the model.

```bash
# One line per live run, from the project root.
uh ps

# Machine-readable: schema, counts, and the full record per run.
uh ps --json

# Include runs that already settled, kept for 24 h ("what just ran?").
uh ps --all
```

Each line carries the run id, mission, team role (for team workers), runtime and
model, verdict, turns, denials, heartbeat age, the last tool and its age, and
the native pids in the controller's process tree:

```
20260922T101500Z-a1b2c3  wave-audit-0  team=live-runs  command-code/gpt-5  live  turns=12  denials=0  hb=2s  last=edit_file (3s)  pids=3140,3141
```

`uh status` also prints a single summary line from the same function:

```
Live runs: 4 (orphaned: 0)
```

### Verdicts

| Verdict | Meaning | What to do |
|---|---|---|
| `live` | The controller process is alive and the run reports `running` with a fresh heartbeat. | Nothing — it is working. |
| `orphaned` | The run reports `running` but its controller pid is **gone**. Tokens may still be burning in a detached child. **This is the incident case.** | `uh kill --orphans` (see [Stopping runs](#stopping-runs)). `uh ps` exits `3` when any run is orphaned. |
| `stale` | The controller is alive but its heartbeat is older than twice the stall window (~2 min by default). | Check `last=` and the run's `events.ndjson`; the controller may be wedged. |
| `settled` | Terminal status (`passed`, `failed`, `blocked`, `cancelled`). Shown only with `--all`, kept for 24 h. | Nothing — it is finished. |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Nothing is orphaned. |
| `3` | At least one discovered run is orphaned. |
| `1` | `uh ps` itself failed (bad `--root`, unreadable project). |

### Where the registry lives

- Registry: `.harness/live-runs/<run_id>.json` under the project root
  (`{ schema_version: "uh.live-run.v0", run_id, mission_id, runtime, model?,
  team?: { mission_id, role }, artifact_root, control_path, controller_pid,
  started_at, status?, stop_code?, settled_at? }`).
- The project root is the nearest ancestor of an artifact root that holds
  `.harness/project.yaml`. A team worker's artifact root lives under
  `.harness/missions/<team>/team/artifacts/<run>/workers/<role>` and registers
  with its team mission id and role.
- The registry directory is gitignored (`.harness/live-runs/`) — it is local
  execution state, not a publication input.

### When a run is orphaned

`uh ps` tells you it happened; it does not kill anything on its own. `uh kill`
does the stopping.

```bash
# See the orphaned run and its native process tree.
uh ps

# Settle every orphaned run (and nothing else) from the project root.
uh kill --orphans

# Cancel an owned local run by id (writes a cancel request the controller reads).
uh mission cancel --mission <mission-id> --run-id <run-id> --root <project>
```

`uh mission cancel` resolves the run through the same discovery `uh ps` uses, so
`--root` may be the project root even when the run is a team worker whose
`runtime-control.json` lives deeper in the harness tree.

## Asking for a report

`uh ps` tells you *which* runs exist and their verdict. `uh report` answers the
follow-up — "what is this run doing right now?" — for one run, in under a second
and without spending a token. It reads only what is already on disk (the run's
`runtime-control.json`, its `run-digest.json`, and, for older runs, its
`events.ndjson`) and never starts a controller or calls a model.

```bash
# One run, by id or by a unique prefix of one.
uh report 20260922T101500Z-a1b2c3
uh report 20260922T101500Z-a1b2

# Machine-readable, plus the projection knob.
uh report 20260922T101500Z-a1b2c3 --json
uh report 20260922T101500Z-a1b2c3 --last 20   # project the last 20 tool calls (default: 10)
```

### The live run digest

The supervisor already consumes every native event as it arrives. It reduces the
same stream — incrementally, with no second parse of the file — into
`run-digest.json`, written next to `runtime-control.json` on the heartbeat
cadence and once at settlement (never per event). The digest carries the run's
runtime, its turn count, what it is doing **now**, its last 12 completed tool
calls, the files it wrote, its denials and native refusals, the tokens it spent,
the deterministic loop signals over its recent calls, and its last assistant
text (bounded and scrubbed).

`uh report` renders from that digest when it is present, so the report stays
instant no matter how large `events.ndjson` grows — a 6.7 MB stream of reasoning
and text deltas costs the same as a tiny one. An **older run that has no digest**
falls back to reading the whole `events.ndjson` once and projecting it; that
fallback is only for runs started before the digest existed.

A report carries:

- **Mission, team role, runtime and model** — the run's identity. The runtime
  comes from the run's `runtime-session.yaml` or its digest, never guessed from
  the shape of the event stream; the model comes from the live-run registry.
- **Liveness verdict** — the same `live` / `orphaned` / `stale` / `settled`
  decision `uh ps` makes, against the same process lister.
- **Elapsed, turns, denials and native refusals** — elapsed is `started_at` to
  the settled time (or now); turns come from the digest (or `runtime-control.json`
  for a run without one).
- **Current activity** — what the run is doing now: `reasoning since 18:18:02
  (78,541 chars)`, `tool since 18:18:02 (read_file src/harness/team-run.ts)`, or
  `idle`. Shown for a run that carries a digest.
- **Denials, with guard class and target** — each denial in the stream, reduced to
  its guard class (`write_outside`, `git_mutation`, `package_install`,
  `network_client`, `virtual_device`, and the other `ToolGuardClass` values, or
  `denied` when the stream disclosed no finer class) and its **relative** target.
  A call the runtime denied natively, without ever invoking the guard hook, is
  counted separately as a native refusal.
- **Tokens and cost** — reported when the stream carries them; otherwise `null`
  with a `tokens_unknown_reason` / `cost_unknown_reason`. Cost is never guessed:
  a price the runtime reported is `reported`, a harness estimate from
  `.harness/prices.yaml` is `estimated`, and anything else stays unknown.
- **Activity** — the last N completed tool calls: tool, kind, target, ok, error
  class and the age of the completion.
- **Loop signals** — `identical_repeats`, `alternating_pairs` and
  `distinct_targets` over that window, computed deterministically with no model.
- **Files written so far** — the distinct write targets that completed
  successfully, as relative paths.
- **Last assistant text** — the last assistant-authored text, bounded to 600
  characters and scrubbed of recognizable credentials.

Two guarantees hold for every field: no absolute path and no credential is ever
printed. Targets are resolved against the run's **working directory** in all the
forms Command Code emits — an absolute path with a leading slash before a drive
letter (`/C:/run/src/a.ts`), backslash separators, and mixed-case drive letters —
and anything outside it (or a pure search query) is shown as the bounded
placeholder `<outside>` / `<pattern>` / `unknown`.

Exit codes: `0` on success, `1` when the run cannot be resolved (unknown or
ambiguous id) or the report itself fails.

## Stopping runs

`uh kill` stops runs and proves they are dead. Targets are always resolved
through `discoverRuns` — the live-run registry plus the bounded harness scan —
so the artifact root is never something the operator has to know.

```bash
# One run, by id or by a unique prefix of one.
uh kill 20260922T101500Z-a1b2c3
uh kill 20260922T101500Z-a1b2

# Everything belonging to a mission, one worker role, or a whole team.
uh kill --mission wave-audit-0
uh kill --role backend
uh kill --team wave-audit-0

# The project sweeps.
uh kill --all
uh kill --orphans
```

For each target, in order:

1. Resolve the artifact root that owns the run. A team worker's
   `runtime-control.json` sits under
   `.harness/missions/<team>/team/artifacts/<parent-run>/workers/<role>`, and
   that is the root the cancellation is written to.
2. Ask the controller to stop with the normal `uh mission cancel` request.
3. Wait up to `--wait-ms` (default `10000`) for the controller and every native
   process in its tree to exit, against the same process lister `uh ps` uses.
4. If anything survives, terminate the tree: `taskkill /PID <pid> /T /F`
   through PowerShell on Windows, a SIGKILL of the process group on POSIX.
   `--force` skips steps 2 and 3 and goes straight here.
5. Re-list the processes, settle the live-run registry entry, and report.

```bash
# Machine-readable, and what the operator sees:
uh kill --team wave-audit-0 --json
```

```
20260922T101500Z-a1b2c3  wave-audit-0  team=live-runs  oh-my-pi  cancelled_gracefully  stop=cancelled  pids=3140,3141
20260922T101502Z-d4e5f6  wave-audit-0  team=-          ultimate-harness-team  force_killed  stop=cancelled  pids=3100
team=wave-audit-0  run=20260922T101500Z-parent  team-state cancelled
matched=3 gracefully=2 forced=1 orphans=0 alive=0 errors=0
```

### Outcomes

| Outcome | Meaning |
|---|---|
| `cancelled_gracefully` | The controller settled its own run and its process tree is gone. |
| `force_killed` | The controller never settled or never exited; the owned tree was terminated and the re-list confirms it is gone. |
| `still_alive` | Pids survived even the forced kill. They are listed as `surviving=` and the command exits `1`. |
| `orphan_settled` | The controller pid was already gone, so no process was touched; the record was closed with `stop_code: controller_lost`. |
| `skipped_settled` | The run had already settled for another reason; nothing was asked of it. |
| `error` | That target could not be stopped (unreadable artifacts, a settlement conflict). Other targets are still processed. |

Exit codes: `0` when every matched target is stopped, `1` when anything is
`still_alive` or `error`, or when the command itself failed (bad selector,
ambiguous prefix, unknown run id).

### Orphans

An orphaned run has no controller to ask and no tree to chase, so `uh kill
<run-id>` never terminates anything for it: it closes the record through the
same reconcile path the native guardian feeds, writing a `controller_lost`
receipt first when the guardian never got the chance (the POSIX and
pre-guardian cases), then reconciling canonical artifacts. `uh kill --orphans`
does every orphaned run at once — the same set that makes `uh ps` exit `3`.

That receipt attests that the owned tree is gone, so it is withheld when the
process table still parents live processes to the dead controller pid (Windows
keeps a stale `ParentProcessId`, so a detached runtime stays attributable
there). Such a run is reported `still_alive` with those pids and exits `1`; the
record is only closed by `--force`, which says "I know a native process is
still parented there, close the record anyway" and still does not signal it.

### Team cascade

`--team <id>` stops a team in the only safe order: each worker run first, then
the team controller that hosted them, then `team-state.json` is marked
cancelled so the leader's integration never lands. Because a team controller is
shared by its workers, `uh kill <worker-run-id>` on its own only waits for that
worker's own settlement — it will not kill a pid its siblings are still running
under. Use `--team` (or `--all`) for that.

### What it will not do

* A pid is signalled only when it is a run's recorded controller pid or a
  descendant of it, taken from the process snapshot captured before anything
  was asked to stop. No other process on the machine is reachable from here.
* An empty process table is a hard error, not a licence to declare every run
  dead.
* Nothing is inferred from a stale heartbeat alone; liveness is the process
  lister's answer.

## Steering a worker

A worker can be nudged mid-run only by stopping it and resuming its native
session with a message. `uh steer` validates the request, then has the run's
owning controller perform the steer:

```bash
# Message the run: its controller stops the attempt (stop code `steered`) and
# resumes the same native session with the message as the first instruction.
uh steer 20260922T101500Z-a1b2c3 "Skip the retry loop; the endpoint already returns 429."

# Ask for a status report before the worker continues.
uh steer <run-id> "Continue" --report

# Machine-readable outcome.
uh steer <run-id> "<message>" --json
```

`--report` prepends a fixed request: write a report in the shape "done so far /
in progress / blocked on / next three actions / files touched" before anything
else, then continue.

### Preflight — everything is validated before the run is touched

`uh steer` refuses, and changes nothing, unless all of the following hold:

1. The run exists (by id or a unique prefix), resolved exactly like `uh ps`
   does — from the project root, including team workers under their own
   artifact roots.
2. A native session id is recorded for the attempt.
3. The adapter manifest resolves from the **project root** that owns
   `.harness/adapters` (the nearest ancestor of the run's artifact scope). A
   team worker's scope lives under
   `.harness/missions/<team>/team/artifacts/...` and holds no adapters of its
   own, so the manifest is never looked up there.
4. The runtime has a native resume path (Command Code, oh-my-pi, Claude Code).

A refusal is a clear message and no side effect: no stop is signalled and no
steer request is written.

### The owning controller resumes it

When a live controller owns the attempt (`uh ps` says `live`), steer writes a
`steer-request.json` (message, `report` flag, `requested_at`) next to the run's
`runtime-control.json` and signals the attempt to stop. The controller's
recovery loop (`runWithRuntimeRecovery`) then:

- consumes the request (it is deleted, so it can never be replayed),
- records the stopped attempt as `stop_code: steered` — a resumable, non-terminal
  stop, never a bare `cancelled`,
- starts the next attempt with `resume_from_run = <run-id>` and the operator's
  message as the first instruction, and
- records the steer in the attempt lineage (`runtime-recovery.json` on the new
  run carries `source_stop_code: steered` and the message as its notes).

A steered attempt does **not** count against the mission's
`recovery.max_resumes` budget — an operator message is authorized outside the
automatic loop. Because the resume happens inside the controller, a team
worker keeps running inside its team controller and is integrated normally
instead of being treated as a finished worker.

### When no live controller owns the run

If the controller is gone (`uh ps` reports `orphaned`), steer falls back to the
older path — but only after the same preflight succeeded. It asks the settled
run's remaining owner to stop, then starts a new run for the same mission, in
the same artifact root and sandbox, bound to `resume_from_run = <run-id>`, and
records the operator lineage both ways: `resumed_from` on the new run and
`resumed_by` on the old one, with `resume_origin: "operator"` in
`runs/<run-id>/resume-link.json` on each.

**The honest caveat**: steering is not a live channel. It costs a stop and a
restart of the native session. The transcript and prior work survive because the
runtime resumes the same session, but the worker re-reads its context before it
acts on the message.

## Resuming

`uh resume` continues a run that has already settled, without a new message:

```bash
uh resume <run-id> [--notes "<text>"] [--json]
```

It refuses a run that is still live — steer that one instead — and refuses a
runtime with no session resume path:

```
unsupported: <runtime> has no session resume
```

For a supported runtime (Command Code, oh-my-pi, Claude Code) it starts a new
run in the same mission, artifact root, and sandbox with
`resume_from_run = <run-id>`, and records the lineage both ways: `resumed_from`
on the new run and `resumed_by` on the old one, with `resume_origin: "operator"`
in `runs/<run-id>/resume-link.json` on each. Operator resumes are authorized
outside the automatic recovery loop, so they never spend the mission's
`recovery.max_resumes` budget.

## Related

- `uh status` / `uh status --json` include live-run counts.
- `uh mission cancel` — cancel an owned local run.
- `uh kill` — stop runs by id, role, mission, team, `--all` or `--orphans`.
- `uh steer` — message a run; its controller stops the attempt (`steered`) and resumes the session.
- `uh resume` — continue a settled run's session as a new run.
- Team fan-out and worker artifact layout: `docs/runbooks/resource-wave-smoke.md`.
