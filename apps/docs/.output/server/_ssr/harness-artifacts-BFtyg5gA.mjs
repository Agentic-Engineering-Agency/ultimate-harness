import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/harness-artifacts-BFtyg5gA.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var harness_artifacts_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "`.harness/` Artifact Structure",
	"description": "`.harness/` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears."
};
var structuredData = {
	"contents": [
		{
			"heading": "purpose",
			"content": "`.harness/` stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears."
		},
		{
			"heading": "file-responsibilities",
			"content": "`project.yaml` — project identity, issue sources, schema versions, defaults."
		},
		{
			"heading": "file-responsibilities",
			"content": "`adapters/*.yaml` — adapter manifests and capabilities."
		},
		{
			"heading": "file-responsibilities",
			"content": "`workflows/*.yaml` — workflow profile definitions."
		},
		{
			"heading": "file-responsibilities",
			"content": "`skills/index.yaml` — discoverable skill metadata and locations."
		},
		{
			"heading": "file-responsibilities",
			"content": "`specs/active/` — current canonical specs."
		},
		{
			"heading": "file-responsibilities",
			"content": "`specs/archive/` — superseded or completed specs."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/mission.yaml` — canonical mission packet."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/prompt.md` — runtime-specific prompt generated from mission."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/runtime-session.yaml` — runtime IDs/status/capabilities."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/events.ndjson` — structured lifecycle events."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/artifacts/` — generated outputs not yet promoted."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/diff.patch` — captured patch for review."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/verification.yaml` — checks and results."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/review.md` — human or review-agent notes."
		},
		{
			"heading": "file-responsibilities",
			"content": "`missions/`id`/promotion.yaml` — promotion decision and applied refs."
		},
		{
			"heading": "file-responsibilities",
			"content": "`sandboxes/index.yaml` — active/discarded/promoted sandboxes."
		},
		{
			"heading": "file-responsibilities",
			"content": "`audit/events.ndjson` — append-only project-level timeline."
		},
		{
			"heading": "design-notes",
			"content": "`.harness/` should be checked into git except large logs or secrets."
		},
		{
			"heading": "design-notes",
			"content": "Secrets must never be stored in `.harness/`."
		},
		{
			"heading": "design-notes",
			"content": "Generated artifacts remain non-canonical until promoted."
		},
		{
			"heading": "design-notes",
			"content": "Runtime-specific details belong under mission/session records, not in core specs."
		}
	],
	"headings": [
		{
			"id": "purpose",
			"content": "Purpose"
		},
		{
			"id": "draft-layout",
			"content": "Draft layout"
		},
		{
			"id": "file-responsibilities",
			"content": "File responsibilities"
		},
		{
			"id": "design-notes",
			"content": "Design notes"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#purpose",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Purpose" })
	},
	{
		depth: 2,
		url: "#draft-layout",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Draft layout" })
	},
	{
		depth: 2,
		url: "#file-responsibilities",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "File responsibilities" })
	},
	{
		depth: 2,
		url: "#design-notes",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Design notes" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		li: "li",
		p: "p",
		pre: "pre",
		span: "span",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "purpose",
			children: "Purpose"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }), " stores Ultimate Harness project state. It should make agentic work inspectable even if the original chat session disappears."] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "draft-layout",
			children: "Draft layout"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: ".harness/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  project.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  adapters/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    hermes.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    codex.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    claude-code.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    pi.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  workflows/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    research-docs.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    spec-first-feature.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    bugfix-contained.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    adapter-design.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    skill-authoring.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  skills/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    index.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  specs/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    active/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    archive/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  missions/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    mission-2026-05-13-docs-spine/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      mission.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      prompt.md" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      runtime-session.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      events.ndjson" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      artifacts/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      diff.patch" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      verification.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      review.md" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      promotion.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  sandboxes/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    index.yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  audit/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    events.ndjson" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "file-responsibilities",
			children: "File responsibilities"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "project.yaml" }), " — project identity, issue sources, schema versions, defaults."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "adapters/*.yaml" }), " — adapter manifests and capabilities."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "workflows/*.yaml" }), " — workflow profile definitions."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "skills/index.yaml" }), " — discoverable skill metadata and locations."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "specs/active/" }), " — current canonical specs."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "specs/archive/" }), " — superseded or completed specs."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/mission.yaml" }),
				" — canonical mission packet."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/prompt.md" }),
				" — runtime-specific prompt generated from mission."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/runtime-session.yaml" }),
				" — runtime IDs/status/capabilities."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/events.ndjson" }),
				" — structured lifecycle events."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/artifacts/" }),
				" — generated outputs not yet promoted."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/diff.patch" }),
				" — captured patch for review."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/verification.yaml" }),
				" — checks and results."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/review.md" }),
				" — human or review-agent notes."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "missions/" }),
				"id",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/promotion.yaml" }),
				" — promotion decision and applied refs."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "sandboxes/index.yaml" }), " — active/discarded/promoted sandboxes."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "audit/events.ndjson" }), " — append-only project-level timeline."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "design-notes",
			children: "Design notes"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }), " should be checked into git except large logs or secrets."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Secrets must never be stored in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Generated artifacts remain non-canonical until promoted." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Runtime-specific details belong under mission/session records, not in core specs." }),
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
export { toc as a, structuredData as i, frontmatter as n, harness_artifacts_exports as r, MDXContent as t };
