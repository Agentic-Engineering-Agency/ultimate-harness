# AE proactive pilot v0.1 — local contract rehearsal

Status: integrated and locally verified, 2026-10-28. Tracked as AE-558. This is a deliberately bounded first implementation of the reconciled v2 design, not the full durable platform and not a Telar product implementation. See [verification and handoff](handoff.md).

## Next agent prompt

The two worker lanes are integrated. Read [handoff](handoff.md) and the candidate review disposition before continuing. Do not repeat implementation or enable live effects. Resolve the real identity, broker, storage, worker-host and Telar authorization gates in Remaining gates before selecting a production slice. Keep the existing main checkout and source worktrees untouched, and update this handoff before ending the next pass.

## Baseline reconciliation

Baseline UH revision: `c5cec50e8155e277c7e83e698f7e346fd2474f7a`. Telar is currently an architecture/planning repository with a human implementation gate and Cordis/DeepSeek invariants. There is no verified implemented Telar Postgres service to migrate. The v2 research specification is proposed, not a ratified replacement of ADR-023. This slice adds local fixture-only rehearsal modules to UH without changing Telar, existing CLI dispatch or production authorization.

UH owns native coding-attempt execution. The local pilot uses fake worker and trusted-input fixtures to exercise proposed contracts; it cannot grant live permission, send messages, modify CRM, create cloud resources, push, merge, deploy or publish a preview. Worktrees do not claim OS isolation. Real broker, identity, Telar, Pi durable, Cloudflare Workflows/D1 and native worker bridges remain follow-on integration gates.

## Scope and boundaries

- Codex lane: new strict pilot event/approval schemas, admission guards, tests and concise contract rationale.
- Claude lane: new TEAM parser/activation guards, explicit fake worker, tests and protocol rationale.
- Manus integration: new fixture demo, executable integration tests, handoff and evidence receipts; reconcile only these new-file surfaces.
- Independent review: one frozen candidate/file-hash set; maximum two cycles, no nested reviewers, bounded session time.

All writers use separate worktrees from the same baseline. No existing function/class is edited, no public CLI route is changed and no package dependency is added. Existing frozen dependencies may be restored without lifecycle scripts. Existing main-checkout `.gitignore` and `.omp/config.yml` changes remain untouched.

## Acceptance

1. Five strict AE pilot route event shapes preserve root-task lineage, tenant and source/artifact references. Unknown fields, invalid integers, invalid IDs and stale/expired inputs fail closed.
2. Model-authored envelope fields cannot self-establish trusted tenant/principal/authorization. Trusted context in this slice is explicitly an injected fixture, not a real identity provider.
3. Exact approval argument/artifact/commit/policy/expiry bindings are checked. Revocation, changed scope and forbidden external effects reject.
4. TEAM files may be parse-valid with unconfigured references but cannot activate. YAML tags/aliases/duplicate keys and permission expansion reject.
5. Fake worker enforces declared capability/epoch checks and distinguishes cancel requested from proven fake quiescence. Unknown effects block handoff and review binds an exact candidate.
6. Runnable local fixture demonstrates Sales intake → Product spec → scope gate → fake Engineering implementation/review → Sales-safe artifact, with no external I/O other than explicitly requested local output.
7. Focused tests, integration smoke, UH typecheck/build/full tests are run and their real outcomes recorded. Pre-existing failures are not silently fixed or hidden.
8. Final handoff distinguishes implementation, mocks, untested production integrations and unapproved activation.

## Dependency and model policy

Reuse installed package/runtime conventions: TypeScript, Node 20+, Bun packaging, Zod, YAML and Vitest. Do not add dependencies or secretly install a canonicalization framework. Restricted canonical JSON behavior must be precisely labelled and tested; full RFC 8785 compliance is not assumed. TypeSafe skill was read; deterministic identity, schema, policy, hash, epoch and approval checks remain code. No TypeSafe judgments/primitives or live inference API calls are needed for this contract rehearsal. Native coding CLI usage is separately user-requested; record actual configured model/session when available, otherwise unknown.

## Remaining gates

Real identity and broker design; live Pi/Agents SDK compatibility qualification; storage decision and any Telar implementation authorization; provider idempotency evidence; root-budget persistence/concurrency; target-host isolation; cancellation proof against real processes; signed approval receipts; actual worker Run Control seam; protected independent tests; operational backup/restore and tenancy review. None is waived by a green fixture demo.
