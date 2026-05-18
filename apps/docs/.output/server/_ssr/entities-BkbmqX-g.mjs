import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/entities-BkbmqX-g.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var entities_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Core Entities",
	"description": "A repository or workspace managed by Ultimate Harness. It owns `.harness/` metadata and links to external issue trackers."
};
var structuredData = {
	"contents": [
		{
			"heading": "project",
			"content": "A repository or workspace managed by Ultimate Harness. It owns `.harness/` metadata and links to external issue trackers."
		},
		{
			"heading": "project",
			"content": "Key fields:"
		},
		{
			"heading": "project",
			"content": "`id`"
		},
		{
			"heading": "project",
			"content": "`name`"
		},
		{
			"heading": "project",
			"content": "`root_path`"
		},
		{
			"heading": "project",
			"content": "`issue_sources`"
		},
		{
			"heading": "project",
			"content": "`default_workflow_profiles`"
		},
		{
			"heading": "project",
			"content": "`artifact_schema_version`"
		},
		{
			"heading": "issue-reference",
			"content": "A link to GitHub, Linear, or another tracker item."
		},
		{
			"heading": "issue-reference",
			"content": "Key fields:"
		},
		{
			"heading": "issue-reference",
			"content": "`provider`"
		},
		{
			"heading": "issue-reference",
			"content": "`id`"
		},
		{
			"heading": "issue-reference",
			"content": "`url`"
		},
		{
			"heading": "issue-reference",
			"content": "`title`"
		},
		{
			"heading": "issue-reference",
			"content": "`status`"
		},
		{
			"heading": "spec",
			"content": "A durable statement of desired behavior, constraints, and acceptance criteria."
		},
		{
			"heading": "workflow-profile",
			"content": "A named recipe for turning a request into missions and verification gates."
		},
		{
			"heading": "skill",
			"content": "A reusable procedural capability with metadata, body, prerequisites, and verification hooks."
		},
		{
			"heading": "mission",
			"content": "A bounded executable work unit compiled from a request/spec/plan."
		},
		{
			"heading": "mission-packet",
			"content": "The serialized mission passed to a runtime adapter."
		},
		{
			"heading": "runtime",
			"content": "The external agent system that executes work."
		},
		{
			"heading": "runtime-adapter",
			"content": "The code/config that maps Ultimate Harness lifecycle calls to a runtime."
		},
		{
			"heading": "runtime-session",
			"content": "A single execution attempt inside a runtime, associated with a mission and sandbox."
		},
		{
			"heading": "sandbox",
			"content": "An isolated workspace where the runtime performs changes."
		},
		{
			"heading": "artifact",
			"content": "Any output produced or consumed by the harness: docs, specs, plans, prompts, logs, diffs, verification results, review notes, or promoted files."
		},
		{
			"heading": "verification-result",
			"content": "Structured evidence for checks and reviews."
		},
		{
			"heading": "promotion-record",
			"content": "A record that approved sandbox artifacts were moved into canonical state."
		},
		{
			"heading": "audit-event",
			"content": "Append-only trace event connecting decisions, runtime activity, verification, and promotion."
		}
	],
	"headings": [
		{
			"id": "project",
			"content": "Project"
		},
		{
			"id": "issue-reference",
			"content": "Issue reference"
		},
		{
			"id": "spec",
			"content": "Spec"
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
			"id": "mission",
			"content": "Mission"
		},
		{
			"id": "mission-packet",
			"content": "Mission packet"
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
			"id": "runtime-session",
			"content": "Runtime session"
		},
		{
			"id": "sandbox",
			"content": "Sandbox"
		},
		{
			"id": "artifact",
			"content": "Artifact"
		},
		{
			"id": "verification-result",
			"content": "Verification result"
		},
		{
			"id": "promotion-record",
			"content": "Promotion record"
		},
		{
			"id": "audit-event",
			"content": "Audit event"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#project",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Project" })
	},
	{
		depth: 2,
		url: "#issue-reference",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Issue reference" })
	},
	{
		depth: 2,
		url: "#spec",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Spec" })
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
		url: "#runtime-session",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime session" })
	},
	{
		depth: 2,
		url: "#sandbox",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Sandbox" })
	},
	{
		depth: 2,
		url: "#artifact",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Artifact" })
	},
	{
		depth: 2,
		url: "#verification-result",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Verification result" })
	},
	{
		depth: 2,
		url: "#promotion-record",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Promotion record" })
	},
	{
		depth: 2,
		url: "#audit-event",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Audit event" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		li: "li",
		p: "p",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "project",
			children: "Project"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"A repository or workspace managed by Ultimate Harness. It owns ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/" }),
			" metadata and links to external issue trackers."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Key fields:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "id" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "name" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "root_path" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "issue_sources" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "default_workflow_profiles" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "artifact_schema_version" }) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "issue-reference",
			children: "Issue reference"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A link to GitHub, Linear, or another tracker item." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Key fields:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "provider" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "id" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "url" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "title" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "status" }) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "spec",
			children: "Spec"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A durable statement of desired behavior, constraints, and acceptance criteria." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "workflow-profile",
			children: "Workflow profile"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A named recipe for turning a request into missions and verification gates." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "skill",
			children: "Skill"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A reusable procedural capability with metadata, body, prerequisites, and verification hooks." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission",
			children: "Mission"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A bounded executable work unit compiled from a request/spec/plan." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission-packet",
			children: "Mission packet"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The serialized mission passed to a runtime adapter." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime",
			children: "Runtime"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The external agent system that executes work." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-adapter",
			children: "Runtime adapter"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The code/config that maps Ultimate Harness lifecycle calls to a runtime." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-session",
			children: "Runtime session"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A single execution attempt inside a runtime, associated with a mission and sandbox." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "sandbox",
			children: "Sandbox"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "An isolated workspace where the runtime performs changes." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "artifact",
			children: "Artifact"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Any output produced or consumed by the harness: docs, specs, plans, prompts, logs, diffs, verification results, review notes, or promoted files." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "verification-result",
			children: "Verification result"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Structured evidence for checks and reviews." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "promotion-record",
			children: "Promotion record"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "A record that approved sandbox artifacts were moved into canonical state." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "audit-event",
			children: "Audit event"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Append-only trace event connecting decisions, runtime activity, verification, and promotion." })
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
export { toc as a, structuredData as i, entities_exports as n, frontmatter as r, MDXContent as t };
