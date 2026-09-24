---
title: Branch and PR audit
description: State of every remote branch and open pull request, and what to do with each, as of 2026-09-23.
---

Snapshot taken **2026-09-23** against `origin/main` at `c5cec50` (v0.9.0). Branches were compared to both `main` and the tip of the v0.11.0 stack (`stack/v0.11.0-10-notify-toast`, `db90516`). Verdicts come from `git cherry` (patch equivalence) and from searching the target tree for the files and functions each branch introduces, not from commit messages alone.

## Summary

| | Count |
|---|---|
| Remote branches | 52 |
| Open pull requests | 11 (one draft release PR + a 10-layer stack) |
| Branches with work that must still reach `main` | the 10 stack layers + `release/v0.11.0`, and the v0.10.0 work on `fix/changelog-roadmap-link-consistency` |
| Branches safe to delete now | 35 |
| Branches to tag, then delete | 2 (`dev`, `release/v0.10.0`) |

## Open pull requests

All 11 are by Mateo-GarciaL, opened 2026-09-23. **None has a human review**; the Codex review bot hit its usage limit on every one, so no automated review ran either. The bot stays on; see [below](#codex-review-bot).

| PR | Branch → base | Commits | Diff | CI | Top risk |
|---|---|---|---|---|---|
| [#239](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/239) (draft) | `release/v0.11.0` → `main` | 90 | +43,492 / −1,381, 323 files | passing | 36 commits authored by a placeholder `uh-team@example.com`; a `wip:` commit (`f4de854`); v0.10.0 not included |
| [#240](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/240) | `01-supervision-evidence` → `release/v0.11.0` | 12 | +3,220 / −146 | **failing (flaky)** | `tests/sandbox.test.ts` "eight concurrent createSandbox calls" races inside `git worktree add`. The same code passes on later layers. Build moves to `scripts/build.mjs` |
| [#241](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/241) | `02-run-control-invariants` | 15 | +6,016 / −593 | passing | New steer and resume semantics; new run-digest schema |
| [#242](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/242) | `03-workers-teams-wait` | 13 | +3,287 / −275 | passing | Windows headless console (ConPTY, `windows-job.cs`) is not exercised by Linux CI; every adapter now receives prompts by stdin or file |
| [#243](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/243) | `04-ledger-templates-notify` | 12 | +5,898 / −243 | passing | One shared guard core for every runtime: security critical. Outbound notifications (811 lines) |
| [#244](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/244) | `05-review-acp-postchecks` | 12 | +2,983 / −74 | passing | Orchestrator missions run in the project root without `--no-sandbox` |
| [#245](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/245) | `06-queue-land-admission` | 6 | +3,475 / −71 | passing | `uh land` moves target branches; `uh queue` is only tested with fake launchers |
| [#246](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/246) | `07-docs-known-issues` | 6 | +972 / −147 | passing | Commit `ffc1f8d` removes the mandatory GitNexus rules and the `## Deviations` section from `AGENTS.md`/`CLAUDE.md`, a policy change inside a docs PR. A `land.ts` code fix also rides in this PR |
| [#247](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/247) | `08-hive` | 1 | +2,075 / −41 | **failing (real bug)** | 4 tests in `tests/hive-integrity.test.ts` fail on Linux: a shell `rm -rf "<hiveDir>"` is classified `delete_outside` instead of `guard_tamper` for command-code, oh-my-pi and claude-code, and the refusal message does not name the target. Likely `deleteTargets()` in `src/harness/tool-guard.ts` not resolving a quoted absolute POSIX path. Passes on Windows. The author has said it should not merge until fixed |
| [#248](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/248) | `09-ps-turns` | 1 | +811 / −3 | failing (inherited from #247) | `limits.max_turns` now stops Claude Code runs; the ACP turn count is a heuristic never checked against a live agent |
| [#249](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/249) | `10-notify-toast` | 3 | +435 / −38 | failing (inherited from #247) | PowerShell toast code was recovered from a stopped worker and never reviewed; `--root` has no CLI test |

Whole line, `main` to stack tip: 171 commits, 399 files, +71,126 / −1,474. Test files grow from 74 to 147, and the stack tip runs 2,176 tests. `src/cli.ts` grows from 1,803 to 3,709 lines.

## Codex review bot

The automated reviewer on these PRs is the **ChatGPT Codex Connector** GitHub App (`chatgpt-codex-connector[bot]`). It is configured in Codex, not in any file in the repository, and applies to every branch.

**Decision (2026-09-24): keep it on.** It gives useful reviews. On the v0.11 stack it only posted "Codex usage limits have been reached", so those PRs got no automated review. For it to review the stack before merge, a repository admin needs to enable credits for code review in [Codex settings](https://chatgpt.com/codex/cloud/settings/code-review), then request a review on each layer again (for example with an `@codex review` comment).

## The missing v0.10.0

`dev` and `release/v0.10.0` hold a v0.10.0 release (PR #232) that was **never merged to `main`, never tagged and never published**. `main` is at 0.9.0, and the v0.11.0 changelog goes straight from 0.9.0 to 0.11.0. Neither branch is an ancestor of the stack.

Already present on the v0.11 line in equivalent form: the plugin asyncio/SSE teardown fix, the auto-route `--force` waiver and help text, and the `specs/templates` path.

Missing from the v0.11 line:

1. **UH-138, capability checks warn by default, `--strict` to block.** The v0.11 line still only has the throwing `assertRuntimeCapabilities`. Missing: `CapabilitySeverity`, `enforceCapabilities`, the `[WARN]` formatters, `--strict` on `dry-run`/`run`/`run-all`, `tests/capabilities-severity.test.ts` and the configuration docs section. This changes default behavior, so it needs a product decision, not just a port.
2. **UH-139, adoption package.** `examples/missions/hello-uh/`, `scripts/check-doc-links.mjs`, the `docs:check-links` script and its CI step. Running that checker against the v0.11 tree finds **133 broken links out of 367**, 131 of them in the `apps/docs` mirror. Port it together with a regenerated mirror, or retire `apps/docs` first, or the new CI step goes red.
3. **Spec-stale false drift.** `src/harness/spec-stale.ts` still treats `docs/specs/` as the spec folder, but specs moved to `specs/`. Port `b894609f` and its test.
4. **Release bookkeeping.** `docs/ROADMAP.md` still lists work as "planned v0.10.0" (including telemetry, which already shipped), `CHANGELOG.md` says "Deferred to v0.10.0+", and the plugin `manifest.json` says 0.9.0 while `package.json` says 0.11.0.

The most complete copy of this work is `fix/changelog-roadmap-link-consistency`; port from there.

## Every other branch

### Delete now: fully merged

Zero patches that are not already in `main` or the stack:

`lalo/UH-134-linear-issue-triage-automation-17a6`, `lalo/UH-126-issue-triage-automation-9329`, `lalo/CUR-269-linear-issue-triage-automation-6b85`, `fix/uh-127-130-team-run-dogfood`, `feat/uh-136-anthropic-adapter`, `cx/delivery-observatory-hermes-plugin`, `chore/sync-docs-to-main`, `chore/release-v0.9.0`, `fix/uh-plugin-ci-asyncio-teardown`, `fix/p4-known-issues`, `feat/uh-90-retention`, `feat/uh-156-oh-my-pi-graduate-v0.8.0`, `feat/tui-polish-uh-48-50-51`, `feat/epic-5-later-compare-replay`, `lalo/uh-237-ci-platform-fixes` (an ancestor of `release/v0.11.0`).

`Mateo-GarciaL/uh-1.0-clean` points at the same commit as `release/v0.11.0` (`ea9a36f`); keep one.

### Delete: superseded

These still show unique patches because their work was later squash-merged or rewritten, but the target tree contains the result.

| Branch | Last commit | Evidence it is superseded |
|---|---|---|
| `mateo/uh-native-run-facts` | 2026-09-05 | Its changelog bullet, `uh.team-run.v0` in `src/schema/team.ts`, `RuntimeUsageSchema` cache and cost fields, the canonical team artifact and OMP interruption docs, and SIGINT handling are all on the v0.11 line. Its merge conflicts come from v0.11 rewriting the same files. |
| `cx/core-agentic-delivery-architecture` | 2026-08-28 | `docs/architecture/telar-integration.md` is identical on the target; its README lines are present. |
| `lalo/UH-135-linear-issue-triage-automation-2c5f` | 2026-05-29 | The target has `telemetry-beacon.ts` and a detached, unreferenced spawn, and is stricter (fixed `distinct_id`, guarded endpoint). Do not port its per-install id. |
| `lalo/UH-127-*`, `lalo/UH-128-*`, `lalo/UH-129-*` | 2026-05-25 | Shipped in `2e4f952` (#216): `passed_partial`, `writeWorkerArtifactGitignore`, the anchored report path. |
| `lalo/UH-130-issue-triage-automation-b630` | 2026-05-25 | The target warns at verify time (`warnConstraintsAreAdvisory`). One leftover: `docs/architecture/mission-packet-schema.md` still calls constraints "hard limits". |
| `feat/uh-138-capability-strict-impl`, `fix/uh-138-force-help-and-test-assertion` | 2026-06-05, 2026-07-30 | Contained in `fix/changelog-roadmap-link-consistency`; delete after the v0.10.0 port. |
| `feature/hermes-plugin-core`, `feature/uh-45`, `chore/codex-e2e-smoke`, `feature/discipline-layer-core`, `feature/team-mission-runtime`, `fix/docs-landing-hero`, `fix/uh-72-codex-p1-p2`, `chore/dogfood-implement-uh-slice-template`, `release/v0.8.0-prep`, `feat/uh-81-runtime-config-overrides-cli`, `chore/uh-linear-canonicalization` | 2026-05-17 to 05-25 | Pre-squash history of work that later merged: the plugin, hermes-proxy, staged and adversarial-QA profiles, `VISION.md`, docs deploy, runtime config overrides, the 0.8.0 changelog and the Linear URLs are all on the target. |

### Tag, then delete

`dev` and `release/v0.10.0` should be tagged (for example `archive/v0.10.0`) so the unpublished release stays reachable, then deleted once the port lands. After 1.0 there is no reason to keep a long-lived `dev` branch: the stack workflow targets `main` through a release branch.

## Suggested cleanup commands

Run by a maintainer after the port and the stack merge. Deleting a remote branch cannot be undone from the UI, so tag first.

```sh
git tag archive/v0.10.0 origin/release/v0.10.0
git push origin archive/v0.10.0

git push origin --delete \
  lalo/UH-134-linear-issue-triage-automation-17a6 lalo/UH-126-issue-triage-automation-9329 \
  lalo/CUR-269-linear-issue-triage-automation-6b85 fix/uh-127-130-team-run-dogfood \
  feat/uh-136-anthropic-adapter cx/delivery-observatory-hermes-plugin chore/sync-docs-to-main \
  chore/release-v0.9.0 fix/uh-plugin-ci-asyncio-teardown fix/p4-known-issues feat/uh-90-retention \
  feat/uh-156-oh-my-pi-graduate-v0.8.0 feat/tui-polish-uh-48-50-51 feat/epic-5-later-compare-replay \
  lalo/uh-237-ci-platform-fixes Mateo-GarciaL/uh-1.0-clean
```
