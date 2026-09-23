---
title: Technical debt register
description: Prioritized technical debt on the v0.11 release line, with evidence, effort and whether each item blocks 1.0.
---

Audited **2026-09-23** on the v0.11 stack tip (`db90516`, version 0.11.0). File and line references are for that commit.

**Priority:** P0 means the release cannot ship; P1 means fix before 1.0; P2 can follow 1.0. **Effort:** S is under half a day, M is 1 to 3 days, L is a week or more.

## Verification gates on the stack tip

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | pass |
| `bun run typecheck` | pass (10 s) |
| `bun run build` | pass (8 s) |
| `bun run test` | **fail**: 2,180 passed, 4 failed, 12 skipped (147 files, 106 s). All 4 failures are TD-01. With the TD-01 fix: 2,184 passed, 12 skipped |
| `bun run plugin:typecheck` | pass |
| Plugin pytest | pass (90 tests, 37 s), with an asyncio loop-scope deprecation warning |
| `publish:dry-run` | pass (4.82 MB unpacked) |
| Smokes: `--version`, `status --json`, headless `uh tui` | pass |

## Register

| ID | P | Area | Finding | Effort | 1.0 blocker |
|---|---|---|---|---|---|
| [TD-01](#td-01-tool-guard-drops-posix-absolute-paths) | P0 | Guard, security | POSIX absolute paths are skipped as switches: `cp`/`mv` escape the sandbox; CI red | M | **yes** |
| [TD-02](#td-02-no-live-acceptance-evidence) | P0 | Readiness | 0 of 36 capabilities have live acceptance evidence | L | **yes** |
| [TD-03](#td-03-contracts-are-all-v0-and-14-have-no-schema) | P0 | Contracts | All 45 contract ids are `.v0`; 14 have no Zod schema | M | **yes** |
| [TD-26](#td-26-release-process-let-a-release-strand) | P0 | Process | v0.10.0 stranded on `dev`; no reviews on 11 open PRs; placeholder authors | S | **yes** |
| [TD-04](#td-04-srcclits-is-not-a-thin-dispatcher) | P1 | Architecture | `src/cli.ts` is 3,709 lines with 2,403 lines of handler logic | L | no (unless the AGENTS rule is a gate) |
| [TD-05](#td-05-td-06-td-07-documentation-site) | P1 | Docs | `apps/docs` is a hand-copied mirror: 47 docs missing, 13 badly drifted | M | **yes**, addressed by `apps/site` |
| [TD-06](#td-05-td-06-td-07-documentation-site) | P1 | Docs | 117 links end in `.md`; 14 point nowhere | S | **yes**, addressed by `apps/site` |
| [TD-07](#td-05-td-06-td-07-documentation-site) | P1 | Domain | `uh.agenticeng.app` appears nowhere; homepage and plugin assets use `.lat` | S | **yes**, partly addressed |
| [TD-08](#td-08-changelog-and-roadmap) | P1 | Release notes | v0.10.0 skipped; "planned v0.10.0" still promised; changelog names a missing file | S | **yes** |
| [TD-09](#td-09-unpinned-dependencies) | P1 | Dependencies | `latest` for `commander`, `yaml`, `zod` in a published package; `@types/node` 25 vs `engines` 20 | S | **yes** |
| [TD-10](#td-10-td-11-ci-coverage) | P1 | CI | No `setup-node`: the Node 20 promise is never tested | S | **yes** |
| [TD-11](#td-10-td-11-ci-coverage) | P1 | CI, Windows | 33 `win32` branches and the job guardian are untested; 12 Windows tests always skip | M | **yes, if Windows is supported** |
| [TD-12](#td-12-no-lint-or-format) | P1 | Tooling | No linter, formatter, `noUnusedLocals`, CODEOWNERS or Dependabot | S–M | no |
| [TD-13](#td-13-td-14-publishing) | P1 | Release | npm publish runs twice, skips the full suite, uses a long-lived token without provenance | S–M | **yes** |
| [TD-14](#td-13-td-14-publishing) | P1 | Release | Plugin release fires on every release; plugin still 0.9.0 | S | **yes** |
| [TD-15](#td-15-old-docs-app-dependencies) | P1 | Docs deploy | Beta `nitro`, unused deps, `bun-version: latest`, `failOnError: false`, not built in PR CI | S | no (retire `apps/docs`) |
| [TD-16](#td-16-envexample-is-incomplete) | P1 | Config | `.env.example` misses `ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY`, `HONCHO_*`, `UH_OPENSANDBOX_*`, ... | S | **yes** |
| [TD-17](#td-17-dead-code) | P2 | Dead code | 60 unused exports, 27 used only by tests | S–M | no |
| [TD-18](#td-18-duplicated-helpers) | P2 | Duplication | `fileExists` ×7, `loadAdapterConfig` ×7, telemetry host refusal ×2 | M | no |
| [TD-19](#td-19-large-files) | P2 | Structure | 16 files over 800 lines | L | no |
| [TD-20](#td-20-package-surface) | P2 | Packaging | `src/` must ship; no `exports`/`types`; handbook not in `files` | S | **yes** (defines the 1.0 surface) |
| [TD-21](#td-21-telemetry-policy-drift) | P2 | Telemetry | Also enabled by `1`/`true`; allows `http:` | S | no |
| [TD-22](#td-22-agent-configuration-drift) | P2 | Agent config | `AGENTS.md` cites a missing matrix file; stale adapter list; broad Command Code allow rules | S | no |
| [TD-23](#td-23-slow-and-timing-sensitive-tests) | P2 | Tests | 85 tests over 1 s; wall-clock assertions; one flaky worktree race | M | no |
| [TD-24](#td-24-schemas-outside-srcschema) | P2 | Contracts | Zod objects defined outside `src/schema/` in 12 modules | S–M | no (part of TD-03) |
| [TD-25](#td-25-single-ci-vendor) | P2 | CI | Every job depends on Blacksmith runners | S | no |

## Critical path

1. **TD-01**: land the guard fix, get CI green. Already written and verified; see the [release plan](/release/plan/#phase-0-unblock-the-stack).
2. **TD-26, TD-08**: decide the version line, port v0.10.0, fix the changelog, get reviews.
3. **TD-09, TD-16, TD-07, TD-14**: release-input fixes, each under half a day.
4. **TD-03, TD-24, TD-20**: choose the public contracts and package surface, freeze them as `v1`.
5. **TD-10, TD-11, TD-13**: Node and Windows matrices, safer publishing.
6. **TD-05, TD-06**: switch to `apps/site` and retire `apps/docs`.
7. **TD-02**: run the acceptance campaign on the release candidate and triage known issues.

TD-04, TD-12, TD-17, TD-18, TD-19 and TD-23 are refactoring work for after 1.0. Doing TD-04 first makes TD-23 cheaper, because command logic becomes testable in-process.

## Details

### TD-01: tool guard drops POSIX absolute paths

`src/harness/tool-guard.ts`, `collectShellTargets`: the copy-verb filter (`ts.slice(1).filter(token => !token.startsWith("-") && !token.startsWith("/"))`) and the delete-verb loop (`if (token.startsWith("-") || token.startsWith("/")) continue;`) skip every `/`-prefixed token. The intent was to skip `cmd.exe` switches such as `/s /q`.

- `cp x /etc/y` and `mv x ~/.bashrc` (after shell expansion) are allowed: a worker can write outside its roots and overwrite shell startup files. This is a containment escape on Linux and macOS.
- `rm -rf /abs/in/root` is denied through the `unresolved` fallback at line 708, before the hive and tamper checks, so it is classed `delete_outside` and the denial does not name the target. This is the 4-test CI failure on PRs #247 to #249. `docs/known-issues.md` says the cause is unknown and that the delete "is refused", which understates it.

**Fix:** only treat `/x` tokens as switches for `cmd.exe` verbs (`rd`, `del`, `erase`, `copy`, `move`, `xcopy`, `robocopy`, `rmdir`). The patch and regression tests are in the release plan. Follow-ups: check the hive and tamper classes before the `unresolved` fallback, add `~` and `tee` regressions for all three hooks, and update `known-issues.md`.

### TD-02: no live acceptance evidence

`docs/acceptance/README.md` shows 33 capabilities unproven and 3 fixture-only. Known issues that have only been reported, never checked live: the queue, the hive, notifications to real sinks, Codex route attestation, MCP in a real client, a turn cap settling as `passed`, and steer leaving orchestrator workers orphaned. **Fix:** an authorized acceptance campaign at the release-candidate commit on both fleets. Every known issue is fixed, documented as a limit, or labeled experimental.

### TD-03: contracts are all v0 and 14 have no schema

No Zod schema in `src/schema/` for: `uh.kill.v0`, `uh.live-run.v0`, `uh.notify.{detect,list,test}.v0`, `uh.ps.v0`, `uh.validate-drift.v0`, `uh.report.v0`, `uh.resume-link.v0`, `uh.spec.v0`, `uh.status.v0`, `uh.steer-record.v0`, `uh.tui-state.v0`, `uh.wait.v0`. That breaks the `AGENTS.md` rule to start persisted shapes in Zod, and SemVer cannot be enforced over shapes without schemas. **Fix:** schema every emitted or persisted shape; freeze a public 1.0 set (mission, project, adapter, workflow, runtime-result, runtime-session, status, verification-result, promotion, tool-guard, session-template, run-digest) as `.v1` with v0 read compatibility; mark the rest internal.

### TD-26: release process let a release strand

Added from the [branch audit](/release/branches/). v0.10.0 merged into `dev` in June and never reached `main`, a tag or npm, and nothing noticed. On the v0.11 line: none of the 11 open PRs has a human review, the Codex review bot hit its usage limit on all of them, 36 commits are authored by `uh-team@example.com`, and a `wip:` commit is in the release branch. **Fix:** drop the long-lived `dev` branch; tag every merged release immediately; require one human approval per release layer (a branch protection rule on `main` and `release/*`); fix authorship before merge.

### TD-04: `src/cli.ts` is not a thin dispatcher

82 commands, 69 action handlers totalling 2,403 lines, 26 helpers, 67 imports. Largest handlers: `mission run` at line 2325 (367 lines), `dry-run` at 2171 (134), `validate` at 340 (118), `run-team` at 2839 (107). Rendering helpers (`renderAlignedTable`, `moneyOrUnknown`, `verdictSentence`), experiment settlement, semantic routing glue and preflight live here too. **Fix:** move each command group into `src/commands/*.ts` calling `src/harness/*`, rendering into `src/harness/render/`; target under 500 lines.

### TD-05, TD-06, TD-07: documentation site

The old site mirrors `docs/` by hand. Only `roadmap.mdx` is synced by script. 47 docs have no page, including the whole handbook, `known-issues`, `tool-guard`, `VISION` and 16 runbooks; similarity to source is as low as 0.04 (`runtime-targets`). 117 links keep a `.md` suffix and open the raw-markdown route; 14 point at missing targets; `docs/runbooks/hermes-dashboard-plugin.md` links to a `docs/ci/` folder that does not exist.

**Addressed by `apps/site`:** the new site generates its mirror from `docs/`, `specs/` and `CHANGELOG.md` on every build and rewrites links (see [This site](/contributing/site/)), and binds `uh.agenticeng.app`. **Still open:** `package.json` `homepage`, `apps/hermes-plugin/theme/ultimate-harness.yaml` asset URLs and `apps/docs/alchemy.run.ts` still use `uh.agenticengineering.lat`. Change them once the new site is live, redirect the old domain, and delete `apps/docs` and `deploy-docs.yml`.

### TD-08: changelog and roadmap

No `v0.10.0` tag or changelog section; `docs/ROADMAP.md` lines 316 to 325 and `CHANGELOG.md` line 219 still promise "planned v0.10.0" features; the changelog claims `.harness/templates/acp-worker.yaml`, which does not exist. The release branch has `[0.11.0] — 2026-09-21` while the stack tip has `[Unreleased]`.

### TD-09: unpinned dependencies

`package.json` uses `latest` for `commander`, `yaml`, `zod` (runtime) and `@types/node`, `tsx`, `typescript`, `vitest` (dev); today they resolve to commander 14, yaml 2.9, zod 4.4, TypeScript 6.0, vitest 4.1, tsx 4.22 and @types/node 25. The lockfile is not published, so installers get whatever is newest. `@types/node` 25 hides Node 22+ API use from a package that promises Node 20. **Fix:** caret ranges on current majors, `@types/node@^20`, Dependabot or Renovate.

### TD-10, TD-11: CI coverage

`ci.yml` has no `setup-node`; tests run under whatever Node the runner has. There are 33 `win32` branches across 17 files, a 265-line `windows-job.cs` guardian and `windows-job.ps1`; all 12 skipped tests are Windows-only and CI is Linux-only, while `known-issues.md` relies on "passes on Windows". **Fix:** a Node 20/22/24 matrix for build, test and a CLI smoke; a `windows-latest` job at least on `main` and release branches.

### TD-12: no lint or format

No ESLint, Biome, Prettier, oxlint or `.editorconfig`; `tsconfig.json` sets only `strict`. **Fix:** Biome lint and format in CI, `noUnusedLocals`, CODEOWNERS, Dependabot.

### TD-13, TD-14: publishing

`publish.yml` triggers on both `v*` tags and `release: published` (it only avoids double-publishing through an `npm view` check), runs only `tests/package-publish.test.ts` before publishing, uses a long-lived token written to `~/.npmrc` with no `--provenance`, and dry-runs with `bun publish` but publishes with `npm publish`. `release-plugin.yml` fires on every GitHub release, so a CLI release overwrites the plugin asset; a `plugin-v*` tag only uploads a workflow artifact; the plugin reports 0.9.0; the bundle-size test skips rebuilding when a stale bundle exists. **Fix:** one trigger, require CI success, npm trusted publishing with provenance; filter plugin releases on `plugin-v*`; always rebuild before the size check.

### TD-15: old docs app dependencies

`apps/docs` pins `nitro@3.0.260429-beta` (nothing imports it), carries unused `lucide-react`, `tslib`, `tsx` and `@cloudflare/vite-plugin`, deploys with `bun-version: latest`, prerenders with `failOnError: false`, and is never built in PR CI. Superseded by retiring `apps/docs`.

### TD-16: `.env.example` is incomplete

Missing: `ANTHROPIC_API_KEY` (named in `AGENTS.md`), `TYPESAFE_API_KEY` (`src/harness/typesafe.ts:194`), `HONCHO_API_KEY` and ten more `HONCHO_*`, eight `UH_OPENSANDBOX_*`, `UH_NOTIFICATIONS_FILE`, `UH_TYPESAFE_MODEL`, `UH_USER_DATA_DIR`, `UH_TUI_*`. **Fix:** grouped placeholders plus a test that compares `process.env` usage with `.env.example`.

### TD-17: dead code

Unused: `getSessionStrategyLabel`, `getHonchoConfigPath`, `stagedArtifactPath`, `lastAssistantText`, `hasMainCheckout`, `listPresets`, `teamHarnessTeamRoot`, `specsActiveDir`, `specsArchiveDir`, `get{Codex,Pi,OhMyPi}RuntimeConfig`, `_clearRuntimeConfigRegistry`, `getRuntimeConfigSchema`, and more. Used only by tests: `pushOtlpTraces`, `runStagedWorkflow`, `appendClaim`. **Fix:** run knip; delete, or decide whether OTLP push and staged workflows ship and wire them.

### TD-18: duplicated helpers

`fileExists` ×7, `pathExists` ×5, `loadAdapterConfig` ×7, `persistFinalRuntimeSession` ×7, `sha256Hex` ×4, `classifyStatus` ×4, `isPathWithin` ×3, `assertSafeMissionId` ×3, `rejectSymlinkIfExists` ×3. The telemetry host/IP refusal is copied between `telemetry.ts` and `telemetry-beacon.ts`. Security fixes must be applied N times. **Fix:** `fs-util`, `adapter-common` and a shared `net-guard` module.

### TD-19: large files

`team-run.ts` 2,407; `plugin_api.py` 1,907 (25 routes); `acceptance.ts` 1,685; `oh-my-pi.ts` 1,439; `openrouter.ts`, `hermes-proxy.ts`, `run-digest.ts`, `tui/dashboard.tsx` about 1,000 each; `notifications.ts` 991 (57 exports); `anthropic.ts` 991; `pi.ts`, `tui/state.ts`, `hermes.ts`, `live-runs.ts`, `kill.ts`, `codex.ts` 820 to 920. **Fix:** split `team-run`, `acceptance` and `plugin_api` by concern; extract a shared adapter base (the three HTTP adapters are near-copies).

### TD-20: package surface

`src/harness/runtime-process.ts` loads `../../src/harness/windows-job.{cs,ps1}` from `dist`, so all of `src/` ships; there is no `exports`, `main` or `types`, and no `.d.ts` output, though `src/index.ts` exports a library API; `docs/handbook/` is not in `files`. **Fix:** copy the guardian assets into `dist`, drop `src/` from `files` if the TUI can run from built output (or keep it deliberately), declare `exports`/`types` or state the package is CLI-only, add the handbook.

### TD-21: telemetry policy drift

Mostly compliant: command path only, fixed `distinct_id`, private-IP refusal, detached beacon. Deviations: `UH_TELEMETRY=1`, `true` and `UH_TELEMETRY_ENABLED` also enable it; `http:` hosts are allowed; OS release and Node version are sent (`src/harness/telemetry.ts:29-41, 59-75, 119`). **Fix:** accept only `posthog`, require `https`, confirm the payload fields count as "platform metadata".

### TD-22: agent configuration drift

`AGENTS.md` cites `scripts/harness-matrix.json` (missing) and `../docs/standards/README.md` (outside the repo); its adapter list omits `acp`, `claude-code` and `command-code`; `.harness/adapters/` has no `acp` manifest; `.commandcode/settings.json` allows `Shell(bun:*)` (which permits `bun publish` and `bun add`) and `Shell(pnpm run *)` in a Bun repo; `.omp/config.yml` enables about 25 skills not in the repo; `.hermes/plans/` holds one stale plan. Separately, PR #246 changes the GitNexus policy (see the [release plan](/release/plan/), decision D2).

### TD-23: slow and timing-sensitive tests

85 tests exceed 1 s; the suite is 106 s wall and 256 s CPU, mostly from spawning `tsx src/cli.ts` per test (slowest files: `cli-observatory` 24 s, `sandbox` 22 s, `independent-review` 14 s, `cli-wait` 13 s). `status-json` asserts under 500 ms (503 ms observed). The sandbox concurrency test races in `git worktree add` (PR #240). Pytest's `asyncio_default_fixture_loop_scope` is unset. **Fix:** in-process command tests after TD-04; relative timing budgets; serialize worktree creation per repo; set the loop scope.

### TD-24: schemas outside `src/schema/`

`z.object(` appears in `mcp-server.ts`, `typesafe.ts`, `spec-loader.ts`, `runtime-resources.ts`, `post-checks.ts`, `acceptance.ts`, `cli.ts` and five adapters. Move persisted and wire shapes into `src/schema/`.

### TD-25: single CI vendor

Every job except the plugin release runs on `blacksmith-4vcpu-ubuntu-2404`, after a forced migration from Depot. Read the runner label from a repository variable that defaults to `ubuntu-24.04`.
