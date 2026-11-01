# Run control

How to see what is running, what it is doing, and what to do when a controller is gone. Sources: `docs/runbooks/run-control.md`, `src/harness/live-runs.ts`, `src/cli.ts`.

## Seeing the runs

Every runtime attempt claims a live-run entry at the project root the moment it claims its attempt. `uh ps` reads that registry, merges in whatever each run's `runtime-control.json` currently says, and scans the harness tree for pre-registry `runtime-control.json` files. It never needs a model, and a run's pids are only listed from the controller's own process tree.

```bash
# One line per live run, from the project root.
uh ps

# Machine-readable: schema, counts, and the full record per run.
uh ps --json

# Include runs that already settled, kept for 24 h ("what just ran?").
uh ps --all
```

Each line carries the run id, mission, team role (for team workers), runtime and model, verdict, turns, denials, heartbeat age, the last tool and its age, a `STALLED tool=<name> <minutes>m` segment when a tool call has produced no output for five minutes, and the native pids in the controller's process tree. `uh status` prints a single summary line from the same function:

```
Live runs: 4 (orphaned: 0)
```

### Liveness verdicts

| Verdict | Meaning | What to do |
|---|---|---|
| `live` | The controller process is alive and the run reports `running` with a fresh heartbeat. | Nothing — it is working. |
| `orphaned` | The run reports `running` but its controller pid is gone. Tokens may still be burning in a detached child. **This is the incident case.** | `uh kill --orphans`. `uh ps` exits `3` when any run is orphaned. |
| `stale` | The controller is alive but its heartbeat is older than twice the stall window (the stall window defaults to 60 s, so roughly 2 min). | Check `last=` and the run's `events.ndjson`; the controller may be wedged. |
| `settled` | Terminal status (`passed`, `failed`, `blocked`, `cancelled`). Shown only with `--all`, kept for 24 h. | Nothing — it is finished. |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Nothing is orphaned. |
| `3` | At least one discovered run is orphaned. |
| `1` | `uh ps` itself failed (bad `--root`, unreadable project). |

### Where the registry lives

- Registry: `.harness/live-runs/<run-id>.json` under the project root, schema `uh.live-run.v0`, recording `run_id`, `mission_id`, `runtime`, optional `model`, optional `team: { mission_id, role }`, `artifact_root`, `control_path`, `controller_pid`, `started_at`, and optional `status`, `stop_code`, `settled_at`.
- The project root is the nearest ancestor of an artifact root that holds `.harness/project.yaml`. A team worker's artifact root lives under `.harness/missions/<team-mission>/team/artifacts/<parent-run>/workers/<role>` and registers with its team mission id and role.
- The registry directory is gitignored: it is local execution state, not a publication input. Terminal control facts discovered by `uh ps` are reconciled back into the registry.

## Asking for a report

`uh ps` says *which* runs exist; `uh report <run-id>` answers "what is this run
doing right now?" for one run, from disk only, in under a second.

```bash
uh report <run-id>          # by id or a unique prefix
uh report <run-id> --json   # machine-readable
```

The report renders from the run's `run-digest.json` when it exists (an older run
without one is projected from `events.ndjson` once). Alongside identity, liveness,
turns, denials, tokens, cost, current activity, the recent tool calls and the
files written, a digest-backed report carries an **efficiency block** and the
**long-running tool** signal:

- **Efficiency** — context tokens at the first, sixth and last model request; the
  share of turns with exactly one tool call; reads and re-reads, where a re-read
  must repeat the same `(path, line range)` (a different range of one file is not
  a re-read); tool output bytes by tool kind; and model time versus tool time. A
  runtime that reports no per-request context (oh-my-pi) leaves the context fields
  absent rather than showing `0`.
- **Long-running tools** — a call still in flight with no end event and no output
  for more than five minutes, shown as tool, target and minutes, so a hung child
  pipeline is visible instead of reading as a long-but-productive call.

`uh observatory runs --group-by model --json` folds these into per-group medians
under `efficiency_medians` for a whole population of runs.

## Waiting for runs

`uh wait` blocks until matched runs settle, so an orchestrator learns a run is
done from the command's own exit code instead of polling `uh ps` one model turn
at a time. Targets resolve with the same semantics as `uh kill`: a run id (or
unique prefix), `--mission <id>`, or `--team <id>`. The registry is polled every
~2 s with no model involvement until every matched run is `settled` or
`orphaned`, or `--timeout-ms` (default 30 minutes) passes.

```bash
# One run, by id or unique prefix.
uh wait <run-id> --root <project>

# Every live run of a mission or a team.
uh wait --mission <mission-id> --root <project>
uh wait --team <team-mission-id> --root <project>

# Give up after 10 minutes, machine-readable.
uh wait <run-id> --timeout-ms 600000 --json
```

Output is one line per matched run (id, mission, final status, stop code) plus
one summary line:

```
run-01  wave-a  passed  stop=-
matched=1 settled=1 passed=1 failed=0 orphaned=0 timed_out=0 elapsed=2044ms
```

| Exit | Meaning |
|---|---|
| `0` | Every matched run settled `passed`. |
| `1` | At least one matched run settled with a failing status (`failed`, `blocked`, `cancelled`). |
| `2` | Nothing matched (unknown or ambiguous run id, no live run for the mission/team, no target given). |
| `3` | At least one matched run is orphaned — the same verdict that makes `uh ps` exit `3`. |
| `4` | The timeout passed with a run still unsettled. |

Waiting never touches a process: an orphaned run stays open only for the
verdict, and, like `uh kill`, an unreadable (empty) process table is never
treated as proof that controllers died — the run simply stays open until it
settles or the timeout hits.

## Cancelling an owned run

`uh mission cancel` writes a cancel request the controller reads. It resolves the run through the same discovery `uh ps` uses, so `--root` may be the project root even when the run is a team worker whose `runtime-control.json` lives deeper in the harness tree.

```bash
uh mission cancel --mission <mission-id> --run-id <run-id> --root <project>
```

## Stopping runs

`uh kill` stops runs and proves they are dead. Targets are always resolved through run discovery — the live-run registry plus a bounded harness scan — so the artifact root is never something the operator has to know.

```bash
# One run, by id or by a unique prefix of one.
uh kill <run-id>
uh kill <run-id-prefix>

# Everything belonging to a mission, one worker role, or a whole team.
uh kill --mission <mission-id>
uh kill --role <role>
uh kill --team <team-mission-id>

# The project sweeps.
uh kill --all
uh kill --orphans

# Machine-readable report.
uh kill --team <team-mission-id> --json
```

For each target, in order:

1. Resolve the artifact root that owns the run (a team worker's `runtime-control.json` sits under its `workers/<role>` directory, and that is the root the cancellation is written to).
2. Ask the controller to stop with the normal `uh mission cancel` request.
3. Wait up to `--wait-ms` (default `10000`) for the controller and every native process in its tree to exit, against the same process lister `uh ps` uses.
4. If anything survives, terminate the tree (`--force` skips steps 2 and 3 and goes straight here).
5. Re-list the processes, settle the live-run registry entry, and report.

### Outcomes

| Outcome | Meaning |
|---|---|
| `cancelled_gracefully` | The controller settled its own run and its process tree is gone. |
| `force_killed` | The controller never settled or never exited; the owned tree was terminated and the re-list confirms it is gone. |
| `still_alive` | Pids survived even the forced kill. They are listed as `surviving=` and the command exits `1`. |
| `orphan_settled` | The controller pid was already gone, so no process was touched; the record was closed with `stop_code: controller_lost`. |
| `skipped_settled` | The run had already settled for another reason; nothing was asked of it. |
| `error` | That target could not be stopped (unreadable artifacts, a settlement conflict). Other targets are still processed. |

Exit codes: `0` when every matched target is stopped; `1` when anything is `still_alive` or `error`, or when the command itself failed (bad selector, ambiguous prefix, unknown run id).

### Orphans

An orphaned run has no controller to ask and no tree to chase, so `uh kill <run-id>` never terminates anything for it: it closes the record through the same reconcile path the native guardian feeds, writing a `controller_lost` receipt first when the guardian never got the chance, then reconciling canonical artifacts. `uh kill --orphans` settles every orphaned run at once — the same set that makes `uh ps` exit `3`.

That receipt attests that the owned tree is gone, so it is withheld when the process table still parents live processes to the dead controller pid (Windows keeps a stale parent id, so a detached runtime stays attributable there). Such a run is reported `still_alive` with those pids and exits `1`; the record is only closed by `--force`, which says "I know a native process is still parented there, close the record anyway" and still does not signal it.

### Team cascade

`--team <id>` stops a team in the only safe order: each worker run first, then the team controller that hosted them, then the team state is marked cancelled so the leader's integration never lands. Because a team controller is shared by its workers, `uh kill <worker-run-id>` on its own only waits for that worker's own settlement — it will not kill a pid its siblings are still running under. Use `--team` (or `--all`) for that.

### What kill will not do

- A pid is signalled only when it is a run's recorded controller pid or a descendant of it, taken from the process snapshot captured before anything was asked to stop. No other process on the machine is reachable from here.
- An empty process table is a hard error, not a licence to declare every run dead.
- Nothing is inferred from a stale heartbeat alone; liveness is the process lister's answer.
