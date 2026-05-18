# Spec-Driven, Test-Driven, Cross-Runtime: the three discipline layers

Ultimate Harness ships three composable verification disciplines. Each one is opt-in, each one is independently testable, each one writes to the same `verification.yaml` + `events.ndjson` pipeline so live observers (the TUI, future replay tools, audit consumers) never need a special code path.

Last updated: 2026-05-18. Shipped via UH-54 (SDD), UH-55 (TDD), UH-56 (cross-runtime QA).

---

## 1. Spec-Driven Development (UH-54)

**Promise:** every claim a mission makes about what "done" looks like is independently verifiable, machine-checked, and traced in the audit log.

**Schema** (`mission.yaml`):

```yaml
acceptance_criteria:
  - id: ac-tui-dashboard
    description: "uh tui shows a Mission Control dashboard"
    check_command: "bun test tests/tui-dashboard.test.ts"
    severity: block
  - id: ac-events-latency
    description: "Live events render within 50 ms"
    check_command: "bun run bench:tui-events"
    severity: warn
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | stable slug; unique within the mission; appears in audit trail |
| `description` | yes | human-readable |
| `check_command` | no | shell command run from the sandbox/root; exit 0 = pass |
| `severity` | no (default `block`) | `block` fails the mission on failure; `warn` records and continues |

**What `uh verify` does:**

1. Runs every `required_check` first (legacy contract).
2. Runs every AC's `check_command` in declared order.
3. Captures `{status, exit_code, duration_ms, stdout_snippet, stderr_snippet}` per AC into `verification.yaml#acceptance_criteria[]`.
4. Emits `acceptance.checked` rows on `events.ndjson` so the TUI's live tail surfaces per-AC progress.
5. Escalates `verification.status`:
   - any `block` AC failed → `failed`
   - any `block` AC unverified (no `check_command`) → `blocked` + finding
   - otherwise the legacy `required_checks` semantics apply

**Backwards compatibility:** missions that omit `acceptance_criteria` continue to verify against `completion_criteria`/`required_checks`. Plain `completion_criteria` strings auto-promote to `severity: warn` ACs so legacy missions still surface their intent in the audit trail.

---

## 2. Test-Driven Development (UH-55)

**Promise:** missions that opt in cannot ship a diff that touches source files without also touching tests.

**Schema** (`mission.yaml`):

```yaml
tdd:
  enforce_tests_first: true
  test_paths:
    - "tests/**"
    - "**/*.test.ts"
    - "**/*.spec.ts"
    - "**/__tests__/**"
  source_paths:
    - "src/**"
```

| Field | Default | Notes |
|---|---|---|
| `enforce_tests_first` | `true` | the only field that actually gates verification today |
| `test_paths` | conventional set | globs evaluated against the captured `diff.patch` |
| `source_paths` | `["src/**"]` | test globs win over source globs (so `src/foo.test.ts` is a test) |

**What `uh verify` does:**

1. Reads the captured `diff.patch` from the mission directory.
2. Calls `classifyDiff(diff, …)` (a pure helper in `src/harness/diff-classifier.ts`) that walks unified-diff hunks, extracts every touched path (handles `--- /dev/null`, renames, C-quoted paths), and buckets each into `tests`/`source`/`other`.
3. Appends a synthetic `acceptance_criteria` entry `ac-tdd-tests-precede-code` (severity `block`) to the same UH-54 pipeline:
   - source files changed without tests → AC `failed`, run `failed`
   - any test change → AC `passed`
   - no `diff.patch` captured → AC `blocked`, run `blocked` + finding
4. The synthetic AC participates in event emission (`acceptance.checked` with `synthetic: true`), status escalation, and CLI summaries identically to a user-declared AC.

**Opt-in:** missions without a `tdd` block behave exactly as before.

---

## 3. Cross-runtime QA (UH-56)

**Promise:** the same mission can be run against every active adapter; the harness produces a side-by-side report that highlights agreement and divergence in the captured diffs.

**CLI:**

```bash
uh mission run-all <mission-id> [--runtimes hermes,codex,hermes-proxy,oh-my-pi]
                                [--root <path>] [--serial]
```

- `--runtimes` defaults to every adapter under `.harness/adapters/` with `status: active`.
- One sandbox per runtime, named `sbx-<missionId>-<runtime>-<short-ts>`, created **serially** to avoid racing the unlocked `sandboxes/index.yaml` read-modify-write.
- Adapter runs dispatch **in parallel** once sandboxes are prepared (or sequentially with `--serial`).
- Sandboxes are not auto-discarded — the operator inspects each worktree before deciding.

**Artifacts written:**

- `.harness/sandboxes/<sandbox>/worktree/.harness/missions/<id>/` — each runtime's `runtime-session.yaml` + `diff.patch` + `runtime-final.txt`.
- `.harness/missions/<id>/runtime-comparison.md` — the markdown report with:
  - per-runtime status table (status / exit / duration / diff hash / sandbox)
  - diff equivalence groups (which runtimes produced identical diffs)
  - per-runtime touched-paths list
  - per-runtime sentinel block
- `.harness/missions/<id>/events.ndjson` — appended `runtime.compared` rows and one final `runtime.comparison.summary` row.

**Exit codes:**

| Outcome | Code |
|---|---|
| All runtimes succeeded AND diffs agree | 0 |
| Diffs diverged | 1 |
| Any runtime failed/blocked/errored | 1 |

**Agreement semantics:** "agreement" requires ≥ 2 successful runtimes that share a `diffHash`. A single successful runtime is not enough.

---

## 4. How the three stack

Run a TDD mission against three adapters and you get:

```
$ uh mission run-all my-bugfix
[DIVERGENT] my-bugfix
runtimes: 3 succeeded, 0 not
report: …/.harness/missions/my-bugfix/runtime-comparison.md
divergent: oh-my-pi
```

Then verify against the canonical mission:

```
$ uh verify my-bugfix
[FAIL] my-bugfix
checks: 0 passed, 0 failed, 0 blocked
acceptance: 1 passed, 1 block-failed, 0 warn-failed, 0 blocked (total 2)
  see acceptance_criteria[] in …/verification.yaml for per-AC stdout/stderr snippets
```

The block-failed AC is `ac-tdd-tests-precede-code` because (say) `oh-my-pi` shipped a source-only diff. Add a `runtime-comparison` AC to the mission's `acceptance_criteria` if you want divergence itself to gate promotion:

```yaml
acceptance_criteria:
  - id: ac-cross-runtime-agreement
    description: "All active adapters agree on the diff"
    check_command: "test \"$(yq '.divergent_runtimes | length' .harness/missions/${MISSION_ID}/runtime-comparison.json)\" = 0"
    severity: warn
```

---

## 5. References

- `src/schema/mission.ts` — `AcceptanceCriterionSchema`, `TddOptionsSchema`.
- `src/schema/artifacts.ts` — `AcceptanceCriterionResultSchema`, `VerificationResultSchema`.
- `src/harness/verify.ts` — `verifyMission`, `runCommand`, AC loop, TDD synthetic AC.
- `src/harness/diff-classifier.ts` — `globToRegExp`, `extractDiffPaths`, `classifyDiff`.
- `src/harness/run-all.ts` — `runMissionAcrossRuntimes`, `compareRuntimeOutcomes`, `renderRuntimeComparisonMarkdown`, `persistRuntimeComparison`.
- `tests/verify.test.ts` — covers both UH-54 (8 cases) and UH-55 (7 cases).
- `tests/diff-classifier.test.ts` — 17 cases.
- `tests/run-all.test.ts` — 15 cases.

PRs: [#68](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/68), [#69](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/69), [#70](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/70).
