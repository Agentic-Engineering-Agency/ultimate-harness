import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/personas-Bbf6EqWV.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var personas_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Personas",
	"description": "Needs a runtime-agnostic harness that can unify Codex, Claude Code, Pi, Hermes, and future tools without losing specs, skills, or audit trails. Values proactive structure, deep docs, reusable skills, and verification-first workflows."
};
var structuredData = {
	"contents": [
		{
			"heading": "lalo--agent-platform-builder",
			"content": "Needs a runtime-agnostic harness that can unify Codex, Claude Code, Pi, Hermes, and future tools without losing specs, skills, or audit trails. Values proactive structure, deep docs, reusable skills, and verification-first workflows."
		},
		{
			"heading": "implementation-agent",
			"content": "Receives a mission packet and must know exactly what to do, what context to read, which skills to apply, which files may change, which checks to run, and how to report progress."
		},
		{
			"heading": "runtime-adapter-author",
			"content": "Builds an adapter for Codex, Claude Code, Pi, Hermes, or another runtime. Needs a clear lifecycle contract, conformance expectations, and examples."
		},
		{
			"heading": "reviewer--maintainer",
			"content": "Approves or rejects sandbox output. Needs diffs, test results, spec compliance notes, security/sandbox analysis, and traceability to issue/spec/mission."
		},
		{
			"heading": "skill-author",
			"content": "Creates reusable procedures that can be selected for missions. Needs a skill format with metadata, body, prerequisites, verification hooks, and related skills."
		}
	],
	"headings": [
		{
			"id": "lalo--agent-platform-builder",
			"content": "Lalo — agent platform builder"
		},
		{
			"id": "implementation-agent",
			"content": "Implementation agent"
		},
		{
			"id": "runtime-adapter-author",
			"content": "Runtime adapter author"
		},
		{
			"id": "reviewer--maintainer",
			"content": "Reviewer / maintainer"
		},
		{
			"id": "skill-author",
			"content": "Skill author"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#lalo--agent-platform-builder",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Lalo — agent platform builder" })
	},
	{
		depth: 2,
		url: "#implementation-agent",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Implementation agent" })
	},
	{
		depth: 2,
		url: "#runtime-adapter-author",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime adapter author" })
	},
	{
		depth: 2,
		url: "#reviewer--maintainer",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Reviewer / maintainer" })
	},
	{
		depth: 2,
		url: "#skill-author",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Skill author" })
	}
];
function _createMdxContent(props) {
	const _components = {
		h2: "h2",
		p: "p",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "lalo--agent-platform-builder",
			children: "Lalo — agent platform builder"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Needs a runtime-agnostic harness that can unify Codex, Claude Code, Pi, Hermes, and future tools without losing specs, skills, or audit trails. Values proactive structure, deep docs, reusable skills, and verification-first workflows." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "implementation-agent",
			children: "Implementation agent"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Receives a mission packet and must know exactly what to do, what context to read, which skills to apply, which files may change, which checks to run, and how to report progress." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-adapter-author",
			children: "Runtime adapter author"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Builds an adapter for Codex, Claude Code, Pi, Hermes, or another runtime. Needs a clear lifecycle contract, conformance expectations, and examples." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "reviewer--maintainer",
			children: "Reviewer / maintainer"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Approves or rejects sandbox output. Needs diffs, test results, spec compliance notes, security/sandbox analysis, and traceability to issue/spec/mission." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "skill-author",
			children: "Skill author"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Creates reusable procedures that can be selected for missions. Needs a skill format with metadata, body, prerequisites, verification hooks, and related skills." })
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
export { toc as a, structuredData as i, frontmatter as n, personas_exports as r, MDXContent as t };
