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
