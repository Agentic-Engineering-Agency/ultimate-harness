# Tool Guard

The tool guard is a per-tool-call contract boundary. It is path-only and content-blind: it classifies the requested tool and command, resolves target paths, and compares those paths with the configured write roots and protected roots. It does not inspect file contents, diff bodies, replacement text, or report text. Shell command text is parsed only to identify commands, arguments, redirections, wrappers, and target paths; this is not content matching.

A denial reason names a permitted substitute action where one exists. The runtime appends its own blocked-by-hook text in some integrations; the guard's reason itself ends with the following instruction:

> Do not retry this by another route; record it in your final message and continue with the rest of the task.

## Policy fields and defaults

The input `guard` block accepts these fields. Unknown fields are rejected by the strict schema.

| Field | Meaning | Resolved default |
|---|---|---|
| `write_roots` | Relative or absolute roots where write and delete targets are allowed. | `["."]` |
| `deny_git_mutations` | Deny shell commands that mutate Git state. | `true` |
| `deny_package_installs` | Deny package-manager install or add commands. | `true` |
| `deny_network_clients` | Deny network clients. Agent-client denial does not depend on this field. | `true`, unless `runtime_requirements.needs_network` is true and the field is not explicitly set |
| `agent_clients` | Executable names treated as agent clients. Always enforced, including when `needs_network` lifts network denial. An explicit empty list is the only opt-out. | `["omp", "cmdc", "codex", "pi", "hermes", "aider", "gemini", "claude", "opencode", "qwen", "goose", "cursor-agent"]` |
| `allow_native_subagents` | Lets the runtime use its own sub-agent tool (`task`, `agent`, ...). Agent CLIs and UH runs stay denied. Every delegated agent is still held to the assigned route: a different provider or model stops the run with `route_mismatch`. | `false` |

The mission and each `team.workers[]` entry may declare `guard`. The mission schema resolves a mission guard through `resolveToolGuardPolicy`; a worker guard is accepted as the worker's per-worker input contract. The default protected roots are separate from `write_roots`: `[".harness", ".commandcode", ".omp", ".pi", ".git"]`. Runtime limits may supply an effective `protected_paths` list for supervisor evaluation; the run artifact records that list.

When `needs_network: true`, the resolver changes the default only for `deny_network_clients`; the other defaults remain unchanged. An explicit `guard.deny_network_clients` value takes precedence.

## Denial classes and exact reason text

Every reason below includes the common suffix quoted above. The `<roots>`, `<target>`, and `<path>` values are substituted by the decision function where shown.

| Class | Trigger | Exact guard reason |
|---|---|---|
| `write_outside` | A write-class tool or shell write target is outside `write_roots`. | `CONTRACT: write only under <roots>. Put the file under <first write root> instead. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `git_mutation` | A shell command contains a Git mutation verb such as `commit`, `checkout`, `stash`, `reset`, `add`, `merge`, `rebase`, `push`, `switch`, `restore`, or `clean`, when enabled. | `CONTRACT: no git mutations; the harness commits for you. Use read-only git (status, diff, log) or skip it. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `delete_outside` | A direct delete tool or shell delete targets outside `write_roots`, or a delete target cannot be resolved. | `CONTRACT: deletes and process kills only inside <roots>. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `kill_or_format` | The shell command contains `taskkill`, `stop-process`, `kill -9`, or `format <drive>:`. | `CONTRACT: deletes and process kills only inside <roots>. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `package_install` | A shell command invokes `pip`, `pip3`, `uv`, `conda`, `npm`, `pnpm`, or `yarn` with `install`, `add`, or `i`, when enabled. | `CONTRACT: no package installs. Use what is installed; if a dependency is missing, end with BLOCKED: <dependency>. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `network_client` | A shell command invokes `curl`, `wget`, `invoke-webrequest`, `iwr`, `invoke-restmethod`, or `irm`, when network denial is enabled. | `CONTRACT: no network or agent clients. Everything you need is on disk; if it is not, end with BLOCKED: <what is missing>. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `agent_client` | A shell command would start one of the configured `agent_clients`, or a UH command that starts paid runtimes (`uh mission run`, `run-all`, `run-team`, `uh acceptance run`, or the same through `node`/`bun` and `dist/cli.js`). Executable positions are judged: segment heads, launcher targets (`npx`, `bunx`, `pnpm dlx`, `env`, `xargs`, `&`), nested shell bodies and command substitutions, with `.exe`/`.cmd`/`.bat`/`.ps1` and directory prefixes ignored. A client name used as an argument, search pattern or path is not an invocation The native sub-agent tools `task`, `agent`, `subagent`, `spawn_agent`, `dispatch_agent` and `delegate` are denied by tool name for every role. | `CONTRACT: no sub-agents. Workers do not start agents, agent CLIs or harness runs. Do the work yourself; if part of it exceeds your scope, end with ESCALATE: <what your orchestrator should delegate>. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `guard_tamper` | A write, delete, copy, move, or redirection targets the configured guard policy or log, or an absolute target contains a `.harness`, `.commandcode`, `.omp`, or `.pi` path segment. | `CONTRACT: the harness policy and its state are not yours to change. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `protected_root` | A write-class tool or shell mutation targets a protected root. | `CONTRACT: <protected root> belongs to the harness and is read-only. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `containment_escape` | A shell command would launch a process outside the supervised Windows Job Object or POSIX process group: `wmic process call create`; `Invoke-CimMethod` or `Invoke-WmiMethod` naming `Win32_Process` and `Create`; the `[wmiclass] Win32_Process` `Create` form; `schtasks /create` or `/run`, `Register-ScheduledTask`, `Start-ScheduledTask`; `sc`/`sc.exe` with `create` or `start`, `New-Service`, `Start-Service`; `setsid`, `systemd-run`, `disown`, `at`, `batch`, `crontab` (except `crontab -l`); or `nohup` when its segment is followed by the background operator `&`. Executable positions are judged the same way agent clients are (segment heads, launcher targets, nested shell bodies, command substitutions, `.exe`/`.cmd` suffixes ignored); a name used as an argument, search pattern or path is not an invocation. Applies to every role and every policy: no guard field lifts it. | `CONTRACT: no launches outside the supervised process tree. Run the work in the foreground of this run instead. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `virtual_device` | A write, delete, or redirection target is an OMP virtual device whose URI scheme is `xd:` (for example `xd://lsp` or `xd://report_issue`). It is a denial in its own right, not a path class: reports that group by guard class keep it separate from `write_outside` and `delete_outside`. | `CONTRACT: virtual devices are not available in this run. Do not retry this by another route; record it in your final message and continue with the rest of the task.` |
| `guard_unavailable` | The guard cannot produce a decision: the policy is missing, unreadable or invalid, the call is invalid, the decision threw, or the audit log could not be written. | A short runtime-agnostic refusal naming the failure, for example `UH tool guard policy is not configured; refusing the tool call`. |

`guard_tamper` is checked before other mutation classes and is a hard policy stop. Otherwise the `protected_root` class is produced before the write/delete class when a target is under a protected root. Reads are not denied by the guard merely because their path is protected. Direct write-class tools include `write_file`, `edit_file`, `notebook_edit`, `multi_edit`, `write`, `edit`, `create_file`, `apply_patch`, `delete_file`, `remove`, and `move_file`. Shell tools include `bash`, `shell`, `shell_command`, `powershell`, `pwsh`, `cmd`, and `run_command` in the guard classifier.

Virtual devices are denied before path resolution because an `xd:` URI has no filesystem path; a target is a virtual device whenever its scheme is `xd:`, independent of any write root or protected root.

## Shell classification
For shell tools, the guard examines each command segment split at `&&`, `||`, `|`, `;`, `&`, `{`, and `}` outside quotes. It unwraps `powershell`, `pwsh`, `cmd`, and `bash` command bodies passed with `-Command`, `-c`, `/c`, `/k`, or `-EncodedCommand` where the body can be read. It recognizes quoted tokens, literal variable assignments, and variable substitution for target resolution. Within one command string it also resolves a simple assignment of a literal string, or of an environment reference to `UH_TOOL_GUARD_POLICY` or `UH_TOOL_GUARD_LOG` (`$p=$env:UH_TOOL_GUARD_POLICY; Set-Content $p x`, `p=$UH_TOOL_GUARD_POLICY; echo x > "$p"`), and a bare `$env:UH_TOOL_GUARD_POLICY`, `$UH_TOOL_GUARD_POLICY`, or `%UH_TOOL_GUARD_POLICY%` target resolves the same way; the resolved path is then judged by the normal target checks, so writing through it is `guard_tamper`. Any variable the guard cannot resolve keeps the conservative `write_outside` result — `$d=$env:TEMP; cd $d; Set-Content a.txt y` is still `write_outside` — and reads are unaffected. A leading `cd`, `chdir`, `pushd`, `Set-Location`, `sl`, or `Push-Location` changes the effective directory for later segments; `popd` and `Pop-Location` restore it. The initial directory may also come from the tool input's `cwd`, `workdir`, or `directory` field.

Write targets include destinations of `copy`, `cp`, `move`, `mv`, `xcopy`, `robocopy`, `copy-item`, and `move-item`; shell redirection targets after `>` and `>>`; and PowerShell-style `out-file`, `set-content`, `add-content`, `tee`, and `tee-object`. Delete targets include `remove-item`, `ri`, `rm`, `rmdir`, `rd`, `del`, and `erase`, including pipeline-derived targets. Null redirection targets such as `nul`, `null`, `/dev/null`, `$null`, `&1`, `&2`, `con`, and `prn` are ignored. A delete whose target cannot be resolved is denied conservatively.
Paths are normalized before comparison. Relative paths resolve against the effective directory, which starts at `worker_root` unless the tool input supplies an explicit directory and changes as the command runs. An unresolvable directory change makes later write, delete, copy, and redirection targets unresolved and therefore denied as `write_outside`; read-only commands remain allowed. Absolute paths are normalized and compared directly. The guard compares path boundaries, so a sibling whose name merely starts with a configured root does not match. No target file needs to exist for a denial.

## Runtime enforcement seams

| Runtime | Enforcement | Configuration seam |
|---|---|---|
| `oh-my-pi` | `src/extensions/tool-guard/omp.ts` registers the `tool_call` callback. A denied decision is logged and returned as `{ block: true, reason }`. | `planOhMyPiRun` adds the extension with `-e` when `mission.guard` is present. |
| `command-code` | `src/extensions/tool-guard/cmdc-hook.ts` reads one JSON request from stdin. A denied decision is logged and returned as a `PreToolUse` `permissionDecision: "deny"` response. | The adapter merges a command hook into `.commandcode/settings.json` under `hooks.PreToolUse`, writes `.commandcode/.gitignore` containing `*`, and passes the policy and log paths through environment variables. |

Command Code runs in print mode, where no operator can answer a permission prompt. When a guard policy is present, UH resolves `permission_mode: "guard"`, appends `--yolo`, and leaves all authorization to the `PreToolUse` hook and this guard. A mission may instead set `runtime_config.permission_mode: "yolo"` explicitly; this also appends `--yolo` without installing a guard. With neither a guard nor an explicit permission mode, planning refuses before process spawn for every `cli_command`, including custom commands. The durable `runtime-control.json` receipt records `permission_mode` as `guard`, `yolo`, or explicit `prompt`.

For guarded Command Code runs, the hook appends one `tool-guard.log` line for every hook invocation, including allowed calls (`class: "allow"`). Every tool call the runtime actually executed and completed must have matching guard-log evidence: where the log lines carry call ids, the supervisor matches evidence for a call by its `call_id` alone, ignoring tool name and target; where no line carries a call id, as with an older hook, it falls back to comparing the number of log lines with the number of executed completed calls. Native refusals are excluded from that comparison because no hook ran for them, so they can never make a fully-evidenced run look short. A guarded run records `guard_armed: true` once the first completed call has matching evidence, and it stays armed unless a later executed completed call has none. A native tool refusal (see below) never affects `guard_armed`.

The logged call id is the runtime's own tool-use identifier, so it is the same value the supervisor reads on native tool events. Command Code sends `tool_use_id` on the `PreToolUse` hook request (measured on a recorded run), and Claude Code documents `tool_use_id` in its `PreToolUse` input; both equal the native call ids. Each hook writes that value to the log as `call_id`, accepting `tool_call_id` or `toolCallId` as fallback spellings, and omits the key when the runtime supplied no id.

Both seams load the policy from `UH_TOOL_GUARD_POLICY` and write denials to `UH_TOOL_GUARD_LOG`. The guard is an enforcement seam, not an operating-system sandbox; an unmanaged process that bypasses the runtime event or hook seam is outside this mechanism.

### One fail-closed core, applied by thin wrappers

All three seams share `src/extensions/tool-guard/core.ts`. A wrapper normalizes its runtime's tool call to `{ tool, input, call_id }`, calls the core, and translates the verdict back to its own protocol: Command Code and Claude Code emit a `PreToolUse` `permissionDecision: "deny"`, and oh-my-pi returns `{ block: true, reason }`. Every wrapper has a top-level handler that denies on any error, so an uncaught throw can never be read as an allow. The core itself returns `deny` for every failure — missing configuration, an unreadable or invalid policy, an invalid call, an exception while deciding, and an unwritable audit log — and appends one log line for every decision, allow or deny, with `ts`, `call_id`, `tool`, `class`, `target`, and `reason`.

### Pre-launch arming check

A guard that silently stopped enforcing would otherwise only surface after a tool call had executed. Before the runtime is spawned, each adapter runs `src/harness/guard-arming.ts` against the run's own `tool-guard.json` with two synthetic calls — a read inside `worker_root` and a write outside every write root — logging to a separate `tool-guard.arm.log` so the run's `tool-guard.log` stays untouched. For Command Code and Claude Code the adapter runs the runtime's real hook command; for oh-my-pi it loads the extension module and calls its `tool_call` handler with a stub. Arming requires the read to be allowed and logged, and the write to be denied and logged. On any mismatch the run settles before launch with `stop_code: policy` and a stop reason naming the failed expectation, and the runtime is never spawned.

## Run artifacts

When a guard is active, each native adapter writes both artifacts in the run directory:

`.harness/missions/<mission>/runs/<run_id>/tool-guard.json` conforms to `ToolGuardArtifactSchema`:

| Field | Type / value |
|---|---|
| `schema_version` | Literal `uh.tool-guard.v0`. |
| `worker_root` | Non-empty string containing the runtime worktree root. |
| `protected_paths` | Array of non-empty protected-root strings used by the run. |
| `write_roots`, `deny_git_mutations`, `deny_package_installs`, `deny_network_clients`, `agent_clients` | The resolved `ToolGuardPolicy` fields and defaults described above. |

`.harness/missions/<mission>/runs/<run_id>/tool-guard.log` is newline-delimited JSON. Each line has:

```json
{"ts":"<ISO timestamp>","call_id":"<call id>","tool":"<tool name>","class":"<ToolGuardClass | allow | guard_unavailable>","target":"<target or tool fallback>","reason":"<exact denial reason>"}
```

`call_id` is optional and records the runtime tool call or tool use identifier when provided by the runtime hook (such as Command Code or Claude Code PreToolUse, or the oh-my-pi `tool_call` event's `toolCallId`). For allowed calls, `class` is `"allow"` and `reason` is omitted; a guard that cannot decide logs `class: "guard_unavailable"`. The OMP, Claude Code, and Command Code writers use the same field names. `target` contains the resolved decision target when one exists; otherwise `toolTargetForLog` supplies the tool name as a fallback.
## Denials and the runtime denial budget

The supervisor does not infer a denial from arbitrary model text. It counts either a native hook-block event (`tool_hook_blocked`, `tool_call_blocked`, or `tool_denied`) or a completed tool result whose recursively inspected `result`, `text`, or `content` contains a string beginning with `CONTRACT:`. A call ID is counted once even if the same denied result is observed more than once. On each counted denial, the supervisor records the hook text and updates progress; when `max_denials` is reached, it stops with `stop_code: "denial_budget"` and a reason in the form `<count> hook-denied calls; last: <tool> <target>: <hook reason>`.

A native tool refusal is a denial the runtime issued itself, without ever invoking the guard hook: a `tool_denied` or `tool_call_blocked` event for a call that has no preceding hook invocation, typically a tool name the runtime does not have (for example `shell` instead of `shell_command`). Because no hook ran, no guard-log line is expected for that call: it is not counted as a guarded completed call and never affects `guard_armed`, so a run whose hook logged every call it actually executed stays armed even when the model hallucinates an unavailable tool. A native refusal is still a denial the model made: it consumes the denial budget, is counted separately in `native_refusals` on `runtime-control.json` (in addition to `denials`), and on budget exhaustion stops with `stop_code: "denial_budget"` and a reason in the form `<count> denied calls; last: native refusal of <tool>`. A model that keeps calling a nonexistent tool therefore still stops, but as a denial-budget decision, not as a false policy stop claiming the guard is disarmed.

A protected-root mutation is different: the supervisor evaluates the first tool event for a call and immediately stops with `stop_code: "policy"` and `Protected path write attempted: <target>`. Policy stops are hard stops and are not automatically resumed.
A `guard_tamper` denial is a hard policy stop rather than denial-budget input: when the supervisor observes that class in the native denial event or guard log, it stops with `stop_code: "policy"` and reason `Guard tamper attempted`. Policy stops are hard stops and are not automatically resumed.

## Why matching is path-only

Path checks inspect the operation target, not the contents of a report. An allowed output may quote a forbidden path without attempting to write there. This prevents false denials based on documentation content; `tests/tool-guard.test.ts` covers the distinction.
