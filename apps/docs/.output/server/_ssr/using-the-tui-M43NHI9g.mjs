import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/using-the-tui-M43NHI9g.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var using_the_tui_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Using `uh tui`",
	"description": "Operator runbook for the interactive Mission Control terminal UI. Covers"
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Operator runbook for the interactive Mission Control terminal UI. Covers\nthe keymap, every screen, the run flow, the sandbox manager, and where\nstate lives on disk."
		},
		{
			"heading": void 0,
			"content": "Last updated: 2026-05-18. Closes UH-41 polish (UH-42 final slice)."
		},
		{
			"heading": "1-launch",
			"content": "Requirements:"
		},
		{
			"heading": "1-launch",
			"content": "**Bun** ≥ 1.3.x on PATH. The CLI exits 1 with an install hint when\nBun is missing (`curl -fsSL https://bun.sh/install | bash`)."
		},
		{
			"heading": "1-launch",
			"content": "A `.harness/project.yaml` in the target root. Without it, the TUI\nshows a full-screen takeover with the `uh init` hint."
		},
		{
			"heading": "1-launch",
			"content": "Every other `uh` subcommand runs under Node — Bun is only required for\nthe TUI surface."
		},
		{
			"heading": "2-dashboard-default-screen",
			"content": "Pane focus is mnemonic: `a` / `m` / `s`. `Tab` cycles. Selecting a\nmission scrolls the Sandboxes pane to the bound sandbox via the\nexisting `sandboxes[].mission_id` relationship."
		},
		{
			"heading": "keymap",
			"content": "Key"
		},
		{
			"heading": "keymap",
			"content": "Action"
		},
		{
			"heading": "keymap",
			"content": "`a` / `m` / `s`"
		},
		{
			"heading": "keymap",
			"content": "Focus Adapters / Missions / Sandboxes pane"
		},
		{
			"heading": "keymap",
			"content": "`Tab`"
		},
		{
			"heading": "keymap",
			"content": "Cycle focus forward"
		},
		{
			"heading": "keymap",
			"content": "`Enter`"
		},
		{
			"heading": "keymap",
			"content": "Open mission detail (Missions pane)"
		},
		{
			"heading": "keymap",
			"content": "`R` (Shift+r)"
		},
		{
			"heading": "keymap",
			"content": "Open the Run mission dialog"
		},
		{
			"heading": "keymap",
			"content": "`c`"
		},
		{
			"heading": "keymap",
			"content": "Force re-check the focused adapter"
		},
		{
			"heading": "keymap",
			"content": "`n`"
		},
		{
			"heading": "keymap",
			"content": "New sandbox dialog (Sandboxes pane)"
		},
		{
			"heading": "keymap",
			"content": "`d`"
		},
		{
			"heading": "keymap",
			"content": "Discard focused sandbox (with confirm)"
		},
		{
			"heading": "keymap",
			"content": "`r`"
		},
		{
			"heading": "keymap",
			"content": "Force-refresh now (bypasses fs.watch debounce)"
		},
		{
			"heading": "keymap",
			"content": "`?`"
		},
		{
			"heading": "keymap",
			"content": "Toggle keymap overlay"
		},
		{
			"heading": "keymap",
			"content": "`q`"
		},
		{
			"heading": "keymap",
			"content": "Quit (restores terminal)"
		},
		{
			"heading": "keymap",
			"content": "`Ctrl+C`"
		},
		{
			"heading": "keymap",
			"content": "Force-quit"
		},
		{
			"heading": "status-badges",
			"content": "Glyph"
		},
		{
			"heading": "status-badges",
			"content": "Adapters"
		},
		{
			"heading": "status-badges",
			"content": "Missions"
		},
		{
			"heading": "status-badges",
			"content": "Sandboxes"
		},
		{
			"heading": "status-badges",
			"content": "`●`"
		},
		{
			"heading": "status-badges",
			"content": "active"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "dirty"
		},
		{
			"heading": "status-badges",
			"content": "`◐`"
		},
		{
			"heading": "status-badges",
			"content": "experimental"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "`○`"
		},
		{
			"heading": "status-badges",
			"content": "deprecated"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "created"
		},
		{
			"heading": "status-badges",
			"content": "`✓`"
		},
		{
			"heading": "status-badges",
			"content": "check ok"
		},
		{
			"heading": "status-badges",
			"content": "valid"
		},
		{
			"heading": "status-badges",
			"content": "verified"
		},
		{
			"heading": "status-badges",
			"content": "`✖`"
		},
		{
			"heading": "status-badges",
			"content": "error"
		},
		{
			"heading": "status-badges",
			"content": "invalid"
		},
		{
			"heading": "status-badges",
			"content": "discarded"
		},
		{
			"heading": "status-badges",
			"content": "`?`"
		},
		{
			"heading": "status-badges",
			"content": "unknown"
		},
		{
			"heading": "status-badges",
			"content": "missing yaml"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "`▶`"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "running"
		},
		{
			"heading": "status-badges",
			"content": "`★`"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "—"
		},
		{
			"heading": "status-badges",
			"content": "promoted"
		},
		{
			"heading": "footer-preview-line",
			"content": "The footer prints a one-line preview of the currently selected row.\nSelecting an adapter additionally fires `runtimeRegistry.check(`id`)`\nwith a 5-second TTL cache and one-in-flight cap, so arrow-spamming the\nlist never floods the registry."
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Failure"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Surface"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "`.harness/project.yaml` absent"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Full-screen takeover"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Schema-malformed adapter/mission/sandbox"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Per-row badge"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "`fs.watch` error / dropped-event burst"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Sticky footer warning (5 s)"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Adapter `check` failure"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Footer preview line on selection"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Transient loader throw"
		},
		{
			"heading": "tiered-failure-surface",
			"content": "Footer error; last-good snapshot stays"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "Each artifact renders with the right OpenTUI renderable:"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "Artifact"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "Viewer"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`mission.yaml`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`code` (yaml, tree-sitter highlight)"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`runtime-session.yaml`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`code` (yaml)"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`runtime-result.yaml`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`code` (yaml)"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`runtime-final.txt`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`scrollbox` + `text`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`prompt.md`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`scrollbox` + `text`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`diff.patch`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`diff` (unified, line numbers, colorized)"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`events.ndjson`"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "`scrollbox` (newest-first replay)"
		},
		{
			"heading": "3-mission-detail-enter-on-a-mission",
			"content": "Missing artifacts render an inline \"not present for this mission\" hint\nso empty states stay distinguishable from load errors."
		},
		{
			"heading": "keymap-1",
			"content": "Key"
		},
		{
			"heading": "keymap-1",
			"content": "Action"
		},
		{
			"heading": "keymap-1",
			"content": "`j` / `↓`"
		},
		{
			"heading": "keymap-1",
			"content": "Next artifact"
		},
		{
			"heading": "keymap-1",
			"content": "`k` / `↑`"
		},
		{
			"heading": "keymap-1",
			"content": "Previous artifact"
		},
		{
			"heading": "keymap-1",
			"content": "`g`"
		},
		{
			"heading": "keymap-1",
			"content": "Jump to first artifact"
		},
		{
			"heading": "keymap-1",
			"content": "`Shift+G`"
		},
		{
			"heading": "keymap-1",
			"content": "Jump to last artifact"
		},
		{
			"heading": "keymap-1",
			"content": "`Enter`"
		},
		{
			"heading": "keymap-1",
			"content": "Focus viewer pane"
		},
		{
			"heading": "keymap-1",
			"content": "`Tab`"
		},
		{
			"heading": "keymap-1",
			"content": "Swap artifact/viewer focus"
		},
		{
			"heading": "keymap-1",
			"content": "`R` (Shift+r)"
		},
		{
			"heading": "keymap-1",
			"content": "Open the Run mission dialog"
		},
		{
			"heading": "keymap-1",
			"content": "`S` (Shift+s)"
		},
		{
			"heading": "keymap-1",
			"content": "Stop the active run (SIGTERM)"
		},
		{
			"heading": "keymap-1",
			"content": "`L` (Shift+l)"
		},
		{
			"heading": "keymap-1",
			"content": "Toggle the Live events panel"
		},
		{
			"heading": "keymap-1",
			"content": "`Esc`"
		},
		{
			"heading": "keymap-1",
			"content": "Back to dashboard"
		},
		{
			"heading": "keymap-1",
			"content": "`?`"
		},
		{
			"heading": "keymap-1",
			"content": "Keymap overlay"
		},
		{
			"heading": "keymap-1",
			"content": "`q`"
		},
		{
			"heading": "keymap-1",
			"content": "Quit"
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`R` opens the Run dialog:"
		},
		{
			"heading": "4-run-mission-flow",
			"content": "Arrow keys cycle the runtime."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`Tab` toggles `--no-sandbox`."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`Enter` spawns `uh mission run `mission.yaml`--runtime`r\\`\\` (with\n`--no-sandbox` when toggled on) as a child process; the TUI tails\n`.harness/missions/`id`/events.ndjson` for live updates."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`Esc` cancels without starting."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "While a run is active, the mission detail's right pane swaps to a\n**Live events** ScrollBox that auto-scrolls to the bottom:"
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`S` (Shift+s) sends SIGTERM to the child; status becomes `cancelled`."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "`L` (Shift+l) toggles the panel (e.g. to inspect the diff again)."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "The live history is capped at 500 events; older lines drop off the\nfront but stay on disk for post-run review."
		},
		{
			"heading": "4-run-mission-flow",
			"content": "NDJSON contract is documented in\n`docs/architecture/tui.md §3 D4`. Every\nadapter (`hermes`, `codex`, `hermes-proxy`, `oh-my-pi`) already emits\n`runtime.started`, namespaced per-step events\n(`codex.thread.started`, etc.), and `runtime.finished`."
		},
		{
			"heading": "create",
			"content": "`n` from the Sandboxes pane opens:"
		},
		{
			"heading": "create",
			"content": "The mission id defaults to the currently selected mission."
		},
		{
			"heading": "create",
			"content": "Enter on any field submits."
		},
		{
			"heading": "create",
			"content": "The TUI calls `createSandbox(root, {id, missionId, baseRef})` from\n`src/harness/sandbox.ts` — the same implementation that backs\n`uh sandbox create`."
		},
		{
			"heading": "discard",
			"content": "`d` on the selected sandbox opens a confirm modal:"
		},
		{
			"heading": "discard",
			"content": "`F` toggles the `--force` flag, required for dirty worktrees. `Enter`\ncalls `discardSandbox(root, id, { force })`."
		},
		{
			"heading": "6-adapter-manager",
			"content": "The Adapters pane is read-only with one live action:"
		},
		{
			"heading": "6-adapter-manager",
			"content": "`c` force-rechecks the focused adapter. This drops the 5-second cache\nTTL and calls `runtimeRegistry.check(root, `id`)` again. The result\nappears on the footer preview line."
		},
		{
			"heading": "6-adapter-manager",
			"content": "Editing a manifest in `$EDITOR` (the original UH-42 scope item `e`) is\nintentionally deferred — suspending and restoring the OpenTUI renderer\naround a child editor process is non-trivial and lives in a follow-up\nslice. In the meantime, edit the file in another terminal and press `r`\nto refresh."
		},
		{
			"heading": "7-persistence",
			"content": "Per-project TUI state is persisted to\n`$XDG_CONFIG_HOME/uh/tui-state.json` (defaulting to\n`~/.config/uh/tui-state.json`). The file is shared across all repos —\none record per absolute project root."
		},
		{
			"heading": "7-persistence",
			"content": "Persisted fields:"
		},
		{
			"heading": "7-persistence",
			"content": "Selections are restored on next launch when the matching rows are still\npresent in the snapshot. Missing rows are silently dropped — no error.\nWrites are atomic via a temp-file + `rename`, so a crashed `uh tui`\nnever leaves a half-written state file."
		},
		{
			"heading": "7-persistence",
			"content": "To opt out, delete the file or unset selections; the TUI works\nidentically without persistence (e.g. in CI)."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`docs/architecture/tui.md` — the load-bearing decisions doc."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/README.md` — file responsibilities."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`docs/research/tui-framework.md` — the OpenTUI/Solid spike record."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/model.ts` — pure async readers (snapshot + mission detail)."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/state.ts` — Solid signals + fs watchers + run state +\nsandbox/adapter actions + persistence."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/run-events.ts` / `run-orchestrator.ts` / `run-session.ts` —\nNDJSON tailer + subprocess spawner + composition."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/persistence.ts` — XDG-aware JSON file for last selections."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/keymap.ts` — single source of truth for keybindings."
		},
		{
			"heading": "8-architecture-pointers",
			"content": "`src/tui/dashboard.tsx` — view + key handler."
		},
		{
			"heading": "9-agent-skill",
			"content": "Future agent work on the TUI is best done with the OpenTUI Agent Skill:"
		},
		{
			"heading": "9-agent-skill",
			"content": "Installs to `~/.agents/skills/opentui/`; downstream subagents pick it up\nautomatically. See `docs/research/tui-framework.md §7` for verification\nnotes."
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "Items from the UH-42 Linear scope that are explicitly deferred:"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "Item"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "Status"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "Tracking"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "`?` keymap overlay"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "shipped"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "UH-42 (this issue), PR #61"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "State persistence"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "shipped"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "UH-42, this PR"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "`UH_TUI_THEME` env"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "coming soon"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "file a follow-up issue under UH-42"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "`$EDITOR` open"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "coming soon"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "requires renderer suspend/resume; same"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "Ctrl+Z suspend"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "coming soon"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "same — needs renderer.pause/resume"
		},
		{
			"heading": "10-deferred-polish-out-of-this-slice",
			"content": "OpenTUI exposes `renderer.getPalette()` and an event for resize but no\nsuspend/resume primitive at the time of writing. When that lands\nupstream we can ship the deferred items as a single follow-up polish\nslice."
		}
	],
	"headings": [
		{
			"id": "1-launch",
			"content": "1\\. Launch"
		},
		{
			"id": "2-dashboard-default-screen",
			"content": "2\\. Dashboard (default screen)"
		},
		{
			"id": "keymap",
			"content": "Keymap"
		},
		{
			"id": "status-badges",
			"content": "Status badges"
		},
		{
			"id": "footer-preview-line",
			"content": "Footer preview line"
		},
		{
			"id": "tiered-failure-surface",
			"content": "Tiered failure surface"
		},
		{
			"id": "3-mission-detail-enter-on-a-mission",
			"content": "3\\. Mission detail (Enter on a mission)"
		},
		{
			"id": "keymap-1",
			"content": "Keymap"
		},
		{
			"id": "4-run-mission-flow",
			"content": "4\\. Run mission flow"
		},
		{
			"id": "5-sandbox-manager",
			"content": "5\\. Sandbox manager"
		},
		{
			"id": "create",
			"content": "Create"
		},
		{
			"id": "discard",
			"content": "Discard"
		},
		{
			"id": "6-adapter-manager",
			"content": "6\\. Adapter manager"
		},
		{
			"id": "7-persistence",
			"content": "7\\. Persistence"
		},
		{
			"id": "8-architecture-pointers",
			"content": "8\\. Architecture pointers"
		},
		{
			"id": "9-agent-skill",
			"content": "9\\. Agent skill"
		},
		{
			"id": "10-deferred-polish-out-of-this-slice",
			"content": "10\\. Deferred polish (out of this slice)"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#1-launch",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "1. Launch" })
	},
	{
		depth: 2,
		url: "#2-dashboard-default-screen",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "2. Dashboard (default screen)" })
	},
	{
		depth: 3,
		url: "#keymap",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Keymap" })
	},
	{
		depth: 3,
		url: "#status-badges",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Status badges" })
	},
	{
		depth: 3,
		url: "#footer-preview-line",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Footer preview line" })
	},
	{
		depth: 3,
		url: "#tiered-failure-surface",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Tiered failure surface" })
	},
	{
		depth: 2,
		url: "#3-mission-detail-enter-on-a-mission",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "3. Mission detail (Enter on a mission)" })
	},
	{
		depth: 3,
		url: "#keymap-1",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Keymap" })
	},
	{
		depth: 2,
		url: "#4-run-mission-flow",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4. Run mission flow" })
	},
	{
		depth: 2,
		url: "#5-sandbox-manager",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "5. Sandbox manager" })
	},
	{
		depth: 3,
		url: "#create",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Create" })
	},
	{
		depth: 3,
		url: "#discard",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Discard" })
	},
	{
		depth: 2,
		url: "#6-adapter-manager",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6. Adapter manager" })
	},
	{
		depth: 2,
		url: "#7-persistence",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "7. Persistence" })
	},
	{
		depth: 2,
		url: "#8-architecture-pointers",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "8. Architecture pointers" })
	},
	{
		depth: 2,
		url: "#9-agent-skill",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "9. Agent skill" })
	},
	{
		depth: 2,
		url: "#10-deferred-polish-out-of-this-slice",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "10. Deferred polish (out of this slice)" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		h2: "h2",
		h3: "h3",
		hr: "hr",
		li: "li",
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
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Operator runbook for the interactive Mission Control terminal UI. Covers\nthe keymap, every screen, the run flow, the sandbox manager, and where\nstate lives on disk." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Last updated: 2026-05-18. Closes UH-41 polish (UH-42 final slice)." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "1-launch",
			children: "1. Launch"
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"m 4,4 a 1,1 0 0 0 -0.7070312,0.2929687 1,1 0 0 0 0,1.4140625 L 8.5859375,11 3.2929688,16.292969 a 1,1 0 0 0 0,1.414062 1,1 0 0 0 1.4140624,0 l 5.9999998,-6 a 1.0001,1.0001 0 0 0 0,-1.414062 L 4.7070312,4.2929687 A 1,1 0 0 0 4,4 Z m 8,14 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 8 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "uh"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " tui"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "                # mission control, watches .harness/ live"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "uh"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " tui"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " --root"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " /path"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "   # point at a different repo"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "uh"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " tui"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " --once"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "         # render one frame and exit (CI / docs / smoke)"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "uh"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " tui"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " --help"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "         # print options"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Requirements:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Bun" }),
				" ≥ 1.3.x on PATH. The CLI exits 1 with an install hint when\nBun is missing (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "curl -fsSL https://bun.sh/install | bash" }),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/project.yaml" }),
				" in the target root. Without it, the TUI\nshows a full-screen takeover with the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh init" }),
				" hint."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Every other ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh" }),
			" subcommand runs under Node — Bun is only required for\nthe TUI surface."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "2-dashboard-default-screen",
			children: "2. Dashboard (default screen)"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Adapters [a] ───┬─ Missions [m] ◀ ────────────┬─ Sandboxes [s] ───┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  ● codex         │  ✓ codex-e2e-smoke          │  ● sbx-feature-x  │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  ● hermes        │  ✓ hermes-proxy-smoke       │  ○ sbx-clean      │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  ● hermes-proxy  │  ? mission-without-yaml     │                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│  ◐ oh-my-pi      │                             │                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└──────────────────┴─────────────────────────────┴───────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "preview line · synced 2026-05-18T…  · ultimate-harness" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "a/m/s focus · Tab cycle · Enter detail · R run · c check · n new · d" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "discard · r refresh · ? help · q quit" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Pane focus is mnemonic: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "a" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "m" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "s" }),
			". ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Tab" }),
			" cycles. Selecting a\nmission scrolls the Sandboxes pane to the bound sandbox via the\nexisting ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "sandboxes[].mission_id" }),
			" relationship."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "keymap",
			children: "Keymap"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Key" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Action" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "a" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "m" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "s" })
			] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Focus Adapters / Missions / Sandboxes pane" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Tab" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Cycle focus forward" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Enter" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Open mission detail (Missions pane)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "R" }), " (Shift+r)"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Open the Run mission dialog" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "c" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Force re-check the focused adapter" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "n" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "New sandbox dialog (Sandboxes pane)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "d" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Discard focused sandbox (with confirm)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "r" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Force-refresh now (bypasses fs.watch debounce)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "?" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Toggle keymap overlay" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "q" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Quit (restores terminal)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Ctrl+C" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Force-quit" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "status-badges",
			children: "Status badges"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Glyph" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Adapters" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Missions" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Sandboxes" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "●" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "active" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "dirty" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "◐" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "experimental" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "○" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "deprecated" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "created" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "✓" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "check ok" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "valid" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "verified" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "✖" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "error" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "invalid" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "discarded" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "?" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "unknown" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "missing yaml" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "▶" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "running" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "★" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "—" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "promoted" })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "footer-preview-line",
			children: "Footer preview line"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The footer prints a one-line preview of the currently selected row.\nSelecting an adapter additionally fires ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtimeRegistry.check(" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ")" }),
			"\nwith a 5-second TTL cache and one-in-flight cap, so arrow-spamming the\nlist never floods the registry."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "tiered-failure-surface",
			children: "Tiered failure surface"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Failure" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Surface" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/project.yaml" }), " absent"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Full-screen takeover" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Schema-malformed adapter/mission/sandbox" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Per-row badge" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "fs.watch" }), " error / dropped-event burst"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Sticky footer warning (5 s)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Adapter ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "check" }),
				" failure"
			] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Footer preview line on selection" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Transient loader throw" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Footer error; last-good snapshot stays" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "3-mission-detail-enter-on-a-mission",
			children: "3. Mission detail (Enter on a mission)"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Mission detail ────────────────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ codex-e2e-smoke · workflow=research-docs · runtime-result=succeeded │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└─────────────────────────────────────────────────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Artifacts ◀ ─────┬─ mission.yaml ──────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Y mission.yaml    │ schema_version: uh.mission.v0               │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Y runtime-session…│ id: codex-e2e-smoke                         │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Y runtime-result…│ workflow_profile: research-docs              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ T runtime-final…  │ ...                                          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ T prompt.md       │                                              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ D diff.patch      │                                              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ E events.ndjson   │                                              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└───────────────────┴──────────────────────────────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "j/k or arrows · Enter focus viewer · Tab swap · g/Shift+G top/bottom" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "· R run · S stop · L live · Esc back · ? help · q quit" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Each artifact renders with the right OpenTUI renderable:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Artifact" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Viewer" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "mission.yaml" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }), " (yaml, tree-sitter highlight)"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }), " (yaml)"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.yaml" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }), " (yaml)"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "scrollbox" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "text" })
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "prompt.md" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "scrollbox" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "text" })
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "diff.patch" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "diff" }), " (unified, line numbers, colorized)"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "scrollbox" }), " (newest-first replay)"] })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Missing artifacts render an inline \"not present for this mission\" hint\nso empty states stay distinguishable from load errors." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "keymap-1",
			children: "Keymap"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Key" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Action" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "j" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "↓" })
			] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Next artifact" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "k" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "↑" })
			] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Previous artifact" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "g" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Jump to first artifact" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Shift+G" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Jump to last artifact" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Enter" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Focus viewer pane" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Tab" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Swap artifact/viewer focus" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "R" }), " (Shift+r)"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Open the Run mission dialog" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "S" }), " (Shift+s)"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Stop the active run (SIGTERM)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "L" }), " (Shift+l)"] }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Toggle the Live events panel" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Esc" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Back to dashboard" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "?" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Keymap overlay" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "q" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Quit" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "4-run-mission-flow",
			children: "4. Run mission flow"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "R" }), " opens the Run dialog:"] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Run mission ─────────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Mission: codex-e2e-smoke                              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Runtime (←/→ to change):                              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│   [hermes]  codex   oh-my-pi   hermes-proxy           │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Sandbox: [auto-route] (Tab to toggle)                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Enter to start · Esc to cancel                        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└───────────────────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Arrow keys cycle the runtime." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Tab" }),
				" toggles ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--no-sandbox" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Enter" }),
				" spawns ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh mission run " }),
				"mission.yaml",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--runtime" }),
				"r`` (with\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--no-sandbox" }),
				" when toggled on) as a child process; the TUI tails\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/events.ndjson" }),
				" for live updates."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "Esc" }), " cancels without starting."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"While a run is active, the mission detail's right pane swaps to a\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Live events" }),
			" ScrollBox that auto-scrolls to the bottom:"
		] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Live events · ▶ running · codex-e2e-smoke ─────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ started=2026-05-18T20:00:00Z  finished=—  events=12     │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ 20:00:00  runtime.started                                │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ 20:00:01  codex.thread.started                           │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ 20:00:02  codex.user_message                             │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ 20:00:30  codex.turn.completed                           │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ 20:00:31  runtime.finished                               │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└─────────────────────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "S" }),
				" (Shift+s) sends SIGTERM to the child; status becomes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "cancelled" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "L" }), " (Shift+l) toggles the panel (e.g. to inspect the diff again)."] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "The live history is capped at 500 events; older lines drop off the\nfront but stay on disk for post-run review." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"NDJSON contract is documented in\n",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../architecture/tui.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/tui.md §3 D4" })
			}),
			". Every\nadapter (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }),
			") already emits\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.started" }),
			", namespaced per-step events\n(",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex.thread.started" }),
			", etc.), and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.finished" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "5-sandbox-manager",
			children: "5. Sandbox manager"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "create",
			children: "Create"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "n" }), " from the Sandboxes pane opens:"] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Create sandbox ───────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Field (Tab cycles): id                                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Sandbox id: ▏                                          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Mission id: codex-e2e-smoke                            │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Base ref (optional, defaults to HEAD): ▏               │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Enter to submit · Tab to cycle · Esc to cancel         │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└────────────────────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "The mission id defaults to the currently selected mission." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Enter on any field submits." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The TUI calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createSandbox(root, {id, missionId, baseRef})" }),
				" from\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/harness/sandbox.ts" }),
				" — the same implementation that backs\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh sandbox create" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "discard",
			children: "Discard"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }), " on the selected sandbox opens a confirm modal:"] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "┌─ Discard sandbox ──────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Sandbox: sbx-feature-x                                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Mission: codex-e2e-smoke  ·  Backend: git-worktree  ·  │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Status: created                                        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Force (--force): off  (press F to toggle)              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "│ Enter to confirm · Esc to cancel                       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "└────────────────────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "F" }),
			" toggles the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--force" }),
			" flag, required for dirty worktrees. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Enter" }),
			"\ncalls ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "discardSandbox(root, id, { force })" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "6-adapter-manager",
			children: "6. Adapter manager"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The Adapters pane is read-only with one live action:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "c" }),
				" force-rechecks the focused adapter. This drops the 5-second cache\nTTL and calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtimeRegistry.check(root, " }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ")" }),
				" again. The result\nappears on the footer preview line."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Editing a manifest in ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "$EDITOR" }),
			" (the original UH-42 scope item ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "e" }),
			") is\nintentionally deferred — suspending and restoring the OpenTUI renderer\naround a child editor process is non-trivial and lives in a follow-up\nslice. In the meantime, edit the file in another terminal and press ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
			"\nto refresh."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "7-persistence",
			children: "7. Persistence"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Per-project TUI state is persisted to\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "$XDG_CONFIG_HOME/uh/tui-state.json" }),
			" (defaulting to\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.config/uh/tui-state.json" }),
			"). The file is shared across all repos —\none record per absolute project root."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Persisted fields:" }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "{"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "  \"schema_version\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"uh.tui-state.v0\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "  \"projects\""
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ": {"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "    \"/Users/me/AgenticEngineering/ultimate-harness\""
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ": {"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "      \"selectedAdapterId\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
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
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "      \"selectedMissionId\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"codex-e2e-smoke\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "      \"selectedSandboxId\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"sbx-feature-x\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "      \"activeView\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"dashboard\""
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "    }"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  }"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "}"
					})
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Selections are restored on next launch when the matching rows are still\npresent in the snapshot. Missing rows are silently dropped — no error.\nWrites are atomic via a temp-file + ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "rename" }),
			", so a crashed ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
			"\nnever leaves a half-written state file."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "To opt out, delete the file or unset selections; the TUI works\nidentically without persistence (e.g. in CI)." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.hr, {}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "8-architecture-pointers",
			children: "8. Architecture pointers"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/tui.md" }), " — the load-bearing decisions doc."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/README.md" }), " — file responsibilities."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/research/tui-framework.md" }), " — the OpenTUI/Solid spike record."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/model.ts" }), " — pure async readers (snapshot + mission detail)."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/state.ts" }), " — Solid signals + fs watchers + run state +\nsandbox/adapter actions + persistence."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/run-events.ts" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "run-orchestrator.ts" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "run-session.ts" }),
				" —\nNDJSON tailer + subprocess spawner + composition."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/persistence.ts" }), " — XDG-aware JSON file for last selections."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/keymap.ts" }), " — single source of truth for keybindings."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/tui/dashboard.tsx" }), " — view + key handler."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "9-agent-skill",
			children: "9. Agent skill"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Future agent work on the TUI is best done with the OpenTUI Agent Skill:" }),
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
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: (0, import_jsx_runtime.jsx)(_components.span, {
				className: "line",
				children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ npx skills add anomalyco/opentui --skill opentui -g" })
			}) })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Installs to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.agents/skills/opentui/" }),
			"; downstream subagents pick it up\nautomatically. See ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/research/tui-framework.md §7" }),
			" for verification\nnotes."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "10-deferred-polish-out-of-this-slice",
			children: "10. Deferred polish (out of this slice)"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Items from the UH-42 Linear scope that are explicitly deferred:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Item" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Status" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Tracking" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "?" }), " keymap overlay"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "shipped" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-42 (this issue), PR #61" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "State persistence" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "shipped" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-42, this PR" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "UH_TUI_THEME" }), " env"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "coming soon" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "file a follow-up issue under UH-42" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "$EDITOR" }), " open"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "coming soon" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "requires renderer suspend/resume; same" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Ctrl+Z suspend" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "coming soon" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "same — needs renderer.pause/resume" })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"OpenTUI exposes ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.getPalette()" }),
			" and an event for resize but no\nsuspend/resume primitive at the time of writing. When that lands\nupstream we can ship the deferred items as a single follow-up polish\nslice."
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
export { using_the_tui_exports as a, toc as i, frontmatter as n, structuredData as r, MDXContent as t };
