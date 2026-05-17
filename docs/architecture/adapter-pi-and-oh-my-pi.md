# Pi and oh-my-pi Runtime Adapter Plan

## Purpose

Ultimate Harness should include Pi and oh-my-pi as first-class runtimes alongside Hermes, Codex, and Claude Code in the v0.1.x window.

The near-term goal is not to rebuild Pi or oh-my-pi internals. The goal is to prove a harness-owned adapter boundary that can plan, run, observe, and collect missions through the installed CLIs while preserving Ultimate Harness artifacts, blocker classification, and sandbox discipline.

## Recommendation

Use **Option B — `omp` CLI direct** first, reusing the Codex adapter pattern: adapter checker probes the installed CLI, planner emits a deterministic non-interactive command, runner captures stdout/stderr/final message/diff, and quota or auth exhaustion becomes `blocked` rather than a generic mission failure.

Use **Option C — `omp auth-broker serve` + `omp auth-gateway serve`** as a Phase 2 follow-up once at least two shipped runtimes benefit from shared credential refresh. Until then, long-running credential services are a larger operational surface than v0.1.x needs.

## Integration options

| Option | Shape | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| A — Direct `pi` CLI | Invoke Pi directly, assuming a non-interactive `pi exec`-equivalent contract. | Zero extra services; mirrors Hermes and Codex adapter shape; smallest runtime-specific dependency. | Depends on whether `pi` ships a stable non-interactive flag set; account auth is per-machine; capability/event shape is still unknown. | Keep as a parallel probe. Use if Pi exposes the cleaner contract. |
| B — `omp` CLI direct | Invoke `omp` non-interactively and treat it like Hermes/Codex. | oh-my-pi already integrates many providers, including OpenAI Codex, Anthropic, GitHub Copilot, Gemini, and LM Studio; keeps session/account state in the runtime; no harness-owned OAuth implementation. | Largest moving CLI surface; auth lives in OMP's credential store; event and final-message capture must be verified. | **Recommended first.** Best fit for v0.1.x because it reuses the CLI-adapter pattern without adding services. |
| C — `omp auth-broker serve` + `omp auth-gateway serve` | Run oh-my-pi broker and gateway as side services; adapters call OpenAI/Anthropic through the gateway. | Shared team credentials; centralized OAuth refresh; can apply uniformly to Codex and Claude Code style runtimes. | Introduces a long-running service into Ultimate Harness; bigger ops, secrets, health-check, and lifecycle surface; not needed for one adapter. | Phase 2 after two or more runtimes need shared credential refresh. |

## Capability assumptions

| Runtime | `worktree_mode` | `pass_session_id` | JSON event stream | Final-message capture | Sandbox flag | Auth model |
| --- | --- | --- | --- | --- | --- | --- |
| Pi | `false` in current manifest stub; TBD — verify against installed CLI | `true` in current manifest stub; TBD — verify session resume semantics | TBD — verify against installed CLI | TBD — verify against installed CLI | TBD — verify against installed CLI | TBD — verify whether auth is local CLI state, environment variables, or delegated provider credentials |
| oh-my-pi | `false` in current manifest stub; TBD — verify worktree/isolation flags | `true` in current manifest stub; TBD — verify session resume semantics | TBD — verify against installed CLI | TBD — verify against installed CLI | TBD — verify against installed CLI | OMP credential store for direct CLI mode; broker/gateway model available later for shared credentials |
| Codex reference | `true` in Codex plan | `false` in Codex plan | `codex exec --json` JSONL | `--output-last-message <file>` | `--sandbox workspace-write` | Local Codex CLI account/session state |
| Hermes reference | Adapter-owned behavior in `src/adapters/hermes.ts` | Adapter-owned behavior in `src/adapters/hermes.ts` | Structured adapter events | Adapter-collected summary/artifacts | Harness sandbox/worktree contract | Hermes runtime/provider auth resolution |

Unknowns are intentionally explicit. Adapter implementation should not invent defaults for any TBD value; it should fail adapter checks or return `blocked` with a specific reason until the installed CLI contract is proven.

## Option B adapter shape

A direct `omp` adapter should mirror the Codex adapter rather than introduce a new abstraction first:

1. `checkOhMyPi(root?)` runs a read-only version/capability probe and reports missing binary or unsupported non-interactive mode explicitly.
2. `planOhMyPiRun(root, missionPath)` builds the command and writes the compiled mission prompt without launching the runtime.
3. `runOhMyPi(root, missionPath, options?)` launches the CLI, persists raw stdout/stderr, records lifecycle events, captures final output, collects diff, and writes `runtime-result.yaml`.
4. Known quota, auth, or account exhaustion text is classified as `blocked` with an actionable error.
5. Unknown event lines are logged and tolerated only if the runtime contract still produces a final result; missing required outputs should fail fast.

A shared base CLI adapter helper may be useful after Codex, Pi, and oh-my-pi expose the same shape. It should not be created before two concrete adapters prove the duplicated logic and failure modes are actually identical.

## Next-slice tasks for Pi

- Probe installed CLI version and surface it in the adapter checker.
- Identify the non-interactive invocation contract analogous to `codex exec`.
- Identify whether Pi emits a JSON event stream or another structured observation format.
- Identify whether Pi can write or expose a final assistant message separately from logs.
- Identify the auth/account model: local credential store, environment variables, OAuth, provider-specific config, or no account state.
- Identify quota, rate-limit, and auth failure text and classify those cases as `blocked`.
- Decide whether Pi gets a dedicated adapter module or shares a base CLI adapter helper after Codex/OMP patterns are proven.

## Next-slice tasks for oh-my-pi

- Probe installed `omp` CLI version and surface it in the adapter checker.
- Identify the non-interactive invocation contract analogous to `codex exec`.
- Identify JSON event stream support and whether event names can map cleanly to Ultimate Harness lifecycle events.
- Identify final-message capture support or the least lossy equivalent.
- Identify the direct CLI auth/account model and the boundary between local credential store and broker/gateway mode.
- Identify quota, rate-limit, expired-token, missing-provider, and auth failure text and classify those cases as `blocked`.
- Decide whether to wire a dedicated `src/adapters/oh-my-pi.ts` module first or extract a base CLI adapter helper only after Codex and OMP duplicate enough behavior.

## Open questions

- **UH-PI-001:** What exact installed `pi` versions and commands are available on target developer machines?
- **UH-PI-002:** Does `pi` expose a stable non-interactive run mode, and what flags control working directory, sandboxing, approvals, JSON output, and final output?
- **UH-PI-003:** Does `pi` support session resume in a way that maps to `pass_session_id: true`, or should the manifest change before implementation?
- **UH-PI-004:** What failure strings or exit codes represent quota, rate limits, missing auth, expired auth, and unsupported provider configuration?
- **UH-OMP-001:** What exact installed `omp` versions and commands are available on target developer machines?
- **UH-OMP-002:** Does `omp` expose a stable non-interactive run mode, and what flags control working directory, sandboxing, approvals, JSON output, and final output?
- **UH-OMP-003:** Which OMP provider/account state should the v0.1.x adapter assume, and how should the checker report absent provider configuration?
- **UH-OMP-004:** Can OMP direct CLI runs expose enough structured events for `events.ndjson`, or must v0.1.x persist only harness lifecycle events plus raw logs?
- **UH-OMP-005:** At what point do Codex, Claude Code, and OMP share enough auth-refresh needs to justify broker/gateway side services?
- **UH-BASE-001:** After Codex and OMP are implemented, is a shared CLI adapter helper simpler than keeping runtime-specific modules?

## Source notes

The design is informed by the approved Oh My Pi research and these upstream source areas, without copying private protocol detail into Ultimate Harness:

- `docs/auth-broker-gateway.md` — broker/gateway split, centralized credential refresh, and remote-token boundary.
- `docs/environment-variables.md` — provider credential precedence and environment-variable behavior.
- `packages/ai/src/utils/oauth/index.ts` — OAuth provider abstraction and credential resolution shape.
- `packages/ai/src/providers/openai-codex/constants.ts` — evidence that Codex account access is specialized and should remain runtime-owned for v0.1.x.
- `packages/ai/src/utils/oauth/anthropic.ts` — Anthropic OAuth refresh model relevant to future Claude Code and shared credential work.

These sources support the main boundary decision: Ultimate Harness should orchestrate runtimes and collect artifacts; it should not own provider OAuth protocols in this slice.

## Non-goals

- Do not reimplement the OMP OAuth broker in Ultimate Harness now.
- Do not reimplement the OMP auth gateway in Ultimate Harness now.
- Do not embed OAuth refresh logic into runtime adapters.
- Do not implement direct ChatGPT backend OAuth transport for Pi, oh-my-pi, Codex, or Claude Code in v0.1.x.
- Do not move session/account state into Ultimate Harness for v0.1.x; CLIs own session/account state.
- Do not change `.harness/adapters/pi.yaml` or `.harness/adapters/oh-my-pi.yaml` in this planning slice.
