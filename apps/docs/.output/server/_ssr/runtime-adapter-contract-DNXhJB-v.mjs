import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/runtime-adapter-contract-DNXhJB-v.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var runtime_adapter_contract_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Runtime Adapter Contract",
	"description": "Runtime adapters let Ultimate Harness execute the same mission through different coding agents without changing the mission semantics."
};
var structuredData = {
	"contents": [
		{
			"heading": "purpose",
			"content": "Runtime adapters let Ultimate Harness execute the same mission through different coding agents without changing the mission semantics."
		},
		{
			"heading": "purpose",
			"content": "Adapters must provide structured lifecycle reporting. A shell command is not enough."
		},
		{
			"heading": "preparemission-sandbox",
			"content": "Validates mission compatibility, resolves skills/context, checks runtime availability, and returns a launch plan."
		},
		{
			"heading": "launchprepared_mission",
			"content": "Starts the runtime session and returns a `runtime_session_id`."
		},
		{
			"heading": "observeruntime_session_id",
			"content": "Returns structured events: status, logs, tool calls, file changes, questions, blockers, and partial artifacts."
		},
		{
			"heading": "sendruntime_session_id-message",
			"content": "Optional for interactive steering. Must record steering messages in the audit trail."
		},
		{
			"heading": "collectruntime_session_id",
			"content": "Collects final artifacts: summary, changed files, diffs, logs, generated docs, verification suggestions, and open blockers."
		},
		{
			"heading": "cancelruntime_session_id-reason",
			"content": "Stops a running mission safely and records partial state."
		},
		{
			"heading": "closeruntime_session_id",
			"content": "Releases runtime resources and finalizes session metadata."
		},
		{
			"heading": "capability-model",
			"content": "Adapters should declare capabilities rather than relying on implicit behavior:"
		},
		{
			"heading": "capability-model",
			"content": "`structured_events`"
		},
		{
			"heading": "capability-model",
			"content": "`interactive_steering`"
		},
		{
			"heading": "capability-model",
			"content": "`non_interactive_run`"
		},
		{
			"heading": "capability-model",
			"content": "`skills`"
		},
		{
			"heading": "capability-model",
			"content": "`subagents`"
		},
		{
			"heading": "capability-model",
			"content": "`browser`"
		},
		{
			"heading": "capability-model",
			"content": "`terminal`"
		},
		{
			"heading": "capability-model",
			"content": "`file_tools`"
		},
		{
			"heading": "capability-model",
			"content": "`sandbox_native`"
		},
		{
			"heading": "capability-model",
			"content": "`json_output`"
		},
		{
			"heading": "capability-model",
			"content": "`diff_output`"
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Adapters must:"
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Refuse missions requiring unsupported capabilities."
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Preserve mission IDs in prompts/logs/results."
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Avoid writing directly to canonical state unless promotion policy explicitly allows it."
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Return enough evidence for verification and review."
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Separate runtime errors from mission failures."
		},
		{
			"heading": "adapter-responsibilities",
			"content": "Capture user/human steering as audit events."
		},
		{
			"heading": "adapter-non-responsibilities",
			"content": "Adapters should not:"
		},
		{
			"heading": "adapter-non-responsibilities",
			"content": "Decide product scope."
		},
		{
			"heading": "adapter-non-responsibilities",
			"content": "Rewrite specs without a workflow step."
		},
		{
			"heading": "adapter-non-responsibilities",
			"content": "Promote changes without approval."
		},
		{
			"heading": "adapter-non-responsibilities",
			"content": "Invent undocumented entity names."
		},
		{
			"heading": "runtime-final-message-capture-protocol-uh-28",
			"content": "Every adapter participates in a uniform protocol for capturing the\nmission's final summary message into `runtime-final.txt`:"
		},
		{
			"heading": "prompt-side-contract",
			"content": "The harness appends the following instruction block to the mission\nprompt before handing it to the runtime (`runtimeFinalMessageInstruction()`\nin `src/harness/runtime-final-message.ts`):"
		},
		{
			"heading": "prompt-side-contract",
			"content": "This fenced block MUST be the last block in your output. The harness\nextracts its content verbatim into `runtime-final.txt`."
		}
	],
	"headings": [
		{
			"id": "purpose",
			"content": "Purpose"
		},
		{
			"id": "adapter-manifest",
			"content": "Adapter manifest"
		},
		{
			"id": "required-lifecycle-methods",
			"content": "Required lifecycle methods"
		},
		{
			"id": "preparemission-sandbox",
			"content": "`prepare(mission, sandbox)`"
		},
		{
			"id": "launchprepared_mission",
			"content": "`launch(prepared_mission)`"
		},
		{
			"id": "observeruntime_session_id",
			"content": "`observe(runtime_session_id)`"
		},
		{
			"id": "sendruntime_session_id-message",
			"content": "`send(runtime_session_id, message)`"
		},
		{
			"id": "collectruntime_session_id",
			"content": "`collect(runtime_session_id)`"
		},
		{
			"id": "cancelruntime_session_id-reason",
			"content": "`cancel(runtime_session_id, reason)`"
		},
		{
			"id": "closeruntime_session_id",
			"content": "`close(runtime_session_id)`"
		},
		{
			"id": "runtime-result-shape",
			"content": "Runtime result shape"
		},
		{
			"id": "capability-model",
			"content": "Capability model"
		},
		{
			"id": "adapter-responsibilities",
			"content": "Adapter responsibilities"
		},
		{
			"id": "adapter-non-responsibilities",
			"content": "Adapter non-responsibilities"
		},
		{
			"id": "runtime-final-message-capture-protocol-uh-28",
			"content": "Runtime-final-message capture protocol (UH-28)"
		},
		{
			"id": "prompt-side-contract",
			"content": "Prompt-side contract"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#purpose",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Purpose" })
	},
	{
		depth: 2,
		url: "#adapter-manifest",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adapter manifest" })
	},
	{
		depth: 2,
		url: "#required-lifecycle-methods",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Required lifecycle methods" })
	},
	{
		depth: 3,
		url: "#preparemission-sandbox",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "prepare(mission, sandbox)" }) })
	},
	{
		depth: 3,
		url: "#launchprepared_mission",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "launch(prepared_mission)" }) })
	},
	{
		depth: 3,
		url: "#observeruntime_session_id",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "observe(runtime_session_id)" }) })
	},
	{
		depth: 3,
		url: "#sendruntime_session_id-message",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "send(runtime_session_id, message)" }) })
	},
	{
		depth: 3,
		url: "#collectruntime_session_id",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "collect(runtime_session_id)" }) })
	},
	{
		depth: 3,
		url: "#cancelruntime_session_id-reason",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "cancel(runtime_session_id, reason)" }) })
	},
	{
		depth: 3,
		url: "#closeruntime_session_id",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: "close(runtime_session_id)" }) })
	},
	{
		depth: 2,
		url: "#runtime-result-shape",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime result shape" })
	},
	{
		depth: 2,
		url: "#capability-model",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Capability model" })
	},
	{
		depth: 2,
		url: "#adapter-responsibilities",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adapter responsibilities" })
	},
	{
		depth: 2,
		url: "#adapter-non-responsibilities",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adapter non-responsibilities" })
	},
	{
		depth: 2,
		url: "#runtime-final-message-capture-protocol-uh-28",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Runtime-final-message capture protocol (UH-28)" })
	},
	{
		depth: 3,
		url: "#prompt-side-contract",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Prompt-side contract" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		h3: "h3",
		li: "li",
		ol: "ol",
		p: "p",
		pre: "pre",
		span: "span",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "purpose",
			children: "Purpose"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Runtime adapters let Ultimate Harness execute the same mission through different coding agents without changing the mission semantics." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Adapters must provide structured lifecycle reporting. A shell command is not enough." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adapter-manifest",
			children: "Adapter manifest"
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
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "schema_version"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "uh.adapter.v0"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "hermes"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "name"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "Hermes Agent"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "version"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "0.1.0"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "runtime_kind"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "hermes"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "capabilities"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  interactive"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  non_interactive"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  structured_events"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  sandbox_required"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  subagents"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  skills"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  file_tools"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  browser_tools"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "true"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "supported_sandbox_backends"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "git-worktree"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "agentfs"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "input_formats"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "uh.mission.v0"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "output_formats"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "uh.runtime-result.v0"
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "required-lifecycle-methods",
			children: "Required lifecycle methods"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "preparemission-sandbox",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "prepare(mission, sandbox)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Validates mission compatibility, resolves skills/context, checks runtime availability, and returns a launch plan." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "launchprepared_mission",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "launch(prepared_mission)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Starts the runtime session and returns a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_session_id" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "observeruntime_session_id",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "observe(runtime_session_id)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Returns structured events: status, logs, tool calls, file changes, questions, blockers, and partial artifacts." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "sendruntime_session_id-message",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "send(runtime_session_id, message)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Optional for interactive steering. Must record steering messages in the audit trail." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "collectruntime_session_id",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "collect(runtime_session_id)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Collects final artifacts: summary, changed files, diffs, logs, generated docs, verification suggestions, and open blockers." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "cancelruntime_session_id-reason",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "cancel(runtime_session_id, reason)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Stops a running mission safely and records partial state." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "closeruntime_session_id",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: "close(runtime_session_id)" })
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Releases runtime resources and finalizes session metadata." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-result-shape",
			children: "Runtime result shape"
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
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "schema_version"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "uh.runtime-result.v0"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "mission_id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "mission-2026-05-13-docs-spine"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "runtime"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  adapter_id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "hermes"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  session_id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "hermes-session-abc123"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "status"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "completed"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: " # completed | failed | cancelled | blocked"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "summary"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"Created documentation spine.\""
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "artifacts"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "  - "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "path"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "docs/architecture/runtime-adapter-contract.md"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "    kind"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "documentation"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "    status"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "created"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "changes"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  diff_ref"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: ".harness/missions/mission-.../diff.patch"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "  files_changed"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "    - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "docs/architecture/runtime-adapter-contract.md"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "checks_suggested"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "markdown-link-check docs/**/*.md"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "blockers"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ": []"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "logs"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: ".harness/missions/mission-.../runtime.log"
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "capability-model",
			children: "Capability model"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Adapters should declare capabilities rather than relying on implicit behavior:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "structured_events" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "interactive_steering" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "non_interactive_run" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "skills" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "subagents" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "browser" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "terminal" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "file_tools" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "sandbox_native" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "json_output" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "diff_output" }) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adapter-responsibilities",
			children: "Adapter responsibilities"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Adapters must:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Refuse missions requiring unsupported capabilities." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Preserve mission IDs in prompts/logs/results." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Avoid writing directly to canonical state unless promotion policy explicitly allows it." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Return enough evidence for verification and review." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Separate runtime errors from mission failures." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Capture user/human steering as audit events." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adapter-non-responsibilities",
			children: "Adapter non-responsibilities"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Adapters should not:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Decide product scope." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Rewrite specs without a workflow step." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Promote changes without approval." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Invent undocumented entity names." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "runtime-final-message-capture-protocol-uh-28",
			children: "Runtime-final-message capture protocol (UH-28)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Every adapter participates in a uniform protocol for capturing the\nmission's final summary message into ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }),
			":"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "prompt-side-contract",
			children: "Prompt-side contract"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The harness appends the following instruction block to the mission\nprompt before handing it to the runtime (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtimeFinalMessageInstruction()" }),
			"\nin ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "src/harness/runtime-final-message.ts" }),
			"):"
		] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Runtime final message" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "At the very end of your response, emit your one-paragraph summary inside" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "a fenced code block tagged `uh-runtime-final-message`:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "```uh-runtime-final-message" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "<one-paragraph summary of what you did, what changed, and any caveats>" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This fenced block MUST be the last block in your output. The harness\nextracts its content verbatim into ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }),
			"."
		] }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "### Extraction-side contract" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Each adapter calls `extractRuntimeFinalMessageSentinel(text)` over the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "captured model output and writes the matched content into" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "`runtime-final.txt`. When the sentinel is absent, the adapter falls back" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "to its runtime-native capture path (see table below)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "The extractor:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- Matches `` ```uh-runtime-final-message ``` `` fenced blocks anywhere in" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  the captured text." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- Returns the LAST occurrence (a mission may emit interim drafts; only" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  the terminal block is authoritative)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- Tolerates CRLF line endings, leading/trailing whitespace inside the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  fence, and optional spaces after the opening tag." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- Returns `null` when no sentinel block is present." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "### Per-adapter resolution" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "| Adapter   | Sentinel scan target                                       | Fallback when sentinel absent                                 |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "|-----------|------------------------------------------------------------|---------------------------------------------------------------|" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "| codex     | Content of `--output-last-message` file (raw text)         | Raw file content (Codex's native final message)               |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "| oh-my-pi  | Heuristic-extracted last assistant text (JSON-decoded)     | Heuristic last assistant text (unchanged from pre-UH-28)      |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "| hermes    | Hermes stdout text                                         | Empty file (Hermes does not produce a native summary today)   |" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "### Status semantics" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- The sentinel does NOT change `runtime-result.status`. Status remains" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  driven by exit code, runtime-native signals (Codex's" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  `--output-last-message` presence, Hermes' `uh.runtime-result.v0`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  block, oh-my-pi's heuristic finalMessage non-empty check)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- A mission may emit a runtime-result `status: passed` even when the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  sentinel is omitted, as long as the runtime-native fallback path" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  satisfies the adapter's success criteria. The sentinel is the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  *preferred* summary source, not a *required* one." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "### Why a single shared protocol" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Before UH-28 each adapter rolled its own final-message capture:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Codex used a side-channel file, Hermes had no `runtime-final.txt` at all," })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "oh-my-pi did a JSON heuristic. UH-28 lets missions explicitly bound the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "summary independent of runtime quirks, which:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "1. Makes the summary deterministic across runtimes for cross-runtime" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   QA comparisons." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "2. Removes the need for adapter-specific prompt instructions (each" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   buildMissionPrompt now appends the same sentinel block)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "3. Lets the harness add structured terminal annotations in the future" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   (e.g. `uh-runtime-blockers`, `uh-runtime-next-steps`) using the" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   same extraction pattern." })
				})
			] })
		}) })
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
export { toc as a, structuredData as i, frontmatter as n, runtime_adapter_contract_exports as r, MDXContent as t };
