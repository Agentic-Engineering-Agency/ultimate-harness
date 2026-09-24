---
title: Supervision and the guard
description: How UH keeps a running agent inside its assignment, and how a run ends.
---

Most of the v0.11 line is about one question: when an agent is running unattended, what stops it from doing something it was not assigned? The answer has three parts that work together: the **tool guard** inside the runtime, **supervision** watching the event stream, and **settlement** reconciling what happened.

## The tool guard

`src/harness/tool-guard.ts#decideToolCall` decides every tool call a worker makes. It runs **inside the runtime** as a hook (`src/extensions/tool-guard/`: an OMP extension, a Command Code hook, a Claude Code PreToolUse hook), so it sees the call before it executes.

What it denies, by class:

| Class | Denied |
|---|---|
| `write_outside`, `delete_outside` | writes and deletes outside the worker root and its `write_roots`, including through redirections, `tee`, `Out-File`, copy destinations and directory changes inside a command |
| `protected_root` | `.harness`, `.commandcode`, `.omp`, `.pi`, `.git` and any `protected_paths` |
| `guard_tamper` | writes to the guard policy or log, harness state, or the hive |
| `git_mutation` | commits, pushes, resets and other history changes |
| `package_install` | `npm install`, `pip install`, ... |
| `network_client` | `curl`, `wget`, ... unless the mission needs network |
| `agent_client` | starting another agent CLI (`claude`, `codex`, `omp`, `opencode`, `goose`, ...), judged by executable position so `grep -r omp src` is not a false denial; also starting paid runs through `uh` itself |
| native sub-agents | `task`, `agent`, `subagent`, `spawn_agent`, `dispatch_agent`, `delegate`, unless `guard.allow_native_subagents` |
| `containment_escape` | leaving the supervised process tree: WMI process creation, scheduled tasks, services, `setsid`, `systemd-run`, `disown`, `nohup ... &` |
| `kill_or_format` | `taskkill`, `Stop-Process`, `kill -9`, `format` |

Properties:

- **Fails closed.** `core.ts#runToolGuard` denies on any internal error.
- **Armed before spawn.** `guard-arming.ts#armGuard` fires two synthetic probes through the installed hook and logs them to `tool-guard.arm.log`. If the hook does not deny them, the run stops with `policy` before the runtime starts.
- **Immutable during a run.** Hooks run from a per-content snapshot in a user cache, so a rebuild cannot change the guard under a live worker; a snapshot that no longer matches its hash fails closed.
- **Tells the agent what to do.** A denial explains the contract ("write only under out/. Put the file under out/ instead.") and tells the agent not to retry by another route. Denials count against `max_denials`.

:::danger[Known bug on the v0.11 line]
On Linux and macOS, the copy and delete target scanners skip every argument that starts with `/`, treating it as a `cmd.exe` switch. As a result `cp x /etc/y` and `mv x ~/.bashrc` are **allowed**, and `rm -rf /abs/path/in/root` is falsely denied. This is the cause of the red CI on PRs #247 to #249. The fix and its verification are in the [release plan, Phase 0](/release/plan/#phase-0-unblock-the-stack).
:::

## Supervision

`runtime-process.ts#runRuntimeProcess` spawns the runtime, keeps a heartbeat in `runtime-control.json`, puts the process tree in a Windows job object (or tracks it on POSIX), enforces a memory cap, and feeds every native event to `RuntimeSupervision`. Supervision enforces the mission's `limits`:

| Limit | Stop code when exceeded |
|---|---|
| `startup_timeout_ms` (no first event) | `startup` |
| `stall_timeout_ms` (no liveness) | `stall` |
| `max_thinking_ms` (reasoning counts as live, up to this budget; repetitive reasoning does not) | `stall` |
| `timeout_ms` | `timeout` |
| `max_turns` (passed to the runtime as `--max-turns` where supported) | `turn_limit` |
| mission deadline | `deadline` |
| `max_output_bytes` | `output_limit` |
| `max_repeated_failures` (the same failing command again and again) | `repeated_failure` |
| `max_denials` | `denial_budget` |
| guard policy stop | `policy` |
| wrong provider or model, including sub-agents | `route_mismatch`, `route_unverified` |
| `uh mission cancel`, `uh kill` | `cancelled` |
| `uh steer` | `steered` |
| runtime crash, native stop | `runtime_error` |
| the controller itself failed or vanished | `controller_error`, `controller_lost` |

Supervision is testable without waiting on wall time: `runRuntimeProcess` accepts an injectable clock and poll scheduler.

Also on the event stream: the **run digest** (`run-digest.ts`, what `uh ps` and `uh report` show), a **loop probe and watchdog** in shadow mode (they detect repeat and alternating tool-call signatures and write advisory receipts, but do not stop runs yet), and the **intervention ledger**.

## Settlement

`runtime-settlement.ts` decides how a run ended. It never infers termination from a stale heartbeat alone. A native cap (the runtime's own turn or time limit) maps to a UH stop code. When `runtime-result.yaml` and the control receipt disagree, a confirmed settlement wins and a `settlement_conflict` record is appended; an unconfirmed receipt never rewrites a result.

After settlement: the live-run entry is closed, notifications fire, the diff is captured (retried once; a capture failure is bookkeeping, not a status change), and cost is resolved.

## Recovery, steering and killing

- **Resume.** `runWithRuntimeRecovery` can resume a stalled or failed attempt on runtimes that support native sessions (oh-my-pi, Command Code, Claude Code), up to `recovery.max_resumes`.
- **Steer.** `uh steer <run> "<message>"` writes a steer request; the controller stops the attempt and resumes the native session with the message as the new first instruction. `uh resume <run>` resumes a settled run as a new run.
- **Kill.** `uh kill` cancels through the controller, waits `--wait-ms`, and only then terminates the recorded controller's process tree. It reports `cancelled_gracefully`, `force_killed`, `orphan_settled`, `still_alive` or `skipped_settled` per run. An orphan (controller gone) is settled in place with a `controller_lost` receipt.
