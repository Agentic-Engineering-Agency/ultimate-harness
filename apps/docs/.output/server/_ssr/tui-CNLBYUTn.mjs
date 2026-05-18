import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tui-CNLBYUTn.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var tui_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "UH-41 — Interactive TUI architecture",
	"description": "Epic-level architecture document for the `uh tui` Mission Control interface. Captures the load-bearing decisions from the [UH-46 grill](https://linear.app/agentic-eng/issue/UH-46) so downstream slices (UH-47 mission browser, UH-44 mission r"
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Epic-level architecture document for the `uh tui` Mission Control interface. Captures the load-bearing decisions from the UH-46 grill so downstream slices (UH-47 mission browser, UH-44 mission run flow, UH-43 adapter/sandbox manager, UH-42 polish) inherit a stable contract."
		},
		{
			"heading": void 0,
			"content": "Last updated: 2026-05-18. UH-46 shipped."
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Surface"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Audience"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Stability bar"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "**CLI** (`uh `subcommand\\`\\`)"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Agents (Claude / Codex / Pi / OMP / OpenCode / Hermes / Hermes-Proxy) and scripts"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Frozen — third-party plugins consume it. Breaking changes require a major bump."
		},
		{
			"heading": "1-position-in-the-system",
			"content": "**TUI** (`uh tui`)"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Humans (Lalo, reviewers)"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Opinionated, evolves freely. Mission Control by default."
		},
		{
			"heading": "1-position-in-the-system",
			"content": "**Plugin** (planned)"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Foreign coding agents driving UH on a user's box"
		},
		{
			"heading": "1-position-in-the-system",
			"content": "Ships skills + hooks + (optional) MCP server; consumes the CLI."
		},
		{
			"heading": "1-position-in-the-system",
			"content": "The TUI sits *on top* of the CLI: it never invents its own data shapes, never bypasses the CLI's safety properties, and never freezes a contract the CLI doesn't already commit to."
		},
		{
			"heading": "2-layers",
			"content": "The split is strict so the model layer is unit-testable with plain Vitest (no renderer mocking) and the state layer is testable through injected `watcherFactory` / `adapterChecker` seams. The view is verified by manual smoke + the `--once` headless render."
		},
		{
			"heading": "d1--primary-surface-tui-for-humans-cli-for-agents",
			"content": "`uh tui` is the default human entry point. The CLI is the stable API every other surface (foreign-agent plugins, CI pipelines, scripts) targets. CLI breaking changes need a major version bump; TUI ergonomics evolve freely."
		},
		{
			"heading": "d1--primary-surface-tui-for-humans-cli-for-agents",
			"content": "*Alternatives considered:* CLI-first (TUI as `htop`-style observer only), hybrid split (separate read-only TUI + a modal run TUI)."
		},
		{
			"heading": "d2--mission-control-by-default---once-escape-hatch",
			"content": "`uh tui` stays open, watches `.harness/` live, never auto-exits. `uh tui --once` renders one frame and exits cleanly — for CI screenshots, docs gifs, and smoke tests. Persistence of UI state (focused pane, last-selected mission) is a UH-42 follow-up — UH-46 ships without persistence; default mode is \"Mission Control minus persistence.\""
		},
		{
			"heading": "d2--mission-control-by-default---once-escape-hatch",
			"content": "*Alternatives considered:* session tool (open per task), both-configurable."
		},
		{
			"heading": "d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
			"content": "Pane focus is `a` (Adapters), `m` (Missions), `s` (Sandboxes). `Tab` cycles forward and `Shift+Tab` backward as a discovery fallback. Selecting a mission additionally scrolls the Sandboxes pane to the bound sandbox via the existing `sandboxes[].mission_id` relationship."
		},
		{
			"heading": "d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
			"content": "Reserved single-letter keys: `a m s r q`. UH-43 and UH-44 actions (`c`, `d`, `r` for create/discard/run) need a keymap discipline; the chosen shape is deferred to UH-43's grill."
		},
		{
			"heading": "d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
			"content": "*Alternatives considered:* pure Tab cycle, full miller columns, mnemonics without the miller link."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "The dashboard data (adapter manifests, mission directories, sandbox index) is watched with `fs.watch` and re-loaded after a 200 ms debounce. Live mission-run events (UH-44) consume the per-mission append-only `events.ndjson` file each adapter already writes during execution, tailed line-by-line."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "UH-46 implemented the `fs.watch` half; UH-44 wired up the live tail. The contract below is the actual on-disk shape every adapter (hermes, codex, hermes-proxy, oh-my-pi) already emits."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "**`events.ndjson` contract** (consumed by UH-44):"
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "Rules:"
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "One JSON object per line, terminated by `\\n`."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "`timestamp` is RFC 3339 / ISO 8601 UTC. Consumers may also accept `ts`, `time`, or `at` as fallbacks."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "`event` (preferred) / `kind` / `type` carries the categorical label. Adapters namespace their own events under ``runtime`.`verb`` (e.g. `codex.thread.started`). The shared baseline is `runtime.started` and `runtime.finished`."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "Schemas above `event` / `timestamp` are open: adapters MUST tolerate unknown keys; consumers MUST treat the parsed object as `Record<string, unknown>`."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "Append-only — no truncation, no rotation during a run."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "File path: `.harness/missions/`id`/events.ndjson`. Coexists with the post-run `runtime-session.yaml` summary; both are written."
		},
		{
			"heading": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "*Alternatives considered:* fs.watch everywhere, named-pipe subscription, polling."
		},
		{
			"heading": "d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
			"content": "Selecting a row in any pane updates a single `text` footer line with that row's context. The Adapters pane additionally fires `runtimeRegistry.check(`id`)` on selection, with a 5 s TTL and one-in-flight cap to prevent arrow-spam from flooding the registry. The result is appended to the same footer line."
		},
		{
			"heading": "d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
			"content": "This satisfies UH-46's literal acceptance line \"Refreshes `adapter check `id\\`\\` on focus\" without crossing into UH-43 (mutations) or UH-47 (drilldown)."
		},
		{
			"heading": "d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
			"content": "*Alternatives considered:* no-op selection, dedicated preview pane (deferred to UH-47), defer-until-UH-47."
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Failures get screen real estate proportional to severity:"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Failure"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Surface"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "`.harness/project.yaml` absent"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Full-frame takeover with `uh init` hint"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Schema-malformed adapter / mission / sandbox file"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Per-row badge (`✖`/`?`) from the model layer"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "`fs.watch` error or dropped-event burst"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Sticky footer warning, auto-clears after 5 s"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Adapter `check` returns failure"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Footer preview line on adapter selection"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Transient loader throw"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "Footer error, last-good snapshot stays on screen"
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "The takeover is the only modal failure surface, reserved for the one case that's truly unrecoverable without action (no harness to observe). Everything else stays in-place so the user can keep navigating and retry with `r`."
		},
		{
			"heading": "d6--tiered-failure-surface",
			"content": "*Alternatives considered:* silent (status quo), banner-everywhere, takeover-on-everything."
		},
		{
			"heading": "4-runtime-selection--why-bun",
			"content": "Solid's JSX cannot be emitted by `tsc` (Solid is Babel-only). `dist/cli.js` is plain Node-compatible JavaScript with no `.tsx` artifacts. The `uh tui` subcommand spawns Bun as a child process with `bun --preload @opentui/solid/preload src/tui/index.tsx`, so the Babel transform runs at module load. `src/` ships in the npm tarball via `package.json#files` because the TUI source imports shared harness, schema, and adapter modules from sibling source directories."
		},
		{
			"heading": "4-runtime-selection--why-bun",
			"content": "If Bun is not on PATH, the CLI exits 1 with an install hint. Node-only deployments can keep using every other `uh` subcommand — the TUI is the only Bun-dependent surface."
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "Carried over from `docs/research/tui-framework.md §6`:"
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "`renderer.destroy()` is the only entry to terminal restoration. Never call `process.exit(0)` without `destroy()` first — the terminal stays in raw mode."
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "`destroy()` is idempotent on a single instance (`_isDestroyed` guard) but never call `createCliRenderer` twice in one process."
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "Cleanup order is fixed: process listeners removed → SIGINT/SIGTERM handlers detached → timers cleared → stdin cooked → stdout passthrough → `destroy` event fires → renderable tree teardown → Zig core restores screen + cursor + kitty kb + mouse."
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "`onCleanup()` fires per-component on tree teardown (post-order). \"Renderer-wide\" cleanup (e.g. closing a websocket) goes on `renderer.on(\"destroy\", …)`."
		},
		{
			"heading": "5-lifecycle-invariants",
			"content": "`createDashboardState` honors this: `dispose()` closes every watcher, clears the debounce + watcher-warning timers, and disposes the Solid root. The Dashboard component calls `dispose()` from `onCleanup`."
		},
		{
			"heading": "6-fswatch-contract",
			"content": "`createDashboardState(root)` opens three watchers:"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "Target"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "Triggers reload on"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "`.harness/adapters/`"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "Adapter manifest add/remove/edit"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "`.harness/missions/`"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "Mission directory add/remove + `mission.yaml` edits"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "`.harness/sandboxes/`"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "`index.yaml` edits + per-sandbox subtree changes"
		},
		{
			"heading": "6-fswatch-contract",
			"content": "Events from any watcher feed a 200 ms debounce. The debounce window is exposed via `DEBOUNCE_MS` so tests can override. The watcher factory is exposed via `WatcherFactory` so tests inject deterministic event sources without spinning real `fs.watch` handles."
		},
		{
			"heading": "6-fswatch-contract",
			"content": "macOS `kqueue` drops events under heavy churn (\\~50/sec sustained). Mitigation: the `r` keybind triggers an immediate `refresh()` that bypasses the debounce. The watcher-warning footer surfaces watcher errors so users know when to press `r`."
		},
		{
			"heading": "7-selection--cache",
			"content": "`state.ts` exposes:"
		},
		{
			"heading": "7-selection--cache",
			"content": "The dashboard wires `<select onChange>` to the setters, and `createEffect` on `selectedAdapter` to fire the check. `createMemo` on `selectedMission` powers the soft miller link to `selectedSandbox`."
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Slice"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "What it adds"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "What this doc commits"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "**UH-47** Mission browser"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Drilldown view with `code` and `diff`"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "`Enter` on a mission row opens the detail view"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "**UH-44** Mission run flow"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Live `events.ndjson` consumer + subprocess trigger"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Contract in §3 D4 above; adapters already emit the NDJSON"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "**UH-43** Adapter + sandbox manager"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "`c` create / `d` discard / re-check"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Reserves `c d` (and a keymap discipline TBD in UH-43's grill)"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "**UH-42** Polish"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "Keymap overlay (`?`), theming, error UX, state persistence"
		},
		{
			"heading": "8-future-slice-hooks",
			"content": "XDG state path: `~/.config/uh/tui-state.json`"
		},
		{
			"heading": "9-out-of-scope",
			"content": "Remote sessions (someone else's harness over SSH / WebSocket) — local only."
		},
		{
			"heading": "9-out-of-scope",
			"content": "Editing mission packets from the TUI — `mission.yaml` is read-only here."
		},
		{
			"heading": "9-out-of-scope",
			"content": "A web UI / static dashboard — `docs/ROADMAP.md` remains the canonical written index; `uh tui` is the live one."
		},
		{
			"heading": "9-out-of-scope",
			"content": "A custom renderer or bundler — runtime Babel via `bun --preload` is the only build path."
		}
	],
	"headings": [
		{
			"id": "1-position-in-the-system",
			"content": "1\\. Position in the system"
		},
		{
			"id": "2-layers",
			"content": "2\\. Layers"
		},
		{
			"id": "3-decisions",
			"content": "3\\. Decisions"
		},
		{
			"id": "d1--primary-surface-tui-for-humans-cli-for-agents",
			"content": "D1 — Primary surface: TUI for humans, CLI for agents"
		},
		{
			"id": "d2--mission-control-by-default---once-escape-hatch",
			"content": "D2 — Mission Control by default, `--once` escape hatch"
		},
		{
			"id": "d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
			"content": "D3 — Mnemonic pane focus + Tab fallback + soft miller link"
		},
		{
			"id": "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			"content": "D4 — Hybrid refresh: fs.watch for snapshots, append-only NDJSON tail for live runs"
		},
		{
			"id": "d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
			"content": "D5 — Selection drives a footer preview line; on-focus-row adapter check"
		},
		{
			"id": "d6--tiered-failure-surface",
			"content": "D6 — Tiered failure surface"
		},
		{
			"id": "4-runtime-selection--why-bun",
			"content": "4\\. Runtime selection — why Bun"
		},
		{
			"id": "5-lifecycle-invariants",
			"content": "5\\. Lifecycle invariants"
		},
		{
			"id": "6-fswatch-contract",
			"content": "6\\. fs.watch contract"
		},
		{
			"id": "7-selection--cache",
			"content": "7\\. Selection + cache"
		},
		{
			"id": "8-future-slice-hooks",
			"content": "8\\. Future-slice hooks"
		},
		{
			"id": "9-out-of-scope",
			"content": "9\\. Out of scope"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#1-position-in-the-system",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "1. Position in the system" })
	},
	{
		depth: 2,
		url: "#2-layers",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "2. Layers" })
	},
	{
		depth: 2,
		url: "#3-decisions",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "3. Decisions" })
	},
	{
		depth: 3,
		url: "#d1--primary-surface-tui-for-humans-cli-for-agents",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "D1 — Primary surface: TUI for humans, CLI for agents" })
	},
	{
		depth: 3,
		url: "#d2--mission-control-by-default---once-escape-hatch",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			"D2 — Mission Control by default, ",
			(0, import_jsx_runtime.jsx)("code", { children: "--once" }),
			" escape hatch"
		] })
	},
	{
		depth: 3,
		url: "#d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "D3 — Mnemonic pane focus + Tab fallback + soft miller link" })
	},
	{
		depth: 3,
		url: "#d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "D4 — Hybrid refresh: fs.watch for snapshots, append-only NDJSON tail for live runs" })
	},
	{
		depth: 3,
		url: "#d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "D5 — Selection drives a footer preview line; on-focus-row adapter check" })
	},
	{
		depth: 3,
		url: "#d6--tiered-failure-surface",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "D6 — Tiered failure surface" })
	},
	{
		depth: 2,
		url: "#4-runtime-selection--why-bun",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4. Runtime selection — why Bun" })
	},
	{
		depth: 2,
		url: "#5-lifecycle-invariants",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "5. Lifecycle invariants" })
	},
	{
		depth: 2,
		url: "#6-fswatch-contract",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6. fs.watch contract" })
	},
	{
		depth: 2,
		url: "#7-selection--cache",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "7. Selection + cache" })
	},
	{
		depth: 2,
		url: "#8-future-slice-hooks",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "8. Future-slice hooks" })
	},
	{
		depth: 2,
		url: "#9-out-of-scope",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "9. Out of scope" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		em: "em",
		h2: "h2",
		h3: "h3",
		li: "li",
		ol: "ol",
		p: "p",
		pre: "pre",
		span: "span",
		strong: "strong",
		table: "table",
		tbody: "tbody",
		td: "td",
		th: "th",
		thead: "thead",
		tr: "tr",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Epic-level architecture document for the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
			" Mission Control interface. Captures the load-bearing decisions from the ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-46",
				children: "UH-46 grill"
			}),
			" so downstream slices (UH-47 mission browser, UH-44 mission run flow, UH-43 adapter/sandbox manager, UH-42 polish) inherit a stable contract."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Last updated: 2026-05-18. UH-46 shipped." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "1-position-in-the-system",
			children: "1. Position in the system"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Surface" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Audience" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Stability bar" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "CLI" }),
					" (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "uh " }),
					"subcommand``)"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Agents (Claude / Codex / Pi / OMP / OpenCode / Hermes / Hermes-Proxy) and scripts" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Frozen — third-party plugins consume it. Breaking changes require a major bump." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "TUI" }),
					" (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Humans (Lalo, reviewers)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Opinionated, evolves freely. Mission Control by default." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Plugin" }), " (planned)"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Foreign coding agents driving UH on a user's box" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Ships skills + hooks + (optional) MCP server; consumes the CLI." })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The TUI sits ",
			(0, import_jsx_runtime.jsx)(_components.em, { children: "on top" }),
			" of the CLI: it never invents its own data shapes, never bypasses the CLI's safety properties, and never freezes a contract the CLI doesn't already commit to."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "2-layers",
			children: "2. Layers"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌────────────────────────────────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  View   src/tui/{dashboard.tsx,index.tsx}                      │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│         OpenTUI/Solid renderables, key handlers, layout        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "├────────────────────────────────────────────────────────────────┤" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  State  src/tui/state.ts                                       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│         Solid signals + fs.watch + selection + adapter-check   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "├────────────────────────────────────────────────────────────────┤" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  Model  src/tui/model.ts                                       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│         Pure async TS — snapshot reader, no Solid, no renderer │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "├────────────────────────────────────────────────────────────────┤" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  Harness primitives (existing)                                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│    src/harness/paths.ts, src/harness/registry.ts, ...          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└────────────────────────────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The split is strict so the model layer is unit-testable with plain Vitest (no renderer mocking) and the state layer is testable through injected ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "watcherFactory" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "adapterChecker" }),
			" seams. The view is verified by manual smoke + the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--once" }),
			" headless render."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "3-decisions",
			children: "3. Decisions"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "d1--primary-surface-tui-for-humans-cli-for-agents",
			children: "D1 — Primary surface: TUI for humans, CLI for agents"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }), " is the default human entry point. The CLI is the stable API every other surface (foreign-agent plugins, CI pipelines, scripts) targets. CLI breaking changes need a major version bump; TUI ergonomics evolve freely."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }),
			" CLI-first (TUI as ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "htop" }),
			"-style observer only), hybrid split (separate read-only TUI + a modal run TUI)."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h3, {
			id: "d2--mission-control-by-default---once-escape-hatch",
			children: [
				"D2 — Mission Control by default, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--once" }),
				" escape hatch"
			]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
			" stays open, watches ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }),
			" live, never auto-exits. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui --once" }),
			" renders one frame and exits cleanly — for CI screenshots, docs gifs, and smoke tests. Persistence of UI state (focused pane, last-selected mission) is a UH-42 follow-up — UH-46 ships without persistence; default mode is \"Mission Control minus persistence.\""
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }), " session tool (open per task), both-configurable."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "d3--mnemonic-pane-focus--tab-fallback--soft-miller-link",
			children: "D3 — Mnemonic pane focus + Tab fallback + soft miller link"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Pane focus is ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "a" }),
			" (Adapters), ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "m" }),
			" (Missions), ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "s" }),
			" (Sandboxes). ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Tab" }),
			" cycles forward and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Shift+Tab" }),
			" backward as a discovery fallback. Selecting a mission additionally scrolls the Sandboxes pane to the bound sandbox via the existing ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "sandboxes[].mission_id" }),
			" relationship."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Reserved single-letter keys: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "a m s r q" }),
			". UH-43 and UH-44 actions (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "c" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
			" for create/discard/run) need a keymap discipline; the chosen shape is deferred to UH-43's grill."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }), " pure Tab cycle, full miller columns, mnemonics without the miller link."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "d4--hybrid-refresh-fswatch-for-snapshots-append-only-ndjson-tail-for-live-runs",
			children: "D4 — Hybrid refresh: fs.watch for snapshots, append-only NDJSON tail for live runs"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The dashboard data (adapter manifests, mission directories, sandbox index) is watched with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "fs.watch" }),
			" and re-loaded after a 200 ms debounce. Live mission-run events (UH-44) consume the per-mission append-only ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
			" file each adapter already writes during execution, tailed line-by-line."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"UH-46 implemented the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "fs.watch" }),
			" half; UH-44 wired up the live tail. The contract below is the actual on-disk shape every adapter (hermes, codex, hermes-proxy, oh-my-pi) already emits."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsxs)(_components.strong, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }), " contract"] }), " (consumed by UH-44):"] }),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"event\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"runtime.started\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"timestamp\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"2026-05-18T20:00:00.000Z\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"runtime\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"codex\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "}"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"event\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"codex.thread.started\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"timestamp\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"2026-05-18T20:00:01.123Z\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"thread_id\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"…\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "}"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"event\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"codex.turn.completed\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"timestamp\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"2026-05-18T20:00:30.000Z\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "}"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"event\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"runtime.finished\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"timestamp\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"2026-05-18T20:00:31.000Z\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"runtime\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"codex\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "\"status\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ":"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"succeeded\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "}"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Rules:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"One JSON object per line, terminated by ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\\n" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "timestamp" }),
				" is RFC 3339 / ISO 8601 UTC. Consumers may also accept ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "ts" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "time" }),
				", or ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "at" }),
				" as fallbacks."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "event" }),
				" (preferred) / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "kind" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "type" }),
				" carries the categorical label. Adapters namespace their own events under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime`.`verb" }),
				" (e.g. ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex.thread.started" }),
				"). The shared baseline is ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.started" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.finished" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Schemas above ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "event" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "timestamp" }),
				" are open: adapters MUST tolerate unknown keys; consumers MUST treat the parsed object as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Record<string, unknown>" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Append-only — no truncation, no rotation during a run." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"File path: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/events.ndjson" }),
				". Coexists with the post-run ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }),
				" summary; both are written."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }), " fs.watch everywhere, named-pipe subscription, polling."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "d5--selection-drives-a-footer-preview-line-on-focus-row-adapter-check",
			children: "D5 — Selection drives a footer preview line; on-focus-row adapter check"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Selecting a row in any pane updates a single ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "text" }),
			" footer line with that row's context. The Adapters pane additionally fires ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtimeRegistry.check(" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ")" }),
			" on selection, with a 5 s TTL and one-in-flight cap to prevent arrow-spam from flooding the registry. The result is appended to the same footer line."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This satisfies UH-46's literal acceptance line \"Refreshes ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check " }),
			"id`` on focus\" without crossing into UH-43 (mutations) or UH-47 (drilldown)."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }), " no-op selection, dedicated preview pane (deferred to UH-47), defer-until-UH-47."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "d6--tiered-failure-surface",
			children: "D6 — Tiered failure surface"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Failures get screen real estate proportional to severity:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Failure" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Surface" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/project.yaml" }), " absent"] }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Full-frame takeover with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh init" }),
				" hint"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Schema-malformed adapter / mission / sandbox file" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Per-row badge (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "✖" }),
				"/",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "?" }),
				") from the model layer"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "fs.watch" }), " error or dropped-event burst"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Sticky footer warning, auto-clears after 5 s" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Adapter ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "check" }),
				" returns failure"
			] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Footer preview line on adapter selection" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Transient loader throw" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Footer error, last-good snapshot stays on screen" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The takeover is the only modal failure surface, reserved for the one case that's truly unrecoverable without action (no harness to observe). Everything else stays in-place so the user can keep navigating and retry with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.em, { children: "Alternatives considered:" }), " silent (status quo), banner-everywhere, takeover-on-everything."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "4-runtime-selection--why-bun",
			children: "4. Runtime selection — why Bun"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Solid's JSX cannot be emitted by ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "tsc" }),
			" (Solid is Babel-only). ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "dist/cli.js" }),
			" is plain Node-compatible JavaScript with no ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
			" artifacts. The ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
			" subcommand spawns Bun as a child process with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun --preload @opentui/solid/preload src/tui/index.tsx" }),
			", so the Babel transform runs at module load. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "src/" }),
			" ships in the npm tarball via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "package.json#files" }),
			" because the TUI source imports shared harness, schema, and adapter modules from sibling source directories."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"If Bun is not on PATH, the CLI exits 1 with an install hint. Node-only deployments can keep using every other ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh" }),
			" subcommand — the TUI is the only Bun-dependent surface."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "5-lifecycle-invariants",
			children: "5. Lifecycle invariants"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Carried over from ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../research/tui-framework.md#6-renderer-lifecycle--cleanup-ordering",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/research/tui-framework.md §6" })
			}),
			":"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
				" is the only entry to terminal restoration. Never call ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "process.exit(0)" }),
				" without ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				" first — the terminal stays in raw mode."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				" is idempotent on a single instance (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_isDestroyed" }),
				" guard) but never call ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createCliRenderer" }),
				" twice in one process."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Cleanup order is fixed: process listeners removed → SIGINT/SIGTERM handlers detached → timers cleared → stdin cooked → stdout passthrough → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy" }),
				" event fires → renderable tree teardown → Zig core restores screen + cursor + kitty kb + mouse."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup()" }),
				" fires per-component on tree teardown (post-order). \"Renderer-wide\" cleanup (e.g. closing a websocket) goes on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.on(\"destroy\", …)" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "createDashboardState" }),
			" honors this: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "dispose()" }),
			" closes every watcher, clears the debounce + watcher-warning timers, and disposes the Solid root. The Dashboard component calls ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "dispose()" }),
			" from ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "6-fswatch-contract",
			children: "6. fs.watch contract"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "createDashboardState(root)" }), " opens three watchers:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Target" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Triggers reload on" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Adapter manifest add/remove/edit" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Mission directory add/remove + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mission.yaml" }),
				" edits"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/sandboxes/" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "index.yaml" }), " edits + per-sandbox subtree changes"] })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Events from any watcher feed a 200 ms debounce. The debounce window is exposed via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "DEBOUNCE_MS" }),
			" so tests can override. The watcher factory is exposed via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "WatcherFactory" }),
			" so tests inject deterministic event sources without spinning real ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "fs.watch" }),
			" handles."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"macOS ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "kqueue" }),
			" drops events under heavy churn (~50/sec sustained). Mitigation: the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
			" keybind triggers an immediate ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "refresh()" }),
			" that bypasses the debounce. The watcher-warning footer surfaces watcher errors so users know when to press ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "7-selection--cache",
			children: "7. Selection + cache"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "state.ts" }), " exposes:"] }),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectAdapter"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(row)   state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectedAdapter"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectMission"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(row)   state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectedMission"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectSandbox"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(row)   state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "selectedSandbox"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "adapterCheck"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(id)            "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "// sync read, may return null"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "state."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "refreshAdapterCheck"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(id)     "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "// async, deduplicated, 5 s TTL"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The dashboard wires ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "<select onChange>" }),
			" to the setters, and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "createEffect" }),
			" on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "selectedAdapter" }),
			" to fire the check. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "createMemo" }),
			" on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "selectedMission" }),
			" powers the soft miller link to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "selectedSandbox" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "8-future-slice-hooks",
			children: "8. Future-slice hooks"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Slice" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "What it adds" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "What this doc commits" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-47" }), " Mission browser"] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Drilldown view with ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }),
					" and ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "diff" })
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "Enter" }), " on a mission row opens the detail view"] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-44" }), " Mission run flow"] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Live ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
					" consumer + subprocess trigger"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Contract in §3 D4 above; adapters already emit the NDJSON" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-43" }), " Adapter + sandbox manager"] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "c" }),
					" create / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }),
					" discard / re-check"
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Reserves ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "c d" }),
					" (and a keymap discipline TBD in UH-43's grill)"
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-42" }), " Polish"] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Keymap overlay (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "?" }),
					"), theming, error UX, state persistence"
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["XDG state path: ", (0, import_jsx_runtime.jsx)(_components.code, { children: "~/.config/uh/tui-state.json" })] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "9-out-of-scope",
			children: "9. Out of scope"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Remote sessions (someone else's harness over SSH / WebSocket) — local only." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Editing mission packets from the TUI — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mission.yaml" }),
				" is read-only here."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A web UI / static dashboard — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/ROADMAP.md" }),
				" remains the canonical written index; ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
				" is the live one."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A custom renderer or bundler — runtime Babel via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bun --preload" }),
				" is the only build path."
			] }),
			"\n"
		] })
	] });
}
function MDXContent(props = {}) {
	const { wrapper: MDXLayout } = props.components || {};
	return MDXLayout ? (0, import_jsx_runtime.jsx)(MDXLayout, {
		...props,
		children: (0, import_jsx_runtime.jsx)(_createMdxContent, { ...props })
	}) : _createMdxContent(props);
}
//#endregion
export { tui_exports as a, toc as i, frontmatter as n, structuredData as r, MDXContent as t };
