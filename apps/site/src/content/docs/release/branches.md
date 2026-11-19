---
title: Branch and PR audit
description: State of every remote branch and the open pull requests around the 0.11.0-rc.1 release, as of 2026-11-19.
---

Snapshot taken **2026-11-19**. `origin/main` is `c5cec50` (v0.9.0 plus CI fixes); `origin/release/v0.11.0` is `6d1e297`, 312 commits ahead of `main` and 0 behind. Each branch was compared to `release/v0.11.0` with `git rev-list` (commits not on the release branch) and `git cherry` (patches not on it in equivalent form), not from commit messages.

## Summary

| | Count |
|---|---|
| Remote branches | 68 |
| Branches in the release itself | 3: `main`, `release/v0.11.0`, `capy/0110-rc1-versions-next` (#293) |
| Branches with open work outside the release | 3: the docs site (#250), the proactive handoff rehearsal (#290), `chore/jevmem-install` (no PR) |
| Fully merged into `release/v0.11.0`, safe to delete | 30: the 10 stack layers, 19 fix-forward branches and `codex/merge-readiness-20261005` |
| Originals that already have an `archive/*` copy, safe to delete | 3: `dev`, `release/v0.10.0`, `fix/changelog-roadmap-link-consistency` |
| `archive/*` branches, kept | 4 |
| Older branches already on the release line in equivalent form | 6 |
| Older branches superseded by later work | 19 |

## How the v0.11 line got here

- **2026-09-23:** the audit found 11 open PRs without review, a red CI on #247 to #249 (the guard's POSIX path bug), 36 commits by a placeholder `uh-team@example.com` and a `wip:` commit, and the unpublished v0.10.0 stranded on `dev`.
- **2026-09-24:** the guard fix, the v0.10.0 fold-in and the worktree serialization landed on #240 and were merged up the stack.
- **2026-10-02:** a review of the stack filed #251 (tracking) and #252 to #269. Linear tracks the same work under UH-165 and its children.
- **2026-10-28:** PRs #271 to #289 fixed every blocker (#252 to #257) and every layer follow-up (#258 to #267), plus input hardening (#289).
- **2026-11-01:** PR #249 merged the 10-layer stack into `release/v0.11.0` (`6d1e297`).

The placeholder authors and the `wip:` commit are gone: every commit between `main` and `release/v0.11.0` has a real author.

## Open pull requests

| PR | Branch → base | Commits | State and next step |
|---|---|---|---|
| [#293](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/293) | `capy/0110-rc1-versions-next` → `release/v0.11.0` | 1 (`10dcfcc`, on `2bffac4`) | Versions `0.11.0-rc.1`, the `next` dist-tag for prereleases, changelog and known issues. Its original base, `stack/v0.11.0-10-notify-toast`, is merged, so it is retargeted to `release/v0.11.0` and merged first |
| [#239](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/239) | `release/v0.11.0` → `main` | 312 | The release PR. Merged into `main` with a merge commit after #293; the `v0.11.0-rc.1` prerelease then publishes to npm `next` |
| [#250](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/250) | `claude/branch-audit-1.0-prep-k697wg` → `main` | 7, plus a merge of the release | This site. Lands after the release; merging it to `main` deploys production to `uh.agenticeng.app` |
| [#290](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/290) | `LaloLalo1999/ae-proactive-integration-v01` → `main` | 2 | "Rehearse guarded proactive agent handoffs" (AE-558). Independent of the release; rebase onto `main` once 0.11.0-rc.1 is in |
| #241 to #248 | `stack/v0.11.0-02` to `-09` → the layer below | | Redundant: every commit is in `release/v0.11.0` through #249. Close them |

`chore/jevmem-install` holds one commit (`969ec25`, "install jevmem project memory", 2026-10-29) and has no PR. Open one or delete it.

## Codex review bot

The automated reviewer is the **ChatGPT Codex Connector** GitHub App (`chatgpt-codex-connector[bot]`). It is configured in Codex, not in this repository, and applies to every branch.

**Decision (2026-09-24): keep it on.** On the v0.11 stack in September it only posted "Codex usage limits have been reached". For it to review a PR, a repository admin enables credits for code review in [Codex settings](https://chatgpt.com/codex/cloud/settings/code-review) and requests a review again (for example with an `@codex review` comment).

## The skipped v0.10.0

`dev` and `release/v0.10.0` hold a v0.10.0 release (PR #232) that was never merged to `main`, tagged or published. Its work (UH-138 capability `--strict`, UH-139 hello-uh and the docs link checker, the spec-stale fix) is in 0.11.0, and the changelog says 0.10.0 was skipped. Both branches, and `fix/changelog-roadmap-link-consistency` that the port came from, have archive copies at the same commits: `archive/dev`, `archive/release-v0.10.0` and `archive/fix-changelog-roadmap-link-consistency`.

## Every other branch

### Delete now: fully merged

No commit outside `release/v0.11.0`:

- The 10 stack layers `stack/v0.11.0-01-supervision-evidence` to `stack/v0.11.0-10-notify-toast`.
- The fix-forward branches `fix/211-telemetry-exit-test`, `fix/221-capability-docs`, `fix/252-watchdog-default-off` to `fix/267-layer10-followups` (16 branches) and `fix/v0.11.0-input-hardening`.
- `codex/merge-readiness-20261005`.

### Delete: archived or patch-equivalent

- `dev`, `release/v0.10.0`, `fix/changelog-roadmap-link-consistency`: each `archive/*` copy points at the same commit.
- `feat/epic-5-later-compare-replay`, `feat/tui-polish-uh-48-50-51`, `feat/uh-156-oh-my-pi-graduate-v0.8.0`, `feat/uh-90-retention`, `fix/p4-known-issues`, `fix/uh-plugin-ci-asyncio-teardown`: one commit each, already on the release line in equivalent form (`git cherry` shows none).

### Delete: superseded

These still show unique patches because their work was later squash-merged or rewritten, but the target tree contains the result (verified in the 2026-09-23 audit, unchanged since):

| Branch | Evidence it is superseded |
|---|---|
| `cx/core-agentic-delivery-architecture` | `docs/architecture/telar-integration.md` is identical on the release line. |
| `lalo/UH-135-linear-issue-triage-automation-2c5f` | The release line has `telemetry-beacon.ts` and is stricter (fixed `distinct_id`, guarded endpoint). Do not port its per-install id. |
| `lalo/UH-127-*`, `lalo/UH-128-*`, `lalo/UH-129-*`, `lalo/UH-130-*` | Shipped in `2e4f952` (#216). |
| `feat/uh-138-capability-strict-impl`, `fix/uh-138-force-help-and-test-assertion` | Contained in the v0.10.0 port, which is in 0.11.0. |
| `feature/hermes-plugin-core`, `feature/uh-45`, `chore/codex-e2e-smoke`, `feature/discipline-layer-core`, `feature/team-mission-runtime`, `fix/docs-landing-hero`, `fix/uh-72-codex-p1-p2`, `chore/dogfood-implement-uh-slice-template`, `release/v0.8.0-prep`, `feat/uh-81-runtime-config-overrides-cli`, `chore/uh-linear-canonicalization` | Pre-squash history from May 2026 of work that later merged. |

`archive/superseded-2026-10` (2026-10-02) keeps superseded branches reachable for reference; keep it.

## Suggested cleanup commands

Run by a maintainer after #239 merges. Deleting a remote branch cannot be undone from the UI; every branch below is merged, archived or superseded.

```sh
git push origin --delete \
  stack/v0.11.0-01-supervision-evidence stack/v0.11.0-02-run-control-invariants \
  stack/v0.11.0-03-workers-teams-wait stack/v0.11.0-04-ledger-templates-notify \
  stack/v0.11.0-05-review-acp-postchecks stack/v0.11.0-06-queue-land-admission \
  stack/v0.11.0-07-docs-known-issues stack/v0.11.0-08-hive stack/v0.11.0-09-ps-turns \
  stack/v0.11.0-10-notify-toast \
  fix/211-telemetry-exit-test fix/221-capability-docs fix/252-watchdog-default-off \
  fix/253-run-team-replace-fail-closed fix/254-orchestrator-write-roots fix/255-queue-sandbox-default \
  fix/256-land-onto-check fix/257-chain-append-lock fix/258-layer01-followups \
  fix/259-layer02-followups fix/260-layer03-followups fix/261-layer04-followups \
  fix/262-layer05-followups fix/263-layer06-followups fix/264-layer07-followups \
  fix/265-layer08-followups fix/266-layer09-followups fix/267-layer10-followups \
  fix/v0.11.0-input-hardening codex/merge-readiness-20261005 \
  dev release/v0.10.0 fix/changelog-roadmap-link-consistency
```

After 0.11.0-rc.1 is published, also delete `capy/0110-rc1-versions-next`, and `claude/branch-audit-1.0-prep-k697wg` once #250 merges.
