import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/mission-to-sandbox-D9XczeXS.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var mission_to_sandbox_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Workflow: Mission to Sandbox",
	"description": "A mission is ready for runtime execution."
};
var structuredData = {
	"contents": [
		{
			"heading": "use-when",
			"content": "A mission is ready for runtime execution."
		},
		{
			"heading": "steps",
			"content": "Validate mission packet schema."
		},
		{
			"heading": "steps",
			"content": "Resolve runtime adapter and capabilities."
		},
		{
			"heading": "steps",
			"content": "Create sandbox from the correct base ref."
		},
		{
			"heading": "steps",
			"content": "Hydrate sandbox with required files/context."
		},
		{
			"heading": "steps",
			"content": "Generate runtime-specific prompt or command."
		},
		{
			"heading": "steps",
			"content": "Launch runtime session."
		},
		{
			"heading": "steps",
			"content": "Observe and record structured events."
		},
		{
			"heading": "steps",
			"content": "Collect artifacts, diffs, logs, and blockers."
		},
		{
			"heading": "exit-criteria",
			"content": "The harness has a runtime result and inspectable sandbox output."
		}
	],
	"headings": [
		{
			"id": "use-when",
			"content": "Use when"
		},
		{
			"id": "steps",
			"content": "Steps"
		},
		{
			"id": "exit-criteria",
			"content": "Exit criteria"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#use-when",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Use when" })
	},
	{
		depth: 2,
		url: "#steps",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Steps" })
	},
	{
		depth: 2,
		url: "#exit-criteria",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Exit criteria" })
	}
];
function _createMdxContent(props) {
	const _components = {
		h2: "h2",
		li: "li",
		ol: "ol",
		p: "p",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "use-when",
			children: "Use when"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A mission is ready for runtime execution." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "steps",
			children: "Steps"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Validate mission packet schema." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Resolve runtime adapter and capabilities." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Create sandbox from the correct base ref." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Hydrate sandbox with required files/context." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Generate runtime-specific prompt or command." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Launch runtime session." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Observe and record structured events." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Collect artifacts, diffs, logs, and blockers." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "exit-criteria",
			children: "Exit criteria"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness has a runtime result and inspectable sandbox output." })
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
export { toc as a, structuredData as i, frontmatter as n, mission_to_sandbox_exports as r, MDXContent as t };
