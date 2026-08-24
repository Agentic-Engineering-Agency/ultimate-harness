# S01: Safe contract and projection

Status: implemented and verified for the bounded UH filesystem source. The broader refusal and
state matrix listed below is the S03 hardening backlog.

## Goal

Produce one strict, privacy-preserving `delivery-observatory.v1` snapshot from verified Ultimate
Harness artifacts without reusing the current plugin's raw payloads.

## Changes

- Add the strict public Zod contract under `src/schema/` with tagged known/unknown scalar values,
  bounded records, explicit truncation, orthogonal truth/freshness/operation/source-health states,
  and unknown-key rejection.
- Add a UH-local projector under `src/harness/delivery-observatory/` that reads canonical indexes
  and allowlisted artifact fields only.
- Centralize safe-text classification, forbidden-field rejection, redaction accounting, freshness,
  and provenance in that projector.
- Add the disk-only public command `uh observatory snapshot --json`.
- Keep source adapters internal until a second verified producer passes conformance; the public
  boundary is the versioned snapshot.

## Truth requirements

- Runtime success never implies verification.
- A run pointer that says `running` becomes "reported running; liveness unknown" without a verified
  lease, heartbeat, or process observation.
- Requested and actual routes stay separate; missing actual model/provider/version is unknown.
- Missing cost, tokens, latency, quality, or counts stay unknown. An observed zero remains zero.
- Inferences cite a versioned rule and observed basis. Proposals cite their authority.

## Privacy requirements

- Allowlist fields before serialization. Regex detection is a backstop, not the classifier.
- Reject prompts, messages, transcripts, completions, memories, raw events, logs, diffs, commands,
  arguments, environment data, stdout/stderr, credentials, URLs with secrets, and filesystem paths.
- Evidence contains metadata only. There is no arbitrary metadata, extensions, producer payload,
  or error-detail bag.
- A source failure emits only safe reason codes and coverage counts.

## Tests

Implemented coverage includes strict contract validation, private path/body/log/gate omission,
honest empty/unknown values, and corrupt-artifact rejection accounting.

- Golden snapshots for active, blocked, failed, cancelled, awaiting-human, fallback, stale, and
  unknown-route states.
- Refusal fixtures for secrets; macOS/Linux/Windows/home paths; raw/private field names; unknown
  keys; oversized data; malformed timestamps; non-finite values; snapshot-as-live claims; and
  missing-as-zero coercion.
- Projector tests prove that runtime success is not verification, stale pointers are not liveness,
  actual route is not copied from requested route, and corrupt artifacts degrade one source only.
- Inject the clock so freshness tests are deterministic.

## Playable checkpoint

On a local initialized UH project, `uh observatory snapshot --json` returns a valid path-free
snapshot with visible coverage, freshness, limitations, and unknown values. It invokes no model,
network, mutation, or legacy raw plugin endpoint.

## Exit gate

Contract, authority, and privacy review approve the public shape before the plugin transports it.
