# Supervisor-loop smoke

Exercises execution limits, denial budgets, repeated-failure thresholds, stall timeouts, protected-path policies, deadline grace and bounded recovery through the built CLI with deterministic fixtures. See [runtime targets](../runtime-targets.md). These checks do not establish live-provider or native-hook acceptance.

## What it runs

`scripts/smoke/supervisor-loop/run.mjs` executes thirteen isolated probe scenarios against the built CLI: ten use the `oh-my-pi` adapter configured with `fake-omp-probe.mjs`, and three use the `command-code` adapter configured with `fake-command-code-probe.mjs`. Each fixture emits the native event shapes recorded in [`docs/architecture/runtime-events.md`](../architecture/runtime-events.md): OMP uses `tool_execution_start`/`tool_execution_end` with `args`, `isError`, and `result`; Command Code uses its `event` envelope with `tool_queued`/`tool_hooks`/`tool_hook_blocked` and `input`. For each probe, the runner initializes a throwaway git repository under `<temp>/uh-supervisor-loop/<probe>`, registers the matching adapter and fixture as `cli_command`, writes a mission, and checks the canonical control and result artifacts.

| Probe | Runtime and exact fixture event sequence | Expected canonical outcome |
| --- | --- | --- |
| `denials_budget` | OMP: `session`, `model_request_start`, then three repetitions of `tool_execution_start(args.path)` → `tool_execution_end(isError: true, result.content[0].text: "CONTRACT: writes are temporarily locked")`; the first attempt idles after the third denial. Resume emits `session`, `model_request_start`, `turn_start`, `turn_end`, `message_end`, `agent_end`. | First attempt halted with `stop_code: "denial_budget"` and `stop_reason` matching `write_file out/c.txt: writes are temporarily locked`; automatic recovery resumes and the second attempt passes. |
| `fails3` | OMP: `session`, `model_request_start`, then three repetitions of `tool_execution_start(args.command: "python out/missing_script.py")` → `tool_execution_end(isError: true, result.exitCode: 1)`; the first attempt idles. Resume emits the normal OMP success sequence ending in `agent_end`. | First attempt halted with `stop_code: "repeated_failure"` and a reason reporting the repeated command; automatic recovery resumes and the second attempt passes. |
| `inflight_stall` | OMP: `session` → `model_request_start` → `tool_execution_start(args.command: "sleep")` → 350 ms delay → `tool_execution_end(isError: false, result.exitCode: 0)` → `message_end` → `agent_end`. | First attempt passes without stopping or resuming (`latest.run_id === "initial"`), proving an in-flight tool suppresses the stall timeout. |
| `stall` | OMP: `session` → `model_request_start`, then no further events until the stall limit; recovery emits the normal OMP success sequence ending in `agent_end`. | First attempt halted with `stop_code: "stall"`; automatic recovery resumes and the second attempt passes. |
| `turncap` | OMP: `session` → `model_request_start` → four `turn_start`/`turn_end` pairs; no terminal event. | First attempt halted with `stop_code: "turn_limit"` and does not auto-resume (`latest.run_id === "initial"`). |
| `deadline_grace` | OMP: `session` → `model_request_start` → four `turn_start`/`turn_end` pairs; the configured four-turn budget stops before the grace boundary. On resume, emits one turn and writes `out/REPORT.md` beginning `INCOMPLETE` with a `Missing for the next step` section. | First attempt halted with `stop_code: "deadline"` and a remaining-budget reason; exactly one grace recovery records `grace: true`, result `completion: "incomplete"`, and the declared output exists, so the final attempt passes. |
| `tamper` | OMP: `session` → `model_request_start` → `tool_execution_start(args.path: ".harness/adapters/oh-my-pi.yaml")`; no tool end or terminal event. | First attempt halted with `stop_code: "policy"` and the protected-path reason; policy stop is final (`latest.run_id === "initial"`). |
| `tamper_absolute` | OMP: `session` → `model_request_start` → `tool_execution_start(args.path: absolute <project>/.harness/adapters/oh-my-pi.yaml)`; no tool end or terminal event. | First attempt halted with `stop_code: "policy"` naming `.harness`; it does not resume. |
| `launcher_gone` | OMP: `session` → `model_request_start` → `turn_start` → `turn_end`, then the controller is killed while the fixture idles. Explicit resume emits `session`, `model_request_start`, `turn_start`, `turn_end`, `message_end`, `agent_end`. | Initial `runtime-control.json` records `stop_code: "controller_lost"`; explicit resume reconciles settlement and passes. |
| `preflight_fail` | No fixture events: runtime preflight rejects `needs_network: true` before launching the OMP fixture. | Process exits non-zero with `runtime preflight failed`; no start marker is created. |
| `cc_denials_budget` | Command Code envelope: `session`, `model_request_start`, then three repetitions of `tool_queued(input.path)` → `tool_hooks(phase: "pre", outcome.kind: "block")` → `tool_hook_blocked(hookOutput)`; the first attempt idles. Resume emits `session`, `model_request_start`, `run_end`, `result`. | First attempt halted with `stop_code: "denial_budget"`; automatic recovery resumes and the second attempt passes. |
| `cc_tamper` | Command Code envelope: `session` → `model_request_start` → `tool_queued(input.path: ".harness/adapters/command-code.yaml")`; no terminal event. | First attempt halted with `stop_code: "policy"` and does not resume. |
| `cmdc_shell_mutation` | Command Code envelope: `session` → `model_request_start` → `tool_queued(toolName: "shell_command", input.command: "rm .harness/temporary.txt")`; no terminal event. | First attempt halted with `stop_code: "policy"` naming `.harness/temporary.txt` and does not resume, proving the documented Command Code shell mutation shape is stopped before execution. |

The OMP and Command Code fixtures intentionally emit the native shapes recorded in [`docs/architecture/runtime-events.md`](../architecture/runtime-events.md), rather than substituting one runtime's event stream for the other.

## Running it

```sh
npm run build
node scripts/smoke/supervisor-loop/run.mjs
```

To run a subset of probes:

```sh
node scripts/smoke/supervisor-loop/run.mjs denials_budget stall
```

The throwaway project directories are created under `<temp>/uh-supervisor-loop/<probe>`:
- Canonical control receipt: `<project>/.harness/missions/<probe>/runs/<run_id>/runtime-control.json`
- Canonical result: `<project>/.harness/missions/<probe>/runs/<run_id>/runtime-result.yaml`
- Recovery record (on resumed attempts): `<project>/.harness/missions/<probe>/runs/<run_id>/runtime-recovery.json`
- Run index: `<project>/.harness/missions/<probe>/runs/index.json`

## What it does not prove

- Model intelligence or prompt compliance. The probe fixtures emit deterministic JSON event streams without invoking an LLM.
- Real hook execution or policy engine integration. Command Code blocks are represented by recorded `tool_hooks` and `tool_hook_blocked` shapes; OMP denials are represented by the recorded `tool_execution_end` error result, not a synthetic hook event.
- Seam observation cannot undo a write. The observation seam intercepts the first native tool event (`tool_execution_start` for OMP or `tool_queued` for Command Code), but if an unmanaged process or tool bypasses the event stream and performs direct disk I/O, the supervisor has no filesystem snapshot or rollback mechanism to revert physical modifications.
