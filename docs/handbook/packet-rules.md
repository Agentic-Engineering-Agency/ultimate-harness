# Packet rules

Rules for mission packets that survive both the guard and the reviewer. Each rule names what fails without it. Sources: `docs/architecture/mission-packet-schema.md`, `docs/tool-guard.md`, `docs/runtime-targets.md`, `docs/runbooks/independent-review.md`.

## 1. Declare every touched file in `expected_outputs`

List every file the packet must produce under `expected_outputs.files` — for a single mission at mission level, and for a team worker in that worker's contract.

- When a worker declares `expected_outputs.files`, the harness inspects the worker worktree on completion. If any declared output is missing, unreadable, or outside the workspace, the worker settles `blocked` instead of `succeeded`, `team-state.json` records a `blocked_reason` naming the file, and the worker's branch is not committed and is excluded from leader integration.
- A missing declared output also blocks salvage: a stopped worker's worktree is only committed to a salvage branch when its declared outputs and required checks both pass in the worktree.
- Mission-level `expected_outputs` are evaluated against the integrated repository tree at leader verification.

An undeclared file is invisible to settlement: the work can pass while the artifact you actually wanted was never produced. The registry's acceptance campaigns use the same mechanism — `C1-missing-output` expects the missing file to block exactly its worker while a sibling succeeds.

## 2. Keep every requested action inside `guard.write_roots`

The guard allows writes and deletes only under `write_roots` (default `["."]`). Paths outside them are denied as `write_outside` or `delete_outside` with the instruction to put the file under the first write root instead. Rules for the author:

- Make `write_roots` cover every path the packet asks the runtime to create, edit, or delete, and nothing more. Roots are compared by path boundary: a sibling directory whose name merely starts with a configured root does not match.
- Never rely on the template to widen the boundary: when a session template is applied, the mission's `write_roots` (even an empty list) always win. Strict-containment templates refuse a root of `.` and any absolute path outright.
- Protected roots (`.harness`, `.commandcode`, `.omp`, `.pi`, `.git` by default) are read-only no matter what `write_roots` says; a mutation there is a `protected_root` denial, and the supervisor turns it into a hard `policy` stop that is never resumed. `guard_tamper` — writing to the guard's own policy or log — is a hard stop too, and it is checked first.
- Do not ask for package installs, git mutations, network clients, agent clients, or out-of-tree process launches: each has a denial class, and denials accumulate against `limits.max_denials` until the run stops with `denial_budget`. If a dependency or input is genuinely missing, the denial text says what to do: end with `BLOCKED: <what is missing>`; if the work exceeds your scope, end with `ESCALATE: <what should be delegated>`.

## 3. Put incident context under a heading that says it is not for verification

Anything declared in `acceptance_criteria` or `verification.required_checks` is verified and can fail the run; anything the independent reviewer finds under `acceptance` or `checks` must match a listed id exactly, and invented ids are rejected. So:

- Keep `acceptance_criteria` to the claims a check can decide, each with a stable `id` and a `check_command`. Advisory material belongs in `severity: warn` entries (recorded for the audit trail, not blocking) or outside verification entirely.
- For reviewers and review packets, the report schema provides `observations` as the outlet: every id the request lists must be covered exactly once under `acceptance` and `checks`, and anything verified that no listed id covers goes into `observations` — it is surfaced in the assessment without changing the recommendation. An empty list must be stated as `[] exactly; add nothing`, never left to inference.
- Guard denials follow the same principle from the other side: the denial text tells the runtime to record the refusal in its final message and continue, rather than to retry by another route. A final message that narrates denied attempts in a clearly-labelled, non-verification section is the compliant shape.

The rule in one line: incident context, caveats, and narration must be visibly separated from the things that are verified, so neither the validator nor a human reviewer can mistake one for the other.

## 4. Set both top-level `max_turns` and `limits.max_turns`

Turn caps reach the runtime through two paths, and a packet should pin both:

- `limits.max_turns` is enforced by UH supervision for every runtime (`turn_start`/`turn_end` evaluation; a native terminal `stopReason: "max_turns"` settles as `turn_limit` too).
- Top-level `max_turns` is what reaches a runtime's own native flag. For `command-code` the precedence is: explicit top-level `max_turns`, else `limits.max_turns`, else no flag. Print mode caps at 100 turns by default (exit 8) when neither field is configured — a silent native default recorded on the plan as `native_default_turn_cap: 100`.

A packet that sets only `limits.max_turns` can run under a native cap different from its supervised one; a packet that sets both gets the native flag and the supervisor to agree on the same budget, and a turn-budget exhaustion then settles predictably as `turn_limit` (not automatically resumed) instead of tripping the silent default.

## 5. State empty lists explicitly

Where "omitted" and "empty" mean different things, write the empty list:

- `guard.agent_clients` is always enforced; an explicit `agent_clients: []` is the only opt-out. Omitting the field takes the default client list.
- Review packets spell out empty id lists as `[] exactly; add nothing` so the reviewer cannot improvise coverage; the generated report schema pins the enum to the empty set.
- The strict schemas reject unknown fields rather than guessing intent: a guard block with an unrecognized key fails validation, and `limits.memory_mb` on a worker fails with "Per-worker memory is governed by team.resources.worker_memory_mb". An explicit empty `skills.required: []` or `source_links: []` documents that the omission is deliberate.

Writing `[]` costs nothing and removes the one ambiguity — "forbidden" versus "forgotten" — that both the guard and the reviewer would otherwise have to guess at.

## 6. Run `uh mission check` before launching the packet

`uh mission check <mission.yaml> [--runtime <id>]` validates a packet without starting a runtime and without writing to `.harness`. It prints one line per check (`PASS`, or `FAIL` with the reason), exits non-zero on any failure, and takes `--json` for tooling. It reuses the adapter planner `uh mission dry-run` uses to validate `runtime_config_overrides`, so the two cannot disagree; `--runtime` defaults to `hermes` for a single-shape packet, and each team worker is validated against its own declared `adapter`. A team packet also validates every worker packet it names through `mission_id`.

The checks map to the launch failures that keep recurring:

- The packet parses and satisfies the strict schemas — broken YAML, duplicate worker roles, and protected expected-output paths fail here.
- `runtime_config_overrides` are accepted by the chosen runtime: a key that belongs only to another adapter (for example a command-code-only `permission_mode` on an omp packet) fails instead of launching.
- Every `context.read_first` path exists.
- Every expected output — mission-level `expected_outputs.files` and each worker's — lies inside its `guard.write_roots`, compared by path boundary, so a write root that does not cover the packet's own outputs fails.
- Every path a `constraints` entry names after "Change only" exists or lies inside a write root.
- Every `grounding` claim holds.

`grounding` is an optional, strict list of `{ claim, path, contains }`. Each entry is a falsifiable statement about the code as it is now; `uh mission check` passes the claim only when `path` exists relative to the project root and its text contains the exact `contains` literal (case-sensitive). Absent or empty the field is a no-op, so existing packets stay valid. Use it to pin the facts a prompt asserts — file locations, exported symbol names, configuration keys — so a packet whose claims no longer hold fails the check instead of launching on a false premise.

## 7. Install a validated packet with `uh mission put`

An orchestrator (a runtime with `runtime_config.role: orchestrator`, such as Claude Code or Command Code) may only run harness controller commands and may not write under `.harness`, which is protected. It therefore cannot author a packet in place, and `uh mission create`/`new` and `uh propose` persist only a subset of the packet fields — no `guard`, `runtime_config_overrides`, recovery, `team` or `shape`. `uh mission put` is the coordinator's allowed path to persist a complete packet:

```
uh mission put <packet.yaml> [<more.yaml> ...] [--replace] [--root <path>] [--json]
```

- **Checks run first.** Each packet is validated with the same `checkMissionPackets` engine `uh mission check` uses, and a team packet validates each referenced worker through its own adapter. Any failed check refuses and prints the check output (`PASS`/`FAIL` lines, or the JSON result with `--json`); nothing is written — no mission directory, no audit line.
- **Install is atomic.** The packet is written to `.harness/missions/<id>/mission.yaml`, where `<id>` is the packet's own `id`. Every installed packet appends one `mission.put` event to `.harness/audit/events.ndjson` carrying the packet id and the sha256 of the installed bytes.
- **An existing target needs `--replace`.** Without it the command refuses and leaves the installed packet untouched.
- **`--replace` needs no live run.** While the live-run registry `uh ps` reads reports a non-settled run of that mission (its `mission_id` or a team worker's), `--replace` is refused so a running packet's contract cannot change under it.
- **Workers are never fabricated.** A team packet installs each worker packet it references by `mission_id` only when that packet is given alongside on the same command line or is already present at `.harness/missions/<worker_id>/mission.yaml`. A referenced worker that is neither fails the team packet's own check.

The observability and control verbs an orchestrator needs are controller commands: `uh ps`, `uh report`, `uh steer`, `uh resume`, `uh kill`, `uh experiment`, alongside the existing `uh mission`/`uh acceptance` runs and `uh mission put`. The tool guard admits them to the orchestrator role and denies them to a worker as `agent_client`; read-only harness commands (`uh status`, `uh validate`, `uh mission check`, `uh mission dry-run`) stay available to every role, and the `--force`/`--yolo`-style flag refusals still apply.


