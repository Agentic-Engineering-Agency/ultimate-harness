# Spec — Epics 6, 7, 8 (Cursor-Agent Execution Plan)

**Status:** DRAFT — ready for Cursor agent to execute.
**Audience:** A Cursor IDE agent (**Composer 2.5** as primary implementer, **Gemini Flash 3.5** as fast worker / adversarial reviewer) acting as Ultrawork orchestrator, spawning subagents in parallel worktrees.
**Repo:** `git@github.com:Agentic-Engineering-Agency/ultimate-harness.git` @ `dev` (currently `1515e36`).
**Package:** `@agenticengineeringagency/ultimate-harness` (CLI `uh`), v0.4.0 (npm publish blocked on UH-91 token rotation; does not block these epics).

---

## 0. Global execution contract (applies to all 3 epics)

These rules are non-negotiable. Every subagent inherits them from the orchestrator's system prompt.

### 0.1 Branching & PR flow

- All feature branches MUST be cut from `dev` and target PRs to `dev`. Release PRs `dev → main`.
- Use **Graphite** (`gt`) for stacking, or `gh` if Graphite is unavailable. Draft PRs **immediately** after first commit.
- PR title format: `feat(<scope>): UH-<n> — <one-line summary>` (ASCII hyphen — `gh pr merge --subject` rejects em-dash; PR body MAY use em-dash).
- One Linear issue → one PR. Linear's GH integration only auto-closes the first issue in a PR title; co-included issues MUST be transitioned manually via the Linear MCP.
- GitHub account: `LaloLalo1999`. SSH remote required for any `.github/workflows/` writes (OAuth token lacks `workflow` scope).

### 0.2 Verification gates (definition of done)

A PR is mergeable only when **all** of the following are green:

| Gate | Command | Threshold |
|---|---|---|
| Type-check (harness) | `bun run typecheck` | clean |
| Type-check (plugin) | `bun run plugin:typecheck` | clean |
| Unit tests | `bun run test` | 100% pass, new tests added for new behavior |
| Plugin tests | `cd apps/hermes-plugin/dashboard && uv run pytest` | 100% pass |
| Bundle cap | `bun run plugin:build` | ≤ 50 KB |
| Codex review | poll `gh api .../pulls/<N>/reviews` + `.../comments` | no unresolved P0/P1/P2 findings |
| Semgrep | GH Actions `semgrep-cloud-platform/scan` | pass |
| Depot CI | GH Actions `Typecheck + tests + build` + `Pack + publish dry-run` | pass |

**Fail-fast TypeScript** — no silent fallbacks, no `as any` outside `*.test.ts`, no `// @ts-expect-error` without an issue link. Zod schemas at every IO boundary.

### 0.3 Linear sync (no-drift policy)

- Linear is source of truth for scope. Every Core/Later/Optional slice MUST have a Linear issue **before** the first commit on its branch.
- On PR open: post the PR link as a Linear comment on the issue.
- On merge: transition the issue to `Done` via the Linear MCP `save_issue` tool. Do this **explicitly** — do not rely on GitHub auto-close for co-included issues.
- New follow-up findings during execution MUST be filed in Linear before the PR ships, even if implementation is deferred.

### 0.4 Parallelization rules

- Default to **3 parallel worktrees** when slices are file-disjoint. Use `git worktree add /tmp/uh-<epic>-<slice> -b <branch> dev`.
- Worktree naming: `/tmp/uh-e6-live-events`, `/tmp/uh-e7-cap-schema`, `/tmp/uh-e8-spec-propose`.
- Hephaestus subagent for sustained implementation; sisyphus-junior for atomic touch-ups; reviewer subagent (read-only) before requesting Codex review.
- Never share a worktree across two simultaneously-running subagents. Resolve rebases serially on the parent branch.

### 0.5 Output discipline

- Every subagent reply ends with a one-line verdict: `VERDICT: PASS` / `VERDICT: NEEDS-ATTENTION` / `VERDICT: BLOCKED`.
- Final orchestrator report: structured table + JSON status object matching the v0.3.0/v0.4.0 cadence.

---

## 1. Cursor-agent runbook (the executor harness)

### 1.1 Required Cursor configuration

| Setting | Value | Why |
|---|---|---|
| Primary model | **Composer 2.5** (Cursor) | Sustained implementation, multi-file edits, primary executor in every worktree |
| Fast / reviewer model | **Gemini Flash 3.5** | Cheap parallel reviewer + fast iteration on small slices; complementary failure modes to Composer |
| Model routing | Cursor "Auto" **disabled**; explicit per-task | Avoid silent fallback to weaker models mid-task (fail-fast principle) |
| Background agents | **enabled** | Required for parallel worktrees |
| MCP servers | linear, cloudflare_docs, idea-reality (existing) + 3 new (below) | See §1.3 |
| Skills | see §1.2 | Auto-load by trigger |
| Memory | Honcho extension | Continuity across sessions |

### 1.2 Skills to enable (auto-load triggers)

| Skill | Trigger | Why for these epics |
|---|---|---|
| `ai-coding-discipline` | always | Fail-fast, no silent fallbacks |
| `verify-before-complete` | before any "done" claim | Definition-of-done enforcement |
| `karpathy-guidelines` | code-writing | Surgical changes, surface assumptions |
| `tdd` | Epic 8 only | Red-green-refactor on spec → test scaffolds |
| `api-design` | Epic 6 & 7 | New HTTP endpoints + adapter capability schema |
| `observability` | Epic 6 | SSE stream, live event tail, structured logs |
| `lint`, `test` | always | Pre-merge gates |
| `gh-fix-ci` | on CI failure | Debug failing checks |
| `gh-address-comments` | after Codex review | Resolve P-findings |
| `linear` | per-slice | Issue lifecycle |
| `forensics` | only if auto-mode stalls | Post-mortem stuck loops |
| `web-design-guidelines` | Epic 6 UI work | Live-tail pane polish |
| `react-best-practices` | Epic 6 UI work | Solid signals + cleanup-on-unmount |

### 1.3 MCP servers required

Already wired:

- **linear** — issue CRUD (`save_issue`, `save_comment`, `get_issue`, `list_milestones`).
- **cloudflare_docs** — only if a slice touches Workers/Pages (currently none planned).
- **idea-reality** — sanity-check epic novelty before kickoff.

Add for these epics:

- **github** (`gh` CLI as MCP wrapper if available; else `proxy_github` tool) — PR ops, CI watch.
- **playwright** — visual regression on Hermes plugin live-tail (Epic 6 only).
- **fs-watch / chokidar** (local extension) — Epic 6 SSE backend tails `runtime-events.jsonl` reliably. If not available, use Python `watchdog` already in the plugin venv.

### 1.4 Subagent roster

| Agent | Role | When to spawn | Model |
|---|---|---|---|
| **prometheus** | Pre-planning consultant | Once per epic, before slicing | Composer 2.5 |
| **metis** | Hidden-requirement scout | Before kickoff if scope feels under-specified | Gemini Flash 3.5 |
| **explore** | Read-only codebase mapper | When touching unfamiliar files | Gemini Flash 3.5 (cheap fan-out) |
| **hephaestus** | Sustained implementer | One per parallel worktree | **Composer 2.5** (load-bearing) |
| **sisyphus-junior** | Atomic executor | Tiny edits (single-file < 30 LoC) | Gemini Flash 3.5 |
| **reviewer** | Read-only QA | Before requesting Codex review | Gemini Flash 3.5; escalate to Composer 2.5 on disagreement |
| **librarian** | OSS docs lookup | Epic 6 SSE/EventSource semantics; Epic 7 cost-class refs | Gemini Flash 3.5 |
| **oracle** | Hard-tradeoff judge | Adapter routing algorithm (Epic 7) | Composer 2.5 |
| **momus** | Plan reviewer | After this spec lands | Composer 2.5 |

**Rule:** any subagent that **writes code** runs on Composer 2.5. Read-only or fan-out work runs on Gemini Flash 3.5. The orchestrator NEVER lets a Flash agent merge; reviewer + final-call gate is always Composer.

### 1.5 Daily orchestration loop

```
1. `/usage` and `/model` check — confirm **Composer 2.5** active for orchestration, context < 60%; reviewer slot set to **Gemini Flash 3.5**
2. Pull dev, rebase active branches
3. For each epic in flight:
   a. Check Linear issue states; transition any merged work to Done
   b. Spawn hephaestus per worktree with the slice spec block from §2/§3/§4
   c. Watch CI via `gh run watch`; on failure, spawn sisyphus-junior with gh-fix-ci skill
4. Reviewer pass before any Codex request
5. Address Codex findings inline; reply on PR
6. Merge sequentially (squash), delete branch, update Linear
7. EOD: append progress to memory://root/MEMORY.md
```

---

## 2. Epic 6 — Hermes plugin live runs & observability

**Parent Linear issue to file:** `UH-92` (Epic 6).
**Strategic intent:** The Hermes dashboard is post-mortem today. After Epic 5 it shows `runs[]` history but only **after** a run finishes. This epic streams `runtime-events.jsonl` to the UI **while a mission is running**, adds a cancel button, and surfaces token spend live.

### 2.1 Slice table (issues to file before kickoff)

| Slice | Phase | Size | Linear | Branch |
|---|---|---|---|---|
| SSE endpoint tailing `runtime-events.jsonl` | Core | M | UH-93 | `feat/uh-93-events-sse` |
| Live event pane in `MissionDrilldown` | Core | M | UH-94 | `feat/uh-94-live-pane` |
| Cancel running mission from UI | Core | S | UH-95 | `feat/uh-95-cancel-from-ui` |
| Per-run token/cost gauge | Later | S | UH-96 | `feat/uh-96-cost-gauge` |
| Multi-mission "what's running now" home view | Later | M | UH-97 | `feat/uh-97-running-grid` |
| WebSocket upgrade (only if SSE proves laggy) | Optional | M | UH-98 | `feat/uh-98-ws-upgrade` |

### 2.2 Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ MissionDrilldown.tsx                                                │
│  ├─ RecentRunsPane (existing)                                       │
│  └─ LiveEventsPane (NEW)                                            │
│       ├─ EventSource(`/api/uh/missions/{id}/runs/{run}/events?stream=1`)
│       ├─ append-only log (capped to 500 rows; chunked render)       │
│       ├─ status badge (running/finished/cancelled)                  │
│       └─ Cancel button → POST .../cancel                            │
└────────────────────────────────────────────────────────────────────┘
                       │ EventSource (text/event-stream)
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│ plugin_api.py — FastAPI                                             │
│  GET  /api/uh/missions/{id}/runs/{run}/events                       │
│       ?stream=1 → StreamingResponse(text/event-stream)              │
│       else      → JSON array of historical events (current behavior)│
│  POST /api/uh/missions/{id}/runs/{run}/cancel                       │
│       → calls `uh mission cancel --mission <id> --run-id <run>`     │
└────────────────────────────────────────────────────────────────────┘
                       │ tails .harness/missions/<id>/runs/<run>/runtime-events.jsonl
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│ uh harness (existing) — adapters write JSONL via appendRuntimeEvent │
└────────────────────────────────────────────────────────────────────┘
```

### 2.3 Slice specs

#### UH-93 — SSE endpoint

**Files (modified):**
- `apps/hermes-plugin/dashboard/plugin_api.py` — new route handler.
- `apps/hermes-plugin/dashboard/tests/test_events_sse.py` — new.

**Behavior:**
1. `GET /api/uh/missions/{id}/runs/{run}/events?stream=1` returns `Content-Type: text/event-stream`.
2. Server tails `runtime-events.jsonl` with `watchdog.observers.Observer` (fallback: 100ms polling loop with `seek(0, SEEK_END)`).
3. Emits `event: runtime-event\ndata: <jsonl-line>\n\n` per new line.
4. Heartbeat `: keepalive\n\n` every 15s to defeat proxies.
5. On client disconnect: cancel the tail task within 1s.
6. On run completion (sentinel event `kind: "run.finished" | "run.cancelled"`): emit one more event, then close with `event: close\ndata: {}\n\n`.

**Schema additions (`src/schema/runtime-events.ts`):** none — re-use existing `RuntimeEvent` schema. Add a Python mirror `_runtime_event_validator` to enforce the same shape before re-emitting.

**Acceptance:**
- `pytest test_events_sse.py` covers: cold-tail (run already finished → all events + close), hot-tail (3 events written during stream → all received in order), heartbeat fires within 16s on idle, disconnect cleans up tail task.
- Manual: `curl -N http://127.0.0.1:8000/api/uh/missions/m1/runs/r1/events?stream=1` while `uh mission run` is executing → events stream in real time.

**Risks:**
- File rotation: JSONL never rotates today (we append only); if Epic 7 changes that, this code must follow.
- Async-safe tailing: avoid `asyncio.run_in_executor` blocking the event loop; use `anyio.open_file` or `aiofiles`.

---

#### UH-94 — Live event pane (UI)

**Files (added/modified):**
- `apps/hermes-plugin/dashboard/src/LiveEventsPane.tsx` — new component.
- `apps/hermes-plugin/dashboard/src/live-events-utils.ts` — pure helpers (event coalescing, severity → color).
- `apps/hermes-plugin/dashboard/src/MissionDrilldown.tsx` — mount `<LiveEventsPane>` when `run.status === "running"`.
- `apps/hermes-plugin/dashboard/src/sdk.ts` — `subscribeToRunEvents(missionId, runId, handler): () => void`.
- `apps/hermes-plugin/dashboard/tests/live-events-utils.test.ts` + `.../tests/live-events-pane.test.ts` (Vitest, no React mount — match repo convention).

**Solid signal model:**

```ts
const [events, setEvents] = createSignal<RuntimeEvent[]>([], { equals: false });
const [status, setStatus] = createSignal<"connecting" | "open" | "closed" | "error">("connecting");

onMount(() => {
  const unsub = subscribeToRunEvents(props.missionId, props.runId, (e) => {
    setEvents((prev) => (prev.length >= 500 ? [...prev.slice(-499), e] : [...prev, e]));
  });
  onCleanup(unsub);
});
```

**Render rules:**
- Reverse-chronological with auto-scroll lock (sticky if scrolled up).
- Severity badge: `info` (default) / `warn` (yellow) / `error` (red) from `event.severity`.
- Token/usage rows collapsed by default; toggle via "show usage".
- Bundle cap: target ≤ 4 KB added. Use existing `styles.css` patterns; no new dependencies.

**Acceptance:**
- Vitest: helper coalescing, cap-to-500, severity classification, auto-scroll guard.
- Bundle ≤ 50 KB after build.
- Visual smoke via Playwright (`docs/runbooks/plugin-live-events-smoke.md`, new): start a mission, open drilldown, see events arrive within 200ms.

---

#### UH-95 — Cancel from UI

**Files:**
- `apps/hermes-plugin/dashboard/plugin_api.py` — `POST .../cancel`.
- `src/cli.ts` — `uh mission cancel --mission <id> --run-id <run>` if not already wired.
- `apps/hermes-plugin/dashboard/src/LiveEventsPane.tsx` — Cancel button + confirm modal.

**Behavior:**
- Cancel calls `appendRuntimeCancelledEvent(missionId, runId, { source: "plugin-ui" })`.
- Adapter-side cancellation is best-effort (process kill via PID file written by run-id helper).
- Idempotent: cancelling an already-finished run returns 409 with `code: "already_finished"`.

**Acceptance:**
- pytest: cancel running run → 200 + `run.cancelled` event appears in JSONL. Cancel finished → 409.
- UI: button disabled when `run.status !== "running"`; confirm modal blocks double-click.

---

#### UH-96 — Cost gauge (Later)

**Files:**
- `apps/hermes-plugin/dashboard/src/cost-gauge.ts` — pure aggregation: sum `event.usage.input_tokens` + `output_tokens`, multiply by adapter cost class table.
- `apps/hermes-plugin/dashboard/src/LiveEventsPane.tsx` — render `<CostGauge>` in header.

**Cost class table (lives in `src/schema/adapter-capabilities.ts` — shared with Epic 7):**

```ts
export const COST_CLASSES = {
  free: { input: 0, output: 0 },
  cheap: { input: 0.25, output: 1.0 },     // $/Mtok
  standard: { input: 3.0, output: 15.0 },
  premium: { input: 15.0, output: 75.0 },
} as const;
```

**Acceptance:** unit test for aggregation; live gauge updates within one render frame of each `usage` event.

---

#### UH-97 — Running grid (Later)

**Files:**
- `apps/hermes-plugin/dashboard/plugin_api.py` — `GET /api/uh/runs/active` (scans `.harness/missions/*/runs/*/latest.json` where `status === "running"`).
- `apps/hermes-plugin/dashboard/src/RunningGrid.tsx` — home-view card.

**Acceptance:** pytest for `/runs/active` endpoint covers no-runs, 1 run, 5 runs; UI shows live count + per-mission row.

---

#### UH-98 — WS upgrade (Optional, only if SSE measurable lag > 250ms p95)

Skip unless a perf measurement justifies it. Filed for completeness.

---

## 3. Epic 7 — Adapter capability matrix & runtime auto-routing

**Parent Linear issue to file:** `UH-99` (Epic 7).
**Strategic intent:** Today the user picks `--runtime hermes|hermes-proxy|codex|oh-my-pi` manually. Encode each adapter's capabilities (tools, max context, sandbox, cost class) so `uh mission run --auto` can route to the cheapest adapter that satisfies the mission's declared requirements.

### 3.1 Slice table

| Slice | Phase | Size | Linear | Branch |
|---|---|---|---|---|
| `AdapterCapabilities` schema + per-adapter manifests | Core | S | UH-100 | `feat/uh-100-capability-schema` |
| `--auto` routing in `uh mission run` | Core | M | UH-101 | `feat/uh-101-auto-routing` |
| Capability-aware mission validator | Core | M | UH-102 | `feat/uh-102-cap-validator` |
| Hermes-proxy live capability probe | Later | S | UH-103 | `feat/uh-103-live-probe` |
| Cost forecast endpoint | Later | M | UH-104 | `feat/uh-104-cost-forecast` |
| Plugin UI adapter selector | Optional | M | UH-105 | `feat/uh-105-ui-selector` |

### 3.2 Schema (the load-bearing file)

`src/schema/adapter-capabilities.ts` — new:

```ts
import { z } from "zod";

export const ToolCapabilitySchema = z.object({
  shell: z.boolean(),
  fs_read: z.boolean(),
  fs_write: z.boolean(),
  network: z.boolean(),
  // extension point: per-adapter custom tools registered by name
  custom: z.array(z.string()).default([]),
});

export const SandboxCapabilitySchema = z.enum([
  "none",          // runs in caller cwd, no isolation
  "agentfs",       // copy-on-write fs sandbox (existing harness layer)
  "container",     // hermes-proxy / codex remote
  "remote-only",   // never local
]);

export const AdapterCapabilitiesSchema = z.object({
  schema: z.literal("uh.adapter-capabilities.v0"),
  id: z.string().min(1),                // e.g. "hermes", "codex"
  display_name: z.string(),
  tools: ToolCapabilitySchema,
  sandbox: SandboxCapabilitySchema,
  max_context_tokens: z.number().int().positive(),
  cost_class: z.enum(["free", "cheap", "standard", "premium"]),
  supports_runtime_config_overrides: z.boolean(),
  supports_cancel: z.boolean(),
  supports_replay: z.boolean(),
  notes: z.string().optional(),
});

export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;
```

**Files (per-adapter manifests, new):**
- `src/adapters/capabilities/hermes.ts`
- `src/adapters/capabilities/hermes-proxy.ts`
- `src/adapters/capabilities/codex.ts`
- `src/adapters/capabilities/oh-my-pi.ts`

Each exports a typed const that satisfies `AdapterCapabilitiesSchema`. Registry in `src/adapters/capabilities/index.ts`:

```ts
export const CAPABILITIES: Record<AdapterId, AdapterCapabilities> = { ... };
export function getCapabilities(id: AdapterId): AdapterCapabilities { ... }
```

### 3.3 Mission requirements

Extend `src/schema/mission.ts`:

```ts
runtime_requirements: z.object({
  needs_network: z.boolean().default(false),
  needs_shell: z.boolean().default(true),
  needs_fs_write: z.boolean().default(true),
  min_context_tokens: z.number().int().positive().optional(),
  max_cost_class: z.enum(["free", "cheap", "standard", "premium"]).default("premium"),
}).optional(),
```

### 3.4 Auto-router algorithm (`src/harness/auto-route.ts`)

```ts
export function chooseAdapter(
  mission: Mission,
  available: AdapterId[],
  caps: Record<AdapterId, AdapterCapabilities>,
): { adapter: AdapterId; reason: string } | { adapter: null; reason: string };
```

Algorithm:

1. Filter `available` to those whose `tools` satisfy `mission.runtime_requirements`.
2. Filter by `max_context_tokens >= min_context_tokens`.
3. Filter by `cost_class <= max_cost_class` (ranking `free < cheap < standard < premium`).
4. Sort survivors by `cost_class` ascending, then by `max_context_tokens` descending.
5. Return first; if empty, return `{ adapter: null, reason: "<explain>" }`.

**Deterministic** — same inputs always pick the same adapter. No RNG.

### 3.5 CLI surface

```bash
uh mission run --auto                                 # picks adapter
uh mission run --auto --explain                       # picks + prints decision matrix
uh adapters list --capabilities                       # human table
uh adapters list --capabilities --json                # for plugin consumption
```

### 3.6 Plugin endpoint (UH-104)

`GET /api/uh/adapters/capabilities` → `{ adapters: AdapterCapabilities[] }`.
`POST /api/uh/missions/{id}/cost-forecast { adapter: "auto" | <id> }` → `{ adapter, est_input_tokens, est_output_tokens, est_cost_usd }`.

### 3.7 Acceptance

- 100% branch coverage on `chooseAdapter` (filter exclusions, tie-breaks, no-fit).
- Each per-adapter manifest covered by a schema parse test.
- `uh mission run --auto --explain` integration test using a fake adapter registry.
- Mission validator rejects mission requesting `needs_network: true` against `oh-my-pi` (which sets `network: false`).

### 3.8 Risks

- Cost-class values drift from real pricing. Mitigation: cost table lives in one file (`src/harness/cost-table.ts`), unit-tested for staleness via a comment-pinned "last reviewed" date and a `bun run lint:cost-table` warning if older than 90 days.
- Hermes-proxy capabilities depend on remote model selection. UH-103 adds a live probe (`GET /capabilities` on the proxy); static manifest is the fallback.

---

## 4. Epic 8 — Spec-Driven Development hardening

**Parent Linear issue to file:** `UH-106` (Epic 8).
**Strategic intent:** UH-54/55 shipped advisory SDD/TDD layers. Make them **load-bearing**: a `.spec.md` file becomes the source of a mission packet **and** a test scaffold, and `validate` blocks merges where the spec was untouched while implementation changed.

### 4.1 Slice table

| Slice | Phase | Size | Linear | Branch |
|---|---|---|---|---|
| `uh mission propose` from `.spec.md` | Core | M | UH-107 | `feat/uh-107-mission-propose` |
| Acceptance-criteria → test scaffold generator | Core | M | UH-108 | `feat/uh-108-test-scaffold` |
| Drift kind: implementation-without-spec-update | Core | S | UH-109 | `feat/uh-109-spec-drift` |
| LLM reviewer that grades spec adherence | Later | M | UH-110 | `feat/uh-110-adherence-judge` |
| Spec template library (per-epic starters) | Optional | S | UH-111 | `feat/uh-111-spec-templates` |

### 4.2 Spec format (the contract)

`.spec.md` lives next to the code it describes (`src/foo/feature.spec.md` for `src/foo/feature.ts`, or at `docs/specs/epic-N.md` for cross-cutting work).

Required front-matter:

```yaml
---
schema: uh.spec.v0
id: UH-107
title: uh mission propose from .spec.md
status: draft | approved | shipped
owners: [LaloLalo1999]
linear: UH-107
---
```

Required H2 sections:

- `## Goal` — one-paragraph intent
- `## Non-goals` — bullets
- `## Acceptance criteria` — numbered list; each item becomes one generated test
- `## Risks`
- `## Open questions` (may be empty)

The TDD generator (UH-108) reads the `## Acceptance criteria` block and emits one `it.todo("AC<N>: <text>")` per line in a target test file.

### 4.3 `uh mission propose` (UH-107)

**Files (new):**
- `src/harness/spec-loader.ts` — parse YAML front-matter + extract sections.
- `src/cli/mission-propose.ts` — CLI command.
- `tests/spec-loader.test.ts`.

**Behavior:**

```bash
uh mission propose --from docs/specs/epic-6.md
```

→ writes `examples/missions/uh-107.yaml` with:

- `id` from spec front-matter
- `title` from spec
- `description` from `## Goal`
- `acceptance_criteria` from `## Acceptance criteria` (array)
- `runtime_requirements` defaulted, with hooks to override via `--needs-network` etc.

### 4.4 Test scaffold generator (UH-108)

**Files (new):**
- `src/harness/test-scaffold.ts` — given a spec file path + a target language (`ts` | `py`), emits a starter test file.
- `src/cli/spec-scaffold.ts` — `uh spec scaffold --from <spec> --lang ts --out <path>`.

**Output for TypeScript:**

```ts
import { describe, it } from "vitest";

// Generated from docs/specs/epic-6.md @ UH-107
// Re-run: uh spec scaffold --from docs/specs/epic-6.md --lang ts
describe("UH-107 — uh mission propose", () => {
  it.todo("AC1: parses YAML front-matter from spec");
  it.todo("AC2: rejects spec missing required sections");
  // ...
});
```

Re-running the command is **idempotent**: it merges new ACs into an existing file rather than overwriting, preserving any `it()` bodies the human has filled in (track by AC ID).

### 4.5 Drift kind: spec-stale (UH-109)

Add a new drift kind under `src/harness/validate/drift/kinds/spec-stale.ts`:

- Trigger: `git diff dev...HEAD` includes a `src/**` change whose nearest `.spec.md` was **not** touched.
- Severity: `warn` by default, `error` when run with `--strict-spec`.
- Surface in `uh validate` output + plugin `validate` endpoint.

### 4.6 LLM adherence judge (UH-110, Later)

Reuse the existing `adversarial-qa` workflow scaffolding. Pass the spec + the implementation diff to a dedicated **GPT-5.5** judge subagent (independent of the Composer/Flash code-writing pool — third-party perspective by design); emit a structured verdict:

```json
{ "adherence": "pass" | "partial" | "fail", "missing_ac": ["AC2"], "evidence": "..." }
```

Wire as an opt-in `uh validate --judge` flag. Cost-class gating: only premium when explicitly requested.

### 4.7 Acceptance

- `tests/spec-loader.test.ts`: parses valid spec, rejects malformed front-matter, rejects missing required sections.
- `tests/spec-scaffold.test.ts`: generates new file, merges into existing, preserves manual edits.
- `tests/validate-drift-spec-stale.test.ts`: triggers on src-without-spec change, clean when both touched.
- End-to-end: this very spec file (`docs/specs/epics-6-7-8.md`) parses cleanly through `uh mission propose`.

---

## 5. Execution order (recommended)

**Wave 1 (parallel):** UH-93 + UH-100 + UH-107 — one hephaestus each in three worktrees. All low-coupling, independent files.

**Wave 2 (parallel):** UH-94 + UH-101 + UH-108 — depend on Wave 1 schemas but file-disjoint.

**Wave 3 (parallel):** UH-95 + UH-102 + UH-109.

**Wave 4 (single):** Cut v0.5.0 — release PR `dev → main`, tag `v0.5.0` + `plugin-v0.5.0`, npm publish (assumes UH-91 token rotated).

**Wave 5 (Later/Optional):** UH-96/97 (Epic 6) + UH-103/104 (Epic 7) + UH-110/111 (Epic 8) — schedule independently based on user demand.

---

## 6. Per-epic kickoff prompts (paste into Cursor)

### Epic 6 kickoff

> You are the Ultrawork orchestrator. Read `docs/specs/epics-6-7-8.md` §2. File Linear issues UH-92..UH-98 via the linear MCP. Spawn three hephaestus subagents in parallel worktrees `/tmp/uh-e6-{93,94,95}` for the three Core slices. Each subagent MUST follow §0 contract. After all three PRs are green and Codex-clean, rebase and merge sequentially. Report a structured status JSON.

### Epic 7 kickoff

> You are the Ultrawork orchestrator. Read `docs/specs/epics-6-7-8.md` §3. File Linear issues UH-99..UH-105. Start with UH-100 (schema) solo since UH-101 and UH-102 both consume it. Once UH-100 lands on dev, spawn UH-101 + UH-102 in parallel worktrees. Use the api-design skill before authoring `src/harness/auto-route.ts`. Report structured status JSON.

### Epic 8 kickoff

> You are the Ultrawork orchestrator. Read `docs/specs/epics-6-7-8.md` §4. File Linear issues UH-106..UH-111. Activate the tdd skill. Start with UH-107 (spec loader) since UH-108 (scaffold) and UH-109 (drift) consume it. Validate the loader by parsing this very spec file. Report structured status JSON.

---

## 7. Definition of done (for the spec itself)

- [x] Three epics fully specced with sliced Linear issues
- [x] Cursor agent configuration (model, skills, MCPs, subagents) called out
- [x] Branching, verification, and Linear-sync contract explicit
- [x] Schema-level designs for the two load-bearing types (`AdapterCapabilities`, `uh.spec.v0`)
- [x] Algorithm pseudocode for the non-obvious bit (`chooseAdapter`)
- [x] Execution order with parallelization waves
- [x] Paste-ready kickoff prompts per epic

**Next action for Lalo:** confirm the spec, then say "kick off Wave 1" or pick a single epic to start.

