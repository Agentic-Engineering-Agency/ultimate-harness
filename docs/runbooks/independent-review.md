# Independent review round trip

Prepares an advisory review packet, runs the reviewer in a sandbox bound to the review mission, and collects a validated recommendation. See the [mission packet schema](../architecture/mission-packet-schema.md). This procedure never grants Main/owner acceptance or promotes source work.

## Why a sandbox is required

`uh mission review-prepare` emits a complete packet under `.harness/missions/<review-id>/`: the captured `review-request.json`, a request-pinned `review-report.schema.json`, and a `mission.yaml` with a guard policy whose `write_roots` are limited to the report directory and with network, git, and package installs denied. The reviewer must run in a sandbox bound to that review mission — `assertIndependentReviewExecution` refuses execution from the project root — so the reviewer can write only the report and cannot touch the source work under review.

## Running it

Four commands, in order, from the canonical project root:

```sh
# 1. Capture the review inputs and emit the packet (does not start a runtime).
uh mission review-prepare <review-id> --sources '[{"missionId":"<source-mission-id>"}]' --runtime command-code --model <reviewer-model>

# 2. Create the sandbox bound to the review mission, branching from the integrated ref.
uh sandbox create <review-sandbox-id> --mission <review-id> --base <integrated-ref>

# 3. Run the review mission; it auto-routes into the bound sandbox.
uh mission run .harness/missions/<review-id>/mission.yaml --runtime command-code

# 4. Validate provenance, evidence, and the exact-id coverage; print the assessment.
uh mission review-collect <review-id>
```

Notes:

- `--runtime` must be the same value passed to `review-prepare`; the packet binds the runtime and model, and a mismatch is refused.
- The packet objective lists, per source, the exact acceptance criterion ids and required check ids the report must contain — including explicit `acceptance: [] exactly; add nothing` when a list is empty — and points everything that no listed id covers at `observations`, never into `acceptance` or `checks`.
- `review-collect` re-checks request and snapshot digests, requires a successful native runtime receipt bound to the request, and validates that each acceptance criterion and required check id is covered exactly once. Invented ids are rejected; observations are surfaced in the assessment and printed summary without changing the recommendation.
- Each source also carries the worker's own evidence — `verification.yaml` and `runtime-final.txt` — which the packet names explicitly because the protected-path rules keep `.harness` out of the changed-file walk (below).

## What preparation and collection surface

`review-prepare` prints the report path relative to the review workspace (`out/review-report.json`) and says that it is resolved inside the review sandbox, so the operator never sees an absolute project path that does not exist in the reviewer's worktree.

When a source workspace is a git worktree, preparation also captures every path the worker changed between its merge-base with its base ref and its HEAD (`git diff --name-only`) as kind `changed` with a SHA-256 digest. A deleted path is recorded with state `absent` and no snapshot, protected roots (`.harness`, `.commandcode`, `.omp`, `.git`) are never captured, and a path already captured as a contract or output is not duplicated.

### Worker evidence in the packet

A review request is only as good as what the worker itself produced, so preparation carries two named captures per source, read from the source workspace:

| `kind` | Source path (relative to the source workspace) | Proves |
|---|---|---|
| `verification` | `.harness/missions/<source-id>/verification.yaml` | What `uh verify` actually concluded about the mission's required checks and acceptance criteria. |
| `report` | `.harness/missions/<source-id>/runs/<latest run id>/runtime-final.txt` | The worker's own final message, as the runtime recorded it. |

Both are read-only snapshots under `.harness/missions/<review-id>/inputs/<source-id>/` with a SHA-256 digest, exactly like captured contracts and outputs, so `review-collect` fails if either changes after preparation. The `verification` capture also states the overall `status` (`passed`, `failed`, `blocked`, `waived`) that `uh verify` recorded; a `verification.yaml` that does not parse is still captured, with `status: blocked` and the reason, because the file's existence is itself a fact the reviewer needs.

Both captures are always present in the request, so a gap is never confused with a packet that did not look:

- Absent files are recorded with `state: "absent"` and a `reason` explaining the gap — no `verification.yaml` means `uh verify` never ran in that workspace; a missing `latest.json` means no run exists whose final message could be located; a run without `runtime-final.txt` means the worker never emitted one.
- These paths live under `.harness`, so the protected-path rules that govern the `changed` walk do not capture them — they are captured explicitly by name instead, and the exclusion stays.
- Both snapshot paths are added to the packet's `context.read_first`, and the objective lists them per source, stating the captured verification status or the absence reason, so the reviewer sees what evidence exists before judging a required check.
- An absent capture is missing evidence to report, not an automatic failure: only `missing` declared outputs force `needs-remediation`. The reviewer grades each required check against the captured verification result and treats the worker's final message as a claim to compare against that evidence, never as proof of it.

`review-collect` preserves the reviewer's stated reasons on the assessment — per-source `findings` (severity, detail, evidence) and a per-claim `claims` summary (claim text, verdict, and the claim's evidence source) — and, after the assessment JSON, prints a short summary of contradicted claims and warning/error findings, so a needs-attention or needs-remediation recommendation carries its cause.

### What blocks a pass

`review-collect` blocks a pass only on required evidence: a contradicted claim, a failed required check or acceptance entry, or an error finding. An unverified extra claim does not block. A pass that is inconsistent with its evidence is recorded as `needs-attention` with the reason instead of throwing, so every collected review is recorded.

`uh mission check` checks a packet produced by `review-prepare` as it will run: from its bound review sandbox when one exists, and otherwise it says the packet runs in its review sandbox and names the command. The binding's runtime and model are checked against `--runtime`.

## What it proves

- The recommendation is evidence-backed and advisory: a recorded acceptance decision with `human_acceptance_required: true`.
- The report covered every listed id exactly once, with no invented ids, in a sandbox that could only write the report.
- The worker's own check output and final message were offered to the reviewer as captured, or named as absent with a reason; each present capture is a SHA-256-pinned snapshot that `review-collect` re-verifies in the project and in the review workspace. Whether the reviewer actually read them is not proven.

## What it does not prove

- Model intelligence or prompt compliance. The reviewer model's judgment is not validated by the harness.
- Main/owner acceptance. A `pass` recommendation still requires a human promotion decision on the source missions.
