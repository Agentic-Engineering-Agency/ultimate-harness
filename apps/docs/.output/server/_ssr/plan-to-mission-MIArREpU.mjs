import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/plan-to-mission-MIArREpU.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var plan_to_mission_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Workflow: Plan to Mission",
	"description": "A plan needs to become a bounded runtime-executable unit."
};
var structuredData = {
	"contents": [
		{
			"heading": "use-when",
			"content": "A plan needs to become a bounded runtime-executable unit."
		},
		{
			"heading": "steps",
			"content": "Select a task or small task batch from the plan."
		},
		{
			"heading": "steps",
			"content": "Assign issue refs and workflow profile."
		},
		{
			"heading": "steps",
			"content": "Add ordered context files."
		},
		{
			"heading": "steps",
			"content": "Add constraints and non-goals."
		},
		{
			"heading": "steps",
			"content": "Add required/suggested skills."
		},
		{
			"heading": "steps",
			"content": "Define expected outputs."
		},
		{
			"heading": "steps",
			"content": "Choose sandbox backend."
		},
		{
			"heading": "steps",
			"content": "Define verification commands and review gates."
		},
		{
			"heading": "steps",
			"content": "Serialize as `uh.mission.v0`."
		},
		{
			"heading": "exit-criteria",
			"content": "The mission packet is complete enough to pass adapter `prepare()` validation."
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
		code: "code",
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
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A plan needs to become a bounded runtime-executable unit." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "steps",
			children: "Steps"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Select a task or small task batch from the plan." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Assign issue refs and workflow profile." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Add ordered context files." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Add constraints and non-goals." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Add required/suggested skills." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Define expected outputs." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Choose sandbox backend." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Define verification commands and review gates." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Serialize as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh.mission.v0" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "exit-criteria",
			children: "Exit criteria"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The mission packet is complete enough to pass adapter ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "prepare()" }),
			" validation."
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
export { toc as a, structuredData as i, frontmatter as n, plan_to_mission_exports as r, MDXContent as t };
