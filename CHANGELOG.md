# Changelog

All notable changes to `@agenticengineeringagency/ultimate-harness` are recorded here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [SemVer](https://semver.org/spec/v2.0.0.html).

Issues are tracked in [Linear](https://linear.app/agenticengineering-agency/team/UH/active); PRs live in [GitHub](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pulls).

## [Unreleased]

Everything since 0.9.0, to be released as 0.11.0; nothing after 0.9.0 has been published.

### Added
- Native ACP (Agent-Client Protocol) v1 adapter: `acp` runtime supporting headless agent orchestration via standard JSON-RPC 2.0 over stdio with run-id integrity, strict `uh.runtime-result.v0` validation, wire-conformance error mapping, bidirectional permission request handling (`session/request_permission`), timeout and cancellation signal threading, and 17 regression tests.
- Progressive semantic routing: `chooseSemanticRoute` in `src/harness/auto-route.ts` combining Level 0 deterministic eligibility (runtime_requirements, capabilities, fleet, and `decision_policy.allowed_runtimes`) with Level 1 TypeSafe System One (JEV) classification. Evaluates task cognitive complexity and selects the optimal adapter and model from candidate options with calibrated confidence, writing `uh.decision-receipt.v0` receipts.
- Mission `decision_policy` schema: `DecisionPolicySchema` in `src/schema/mission.ts` allowing missions to specify `enabled`, `min_confidence`, `allowed_runtimes`, `allowed_models`, `require_provider_for_route`, `require_provider_for_retry`, `escalation_model`, and `fallback_model`.
- ACP session template: `.harness/templates/acp-worker.yaml` and runbook `docs/runbooks/acp-setup.md`.

- `guard.allow_native_subagents` (default `false`). Native sub-agent tools (`task`, `agent`, `subagent`, `spawn_agent`, `dispatch_agent`, `delegate`) are denied by tool name for every role; a denied worker is told to end with `ESCALATE: <what its orchestrator should delegate>`.
- Delegated-agent route attestation. Supervision reads the structured `details.progress[]` / `details.jobs[]` metadata of native tool events and stops the run with `route_mismatch`, naming the route, when a sub-agent runs on a provider or model outside the assignment. Tool arguments and tool text are never read.
- oh-my-pi runs receive a per-run `omp-overlay.yml` through `--config`. It pins every OMP model role to the assigned model, sets `task.eager: default`, disables the advisor, and sets `task.maxRecursionDepth: 0` so the native `task` tool is not offered (`1` when the guard allows native sub-agents).
- Project fleet policy. `fleet.routes` in `.harness/project.yaml` lists the models the project authorizes, per adapter and role. `uh mission run`, `run-all` and every `run-team` worker are refused before spawn when the assigned model is missing or outside the fleet. `--force` does not bypass it. A project without a `fleet` block is unchanged.
- Codex adapter: optional `runtime_config.model`, passed to `codex exec`, with route attestation through the shared supervised process runner. Without a configured model behavior is unchanged.
- `containment_escape` guard class: launches that leave the supervised process tree are denied (`Win32_Process.Create` through WMI or CIM, scheduled tasks, services, `setsid`, `systemd-run`, `disown`, `at`, `batch`, `crontab` edits, backgrounded `nohup`). Read-only forms such as `schtasks /query` stay allowed.
- `guard_tamper` guard class: writes to the guard policy or log, or to harness state outside the worker root, are denied and stop the run with `policy`.
- `limits.max_thinking_ms`: reasoning output counts as liveness for the stall check, bounded by this budget (default four times `stall_timeout_ms`). Repetitive reasoning is detected from window frequencies and does not count as live. Reasoning text is never persisted.
- Experience store: a read-only index over settled runs with grouping by runtime, model, workflow profile or stop code, and a success-rate versus cost Pareto frontier. Unknown cost, tokens and durations stay unknown.
- OpenTelemetry export: `uh observatory export <mission> --otlp` writes one run as OTLP/JSON following the GenAI semantic conventions (`invoke_agent`, `chat`, `execute_tool`) with deterministic ids. Tool arguments, results, message text and prompts are never exported; tool targets are opt-in.
- `uh observatory runs [--mission] [--group-by] [--json]`.
- Terminal contract for `uh mission run`: `--quiet`, a final single-line `UH_RESULT {json}` without absolute paths, and exit codes 0 passed, 1 failed, 2 blocked, 130 cancelled.
- Native event stream loop-probe: `src/harness/loop-probe.ts` projects Command Code (`toolCallId` sequence from `tool_queued` to `tool_completed`) and oh-my-pi events accurately, calculating real repeat and alternating signatures without false positives.
- OTLP Trace Push client: `src/harness/otlp-push.ts` sends exported GenAI traces to an OTLP HTTP endpoint with bounded retries, capped `retry-after` backoff, and strict secret protection.
- Run arm comparison and A/B template evaluation: `src/harness/run-comparison.ts` compares run sets using Wilson score intervals and cost-per-success without misrepresenting unpriced runs.
- Team run salvage: `src/harness/team-run.ts` preserves verified work from workers stopped by limits or deadlines when their declared outputs and checks pass, recording eligible branches in the integration report.
- Consistent dry-run overrides: `uh mission dry-run` mirrors `uh mission run` override precedence for all runtime adapters.
- Live-run registry and `uh ps`: every runtime attempt claims a registry entry at the project root, and `uh ps` reports each run's mission, team role, runtime and model, verdict (`live`, `orphaned`, `stale`, `settled`), turns, denials, heartbeat age, last tool and native pids. `--json` is machine-readable, `--all` includes runs settled within 24 hours, any orphaned run exits 3, and `uh status` prints a live-runs summary line.
- `uh kill` stops runs from the project root by id or unique prefix, by mission, role or team, `--all` or `--orphans`. It cancels through the controller, waits a bounded `--wait-ms`, terminates only the recorded controller's process tree when survivors remain, and reports `cancelled_gracefully`, `force_killed`, `orphan_settled`, `still_alive` or `skipped_settled` per target. An orphan settles in place through the guardian reconcile path with a `controller_lost` receipt, and `--team` stops workers before the team controller and marks team state cancelled so integration never lands.
- Independent review packets pin the report to the request: the emitted JSON schema enumerates exactly the acceptance and check ids the request allows (an empty list allows nothing), the packet objective names the required ids per source and directs anything else to `observations`, verified observations are carried into the assessment without changing the recommendation, and the emitted review mission carries a guard policy limiting writes to the report directory with git, package installs and network denied.
- The acceptance registry ports every capability to the Command Code fleet as 17 `<id>-cmdc` capability ports plus three `G1-cmdc-*` guard probes, with the model carried by the registry so no per-run override is needed, and a costless support wrapper strips runtime usage so the unknown-cost admission route is exercised without spend.
- Session templates bundle how an attempt is executed: adapter, runtime overrides, limits, recovery, guard defaults and a budget tier. Mission values win over the template, write roots are never widened, a strict template refuses missions without narrow explicit write roots, with native sub-agents, or with network clients, and `uh mission run` and `dry-run` accept `--template`, blocking unknown or invalid templates before spawn.
- Read-only MCP server over the run store: `uh mcp serve` answers newline-delimited JSON-RPC on stdio for the stateless 2026-07-28 revision and the 2025-11-25 handshake with three tools (`uh_status`, `uh_runs`, `uh_run`). Identifiers are validated before any path is built, every returned path is relative, and no prompt, runtime output or file content is returned.
- Command Code `runtime_config.role: orchestrator` arms the guard with controller commands, so harness mission commands pass while agent CLIs, native sub-agent tools, forced runs and chained commands stay denied. Workers are unchanged, and fleet admission applies the role.
- Team worker runs are indexed: the run index reads each worker's canonical run through the team parent's recorded state, attaches the team mission and role, and lets the team-recorded view win over the bare mission scan. `uh observatory runs` shows token totals and a `cost_source` column.
- Run cost provenance with the operator price table: `.harness/prices.yaml` (`uh.prices.v0`) holds operator-maintained USD rates per model, matched case-insensitively. A run's cost resolves to `reported` or `estimated`, or stays unknown with the reason naming the gap; Command Code streams report token counts but no price, incomplete token counters are never priced, and a missing or malformed table prices nothing. Team budget admission treats an estimated cost like a reported one.
- Settlement conflict records: when `runtime-result.yaml` and the runtime-control receipt disagree on the terminal status, a `settlement_conflict` record is appended. A confirmed settlement outranks the result (status rewritten, exit codes annotated or forced); an unconfirmed receipt never rewrites a result.
- Injectable supervision clock: `runRuntimeProcess` accepts a clock and poll scheduler, so supervision and recovery tests advance stall, startup and timeout budgets deterministically instead of waiting on wall time.
- Capability inventory: `docs/verification/capability-inventory.md` maps every CLI capability to its implementation, tests and acceptance id, classifies each row, and lists the rows most dangerous to leave unproven.
- `uh mission check` validates a mission packet and its runtime overrides without launching a runtime, verifying write roots against expected outputs and Change-only paths, checking `read_first` paths, and testing grounding claims against file contents.
- `uh mission put` validates and installs mission packets into `.harness/missions/<id>/mission.yaml` atomically with audit event logging, refusing overwrite without `--replace` or while a run is live.
- `uh steer <run-id> <message>` messages a live run: its owning controller stops the attempt with stop code `steered` and resumes the same native session with the message as the first instruction, without consuming restart budgets; `--report` asks for a status report first. Steering an orchestrator orphans the workers it launched (see docs/known-issues.md).
- `uh wait` blocks without polling until matched runs settle or are orphaned by watching the live-run registry, accepting a run id, unique prefix, `--mission`, or `--team`.
- `uh note` records manual interventions on the intervention ledger at `.harness/ledger/interventions.ndjson` with cause, qualifier, and source attribution.
- `uh ledger` inspects and manages the append-only intervention ledger (`list`, `summary`, `land`, `confirm`, `import`), tracking corrections and their countermeasures across runs.
- Intervention ledger (`uh.intervention.v0`): append-only NDJSON ledger recording corrections triggered by steers, kills, worker replacements, non-passing reviews, and supervisor stops, with automated secret redaction.
- Live run digest (`uh.run-digest.v0`): supervision periodically projects active run progress to disk, enabling `uh report` to report live tool activity, denials, written files, loop signals, and assistant text without invoking a model.
- Headless pseudoconsole execution on Windows: workers spawn attached to a headless pseudoconsole so inherited descendant processes do not create visible terminal windows.
- Shadow loop watchdog: supervision monitors live native events and computes deterministic loop signals, recording advisory decision receipts when repetition or alternating thresholds are crossed.
- Acceptance runner invariants: registry entries can declare invariants (such as untouched protected paths, no worker commits, no package installs, and consistent guard logs) judged against recorded run evidence.
- `uh queue run <queue.yaml>` launches missions in file order once their `after` entries have passed, at most `--max-orchestrators` (default 2) at a time, and holds a launch while free memory cannot cover one more run above the admission reserve. Entries settle from their run records through the `uh wait` path (an orphaned run fails with reason `orphaned`), state is written atomically to `.harness/queue/<queue-id>/state.json`, a restarted queue resumes from it without relaunching, dependants of a failed entry are skipped, and each settle sends one notification. `uh queue status <id>` prints the state.
- `uh land --worker-branch <b>... --onto <branch> --message-file <f>` lands verified worker branches from the target's worktree. It refuses unless each branch has a passed `uh verify` result in its retained worktree and a collected review in the main checkout that names the branch's mission, matches its request digest, captured the branch tip's file hashes and contradicts no claim (`--accept-review <reason>` overrides only the review gate and writes a decision under `.harness/land/`). It cherry-picks without committing, runs the project's checks, scans the staged diff and message for forbidden attribution patterns, commits with the repository's configured identity, runs the build and fast-forwards each `--fast-forward` checkout; any failure after the gates restores the target's recorded HEAD. Checks, patterns and build are configurable under `land` in `.harness/project.yaml`.
- `uh mission run --post-checks <file>` runs operator checks the agent never sees after the runtime settles, in the run's working root with `UH_MISSION_ID`, `UH_RUN_ID`, `UH_RUN_DIR` and `UH_ROOT` set. The file path and commands never reach the prompt, the runtime's environment or argv, or any artifact under the project root; `runtime-result.yaml` records only names and outcomes, and a failed, timed-out or unrunnable check fails the run with exit code 1.
- Notifications: settled runs, teams and alerts reach configured command or webhook sinks (presets for hermes send, apprise, ntfy and a Windows toast). Nothing is sent until a sink is configured; deliveries are asynchronous, at most once per event, run and sink, logged, and never delay settlement. `uh notify detect`, `list` and `test`.
- `uh acceptance rebind` revalidates old evidence without rerunning a model. Registry entries declare the files each probe asserts, evidence records an input digest over those files plus runtime and model, and freshness compares digests instead of commits, naming the inputs that changed.
- `context.project_brief: false` keeps the Project facts section out of a mission's prompt; `uh mission dry-run` prints `Project facts: off`. `.harness/project-brief.md` is otherwise rendered once into every worker prompt, capped at 4,000 characters.
- A team worker may name a session template, which supplies its limits, recovery, `worker_rules` and, when the worker omits one, its adapter. An unknown template fails the team before any worker starts.
- oh-my-pi `runtime_config.tools` passes an allowlist to omp as `--tools=<list>`, so a read-only mission can withhold tools such as `eval`.
- ACP `runtime_config.mcp_servers` passes stdio and http MCP servers to `session/new`, and `runtime_config.env` drops exact names or `PREFIX*` patterns and then sets values before spawn. MCP env and header values go only on the wire. Windows npm shims resolve the same way for check and run.
- `uh ps` marks a run whose current tool call has produced no output for five minutes with `STALLED tool=<name> <minutes>m`.
- `uh report` and the run digest count turns, tools, written files and tokens for Claude Code and oh-my-pi runs as for Command Code, and report context size at the first, fifth and last request, single-call turns, re-reads, tool output by kind, and model versus tool time.
- `docs/known-issues.md` lists every open defect, gap and unproven claim, each marked confirmed or reported; the README gains an operating-runs command table, and the capability inventory gains a section for capabilities added in this development line.
- Team workers now receive per-worker objectives, runtime budgets, declared outputs, and seeds with canonical contract and settlement records.
- Deadline grace recovery now preserves an explicitly incomplete deliverable and missing-work handoff before settling the run.
- Native runtime supervision now reports denial budgets and repeated commands, stops protected-path mutations, and resumes recoverable denials with source stop facts.
- Acceptance missions now record attested real-runtime evidence, freshness-aware status, and generated capability reports.
- Acceptance freshness requires evidence from the current harness commit.
- Acceptance runtime overrides now select the requested adapter explicitly and warn when they differ from registry defaults.
- Acceptance campaigns inherit caller environment variables and derive hook distribution paths from the known source root.
- Acceptance evidence records fact sources for merged attempts, with deterministic sorted-run selection and fixture seams.
- Attempted fixture-only missions now render their actual failure or pass outcome instead of hiding it as fixture-only.
- Guardian acceptance requires settlement confirmation and a terminal guardian receipt.
- Acceptance registry entries carry stable capability identifiers independently of probe names.
- Deadline acceptance exercises an unscripted task rather than treating a turn-limit fixture as deadline proof.
- Team budget acceptance remains unproven where canonical state does not expose the required budget or reservation fact.
- Acceptance report generation is checked for drift against the registry and available evidence.
- Resource-wave admission now maps `mapResourceWaves` with memory-headroom checks and cost reservations, preventing unsupported workers from entering a wave.
- Team workers now carry distinct mission contracts through `team.workers[].mission_id`.
- Native Claude Code adapter with structured event capture, tool-guard hooks, route checks, and saved-session recovery. End-to-end coordinator delegation is not yet validated.
- TypeSafe System One integration in verification and independent-review collection, with typed verdict parsing, compact evidence summaries, and persisted decision receipts. Semantic routing, scope-change, retry policy, and confidence thresholds remain unimplemented.
- Optional live usage in runtime-control receipts and active non-team Observatory projections. This does not enforce token or context budgets.

### Changed

- Agent-client denial no longer depends on `deny_network_clients`. A mission that sets `runtime_requirements.needs_network` previously lost agent-client denial along with network denial. Workers may not spawn agents; an explicit `guard.agent_clients: []` is the only opt-out.
- Default `agent_clients` adds `claude`, `opencode`, `qwen`, `goose` and `cursor-agent`.
- `uh mission run` refuses to run in the project root when no sandbox is bound to the mission, unless `--no-sandbox` is passed. `uh mission dry-run` prints the routing.
- Team and sandbox worktrees are created with `git worktree add --lock --reason` and unlocked before removal. UH no longer runs a global `git worktree prune`.
- Provider and model identifiers are compared case-insensitively for route attestation and fleet admission, with an optional provider prefix reconciled. There is no alias table and no partial matching.
- System One judgments ask one bounded yes/no question per criterion that has no deterministic result plus a fixed battery about the report itself, compose the three-verdict outcome in code with named thresholds, and record the answering model, latency and usage in the receipt. Requests time out and retry 429 and 529 with backoff, and the requested model can be pinned.
- Verification hands System One only facts the harness established: criteria with a check command carry their deterministic result and are never sent, the others carry their description, tamper comes from the policy stop code, and deterministic failures still dominate.
- Dispatch prompts render every list section explicitly: an empty Read First, Expected Artifacts, Verification Checks, Constraints or Acceptance Criteria section says `none, add nothing` instead of being omitted.
- `uh mission run-team` worktrees record their base commit in git config and team state, hide harness-owned files from worker git status, accept `--base-ref` to set the base ref, and refuse relaunching when worktrees remain unless `--replace` is provided to archive previous branches.
- Worker prompts reach runtimes via standard input or file instead of argv payloads, allowing prompts exceeding Windows command-line limits to launch under the guardian Job Object and memory caps.
- Guard arming verifies hook execution before allowing unguarded tool use, arming the guard once matching evidence is recorded and stopping with `policy` if tools run without hook coverage.
- `uh report` renders efficiently from the atomically updated `uh.run-digest.v0` projection instead of repeatedly rescanning full event logs, reading only the tail of `events.ndjson` unless `--full` is specified.
- Orchestrator missions can run observation and run-control commands (`ps`, `report`, `steer`, `resume`, `kill`, `experiment`) as controller commands while agent CLIs remain denied.
- Team missions support an explicit `unknown_cost: "admit" | "block"` resource policy, allowing completed workers with unpriced runtimes to proceed to later waves without blocking when `admit` is set.
- Session templates drive team worker dispatch, adopting worker overrides, limits, recovery rules, and budget tiers across wave executions.
- Team workers commit with the repository's configured `user.name` and `user.email`, falling back to `uh team worker` only when none is set.
- Teams admit another worker only when measured free memory, minus reservations for workers still starting, covers the worker's need; a reservation ends when the worker reports running or after 60 seconds.
- Orchestrator-role missions run in the project root without `--no-sandbox`; their guard confines writes to their declared write roots, and an orchestrator without write roots is still refused.

### Fixed

- Tool Guard judges agent clients by executable position instead of a whole-command text match. `codex.cmd`, `omp.exe`, path-qualified binaries, the PowerShell call operator, `env`/`xargs`/`pnpm dlx` launchers, `bash -c` bodies and command substitutions are denied; `grep -r omp src` and `cat docs/codex.md` are no longer false denials that consumed a worker's denial budget.
- Workers can no longer start paid runtimes through UH itself (`uh mission run`, `run-all`, `run-team`, `uh acceptance run`, or `node dist/cli.js ...`). Read-only UH commands stay available, and the Claude Code orchestrator role keeps its controller-command allowance.
- A runtime that resolves helper or sub-agent models from operator-global settings could spend on a route other than the assigned one, because only the top-level session was pinned and attested. Roles are now pinned per run and delegated routes are attested.
- Tool Guard resolved every relative write target against the worker root, so a command that changed directory first (`cd <elsewhere> && Set-Content <relative path>`) wrote outside the sandbox. Directory changes are tracked through a command, including nested shell bodies and an explicit `cwd` on the tool input; an unresolvable directory change denies every later write in that command.
- A concurrent reader could fail a run: replacing `runtime-control.json` by rename fails on Windows while any process has the file open, and the failed heartbeat stopped the run with `controller_error`. Renames retry with bounded backoff, a periodic heartbeat that cannot be persisted no longer stops the run, and terminal writes stay strict.
- Team worker commits swept in files the harness writes into the worker root (the Command Code hook configuration, the worktree-local ignore file, a tracked audit log). Commits now exclude the protected roots by pathspec, and a worker that touched only harness state produces no commit.
- The Command Code health probe ran the CLI without `--no-auto-update`, so an adapter check could start a self-update that replaced the runtime while another run was launching it.
- The acceptance report no longer links evidence that does not exist, and present evidence links resolve from `docs/acceptance/`.
- Mission turn limits reach the native runtime: Command Code and Claude Code receive `--max-turns` derived from `limits.max_turns` (Command Code's silent native default of 100 turns is recorded on the plan), and a native terminal cap maps to a UH stop code: `max_turns` settles as `turn_limit`, native time caps as `timeout`, and any other failing native stop as `runtime_error` with the native reason copied into `stop_reason`.
- Command Code shell results carry no error field, so supervision reads the leading `Exit code: <n>` line of the result text: a non-zero code is a failure, a later mention of `Exit code` in stdout is not, and unknown event shapes are not failures. Repeated failing shell commands now reach the repeated-failure stop.
- `uh mission cancel` resolves the run through the same discovery `uh ps` uses, so a team worker can be cancelled from the project root even though its runtime control file lives deeper in the harness tree.
- Diff capture retries each git command once after a settle delay, so a transient spawn failure cannot fail an otherwise settled run, and a capture failure after settlement is recorded as `diff_capture` bookkeeping instead of changing status or exit code.
- Sandboxing works without a tracked sandboxes index and across volumes: a missing index means an empty one created on demand (the audit log and the index are no longer tracked), an invalid index still fails loudly, and the directory backend retries once with `--no-hardlinks` when git cannot hard-link objects across the volume holding the object store.
- Guard hooks run from an immutable per-content snapshot in a per-user cache instead of the mutable build directory, so a rebuild during a run cannot replace the guard under a live worker. An existing snapshot is verified before reuse, and a mismatch fails closed.
- The acceptance runner installs the support shim its registry entries declare: the copied support directory is prepended to the child PATH for that run only, and `shim_on_path` is recorded in the evidence.
- Acceptance guard facts are read from the run's tool-guard log on disk and count denials only, with allow lines recorded separately, so a guard probe's recorded denial budget matches what actually fired.
- The acceptance snapshot resolves `node_modules` by walking up from the harness root (a worktree or leader tree without its own install resolves the parent checkout), refuses loudly with exit 2 when none exists, recreates a dangling junction, and initializes Windows workspaces with `core.longpaths true` so deep fixture paths can be committed.
- Every acceptance evidence record stores the mission CLI outcome (`exit_code` with stdout and stderr tails); a run that produced no observed status keeps that fact visible instead of fabricating `failed`, and its FAIL line carries the first stderr line.
- The acceptance costless wrapper resolves a `.cmd` shim to the Node entry point it wraps and spawns that directly, falling back to the Windows shell only for shims it cannot parse, so the unknown-cost route attests on Windows.
- The committed acceptance report drift check renders against an empty evidence root, so local campaign records never fail the check; `uh acceptance report` keeps rendering local evidence for humans.
- Guard hooks derive applied policies from the complete artifact and schema, preventing extra artifact metadata from breaking hook execution or dropping policy fields.
- Tool Guard resolves shell environment variable references in write and deletion targets, stopping attempts to mutate `UH_TOOL_GUARD_POLICY` or `UH_TOOL_GUARD_LOG` as `guard_tamper`, and categorizes `xd://` virtual device URIs under the `virtual_device` class.
- Team worker and salvage commits obey declared write roots and outputs, keeping files outside write roots unstaged and recording them in worker state and integration reports.
- Team workers stage declared outputs even when located under gitignored directories.
- Sandboxes index lock release verifies owner pid and nonce, preventing concurrent sandbox creation from clobbering registrations.
- Steer requests are tracked and handled by the controlling process that owns the run, avoiding dropped steer messages or unrecorded preparation failures.
- Native tool refusals without hook invocation are tracked as native refusals rather than treating the guard as disarmed.
- Supervisor matches tool-guard log evidence to runtime events by call id before falling back to call count.
- Review capture retrieves a worker's final message from team run records and captures all modified files.
- Build compilation outputs to a staging directory before atomically swapping into `dist/`, avoiding inconsistent builds on compilation errors.
- Command Code 1.62.1 exits with an uncaught `write EOF` after a single large tool result (upstream CommandCodeAI/command-code#859). Its guard hook now denies a `read_file` with no limit, or a limit above 600 lines, on any file larger than 40,000 bytes, with a reason telling the model to read in windows; the denial is logged with class `read_window`.
- ACP runs routed into a sandbox persisted no records; they now write to the project's mission directory while the agent works and diffs are captured in the sandbox.
- An acceptance entry whose mission left no run record passed when nothing mismatched; it now fails with reason `no_verdict`, a setup or run error records `runner_error` evidence and the campaign continues, every campaign ends with a SUMMARY, and `uh acceptance run` exits 1 when any capability failed.
- System One never returns a verdict over zero judged criteria, computes confidence over criterion answers only, and receives failed or blocked required checks as deterministic failures.
- `review-collect` blocks a pass only on required evidence (a contradicted claim, a failed required check or acceptance entry, an error finding) and records an inconsistent pass as needs-attention instead of throwing.
- `uh mission check` checks an independent review packet from its bound review sandbox, and names the sandbox command when none exists, instead of failing.
- Team worktrees run git with `core.longpaths=true`, refuse with a clear message when the longest tracked path cannot fit under Windows' 260-character limit, and keep git's stderr in setup errors.
- The build resolves `tsc` from the project instead of `npx`, restores the previous build when the swap fails, and restores a lone `dist.old` left by an interrupted build.
- The experience store groups each model under one canonical key while keeping the reported model and provider on each record.
- The `no_worker_commits` acceptance invariant recognised the harness's commit only by the placeholder email, so once workers committed under the repository's identity every correct run would have been flagged. It now accepts one commit per worker with the exact subject the harness writes, plus any placeholder-identity commit.
- Command Code print-mode runs now select non-interactive permissions through the harness guard (`--yolo`) and refuse ambiguous launches before spawn.
- Guarded Command Code runs now fail closed when hook invocation evidence is absent, preventing `--yolo` workers from running unguarded.
- Team integration-report paths in canonical team state now use relative forward-slash artifact paths, including cross-volume targets.
- Independent reviewers write reports to permitted workspace outputs; protected request and assessment artifacts remain controller-owned.
- Worker output declarations reject protected runtime paths before execution.
- Runtime callback failures retain diagnostic details instead of reporting only a generic controller error.
- Interrupted Claude streams retain known usage counters without treating an unfinished message as a complete total.
- Verification preserves deterministic failures when a semantic evaluator recommends a pass.

- Command Code planning now refuses print-mode launches without a guard or explicit permission mode for every configured `cli_command`, including custom executables.
- Command Code `shell_command` queue events now stop protected-root shell mutations before execution.
- Guard supervision now distinguishes a hook that ran but could not log from a hook that did not run.
- Command Code guard hooks now record every invocation and fail closed when the evidence log cannot be written.
- Repeated guarded Command Code setup now replaces the managed hook without accumulating duplicate `PreToolUse` entries.
- Git mutation detection now keys on the Git subcommand, avoiding false positives from read-only text such as `git log --grep=commit`.
- Native OMP progress is persisted before child exit, including UTF-8 and trailing-line handling. Nested assistant content and terminal errors are interpreted without treating arbitrary response IDs as authentication failures.
- Windows runtime guardians are compiled once into a per-user, source-hash cache, use extended-length paths for deep run directories, and normalize forward-slash variants before prefix detection, with atomic publication and visible per-run fallback when the cache is not writable.
- Sandboxed OMP execution publishes run facts to the host's canonical mission artifacts without promoting product changes. Cancellation settles the selected run and matching mission mirrors without overwriting newer run facts. Initial and streaming event-write failures settle writable terminal artifacts; the existing Observatory prefers an active run over a stale terminal result and rejects unsafe route metadata.
- OMP token, cache, and reported cost totals aggregate completed assistant turns without counting repeated update/end envelopes, while retaining distinct explicit message identities. Incomplete measurements remain unknown rather than appearing as complete totals.
- Product diff capture includes staged and unstaged text and applicable binary patches, leaves the Git index unchanged, and excludes generated harness bookkeeping while retaining harness configuration changes.
- Team runs publish parent and isolated worker facts to durable host artifact scopes. The existing Observatory shows active/completed teams and reported worker usage after normal worktree cleanup; the leader's verification artifact is retained with the parent run.
- Native OMP CLI interruption handles Ctrl-C (`SIGINT`) as well as `SIGTERM`, stops the owned process tree, and persists terminal cancellation facts before exit.
- Verification timeouts terminate the owned process tree on Windows rather than leaving child commands behind. OMP and verification subprocesses no longer request separate Windows console windows.
- Native OMP and Command Code process capture has a configurable combined-output byte limit (64 MiB by default). Exceeding it settles the owned tree as a failed run and retains only the admitted transcript prefix.
- Recovery accounting includes failed source attempts, preserves mixed-route costs, and leaves incomplete totals unknown. Team accounting and live controls use each worker's canonical artifact root.
- Anthropic, OpenRouter, and Hermes-proxy persist reported usage in canonical results. Runtime cost estimates carry provenance and are not presented as provider billing receipts.
- Mission verification now enforces declared output files, JSON syntax, and optional final-line completion markers. Workspace-escaping paths and missing evidence fail through the existing verification result instead of requiring a separate launcher checker.
- Command Code supports optional explicit USD pricing with cache-overlap semantics. Complete measured counters and an exact observed-model match are required; canonical receipts retain the configured rates and label the amount as an estimate.
- Mixed native OMP routes no longer inherit the last provider/model as their sole attribution. Invalid counters and numeric-overflow totals remain unknown while independently complete usage and cost measurements are retained.
- Finalized native lifecycle events now age under the existing Observatory freshness policy instead of remaining fresh indefinitely; confirmed terminal outcomes stay terminal.
- Native OMP and Command Code runs fail on mismatched or unattested assigned routes, preserve the requested route in control receipts, and refuse saved-run recovery from route-policy stops. OMP honors adapter default model/provider settings; Command Code no longer receives unconditional workspace auto-trust. Unsupported inner `worktree_mode` settings fail before launch.
- Windows canonical artifact transactions now release kernel-owned locks on controller death. Concurrent CLI updates remain serialized; legacy filesystem-lock evidence is retained rather than guessed stale or deleted.
- Hermes CLI execution and OpenSandbox command templates reuse UH's owned process runner. Windows Node entrypoints are resolved directly, POSIX templates use a native POSIX shell, and timeout settlement completes before worktree cleanup.
- Artifact publication rejects ancestor symlinks/junctions as well as linked target files, preventing a replaced run directory from redirecting writes outside the mission.
- CLI integration tests launch through Node/tsx instead of Windows-incompatible extensionless shell shims. Directory-link fixtures work without granting symbolic-link privileges.
- Independent review is emitted and collected through normal UH missions: full required-input snapshots, native fresh-session/model assignment guards, shared output validation, and hash-bound advisory assessments. Missing evidence or changed contracts cannot pass; human acceptance remains separate.
- Team runs admit workers in resource-bounded waves and block remaining admission when resources or completed cost accounting cannot support another worker.

## [0.9.0] — 2026-05-29

Milestone **"Memory & adapter matrix"** ([Linear UH-131 / UH-136 / UH-137](https://linear.app/agenticengineering-agency/team/UH/active); GitHub PRs #204–#206 / #214 / #215 / #216). Bundles everything merged to `dev` since v0.8.0: a native pay-per-token Anthropic adapter (experimental), harness-side Honcho memory operations with a per-mission opt-out, the team-run dogfood verdict/artifact fixes, and the Phase-0 DX hardening (real `uh --version`, opt-in telemetry primitive, adoption docs, curated npm allowlist, CI plugin gates).

### Added

- **Native Anthropic adapter** ([UH-136](https://linear.app/agenticengineering-agency/issue/UH-136), [#214](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/214)) — `status: experimental`. The official, ToS-clean pay-per-token path through the Anthropic Messages API, complementing the OAuth-backed `hermes-proxy` and the OMP stealth surface. API key via `ANTHROPIC_API_KEY` (env-only, never the manifest); a missing key degrades `uh adapter check anthropic` gracefully (the CI-skip signal) and makes `mission run` fail fast via a plan error. Blocked-output classification on auth / rate-limit / model-not-found / network failures. Registered as a first-class routable adapter (`anthropic`) with an optional opt-in live-smoke CI job.
- **Honcho memory operations** ([UH-137](https://linear.app/agenticengineering-agency/issue/UH-137), [#215](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/215)) — `honcho_search` / `honcho_remember` exposed as harness-side memory operations, plus a per-mission `runtime_config.honcho_memory` opt-out honored by every Honcho-aware adapter (`oh-my-pi` / `codex` / `pi` / `hermes`). Builds on the v0.6.0 enrichment + `recordMissionExchange` wiring; memory stays off by default in tests and is a silent no-op when Honcho is unconfigured. Tunable via `HONCHO_SEARCH_LIMIT` (default 8) and `HONCHO_TOOL_PREVIEW_LENGTH` (default 500).
- **DX hardening (Phase 0)** ([UH-131](https://linear.app/agenticengineering-agency/issue/UH-131), [#204](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/204) / [#205](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/205) / [#206](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/206)) — `uh --version` now reads the real version from `package.json`; an opt-in PostHog telemetry primitive (`UH_TELEMETRY`, unwired pending the [UH-135](https://linear.app/agenticengineering-agency/issue/UH-135) follow-up); adoption docs (`docs/{quickstart,configuration,runtime-targets,telemetry,troubleshooting,plugin-development}.md`); a curated npm `files:` allowlist; and CI plugin gates.

### Changed

- **UH-129 team `integration_report_path` default** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — now defaults under `.harness/missions/<id>/team/` instead of the mission root, keeping team artifacts scoped per mission.
- Pinned the Hermes plugin test dependencies for deterministic CI ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)).

### Fixed

- **UH-127 verdict reclassification** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — team runs that partially succeed are now classified `passed_partial` instead of a false `BLOCKED`.
- **UH-128 per-worker artifact bleed** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — fixed cross-worker artifact contamination in team missions; each worker's artifacts stay isolated to its own worktree.
- **UH-130 constraints-advisory warning** ([#216](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/216)) — surfaces an advisory warning when mission constraints are present but not enforced.

### Notes

- The native Anthropic adapter ships **experimental**: registered and routable, but not yet graduated to `active`. Graduation follows a live-smoke promotion record like the other adapters.
- The telemetry primitive is **unwired** — no events are emitted yet. It exists as the opt-in seam; instrumentation lands in the [UH-135](https://linear.app/agenticengineering-agency/issue/UH-135) follow-up. UH still ships no telemetry by default.
- **Deferred to v0.10.0+**: capability-declaration enforcement (manifest/mission `capabilities:` binding, warn + `--strict`); the telemetry instrumentation follow-up (UH-135).

## [0.8.0] — 2026-05-25

Milestone **"Sandbox isolation"** (GitHub milestone v0.8.0, issues #154 / #155 / #156). Promotes the `container` sandbox backend from a fail-fast stub to a real OpenSandbox-gated execution-isolation tier and graduates `oh-my-pi` to `active`.

### Added

- **`container` sandbox backend — OpenSandbox-gated execution isolation** (#155): replaces the #137 stub. `ContainerBackend` reuses `DirectoryBackend` for host-side materialization (so porcelain dirty detection + promotion are unchanged) and routes mission/verification commands through the OpenSandbox seam (`runOpenSandboxCommand` → `runOpenSandboxTemplate`). Env contract: `UH_OPENSANDBOX_ENABLED=1` + `UH_OPENSANDBOX_EXEC_COMMAND` (must contain `{command}`; optional `{cwd}`, `{image}`, `{timeout_ms}` placeholders); optional `UH_OPENSANDBOX_CREATE_COMMAND`, `UH_OPENSANDBOX_DELETE_COMMAND`, `UH_OPENSANDBOX_IMAGE` (default `python:3.12`), `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` (positive int ms, default 30000). Mock mode (`UH_OPENSANDBOX_MODE=mock`) for CI / dirty-roundtrip tests. Local smoke + claim-boundary table: [`docs/runbooks/container-sandbox.md`](docs/runbooks/container-sandbox.md). ADR: [`docs/architecture/sandbox-backends.md`](docs/architecture/sandbox-backends.md) (includes #154 spike + #157 lifecycle hardening sections).
- **`oh-my-pi` graduated to `status: active`** (#156): after the ToS posture documented in [`docs/runbooks/anthropic-via-omp.md`](docs/runbooks/anthropic-via-omp.md) and an `uh adapter check oh-my-pi` PASS against `omp/15.2.4`. The adapter manifest, scaffold template (`uh adapter add oh-my-pi`), README adapter table + capability summary, ROADMAP, and the docs-site mirror all reflect `active`. Mirrors the v0.7.0 vanilla `pi` graduation — same surface, same posture, same opt-in responsibility model. The runbook gained a dated v0.8.0 graduation subsection; the ToS-clean alternative (native `ANTHROPIC_API_KEY` adapter) is still planned for v0.9.0.

### Changed

- `runOpenSandboxTemplate` spawns commands in the sandbox-bound `cwd` (the host worktree) rather than `process.cwd()` so `verify` / create / delete templates with relative paths resolve against the sandbox (#157).
- `ContainerBackend.teardown` runs `UH_OPENSANDBOX_DELETE_COMMAND` unconditionally when configured; forced / orphan discards spawn from `ctx.root` when the worktree has already been removed so external sandbox resources cannot leak (#157).
- Lifecycle timeouts are configurable via `UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS` (positive int ms, default 30000), with fail-fast validation surfacing the variable name on bad input (#157).

### Notes

- **No fallback to a lean in-house OCI/docker-CLI backend is authorized by this release** — the ADR pivot rule stands. The container path is OpenSandbox-only unless the lead approves a pivot.
- **CI does not exercise live container execution** — Depot runners have no container runtime. The OpenSandbox mock mode covers schema + lifecycle plumbing in CI; live evidence is in [`docs/runbooks/container-sandbox.md`](docs/runbooks/container-sandbox.md).
- **macOS isolation reality** — on macOS the boundary is the host's Linux VM (Docker Desktop / OrbStack / Colima). Firecracker / KVM / gVisor / Kata claims require a Linux host with a configured secure runtime, per the ADR per-OS table.
- **Deferred to v0.9.0+**: AgentFS as a filesystem backend (FS-only, not execution); native Anthropic adapter; Honcho MCP tools + opt-out; capability-declaration enforcement (`--strict`).

## [0.7.0] — 2026-05-24

Milestone **"Adapter expansion & sandbox backends"** (GitHub issues #133–#141 under the `v0.7.0` milestone; Linear UH-112–UH-121 — backfilled when the Linear workspace was upgraded post-release). Builds on v0.6.0's cost-aware routing by adding cheaper routing targets and broader sandbox isolation.

### Added

- **OpenRouter adapter** (#134) — OpenAI-compat HTTP client for openrouter.ai, the cheapest pay-per-token routing target. API key via `OPENROUTER_API_KEY` (never stored in the manifest); a missing key degrades `uh adapter check openrouter` gracefully (the CI-skip signal) and makes `mission run` fail fast via a plan error. Optional HTTP-Referer / X-Title ranking headers. Registered as a first-class routable adapter (auto-route, capabilities, `uh adapter add openrouter`).
- **Vanilla `pi` adapter** (#135, #150) — the base pi agent CLI that oh-my-pi (`omp`) extends; CLI-exec (`pi --print --mode json --no-session`), `config.cli_command` overridable. Registered active (TEAM_ADAPTER_IDS, capabilities, `uh adapter add pi`). Flag surface + output parsing verified against live `pi` v0.73.1 (#150 fixed the parser to read pi's `message_end`/content-block shape).
- **Sandbox backend abstraction + `directory` backend** (#136) — a `SandboxBackend` interface behind `uh sandbox create --backend <git-worktree|directory>`. The `directory` backend is a self-contained local clone (hard-linked objects) that does not register with the parent repo's worktree list or branch namespace.
- **`container` sandbox backend** (#137) — registered as a fail-fast stub with an ADR ([`docs/architecture/sandbox-backends.md`](docs/architecture/sandbox-backends.md)); the implementation is deferred pending a container runtime in CI.
- **Verify-then-promote auto-trigger** (#139) — opt-in `sandbox.promotion_policy: auto-on-verify`; a passed `uh verify` auto-promotes. The default `human-approved` still requires a manual `uh mission promote`; a typo'd policy never auto-promotes.
- **OpenRouter setup runbook** plus ROADMAP / README adapter-table updates (#140).

### Changed

- Extracted the mission-artifact helper block (path-safety guards + prompt/session/event writers) duplicated across `hermes` / `codex` / `oh-my-pi` / `hermes-proxy` into a single `src/adapters/_artifact-context.ts` (#133). Pure, behaviour-neutral refactor.

### Notes

- **Capability-match enforcement** (#138) was found already implemented (`enforceRuntimePreflight` → `assertRuntimeRequirements`, with a `--force` escape hatch) and was closed as evidence-ready; the ROADMAP "advisory-only" note was stale.
- **Deferred:** `oh-my-pi` graduation to `active` (ToS posture) — tracked on the road-to-1.0. (The vanilla `pi` adapter shipped in this release; see Added.)

## [0.6.0] — 2026-05-23

Epic 7 (adapter capability routing + cost) and Epic 8 (SDD hardening) completed, plus a suite-health pass and CI/release hygiene. Several v0.5.0 gaps were corrected: the UH-101 auto-router (claimed shipped but absent) was implemented, and token-usage capture (assumed by the cost features) was added.

### Added

- **Honcho memory for `codex` + `hermes`** ([UH-59](https://linear.app/agenticengineering-agency/issue/UH-59) follow-up): both adapters now enrich the dispatched prompt with persistent memory and record the exchange after a run (mirroring `oh-my-pi`); env-gated and a no-op when Honcho is disabled. Adds `basePrompt` to their run plans.
- **Spec-adherence judge** (Epic 8 / [UH-110](https://linear.app/agenticengineering-agency/issue/UH-110)): `uh validate --judge --spec <path>` grades whether the diff (`<base>...HEAD`) satisfies a spec's acceptance criteria via an LLM, returning a structured `{adherence, missing_ac, evidence}` verdict (exit 1 on `fail`). Opt-in; dispatches a one-shot through a configured hermes-proxy runtime. New `src/harness/spec-judge.ts` (pure prompt/verdict, injectable runner).
- **Spec template library** (Epic 8 / [UH-111](https://linear.app/agenticengineering-agency/issue/UH-111)): `uh spec template [feature|epic] [--out <path>] [--list]` emits starter `uh.spec.v0` documents. Templates are source-of-truth TS constants (ship in the package) mirrored to `docs/specs/templates/`, with a drift-guard test. New `src/harness/spec-templates.ts`.
- **Running-now grid** (Epic 6 / [UH-97](https://linear.app/agenticengineering-agency/issue/UH-97)): `GET /api/uh/runs/active` scans each mission's `latest.json` for in-flight runs; the dashboard Overview shows a "Running now (N)" card (auto-hidden when idle) linking into each live run.
- **Per-run cost gauge** (Epic 6 / [UH-96](https://linear.app/agenticengineering-agency/issue/UH-96)): the dashboard `LiveEventsPane` header shows live token totals (↑input ↓output) and estimated USD, aggregated from `runtime.usage` events. `$/Mtok` rates are sourced from the harness via `GET /api/uh/adapters/capabilities` (new `cost_classes` field) — no duplicated rate constants in the frontend. New `apps/hermes-plugin/dashboard/src/cost-gauge.ts`.
- **hermes-proxy live capability probe** (Epic 7 / [UH-103](https://linear.app/agenticengineering-agency/issue/UH-103)): `uh adapter capabilities --probe` fetches `<endpoint>/capabilities` and merges a (partial) capability document over the static manifest, falling back to static on 404/error/malformed. Forward-looking — proxies don't serve this yet, so it's a safe no-op today. New `src/adapters/capabilities/hermes-proxy-probe.ts`.
- **Cost forecast** (Epic 7 / [UH-104](https://linear.app/agenticengineering-agency/issue/UH-104)): `uh adapter cost-forecast --mission <id> [--adapter auto|<id>]` averages a mission's past-run `runtime.usage` tokens (heuristic fallback when no history) and prices them by the adapter's cost class. New `uh adapter capabilities --json`. Plugin endpoints `GET /api/uh/adapters/capabilities` + `POST /api/uh/missions/{id}/cost-forecast` shell the CLI so cost math stays single-sourced. New `src/harness/cost-forecast.ts`.
- **Token-usage capture**: adapters now emit a `runtime.usage` event per run (prerequisite for cost-forecast + the dashboard cost gauge). hermes-proxy records **real** tokens from the OpenAI-style `usage` field; codex / hermes / oh-my-pi emit a deterministic estimate (chars/4) tagged `source: "estimated"`. New `src/harness/usage.ts`.
- **Adapter auto-routing** (Epic 7 / [UH-101](https://linear.app/agenticengineering-agency/issue/UH-101)): `uh mission run --auto` selects the cheapest installed adapter whose capability manifest satisfies the mission's `runtime_requirements`; `--auto --explain` prints the decision matrix. New `src/harness/auto-route.ts` (`chooseAdapter`), reusing `evaluateAdapterEligibility` (UH-102) and `compareCostClass`. Closes a gap where v0.5.0 listed UH-101 as shipped but the routing code was never landed.

### Fixed

- `Publish package` workflow re-ran on every push to `main`, failing with `403 cannot publish over the previously published versions`; now gated to `v*` tags / releases / manual dispatch with an idempotency guard that skips when the version already exists ([UH-91](https://linear.app/agenticengineering-agency/issue/UH-91), [#112](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/112)). npm publish was never actually blocked — 0.3.0/0.4.0/0.5.0 are all live.

### Changed

- Test suite is hermetic and deterministic ([#113](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/113)): Honcho memory forced off by default in tests (the suite was hitting the live Honcho API via a developer's `HONCHO_API_KEY`), wall-clock assertions gated behind `UH_PERF=1`, and generous timeouts for real-subprocess tests.

## [0.5.0] — 2026-05-20

Epics 6–8 integrated on `dev` from feature branches (live observability, adapter auto-routing, SDD hardening). Execution spec: [`specs/epics-6-7-8.md`](specs/epics-6-7-8.md).

### Added

**Epic 6 — Hermes plugin live runs & observability**

- Disk-backed SSE endpoint tailing per-run `events.ndjson` with keepalive and byte-offset resume ([UH-93](https://linear.app/agenticengineering-agency/issue/UH-93)).
- `LiveEventsPane` in mission drilldown reusing run-modal tail patterns ([UH-94](https://linear.app/agenticengineering-agency/issue/UH-94)).
- Cancel running mission by `run_id` from drilldown, Run modal, and `uh mission cancel` CLI ([UH-95](https://linear.app/agenticengineering-agency/issue/UH-95)).
- Runbook: [`docs/runbooks/plugin-live-events-smoke.md`](docs/runbooks/plugin-live-events-smoke.md).

**Epic 7 — Adapter capability matrix & runtime auto-routing**

- `AdapterCapabilities` Zod schema and per-adapter manifests (`hermes`, `hermes-proxy`, `codex`, `oh-my-pi`) ([UH-100](https://linear.app/agenticengineering-agency/issue/UH-100)).
- `chooseAdapter` + `uh mission run --auto` routing by mission `runtime_requirements` and installed adapters ([UH-101](https://linear.app/agenticengineering-agency/issue/UH-101)).
- Preflight validator enforcing `runtime_requirements` separately from mission `capabilities` ([UH-102](https://linear.app/agenticengineering-agency/issue/UH-102)).
- Static cost-class table for routing hints ([`src/harness/cost-table.ts`](src/harness/cost-table.ts)).

**Epic 8 — Spec-Driven Development hardening**

- Spec loader + `uh propose --from <spec.md>` mission bootstrap ([UH-107](https://linear.app/agenticengineering-agency/issue/UH-107)).
- `uh spec scaffold` — acceptance-criteria → Vitest `it.todo` scaffold generator ([UH-108](https://linear.app/agenticengineering-agency/issue/UH-108)).
- `spec-stale` validate-drift kind + `--strict-spec` CLI flag ([UH-109](https://linear.app/agenticengineering-agency/issue/UH-109)).

### Changed

- Hermes plugin bundle ships at **43.4 KB** (50 KB cap). Plugin manifest version **0.5.0**.

### Known follow-ups

- [UH-91](https://linear.app/agenticengineering-agency/issue/UH-91) — npm publish workflow fix landed in v0.6.0 (#112, idempotency guard + `v*` tag gate); npm `latest` has been current through v0.6.0 / v0.7.0 / v0.8.0.
- Linear epics UH-92 (Epic 6) / UH-99 (Epic 7) / UH-106 (Epic 8) and the child issues UH-93–UH-97 / UH-100–UH-104 / UH-107–UH-111 were backfilled to Linear when the workspace was upgraded post-release; previously this block noted they were "not filed via MCP during this cut".
- Later/Optional slices UH-98 + UH-105 were canceled (no operator gap surfaced) and recorded in Linear as such; UH-110 / UH-111 shipped in v0.6.0.

## [0.4.0] — 2026-05-20

### Fixed

- `runtime.cancelled` event handler now emits a single-line stderr warning when no `latest.json` pointer exists (instead of silently skipping). Quiet via `UH_QUIET_CANCEL=1` for tests. Closes the operator-visibility gap left open by UH-82.

### Added

- Run history retention policy: plugin manifest `max_runs_per_mission` cap (default null = unlimited). Oldest per-run dirs are pruned on each new run; `runs/index.json` entries persist with `archived: true` so the audit trail is preserved ([UH-90](https://linear.app/agenticengineering-agency/issue/UH-90)).
- New `orphaned-run-dir` drift kind for `uh validate --repair`: detects `.harness/missions/<id>/runs/<run_id>/` directories that have no corresponding entry in `runs/index.json` (idempotent `rm -rf` repair). Closes a UH-82 follow-up.
- `uh mission run --runtime-config-overrides <json>` flag merges JSON-encoded overrides on top of the mission's `runtime_config_overrides` block. The Hermes plugin Run modal now passes user-supplied overrides through ([UH-81](https://linear.app/agenticengineering-agency/issue/UH-81)).
- Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/` with a `latest.json` pointer and append-only `runs/index.json` history. Concurrent runs of the same mission no longer interleave; the Hermes plugin's per-run route now serves the correct run ([UH-82](https://linear.app/agenticengineering-agency/issue/UH-82)).
- Recent runs pane on the Hermes Dashboard Mission detail tab with sortable columns, status-chip filtering, and run-id prefix search. Click a row to drill into that run's artifacts ([UH-85](https://linear.app/agenticengineering-agency/issue/UH-85), [UH-86](https://linear.app/agenticengineering-agency/issue/UH-86), [UH-88](https://linear.app/agenticengineering-agency/issue/UH-88)).
- `UH_TUI_THEME=dark|light|system` palette switch with full `src/tui/theme.ts` palette module ([UH-48](https://linear.app/agenticengineering-agency/issue/UH-48)).
- Ctrl+Z / `fg` suspend-resume lifecycle in the TUI, backed by OpenTUI 0.2.13's `renderer.suspend()` / `renderer.resume()` ([UH-50](https://linear.app/agenticengineering-agency/issue/UH-50)).
- `uh tui screenshot --view <name> --out <path>` automated capture pipeline with `overview` / `missions` / `sandboxes` / `workflows` views ([UH-51](https://linear.app/agenticengineering-agency/issue/UH-51)).
- `e` opens the current mission manifest in `$EDITOR` from the TUI mission detail view, suspending and resuming the renderer cleanly ([UH-49](https://linear.app/agenticengineering-agency/issue/UH-49)).
- Compare two runs side-by-side: new `MissionCompare` view with runtime-result field diff, prompt.md line diff (LCS-based, no new dep), and events.ndjson side-by-side stream. Triggered via "Compare" mode on the Recent runs pane ([UH-89](https://linear.app/agenticengineering-agency/issue/UH-89)).
- Replay a historical run: "Replay" button on Recent runs rows + per-run drilldown opens the Run modal pre-filled with the source run's `runtime_config_overrides`; `runs/index.json` carries the `replay_of` lineage ([UH-87](https://linear.app/agenticengineering-agency/issue/UH-87)).

### Changed

- `uh mission run` now accepts `--run-id <id>` for deterministic per-run artifact paths; the Hermes plugin passes the id it generates so dashboard, CLI, and on-disk artifacts all agree. The previous 409 `run_already_active` guard is gone — per-run directories make concurrent same-mission runs safe.
- `RunHermesResult` / `RunCodexResult` / `RunOhMyPiResult` / hermes-proxy `RunResult` now carry the `runId` of the directory they wrote.
- `runtime-result.yaml` is still mirrored to the mission root after each run, so `uh status`, validate-drift, and the dashboard's `last_run` field keep working without learning per-run paths.

## [0.3.0] — 2026-05-20

Two epics shipped end-to-end plus a deep discipline-layer pass distilled from [GSD-2](https://github.com/gsd-build/gsd-2) research. 26+ correctness findings caught and fixed under [Codex](https://github.com/apps/chatgpt-codex-connector) adversarial review across 13 rounds on the Hermes plugin alone.

### Added

- **Epic 3 — Hermes Dashboard plugin** ([UH-60](https://linear.app/agenticengineering-agency/issue/UH-60), [#89](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89))
  - Drop-in Hermes plugin at `apps/hermes-plugin/` exposing UH from the Hermes web UI: adapter health, mission browser, run trigger with SSE live tail, prompt/final-message/diff/runtime-result drilldown, workflow + verification viewers, theme YAML, sessions cross-link, first-run wizard, install runbook (UH-61..UH-69).
  - FastAPI bridge that shells out to the `uh` CLI; no daemon, no FFI, no Hermes fork. Watchdog enforces `UH_RUN_TIMEOUT_S`. Solid bundle ships at 25.5 KB (50 KB cap).
- **Epic 4 — Team mission shape** ([UH-70](https://linear.app/agenticengineering-agency/issue/UH-70), [#87](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/87) + [#88](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/88) + [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90))
  - New `team` mission shape with adapter-bound workers, per-worker worktree auto-isolation, leader integrator role, `integration-report.md` artifact (UH-71/72).
  - New workflow profiles: `staged` (`plan → prd → exec → verify → fix`) and `adversarial-qa` (OMX `$ultraqa` analog) with `gate-6-no-leaked-artifacts` fail-closed gate (UH-73/74).
  - Companion `design.md` artifact alongside `mission.yaml` (UH-75).
  - Three-state `MergeOutcome` (`clean | conflicted | failed`) and `writeIntegrationReport` verdict propagation.
- **Discipline layer from GSD-2 research** ([#88](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/88))
  - Three-verdict runtime-result status (`pass / needs-attention / needs-remediation`) plus `uh mission verdict` manual override (UH-76).
  - `uh validate` drift detection + idempotent repair registry: orphaned worktree, stale render, stale worker, truncated `events.ndjson`, missing completion timestamp, ROADMAP↔Linear divergence (UH-77).
  - `uh status --json` LLM-less query mode feeding the Hermes Dashboard (UH-78).
  - Canonical `docs/VISION.md` with explicit "what we won't accept" (UH-79).
  - Pre-inlined dispatch context contract formalized across all four adapters (UH-80).
- **Honcho persistent-memory extension** ([UH-59](https://linear.app/agenticengineering-agency/issue/UH-59), [#83](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/83)) — env-driven enrich/record at the harness layer for `oh-my-pi`, with fail-fast misconfig and graceful network degradation.

### Changed

- `mission run` now writes `events.ndjson`, `runtime-result.yaml`, `final-message.md`, and (for team missions) `integration-report.md` under `.harness/missions/<id>/`; per-run subdirectories are a follow-up ([UH-82](https://linear.app/agenticengineering-agency/issue/UH-82)).
- All adapters (`hermes`, `hermes-proxy`, `codex`, `oh-my-pi`) now consume a single pre-inlined dispatch-context contract (UH-80), removing per-adapter prompt drift.

### Fixed

- Codex adversarial review on PR #89 caught and fixed 26+ correctness issues before merge: SSE drain races, cancel-vs-natural-exit races, watchdog leaks, path traversal, symlink artifact disclosure, `_active_runs` unbounded growth, started-byte-offset capture order, `get_mission` blast radius on corrupt YAML, `runId` sanitization, concurrent-run guard (409), `is_run_scoped` mislabeling, `decodeURIComponent` crash on malformed hash, and more. Detail: [PR #89 conversation](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/89).
- PR #87 Codex pass caught the team-mission `MergeOutcome.failed` propagation gap; fixed in [#90](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/90).

### Known follow-ups (filed)

- [UH-81](https://linear.app/agenticengineering-agency/issue/UH-81) — Real `--runtime-config-overrides` CLI support. The Hermes plugin's Run modal currently 400-rejects non-empty overrides (`overrides_not_yet_supported`).
- [UH-82](https://linear.app/agenticengineering-agency/issue/UH-82) — Per-run artifact directories under `.harness/missions/<id>/runs/<run_id>/`. The plugin's per-run route surfaces `is_run_scoped: false` + banner.
- [UH-83](https://linear.app/agenticengineering-agency/issue/UH-83) — Activate `.github/workflows/release-plugin.yml` (staged at `docs/ci/release-plugin.yml.example`).

## [0.2.0] — 2026-05-19

### Added

- **Epic 1 — Hermes proxy adapter** ([UH-32](https://linear.app/agenticengineering-agency/issue/UH-32)) promoted to `status: active` after live E2E smoke against `hermes proxy start --provider nous` ([#49](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/49)..[#55](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/55)).
- **Epic 2 — Interactive TUI** ([UH-41](https://linear.app/agenticengineering-agency/issue/UH-41)) on OpenTUI (Solid bindings, Bun preload): dashboard, mission browser, run flow, adapter+sandbox manager, keymap overlay, per-project persistence ([#52](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/52), [#57](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/57), [#59](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/59), [#61](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61), [#63](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/63), [#64](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/64), [#65](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/65)).
- Spec-Driven Development discipline ([UH-54](https://linear.app/agenticengineering-agency/issue/UH-54), [#68](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/68)) — structured `acceptance_criteria` with per-AC verify.
- Test-Driven Development discipline ([UH-55](https://linear.app/agenticengineering-agency/issue/UH-55), [#69](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/69)) — `tdd` workflow profile + test-first verify gate.
- Cross-runtime QA harness ([UH-56](https://linear.app/agenticengineering-agency/issue/UH-56), [#70](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/70)) — `uh mission run-all` with side-by-side adapter comparison.
- Runtime intelligence + operator polish ([UH-57](https://linear.app/agenticengineering-agency/issue/UH-57), [#77](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/77)) — TUI screenshot capture, adapter-check age footer, `runtime.cancelled` event, mission capability enforcement.
- Package rename + CI publish ([UH-58](https://linear.app/agenticengineering-agency/issue/UH-58), [#79](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/79)) — `@agenticengineeringagency/ultimate-harness` with `publishConfig.access=public`, dry-run + release-publish workflow.

## [0.1.0] — 2026-05-17

Initial public release. Adapter framework (`hermes`, `codex`, `oh-my-pi`), mission schema, runtime-result artifact contract, verification + promotion pipeline.

[0.6.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/tag/v0.1.0
