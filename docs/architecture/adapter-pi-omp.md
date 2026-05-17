# Adapter Design: Pi and oh-my-pi

> Status: design — `planned`. No runtime code is wired yet. See `.harness/adapters/pi.yaml` and `.harness/adapters/oh-my-pi.yaml`.

This document describes the runtime adapter design for two related but distinct runtimes:

- **Pi** — a minimal, customizable terminal coding harness with interactive, print/JSON, RPC, and SDK execution surfaces.
- **oh-my-pi** (`omp`) — a batteries-included extension of the Pi lineage that bundles LSP, subagents, browser, Python, MCP, sessions, branches, skills, hooks, and isolation backends.

Both runtimes share the same control surface family (`pi` and `omp` CLIs with a `-p` print/JSON mode), so they are designed as sibling adapters that satisfy the same `uh.adapter.v0` contract. Where they diverge — capability surface, session model, sandbox assumptions — this document calls out `pi` vs `omp` explicitly.

The companion adapter to compare against is `hermes` (`.harness/adapters/hermes.yaml` + `src/adapters/hermes.ts`); Pi/omp follow the same lifecycle, prompt model, and artifact persistence pattern.

## 1. Invocation

Both adapters drive their runtime through a non-interactive print-mode invocation that emits structured stdout the harness can capture for runtime artifacts and event reconstruction.

### Pi

```text
pi -p <prompt> \
  [--session <session-id>] \
  [--provider <name>] \
  [--model <name>] \
  [--cwd <sandbox-path>]
```

- `-p` selects print/JSON mode (non-interactive, no TTY UI).
- The prompt is the rendered mission prompt (see §4). It MUST be supplied as a single argument or via stdin so the adapter does not need to escape mission YAML inline.
- `--session` is optional. The adapter sets it when resuming, otherwise lets Pi allocate.
- `cwd` is the sandbox path (see §6).

### oh-my-pi

```text
omp -p <prompt> \
  [--session <session-id>] \
  [--provider <name>] \
  [--model <name>] \
  [--skill <name>]... \
  [--mcp <server>]... \
  [--browser] \
  [--cwd <sandbox-path>]
```

- `omp -p` is the same print-mode contract as `pi -p`, plus oh-my-pi's batteries-included flags.
- `--skill`, `--mcp`, and `--browser` are oh-my-pi extensions; the Pi adapter MUST NOT emit them.
- The adapter should refuse a mission whose required skills cannot be resolved to local oh-my-pi skill names (translated from `mission.skills.required[]`).

### Common rules

- The CLI binary is configurable via `config.cli_command` in the manifest. Defaults: `pi` and `omp`.
- `pass_session_id: true` is the intended default for both; sessions are how Pi/omp carry conversation state across multi-step missions.
- The adapter MUST capture the full final argv vector in `runtime-session.yaml` for audit, the same way `hermes.ts` does today.

## 2. Capability flags

Both adapters declare capabilities via the `capabilities[]` array on `uh.adapter.v0`, using the vocabulary already defined in `docs/architecture/runtime-adapter-contract.md` (§"Capability model").

### Pi (`runtime: pi`)

Pi is intentionally minimal. The adapter declares:

- `cli-execution`
- `non-interactive-run` — `pi -p`.
- `json-output` — Pi emits structured JSON in print mode.
- `session-resume` — explicit session ids.
- `file-tools` — file editing via Pi's built-in tool surface.
- `terminal` — shell execution.

Pi does NOT declare: `subagents`, `skills`, `browser`, `mcp`, `sandbox-native`. Missions that require those MUST select oh-my-pi (or another runtime) instead.

### oh-my-pi (`runtime: oh-my-pi`)

oh-my-pi declares the full superset:

- All of Pi's capabilities.
- `subagents` — oh-my-pi spawns subagents inside the same session tree.
- `skills` — `--skill <name>` loading.
- `browser` — first-class browser tool.
- `mcp` — MCP servers via `--mcp`.
- `hooks` — pre/post hook surfaces.
- `worktree-isolation` — oh-my-pi understands worktree/branch backends natively.

### Adapter refusal contract

Per the runtime adapter contract (§"Adapter responsibilities"), both adapters MUST refuse missions whose `skills.required[]`, sandbox backend, or verification gates require a capability they do not declare. Refusal happens in `prepare(mission, sandbox)` before any process is launched.

## 3. Session model notes

This is the biggest behavioral difference between the two runtimes.

### Pi

- One Pi session ≈ one runtime session as defined in `uh.runtime-session.v0`.
- Sessions are flat: no native subagent tree. Multi-step work is encoded by re-invoking `pi -p` with the same `--session` id.
- Resumption: the adapter persists the Pi session id in `runtime-session.yaml`. `launch()` either creates a new session or attaches to an existing one based on `mission.runtime.session_id` if present.
- Cancellation: signalling the Pi process is sufficient; there are no child agents to reap.

### oh-my-pi

- One omp session can fan out into a subagent tree. Each subagent inherits the parent session's branch and skill context.
- The adapter MUST record the root session id in `runtime-session.yaml`. Subagent ids are surface-level metadata captured in `events.ndjson` (and later in `mission.events`), not promoted into `runtime-session.yaml` as separate top-level entries.
- omp's "branches" feature (parallel session forks) is exposed to the harness as informational events only. Branch promotion is out of scope for v0 — the harness sandbox model owns promotion, not the runtime.
- Cancellation: omp's tree teardown is the runtime's responsibility. The adapter forwards `cancel(reason)` and waits for the subagent tree to drain before marking the session `cancelled`.

## 4. Mission-prompt input

Both adapters translate `mission.yaml` → a single rendered prompt string. The prompt rendering follows the same shape `hermes.ts` already uses (`renderHermesPrompt`), to keep prompts comparable across adapters:

1. **Header** — mission id, title, workflow profile, priority.
2. **Objective** — `mission.objective` (preserve full text).
3. **Constraints** — bulleted `mission.constraints[]`.
4. **Context** — `repo_root`, `read_first[]`, `source_links[]`.
5. **Skills** — `required[]` then `suggested[]`, with the runtime-specific reminder ("Load these as Pi tools" vs "Load these via `--skill`").
6. **Expected outputs** — `mission.expected_outputs.files[]` and any artifact-kind hints.
7. **Sandbox** — backend + promotion policy, plus a reminder that `cwd` is the sandbox path.
8. **Verification** — required checks and review gates.
9. **Completion criteria** — bulleted `mission.completion_criteria[]`.
10. **Audit reminder** — preserve mission id verbatim in any artifact, log, and result the runtime emits.

The adapter writes the rendered prompt to `.harness/missions/<id>/prompt.md` before launch, identical to the Hermes adapter today.

### Pi vs omp prompt deltas

- **Pi:** the skills section degrades to a documentation pointer (`docs/skills/<name>.md` or similar) because Pi does not auto-load skills. The prompt MUST include the skill content inline when the mission marks it required, so Pi has it in-band.
- **omp:** the skills section becomes a thin reminder; the adapter passes `--skill <name>` for each required skill so omp loads the canonical skill body itself. The prompt does NOT inline skill content for omp.

## 5. Run-result format

Both adapters emit `uh.runtime-result.v0` per the runtime adapter contract (`runtime-adapter-contract.md` §"Runtime result shape"), produced by `collect(runtime_session_id)` after the print-mode run terminates.

Required field mapping:

- `runtime.adapter_id` → `pi` or `oh-my-pi`.
- `runtime.session_id` → the Pi/omp session id captured in `runtime-session.yaml`.
- `status` → `completed` on exit 0 with no blocker, `failed` on non-zero exit or parse error, `blocked` when the JSON stream emits an explicit blocker event, `cancelled` on harness-initiated cancel.
- `summary` → the runtime's final summary message, or the last JSON `assistant` message if no explicit summary is emitted.
- `artifacts[]` → files the runtime reports as created/modified. Pi reports a flat list; omp reports a per-subagent list which the adapter MUST flatten before serialization.
- `changes.files_changed[]` → reconciled with `git status -s` inside the sandbox to catch artifacts the runtime forgot to declare.
- `changes.diff_ref` → `.harness/missions/<id>/diff.patch`, written by the adapter after the run.
- `checks_suggested[]` → forwarded from the runtime when it proposes verification commands; never used to replace `mission.verification.required_checks[]`.
- `blockers[]` → emitted as-is from JSON blocker events. Per the contract, runtime errors are NOT mission blockers; the adapter separates them.
- `logs[]` → at minimum `.harness/missions/<id>/runtime.log` (stdout/stderr capture) and `.harness/missions/<id>/events.ndjson` (decoded JSON events).

Pi's print-mode JSON is line-delimited (`pi -p` documents this); omp's print-mode JSON is the same line-delimited stream plus subagent-scoped envelopes. Both adapters MUST tolerate malformed individual lines (log + continue), not abort the whole collection.

## 6. Sandbox / worktree assumptions

Both adapters assume the sandbox manager has already created the workspace before `launch()`. The adapter does not allocate sandboxes; it consumes them.

### Common assumptions

- The sandbox path is passed as `cwd` (i.e. `--cwd <path>` or `process.cwd()` when spawning).
- The sandbox is a real filesystem path the runtime can read and write.
- `mission.sandbox.backend` is one of `git-worktree` (MVP) or `agentfs` (later). Both Pi and omp adapters declare `supported_sandbox_backends: [git-worktree]` in v0; `agentfs` is added once UH-9's worktree backend stabilizes and AgentFS lands.
- Promotion is the harness's job. Neither adapter writes outside the sandbox path. If the runtime tries (rare, but Pi/omp tool surfaces are broad), the adapter MUST surface that as a security finding per `docs/architecture/sandboxing.md` §"Required safety rules".

### Pi specifics

- Pi has no native sandbox concept. `worktree_mode: false` in the manifest. The harness's git-worktree backend (UH-9) is the entire isolation story.
- The adapter MUST set `cwd` explicitly; otherwise Pi inherits the harness's cwd, which is unsafe.

### oh-my-pi specifics

- oh-my-pi has native isolation backends, but the v0 adapter intentionally does NOT delegate to them — using two isolation layers (harness worktree + omp backend) doubles failure modes for no gain. `worktree_mode: false`.
- A later phase (post-v0) MAY teach the omp adapter to opt into omp's own isolation when `mission.sandbox.backend: oh-my-pi-native`. That backend does not exist in the harness yet.

## 7. Verification triggering

Neither adapter runs verification itself. After `collect()` returns, the harness CLI is responsible for invoking `uh verify <mission-id>`, which reads `mission.verification.required_checks[]` and `review_gates[]` and writes `verification.yaml`. The Pi/omp adapters interact with verification in three ways:

1. **Suggestion forwarding** — the runtime may propose verification commands during the run (e.g. "I added a TypeScript file, suggest `npx tsc --noEmit`"). The adapter records these in `runtime-result.checks_suggested[]` for the human to review. They are NEVER auto-promoted into the mission's required checks.
2. **Diff snapshotting** — the adapter writes `diff.patch` before exiting so `uh verify` can run review-gate checks against a stable file set, even if the sandbox is later mutated.
3. **Blocker preservation** — when the runtime emits a blocker event (`status: blocked`), the adapter MUST set `runtime-session.status: failed` AND populate `blockers[]` in the result. `uh verify` will then see the mission as not-runnable until the blocker is resolved; `uh promote --decision promoted` will refuse the mission.

This keeps the harness's promotion rule ("`promoted` requires a passed verification.yaml") intact for Pi and omp the same way it works for Hermes.

## 8. Why Pi / oh-my-pi may become a long-term reference runtime

Pi and oh-my-pi are tracked as design-only stubs today, but they are strong candidates for long-term reference runtime status alongside Hermes:

- **Print-mode contract is well-suited to adapters.** A non-interactive, JSON-output mode is exactly what a control-plane harness needs. Adapters that have to scrape interactive TUIs are fragile; `pi -p` and `omp -p` are by-design machine-friendly.
- **Session model maps cleanly onto `uh.runtime-session.v0`.** Explicit session ids, resumption, and (for omp) subagent trees all line up with how the harness already wants to record runtime state.
- **Capability surface scales without ontology churn.** Pi covers the minimal-tool floor; oh-my-pi covers the full tool ceiling (LSP, browser, MCP, skills, hooks). The same adapter contract handles both, which validates that `uh.adapter.v0` is the right abstraction (a single capability bag, not per-runtime schemas).
- **Open-source posture.** Pi (`pi.dev`) and oh-my-pi (`github.com/can1357/oh-my-pi`) are open and customizable, so the harness can ship deterministic adapter behavior without depending on a vendor's roadmap.
- **MCP and skill compatibility.** oh-my-pi's MCP and skill surfaces match where the harness is already heading (skill index, MCP-aware tooling), so adapter convergence work is reusable rather than throwaway.

Promotion to reference-runtime status is contingent on the criteria in §"Adapter responsibilities" of `runtime-adapter-contract.md` plus three additional gates:

1. Mission round-trip parity with Hermes on the documentation-spine mission profile.
2. Stable JSON event schema across at least two Pi releases.
3. A working sandbox handoff (git-worktree backend) demonstrated end-to-end.

## 9. Risks and limits

### Pi

- **Minimal toolset.** Pi by design does not load skills, browser, or MCP. Missions that need those MUST select oh-my-pi or refuse. The adapter MUST enforce this in `prepare()` rather than letting Pi run and silently underperform.
- **Print-mode JSON stability.** Pi's `-p` output is the adapter's contract. Schema drift between Pi versions is a real risk; the adapter pins a tested version range in the manifest's `config` once wiring begins.
- **No native sandbox.** Sandbox correctness rests entirely on the harness's worktree backend. Bugs in UH-9 land on the Pi adapter as runtime breakage with no second line of defense.
- **Single-session concurrency.** Pi expects one print-mode invocation at a time per session. The adapter MUST serialize calls within a session id.

### oh-my-pi

- **Subagent observability.** omp's subagent tree is rich but unstable to summarize. Flattening subagent artifacts into a single `artifacts[]` list loses structure; the adapter records the original tree in `events.ndjson` for audit.
- **Skill name collisions.** `mission.skills.required[]` uses harness skill names; omp `--skill` uses omp's skill names. The adapter needs an explicit mapping table (`config.skill_alias`) once wiring starts. Until that table exists, the adapter MUST refuse missions whose required skills are not 1:1 with omp's bundled names.
- **MCP server inheritance.** omp can attach MCP servers from the user's global config. The harness can NOT see that surface. The adapter MUST pass `--mcp` explicitly for every MCP dependency declared in the mission and warn (via blocker) if the runtime advertises additional MCP servers the mission didn't ask for.
- **Hook execution.** omp hooks can mutate the sandbox before/after the runtime turn. The adapter MUST capture pre/post sandbox state hashes so verification can attribute changes correctly.
- **Double-isolation temptation.** Using omp's native isolation backend on top of the harness's worktree backend looks like belt-and-braces but doubles cleanup, audit, and failure surfaces. v0 keeps it off. Revisiting this is a deliberate, post-v0 decision.

### Cross-runtime

- **Adapter drift.** Two adapters covering related runtimes can diverge in prompt rendering. Both adapters MUST share `renderMissionPrompt()` (extracted from the Hermes adapter when wiring lands) so prompt deltas stay explicit and reviewable.
- **Status promotion latency.** Until both adapters move from `planned` → `experimental` → `active`, `uh adapter check pi` / `uh adapter check oh-my-pi` will report `not implemented`. The harness CLI MUST handle that gracefully (no crash, clear message), the same way it does for any unconfigured adapter.
