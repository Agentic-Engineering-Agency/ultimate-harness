import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/prd-BBao1S-d.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var prd_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Product Requirements Document",
	"description": "AI coding agents are powerful but inconsistent across tools. Each runtime has different prompts, session state, permissions, sandboxes, skills, review loops, and artifact conventions. Teams lose continuity when switching between Codex, Clau"
};
var structuredData = {
	"contents": [
		{
			"heading": "problem",
			"content": "AI coding agents are powerful but inconsistent across tools. Each runtime has different prompts, session state, permissions, sandboxes, skills, review loops, and artifact conventions. Teams lose continuity when switching between Codex, Claude Code, Pi, Hermes, or other agents. Work often remains trapped in chat transcripts, making it hard to audit what was requested, what changed, which checks ran, and who approved promotion."
		},
		{
			"heading": "product-thesis",
			"content": "Ultimate Harness provides a runtime-agnostic layer that turns agentic work into durable, inspectable, verifiable missions. It separates **what work should happen** from **which runtime performs it**."
		},
		{
			"heading": "goals",
			"content": "Define portable project, workflow, skill, mission, sandbox, verification, and promotion artifacts."
		},
		{
			"heading": "goals",
			"content": "Support multiple runtimes through structured adapters."
		},
		{
			"heading": "goals",
			"content": "Preserve human-readable context and audit history outside chat."
		},
		{
			"heading": "goals",
			"content": "Make sandboxed agent execution and controlled promotion the default path."
		},
		{
			"heading": "goals",
			"content": "Enable BMAD-style specialist collaboration without coupling to BMAD as a dependency."
		},
		{
			"heading": "users",
			"content": "Founders/builders using multiple coding agents and wanting reliable output."
		},
		{
			"heading": "users",
			"content": "Agent platform developers building reusable workflows."
		},
		{
			"heading": "users",
			"content": "Technical leads who need auditability and human approval before promotion."
		},
		{
			"heading": "users",
			"content": "Skill authors who want procedures to work across runtimes."
		},
		{
			"heading": "fr1--documentation-spine",
			"content": "The repo must define the product vocabulary, core entities, MVP boundary, workflow profiles, adapter contract, mission packet schema, sandbox model, and verification lifecycle."
		},
		{
			"heading": "fr2--mission-packets",
			"content": "The harness must express a bounded unit of work as a portable mission packet containing goal, inputs, context references, constraints, skills, expected outputs, checks, and promotion policy."
		},
		{
			"heading": "fr3--runtime-adapters",
			"content": "The harness must define a contract for preparing, launching, observing, collecting, verifying, and closing runtime sessions."
		},
		{
			"heading": "fr4--sandbox-abstraction",
			"content": "The harness must distinguish sandbox backends such as git worktrees and AgentFS and define how outputs move through review to promotion."
		},
		{
			"heading": "fr5--workflow-profiles",
			"content": "The harness must describe repeatable workflows for research docs, spec-first features, contained bug fixes, adapter design, and skill authoring."
		},
		{
			"heading": "fr6--verification-results",
			"content": "The harness must produce structured verification evidence linked to issues/specs/missions."
		},
		{
			"heading": "non-functional-requirements",
			"content": "Runtime-agnostic by design."
		},
		{
			"heading": "non-functional-requirements",
			"content": "Human-readable artifacts first."
		},
		{
			"heading": "non-functional-requirements",
			"content": "Schemas versioned and traceable."
		},
		{
			"heading": "non-functional-requirements",
			"content": "Safe defaults: no direct canonical mutation by agents unless explicitly configured."
		},
		{
			"heading": "non-functional-requirements",
			"content": "Minimal MVP: avoid dashboard/orchestrator bloat."
		},
		{
			"heading": "success-metrics",
			"content": "A new contributor can understand the project from docs without asking for hidden chat context."
		},
		{
			"heading": "success-metrics",
			"content": "A runtime adapter implementer can design Codex, Claude Code, Pi, or Hermes adapters from the contract."
		},
		{
			"heading": "success-metrics",
			"content": "A mission packet example is clear enough to be executed manually before code exists."
		},
		{
			"heading": "success-metrics",
			"content": "Verification and promotion requirements are explicit enough to prevent unreviewed agent changes from becoming canonical."
		}
	],
	"headings": [
		{
			"id": "problem",
			"content": "Problem"
		},
		{
			"id": "product-thesis",
			"content": "Product thesis"
		},
		{
			"id": "goals",
			"content": "Goals"
		},
		{
			"id": "users",
			"content": "Users"
		},
		{
			"id": "functional-requirements",
			"content": "Functional requirements"
		},
		{
			"id": "fr1--documentation-spine",
			"content": "FR1 — Documentation spine"
		},
		{
			"id": "fr2--mission-packets",
			"content": "FR2 — Mission packets"
		},
		{
			"id": "fr3--runtime-adapters",
			"content": "FR3 — Runtime adapters"
		},
		{
			"id": "fr4--sandbox-abstraction",
			"content": "FR4 — Sandbox abstraction"
		},
		{
			"id": "fr5--workflow-profiles",
			"content": "FR5 — Workflow profiles"
		},
		{
			"id": "fr6--verification-results",
			"content": "FR6 — Verification results"
		},
		{
			"id": "non-functional-requirements",
			"content": "Non-functional requirements"
		},
		{
			"id": "success-metrics",
			"content": "Success metrics"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#problem",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Problem" })
	},
	{
		depth: 2,
		url: "#product-thesis",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Product thesis" })
	},
	{
		depth: 2,
		url: "#goals",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Goals" })
	},
	{
		depth: 2,
		url: "#users",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Users" })
	},
	{
		depth: 2,
		url: "#functional-requirements",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Functional requirements" })
	},
	{
		depth: 3,
		url: "#fr1--documentation-spine",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR1 — Documentation spine" })
	},
	{
		depth: 3,
		url: "#fr2--mission-packets",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR2 — Mission packets" })
	},
	{
		depth: 3,
		url: "#fr3--runtime-adapters",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR3 — Runtime adapters" })
	},
	{
		depth: 3,
		url: "#fr4--sandbox-abstraction",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR4 — Sandbox abstraction" })
	},
	{
		depth: 3,
		url: "#fr5--workflow-profiles",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR5 — Workflow profiles" })
	},
	{
		depth: 3,
		url: "#fr6--verification-results",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "FR6 — Verification results" })
	},
	{
		depth: 2,
		url: "#non-functional-requirements",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Non-functional requirements" })
	},
	{
		depth: 2,
		url: "#success-metrics",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Success metrics" })
	}
];
function _createMdxContent(props) {
	const _components = {
		h2: "h2",
		h3: "h3",
		li: "li",
		ol: "ol",
		p: "p",
		strong: "strong",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "problem",
			children: "Problem"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "AI coding agents are powerful but inconsistent across tools. Each runtime has different prompts, session state, permissions, sandboxes, skills, review loops, and artifact conventions. Teams lose continuity when switching between Codex, Claude Code, Pi, Hermes, or other agents. Work often remains trapped in chat transcripts, making it hard to audit what was requested, what changed, which checks ran, and who approved promotion." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "product-thesis",
			children: "Product thesis"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Ultimate Harness provides a runtime-agnostic layer that turns agentic work into durable, inspectable, verifiable missions. It separates ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "what work should happen" }),
			" from ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "which runtime performs it" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "goals",
			children: "Goals"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Define portable project, workflow, skill, mission, sandbox, verification, and promotion artifacts." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Support multiple runtimes through structured adapters." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Preserve human-readable context and audit history outside chat." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Make sandboxed agent execution and controlled promotion the default path." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Enable BMAD-style specialist collaboration without coupling to BMAD as a dependency." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "users",
			children: "Users"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Founders/builders using multiple coding agents and wanting reliable output." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Agent platform developers building reusable workflows." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Technical leads who need auditability and human approval before promotion." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Skill authors who want procedures to work across runtimes." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "functional-requirements",
			children: "Functional requirements"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr1--documentation-spine",
			children: "FR1 — Documentation spine"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The repo must define the product vocabulary, core entities, MVP boundary, workflow profiles, adapter contract, mission packet schema, sandbox model, and verification lifecycle." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr2--mission-packets",
			children: "FR2 — Mission packets"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness must express a bounded unit of work as a portable mission packet containing goal, inputs, context references, constraints, skills, expected outputs, checks, and promotion policy." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr3--runtime-adapters",
			children: "FR3 — Runtime adapters"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness must define a contract for preparing, launching, observing, collecting, verifying, and closing runtime sessions." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr4--sandbox-abstraction",
			children: "FR4 — Sandbox abstraction"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness must distinguish sandbox backends such as git worktrees and AgentFS and define how outputs move through review to promotion." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr5--workflow-profiles",
			children: "FR5 — Workflow profiles"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness must describe repeatable workflows for research docs, spec-first features, contained bug fixes, adapter design, and skill authoring." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "fr6--verification-results",
			children: "FR6 — Verification results"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness must produce structured verification evidence linked to issues/specs/missions." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "non-functional-requirements",
			children: "Non-functional requirements"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Runtime-agnostic by design." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Human-readable artifacts first." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Schemas versioned and traceable." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Safe defaults: no direct canonical mutation by agents unless explicitly configured." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Minimal MVP: avoid dashboard/orchestrator bloat." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "success-metrics",
			children: "Success metrics"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "A new contributor can understand the project from docs without asking for hidden chat context." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "A runtime adapter implementer can design Codex, Claude Code, Pi, or Hermes adapters from the contract." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "A mission packet example is clear enough to be executed manually before code exists." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Verification and promotion requirements are explicit enough to prevent unreviewed agent changes from becoming canonical." }),
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
export { toc as a, structuredData as i, frontmatter as n, prd_exports as r, MDXContent as t };
