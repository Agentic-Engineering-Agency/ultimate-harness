import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/verify-review-promote-DVHBKEoZ.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var verify_review_promote_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Workflow: Verify, Review, Promote",
	"description": "A runtime has produced sandbox output."
};
var structuredData = {
	"contents": [
		{
			"heading": "use-when",
			"content": "A runtime has produced sandbox output."
		},
		{
			"heading": "steps",
			"content": "Collect changed files and diff."
		},
		{
			"heading": "steps",
			"content": "Run required automated checks."
		},
		{
			"heading": "steps",
			"content": "Perform spec compliance review."
		},
		{
			"heading": "steps",
			"content": "Perform quality review."
		},
		{
			"heading": "steps",
			"content": "Perform sandbox/security review."
		},
		{
			"heading": "steps",
			"content": "Record findings and waivers."
		},
		{
			"heading": "steps",
			"content": "Ask for human promotion approval when policy requires it."
		},
		{
			"heading": "steps",
			"content": "Promote selected changes or discard sandbox."
		},
		{
			"heading": "steps",
			"content": "Write promotion/audit records."
		},
		{
			"heading": "exit-criteria",
			"content": "Every promoted artifact has a verification result, approval decision, and audit event."
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
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A runtime has produced sandbox output." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "steps",
			children: "Steps"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Collect changed files and diff." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Run required automated checks." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Perform spec compliance review." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Perform quality review." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Perform sandbox/security review." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Record findings and waivers." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Ask for human promotion approval when policy requires it." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Promote selected changes or discard sandbox." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Write promotion/audit records." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "exit-criteria",
			children: "Exit criteria"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Every promoted artifact has a verification result, approval decision, and audit event." })
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
export { verify_review_promote_exports as a, toc as i, frontmatter as n, structuredData as r, MDXContent as t };
