import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/adopt-reject-defer-CnWkR4c4.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var adopt_reject_defer_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Adopt / Reject / Defer Decision Log",
	"description": "| Decision | Rationale | Source influence |"
};
var structuredData = {
	"contents": [
		{
			"heading": "adopt-now",
			"content": "Decision"
		},
		{
			"heading": "adopt-now",
			"content": "Rationale"
		},
		{
			"heading": "adopt-now",
			"content": "Source influence"
		},
		{
			"heading": "adopt-now",
			"content": "Artifact-first docs/specs/plans"
		},
		{
			"heading": "adopt-now",
			"content": "Prevents semantics from living only in chat context."
		},
		{
			"heading": "adopt-now",
			"content": "OpenSpec, BMAD, GSD"
		},
		{
			"heading": "adopt-now",
			"content": "Runtime-agnostic adapter contract"
		},
		{
			"heading": "adopt-now",
			"content": "Allows Codex, Claude Code, Pi, oh-my-pi, Hermes, and future runtimes."
		},
		{
			"heading": "adopt-now",
			"content": "Pi, oh-my-pi, OpenSpec, superpowers"
		},
		{
			"heading": "adopt-now",
			"content": "Mission packet as portable work unit"
		},
		{
			"heading": "adopt-now",
			"content": "Gives every runtime the same goal, constraints, context, checks, and expected outputs."
		},
		{
			"heading": "adopt-now",
			"content": "GSD phase plans, OpenSpec changes, BMAD workflows"
		},
		{
			"heading": "adopt-now",
			"content": "Sandbox abstraction"
		},
		{
			"heading": "adopt-now",
			"content": "Safe agent work requires isolated changes and promotion control."
		},
		{
			"heading": "adopt-now",
			"content": "AgentFS, superpowers worktrees, oh-my-pi isolation"
		},
		{
			"heading": "adopt-now",
			"content": "Verification and promotion lifecycle"
		},
		{
			"heading": "adopt-now",
			"content": "Agent output is not done until checked and approved."
		},
		{
			"heading": "adopt-now",
			"content": "superpowers reviews, OpenSpec verify/archive, AgentFS inspect/promote model"
		},
		{
			"heading": "adopt-now",
			"content": "BMAD-style roles as workflow roles"
		},
		{
			"heading": "adopt-now",
			"content": "Analyst/PM/Architect/QA/Writer roles are useful for docs and planning."
		},
		{
			"heading": "adopt-now",
			"content": "BMAD Method"
		},
		{
			"heading": "adopt-now",
			"content": "Human-readable first, machine-readable second"
		},
		{
			"heading": "adopt-now",
			"content": "Early schemas should be understandable before they are frozen."
		},
		{
			"heading": "adopt-now",
			"content": "OpenSpec, matt-pocock/skills"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Rejected idea"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Why"
		},
		{
			"heading": "reject-for-mvp",
			"content": "A single blessed runtime"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Violates runtime-agnostic direction."
		},
		{
			"heading": "reject-for-mvp",
			"content": "A full autonomous mega-orchestrator"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Too early; artifact model and adapters must be proven first."
		},
		{
			"heading": "reject-for-mvp",
			"content": "Treating BMAD as the whole product"
		},
		{
			"heading": "reject-for-mvp",
			"content": "BMAD is one inspiration system, not the harness ontology."
		},
		{
			"heading": "reject-for-mvp",
			"content": "Direct mutation of canonical working tree by agents"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Undermines sandboxing, review, auditability, and promotion."
		},
		{
			"heading": "reject-for-mvp",
			"content": "Tool-specific slash commands as core API"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Slash commands can be adapters, but core contracts should be data/API driven."
		},
		{
			"heading": "reject-for-mvp",
			"content": "Opaque agent transcripts as the only audit log"
		},
		{
			"heading": "reject-for-mvp",
			"content": "Audit records must include structured evidence and promoted artifacts."
		},
		{
			"heading": "defer",
			"content": "Deferred idea"
		},
		{
			"heading": "defer",
			"content": "Why defer"
		},
		{
			"heading": "defer",
			"content": "Revisit when"
		},
		{
			"heading": "defer",
			"content": "Choosing TypeScript/Rust/Python package architecture"
		},
		{
			"heading": "defer",
			"content": "Docs should justify runtime choices first."
		},
		{
			"heading": "defer",
			"content": "Adapter contract and CLI MVP are ready."
		},
		{
			"heading": "defer",
			"content": "Full AgentFS integration"
		},
		{
			"heading": "defer",
			"content": "Need a sandbox interface and git worktree baseline first."
		},
		{
			"heading": "defer",
			"content": "Worktree sandbox is modeled and verification lifecycle is stable."
		},
		{
			"heading": "defer",
			"content": "Web dashboard"
		},
		{
			"heading": "defer",
			"content": "CLI/docs/artifact discipline are more important now."
		},
		{
			"heading": "defer",
			"content": "Audit trail and mission status format are stable."
		},
		{
			"heading": "defer",
			"content": "Two-way Linear/GitHub sync automation"
		},
		{
			"heading": "defer",
			"content": "Useful but not core product semantics."
		},
		{
			"heading": "defer",
			"content": "Product docs and issue metadata conventions are stable."
		},
		{
			"heading": "defer",
			"content": "Runtime marketplace"
		},
		{
			"heading": "defer",
			"content": "Requires stable adapter manifest and conformance tests."
		},
		{
			"heading": "defer",
			"content": "At least two adapters exist."
		}
	],
	"headings": [
		{
			"id": "adopt-now",
			"content": "Adopt now"
		},
		{
			"id": "reject-for-mvp",
			"content": "Reject for MVP"
		},
		{
			"id": "defer",
			"content": "Defer"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#adopt-now",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adopt now" })
	},
	{
		depth: 2,
		url: "#reject-for-mvp",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Reject for MVP" })
	},
	{
		depth: 2,
		url: "#defer",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Defer" })
	}
];
function _createMdxContent(props) {
	const _components = {
		h2: "h2",
		table: "table",
		tbody: "tbody",
		td: "td",
		th: "th",
		thead: "thead",
		tr: "tr",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adopt-now",
			children: "Adopt now"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Decision" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Rationale" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Source influence" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Artifact-first docs/specs/plans" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Prevents semantics from living only in chat context." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "OpenSpec, BMAD, GSD" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Runtime-agnostic adapter contract" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Allows Codex, Claude Code, Pi, oh-my-pi, Hermes, and future runtimes." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Pi, oh-my-pi, OpenSpec, superpowers" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Mission packet as portable work unit" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Gives every runtime the same goal, constraints, context, checks, and expected outputs." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "GSD phase plans, OpenSpec changes, BMAD workflows" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Sandbox abstraction" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Safe agent work requires isolated changes and promotion control." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "AgentFS, superpowers worktrees, oh-my-pi isolation" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Verification and promotion lifecycle" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Agent output is not done until checked and approved." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "superpowers reviews, OpenSpec verify/archive, AgentFS inspect/promote model" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "BMAD-style roles as workflow roles" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Analyst/PM/Architect/QA/Writer roles are useful for docs and planning." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "BMAD Method" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Human-readable first, machine-readable second" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Early schemas should be understandable before they are frozen." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "OpenSpec, matt-pocock/skills" })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "reject-for-mvp",
			children: "Reject for MVP"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Rejected idea" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Why" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "A single blessed runtime" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Violates runtime-agnostic direction." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "A full autonomous mega-orchestrator" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Too early; artifact model and adapters must be proven first." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Treating BMAD as the whole product" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "BMAD is one inspiration system, not the harness ontology." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Direct mutation of canonical working tree by agents" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Undermines sandboxing, review, auditability, and promotion." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Tool-specific slash commands as core API" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Slash commands can be adapters, but core contracts should be data/API driven." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: "Opaque agent transcripts as the only audit log" }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Audit records must include structured evidence and promoted artifacts." })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "defer",
			children: "Defer"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Deferred idea" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Why defer" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Revisit when" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Choosing TypeScript/Rust/Python package architecture" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Docs should justify runtime choices first." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Adapter contract and CLI MVP are ready." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Full AgentFS integration" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Need a sandbox interface and git worktree baseline first." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Worktree sandbox is modeled and verification lifecycle is stable." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Web dashboard" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "CLI/docs/artifact discipline are more important now." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Audit trail and mission status format are stable." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Two-way Linear/GitHub sync automation" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Useful but not core product semantics." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Product docs and issue metadata conventions are stable." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Runtime marketplace" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Requires stable adapter manifest and conformance tests." }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "At least two adapters exist." })
			] })
		] })] })
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
export { toc as a, structuredData as i, adopt_reject_defer_exports as n, frontmatter as r, MDXContent as t };
