---
title: Release plan to 1.0
description: The coordinated path from v0.9.0 on main, through the unpublished v0.10.0 and the v0.11.0 stack, to a 1.0.0 release.
---

Status on **2026-09-23**: `main` and npm are at **v0.9.0**. Two releases' worth of work has not reached `main`:

- **v0.10.0** (capability `--strict`, the hello-uh adoption example, a docs link checker, a spec-stale fix) was merged into `dev` in June and never promoted, tagged or published.
- **v0.11.0** is a 90-commit release branch plus a 10-PR stack: +71k lines across 399 files. That is run control, teams, guard hardening, the hive, the queue and land, and the delivery loop.

The details behind each step are on the [branch and PR audit](/release/branches/) and the [technical debt register](/release/debt/).

## Decisions on record

Decided by the owner on 2026-09-23.

| # | Decision | Outcome | Status |
|---|---|---|---|
| D1 | Capability mismatches: block, or warn with `--strict` to block? | **Warn by default, `--strict` blocks** (UH-138 behavior). `run-team` and `queue` should pass `--strict` so unattended runs still block. | Done on the stack, CI green (see [Stack status](#stack-status)) |
| D2 | GitNexus: mandatory or optional? | **Optional.** Use it when its tools are available; otherwise grep. PR #246 (commit `ffc1f8d`) already makes this change. | Lands with the stack |
| D3 | Placeholder `uh-team@example.com` authors and the `wip:` commit | **Fix them.** The team-run commits were made by UH's own workers during Mateo-GarciaL's release work, so they are re-attributed to him with a `UH-Team-Role: worker` or `leader` trailer, and the `wip:` commit (`f4de854`, the first cut of the loop probe) gets a descriptive message. | Needs a history rewrite and force-push of `release/v0.11.0` and all 10 stack branches; pending |
| D4 | Publish 0.10.0 separately, or fold it into 0.11.0? | **Skip 0.10.0.** Its work is folded into 0.11.0 and the changelog says 0.10.0 was never published. | Done with D1 |
| D5 | Keep the old docs domain or move? | **Retire the old site.** `apps/docs` and `deploy-docs.yml` are removed in PR #250; `uh.agenticengineering.lat` redirects to `uh.agenticeng.app`. | Done in #250; redirect deploys after the old Worker is removed |

Also decided: **keep the Codex review bot on** (reversed on 2026-09-24; it needs code-review credits to review the stack, see [Branch and PR audit](/release/branches/#codex-review-bot)), and **land stack fixes on the bottom layer (#240)**, never directly on `main`.

## Stack status

Updated 2026-09-24. Three commits landed on the bottom layer (#240, `0e6249d..b9ebdce`), and each upper layer (#241 to #249) got a merge commit carrying them. Nothing was force-pushed.

1. `fix(guard)`: POSIX absolute paths are targets, not `cmd.exe` switches (Phase 0 below), with regression tests.
2. `feat`: 0.10.0 folded into 0.11.0: capability warn by default with `--strict`, the hello-uh example, the `docs:check-links` CI step (over `docs/`, with two broken links fixed), the spec-stale fix, changelog and roadmap notes that 0.10.0 was skipped, and the plugin version bumped to 0.11.0.
3. `fix(sandbox)`: `git worktree add` is serialized per repository, fixing #240's flaky concurrency test.

After the push, CI (typecheck, tests, build, publish dry-run) is green on #240, #247 and #249, including the four hive tests that used to fail. Merging up the stack conflicted in two places: the `mission run` options in `src/cli.ts` (layer 05) and the changelog intro (layer 07). Both were resolved by keeping both sides.

Still open from the owner decisions: fixing the placeholder commit authors needs a history rewrite and force-push of all 11 branches, which waits on an explicit go-ahead and on telling Mateo-GarciaL first.

## Phase 0: unblock the stack

**Fixed on the stack (was the blocker): tool guard treated POSIX absolute paths as Windows switches.** It was present from the base of `release/v0.11.0`. In `src/harness/tool-guard.ts`, both the copy and delete target scanners dropped every token that starts with `/`, because `cmd.exe` switches look like `/s`. On Linux and macOS this meant:

- `cp out/x /etc/cron.d/x` and `mv out/x ~/.bashrc` were **allowed**. That was a sandbox escape for any worker with a shell tool.
- `rm -rf /abs/path/inside/root` was **denied** as `delete_outside`, with no target named. This is why `tests/hive-integrity.test.ts` failed on PRs #247 to #249: on Windows the paths start with `C:\` and pass.

Fix (verified on the stack tip: the 4 CI failures pass, the full suite passes with 2,184 tests and 12 skipped, and 5 new regression tests fail without the fix):

```diff
 const COPY_VERBS = new Set(["copy", "cp", "move", "mv", "xcopy", "robocopy", "copy-item", "move-item", "cpi", "mi"]);
+/** cmd.exe verbs whose `/x` tokens are switches. POSIX `rm`, `cp` and `mv` never take them, so `/etc/x` stays a path. */
+const CMD_SWITCH_VERBS = new Set(["rmdir", "rd", "del", "erase", "copy", "move", "xcopy", "robocopy"]);
+function isSwitch(verb: string, token: string): boolean {
+  return token.startsWith("-") || (CMD_SWITCH_VERBS.has(verb) && /^\/[a-z?][a-z0-9]*(?::[^/\\]*)?$/i.test(token));
+}
@@ collectShellTargets: copy verbs
-          const positional = ts.slice(1).filter(token => !token.startsWith("-") && !token.startsWith("/"));
+          const positional = ts.slice(1).filter(token => !isSwitch(verb, token));
@@ collectShellTargets: delete verbs
-            if (token.startsWith("-") || token.startsWith("/")) continue;
+            if (isSwitch(verb, token)) continue;
```

Landed on #240 and merged up through #249 (see [Stack status](#stack-status)).

Also in Phase 0:

1. **Done:** the #240 sandbox concurrency race is fixed by serializing `git worktree add` per repository.
2. **Move the `land.ts` fix** that rides in the docs PR #246 into #245, where the rest of `uh land` lives. The GitNexus change in #246 stays (decision D2).
3. **Get a human review on every layer.** None of #239 to #249 has one. The Codex bot stays on but only posted usage-limit notices on these PRs; with code-review credits enabled, re-request its review on each layer as well. Review #243 (shared guard core), #245 (`uh land` moves branches) and #247 (hive) first.

## Phase 1: fold v0.10.0 into 0.11.0

Port from `fix/changelog-roadmap-link-consistency` onto the bottom stack layer (#240) (a trial merge conflicts in `.gitignore`, `docs/ROADMAP.md`, `package.json` and `src/cli.ts`):

1. UH-138 capability severity and `--strict` (per decision D1), with `tests/capabilities-severity.test.ts`.
2. UH-139 `examples/missions/hello-uh/` and `scripts/check-doc-links.mjs`. Scope the link checker to `docs/` and the repository Markdown; `apps/docs`, where 131 of its 133 broken links were, is retired.
3. The `spec-stale` fix that treats `specs/` as the spec folder (`b894609f`).
4. Bookkeeping: `docs/ROADMAP.md` "planned v0.10.0" items, the "Deferred to v0.10.0+" changelog line, the plugin `manifest.json` version, and one `[0.11.0]` changelog heading (the release branch says `[0.11.0] — 2026-09-21`, the stack tip says `[Unreleased]`).

Then tag `archive/v0.10.0` on `release/v0.10.0` and delete `dev`, `release/v0.10.0` and the UH-138 branches.

## Phase 2: collapse the stack and merge

1. Merge #240 into `release/v0.11.0` with a merge commit. Retarget #241 to `release/v0.11.0`, merge it, and continue up to #249, one layer at a time. Use merge commits, not squash, so each layer's review stays attributable.
2. Make CI green on `release/v0.11.0`: typecheck, tests, build, plugin typecheck and tests, and publish dry-run.
3. Run the Windows-specific paths once on a Windows machine: ConPTY headless console, job objects, toasts and long paths. Linux CI does not exercise them.
4. Triage `docs/known-issues.md`: every entry is fixed, accepted for 1.0 with a workaround, or descoped.
5. Mark #239 ready and merge it into `main` with a merge commit.
6. Publish **0.11.0-rc.1** on the npm `next` tag. Many v0.11 features have never run live against a paid runtime: the hive, the queue, notification sinks, ACP turn counts and Codex route attestation. An rc keeps `latest` users on 0.9.0 until they have.

## Phase 3: 1.0 hardening

These close the gap between "the features exist" and "we can promise them". Each links to a debt register item.

- **Freeze contracts.** Every persisted schema that 1.0 promises moves from `uh.*.v0` to `uh.*.v1`, with a documented migration or a reader that still accepts v0. The newest ones (run digest, hive, queue, intervention, ACP) need the most care. Contracts that are not ready are marked experimental in the docs instead.
- **Thin `src/cli.ts` again.** Split it into one module per command group (`mission`, `team`, `run control`, `observatory`, `acceptance`, `hive`, ...), as `AGENTS.md` requires. It has grown from 1,803 to 3,709 lines.
- **Acceptance on two fleets.** The acceptance campaign passes on both Command Code and oh-my-pi, and the "unproven" list in the capability inventory is empty or descoped.
- **Pin dependencies.** No `latest` specifiers in `package.json` for a 1.0 package.
- **Delete merged branches** (see the [audit](/release/branches/#suggested-cleanup-commands)).

## Phase 4: 1.0.0

Release 1.0.0 when all of these hold:

- [ ] CI green on `main` on Linux, plus one recorded Windows run of the platform-specific paths.
- [ ] 0.11.0-rc has been used on at least one real project for the operator loop (`ps`, `wait`, `steer`, `kill`, `run-team`, `land`).
- [ ] Every 1.0 contract is `v1` and documented on this site; experimental surfaces are labeled.
- [ ] Known issues triaged; no open "unproven" claims in the README.
- [ ] `src/cli.ts` is a dispatcher.
- [ ] Docs site live at `uh.agenticeng.app`; the old domain redirects.
- [ ] `CHANGELOG.md` has a 1.0.0 section with an upgrade note from 0.9.0.

After 1.0: semantic versioning applies to the `v1` contracts and the CLI surface. Breaking a contract means a `v2` schema and a major version.

## Branching after 1.0

The stacked-PR workflow into a `release/*` branch worked well for reviewing 70k lines in layers. Keep it, and drop the parallel `dev` branch that let v0.10.0 get stranded:

- `main` is always releasable and is what npm `latest` ships.
- Feature work: short-lived branches into `main`, or into a `release/x.y` branch when a release is built as a stack.
- Every merged release is tagged immediately (`vX.Y.Z` plus `plugin-vX.Y.Z`), so an untagged release can never happen again.
