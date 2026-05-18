import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/non-goals-Dy80I3A7.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var non_goals_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Non-Goals",
	"description": "1. **Not another coding agent.** Ultimate Harness coordinates and standardizes agent work; it does not need to be the model/runtime itself."
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "**Not another coding agent.** Ultimate Harness coordinates and standardizes agent work; it does not need to be the model/runtime itself."
		},
		{
			"heading": void 0,
			"content": "**Not a BMAD clone.** BMAD-style roles are useful, but Ultimate Harness must remain broader than BMAD."
		},
		{
			"heading": void 0,
			"content": "**Not a shell-script wrapper.** Runtime adapters need structured state and lifecycle reporting, not just `command: string`."
		},
		{
			"heading": void 0,
			"content": "**Not an unbounded autonomous agent.** Human checkpoints, verification evidence, and promotion policy are core."
		},
		{
			"heading": void 0,
			"content": "**Not a docs-only framework forever.** Documentation comes first, but the design should lead to a CLI and adapter implementation."
		},
		{
			"heading": void 0,
			"content": "**Not a replacement for GitHub/Linear.** It should link to issue trackers rather than own all planning data."
		},
		{
			"heading": void 0,
			"content": "**Not a sandbox monoculture.** Git worktrees and AgentFS have different strengths; the harness should model both."
		}
	],
	"headings": []
};
var toc = [];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		li: "li",
		ol: "ol",
		strong: "strong",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(_components.ol, { children: [
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not another coding agent." }), " Ultimate Harness coordinates and standardizes agent work; it does not need to be the model/runtime itself."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not a BMAD clone." }), " BMAD-style roles are useful, but Ultimate Harness must remain broader than BMAD."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not a shell-script wrapper." }),
			" Runtime adapters need structured state and lifecycle reporting, not just ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "command: string" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not an unbounded autonomous agent." }), " Human checkpoints, verification evidence, and promotion policy are core."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not a docs-only framework forever." }), " Documentation comes first, but the design should lead to a CLI and adapter implementation."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not a replacement for GitHub/Linear." }), " It should link to issue trackers rather than own all planning data."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Not a sandbox monoculture." }), " Git worktrees and AgentFS have different strengths; the harness should model both."] }),
		"\n"
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
export { toc as a, structuredData as i, frontmatter as n, non_goals_exports as r, MDXContent as t };
