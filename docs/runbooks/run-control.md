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

## Related

- `uh status` / `uh status --json` include live-run counts.
- `uh mission cancel` — cancel an owned local run.
- `uh kill` — stop runs by id, role, mission, team, `--all` or `--orphans`.
- Team fan-out and worker artifact layout: `docs/runbooks/resource-wave-smoke.md`.
