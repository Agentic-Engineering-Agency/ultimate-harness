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
| `orphaned` | The run reports `running` but its controller pid is **gone**. Tokens may still be burning in a detached child. **This is the incident case.** | Stop the native process tree (see below) and reconcile the run. `uh ps` exits `3` when any run is orphaned. |
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

`uh ps` tells you it happened; it does not kill anything on its own.

```bash
# See the orphaned run and its native process tree.
uh ps

# Cancel an owned local run by id (writes a cancel request the controller reads).
uh mission cancel --mission <mission-id> --run-id <run-id> --root <project>
```

If the controller is truly gone, `uh mission cancel` cannot reach it. Inspect the
pids from `uh ps --json` (the `children` array carries pid plus the first 80
characters of each command) and terminate the reported tree deliberately, then
reconcile the settled state from the run's preserved artifacts under
`.harness/missions/<mission-id>/runs/<run-id>/`.

## Related

- `uh status` / `uh status --json` include live-run counts.
- `uh mission cancel` — cancel an owned local run.
- Team fan-out and worker artifact layout: `docs/runbooks/resource-wave-smoke.md`.
