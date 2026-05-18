import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/spec-to-plan-9BM3KnPK.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var spec_to_plan_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Workflow: Spec to Plan",
	"description": "A feature/spec is approved and needs implementation planning before runtime execution."
};
var structuredData = {
	"contents": [
		{
			"heading": "use-when",
			"content": "A feature/spec is approved and needs implementation planning before runtime execution."
		},
		{
			"heading": "steps",
			"content": "Read linked issue/spec and acceptance criteria."
		},
		{
			"heading": "steps",
			"content": "Identify affected entities and artifacts."
		},
		{
			"heading": "steps",
			"content": "Break work into bite-sized tasks."
		},
		{
			"heading": "steps",
			"content": "Add exact files, commands, and verification expectations."
		},
		{
			"heading": "steps",
			"content": "Define sandbox and promotion policy."
		},
		{
			"heading": "steps",
			"content": "Review the plan for missing context."
		},
		{
			"heading": "steps",
			"content": "Compile one or more mission packets."
		},
		{
			"heading": "outputs",
			"content": "Plan document or `.harness/specs/active/`spec`/plan.md`"
		},
		{
			"heading": "outputs",
			"content": "One or more mission packets."
		},
		{
			"heading": "exit-criteria",
			"content": "An implementation runtime can execute without guessing file paths, checks, or success criteria."
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
			"id": "outputs",
			"content": "Outputs"
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
		url: "#outputs",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Outputs" })
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
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "use-when",
			children: "Use when"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A feature/spec is approved and needs implementation planning before runtime execution." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "steps",
			children: "Steps"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Read linked issue/spec and acceptance criteria." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Identify affected entities and artifacts." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Break work into bite-sized tasks." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Add exact files, commands, and verification expectations." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Define sandbox and promotion policy." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Review the plan for missing context." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Compile one or more mission packets." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "outputs",
			children: "Outputs"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Plan document or ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/specs/active/" }),
				"spec",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/plan.md" })
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "One or more mission packets." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "exit-criteria",
			children: "Exit criteria"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "An implementation runtime can execute without guessing file paths, checks, or success criteria." })
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
export { toc as a, structuredData as i, frontmatter as n, spec_to_plan_exports as r, MDXContent as t };
