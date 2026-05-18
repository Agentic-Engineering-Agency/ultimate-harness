import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/overview-hZ9n0sfi.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var overview_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Architecture Overview",
	"description": "Ultimate Harness is a **control plane for agentic software work**. It should own durable artifacts and lifecycle semantics while delegating execution to runtime adapters."
};
var structuredData = {
	"contents": [
		{
			"heading": "architectural-stance",
			"content": "Ultimate Harness is a **control plane for agentic software work**. It should own durable artifacts and lifecycle semantics while delegating execution to runtime adapters."
		},
		{
			"heading": "1-artifact-store",
			"content": "The `.harness/` directory stores project metadata, specs, workflow profiles, mission packets, adapter manifests, sandbox records, verification results, and audit records."
		},
		{
			"heading": "2-workflow-engine",
			"content": "Initially this can be a documented procedure or small CLI commands. It maps work types to required artifacts, skills, checks, and approval gates."
		},
		{
			"heading": "3-mission-compiler",
			"content": "Transforms a request/spec/plan into a mission packet suitable for runtime execution."
		},
		{
			"heading": "4-runtime-registry",
			"content": "Knows which adapters are available, what capabilities they support, and how to invoke them."
		},
		{
			"heading": "5-runtime-adapter",
			"content": "Translates a mission packet into runtime-specific execution while reporting structured status and outputs back to the harness."
		},
		{
			"heading": "6-sandbox-manager",
			"content": "Creates, identifies, inspects, and disposes of isolated workspaces."
		},
		{
			"heading": "7-verification-manager",
			"content": "Runs checks, captures results, and prepares review gates."
		},
		{
			"heading": "8-promotion-manager",
			"content": "Moves approved outputs into canonical project state and writes audit records."
		},
		{
			"heading": "design-constraints",
			"content": "Runtime adapters must not define product semantics; they implement the contract."
		},
		{
			"heading": "design-constraints",
			"content": "Sandboxes are not optional for agent-generated changes in MVP workflows."
		},
		{
			"heading": "design-constraints",
			"content": "Human-readable artifacts should remain useful without the CLI."
		},
		{
			"heading": "design-constraints",
			"content": "Machine-readable schemas should be versioned and introduced incrementally."
		}
	],
	"headings": [
		{
			"id": "architectural-stance",
			"content": "Architectural stance"
		},
		{
			"id": "major-components",
			"content": "Major components"
		},
		{
			"id": "1-artifact-store",
			"content": "1\\. Artifact store"
		},
		{
			"id": "2-workflow-engine",
			"content": "2\\. Workflow engine"
		},
		{
			"id": "3-mission-compiler",
			"content": "3\\. Mission compiler"
		},
		{
			"id": "4-runtime-registry",
			"content": "4\\. Runtime registry"
		},
		{
			"id": "5-runtime-adapter",
			"content": "5\\. Runtime adapter"
		},
		{
			"id": "6-sandbox-manager",
			"content": "6\\. Sandbox manager"
		},
		{
			"id": "7-verification-manager",
			"content": "7\\. Verification manager"
		},
		{
			"id": "8-promotion-manager",
			"content": "8\\. Promotion manager"
		},
		{
			"id": "design-constraints",
			"content": "Design constraints"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#architectural-stance",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Architectural stance" })
	},
	{
		depth: 2,
		url: "#major-components",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Major components" })
	},
	{
		depth: 3,
		url: "#1-artifact-store",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "1. Artifact store" })
	},
	{
		depth: 3,
		url: "#2-workflow-engine",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "2. Workflow engine" })
	},
	{
		depth: 3,
		url: "#3-mission-compiler",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "3. Mission compiler" })
	},
	{
		depth: 3,
		url: "#4-runtime-registry",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4. Runtime registry" })
	},
	{
		depth: 3,
		url: "#5-runtime-adapter",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "5. Runtime adapter" })
	},
	{
		depth: 3,
		url: "#6-sandbox-manager",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6. Sandbox manager" })
	},
	{
		depth: 3,
		url: "#7-verification-manager",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "7. Verification manager" })
	},
	{
		depth: 3,
		url: "#8-promotion-manager",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "8. Promotion manager" })
	},
	{
		depth: 2,
		url: "#design-constraints",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Design constraints" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		h3: "h3",
		li: "li",
		p: "p",
		pre: "pre",
		span: "span",
		strong: "strong",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "architectural-stance",
			children: "Architectural stance"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Ultimate Harness is a ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "control plane for agentic software work" }),
			". It should own durable artifacts and lifecycle semantics while delegating execution to runtime adapters."
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Issue / Spec / Request" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Workflow Profile  ---> Skills" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Mission Packet" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Runtime Adapter  ---> Runtime Session (Codex, Claude Code, Pi, Hermes, ...)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Sandbox Backend  ---> Git worktree / AgentFS / future backend" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Verification Result" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Human Review + Promotion" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "        v" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Canonical Project State + Audit Trail" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "major-components",
			children: "Major components"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "1-artifact-store",
			children: "1. Artifact store"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }),
			" directory stores project metadata, specs, workflow profiles, mission packets, adapter manifests, sandbox records, verification results, and audit records."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "2-workflow-engine",
			children: "2. Workflow engine"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Initially this can be a documented procedure or small CLI commands. It maps work types to required artifacts, skills, checks, and approval gates." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "3-mission-compiler",
			children: "3. Mission compiler"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Transforms a request/spec/plan into a mission packet suitable for runtime execution." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "4-runtime-registry",
			children: "4. Runtime registry"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Knows which adapters are available, what capabilities they support, and how to invoke them." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "5-runtime-adapter",
			children: "5. Runtime adapter"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Translates a mission packet into runtime-specific execution while reporting structured status and outputs back to the harness." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "6-sandbox-manager",
			children: "6. Sandbox manager"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Creates, identifies, inspects, and disposes of isolated workspaces." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "7-verification-manager",
			children: "7. Verification manager"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Runs checks, captures results, and prepares review gates." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "8-promotion-manager",
			children: "8. Promotion manager"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Moves approved outputs into canonical project state and writes audit records." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "design-constraints",
			children: "Design constraints"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Runtime adapters must not define product semantics; they implement the contract." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Sandboxes are not optional for agent-generated changes in MVP workflows." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Human-readable artifacts should remain useful without the CLI." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Machine-readable schemas should be versioned and introduced incrementally." }),
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
export { toc as a, structuredData as i, frontmatter as n, overview_exports as r, MDXContent as t };
