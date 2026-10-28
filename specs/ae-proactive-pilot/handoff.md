# Local proactive-agent pilot handoff

Updated 2026-10-28. Tracking: AE-558. Baseline: `c5cec50e8155e277c7e83e698f7e346fd2474f7a`.

## What changed

The integration worktree already contained Manus's admission contracts, fictional flow fixtures,
demo and integration test. The demo could not load `./team.js`. The six missing TEAM schema,
TEAM loader, fake worker, associated tests and worker rationale files were copied byte-for-byte
from the existing workers lane, without replacing any existing file. The contracts lane was
already present. Subsequent review exposed state-gating and handoff-binding defects; the
integrated worker and demo were hardened, with new regression tests. The source worktrees and
the dirty main checkout were not modified.

Run the complete local rehearsal from a source checkout:

```sh
bun scripts/proactive-pilot.ts
```

It prints five Sales → Product → Engineering → Sales event receipts, with `mode: fixture-only`,
`activated: false`, `externalEffects: []`, and an unpublished artifact. Duplicate delivery returns
the original identifiers; changed approval scope and a stale worker epoch reject. Cancellation
acknowledgment is distinguished from fictional quiescence proof, canceled attempts cannot
export before proof, and terminal attempts cannot change candidates or export twice. The
engineering handoff must match the exact scope approval's artifacts, commit and task lineage.
All three unconfigured TEAMs
remain blocked. The command rejects arguments with exit code 2, including `--activate`.

This is a source-checkout developer rehearsal, not a new installed `uh` command. The npm package
does not include the root fixture directory or the script; do not advertise the demo as an
installed-package capability. Existing CLI dispatch and package exports are unchanged.

## Verification

Executed against the integrated candidate on macOS arm64 with Bun 1.4.2:

| Gate | Observed outcome |
| --- | --- |
| Initial `bun run test -- tests/proactive-pilot-flow.test.ts` | Failed before integration: cannot find `./team.js`. |
| `bun run test -- tests/proactive-pilot-admission.test.ts tests/proactive-pilot-team.test.ts tests/proactive-pilot-worker.test.ts tests/proactive-pilot-flow.test.ts` | 4 files, 46 tests passed after integration. |
| Focused pilot suite including `tests/proactive-pilot-lifecycle.test.ts` | 5 files, 63 tests passed after hardening. The new lifecycle/handoff cases reproduced 16 failures before the fix; an additional case explicitly verifies multi-document YAML rejection. |
| `bun scripts/proactive-pilot.ts` | Exit 0; five handoffs; all reported safety checks true; no activation or external effects. |
| `bun run typecheck` | Exit 0. |
| `bun run build` | Exit 0. |
| Initial unrestricted `bun run test` | 927 passed, 1 failed: the existing CLI timeout test exceeded its 3000 ms wall-clock assertion at 4937 ms. No test was changed. |
| `bun run test -- --maxWorkers=2 --reporter=dot` | 78 files, 928 tests passed in 27.55 seconds. Bounded parallelism reduces contention on the shared Mac; it does not change assertions. |
| Final `bun run typecheck && bun run build && bun run test -- --maxWorkers=2 --reporter=dot` | Exit 0 after hardening: 79 files, 945 tests passed in 27.83 seconds. No existing test was weakened or deleted. |
| `node dist/cli.js --help` and `node dist/cli.js --version` | Exit 0; CLI help and version 0.9.0. |
| `node dist/cli.js status --json` | Exit 0; valid `uh.status.v0` output. Existing checkout drift is reported, not repaired or suppressed. |
| `bun scripts/proactive-pilot.ts --activate` | Exit 2; usage refusal. |

GitNexus was refreshed with `gitnexus analyze --index-only --workers 2`, avoiding instruction and
skill injection. Its graph has explicit inference/truncation limits; absence of a caller is not
proof of absence. New untracked files are invisible to diff-based detection until staged.
The staged aggregate report labelled the large new-file set critical; exact upstream queries
for the demo, admission guard and changed worker methods were low-risk and led only to the
new demo and tests. Existing runtime and CLI entry points are unchanged.

`candidate.sha256` freezes the implementation, tests, fixture playbooks and spec/design
documents. The checksum file cannot hash itself; `review.md` is the later review-disposition
receipt, not part of the implementation under review.

## Remaining boundaries

- State, receipts and worker logs are in memory. There is no durable deduplication, restart
  recovery, atomic approval consumption or root-budget persistence.
- Identity and approvals are injected fictional inputs, not authenticated human authority.
- The fake worker launches no process and enforces no operating-system isolation or network
  policy. Its proof artifact is a reference, not evidence that a real process stopped.
- TEAM content is parsed and checked, never activated. Cloudflare, Pi durable, real broker,
  Telar and provider integrations are not implemented or qualified here.
- The proposal's session-owner spelling and capability-name pattern contradict its example
  TEAM files. The loader's documented fixture choices do not ratify an upstream contract.
- The JSON canonicalizer supports a documented bounded subset, not full RFC 8785 conformance.
- No release, CRM operation, message, deployment, live schedule or preview publication occurred.

## Next pickup

Consult `review.md` for the bounded review disposition and publish only this pilot's files when
that review has no unresolved major findings. Do not infer a production go-ahead from green tests. A later production slice needs an
explicit architecture/authorization decision and its own spec, conformance and crash-recovery
tests. Keep The Bell Road changes separate: no game source was found in the local project
locations during discovery; the owner subsequently supplied a game export that is being
handled in its own repository, not in UH.
