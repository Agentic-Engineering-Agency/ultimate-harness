# Ultimate Harness “Do As Much As Possible Right Now” Sprint Plan

> **Mode:** Plan only. No implementation has been performed by this plan.

## Goal

Convert the new Ultimate Harness documentation spine into a practical, execution-ready MVP path and maximize useful progress in the current session without prematurely overbuilding the product.

The near-term target is a first vertical slice:

```text
uh init
  -> creates .harness project state
  -> installs default workflow/profile artifacts
  -> validates basic harness YAML artifacts
  -> uh status reports project health
  -> example mission packet proves docs map to executable work
```

## Current context

- Repository: `/Users/eduardojaviergarcialopez/AgenticEngineering/ultimate-harness`
- Current branch: `main`
- Latest commit: `7b69603 docs: add Ultimate Harness documentation spine`
- Working tree appeared clean before this plan was written.
- The docs spine now defines:
  - product direction
  - core entities
  - `.harness/` artifact layout
  - runtime adapter contract
  - mission packet schema
  - sandboxing model
  - verification and promotion lifecycle
  - workflow profiles
  - BMAD-style role mapping

## Strategy

Do not jump straight into a Hermes adapter or all runtime adapters. First create the smallest useful local harness implementation that makes the documentation real.

Recommended order:

1. Baseline and publish the docs work.
2. Scaffold a boring CLI/package.
3. Implement `.harness` initialization.
4. Add schema validation.
5. Add an example mission packet.
6. Add `uh status`.
7. Only then begin Hermes adapter design/MVP.

This keeps the project runtime-agnostic while giving it a concrete executable core.

---

## Phase 0 — Baseline docs work

### Objective

Make the documentation spine visible and reviewable before implementation starts.

### Tasks

1. Confirm working tree is clean.

   ```bash
   git status --short
   ```

   Expected: no output.

2. Push current branch.

   ```bash
   git push origin main
   ```

   If direct push to `main` is not desired, create a docs branch instead:

   ```bash
   git switch -c docs/documentation-spine
   git push -u origin docs/documentation-spine
   ```

3. Open a PR if using branch workflow.

   Suggested title:

   ```text
   docs: add Ultimate Harness documentation spine
   ```

   Suggested body:

   ```markdown
   ## Summary

   Adds the initial documentation spine for Ultimate Harness:
   - research comparison and adopt/reject/defer log
   - product requirements and MVP scope
   - architecture, entity, adapter, mission packet, sandboxing, verification docs
   - workflow profiles and BMAD-style role map
   - root README navigation

   ## Issues advanced

   Advances:
   - #1 / UH-21 runtime-agnostic harness direction
   - #2 / UH-20 runtime adapter contract
   - #3 / UH-19 mission packet schema
   - #4 / UH-18 .harness artifact structure
   - #15 / UH-7 verification and promotion lifecycle
   - #17 / UH-5 initial workflow profiles
   - #21 / UH-1 comparative analysis of inspiration systems

   ## Validation

   - Required docs tree exists
   - Local markdown links checked
   - `git diff --check` passed before commit
   ```

### Exit criteria

- Docs baseline is pushed or PR’d.
- Implementation starts from a visible reviewed baseline.

---

## Phase 1 — Choose and scaffold the CLI/package

### Objective

Create the smallest technical foundation for a local `uh` CLI.

### Recommended stack

Use **TypeScript + Node/Bun CLI**.

Rationale:

- Most adjacent tools are TypeScript/JavaScript-heavy.
- YAML + schema validation + CLI UX are straightforward.
- Future runtime adapters can become separate modules/packages.
- Avoids prematurely selecting Pi/oh-my-pi as the core engine.

### Files likely to change

Create:

```text
package.json
tsconfig.json
src/cli.ts
src/index.ts
src/harness/init.ts
src/harness/status.ts
src/harness/paths.ts
src/schema/project.ts
src/schema/adapter.ts
src/schema/workflow.ts
src/schema/mission.ts
tests/
```

Possibly create:

```text
vitest.config.ts
.prettierrc
.gitignore
```

### Package choices

Recommended dependencies:

```text
commander        CLI parser
zod              runtime schema validation
yaml             YAML parse/stringify
kleur or chalk   CLI colors, optional
```

Recommended dev dependencies:

```text
typescript
tsx
vitest
@types/node
```

### Example `package.json` shape

```json
{
  "name": "ultimate-harness",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "uh": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "commander": "latest",
    "yaml": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

### Verification

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run dev -- --help
```

Expected:

- TypeScript compiles.
- Test suite runs, even if initially small.
- CLI help prints available commands.

### Suggested commit

```bash
git add package.json tsconfig.json src tests
 git commit -m "feat: scaffold uh CLI package"
```

---

## Phase 2 — Implement `uh init`

### Objective

Turn `docs/architecture/harness-artifacts.md` into an actual `.harness/` directory bootstrap.

### Command behavior

```bash
uh init
```

Creates:

```text
.harness/
  project.yaml
  adapters/
  workflows/
    research-docs.yaml
    spec-first-feature.yaml
    bugfix-contained.yaml
    adapter-design.yaml
    skill-authoring.yaml
  skills/
    index.yaml
  specs/
    active/
    archive/
  missions/
  sandboxes/
    index.yaml
  audit/
    events.ndjson
```

### Project YAML draft

```yaml
schema_version: uh.project.v0
id: ultimate-harness
name: Ultimate Harness
root_path: .
created_at: "<ISO timestamp>"
issue_sources:
  - provider: github
    url: https://github.com/Agentic-Engineering-Agency/ultimate-harness
  - provider: linear
    url: https://linear.app/agenticengineering-agency/project/ultimate-harness-6928debf7da2
default_workflow_profiles:
  - research-docs
  - spec-first-feature
  - bugfix-contained
  - adapter-design
  - skill-authoring
artifact_schema_version: uh.project.v0
```

### Implementation notes

- `uh init` should be idempotent by default.
- If `.harness/project.yaml` already exists, print a friendly message and do not overwrite unless `--force` is passed.
- Use relative paths where possible.
- Never store secrets.

### Tests

Create tests similar to:

```text
tests/init.test.ts
```

Test cases:

1. Creates `.harness/project.yaml`.
2. Creates required directories.
3. Creates five default workflow YAML files.
4. Creates empty `.harness/audit/events.ndjson`.
5. Does not overwrite existing project file without `--force`.
6. Allows overwrite with `--force`.

### Verification

```bash
bun run test -- tests/init.test.ts
bun run typecheck
bun run dev -- init --root /tmp/uh-test-project
find /tmp/uh-test-project/.harness -type f | sort
```

Expected:

- Tests pass.
- `.harness` tree matches docs.

### Suggested commit

```bash
git add src/harness/init.ts src/harness/paths.ts src/schema/project.ts tests/init.test.ts
 git commit -m "feat: implement uh init"
```

---

## Phase 3 — Add schema validation

### Objective

Introduce enough validation to make Ultimate Harness artifact discipline real.

### Files likely to change

```text
src/schema/project.ts
src/schema/adapter.ts
src/schema/workflow.ts
src/schema/mission.ts
src/harness/validate.ts
src/cli.ts
tests/validate.test.ts
```

### Commands

Add:

```bash
uh validate
uh validate .harness/project.yaml
uh validate examples/missions/documentation-spine.yaml
```

### Validation targets

Minimum MVP schemas:

1. `uh.project.v0`
2. `uh.adapter.v0`
3. `uh.workflow.v0`
4. `uh.mission.v0`

### Design notes

- Use Zod internally.
- YAML files should declare `schema_version`.
- Validation dispatches based on `schema_version`.
- Unknown schema version should fail clearly.

### Tests

Create:

```text
tests/validate.test.ts
```

Test cases:

1. Valid project YAML passes.
2. Missing required project fields fails.
3. Valid mission YAML passes.
4. Unknown schema version fails.
5. Invalid YAML returns useful error.

### Verification

```bash
bun run test -- tests/validate.test.ts
bun run typecheck
bun run dev -- validate .harness/project.yaml
```

Expected:

- Valid artifacts pass.
- Broken fixtures fail with clear messages.

### Suggested commit

```bash
git add src/schema src/harness/validate.ts src/cli.ts tests/validate.test.ts
 git commit -m "feat: add harness artifact validation"
```

---

## Phase 4 — Add a real example mission packet

### Objective

Prove the mission packet schema can represent the documentation sprint that just happened.

### Files likely to change

Create:

```text
examples/missions/documentation-spine.yaml
```

Possibly add:

```text
tests/fixtures/valid-mission.yaml
```

### Mission content

Base the example on `docs/architecture/mission-packet-schema.md`, including:

- GitHub #21 / UH-1
- workflow profile `research-docs`
- read-first files:
  - `README.md`
  - `docs/handoffs/2026-05-13-documentation-bmad-handoff.md`
- expected docs outputs
- sandbox backend `git-worktree`
- verification checks

### Verification

```bash
bun run dev -- validate examples/missions/documentation-spine.yaml
bun run test
```

Expected:

- Example validates.
- Mission packet can be used as canonical fixture for future adapter work.

### Suggested commit

```bash
git add examples/missions/documentation-spine.yaml tests
 git commit -m "docs: add example documentation mission packet"
```

---

## Phase 5 — Implement `uh status`

### Objective

Give the harness an immediate read-only UX that reports project state.

### Command behavior

```bash
uh status
```

Expected output shape:

```text
Ultimate Harness project: Ultimate Harness
Schema version: uh.project.v0
Adapters configured: 0
Workflow profiles: 5
Active missions: 0
Recent audit events: 0
```

### Files likely to change

```text
src/harness/status.ts
src/cli.ts
tests/status.test.ts
```

### Status should inspect

- `.harness/project.yaml`
- `.harness/adapters/*.yaml`
- `.harness/workflows/*.yaml`
- `.harness/missions/*/mission.yaml`
- `.harness/audit/events.ndjson`

### Tests

Create:

```text
tests/status.test.ts
```

Test cases:

1. Fails clearly outside a harness project.
2. Reports initialized project correctly.
3. Counts workflow profiles.
4. Counts adapters.
5. Counts active missions.
6. Counts recent audit events.

### Verification

```bash
bun run test -- tests/status.test.ts
bun run typecheck
bun run dev -- init --root /tmp/uh-status-test
bun run dev -- status --root /tmp/uh-status-test
```

Expected:

- Status output is stable and parseable enough for future snapshot tests.

### Suggested commit

```bash
git add src/harness/status.ts src/cli.ts tests/status.test.ts
 git commit -m "feat: implement uh status"
```

---

## Phase 6 — Add lightweight docs for the CLI MVP

### Objective

Keep implementation and docs synchronized.

### Files likely to change

```text
docs/architecture/harness-artifacts.md
docs/architecture/mission-packet-schema.md
docs/verification/checks.md
README.md
```

Possibly create:

```text
docs/cli.md
```

### Content to add

- How to install dependencies.
- How to run `uh init` locally.
- How to run `uh validate`.
- How to run `uh status`.
- Current MVP limitations.

### Verification

```bash
bun run test
bun run typecheck
git diff --check
```

### Suggested commit

```bash
git add README.md docs
 git commit -m "docs: document uh CLI MVP"
```

---

## Phase 7 — Start Hermes adapter design only after CLI vertical slice

### Objective

Begin adapter work only after mission/state/validation exist.

### Files likely to change later

```text
src/adapters/hermes/manifest.ts
src/adapters/hermes/prepare.ts
src/adapters/hermes/result.ts
.harness/adapters/hermes.yaml
tests/adapters/hermes.test.ts
```

### First Hermes adapter milestone

Do **not** run real missions immediately. First implement:

```bash
uh adapter check hermes
```

Then add a dry-run path:

```bash
uh mission dry-run examples/missions/documentation-spine.yaml --runtime hermes
```

Only after that consider:

```bash
uh mission run examples/missions/documentation-spine.yaml --runtime hermes
```

### Why defer this

A real adapter needs stable project state, mission validation, sandbox records, and result shape. Otherwise the adapter will invent product semantics and undermine the docs-first work.

---

## Fastest useful “right now” execution path

If the goal is maximum progress in one focused sprint, execute only these parts now:

1. Push/open PR for docs baseline.
2. Scaffold CLI package.
3. Implement `uh init`.
4. Add project schema validation.
5. Implement `uh status`.
6. Add example mission fixture if time remains.

Stop before Hermes adapter implementation.

---

## Issue mapping

| Work | GitHub / Linear issue |
|---|---|
| Runtime-agnostic direction already documented | #1 / UH-21 |
| Runtime adapter contract baseline | #2 / UH-20 |
| Mission packet schema baseline + example | #3 / UH-19 |
| `.harness` artifact implementation | #4 / UH-18 |
| CLI skeleton | #5 / UH-17 |
| `uh init` | #6 / UH-16 |
| `uh status` | #8 / UH-14 |
| Workflow profile YAML defaults | #17 / UH-5 |
| Runtime registry scaffold later | #18 / UH-4 |
| Hermes adapter later | #20 / UH-2 |

---

## Tests and validation summary

Run frequently:

```bash
bun run test
bun run typecheck
bun run build
git diff --check
```

Manual smoke tests:

```bash
rm -rf /tmp/uh-smoke
mkdir -p /tmp/uh-smoke
bun run dev -- init --root /tmp/uh-smoke
bun run dev -- status --root /tmp/uh-smoke
bun run dev -- validate /tmp/uh-smoke/.harness/project.yaml
```

Expected smoke output:

```text
Ultimate Harness project: Ultimate Harness
Schema version: uh.project.v0
Adapters configured: 0
Workflow profiles: 5
Active missions: 0
Recent audit events: 0
```

---

## Risks and tradeoffs

### Risk: Overbuilding the CLI too early

Mitigation: keep commands limited to `init`, `validate`, and `status` for the first slice.

### Risk: Runtime adapter semantics leak into core

Mitigation: no Hermes/Codex/Claude/Pi-specific behavior in core mission schema.

### Risk: Schema freezes too early

Mitigation: version schemas as `v0`, keep examples human-readable, and allow docs to evolve.

### Risk: Sandbox implementation becomes complex

Mitigation: implement only directory/artifact bookkeeping now; defer actual AgentFS/worktree execution mechanics until mission state exists.

### Risk: Direct commits to `main` reduce review quality

Mitigation: use PRs for docs baseline and MVP slice if possible.

---

## Open questions

1. Should the CLI package name be `ultimate-harness`, `@agentic-engineering/ultimate-harness`, or `@agentic-engineering/uh`?
2. Should the CLI be executed with Bun-first tooling, or Node/npm-first with Bun compatibility?
3. Should `.harness/` be committed to the repository once initialized, or should generated mission/session records be partially ignored?
4. Should workflow profiles be stored as YAML only, or generated from TypeScript defaults?
5. Should Linear/GitHub issue state be updated manually for the MVP, or should issue sync remain deferred?
6. Should the first adapter be Hermes because this project is dogfooding Hermes, or should adapter work wait for a generic runtime registry scaffold?

## Recommended answer to open questions for now

1. Use private package name `ultimate-harness` until publishing strategy is clear.
2. Use Bun for local speed, but keep Node-compatible TypeScript.
3. Commit stable `.harness` config/examples; ignore volatile runtime logs if/when they appear.
4. Store workflow profiles as YAML artifacts generated by `uh init`, backed by TypeScript templates.
5. Defer full sync automation; manually reference issues in PRs/commits.
6. Hermes is the first adapter candidate, but only after the CLI vertical slice is complete.

---

## Definition of done for the next implementation sprint

The sprint is complete when:

- `uh --help` works.
- `uh init` creates the documented `.harness/` tree.
- `uh validate` validates project and mission YAML.
- `uh status` reports initialized project state.
- `examples/missions/documentation-spine.yaml` validates.
- Tests pass.
- TypeScript typecheck passes.
- README/docs explain the MVP commands.
- Work is committed in logical commits.
