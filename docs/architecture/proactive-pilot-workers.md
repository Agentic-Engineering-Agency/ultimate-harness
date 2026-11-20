# Proactive pilot: TEAM loader and fixture worker

Status: **local fixture only**. Nothing here is wired to the CLI. It does not run a native CLI, sandbox a process, or call any network or paid API.

Source design: AE v2 package (`pilot/TEAM-contract.md`, `pilot/team.schema.json`, `worker/worker-adapter.ts`, `worker/protocol.md`).

## Files

| File | Owns |
|---|---|
| `src/schema/proactive-team.ts` | Strict Zod shape for `ae.team.v1` frontmatter. Exports the canonical capability → effect table. |
| `src/harness/proactive-pilot/team.ts` | `loadPilotTeam`, `validatePilotTeamSet`, `derivePilotActivationReport` |
| `src/harness/proactive-pilot/worker.ts` | `PilotWorkerAdapter` interface, `FakePilotWorker`, `demoPilotStartRequest` |

## TEAM loading

`loadPilotTeam(markdown)` returns `{ ok: true, team, frontmatterSha256, activationBlockers }` or `{ ok: false, errors }`.

- Input is capped at 64 KiB. The first line must be `---` (a leading BOM is allowed). Everything after the closing `---` is ignored.
- Frontmatter is parsed with the repo's existing `yaml` package (YAML 1.2 core schema, `uniqueKeys`, no merge). The loader rejects duplicate keys, multiple documents, anchors, aliases, explicit tags (`!!str` included), `<<` merge keys, non-string keys, and `${…}` or `$(…)` text. These checks run before `toJS()`, so aliases are never expanded.
- Zod rejects unknown fields at every level. No defaults or coercion are applied.
- Cross-field rules:
  - Only `sales` can be persistent or autonomous.
  - The five core external writes must be listed as prohibited.
  - Each capability's effect class must match the canonical table.
  - Every `external_write` and `control` capability must be `enabled: false, approval: disabled`.
  - Roles can only use capabilities that are known and enabled, and every enabled capability must be used by some role.
  - Review roles must hold `review.read_only` and must not hold `workspace.edit`. The proactive lane can only read and write internal notes or artifacts.
  - Every egress entry and lane source must name a declared resource.
- An `<UNCONFIGURED:…>` ref still parses, so the file passes review. Each one is returned as an `unconfigured` activation blocker.

## Activation

`validatePilotTeamSet(teams)` requires exactly one each of sales, product and engineering. Sales must be the only persistent playbook.

`derivePilotActivationReport(loaded, context)` takes `PilotActivationContext { resolvedRefs, privatePreviewWindowOpen }`. The server supplies this context; it comes from the Telar resource and profile policy.

- If the context is missing, activation is blocked (`context_unavailable`).
- A placeholder stays blocked even if the context lists it.
- A profile ref must end with `@sha256:<64 hex>`. Anything else is reported as `mutable_profile`.
- Any ref missing from `resolvedRefs` is reported as `unresolved`.
- An enabled `private.preview` is blocked until the server opens the preview window.

A ref string in TEAM.md is never treated as a grant.

## Fixture worker

`FakePilotWorker` is a synchronous, deterministic stand-in for the worker contract. UH-facing rules it enforces:

- **Start packet:**
  - Mission, attempt, and epoch are UUIDs plus a positive safe integer.
  - Commits must be full 40-hex. Artifact hashes must be lowercase 64-hex.
  - `maxCostMicroUsd` must be a safe non-negative integer.
  - Unknown fields are rejected.
  - `candidateToReview` is required in review mode and forbidden otherwise.
- **Capabilities:**
  - A capability outside the seven worker capabilities returns `policy_denied`.
  - A capability the adapter does not support returns `unsupported_capability` with `missingCapabilities`. There is no fallback.
  - Using a capability that the attempt was not granted returns `policy_denied`.
- **Epochs:** `fence(n)` (UH only) raises the epoch. Commands that carry an older epoch return `stale_epoch`.
- **Cancellation:**
  - The first `cancel` returns `request_recorded`, with `quiescent: false`.
  - `proveQuiescence(proofRef)` is the only way to reach `quiescent`.
  - Repeated cancellation returns the existing request or proven-quiescence receipt without appending duplicate events. Completed or blocked attempts reject cancellation.
  - `checkpoint` requires quiescence.
- **Candidate and completion:**
  - Candidate changes require a running implementation attempt.
  - Export is allowed only from running or proven-quiescent state. A canceled attempt cannot bypass proof, and completed attempts cannot export twice.
- **Unknown effects:** an effect with `outcome: "unknown"` blocks both `checkpoint` (handoff) and `exportArtifacts` with `unknown_effect`. It is never retried.
- **Review:**
  - The reviewer cannot edit or record a candidate.
  - Export must match the exact expected candidate commit, or it returns `integrity_conflict`.
- **Replay:**
  - `streamEvents(ctx, after)` returns events strictly after the cursor.
  - A cursor older than the retained window returns `stream.gap` followed by a `stream.snapshot` at the current cursor. It never returns an empty list in that case.
  - Cursors from another attempt, or from the future, are rejected.

`demoPilotStartRequest(mode)` builds a packet that uses only obviously fake IDs (`00000000-0000-4000-8000-…`) and hashes made of a single repeated character.

## Limits (not claimed)

- The event log is in memory, bounded by `retainEvents`, and **not durable**. It provides no durable dedupe and no crash recovery.
- It does not launch native processes, isolate anything, or enforce egress. Quiescence "proof" is just an artifact reference the caller supplies.
- Effects are recorded only so the tests can drive them. Telar remains the source of truth for effects.
- Usage and spend are not metered. The budget is validated, then echoed in the export.

## Upstream discrepancies

The design package contradicts itself in two places:

1. `captain.session_owner`: `team.schema.json` says `cloudflare_agents_do_pi_harness`, but all three reviewed TEAM.md files say `cloudflare_agents_do_piharness`. The loader accepts only the TEAM.md spelling.
2. `task_roles[].allowed_capabilities`: the schema pattern `^[a-z][a-z0-9.-]{1,63}$` rejects the schema's own `review.read_only`. The loader allows `_`, and unknown names are still rejected by the capability check.

Both need an upstream decision before the loader is used for anything beyond fixtures.
