# Mission Packet Schema

## Purpose

A mission packet is the portable work request sent to a runtime adapter. It must be clear enough for a human to execute manually and structured enough for a runtime adapter to launch automatically.

## Draft schema: `uh.mission.v0`

```yaml
schema_version: uh.mission.v0
id: mission-2026-05-13-docs-spine
title: Create documentation spine for Ultimate Harness
issue_refs:
  - provider: github
    id: "21"
    url: https://github.com/Agentic-Engineering-Agency/ultimate-harness/issues/21
  - provider: linear
    id: UH-1
workflow_profile: research-docs
priority: high

objective: >
  Build the initial documentation foundation before implementation begins.

context:
  repo_root: /Users/eduardojaviergarcialopez/AgenticEngineering/ultimate-harness
  read_first:
    - README.md
    - docs/architecture/overview.md
  source_links:
    - https://github.com/bmad-code-org/BMAD-METHOD
    - https://github.com/obra/superpowers
    - https://github.com/gsd-build/get-shit-done
    - https://github.com/Fission-AI/OpenSpec

constraints:
  - Do not implement the CLI yet.
  - Keep claims traceable to source systems.
  - Treat BMAD as inspiration, not dependency.
  - Prefer human-readable Markdown artifacts.

skills:
  required:
    - writing-plans
  suggested:
    - code-review

expected_outputs:
  files:
    - docs/README.md
    - docs/glossary.md
    - docs/research/comparison-matrix.md
    - docs/product/prd.md
    - docs/architecture/runtime-adapter-contract.md
    - docs/architecture/mission-packet-schema.md
    - docs/workflows/bmad-agent-map.md

sandbox:
  backend: git-worktree
  promotion_policy: human-approved

verification:
  required_checks:
    - name: docs-tree-exists
      command: find docs -type f | sort
    - name: git-diff-review
      command: git diff -- docs README.md
  review_gates:
    - spec-compliance
    - documentation-quality
    - broken-link-sanity

completion_criteria:
  - Docs tree is navigable from docs/README.md.
  - Root README links to docs.
  - Core entities and adapter contract are defined.
  - MVP boundary is explicit.

acceptance_criteria:
  - id: ac-tree
    description: Docs tree navigable from docs/README.md.
    check_command: find docs -type f | sort
    severity: block
  - id: ac-links
    description: All Markdown links resolve.
    check_command: bun run check:links
    severity: warn
```

## Field rules

- `schema_version` is required and must be versioned.
- `id` must be stable and audit-safe.
- `issue_refs` should include all external trackers when available.
- `workflow_profile` must match a defined profile.
- `context.read_first` should be ordered.
- `constraints` are hard limits for the runtime.
- `skills.required` must be loaded/applied by capable runtimes.
- `expected_outputs` should include paths and artifact kinds where possible.
- `sandbox.promotion_policy` must be explicit.
- `verification.required_checks` should be runnable commands or named manual checks.
- `acceptance_criteria` (Spec-Driven Development, UH-54) declare each criterion with a stable `id`, a `description`, an optional `check_command` (defaulted from the global `verification.required_checks` when omitted) and a `severity` of `block` (verification fails when this AC fails) or `warn` (recorded for the audit trail, not blocking).
- When `acceptance_criteria` is absent, every entry under `completion_criteria` is auto-promoted to a `severity: warn` AC. Existing missions continue to validate without edits.
- `uh verify` writes a per-AC entry into `verification.yaml#acceptance_criteria[]` (id / description / status / severity / exit_code / duration_ms / stdout_snippet / stderr_snippet) and emits an `acceptance.checked` row in `events.ndjson` for live observers (TUI / replay tools).
- `tdd` (Test-Driven Development, UH-55) opts the mission into a test-first verification gate.
  - `tdd.enforce_tests_first: true` — when set, `uh verify` reads `diff.patch` and adds a synthetic `acceptance_criteria` entry `ac-tdd-tests-precede-code` (severity `block`).
  - The synthetic AC **passes** when the diff touches at least one test path; **fails** when the diff touches source paths without any test changes; and **blocks** the run when `diff.patch` is missing.
  - `tdd.test_paths` / `tdd.source_paths` are glob arrays; defaults are conventional (`tests/**`, `src/**`, plus `*.{test,spec}.{ts,tsx,js,jsx}` patterns and `__tests__/**`).
  - Missions without a `tdd` block are unaffected — TDD is opt-in.
