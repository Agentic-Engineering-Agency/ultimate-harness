---
title: Release plan to 1.0
description: How the v0.11 line reached a release candidate, what 0.11.0-rc.1 contains, and what is left before 1.0.0.
---

Status on **2026-11-19**. The whole v0.11 line is on `release/v0.11.0` and ships as **0.11.0-rc.1** on the npm `next` dist-tag. npm `latest` stays on **0.9.0** until the final 0.11.0. 0.10.0 was never published; its work is folded into 0.11.0.

The details behind each step are on the [branch and PR audit](/release/branches/) and the [technical debt register](/release/debt/).

## How the v0.11 line landed

| Date | What happened |
|---|---|
| 2026-09-23 | Audit of the 10-layer stack (#240 to #249) and of `release/v0.11.0` (#239). Owner decisions D1 to D5 below. |
| 2026-09-24 | Stack fixes landed on the bottom layer (#240) and were merged up: the tool guard no longer treats POSIX absolute paths as `cmd.exe` switches, 0.10.0 was folded in (capability `--strict`, hello-uh, `docs:check-links`, the spec-stale fix), and `git worktree add` is serialized per repository. |
| 2026-10-02 | A review of the stack filed tracking issue #251 and child issues #252 to #269: six blockers (#252 to #257) and one follow-up issue per layer (#258 to #267). |
| 2026-10-28 | Every blocker and follow-up was fixed by PRs #271 to #289, merged into the stack, including input hardening of the guard, the notification config and the harness's own git calls (#289). |
| 2026-11-01 | The 10-layer stack landed in `release/v0.11.0`: PR #249, merge commit `6d1e297` (2026-10-31 19:36 in UTC−6). |

The blockers that changed default behavior, so upgrading operators should know them:

- **#252:** the loop watchdog is off unless a mission sets `runtime_config.loop_watchdog: shadow`. It used to default to shadow and could send loop state to the paid TypeSafe API.
- **#253:** `uh mission run-team --replace` blocks on live, stale and unknown runs and fails closed when the registry or process table cannot be read.
- **#254:** an orchestrator is refused at planning when its guard's write roots cover the live project root (empty, `.`, absolute or `..`).
- **#255:** `uh queue` routes like `uh mission run`; only an entry with `sandbox: false` runs in the project root.
- **#256:** `uh land` refuses unless the target worktree has `--onto` checked out.
- **#257:** hash-chain appends (hive facts, intervention ledger, land decisions) take an exclusive lock; `uh hive verify --repair` re-links a chain the old bug forked.

## The release: 0.11.0-rc.1

1. **#293** sets every version to `0.11.0-rc.1` (CLI package, plugin manifest and `plugin.yaml`), adds `scripts/npm-dist-tag.mjs` so a prerelease version publishes to `next` and a release version to `latest`, and writes the `[0.11.0-rc.1] — 2026-10-28` changelog section and the known-issues triage. It merges into `release/v0.11.0`.
2. **#239** merges `release/v0.11.0` into `main` with a merge commit.
3. A GitHub **prerelease** `v0.11.0-rc.1` triggers `publish.yml`, which publishes `@agenticengineeringagency/ultimate-harness@0.11.0-rc.1` to npm under `next`. `publish.yml` and `release-plugin.yml` both refuse a release whose GitHub prerelease flag disagrees with the version.
4. **#250** (this site) lands on `main` after the release. It replaces `apps/docs` with `apps/site` and deploys `uh.agenticeng.app`.

Install the candidate with `bun add -g @agenticengineeringagency/ultimate-harness@next`.

An rc first, because many v0.11 features have never run live against a paid runtime: the hive, the queue, notification sinks, ACP turn counts and Codex route attestation. See the [known issues](/source/docs/known-issues/).

## Decisions on record

Decided by the owner on 2026-09-23.

| # | Decision | Outcome | Status |
|---|---|---|---|
| D1 | Capability mismatches: block, or warn with `--strict` to block? | **Warn by default, `--strict` blocks** (UH-138). `--strict` is on `uh mission dry-run`, `run` and `run-all`. | Done, in 0.11.0-rc.1 |
| D2 | GitNexus: mandatory or optional? | **Optional.** Use it when its tools are available; otherwise grep. Recorded in `AGENTS.md` and the changelog (#246, #264). | Done |
| D3 | Placeholder `uh-team@example.com` authors and the `wip:` commit | **Fix them.** | Done: no commit between `main` and `release/v0.11.0` has a placeholder author or a `wip:` subject |
| D4 | Publish 0.10.0 separately, or fold it into 0.11.0? | **Skip 0.10.0.** The changelog says 0.10.0 was never published. | Done |
| D5 | Keep the old docs domain or move? | **Retire the old site.** `apps/docs` and `deploy-docs.yml` are removed in #250; `uh.agenticengineering.lat` redirects to `uh.agenticeng.app`. | Lands with #250; the redirect deploys after the old Worker is removed |

Also decided: keep the Codex review bot on (see [Branch and PR audit](/release/branches/#codex-review-bot)).

## Phase 3: 1.0 hardening

These close the gap between "the features exist" and "we can promise them". Each links to a debt register item.

- **Prove the candidate live.** Run the acceptance campaign at the rc commit on both fleets (Command Code and oh-my-pi), and use 0.11.0-rc.1 on at least one real project for the operator loop. Every known issue ends fixed, documented as a limit, or labeled experimental ([TD-02](/release/debt/#td-02-no-live-acceptance-evidence)).
- **Freeze contracts.** Every persisted schema that 1.0 promises moves from `uh.*.v0` to `uh.*.v1`, with a documented migration or a reader that still accepts v0. Contracts that are not ready are marked experimental ([TD-03](/release/debt/#td-03-contracts-are-all-v0-and-14-have-no-schema)).
- **Thin `src/cli.ts` again.** Split it into one module per command group, as `AGENTS.md` requires. It has grown from 1,803 lines on 0.9.0 to 3,815 ([TD-04](/release/debt/#td-04-srcclits-is-not-a-thin-dispatcher)).
- **Pin dependencies.** No `latest` specifiers in `package.json` for a 1.0 package ([TD-09](/release/debt/#td-09-unpinned-dependencies)).
- **Test what is promised.** A Node 20 job and a recorded Windows run of the platform-specific paths ([TD-10, TD-11](/release/debt/#td-10-td-11-ci-coverage)).
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

- `main` is always releasable and is what npm `latest` ships; prereleases go to `next`.
- Feature work: short-lived branches into `main`, or into a `release/x.y` branch when a release is built as a stack.
- Every merged release is tagged immediately (`vX.Y.Z` plus `plugin-vX.Y.Z`), so an untagged release can never happen again.
