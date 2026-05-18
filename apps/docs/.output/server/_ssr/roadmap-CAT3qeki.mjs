import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/roadmap-CAT3qeki.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var roadmap_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Ultimate Harness — Roadmap",
	"description": "Last updated: 2026-05-18. Source of truth for issue state is [Linear](https://linear.app/agentic-eng); this file is a human-readable index."
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Last updated: 2026-05-18. Source of truth for issue state is Linear; this file is a human-readable index."
		},
		{
			"heading": "now",
			"content": "Epic 2 (Interactive TUI) shipped end-to-end. Three follow-up polish slices (UH-48 theming, UH-49 `$EDITOR`, UH-50 Ctrl+Z) plus two UX items (UH-51 screenshot pipeline, UH-52 check-age footer, UH-53 cancellation event) are filed in the backlog. Epic 1 (Hermes proxy adapter) shipped earlier in this session — see \"Shipped\" below."
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Build `uh tui` on OpenTUI — the same engine OpenCode uses in production (native Zig core, TypeScript bindings, Bun-first, MIT-licensed). Replaces today's `cat`-driven mission review with a navigable live terminal app using OpenTUI's `Diff`, `Code` (tree-sitter), `ScrollBox`, `Select`, and `Input` components."
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Step"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Issue"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Slice"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Size"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Status"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "1"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-45"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Spike: install opentui, framework choice (vanilla / React / Solid), hello-world bound to UH state"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "S"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — Solid won; see `docs/research/tui-framework.md`"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "2"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-46"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Dashboard: live adapters + missions + sandboxes (three-pane)"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "M"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — Mission Control dashboard; see #57 + `docs/architecture/tui.md`"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "3"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-47"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Mission browser: drilldown with `Code` + `Diff` viewers"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "M"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — read-only mission artifact drilldown; see #59"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "4"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-44"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Mission run flow: trigger from TUI, stream events live"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "M"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — `R` opens a run dialog, live tail of `events.ndjson`, `S` stops via SIGTERM; see #63"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "5"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-43"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Adapter + sandbox manager: live checks, create/discard from inside"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "M"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — `c` re-check, `n` create-sandbox dialog, `d` discard with `F` force toggle; see #64"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "6"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "UH-42"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Polish: keymap overlay, theming, error states, exit handling, Agent Skill install"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "S"
		},
		{
			"heading": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "**shipped** — `?` overlay, per-project state persistence, operator runbook; see #61 + #65. Theming / `$EDITOR` / Ctrl+Z spun out as UH-48 / UH-49 / UH-50."
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Adapter promoted to `status: active` on 2026-05-18 after live E2E smoke against `hermes proxy start --provider nous`. ToS-positioned subscription routing now first-class alongside hermes / codex / oh-my-pi."
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Step"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Issue"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Slice"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "PR"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "1"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-36"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Wire-format spike + recommendation"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#49"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "2"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-35"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Schema + manifest + template + dispatch stub"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#50"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "3"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-39"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Adapter impl: planner, runner, SSE parser, sentinel, blocked classification"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#51"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "4"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-37"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Live HTTP `adapter check` probe"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#53"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "5"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-40"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Architecture doc + setup runbook"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#54"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "6"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "UH-38"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "E2E smoke + promote to `status: active`"
		},
		{
			"heading": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "#55"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "Issue"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "Title"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "PR"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-45"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI spike: opentui framework selection + hello-world"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#52"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-46"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI dashboard: live adapters + missions + sandboxes"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#57"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-47"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI mission browser: drilldown with Code + Diff viewers"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#59"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-44"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI mission run flow with live `events.ndjson` tail"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#63"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-43"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI adapter + sandbox manager (create/discard/recheck)"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#64"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "UH-42"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "TUI polish: keymap overlay (`?`) + per-project persistence + runbook"
		},
		{
			"heading": "other-slices-this-cycle",
			"content": "#61 + #65"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Issue"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Title"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-23"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Codex adapter — CLI transport via `codex exec`"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-24"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Cancelled (Anthropic ToS friction; superseded by UH-27 + UH-32)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-25"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "oh-my-pi adapter + `runtime_config` bucket + dispatch table + sandbox routing parity"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-26"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Per-runtime strict `runtime_config` validation (typo safety)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-27"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Per-mission `runtime_config_overrides` + Anthropic-via-OMP path"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-28"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Runtime-final-message capture protocol (shared sentinel)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-29"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "`createSandbox` seeds bound mission into the worktree"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-30"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Codex CLI flag drift + child-stdin close + codex `status: active`"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-31"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Minimum Hermes ≥ 0.14.0 version pin"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-33"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "`runtime_config_overrides` parity for hermes + codex"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "UH-34"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Diff capture includes untracked new files"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "**Adapter status as of 2026-05-18:**"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Adapter"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Status"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "hermes"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "active (pinned ≥ 0.14.0)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "codex"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "active (verified against codex-cli 0.130.0 in UH-30 smoke)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "hermes-proxy"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "active (verified against `hermes proxy start --provider nous` in UH-38 smoke; manifest default `nousresearch/hermes-4-405b`)"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "oh-my-pi"
		},
		{
			"heading": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "experimental"
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "These are tracked in narrative form until they earn the priority to be filed:"
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Native ANTHROPIC\\_API\\_KEY adapter** — mostly superseded by UH-32 for subscription users; file only if pay-per-token demand surfaces."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**OpenRouter / Vercel AI Gateway adapter** — cheapest pay-per-token path; complementary to UH-32."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Cross-runtime QA harness** — `uh mission run-all --runtimes hermes,codex,oh-my-pi,hermes-proxy `file\\`\\` with side-by-side diff/sentinel comparison."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Sandbox backend abstraction** — `directory` and `container` backends alongside `git-worktree`."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Verify-then-promote auto-trigger** — opt-in workflow-driven auto-promote gate."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Cleanup design-only `claude-code` stub** — redundant after UH-27 + UH-32."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "**Filed follow-ups (Epic 2 polish):**"
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-48 — `UH_TUI_THEME` + palette-driven dark/light."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-49 — `e` open manifest in `$EDITOR` (requires renderer suspend/resume)."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-50 — Ctrl+Z suspend / `fg` resume."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-51 — automated TUI screenshot capture pipeline for docs."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-52 — surface adapter-check age in the footer."
		},
		{
			"heading": "medium-term-proposals-not-filed",
			"content": "UH-53 — adapters emit `runtime.cancelled` on SIGTERM so disk replay matches the TUI status."
		},
		{
			"heading": "strategic-decisions-needed",
			"content": "**Pi adapter implementation** — design-only stub today; tied to OMP cadence."
		},
		{
			"heading": "strategic-decisions-needed",
			"content": "**Mission capability declarations + adapter matching enforcement** — manifest `capabilities:` is advisory-only today."
		},
		{
			"heading": "strategic-decisions-needed",
			"content": "**Muta integration** — UH-as-consumer, UH-as-component, or independent? Needs a co-founder conversation."
		},
		{
			"heading": "references",
			"content": "Documentation home"
		},
		{
			"heading": "references",
			"content": "Architecture overview"
		},
		{
			"heading": "references",
			"content": "Runtime adapter contract (includes UH-28 sentinel protocol)"
		},
		{
			"heading": "references",
			"content": "Codex E2E smoke runbook"
		},
		{
			"heading": "references",
			"content": "Anthropic-via-OMP runbook (notes the ToS posture that UH-32's hermes-proxy supersedes)"
		}
	],
	"headings": [
		{
			"id": "now",
			"content": "Now"
		},
		{
			"id": "epic-2--interactive-tui-for-uh-uh-41",
			"content": "Epic 2 — Interactive TUI for UH (UH-41)"
		},
		{
			"id": "shipped-this-cycle-2026-05-17--2026-05-18",
			"content": "Shipped this cycle (2026-05-17 → 2026-05-18)"
		},
		{
			"id": "epic-1--hermes-proxy-adapter-uh-32--done",
			"content": "Epic 1 — Hermes proxy adapter (UH-32) — **DONE**"
		},
		{
			"id": "other-slices-this-cycle",
			"content": "Other slices this cycle"
		},
		{
			"id": "shipped-previous-cycle-2026-05-13--2026-05-17",
			"content": "Shipped previous cycle (2026-05-13 → 2026-05-17)"
		},
		{
			"id": "medium-term-proposals-not-filed",
			"content": "Medium-term proposals (not filed)"
		},
		{
			"id": "strategic-decisions-needed",
			"content": "Strategic (decisions needed)"
		},
		{
			"id": "references",
			"content": "References"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#now",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Now" })
	},
	{
		depth: 3,
		url: "#epic-2--interactive-tui-for-uh-uh-41",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			"Epic 2 — Interactive TUI for UH (",
			(0, import_jsx_runtime.jsx)("a", {
				href: "https://linear.app/agentic-eng/issue/UH-41",
				children: "UH-41"
			}),
			")"
		] })
	},
	{
		depth: 2,
		url: "#shipped-this-cycle-2026-05-17--2026-05-18",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Shipped this cycle (2026-05-17 → 2026-05-18)" })
	},
	{
		depth: 3,
		url: "#epic-1--hermes-proxy-adapter-uh-32--done",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			"Epic 1 — Hermes proxy adapter (",
			(0, import_jsx_runtime.jsx)("a", {
				href: "https://linear.app/agentic-eng/issue/UH-32",
				children: "UH-32"
			}),
			") — ",
			(0, import_jsx_runtime.jsx)("strong", { children: "DONE" })
		] })
	},
	{
		depth: 3,
		url: "#other-slices-this-cycle",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Other slices this cycle" })
	},
	{
		depth: 2,
		url: "#shipped-previous-cycle-2026-05-13--2026-05-17",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Shipped previous cycle (2026-05-13 → 2026-05-17)" })
	},
	{
		depth: 2,
		url: "#medium-term-proposals-not-filed",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Medium-term proposals (not filed)" })
	},
	{
		depth: 2,
		url: "#strategic-decisions-needed",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Strategic (decisions needed)" })
	},
	{
		depth: 2,
		url: "#references",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "References" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		h2: "h2",
		h3: "h3",
		li: "li",
		p: "p",
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
			"Last updated: 2026-05-18. Source of truth for issue state is ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng",
				children: "Linear"
			}),
			"; this file is a human-readable index."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "now",
			children: "Now"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Epic 2 (Interactive TUI) shipped end-to-end. Three follow-up polish slices (UH-48 theming, UH-49 ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "$EDITOR" }),
			", UH-50 Ctrl+Z) plus two UX items (UH-51 screenshot pipeline, UH-52 check-age footer, UH-53 cancellation event) are filed in the backlog. Epic 1 (Hermes proxy adapter) shipped earlier in this session — see \"Shipped\" below."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h3, {
			id: "epic-2--interactive-tui-for-uh-uh-41",
			children: [
				"Epic 2 — Interactive TUI for UH (",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-41",
					children: "UH-41"
				}),
				")"
			]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Build ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
			" on ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://opentui.com",
				children: "OpenTUI"
			}),
			" — the same engine OpenCode uses in production (native Zig core, TypeScript bindings, Bun-first, MIT-licensed). Replaces today's ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "cat" }),
			"-driven mission review with a navigable live terminal app using OpenTUI's ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Diff" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Code" }),
			" (tree-sitter), ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "ScrollBox" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Select" }),
			", and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Input" }),
			" components."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Step" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Issue" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Slice" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Size" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Status" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "1" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-45",
					children: "UH-45"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Spike: install opentui, framework choice (vanilla / React / Solid), hello-world bound to UH state" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "S" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — Solid won; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "./research/tui-framework.md",
						children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/research/tui-framework.md" })
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "2" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-46",
					children: "UH-46"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Dashboard: live adapters + missions + sandboxes (three-pane)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "M" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — Mission Control dashboard; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/57",
						children: "#57"
					}),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "./architecture/tui.md",
						children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/tui.md" })
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "3" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-47",
					children: "UH-47"
				}) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Mission browser: drilldown with ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "Code" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "Diff" }),
					" viewers"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "M" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — read-only mission artifact drilldown; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/59",
						children: "#59"
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "4" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-44",
					children: "UH-44"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Mission run flow: trigger from TUI, stream events live" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "M" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "R" }),
					" opens a run dialog, live tail of ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
					", ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "S" }),
					" stops via SIGTERM; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/63",
						children: "#63"
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "5" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-43",
					children: "UH-43"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Adapter + sandbox manager: live checks, create/discard from inside" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "M" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "c" }),
					" re-check, ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "n" }),
					" create-sandbox dialog, ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }),
					" discard with ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "F" }),
					" force toggle; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/64",
						children: "#64"
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "6" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-42",
					children: "UH-42"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Polish: keymap overlay, theming, error states, exit handling, Agent Skill install" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "S" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.strong, { children: "shipped" }),
					" — ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "?" }),
					" overlay, per-project state persistence, operator runbook; see ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61",
						children: "#61"
					}),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/65",
						children: "#65"
					}),
					". Theming / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "$EDITOR" }),
					" / Ctrl+Z spun out as UH-48 / UH-49 / UH-50."
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "shipped-this-cycle-2026-05-17--2026-05-18",
			children: "Shipped this cycle (2026-05-17 → 2026-05-18)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h3, {
			id: "epic-1--hermes-proxy-adapter-uh-32--done",
			children: [
				"Epic 1 — Hermes proxy adapter (",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-32",
					children: "UH-32"
				}),
				") — ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "DONE" })
			]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Adapter promoted to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "status: active" }),
			" on 2026-05-18 after live E2E smoke against ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy start --provider nous" }),
			". ToS-positioned subscription routing now first-class alongside hermes / codex / oh-my-pi."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Step" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Issue" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Slice" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "PR" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "1" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-36",
					children: "UH-36"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Wire-format spike + recommendation" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/49",
					children: "#49"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "2" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-35",
					children: "UH-35"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Schema + manifest + template + dispatch stub" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/50",
					children: "#50"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "3" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-39",
					children: "UH-39"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Adapter impl: planner, runner, SSE parser, sentinel, blocked classification" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/51",
					children: "#51"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "4" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-37",
					children: "UH-37"
				}) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Live HTTP ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check" }),
					" probe"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/53",
					children: "#53"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "5" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-40",
					children: "UH-40"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Architecture doc + setup runbook" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/54",
					children: "#54"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "6" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-38",
					children: "UH-38"
				}) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["E2E smoke + promote to ", (0, import_jsx_runtime.jsx)(_components.code, { children: "status: active" })] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/55",
					children: "#55"
				}) })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "other-slices-this-cycle",
			children: "Other slices this cycle"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Issue" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Title" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "PR" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-45",
					children: "UH-45"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "TUI spike: opentui framework selection + hello-world" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/52",
					children: "#52"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-46",
					children: "UH-46"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "TUI dashboard: live adapters + missions + sandboxes" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/57",
					children: "#57"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-47",
					children: "UH-47"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "TUI mission browser: drilldown with Code + Diff viewers" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/59",
					children: "#59"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-44",
					children: "UH-44"
				}) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"TUI mission run flow with live ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
					" tail"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/63",
					children: "#63"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-43",
					children: "UH-43"
				}) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "TUI adapter + sandbox manager (create/discard/recheck)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/64",
					children: "#64"
				}) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-42",
					children: "UH-42"
				}) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"TUI polish: keymap overlay (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "?" }),
					") + per-project persistence + runbook"
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61",
						children: "#61"
					}),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/65",
						children: "#65"
					})
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "shipped-previous-cycle-2026-05-13--2026-05-17",
			children: "Shipped previous cycle (2026-05-13 → 2026-05-17)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Issue" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Title" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-23" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: ["Codex adapter — CLI transport via ", (0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" })] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-24" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Cancelled (Anthropic ToS friction; superseded by UH-27 + UH-32)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-25" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"oh-my-pi adapter + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" }),
				" bucket + dispatch table + sandbox routing parity"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-26" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Per-runtime strict ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" }),
				" validation (typo safety)"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-27" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Per-mission ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides" }),
				" + Anthropic-via-OMP path"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-28" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Runtime-final-message capture protocol (shared sentinel)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-29" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "createSandbox" }), " seeds bound mission into the worktree"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-30" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: ["Codex CLI flag drift + child-stdin close + codex ", (0, import_jsx_runtime.jsx)(_components.code, { children: "status: active" })] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-31" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Minimum Hermes ≥ 0.14.0 version pin" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-33" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides" }), " parity for hermes + codex"] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "UH-34" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Diff capture includes untracked new files" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: "Adapter status as of 2026-05-18:" }) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Adapter" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Status" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "hermes" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "active (pinned ≥ 0.14.0)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "codex" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "active (verified against codex-cli 0.130.0 in UH-30 smoke)" })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "hermes-proxy" }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"active (verified against ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy start --provider nous" }),
				" in UH-38 smoke; manifest default ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "nousresearch/hermes-4-405b" }),
				")"
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "oh-my-pi" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "experimental" })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "medium-term-proposals-not-filed",
			children: "Medium-term proposals (not filed)"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "These are tracked in narrative form until they earn the priority to be filed:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Native ANTHROPIC_API_KEY adapter" }), " — mostly superseded by UH-32 for subscription users; file only if pay-per-token demand surfaces."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "OpenRouter / Vercel AI Gateway adapter" }), " — cheapest pay-per-token path; complementary to UH-32."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Cross-runtime QA harness" }),
				" — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh mission run-all --runtimes hermes,codex,oh-my-pi,hermes-proxy " }),
				"file`` with side-by-side diff/sentinel comparison."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Sandbox backend abstraction" }),
				" — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "directory" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "container" }),
				" backends alongside ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "git-worktree" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Verify-then-promote auto-trigger" }), " — opt-in workflow-driven auto-promote gate."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
				"Cleanup design-only ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "claude-code" }),
				" stub"
			] }), " — redundant after UH-27 + UH-32."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Filed follow-ups (Epic 2 polish):" }),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.a, {
							href: "https://linear.app/agentic-eng/issue/UH-48",
							children: "UH-48"
						}),
						" — ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "UH_TUI_THEME" }),
						" + palette-driven dark/light."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.a, {
							href: "https://linear.app/agentic-eng/issue/UH-49",
							children: "UH-49"
						}),
						" — ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "e" }),
						" open manifest in ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "$EDITOR" }),
						" (requires renderer suspend/resume)."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.a, {
							href: "https://linear.app/agentic-eng/issue/UH-50",
							children: "UH-50"
						}),
						" — Ctrl+Z suspend / ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "fg" }),
						" resume."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://linear.app/agentic-eng/issue/UH-51",
						children: "UH-51"
					}), " — automated TUI screenshot capture pipeline for docs."] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://linear.app/agentic-eng/issue/UH-52",
						children: "UH-52"
					}), " — surface adapter-check age in the footer."] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.a, {
							href: "https://linear.app/agentic-eng/issue/UH-53",
							children: "UH-53"
						}),
						" — adapters emit ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.cancelled" }),
						" on SIGTERM so disk replay matches the TUI status."
					] }),
					"\n"
				] }),
				"\n"
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "strategic-decisions-needed",
			children: "Strategic (decisions needed)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Pi adapter implementation" }), " — design-only stub today; tied to OMP cadence."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Mission capability declarations + adapter matching enforcement" }),
				" — manifest ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "capabilities:" }),
				" is advisory-only today."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Muta integration" }), " — UH-as-consumer, UH-as-component, or independent? Needs a co-founder conversation."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "references",
			children: "References"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./README.md",
				children: "Documentation home"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/overview.md",
				children: "Architecture overview"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/runtime-adapter-contract.md",
				children: "Runtime adapter contract"
			}), " (includes UH-28 sentinel protocol)"] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runbooks/codex-e2e-smoke.md",
				children: "Codex E2E smoke runbook"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runbooks/anthropic-via-omp.md",
				children: "Anthropic-via-OMP runbook"
			}), " (notes the ToS posture that UH-32's hermes-proxy supersedes)"] }),
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
export { toc as a, structuredData as i, frontmatter as n, roadmap_exports as r, MDXContent as t };
