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

## What it proves

- The recommendation is evidence-backed and advisory: a recorded acceptance decision with `human_acceptance_required: true`.
- The report covered every listed id exactly once, with no invented ids, in a sandbox that could only write the report.

## What it does not prove

- Model intelligence or prompt compliance. The reviewer model's judgment is not validated by the harness.
- Main/owner acceptance. A `pass` recommendation still requires a human promotion decision on the source missions.
