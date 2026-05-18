import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/glossary-CXlI0Pq7.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var glossary_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Glossary",
	"description": "A runtime-agnostic orchestration layer that standardizes how agentic software work is specified, delegated, sandboxed, verified, reviewed, and promoted."
};
var structuredData = {
	"contents": [
		{
			"heading": "ultimate-harness",
			"content": "A runtime-agnostic orchestration layer that standardizes how agentic software work is specified, delegated, sandboxed, verified, reviewed, and promoted."
		},
		{
			"heading": "runtime",
			"content": "A coding-agent environment capable of performing work: Codex, Claude Code, Pi, oh-my-pi, Hermes, or a future agent runtime."
		},
		{
			"heading": "runtime-adapter",
			"content": "A thin integration layer that translates Ultimate Harness mission packets into runtime-specific prompts, commands, tool invocations, and state collection."
		},
		{
			"heading": "mission",
			"content": "A bounded unit of agentic work with a goal, inputs, constraints, expected artifacts, verification requirements, and promotion policy."
		},
		{
			"heading": "mission-packet",
			"content": "The portable data structure passed from Ultimate Harness to a runtime adapter. It describes the work without assuming a specific agent implementation."
		},
		{
			"heading": "workflow-profile",
			"content": "A named end-to-end procedure for a class of work, such as `research-docs`, `spec-first-feature`, `bugfix-contained`, `adapter-design`, or `skill-authoring`."
		},
		{
			"heading": "skill",
			"content": "A reusable procedural capability that can be selected for a mission. Skills may be human-readable Markdown first and machine-indexable second."
		},
		{
			"heading": "sandbox",
			"content": "An isolated execution environment where an agent can read project context and produce changes without directly mutating canonical project state."
		},
		{
			"heading": "promotion",
			"content": "The controlled process of moving approved sandbox outputs into the canonical working tree, docs, issue tracker, or release state."
		},
		{
			"heading": "verification-result",
			"content": "Structured evidence that a mission satisfied required checks: static analysis, tests, diff review, spec compliance, security review, and human approval."
		},
		{
			"heading": "audit-trail",
			"content": "A durable record linking issue → spec → plan → mission → runtime session → sandbox changes → verification → promotion."
		},
		{
			"heading": "canonical-artifact",
			"content": "A project artifact that has been reviewed/promoted and is accepted as source of truth."
		},
		{
			"heading": "generated-artifact",
			"content": "An artifact produced by an agent or runtime. It is not canonical until verified and promoted."
		}
	],
	"headings": [
		{
			"id": "ultimate-harness",
			"content": "Ultimate Harness"
		},
		{
			"id": "runtime",
			"content": "Runtime"
		},
		{
			"id": "runtime-adapter",
			"content": "Runtime adapter"
		},
		{
			"id": "mission",
			"content": "Mission"
		},
		{
			"id": "mission-packet",
			"content": "Mission packet"
		},
		{
			"id": "workflow-profile",
			"content": "Workflow profile"
		},
		{
			"id": "skill",
			"content": "Skill"
		},
		{
			"id": "sandbox",
			"content": "Sandbox"
		},
		{
			"id": "promotion",
			"content": "Promotion"
		},
		{
			"id": "verification-result",
			"content": "Verification result"
		},
		{
			"id": "audit-trail",
			"content": "Audit trail"
		},
		{
			"id": "canonical-artifact",
			"content": "Canonical artifact"
		},
		{
			"id": "generated-artifact",
			"content": "Generated artifact"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#ultimate-harness",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Ultimate Harness" })
	},
	{
		depth: 2,
		url: "#runtime",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime" })
	},
	{
		depth: 2,
		url: "#runtime-adapter",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime adapter" })
	},
	{
		depth: 2,
		url: "#mission",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Mission" })
	},
	{
		depth: 2,
		url: "#mission-packet",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Mission packet" })
	},
	{
		depth: 2,
		url: "#workflow-profile",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Workflow profile" })
	},
	{
		depth: 2,
		url: "#skill",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Skill" })
	},
	{
		depth: 2,
		url: "#sandbox",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Sandbox" })
	},
	{
		depth: 2,
		url: "#promotion",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Promotion" })
	},
	{
		depth: 2,
		url: "#verification-result",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Verification result" })
	},
	{
		depth: 2,
		url: "#audit-trail",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Audit trail" })
	},
	{
		depth: 2,
		url: "#canonical-artifact",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Canonical artifact" })
	},
	{
		depth: 2,
		url: "#generated-artifact",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Generated artifact" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		p: "p",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "ultimate-harness",
			children: "Ultimate Harness"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A runtime-agnostic orchestration layer that standardizes how agentic software work is specified, delegated, sandboxed, verified, reviewed, and promoted." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime",
			children: "Runtime"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A coding-agent environment capable of performing work: Codex, Claude Code, Pi, oh-my-pi, Hermes, or a future agent runtime." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-adapter",
			children: "Runtime adapter"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A thin integration layer that translates Ultimate Harness mission packets into runtime-specific prompts, commands, tool invocations, and state collection." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission",
			children: "Mission"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A bounded unit of agentic work with a goal, inputs, constraints, expected artifacts, verification requirements, and promotion policy." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission-packet",
			children: "Mission packet"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The portable data structure passed from Ultimate Harness to a runtime adapter. It describes the work without assuming a specific agent implementation." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "workflow-profile",
			children: "Workflow profile"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"A named end-to-end procedure for a class of work, such as ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "research-docs" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "spec-first-feature" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bugfix-contained" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter-design" }),
			", or ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "skill-authoring" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "skill",
			children: "Skill"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A reusable procedural capability that can be selected for a mission. Skills may be human-readable Markdown first and machine-indexable second." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "sandbox",
			children: "Sandbox"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "An isolated execution environment where an agent can read project context and produce changes without directly mutating canonical project state." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "promotion",
			children: "Promotion"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The controlled process of moving approved sandbox outputs into the canonical working tree, docs, issue tracker, or release state." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "verification-result",
			children: "Verification result"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Structured evidence that a mission satisfied required checks: static analysis, tests, diff review, spec compliance, security review, and human approval." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "audit-trail",
			children: "Audit trail"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A durable record linking issue → spec → plan → mission → runtime session → sandbox changes → verification → promotion." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "canonical-artifact",
			children: "Canonical artifact"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A project artifact that has been reviewed/promoted and is accepted as source of truth." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "generated-artifact",
			children: "Generated artifact"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "An artifact produced by an agent or runtime. It is not canonical until verified and promoted." })
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
export { toc as a, structuredData as i, frontmatter as n, glossary_exports as r, MDXContent as t };
