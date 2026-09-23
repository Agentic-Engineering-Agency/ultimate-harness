# Known issues

Defects, gaps and unproven claims in the unreleased 0.11.0 line, kept here so every maintainer and reviewer sees the
same list. **Confirmed** means reproduced or read in the code at this commit. **Reported** means found in an earlier
session and not re-checked at this commit. A fix removes its entry in the same commit and names it in the changelog.

## Reviews

| What goes wrong | Status |
|---|---|
| **Every review re-reads the whole slice.** `uh mission review-prepare` captures every file changed since the branch's recorded base, and review packets require the reviewer to read each captured file in full. There is no reuse of an earlier review for files whose bytes did not change: a one-line edit forces a full re-review. The acceptance runner already solves the same problem with input digests (`uh acceptance rebind`, evidence stays valid while the files it asserts are unchanged); reviews and the `uh land` review gate do not use it. | Confirmed. A MiMo review of a 15-file slice took 504 s; each follow-up fix invalidated it. |
| **Reviews are slow.** Beyond re-reading, a Command Code reviewer runs one tool call per turn and reads files over 40 KB in 600-line windows (see Command Code below). Where the time goes per run has not been measured; `uh report <run-id>` reports model versus tool time. | Confirmed (duration); breakdown not measured. |
| `review-prepare` diffs against the branch's recorded base (`git config branch.<name>.base`). After a branch is rebased, the recorded base must be updated, or the review captures unrelated files from the new base. | Confirmed. |
| The `uh land` review gate binds a review to the branch's team mission, read from `uh/team/<team>/<role>`, not to the individual worker: a review of one worker of a team satisfies the gate for another. | Confirmed in `src/harness/land.ts`. |

## Landing and the loop

| What goes wrong | Status |
|---|---|
| `uh queue` has only been tested with fake launchers; no live queue has run. | Confirmed. |
| The hive has not run live: no real `uh land`, `uh queue` or `uh verify` has recorded a fact yet; every hive behaviour is proven only by the test suite. | Confirmed. |
| The hive's last changes (project-owned hive and review root, evidence resolved against the owning project, facts recorded by `uh verify`) were not independently reviewed: the last review, with no contradicted claim, covered the slice before them, and reviews are paused until they stop re-reading unchanged files. Each change has a regression test that fails without it. | Confirmed. |

## Run control

| What goes wrong | Status |
|---|---|
| `uh steer` on an orchestrator stops its session and leaves the workers it launched orphaned; they stop mid-work without committing. Steer an orchestrator only between its steps. | Confirmed (an orchestrator steered mid-wave orphaned a worker at turn 42). |
| Real settled runs have not produced deliveries to configured notification sinks; `uh notify test` delivers. | Reported. |
| A Windows toast sent through the `windows-toast` preset is reported as a handoff: PowerShell accepted it, but whether Windows displays it (registered app id, notification settings) cannot be confirmed by UH and has not been checked by eye since the app id changed. | Confirmed (by design, unverified live). |
| `--root` on `uh notify detect`, `list` and `test` has no CLI test. | Confirmed. |
| The toast and notification-report change was recovered from a worker stopped before it finished and was not independently reviewed. | Confirmed. |
| `uh ps` turn counts for Claude Code (distinct assistant message ids) and ACP (agent activity until a tool call completes) are tested on recorded streams only; the ACP rule is a heuristic that has not been checked against a live run. | Confirmed. |
| Supervision now counts Claude Code turns, so `limits.max_turns` can stop a Claude Code run where it previously never counted; not yet observed on a live run. | Confirmed (behaviour change). |
| When neither the run's control file nor its digest has a turn count, `uh ps` reads the run's whole `events.ndjson` to count turns, which is slow for very long runs. | Confirmed in `src/harness/live-runs.ts`. |
| The turn-count change was recovered from a worker stopped before it finished and was not independently reviewed. | Confirmed. |
| `uh wait` returned `orphaned` for a run that passed. | Reported. |
| A blocked run can leave a second run id inside a sandbox, and `UH_RESULT` can name a run directory that was never created. | Reported. |
| Team memory reservations are released by controller pid; workers sharing one controller pid may release each other's reservations and over-admit. | Hypothesis, untested. |

## Guard

| What goes wrong | Status |
|---|---|
| Package installs issued through Command Code's PowerShell tool are not denied as `package_install`. | Reported. |
| A `.harness` path inside a worker's own scratch directory is treated as `guard_tamper` and hard-stops the run. | Reported. |
| PowerShell targets built with `(Join-Path ...)` are denied as literal paths; `nohup cmd 2>&1` without a trailing `&` is denied as `containment_escape`. | Reported. |
| oh-my-pi's `eval` and `python` tools bypass path checks. `runtime_config.tools` can withhold them; the default tool set still allows them. | Reported. |
| The oh-my-pi guard logs only denials, so a run with no denials cannot prove its guard loaded. | Reported. |

## Settlement, verification and cost

| What goes wrong | Status |
|---|---|
| `uh verify` and `review-prepare` fall back to the main checkout without saying so when a mission's worktree no longer exists. | Reported. |
| A run stopped by its turn cap can settle `passed` instead of `turn_limit` (acceptance `R7-turn-cap`, `R7-turn-cap-cmdc`). | Reported (last acceptance campaign). |
| `S3-unknown-cost-cmdc`: both workers fail with unknown cost on Command Code. | Reported (last acceptance campaign). |
| Every JEV decision receipt observed so far is `uncertain` with confidence `0`. | Reported. |

## Runtimes

| What goes wrong | Status |
|---|---|
| Command Code 1.62.1 exits with an uncaught `write EOF` after a single tool result of roughly 70K characters or more ([CommandCodeAI/command-code#859](https://github.com/CommandCodeAI/command-code/issues/859)). The guard forces large file reads into windows; large shell output is not limited. | Confirmed upstream; reads mitigated only. |

## Unproven

| Claim | Why it is not proven |
|---|---|
| oh-my-pi `runtime_config.tools` and ACP runs in sandboxes behave as tested | Unit-tested only. |
| Prompts over 32K reach Command Code and oh-my-pi | No live run since prompts moved to stdin and files. |
| Codex route attestation | No live run. |
| Command Code cost reporting | Streams report tokens but no price. |
| `uh mcp serve` in a real client | Tested over stdio in the test suite; not used from a live client. |

## Documentation and release

| What goes wrong | Status |
|---|---|
| The docs site (`apps/docs`) syncs only the roadmap from `docs/` (`scripts/sync-docs-site.mjs`); its other pages are maintained separately and do not include the handbook or the runbooks added since. | Confirmed. |
| `docs/verification/capability-inventory.md` predates this development line; capabilities added since are listed in its section 5 without per-row test and evidence detail. | Confirmed. |

## Easy to trip on

- `uh mission run-team` takes a mission id, not a path; a path fails with `Invalid mission id`.
- `uh mission put` of a team packet needs its worker packets in the same call.
- `uh report` and `uh steer` take a run id (or a unique prefix), not a mission id.
- `uh land` requires a clean target worktree and a retained worktree for each worker branch (`run-team --retain`).
