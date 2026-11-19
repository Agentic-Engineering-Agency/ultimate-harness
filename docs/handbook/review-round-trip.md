# The review round trip

Independent review prepares an advisory review packet, runs the reviewer in a sandbox bound to the review mission, and collects a validated recommendation. The procedure never grants Main/owner acceptance and never promotes source work. Sources: `docs/runbooks/independent-review.md`, `src/harness/independent-review.ts`, `src/cli.ts`.

## Why a sandbox is required

`uh mission review-prepare` emits a complete packet under `.harness/missions/<review-id>/`: the captured `review-request.json`, a request-pinned `review-report.schema.json`, and a `mission.yaml` whose guard policy limits `write_roots` to the report directory and denies network, git, and package installs. The reviewer must run in a sandbox bound to that review mission — collection refuses a review whose bound workspace is missing — so the reviewer can write only the report (`out/review-report.json`) and cannot touch the source work under review.

Preparation never starts a runtime or a model. For each source mission it snapshots the canonical contract and every expected output into the review mission's `inputs/` directory with SHA-256 digests, so the captured snapshots — not later source changes — define the review. Sources must be distinct missions, and a mission cannot review itself. An existing packet or abandoned preparation is never silently overwritten.

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

- `--runtime` must be the same value passed to `review-prepare`; the packet binds the runtime and model, and a mismatch is refused. Admitted reviewer runtimes are `oh-my-pi`, `command-code`, and `claude-code`.
- The packet objective lists, per source, the exact acceptance criterion ids and required check ids the report must contain — including the explicit phrase `[] exactly; add nothing` when a list is empty — and points everything that no listed id covers at `observations`, never into `acceptance` or `checks`.
- The generated report schema pins the allowed ids: each id list becomes an enum with a matching item cap, so a report containing an invented id cannot conform even before validation runs.

## What the validator requires

`review-collect` re-checks every binding before reading the recommendation:

1. The request file digest still matches the digest recorded at preparation (`request_sha256`); a changed request is rejected.
2. A successful native runtime receipt bound to the request exists: the run's recorded mission, run id, and runtime match the packet, status is `passed`, settlement is confirmed, and the receipt carries the same request digest.
3. The runtime result artifact itself reports `passed`.
4. The review mission's contract is unchanged in its workspace, and every captured input snapshot still matches its recorded digest in both the canonical root and the workspace.
5. The report exists at the bound path, passes artifact verification, conforms to the pinned schema, and carries the same `request_sha256`.
6. Each source mission, each acceptance criterion id, and each required check id is covered exactly once. Invented ids are rejected.
7. Missing or invalid review inputs require a `needs-remediation` verdict for that source, and unverified or contradicted evidence cannot receive `pass`.

After writing the assessment, `review-collect` copies the reviewer's report to `.harness/missions/<review-id>/review-report.json` and discards the review sandbox, so review workspaces do not accumulate. Pass `--keep-workspace` to keep the sandbox for inspection; collecting the same review again needs its sandbox.

The written assessment records the recommendation with `human_acceptance_required: true`. A `pass` recommendation still requires a human promotion decision on the source missions; it proves the report was evidence-backed and produced in a sandbox that could only write the report. It does not prove model intelligence or prompt compliance — the reviewer model's judgment is not validated by the harness.

## The observations outlet

The report schema gives the reviewer three places to record per-source results: `acceptance`, `checks`, and `observations`. The validator enforces the boundary:

- `acceptance` and `checks` hold exactly the ids the request listed — no more, no fewer.
- Anything the reviewer verified that no listed id covers goes into `observations`. Observations are surfaced in the assessment and printed summary without changing the recommendation.
- A packet author benefits from the same discipline: incident context, caveats, and background belong under a clearly-labelled non-verification heading, never inside `acceptance_criteria` or `verification.required_checks`, because anything declared there is verified and can fail the run.

## Where it sits in the loop

Independent review is advisory input to a human decision, not a replacement for one. Record the human promotion decision on the source missions with:

```sh
uh promote <source-mission-id> --approved-by <approver> --decision <promoted|rejected|deferred>
```
