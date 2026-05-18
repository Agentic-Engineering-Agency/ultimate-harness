import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/inspiration-systems-DpY8Qnlc.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var inspiration_systems_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Inspiration Systems",
	"description": "Ultimate Harness intentionally borrows from several systems while avoiding capture by any single one. The goal is not to reimplement BMAD, OpenSpec, GSD, or Pi; it is to extract portable patterns that survive across runtimes."
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Ultimate Harness intentionally borrows from several systems while avoiding capture by any single one. The goal is not to reimplement BMAD, OpenSpec, GSD, or Pi; it is to extract portable patterns that survive across runtimes."
		},
		{
			"heading": "specsafe",
			"content": "Specsafe is currently represented by a public issue tracker focused on specification safety and integrations with development tools such as Aider, Cursor, Continue, Zed, Google Antigravity IDE, and Google Workspace APIs. For Ultimate Harness, Specsafe contributes the principle that work should be traceable to explicit issues/specifications and that assistant integrations should be designed as first-class surfaces, not one-off prompts."
		},
		{
			"heading": "specsafe",
			"content": "**Copy:** issue/spec traceability and integration mindset.\\\n&#x2A;*Avoid:** depending on any single IDE integration as the core abstraction."
		},
		{
			"heading": "bmad-method",
			"content": "BMAD Method is an AI-driven agile development framework built around specialized agents, structured workflows, and adaptive planning depth. Its agents include product, architecture, development, UX, and other lifecycle roles. It is valuable as a role model for separating analysis, product definition, architecture, workflow design, implementation, and QA."
		},
		{
			"heading": "bmad-method",
			"content": "**Copy:** role separation, lifecycle workflows, facilitated collaboration, scale-adaptive planning.\\\n&#x2A;*Avoid:** letting BMAD terminology become the product ontology; BMAD should be one workflow profile family, not the harness itself."
		},
		{
			"heading": "superpowers",
			"content": "superpowers is an agentic skills framework and software development methodology. It requires agents to check for relevant skills, use planning and TDD workflows, work in isolated branches/worktrees, and request reviews. Its strongest contribution is a compact, skill-driven discipline layer that can be applied to multiple coding agents."
		},
		{
			"heading": "superpowers",
			"content": "**Copy:** mandatory skill discovery, bite-sized plans, TDD, subagent review loops, worktree awareness.\\\n&#x2A;*Avoid:** assuming one skill format or one agent host is universal."
		},
		{
			"heading": "gsd",
			"content": "GSD is a lightweight meta-prompting, context-engineering, and spec-driven development system for AI coding tools. It emphasizes avoiding context rot by delegating heavy work to fresh contexts and maintaining durable project context through a small command loop."
		},
		{
			"heading": "gsd",
			"content": "**Copy:** context hygiene, phase-sized execution, fresh-context delegation, durable project state.\\\n&#x2A;*Avoid:** optimizing only for Claude Code-style slash-command UX."
		},
		{
			"heading": "matt-pocockskills",
			"content": "Matt Pocock's skills are small, composable engineering workflows intended to preserve real engineering discipline with AI agents. The key insight is that skills should improve communication, shared language, debugging, feedback loops, and architecture quality without creating a heavyweight process owner."
		},
		{
			"heading": "matt-pocockskills",
			"content": "**Copy:** small composable skills, shared language docs, practical engineering taste, model-agnostic usage.\\\n&#x2A;*Avoid:** treating skills as merely prompt snippets; they should carry verification and workflow hooks when useful."
		},
		{
			"heading": "oh-my-openagent",
			"content": "oh-my-openagent is an opinionated OpenCode-oriented harness/plugin that packages agents, hooks, model routing, MCP integrations, and workflow discipline. It shows the value of a batteries-included agent environment and open multi-model orchestration."
		},
		{
			"heading": "oh-my-openagent",
			"content": "**Copy:** packaged defaults, model/runtime routing, hooks, MCP awareness, open-agent ecosystem perspective.\\\n&#x2A;*Avoid:** making Ultimate Harness a preconfigured IDE/plugin distribution instead of a portable artifact layer."
		},
		{
			"heading": "openspec",
			"content": "OpenSpec is a spec-driven development framework for AI coding assistants. It uses a proposal/apply/archive lifecycle and change folders containing proposal, specs, design, and tasks. Its main contribution is a lightweight artifact-guided workflow that keeps requirements outside chat history."
		},
		{
			"heading": "openspec",
			"content": "**Copy:** artifact-first proposal/design/tasks lifecycle, archive/update discipline, assistant portability.\\\n&#x2A;*Avoid:** collapsing every mission into a spec change; some missions are research, verification, or skill authoring."
		},
		{
			"heading": "pi-and-oh-my-pi",
			"content": "Pi is a minimal, customizable terminal coding harness with interactive, print/JSON, RPC, and SDK modes. oh-my-pi extends the Pi lineage into a batteries-included terminal agent with LSP, subagents, browser, Python, MCP, sessions, branches, skills, hooks, and isolation backends."
		},
		{
			"heading": "pi-and-oh-my-pi",
			"content": "**Copy:** runtime customizability, JSON/RPC/embed surfaces, session trees, tool-rich execution, subagents.\\\n&#x2A;*Avoid:** assuming the core project engine must be Pi before adapter and artifact contracts are proven."
		},
		{
			"heading": "agentfs",
			"content": "AgentFS provides database-backed agent filesystems, overlay/copy-on-write execution, command execution inside mounted filesystems, sync, encryption, MCP filesystem tools, and platform-specific sandbox behavior. It is directly relevant to Ultimate Harness because sandboxing and promotion are core product values."
		},
		{
			"heading": "agentfs",
			"content": "**Copy:** copy-on-write filesystem model, explicit mount/exec/run lifecycle, inspectable deltas, syncable state, sandbox boundary concepts.\\\n&#x2A;*Avoid:** treating AgentFS and git worktrees as interchangeable; they solve overlapping but different isolation problems."
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "Specsafe issue tracker: https\\://github.com/Agentic-Engineering-Agency/specsafe/issues"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "BMAD Method: https\\://github.com/bmad-code-org/BMAD-METHOD"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "superpowers: https\\://github.com/obra/superpowers"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "GSD: https\\://github.com/gsd-build/get-shit-done"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "matt-pocock/skills: https\\://github.com/mattpocock/skills"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "oh-my-openagent: https\\://github.com/code-yeongyu/oh-my-openagent"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "OpenSpec: https\\://github.com/Fission-AI/OpenSpec"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "oh-my-pi: https\\://github.com/can1357/oh-my-pi"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "Pi: https\\://pi.dev/"
		},
		{
			"heading": "sources-used-in-this-documentation-sprint",
			"content": "AgentFS manual: https\\://github.com/tursodatabase/agentfs/blob/main/MANUAL.md"
		}
	],
	"headings": [
		{
			"id": "specsafe",
			"content": "Specsafe"
		},
		{
			"id": "bmad-method",
			"content": "BMAD Method"
		},
		{
			"id": "superpowers",
			"content": "superpowers"
		},
		{
			"id": "gsd",
			"content": "GSD"
		},
		{
			"id": "matt-pocockskills",
			"content": "matt-pocock/skills"
		},
		{
			"id": "oh-my-openagent",
			"content": "oh-my-openagent"
		},
		{
			"id": "openspec",
			"content": "OpenSpec"
		},
		{
			"id": "pi-and-oh-my-pi",
			"content": "Pi and oh-my-pi"
		},
		{
			"id": "agentfs",
			"content": "AgentFS"
		},
		{
			"id": "sources-used-in-this-documentation-sprint",
			"content": "Sources used in this documentation sprint"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#specsafe",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Specsafe" })
	},
	{
		depth: 2,
		url: "#bmad-method",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "BMAD Method" })
	},
	{
		depth: 2,
		url: "#superpowers",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "superpowers" })
	},
	{
		depth: 2,
		url: "#gsd",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "GSD" })
	},
	{
		depth: 2,
		url: "#matt-pocockskills",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "matt-pocock/skills" })
	},
	{
		depth: 2,
		url: "#oh-my-openagent",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "oh-my-openagent" })
	},
	{
		depth: 2,
		url: "#openspec",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "OpenSpec" })
	},
	{
		depth: 2,
		url: "#pi-and-oh-my-pi",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Pi and oh-my-pi" })
	},
	{
		depth: 2,
		url: "#agentfs",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "AgentFS" })
	},
	{
		depth: 2,
		url: "#sources-used-in-this-documentation-sprint",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Sources used in this documentation sprint" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		br: "br",
		h2: "h2",
		li: "li",
		p: "p",
		strong: "strong",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Ultimate Harness intentionally borrows from several systems while avoiding capture by any single one. The goal is not to reimplement BMAD, OpenSpec, GSD, or Pi; it is to extract portable patterns that survive across runtimes." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "specsafe",
			children: "Specsafe"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Specsafe is currently represented by a public issue tracker focused on specification safety and integrations with development tools such as Aider, Cursor, Continue, Zed, Google Antigravity IDE, and Google Workspace APIs. For Ultimate Harness, Specsafe contributes the principle that work should be traceable to explicit issues/specifications and that assistant integrations should be designed as first-class surfaces, not one-off prompts." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" issue/spec traceability and integration mindset.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" depending on any single IDE integration as the core abstraction."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "bmad-method",
			children: "BMAD Method"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "BMAD Method is an AI-driven agile development framework built around specialized agents, structured workflows, and adaptive planning depth. Its agents include product, architecture, development, UX, and other lifecycle roles. It is valuable as a role model for separating analysis, product definition, architecture, workflow design, implementation, and QA." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" role separation, lifecycle workflows, facilitated collaboration, scale-adaptive planning.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" letting BMAD terminology become the product ontology; BMAD should be one workflow profile family, not the harness itself."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "superpowers",
			children: "superpowers"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "superpowers is an agentic skills framework and software development methodology. It requires agents to check for relevant skills, use planning and TDD workflows, work in isolated branches/worktrees, and request reviews. Its strongest contribution is a compact, skill-driven discipline layer that can be applied to multiple coding agents." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" mandatory skill discovery, bite-sized plans, TDD, subagent review loops, worktree awareness.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" assuming one skill format or one agent host is universal."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "gsd",
			children: "GSD"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "GSD is a lightweight meta-prompting, context-engineering, and spec-driven development system for AI coding tools. It emphasizes avoiding context rot by delegating heavy work to fresh contexts and maintaining durable project context through a small command loop." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" context hygiene, phase-sized execution, fresh-context delegation, durable project state.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" optimizing only for Claude Code-style slash-command UX."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "matt-pocockskills",
			children: "matt-pocock/skills"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Matt Pocock's skills are small, composable engineering workflows intended to preserve real engineering discipline with AI agents. The key insight is that skills should improve communication, shared language, debugging, feedback loops, and architecture quality without creating a heavyweight process owner." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" small composable skills, shared language docs, practical engineering taste, model-agnostic usage.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" treating skills as merely prompt snippets; they should carry verification and workflow hooks when useful."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "oh-my-openagent",
			children: "oh-my-openagent"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "oh-my-openagent is an opinionated OpenCode-oriented harness/plugin that packages agents, hooks, model routing, MCP integrations, and workflow discipline. It shows the value of a batteries-included agent environment and open multi-model orchestration." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" packaged defaults, model/runtime routing, hooks, MCP awareness, open-agent ecosystem perspective.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" making Ultimate Harness a preconfigured IDE/plugin distribution instead of a portable artifact layer."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "openspec",
			children: "OpenSpec"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "OpenSpec is a spec-driven development framework for AI coding assistants. It uses a proposal/apply/archive lifecycle and change folders containing proposal, specs, design, and tasks. Its main contribution is a lightweight artifact-guided workflow that keeps requirements outside chat history." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" artifact-first proposal/design/tasks lifecycle, archive/update discipline, assistant portability.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" collapsing every mission into a spec change; some missions are research, verification, or skill authoring."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "pi-and-oh-my-pi",
			children: "Pi and oh-my-pi"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Pi is a minimal, customizable terminal coding harness with interactive, print/JSON, RPC, and SDK modes. oh-my-pi extends the Pi lineage into a batteries-included terminal agent with LSP, subagents, browser, Python, MCP, sessions, branches, skills, hooks, and isolation backends." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" runtime customizability, JSON/RPC/embed surfaces, session trees, tool-rich execution, subagents.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" assuming the core project engine must be Pi before adapter and artifact contracts are proven."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "agentfs",
			children: "AgentFS"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "AgentFS provides database-backed agent filesystems, overlay/copy-on-write execution, command execution inside mounted filesystems, sync, encryption, MCP filesystem tools, and platform-specific sandbox behavior. It is directly relevant to Ultimate Harness because sandboxing and promotion are core product values." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Copy:" }),
			" copy-on-write filesystem model, explicit mount/exec/run lifecycle, inspectable deltas, syncable state, sandbox boundary concepts.",
			(0, import_jsx_runtime.jsx)(_components.br, {}),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Avoid:" }),
			" treating AgentFS and git worktrees as interchangeable; they solve overlapping but different isolation problems."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "sources-used-in-this-documentation-sprint",
			children: "Sources used in this documentation sprint"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["Specsafe issue tracker: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/Agentic-Engineering-Agency/specsafe/issues",
				children: "https://github.com/Agentic-Engineering-Agency/specsafe/issues"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["BMAD Method: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/bmad-code-org/BMAD-METHOD",
				children: "https://github.com/bmad-code-org/BMAD-METHOD"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["superpowers: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/obra/superpowers",
				children: "https://github.com/obra/superpowers"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["GSD: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/gsd-build/get-shit-done",
				children: "https://github.com/gsd-build/get-shit-done"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["matt-pocock/skills: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/mattpocock/skills",
				children: "https://github.com/mattpocock/skills"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["oh-my-openagent: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/code-yeongyu/oh-my-openagent",
				children: "https://github.com/code-yeongyu/oh-my-openagent"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["OpenSpec: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/Fission-AI/OpenSpec",
				children: "https://github.com/Fission-AI/OpenSpec"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["oh-my-pi: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/can1357/oh-my-pi",
				children: "https://github.com/can1357/oh-my-pi"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["Pi: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://pi.dev/",
				children: "https://pi.dev/"
			})] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: ["AgentFS manual: ", (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md",
				children: "https://github.com/tursodatabase/agentfs/blob/main/MANUAL.md"
			})] }),
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
export { toc as a, structuredData as i, frontmatter as n, inspiration_systems_exports as r, MDXContent as t };
