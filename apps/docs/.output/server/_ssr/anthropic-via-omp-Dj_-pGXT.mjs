import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/anthropic-via-omp-Dj_-pGXT.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var anthropic_via_omp_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Anthropic via oh-my-pi (UH-27)",
	"description": "Routing Claude models through Ultimate Harness without building a native"
};
var structuredData = {
	"contents": [
		{
			"heading": "what-this-runbook-covers",
			"content": "Routing Claude models through Ultimate Harness without building a native\nAnthropic adapter — by using the existing `oh-my-pi` adapter (shipped in\nUH-25) and the new mission-level `runtime_config_overrides` (UH-27) to\nselect an Anthropic-tier model per mission."
		},
		{
			"heading": "what-this-runbook-covers",
			"content": "Adapter manifest at `.harness/adapters/oh-my-pi.yaml` does NOT need to\nchange; the default `model: \"\"` stays empty so other missions keep their\nown model choice."
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "**OMP's anthropic provider authenticates against Claude Pro/Max via a\nPKCE flow that uses Claude Code's OAuth `client_id`** (base64-decoded in\n`packages/ai/src/utils/oauth/anthropic.ts`). On the wire, OMP additionally\napplies a \"stealth surface\" so Anthropic's server-side detection does not\nreject the request:"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "Claude Code system-prompt prefix: `\"You are a Claude agent, built on\nAnthropic's Claude Agent SDK.\"` (see OMP `claudeCodeSystemInstruction`)"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "`proxy_*` tool name prefix (matches Claude Code's convention)"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "`User-Agent: claude-cli/`version\\`\\` plus `claudeCodeHeaders` and the\nClaude Code beta-feature header set"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "Node TLS ciphersuite ordering matching Claude Code's binary\n(`CLAUDE_CODE_TLS_CIPHERS = tls.DEFAULT_CIPHERS`)"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "**Anthropic Consumer ToS (Feb 20, 2026) explicitly prohibits using\nsubscription OAuth tokens outside Claude Code.** Server-side detection\nhas been live since Jan 9, 2026 (it killed OpenCode, Roo Code, Cline).\nOMP's stealth surface currently bypasses that detection — but this is a\ncat-and-mouse posture, not a stable contract:"
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "If Anthropic tightens detection (e.g. adds tool-name-pattern matching),\nevery mission using this route fails together until OMP catches up."
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "A ToS escalation by Anthropic against the `client_id` would invalidate\nevery Claude Max user's tokens."
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "Reputationally, UH's posture inherits OMP's posture; if that becomes a\nproblem, switch missions to a paid `ANTHROPIC_API_KEY` route\n(a future UH issue may add a native adapter)."
		},
		{
			"heading": "auth--tos-posture--read-this-before-adopting",
			"content": "You are responsible for accepting this risk on your Anthropic account.\nThis runbook does not endorse the route — it documents it because UH-26\nmade the override path explicit and UH-27 chose to wire it."
		},
		{
			"heading": "prerequisites",
			"content": "OMP installed and on `PATH` (`omp --version` ≥ `15.1.3`)."
		},
		{
			"heading": "prerequisites",
			"content": "Claude Pro or Claude Max subscription, logged in via OMP:"
		},
		{
			"heading": "prerequisites",
			"content": "This runs the PKCE flow on `localhost:54545`; on success OMP stores a\nrefreshable OAuth token in its credential database."
		},
		{
			"heading": "prerequisites",
			"content": "UH `.harness/adapters/oh-my-pi.yaml` present (created by `uh init`).\nThe manifest's `config.runtime_config.model:` may stay empty — the\nmission-level override fills it in per-mission."
		},
		{
			"heading": "smoke-test-sequence",
			"content": "The reference mission lives at `examples/missions/anthropic-via-omp-smoke.yaml`.\nCopy it under `.harness/missions/`id`/mission.yaml` in a host project to\nexercise the path:"
		},
		{
			"heading": "smoke-test-sequence",
			"content": "The dry-run output should include `--model anthropic/claude-opus-4-7` in\nthe planned `args`. Then:"
		},
		{
			"heading": "smoke-test-sequence",
			"content": "Watch `.harness/missions/`id`/runtime.stdout.log` for OMP's NDJSON event\nstream. A successful run produces:"
		},
		{
			"heading": "smoke-test-sequence",
			"content": "`runtime-final.txt` containing the assistant's last message"
		},
		{
			"heading": "smoke-test-sequence",
			"content": "`events.ndjson` with `runtime.started` → `oh-my-pi.message`\\* →\n`runtime.finished`"
		},
		{
			"heading": "smoke-test-sequence",
			"content": "`runtime-result.yaml` with `status: passed`"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Symptom"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Likely cause"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Remediation"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "`401 Unauthorized` in stderr"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "OMP token expired or revoked"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "`omp auth login anthropic` to refresh"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "`runtime-result.yaml: status: blocked` + \"auth or quota error\""
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Detected by `detectOhMyPiQuotaError`; usually a tightened Anthropic server-side block"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Check OMP release notes for stealth-surface updates; pin a known-good OMP version"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "`Mission runtime_config_overrides validation failed`"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Typo or unknown key in mission override"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Diff against `OhMyPiRuntimeConfigSchema` in `src/adapters/oh-my-pi.ts`"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "Hangs without final message"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "OMP exited before emitting an assistant event"
		},
		{
			"heading": "failure-modes--what-to-do",
			"content": "`runtime-result.yaml: status: blocked`; inspect stderr; common cause is upstream rate-limit"
		},
		{
			"heading": "mission-override-schema",
			"content": "Mission-level `runtime_config_overrides` is validated by the same strict\n`OhMyPiRuntimeConfigSchema` as the adapter manifest, after merging.\nValid keys:"
		},
		{
			"heading": "mission-override-schema",
			"content": "`mode`: `json | text | rpc | rpc-ui` (default `json`; `rpc-ui` is rejected\nfor headless runs)"
		},
		{
			"heading": "mission-override-schema",
			"content": "`thinking`: `\"\" | minimal | low | medium | high | xhigh`"
		},
		{
			"heading": "mission-override-schema",
			"content": "`allow_extensions`: boolean"
		},
		{
			"heading": "mission-override-schema",
			"content": "`allow_skills`: boolean"
		},
		{
			"heading": "mission-override-schema",
			"content": "`model`: arbitrary string; OMP routes `anthropic/...`, `openai/...`,\n`openrouter/...`, etc."
		},
		{
			"heading": "mission-override-schema",
			"content": "Unknown keys raise a load-time Zod error — same typo safety as the\nadapter manifest after UH-26."
		},
		{
			"heading": "out-of-scope-for-uh-27",
			"content": "Per-runtime override merging for `hermes` and `codex` adapters (parity\nfollow-up: file UH-31 when needed)."
		},
		{
			"heading": "out-of-scope-for-uh-27",
			"content": "Native Anthropic adapter using `ANTHROPIC_API_KEY` (the ToS-clean\nalternative; file as UH-29 when desired)."
		},
		{
			"heading": "out-of-scope-for-uh-27",
			"content": "OpenRouter/Vercel AI Gateway routing (file as UH-30)."
		}
	],
	"headings": [
		{
			"id": "what-this-runbook-covers",
			"content": "What this runbook covers"
		},
		{
			"id": "auth--tos-posture--read-this-before-adopting",
			"content": "Auth & ToS posture — read this before adopting"
		},
		{
			"id": "prerequisites",
			"content": "Prerequisites"
		},
		{
			"id": "smoke-test-sequence",
			"content": "Smoke test sequence"
		},
		{
			"id": "failure-modes--what-to-do",
			"content": "Failure modes & what to do"
		},
		{
			"id": "mission-override-schema",
			"content": "Mission override schema"
		},
		{
			"id": "out-of-scope-for-uh-27",
			"content": "Out of scope for UH-27"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#what-this-runbook-covers",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "What this runbook covers" })
	},
	{
		depth: 2,
		url: "#auth--tos-posture--read-this-before-adopting",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Auth & ToS posture — read this before adopting" })
	},
	{
		depth: 2,
		url: "#prerequisites",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Prerequisites" })
	},
	{
		depth: 2,
		url: "#smoke-test-sequence",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Smoke test sequence" })
	},
	{
		depth: 2,
		url: "#failure-modes--what-to-do",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Failure modes & what to do" })
	},
	{
		depth: 2,
		url: "#mission-override-schema",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Mission override schema" })
	},
	{
		depth: 2,
		url: "#out-of-scope-for-uh-27",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Out of scope for UH-27" })
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
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "what-this-runbook-covers",
			children: "What this runbook covers"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Routing Claude models through Ultimate Harness without building a native\nAnthropic adapter — by using the existing ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }),
			" adapter (shipped in\nUH-25) and the new mission-level ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides" }),
			" (UH-27) to\nselect an Anthropic-tier model per mission."
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
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "# .harness/missions/`id`/mission.yaml"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "runtime_config_overrides"
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
							children: "  model"
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
							children: "anthropic/claude-opus-4-7"
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
							children: "  thinking"
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
							children: "medium"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Adapter manifest at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/oh-my-pi.yaml" }),
			" does NOT need to\nchange; the default ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "model: \"\"" }),
			" stays empty so other missions keep their\nown model choice."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "auth--tos-posture--read-this-before-adopting",
			children: "Auth & ToS posture — read this before adopting"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsxs)(_components.strong, { children: ["OMP's anthropic provider authenticates against Claude Pro/Max via a\nPKCE flow that uses Claude Code's OAuth ", (0, import_jsx_runtime.jsx)(_components.code, { children: "client_id" })] }),
			" (base64-decoded in\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "packages/ai/src/utils/oauth/anthropic.ts" }),
			"). On the wire, OMP additionally\napplies a \"stealth surface\" so Anthropic's server-side detection does not\nreject the request:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Claude Code system-prompt prefix: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\"You are a Claude agent, built on Anthropic's Claude Agent SDK.\"" }),
				" (see OMP ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "claudeCodeSystemInstruction" }),
				")"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "proxy_*" }), " tool name prefix (matches Claude Code's convention)"] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "User-Agent: claude-cli/" }),
				"version`` plus ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "claudeCodeHeaders" }),
				" and the\nClaude Code beta-feature header set"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Node TLS ciphersuite ordering matching Claude Code's binary\n(",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "CLAUDE_CODE_TLS_CIPHERS = tls.DEFAULT_CIPHERS" }),
				")"
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Anthropic Consumer ToS (Feb 20, 2026) explicitly prohibits using\nsubscription OAuth tokens outside Claude Code." }), " Server-side detection\nhas been live since Jan 9, 2026 (it killed OpenCode, Roo Code, Cline).\nOMP's stealth surface currently bypasses that detection — but this is a\ncat-and-mouse posture, not a stable contract:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "If Anthropic tightens detection (e.g. adds tool-name-pattern matching),\nevery mission using this route fails together until OMP catches up." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A ToS escalation by Anthropic against the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "client_id" }),
				" would invalidate\nevery Claude Max user's tokens."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Reputationally, UH's posture inherits OMP's posture; if that becomes a\nproblem, switch missions to a paid ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "ANTHROPIC_API_KEY" }),
				" route\n(a future UH issue may add a native adapter)."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "You are responsible for accepting this risk on your Anthropic account.\nThis runbook does not endorse the route — it documents it because UH-26\nmade the override path explicit and UH-27 chose to wire it." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "prerequisites",
			children: "Prerequisites"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"OMP installed and on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "PATH" }),
				" (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "omp --version" }),
				" ≥ ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "15.1.3" }),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Claude Pro or Claude Max subscription, logged in via OMP:",
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
					children: (0, import_jsx_runtime.jsx)(_components.code, { children: (0, import_jsx_runtime.jsx)(_components.span, {
						className: "line",
						children: (0, import_jsx_runtime.jsx)(_components.span, { children: "omp auth login anthropic" })
					}) })
				}) }),
				"\n",
				"This runs the PKCE flow on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "localhost:54545" }),
				"; on success OMP stores a\nrefreshable OAuth token in its credential database."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"UH ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/oh-my-pi.yaml" }),
				" present (created by ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh init" }),
				").\nThe manifest's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "config.runtime_config.model:" }),
				" may stay empty — the\nmission-level override fills it in per-mission."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "smoke-test-sequence",
			children: "Smoke test sequence"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The reference mission lives at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "examples/missions/anthropic-via-omp-smoke.yaml" }),
			".\nCopy it under ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/mission.yaml" }),
			" in a host project to\nexercise the path:"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "uh mission dry-run .harness/missions/anthropic-via-omp-smoke/mission.yaml \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --runtime oh-my-pi" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The dry-run output should include ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--model anthropic/claude-opus-4-7" }),
			" in\nthe planned ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "args" }),
			". Then:"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "uh mission run .harness/missions/anthropic-via-omp-smoke/mission.yaml \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --runtime oh-my-pi" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Watch ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/runtime.stdout.log" }),
			" for OMP's NDJSON event\nstream. A successful run produces:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }), " containing the assistant's last message"] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
				" with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.started" }),
				" → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi.message" }),
				"* →\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.finished" })
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.yaml" }),
				" with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: passed" })
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "failure-modes--what-to-do",
			children: "Failure modes & what to do"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Symptom" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Likely cause" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Remediation" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "401 Unauthorized" }), " in stderr"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "OMP token expired or revoked" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "omp auth login anthropic" }), " to refresh"] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.yaml: status: blocked" }), " + \"auth or quota error\""] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Detected by ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "detectOhMyPiQuotaError" }),
					"; usually a tightened Anthropic server-side block"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Check OMP release notes for stealth-surface updates; pin a known-good OMP version" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "Mission runtime_config_overrides validation failed" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Typo or unknown key in mission override" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Diff against ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "OhMyPiRuntimeConfigSchema" }),
					" in ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "src/adapters/oh-my-pi.ts" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Hangs without final message" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "OMP exited before emitting an assistant event" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.yaml: status: blocked" }), "; inspect stderr; common cause is upstream rate-limit"] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission-override-schema",
			children: "Mission override schema"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Mission-level ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides" }),
			" is validated by the same strict\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "OhMyPiRuntimeConfigSchema" }),
			" as the adapter manifest, after merging.\nValid keys:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mode" }),
				": ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "json | text | rpc | rpc-ui" }),
				" (default ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "json" }),
				"; ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "rpc-ui" }),
				" is rejected\nfor headless runs)"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "thinking" }),
				": ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\"\" | minimal | low | medium | high | xhigh" })
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "allow_extensions" }), ": boolean"] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "allow_skills" }), ": boolean"] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "model" }),
				": arbitrary string; OMP routes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic/..." }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "openai/..." }),
				",\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "openrouter/..." }),
				", etc."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Unknown keys raise a load-time Zod error — same typo safety as the\nadapter manifest after UH-26." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "out-of-scope-for-uh-27",
			children: "Out of scope for UH-27"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Per-runtime override merging for ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
				" adapters (parity\nfollow-up: file UH-31 when needed)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Native Anthropic adapter using ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "ANTHROPIC_API_KEY" }),
				" (the ToS-clean\nalternative; file as UH-29 when desired)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "OpenRouter/Vercel AI Gateway routing (file as UH-30)." }),
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
export { toc as a, structuredData as i, anthropic_via_omp_exports as n, frontmatter as r, MDXContent as t };
