# Intervention ledger

Every moment a run needed correction, recorded so recurrence is measurable. Sources: `src/schema/intervention.ts`, `src/harness/interventions.ts`, `src/cli.ts`.

A steer, a kill, a `run-team --replace`, a review that did not pass, a supervision stop: each is an intervention, and each is the main learning signal about how work is going wrong. UH records them in one append-only ledger so an operator can ask "is the same correction needed again, after we fixed it?"

## What is recorded

Each intervention is one line of JSON with schema `uh.intervention.v0`:

| Field | Meaning |
|---|---|
| `id` | Stable id; later status changes reference it. |
| `ts` | When it was recorded. |
| `source` | Who intervened: `owner`, `orchestrator`, `supervisor`, `review`, or `guard`. |
| `trigger` | What kind of moment: `steer`, `kill`, `replace`, `review`, `stop`, or `note`. |
| `refs` | Optional `run_id`, `mission_id`, `team_id`. |
| `cause` | `tool`, `info`, `permission`, `capability`, `unclear-spec`, or `unknown`. |
| `qualifier` | `missing`, `incorrect`, `insufficient`, or `unknown`. |
| `what` | The correction, in words. |
| `detection` | How it was, or can be, detected. |
| `countermeasure` | Optional id of the rule, check, or gate it became. |
| `status` | `open`, `landed`, `verified`, or `owner-decision`. |
| `evidence` | Required once `landed`. |
| `verified_by` | Required once `verified`: `owner`, or the id of a mechanical check. |

A new intervention is a full record. A status change is a **new line that references the id**, never a rewrite, so the file keeps what was believed and what changed.

## Storage

Append-only JSON lines at `.harness/ledger/interventions.ndjson`. The directory is created on first write and is gitignored: owner corrections are private. Free text is redacted with `redactSecrets` before it is stored, so a key pasted into a note never lands on disk.

Every automatic capture is best-effort: a ledger write failure never fails the steer, kill, review, or run it records.

## Automatic capture

| Moment | Source | Trigger |
|---|---|---|
| A successful `uh steer` | `orchestrator` (or `owner` when the caller says so) | `steer` |
| Each killed run | `owner` | `kill` |
| A `uh mission run-team --replace` | `owner` | `replace` |
| A collected review that did not pass, one entry per non-pass source | `review` | `review` |
| A run that settles with a supervision stop code | `supervisor` | `stop` |

The supervisor's stop codes are `policy`, `denial_budget`, `repeated_failure`, `stall`, `route_mismatch`, `route_unverified`, and `controller_lost`. Automatic entries carry `cause`/`qualifier` `unknown` unless the stop code implies one (for example `policy` implies `permission/incorrect`).

## Commands

```bash
# Record an intervention by hand.
uh note "worker ignored the spec's --json contract" --source orchestrator --mission wave-1 --cause unclear-spec --qualifier incorrect

# Inspect it.
uh ledger list --open
uh ledger list --cause tool --mission wave-1 --json
uh ledger summary

# Land the fix, naming the gate it became.
uh ledger land <id> --evidence "added a schema test for the JSON contract" --countermeasure check-json-contract

# Owner-only verification. An agent may never set verified_by owner.
uh ledger confirm <id>

# Migrate a predecessor corrections ledger (correction/status/evidence/confirmed_by_owner).
uh ledger import old-corrections.ndjson
```

`uh ledger summary` prints entries per mission, counts by cause and qualifier, and — for each countermeasure — the number of entries with the **same cause and qualifier recorded after it landed**. That last count is the recurrence: a fix that landed and a matching correction that still came back is the signal that the fix was incomplete.

`uh ledger import` maps `open`/`partial` to `open`, `landed` to `landed` with its evidence, and never `verified`; a `landed` row with no evidence imports as `open`. Imported entries have `source owner`.

## The owner line

Only `uh ledger confirm` sets `verified` with `verified_by: "owner"`; the harness refuses every other attempt. A mechanical check may set `verified` with its own id. This keeps "the owner accepted this" a claim only the owner can make.
