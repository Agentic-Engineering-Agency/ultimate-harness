# Runtime Adapter Contract

## Purpose

Runtime adapters let Ultimate Harness execute the same mission through different coding agents without changing the mission semantics.

Adapters must provide structured lifecycle reporting. A shell command is not enough.

## Adapter manifest

```yaml
schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
version: 0.1.0
runtime_kind: hermes
capabilities:
  interactive: true
  non_interactive: true
  structured_events: true
  sandbox_required: true
  subagents: true
  skills: true
  file_tools: true
  browser_tools: true
supported_sandbox_backends:
  - git-worktree
  - agentfs
input_formats:
  - uh.mission.v0
output_formats:
  - uh.runtime-result.v0
```

## Required lifecycle methods

### `prepare(mission, sandbox)`
Validates mission compatibility, resolves skills/context, checks runtime availability, and returns a launch plan.

### `launch(prepared_mission)`
Starts the runtime session and returns a `runtime_session_id`.

### `observe(runtime_session_id)`
Returns structured events: status, logs, tool calls, file changes, questions, blockers, and partial artifacts.

### `send(runtime_session_id, message)`
Optional for interactive steering. Must record steering messages in the audit trail.

### `collect(runtime_session_id)`
Collects final artifacts: summary, changed files, diffs, logs, generated docs, verification suggestions, and open blockers.

### `cancel(runtime_session_id, reason)`
Stops a running mission safely and records partial state.

### `close(runtime_session_id)`
Releases runtime resources and finalizes session metadata.

## Runtime result shape

```yaml
schema_version: uh.runtime-result.v0
mission_id: mission-2026-05-13-docs-spine
runtime:
  adapter_id: hermes
  session_id: hermes-session-abc123
status: passed # passed | failed | blocked | cancelled
summary: "Created documentation spine."
artifacts:
  - path: docs/architecture/runtime-adapter-contract.md
    kind: documentation
    status: created
changes:
  diff_ref: .harness/missions/mission-.../diff.patch
  files_changed:
    - docs/architecture/runtime-adapter-contract.md
checks_suggested:
  - markdown-link-check docs/**/*.md
blockers: []
logs:
  - .harness/missions/mission-.../runtime.log
```

## Native process supervision and accounting

OMP and Command Code use UH's shared process runner. Configure limits in the
adapter's `config.runtime_config.limits` or a mission's
`runtime_config_overrides.limits`:

```yaml
limits:
  timeout_ms: 1800000
  startup_timeout_ms: 120000
  stall_timeout_ms: 300000
  max_output_bytes: 67108864
```

The combined stdout/stderr capture limit defaults to 64 MiB even when omitted.
Crossing it stops the owned process tree with `stop_code: output_limit`; the
crossing chunk and later chunks are not captured. Previously admitted bytes
remain in the durable logs and adapter output. This is a failed, incomplete run,
not a successful truncated response. Output-limit failures do not automatically
resume under the bounded recovery policy.

Windows runs use a native Job guardian that outlives the controller, terminates
the owned tree on controller loss, and records whether settlement was confirmed.
A Job provides process ownership and optional committed-memory limits, **not**
filesystem or network isolation. A stale heartbeat alone does not prove process
termination. Local cancellation and saved-session recovery reconcile confirmed
controller-loss receipts with canonical session/result/index artifacts.

On Windows, canonical artifact transactions use a kernel-owned named pipe keyed
by the canonical local artifact path. Controller death releases ownership without
PID guessing or stale-lock deletion. Acquisition remains bounded at ten seconds.
Legacy `.lock` files are retained and block updates pending owner reconciliation;
do not mix controllers from before and after this lock-protocol change. Other
platforms retain the bounded filesystem lock and fail closed on abandoned locks.
These are local-machine locks, not distributed coordination for shared storage.

Hermes CLI execution and OpenSandbox command templates also reuse the owned
runner for bounded capture and process-tree timeout settlement. On Windows,
explicit `.js`/`.mjs`/`.cjs` CLI entrypoints execute through Node. OpenSandbox
templates retain POSIX quoting: UH locates a native shell from Git for Windows,
or accepts an explicit executable through `UH_OPENSANDBOX_SHELL`; it does not
interpret those templates with `cmd.exe` or silently choose WSL. Local shell
fixtures do not establish an OpenSandbox provider or container-isolation claim.

Artifact writes reject observed symlinks and junctions at the target and its
ancestors through `.harness`, including a run directory replaced after launch.
These filesystem checks do not replace an OS isolation boundary.

Finalized lifecycle events use the Observatory's existing artifact-age freshness
policy; they are not permanently labeled fresh. Aging evidence does not turn a
confirmed failed or completed operation back into an active process.

Recovery accounting follows `runtime-recovery.json` source attempts and counts
each canonical attempt once within its artifact root, including failed attempts.
Team parents aggregate each worker's independent canonical artifact root; product
worktree cleanup does not remove those receipts. Missing attempt receipts or
unreported counters make the corresponding total unknown, never zero. Mixed
providers/models can still have a known combined USD amount without a fictitious
single-model attribution.

Optional `cost_basis` distinguishes `runtime_estimate`, `configured_estimate`,
`provider_reported`, and `mixed`. Native OMP cost figures are runtime estimates,
not billing receipts. Observatory labels costs as reported only when explicitly
backed by `provider_reported`; otherwise known costs are labeled estimated.
HTTP adapters preserve reported counters in canonical results and leave absent
usage unknown rather than estimating it from prompt or response length.

### Native route and trust policy

OMP uses a mission's `runtime_config.model` before the adapter's `default_model`.
A qualified `provider/model` selects both route components; otherwise
`default_provider` supplies the provider when configured. Use exact native model
identifiers, not fuzzy aliases, for an assigned route. Text mode is rejected when
an OMP route is assigned because it cannot supply structured route evidence.
Command Code requires an explicit model identifier.

The native runner records `expected_route`. An observed assignment mismatch
stops the owned process tree with `route_mismatch`. Completion without the
required native route evidence fails with `route_unverified`; requested settings
and session banners do not count as observations. Neither stop permits saved-run
recovery. Collectors also reject mismatched or unverified route results.

These checks consume runtime-produced events: they do **not** guarantee that the
provider's first request has not already happened. They are not a provider
authorization firewall or a filesystem/network sandbox.

UH adds Command Code's `-t` auto-trust flag only when
`runtime_config.trust_workspace: true`; it no longer adds it unconditionally.
Operator-supplied `cli_args` remain part of the trusted executable configuration,
not an OS security boundary. The unsupported native `worktree_mode` setting is
rejected by both adapters; workspace isolation belongs to UH's existing backend.

### Configured Command Code prices

Command Code accepts optional `runtime_config.pricing` (also supported through
mission overrides). Supply explicit USD-per-million rates and the counter overlap
semantics for the assigned model. The following numbers are synthetic examples,
not a model catalog or current provider prices:

```yaml
pricing:
  model: fixture/model
  input_usd_per_million: 1
  output_usd_per_million: 2
  cache_read_usd_per_million: 0.1
  cache_write_usd_per_million: 3
  input_includes_cache_read: true
  input_includes_cache_write: true
```

An estimate requires a terminal receipt, complete input/output/cache counters,
and exactly one observed model matching the price entry. Missing counters,
truncated output, absent terminal evidence, mixed models, or impossible cache
overlap leave the estimate unknown. Raw partial usage events remain available.
No default model prices, cache-write assumptions, or suffix-based model aliases
are substituted. The rate snapshot is retained in the canonical session/result,
and computed costs carry `cost_basis: configured_estimate`. Neither this estimate
nor the router's broad cost classes establish actual billing.

## Capability model

Adapters should declare capabilities rather than relying on implicit behavior:

- `structured_events`
- `interactive_steering`
- `non_interactive_run`
- `skills`
- `subagents`
- `browser`
- `terminal`
- `file_tools`
- `sandbox_native`
- `json_output`
- `diff_output`


Mission packets may declare `capabilities: [...]` using the same ids.
`uh mission dry-run`, `uh mission run`, and `uh mission run-all` now
enforce the selected runtime adapter's declared capabilities before
dispatch. A mismatch blocks with a missing-capability error unless the
operator passes `--force`; missions without `capabilities` preserve the
legacy no-op behavior.

## Adapter responsibilities

Adapters must:

1. Refuse missions requiring unsupported capabilities.
2. Preserve mission IDs in prompts/logs/results.
3. Avoid writing directly to canonical state unless promotion policy explicitly allows it.
4. Return enough evidence for verification and review.
5. Separate runtime errors from mission failures.
6. Capture user/human steering as audit events.

## Adapter non-responsibilities

Adapters should not:

- Decide product scope.
- Rewrite specs without a workflow step.
- Promote changes without approval.
- Invent undocumented entity names.

## Runtime-final-message capture protocol (UH-28)

Every adapter participates in a uniform protocol for capturing the
mission's final summary message into `runtime-final.txt`:

### Prompt-side contract

The harness appends the following instruction block to the mission
prompt before handing it to the runtime (`runtimeFinalMessageInstruction()`
in `src/harness/runtime-final-message.ts`):

```text
## Runtime final message

At the very end of your response, emit your one-paragraph summary inside
a fenced code block tagged `uh-runtime-final-message`:

```uh-runtime-final-message
<one-paragraph summary of what you did, what changed, and any caveats>
```

This fenced block MUST be the last block in your output. The harness
extracts its content verbatim into `runtime-final.txt`.
```

### Extraction-side contract

Each adapter calls `extractRuntimeFinalMessageSentinel(text)` over the
captured model output and writes the matched content into
`runtime-final.txt`. When the sentinel is absent, the adapter falls back
to its runtime-native capture path (see table below).

The extractor:

- Matches `` ```uh-runtime-final-message ``` `` fenced blocks anywhere in
  the captured text.
- Returns the LAST occurrence (a mission may emit interim drafts; only
  the terminal block is authoritative).
- Tolerates CRLF line endings, leading/trailing whitespace inside the
  fence, and optional spaces after the opening tag.
- Returns `null` when no sentinel block is present.

### Per-adapter resolution

| Adapter   | Sentinel scan target                                       | Fallback when sentinel absent                                 |
|-----------|------------------------------------------------------------|---------------------------------------------------------------|
| codex     | Content of `--output-last-message` file (raw text)         | Raw file content (Codex's native final message)               |
| oh-my-pi  | Last assistant text decoded from native messages and typed content arrays | Last decoded assistant text |
| hermes    | Hermes stdout text                                         | Empty file (Hermes does not produce a native summary today)   |

### Status semantics

- The sentinel does NOT change `runtime-result.status`. Status remains
  driven by exit code, runtime-native signals (Codex's
  `--output-last-message` presence, Hermes' `uh.runtime-result.v0`
  block, oh-my-pi's native terminal errors and non-empty final message).
- A mission may emit a runtime-result `status: passed` even when the
  sentinel is omitted, as long as the runtime-native fallback path
  satisfies the adapter's success criteria. The sentinel is the
  *preferred* summary source, not a *required* one.

### Native OMP facts and sandbox artifacts

Sandbox execution and canonical artifact persistence are separate boundaries.
OMP runs and product diff capture remain in the selected sandbox; the CLI publishes
run events and terminal artifacts under the host mission so existing readers can
observe progress before exit. Publishing those facts does not promote product
changes. An active run takes precedence over an older terminal result in the
Observatory.

Cancellation settles the selected run's result, runtime session, and index even
when its event log cannot be appended. Mission mirrors and the latest pointer
change only when they still identify that run; cancelling an older run preserves
newer run facts. Cancelled results use `cancelled`, while runtime sessions use
`failed` with the signal exit code. Initial OMP event persistence failure likewise
settles writable terminal artifacts without starting the child.

Usage totals come from completed native assistant messages, not repeated progress
or final-envelope copies. Explicit message identities take precedence over
timestamp/content deduplication: distinct identities count independently.
Missing measurements remain unknown. Reported cost is runtime evidence, not
proof of an invoice or subscription charge. Structured terminal errors fail the
run even after assistant output. Public failure summaries and Observatory
projections must not expose raw prompts, tool payloads, credentials, or transcripts.

### Why a single shared protocol

Before UH-28 each adapter rolled its own final-message capture:
Codex used a side-channel file, Hermes had no `runtime-final.txt` at all,
oh-my-pi did a JSON heuristic. UH-28 lets missions explicitly bound the
summary independent of runtime quirks, which:

1. Makes the summary deterministic across runtimes for cross-runtime
   QA comparisons.
2. Removes the need for adapter-specific prompt instructions (each
   buildMissionPrompt now appends the same sentinel block).
3. Lets the harness add structured terminal annotations in the future
   (e.g. `uh-runtime-blockers`, `uh-runtime-next-steps`) using the
   same extraction pattern.

## Independent review packets

`uh mission review-prepare <id> --sources <json> --runtime <runtime> --model <model>`
emits a normal UH mission without starting a model. Sources are an array of
`{"missionId":"worker-a","workspaceRoot":"optional explicit output workspace"}`.
Without an explicit workspace root, preparation uses the source mission's bound
workspace. It captures the complete canonical contracts and every declared output,
records missing files, and applies the same nonempty-file, JSON, and completion
marker checks as ordinary mission verification. Existing packets are not overwritten.

The request and captured files carry SHA-256 digests. Reference paths retain their
source-workspace meaning; snapshots define the point-in-time review, not subsequent
source changes. Preparation does not copy credential stores or create a second
controller. Operators remain responsible for the sensitivity of declared inputs.

Create a separate workspace with
`uh sandbox create <workspace-id> --mission <review-id> --backend directory`.
After authorizing the model execution, run the emitted mission with the assigned
native runtime through ordinary `uh mission run`. OMP and Command Code enforce the
assigned runtime/model and refuse resumed reviewer sessions. OMP review disables
Honcho memory, extensions, and skills; Command Code review rejects free-form runtime
arguments that could override the session contract. The canonical mission must match
its workspace copy. These are assignment and workspace guards, not OS filesystem or
network isolation guarantees.

`uh mission review-collect <id>` requires a successful native execution receipt bound
to the request and an intact request/input snapshot in both canonical and execution
workspaces. Every source, acceptance criterion, and required check must appear exactly
once. Missing or invalid outputs require `needs-remediation`; unverified or contradicted
evidence cannot receive `pass`. Ordinary `mission verify` includes these checks and
refuses a workspace mutation that removes the review contract or changes its policy.

The resulting `review-assessment.json` is advisory and always records
`human_acceptance_required: true`. It neither records an owner verdict nor promotes
source work. A successful review mission means the assessment is valid, not that its
source work passed review. Local fixture execution verifies this lifecycle without
claiming model-review quality or provider/OS isolation acceptance.
