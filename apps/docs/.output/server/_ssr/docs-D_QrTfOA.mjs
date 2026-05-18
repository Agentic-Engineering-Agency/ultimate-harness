import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/docs-D_QrTfOA.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var docs_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Ultimate Harness Documentation",
	"description": "Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents."
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents."
		},
		{
			"heading": void 0,
			"content": "The core design goal is **portable discipline**: a project should be able to use multiple coding-agent runtimes without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints."
		},
		{
			"heading": void 0,
			"content": "For the active roadmap (epics, in-flight slices, recently shipped), see ROADMAP.md."
		},
		{
			"heading": "start-here",
			"content": "Glossary — shared terms used across the project."
		},
		{
			"heading": "start-here",
			"content": "Product requirements — what the harness is for and who it serves."
		},
		{
			"heading": "start-here",
			"content": "MVP scope — what must exist before implementation grows."
		},
		{
			"heading": "start-here",
			"content": "Architecture overview — major components and boundaries."
		},
		{
			"heading": "start-here",
			"content": "Core entities — canonical vocabulary for data and artifacts."
		},
		{
			"heading": "start-here",
			"content": "Runtime adapter contract — what every adapter implements (includes the UH-28 runtime-final-message protocol)."
		},
		{
			"heading": "start-here",
			"content": "Mission packet schema — the portable work-request format."
		},
		{
			"heading": "start-here",
			"content": "Verification and promotion — how sandbox work becomes canonical work."
		},
		{
			"heading": "start-here",
			"content": "BMAD agent map — how BMAD-style roles map into Ultimate Harness."
		},
		{
			"heading": "adapters",
			"content": "Adapter"
		},
		{
			"heading": "adapters",
			"content": "Status"
		},
		{
			"heading": "adapters",
			"content": "Doc / Runbook"
		},
		{
			"heading": "adapters",
			"content": "`hermes`"
		},
		{
			"heading": "adapters",
			"content": "active"
		},
		{
			"heading": "adapters",
			"content": "Runtime adapter contract defines the shape; `src/adapters/hermes.ts` is the reference implementation."
		},
		{
			"heading": "adapters",
			"content": "`codex`"
		},
		{
			"heading": "adapters",
			"content": "active"
		},
		{
			"heading": "adapters",
			"content": "`architecture/adapter-codex.md`, `runbooks/codex-e2e-smoke.md`"
		},
		{
			"heading": "adapters",
			"content": "`oh-my-pi`"
		},
		{
			"heading": "adapters",
			"content": "experimental"
		},
		{
			"heading": "adapters",
			"content": "`runbooks/anthropic-via-omp.md` — covers the Anthropic-via-OMP routing path and its ToS posture."
		},
		{
			"heading": "adapters",
			"content": "In flight (see ROADMAP.md):"
		},
		{
			"heading": "adapters",
			"content": "`hermes-proxy` — clean ToS-positioned path to subscription routing via Hermes v0.14.0's `hermes proxy` local OAI-compat endpoint (epic UH-32)."
		},
		{
			"heading": "adapters",
			"content": "`uh tui` — interactive terminal UI built on OpenTUI (epic UH-41)."
		},
		{
			"heading": "research",
			"content": "Inspiration systems"
		},
		{
			"heading": "research",
			"content": "Comparison matrix"
		},
		{
			"heading": "research",
			"content": "Adopt / reject / defer decisions"
		},
		{
			"heading": "product",
			"content": "PRD"
		},
		{
			"heading": "product",
			"content": "MVP scope"
		},
		{
			"heading": "product",
			"content": "Non-goals"
		},
		{
			"heading": "product",
			"content": "Personas"
		},
		{
			"heading": "architecture",
			"content": "Overview"
		},
		{
			"heading": "architecture",
			"content": "Entities"
		},
		{
			"heading": "architecture",
			"content": "Runtime adapter contract"
		},
		{
			"heading": "architecture",
			"content": "Codex adapter design"
		},
		{
			"heading": "architecture",
			"content": "Mission packet schema"
		},
		{
			"heading": "architecture",
			"content": ".harness artifacts"
		},
		{
			"heading": "architecture",
			"content": "Skill format"
		},
		{
			"heading": "architecture",
			"content": "Sandboxing"
		},
		{
			"heading": "architecture",
			"content": "AgentFS sandbox backend (design)"
		},
		{
			"heading": "architecture",
			"content": "Verification and promotion"
		},
		{
			"heading": "runbooks",
			"content": "Codex E2E smoke"
		},
		{
			"heading": "runbooks",
			"content": "Anthropic via oh-my-pi"
		},
		{
			"heading": "runbooks",
			"content": "Using `uh tui`"
		},
		{
			"heading": "workflows",
			"content": "Workflow overview"
		},
		{
			"heading": "workflows",
			"content": "Research to spec"
		},
		{
			"heading": "workflows",
			"content": "Spec to plan"
		},
		{
			"heading": "workflows",
			"content": "Plan to mission"
		},
		{
			"heading": "workflows",
			"content": "Mission to sandbox"
		},
		{
			"heading": "workflows",
			"content": "Verify, review, promote"
		},
		{
			"heading": "workflows",
			"content": "BMAD agent map"
		},
		{
			"heading": "verification",
			"content": "Strategy"
		},
		{
			"heading": "verification",
			"content": "Checks"
		},
		{
			"heading": "verification",
			"content": "Review gates"
		},
		{
			"heading": "verification",
			"content": "Audit trail"
		}
	],
	"headings": [
		{
			"id": "start-here",
			"content": "Start here"
		},
		{
			"id": "adapters",
			"content": "Adapters"
		},
		{
			"id": "documentation-map",
			"content": "Documentation map"
		},
		{
			"id": "research",
			"content": "Research"
		},
		{
			"id": "product",
			"content": "Product"
		},
		{
			"id": "architecture",
			"content": "Architecture"
		},
		{
			"id": "runbooks",
			"content": "Runbooks"
		},
		{
			"id": "workflows",
			"content": "Workflows"
		},
		{
			"id": "verification",
			"content": "Verification"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#start-here",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Start here" })
	},
	{
		depth: 2,
		url: "#adapters",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adapters" })
	},
	{
		depth: 2,
		url: "#documentation-map",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Documentation map" })
	},
	{
		depth: 3,
		url: "#research",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Research" })
	},
	{
		depth: 3,
		url: "#product",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Product" })
	},
	{
		depth: 3,
		url: "#architecture",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Architecture" })
	},
	{
		depth: 3,
		url: "#runbooks",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runbooks" })
	},
	{
		depth: 3,
		url: "#workflows",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Workflows" })
	},
	{
		depth: 3,
		url: "#verification",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Verification" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		h2: "h2",
		h3: "h3",
		li: "li",
		ol: "ol",
		p: "p",
		strong: "strong",
		table: "table",
		tbody: "tbody",
		td: "td",
		th: "th",
		thead: "thead",
		tr: "tr",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Ultimate Harness is a runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software-development work across multiple coding agents." }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The core design goal is ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "portable discipline" }),
			": a project should be able to use multiple coding-agent runtimes without losing its specifications, skills, workflow state, audit trail, sandbox boundaries, or human approval checkpoints."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"For the active roadmap (epics, in-flight slices, recently shipped), see ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./ROADMAP.md",
				children: "ROADMAP.md"
			}),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "start-here",
			children: "Start here"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./glossary.md",
				children: "Glossary"
			}), " — shared terms used across the project."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/prd.md",
				children: "Product requirements"
			}), " — what the harness is for and who it serves."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/mvp-scope.md",
				children: "MVP scope"
			}), " — what must exist before implementation grows."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/overview.md",
				children: "Architecture overview"
			}), " — major components and boundaries."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/entities.md",
				children: "Core entities"
			}), " — canonical vocabulary for data and artifacts."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/runtime-adapter-contract.md",
				children: "Runtime adapter contract"
			}), " — what every adapter implements (includes the UH-28 runtime-final-message protocol)."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/mission-packet-schema.md",
				children: "Mission packet schema"
			}), " — the portable work-request format."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/verification-and-promotion.md",
				children: "Verification and promotion"
			}), " — how sandbox work becomes canonical work."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/bmad-agent-map.md",
				children: "BMAD agent map"
			}), " — how BMAD-style roles map into Ultimate Harness."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adapters",
			children: "Adapters"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Adapter" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Status" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Doc / Runbook" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "active" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "./architecture/runtime-adapter-contract.md",
						children: "Runtime adapter contract"
					}),
					" defines the shape; ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "src/adapters/hermes.ts" }),
					" is the reference implementation."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "active" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "./architecture/adapter-codex.md",
						children: (0, import_jsx_runtime.jsx)(_components.code, { children: "architecture/adapter-codex.md" })
					}),
					", ",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "./runbooks/codex-e2e-smoke.md",
						children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runbooks/codex-e2e-smoke.md" })
					})
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "experimental" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
					href: "./runbooks/anthropic-via-omp.md",
					children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runbooks/anthropic-via-omp.md" })
				}), " — covers the Anthropic-via-OMP routing path and its ToS posture."] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"In flight (see ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./ROADMAP.md",
				children: "ROADMAP.md"
			}),
			"):"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
				" — clean ToS-positioned path to subscription routing via Hermes v0.14.0's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy" }),
				" local OAI-compat endpoint (epic ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-32",
					children: "UH-32"
				}),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" }),
				" — interactive terminal UI built on OpenTUI (epic ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-41",
					children: "UH-41"
				}),
				")."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "documentation-map",
			children: "Documentation map"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "research",
			children: "Research"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./research/inspiration-systems.md",
				children: "Inspiration systems"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./research/comparison-matrix.md",
				children: "Comparison matrix"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./research/adopt-reject-defer.md",
				children: "Adopt / reject / defer decisions"
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "product",
			children: "Product"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/prd.md",
				children: "PRD"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/mvp-scope.md",
				children: "MVP scope"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/non-goals.md",
				children: "Non-goals"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./product/personas.md",
				children: "Personas"
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "architecture",
			children: "Architecture"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/overview.md",
				children: "Overview"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/entities.md",
				children: "Entities"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/runtime-adapter-contract.md",
				children: "Runtime adapter contract"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/adapter-codex.md",
				children: "Codex adapter design"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/mission-packet-schema.md",
				children: "Mission packet schema"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/harness-artifacts.md",
				children: ".harness artifacts"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/skill-format.md",
				children: "Skill format"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/sandboxing.md",
				children: "Sandboxing"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/sandbox-agentfs.md",
				children: "AgentFS sandbox backend (design)"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./architecture/verification-and-promotion.md",
				children: "Verification and promotion"
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "runbooks",
			children: "Runbooks"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runbooks/codex-e2e-smoke.md",
				children: "Codex E2E smoke"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runbooks/anthropic-via-omp.md",
				children: "Anthropic via oh-my-pi"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsxs)(_components.a, {
				href: "./runbooks/using-the-tui.md",
				children: ["Using ", (0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui" })]
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "workflows",
			children: "Workflows"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/overview.md",
				children: "Workflow overview"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/research-to-spec.md",
				children: "Research to spec"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/spec-to-plan.md",
				children: "Spec to plan"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/plan-to-mission.md",
				children: "Plan to mission"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/mission-to-sandbox.md",
				children: "Mission to sandbox"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/verify-review-promote.md",
				children: "Verify, review, promote"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./workflows/bmad-agent-map.md",
				children: "BMAD agent map"
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "verification",
			children: "Verification"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./verification/strategy.md",
				children: "Strategy"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./verification/checks.md",
				children: "Checks"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./verification/review-gates.md",
				children: "Review gates"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./verification/audit-trail.md",
				children: "Audit trail"
			}) }),
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
export { toc as a, structuredData as i, docs_exports as n, frontmatter as r, MDXContent as t };
