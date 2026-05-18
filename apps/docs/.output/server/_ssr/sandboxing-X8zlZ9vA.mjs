import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/sandboxing-X8zlZ9vA.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var sandboxing_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Sandboxing",
	"description": "Agent-generated work should happen in an isolated environment by default, then be inspected, verified, reviewed, and promoted."
};
var structuredData = {
	"contents": [
		{
			"heading": "goal",
			"content": "Agent-generated work should happen in an isolated environment by default, then be inspected, verified, reviewed, and promoted."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Create** — allocate an isolated workspace linked to a mission."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Hydrate** — provide required project files, specs, skills, and context."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Execute** — runtime works inside the sandbox."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Inspect** — collect file changes, logs, generated artifacts, and diffs."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Verify** — run checks and review gates."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Promote** — apply approved outputs to canonical state."
		},
		{
			"heading": "sandbox-lifecycle",
			"content": "**Discard/archive** — preserve audit metadata and remove workspace if appropriate."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Strengths:"
		},
		{
			"heading": "git-worktree-backend",
			"content": "Familiar Git workflow."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Easy diff/review/branch promotion."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Good for code changes and documentation edits."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Works without a new filesystem dependency."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Limitations:"
		},
		{
			"heading": "git-worktree-backend",
			"content": "Does not isolate all filesystem effects outside the repo."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Runtime caches/config may still be shared."
		},
		{
			"heading": "git-worktree-backend",
			"content": "Cleanup requires care to avoid deleting user work."
		},
		{
			"heading": "agentfs-backend",
			"content": "Strengths:"
		},
		{
			"heading": "agentfs-backend",
			"content": "Copy-on-write filesystem model."
		},
		{
			"heading": "agentfs-backend",
			"content": "Can run commands inside mounted/overlay filesystems."
		},
		{
			"heading": "agentfs-backend",
			"content": "Supports database-backed state, sync, encryption options, and MCP filesystem tooling."
		},
		{
			"heading": "agentfs-backend",
			"content": "Better fit for inspecting and syncing agent filesystem deltas."
		},
		{
			"heading": "agentfs-backend",
			"content": "Limitations:"
		},
		{
			"heading": "agentfs-backend",
			"content": "Platform behavior differs between Linux and macOS."
		},
		{
			"heading": "agentfs-backend",
			"content": "Operational complexity is higher than worktrees."
		},
		{
			"heading": "agentfs-backend",
			"content": "Requires a stable promotion model before deep integration."
		},
		{
			"heading": "required-safety-rules",
			"content": "A mission must know which sandbox it is using."
		},
		{
			"heading": "required-safety-rules",
			"content": "Promotion must record exactly what changed."
		},
		{
			"heading": "required-safety-rules",
			"content": "Discard must not delete unrecorded human work."
		},
		{
			"heading": "required-safety-rules",
			"content": "Sandbox escapes must be recorded as security findings."
		},
		{
			"heading": "required-safety-rules",
			"content": "Writes outside the allowed project/sandbox scope require explicit policy."
		}
	],
	"headings": [
		{
			"id": "goal",
			"content": "Goal"
		},
		{
			"id": "sandbox-lifecycle",
			"content": "Sandbox lifecycle"
		},
		{
			"id": "git-worktree-backend",
			"content": "Git worktree backend"
		},
		{
			"id": "agentfs-backend",
			"content": "AgentFS backend"
		},
		{
			"id": "backend-interface",
			"content": "Backend interface"
		},
		{
			"id": "required-safety-rules",
			"content": "Required safety rules"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#goal",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Goal" })
	},
	{
		depth: 2,
		url: "#sandbox-lifecycle",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Sandbox lifecycle" })
	},
	{
		depth: 2,
		url: "#git-worktree-backend",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Git worktree backend" })
	},
	{
		depth: 2,
		url: "#agentfs-backend",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "AgentFS backend" })
	},
	{
		depth: 2,
		url: "#backend-interface",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Backend interface" })
	},
	{
		depth: 2,
		url: "#required-safety-rules",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Required safety rules" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		li: "li",
		ol: "ol",
		p: "p",
		pre: "pre",
		span: "span",
		strong: "strong",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "goal",
			children: "Goal"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Agent-generated work should happen in an isolated environment by default, then be inspected, verified, reviewed, and promoted." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "sandbox-lifecycle",
			children: "Sandbox lifecycle"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Create" }), " — allocate an isolated workspace linked to a mission."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Hydrate" }), " — provide required project files, specs, skills, and context."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Execute" }), " — runtime works inside the sandbox."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Inspect" }), " — collect file changes, logs, generated artifacts, and diffs."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Verify" }), " — run checks and review gates."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Promote" }), " — apply approved outputs to canonical state."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Discard/archive" }), " — preserve audit metadata and remove workspace if appropriate."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "git-worktree-backend",
			children: "Git worktree backend"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Strengths:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Familiar Git workflow." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Easy diff/review/branch promotion." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Good for code changes and documentation edits." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Works without a new filesystem dependency." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Limitations:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Does not isolate all filesystem effects outside the repo." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Runtime caches/config may still be shared." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Cleanup requires care to avoid deleting user work." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "agentfs-backend",
			children: "AgentFS backend"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Strengths:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Copy-on-write filesystem model." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Can run commands inside mounted/overlay filesystems." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Supports database-backed state, sync, encryption options, and MCP filesystem tooling." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Better fit for inspecting and syncing agent filesystem deltas." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Limitations:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Platform behavior differs between Linux and macOS." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Operational complexity is higher than worktrees." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Requires a stable promotion model before deep integration." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "backend-interface",
			children: "Backend interface"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "create(mission_id, base_ref, options) -> sandbox_id"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "path(sandbox_id) -> filesystem_path"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "status(sandbox_id) -> created | running | dirty | verified | promoted | discarded"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "collect_diff(sandbox_id) -> diff_ref"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "list_changes(sandbox_id) -> changed_files"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "run_check(sandbox_id, command) -> check_result"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "promote(sandbox_id, selected_changes) -> promotion_result"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "discard(sandbox_id) -> discard_result"
					})
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "required-safety-rules",
			children: "Required safety rules"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "A mission must know which sandbox it is using." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Promotion must record exactly what changed." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Discard must not delete unrecorded human work." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Sandbox escapes must be recorded as security findings." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Writes outside the allowed project/sandbox scope require explicit policy." }),
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
export { toc as a, structuredData as i, frontmatter as n, sandboxing_exports as r, MDXContent as t };
