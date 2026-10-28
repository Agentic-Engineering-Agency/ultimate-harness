# Known issues

Defects, gaps and unproven claims in the 0.11.0 line, kept here so every maintainer and reviewer sees the
same list. **Confirmed** means reproduced or read in the code at this commit. **Reported** means found in an earlier
session and not re-checked at this commit. A fix removes its entry in the same commit and names it in the changelog.

For 0.11.0-rc.1 every Confirmed entry was re-checked on 2026-10-28 against the stack top `2bffac4`, which has every
follow-up PR through #289 merged. Entries fixed since they were recorded are listed under
[Fixed before 0.11.0-rc.1](#fixed-before-0110-rc1) with the PR that fixed them. The two review-speed entries are
proposals rather than defects and moved to the roadmap's
[medium-term proposals](ROADMAP.md#medium-term-proposals-not-filed).

## Reviews

| What goes wrong | Status |
|---|---|
| `review-prepare` diffs against the branch's recorded base (`git config branch.<name>.base`). After a branch is rebased, the recorded base must be updated, or the review captures unrelated files from the new base. | Confirmed at `2bffac4` (`src/harness/independent-review.ts`). #275 made a sandbox record the commit it forked from; nothing updates the recorded base after a rebase. |

## Landing and the loop

| What goes wrong | Status |
|---|---|
| `uh queue` has only been tested with fake launchers; no live queue has run. | Confirmed. #273 changed how the queue launches missions (like `uh mission run`), again tested with fake launchers only. |
| The hive has not run live: no real `uh land`, `uh queue` or `uh verify` has recorded a fact yet; every hive behaviour is proven only by the test suite. | Confirmed at `2bffac4`. |
| The hive's last changes (project-owned hive and review root, evidence resolved against the owning project, facts recorded by `uh verify`) were not independently reviewed: the last review, with no contradicted claim, covered the slice before them. Each change has a regression test that fails without it. | Confirmed. The hive follow-ups merged since (#274, #282, #289) were not independently reviewed either. |

## Run control

| What goes wrong | Status |
|---|---|
| `uh steer` on an orchestrator stops its session and leaves the workers it launched orphaned; they stop mid-work without committing. Steer an orchestrator only between its steps. | Confirmed (an orchestrator steered mid-wave orphaned a worker at turn 42); `src/harness/steer.ts` still does not stop or hand over an orchestrator's workers at `2bffac4`. |
| Real settled runs have not produced deliveries to configured notification sinks; `uh notify test` delivers. | Reported. |
| A Windows toast sent through the `windows-toast` preset is reported as a handoff: PowerShell accepted it, but whether Windows displays it (registered app id, notification settings) cannot be confirmed by UH and has not been checked by eye since the app id changed. | Confirmed (by design, unverified live). #284 hardened the app id quoting; nothing was checked by eye since. |
| The toast and notification-report change was recovered from a worker stopped before it finished and was not independently reviewed. | Confirmed. Its follow-up #284 adds tests but was not independently reviewed either. |
| `uh ps` turn counts for Claude Code (distinct assistant message ids, not counting a sub-agent's messages, which carry a `parent_tool_use_id`) and ACP (agent activity until a tool call completes) are tested on recorded streams only; the ACP rule is a heuristic that has not been checked against a live run. | Confirmed. Since #283 a Claude Code run's count is the runtime's own `num_turns` once its final record arrives; the ACP rule is unchanged. |
| Supervision now counts Claude Code turns, so `limits.max_turns` can stop a Claude Code run where it previously never counted; not yet observed on a live run. | Confirmed (behaviour change). #283 stopped counting a sub-agent's messages; still not observed live. |
| When neither the run's control file nor its digest has a turn count, `uh ps` reads the run's whole `events.ndjson` to count turns, which is slow for very long runs. | Confirmed in `src/harness/live-runs.ts`, mitigated by #283: only for runtimes whose turns can be counted from events, and cached by file size and modification time, so the file is read again only after it changes. |
| The turn-count change was recovered from a worker stopped before it finished and was not independently reviewed. | Confirmed. Its follow-up #283 was not independently reviewed either. |
| `uh wait` returned `orphaned` for a run that passed. | Reported. |
| A blocked run can leave a second run id inside a sandbox, and `UH_RESULT` can name a run directory that was never created. | Reported. |
| Eight concurrent sandbox creations failed once on Linux CI: one `git worktree add` failed under contention (`tests/sandbox.test.ts`, "eight concurrent createSandbox calls all register"). The same test passed on the other Linux CI runs of this line; it has not been reproduced. | Confirmed once (Linux CI). The test passed in Linux CI on `2bffac4`. |
| On macOS, `uh mission run-team` can wait up to `admission_timeout_ms` (20 minutes by default) before admitting a single worker on a machine with plenty of usable memory: `os.freemem()` counts only free pages there, not inactive or purgeable memory, so the default 700 MB worker plus 1024 MB reserve rarely fits. `tests/cli-notification-exits.test.ts` ("run-team announces team.settled") times out on a busy Mac for the same reason. [#291](https://github.com/Agentic-Engineering-Agency/ultimate-harness/issues/291). | Confirmed on macOS at `2bffac4`; Linux reads reclaimable memory and is not affected. |

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
| Command Code 1.62.1 exits with an uncaught `write EOF` after a single tool result of roughly 70K characters or more ([CommandCodeAI/command-code#859](https://github.com/CommandCodeAI/command-code/issues/859)). The guard forces large file reads into windows; large shell output is not limited. | Confirmed upstream; reads mitigated only. The upstream issue was closed as completed on 2026-10-06; which Command Code release carries the fix has not been checked, so the read windows stay. |

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
| The docs site (`apps/docs`) syncs only the roadmap from `docs/` (`scripts/sync-docs-site.mjs`); its other pages are maintained separately and do not include the handbook or the runbooks added since. | Confirmed at `2bffac4`. The docs-site rework (#250) is not part of 0.11.0-rc.1. |
| `docs/verification/capability-inventory.md` predates this development line; capabilities added since are listed in its section 5 without per-row test and evidence detail. | Confirmed at `2bffac4`. |

## Fixed before 0.11.0-rc.1

| What went wrong | Fixed by |
|---|---|
| On Linux, a shell delete of the hive (`rm -rf "<project>/.harness/hive"`) was refused as `delete_outside` instead of stopping the run as `guard_tamper` (`tests/hive-integrity.test.ts`, 4 failing tests on Linux CI). The guard read the `/`-prefixed path as a `cmd.exe` switch and skipped it. | #240 (layer 01, `f75a076`): `/x` tokens are switches only for `cmd.exe` verbs. The 4 tests pass in Linux CI on `2bffac4`. |
| `--root` on `uh notify detect`, `list` and `test` had no CLI test. | #284 (`tests/cli-notify.test.ts`, "uh notify with --root"). |
| Team memory reservations were released by controller pid, so workers sharing one controller pid could release each other's reservations and over-admit (recorded as a hypothesis). | #280: a reporting worker releases one reservation of its controller, not all. |

## Easy to trip on

- `uh mission run-team` takes a mission id, not a path; a path fails with `Invalid mission id`.
- `uh mission put` of a team packet needs its worker packets in the same call.
- `uh report` and `uh steer` take a run id (or a unique prefix), not a mission id.
- `uh land` requires a clean target worktree and a retained worktree for each worker branch (`run-team --retain`).
