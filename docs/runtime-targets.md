# Runtime Targets

Ultimate Harness is runtime-agnostic: mission packets and verification artifacts stay stable while adapters translate a mission into each agent runtime's command or HTTP call.

| Runtime | Adapter ID | Invocation Shape | Notes |
| --- | --- | --- | --- |
| Hermes Agent | `hermes` | Local CLI | Reference adapter. |
| Codex CLI | `codex` | `codex exec` | Uses workspace-write sandboxing and JSON output. |
| Hermes Proxy | `hermes-proxy` | Local HTTP endpoint | Subscription-backed OAuth route through Hermes Proxy. |
| OpenRouter | `openrouter` | OpenAI-compatible HTTP | Requires `OPENROUTER_API_KEY`. |
| Pi CLI | `pi` | Local CLI | Base Pi command surface. |
| oh-my-pi | `oh-my-pi` | Local CLI | Opt-in OMP route with documented posture. |

## Adapter Contracts

All adapters should:

- Render the same mission packet into a runtime prompt.
- Write `runtime-session.yaml`, `events.ndjson`, `runtime-result.yaml`, `runtime-final.txt`, and `diff.patch`.
- Respect sandbox routing unless explicitly bypassed.
- Redact or avoid secrets in persisted artifacts.
- Support `dry-run` where possible so CI and reviewers can inspect command shape safely.

See [`architecture/runtime-adapter-contract.md`](./architecture/runtime-adapter-contract.md) for the detailed protocol.

## Canonical Team Artifacts

`mission run-team` keeps execution worktrees separate from durable facts:

- Parent state and result: `.harness/missions/<mission>/runs/<parent-run>/team-state.json` and `runtime-result.yaml`.
- Worker artifact roots: `.harness/missions/<mission>/team/artifacts/<parent-run>/workers/<worker>/`. Each contains the adapter's normal `.harness/missions/<mission>/runs/<worker-run>/` artifacts.
- Leader verification: copied to the parent run's `verification.yaml` before successful worktree cleanup. The selected parent also updates the existing mission mirrors and run index.

Custom `TeamRuntimeRunner` implementations receive a fourth context argument containing `artifactRoot` and `runId`. Forward these to the adapter while keeping execution in the supplied worker root. Concurrent workers must not share the host mission's latest pointer.

The existing Observatory reads these canonical facts during and after execution. Complete, consistent worker reports supply aggregate route and usage values; missing measurements remain unknown. `--retain` controls worktrees, not canonical fact retention. The leader merges changes and invokes verification; it does not perform a separate model synthesis run.

## Native OMP Interruption

For a running native OMP mission, the CLI handles `SIGINT` and `SIGTERM`, cancels the owned runtime process tree, and synchronously settles the selected run before exiting with code `143`. Windows cleanup targets the owned PID tree; POSIX cleanup targets the owned process group.

The runtime result, run index, latest pointer, and terminal event report `cancelled`. The existing session schema has no `cancelled` state: its terminal representation is `failed` with exit code `143` and a finish timestamp. Mission mirrors update only for the selected run, and partial sandbox files remain available.

An uncatchable OS force-kill cannot execute this finalization path.
