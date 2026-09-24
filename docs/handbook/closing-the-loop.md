# Closing the loop

Three commands take the operator out of the steps between "a worker finished" and "its work is on the target
branch": operator post-checks grade a run with checks the agent never sees, `uh queue` launches missions in order
under an orchestrator cap, and `uh land` puts verified, reviewed worker branches on a target branch or leaves the
target exactly as it was.

## Operator post-checks

A required check the agent can read is a check it can game. `uh mission run --post-checks <file>` gives the operator
a grader that stays outside the agent's view.

```bash
uh mission run .harness/missions/<mission-id>/mission.yaml --runtime <adapter> --post-checks <checks-file>
```

The file is YAML or JSON, a list of checks:

```yaml
- name: reading-coverage
  command: python <grader> <spec>
  timeout_ms: 600000
```

- The file is read at launch. Its path and commands never reach the prompt, the runtime's environment or argv, or
  any artifact under the project root. Keep the file and anything it runs outside the tree the agent can read.
- Each command runs after the runtime settles, with no window, in the run's working root (the sandbox worktree when
  the mission is routed into one), with `UH_MISSION_ID`, `UH_RUN_ID`, `UH_RUN_DIR` and `UH_ROOT` in its environment.
- The console prints only the number of checks and the name of a failed one. Each check's output goes to a `logs`
  directory beside the checks file.
- `runtime-result.yaml` records `post_checks` as names and outcomes.
- A failed, timed-out or unrunnable check fails the run with exit code `1` whatever the stop code, and the
  mission-level `runtime-result.yaml`, `latest.json` and the runs index show the failure. An error inside the
  post-check runner itself fails the run with `post-check runner failed`; `UH_RESULT` is still printed.

## `uh queue`

`uh queue run <queue.yaml>` launches missions in file order once the entries they depend on have passed, at most
`--max-orchestrators` (default `2`) at a time.

```yaml
id: evening
entries:
  - id: hive
    mission: .harness/missions/<mission-a>/mission.yaml
    runtime: claude-code
  - id: docs
    mission: .harness/missions/<mission-b>/mission.yaml
    runtime: command-code
  - id: acceptance
    mission: .harness/missions/<mission-c>/mission.yaml
    runtime: claude-code
    after: [hive, docs]
```

```bash
uh queue run evening.yaml --max-orchestrators 2
uh queue status evening
```

- **Memory floor.** A launch is held unless measured free memory covers one more run (1024 MB) above a 1024 MB
  reserve, through the same admission helper team workers use; memory is probed again after a short wait.
- **Settlement.** Each entry settles from its run's recorded settlement through the same path as `uh wait`, never
  from the launcher process exiting. An orphaned run is recorded as `failed` with reason `orphaned`; a slow run stays
  `running` until its record settles. A wait that times out fails with `wait-timeout` and keeps the run id for a
  later resume; a launcher that exits non-zero before any run record appears fails with `launch-failed`.
- **State.** Per-entry state (`pending`, `running`, `passed`, `failed`, `skipped`, with run id, start and finish
  times and exit code) is written atomically to `.harness/queue/<queue-id>/state.json` after every change.
- **Resume.** A restarted queue resumes from `state.json` and waits on recorded run ids instead of relaunching them.
- **Failure.** Entries that depend on a failed entry are `skipped`.
- **Notifications.** Each settle sends one notification through the configured sinks
  ([notifications.md](./notifications.md)).

## `uh land`

`uh land` runs in the target branch's own worktree and lands one or more worker branches as a single commit.

```bash
uh land --worker-branch uh/team/<team>/<worker> --onto <target-branch> \
  --message-file <message-file> --fast-forward <other-checkout>
```

It refuses before touching anything unless every branch passes both gates:

1. **Verified.** The branch has a passed `uh verify` result in its retained worktree (run the team with `--retain`).
2. **Reviewed.** A collected independent review names the branch's team mission (read from
   `uh/team/<team>/<role>`), matches its request digest, captured the same file hashes as the branch tip, and
   contradicts no claim. Binding is to the team, not the individual worker; a review of one worker of a team can
   satisfy the gate for another. Reviews are read from `--review-root` when given, otherwise from the checkout git's
   common directory belongs to; when the project is itself a linked worktree that is the wrong checkout, so pass
   `--review-root <project>` (see [known issues](../known-issues.md)).
   `--accept-review <reason>` overrides only this gate and writes the reason, branches and review ids to
   `.harness/land/<timestamp>-decision.json`.

It then:

1. cherry-picks the branches without committing;
2. runs the project's checks (default `bun run typecheck` and `bun run test`);
3. scans the staged diff and the message for forbidden patterns (default `co-authored-by`, `anthropic`,
   `claude-session`, `generated with` and the robot emoji, case-insensitive);
4. commits with the repository's configured git identity as author and committer;
5. runs the build (default `bun run build`);
6. fast-forwards every `--fast-forward` checkout to the new commit;
7. removes each landed worker's retained worktree, and a team's leader worktree once none of that team's worker
   worktrees remain. Branches are kept, and so are the target and every `--fast-forward` checkout. A worktree that
   cannot be removed stays and does not fail the land. `--keep-worktrees` skips this step.

Any failure after the gates restores the target to its recorded `HEAD`, keeps every worktree, and exits non-zero
naming the step and the reason.

The checks, patterns and build come from an optional `land` block in `.harness/project.yaml`; an absent field keeps
the default:

```yaml
land:
  checks:
    - name: typecheck
      command: bun run typecheck
    - name: test
      command: bun run test
  forbidden_patterns: [co-authored-by, generated with]
  build: bun run build
```

Team workers commit under the same rule: the repository's configured `user.name` and `user.email`, falling back to
`uh team worker <uh-team@example.com>` only when the repository has none.
