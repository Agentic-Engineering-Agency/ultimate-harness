import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hermes-proxy-setup-Dk9qRRRP.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var hermes_proxy_setup_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Hermes Proxy — operator setup runbook",
	"description": "Zero-to-`runtime-result.status: passed` for the `hermes-proxy` adapter. Architecture context lives in [`docs/architecture/adapter-hermes-proxy.md`](../architecture/adapter-hermes-proxy.md); wire-format discovery is in [`docs/architecture/he"
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Zero-to-`runtime-result.status: passed` for the `hermes-proxy` adapter. Architecture context lives in `docs/architecture/adapter-hermes-proxy.md`; wire-format discovery is in `docs/architecture/hermes-proxy-spike.md`."
		},
		{
			"heading": "prerequisites",
			"content": "**Hermes Agent ≥ 0.14.0** installed locally."
		},
		{
			"heading": "prerequisites",
			"content": "If the version is older, upgrade per the Hermes release notes. UH's `hermes` adapter rejects pre-0.14.0 installs (UH-31)."
		},
		{
			"heading": "prerequisites",
			"content": "**An authenticated provider.** Today only the `nous` provider ships in `hermes proxy`. Check status:"
		},
		{
			"heading": "prerequisites",
			"content": "If the response is `logged out (Invalid refresh token)`, re-auth via `hermes auth add nous` and complete the vendor OAuth flow."
		},
		{
			"heading": "prerequisites",
			"content": "**A UH project on `≥ 0.2.x`.** `uh adapter list` must include `hermes-proxy`. If not, run `uh adapter add hermes-proxy` from the project root."
		},
		{
			"heading": "start-the-proxy",
			"content": "Defaults: `127.0.0.1:8645`. Override with `--host` / `--port` if 8645 is taken. Keep the proxy running in a dedicated terminal (or process supervisor); UH does not start or supervise it."
		},
		{
			"heading": "verify-reachability",
			"content": "Failure modes from this command:"
		},
		{
			"heading": "verify-reachability",
			"content": "Output"
		},
		{
			"heading": "verify-reachability",
			"content": "Meaning"
		},
		{
			"heading": "verify-reachability",
			"content": "Remediation"
		},
		{
			"heading": "verify-reachability",
			"content": "`endpoint unreachable: … (is `hermes proxy start` running?)`"
		},
		{
			"heading": "verify-reachability",
			"content": "Proxy is not listening on `endpoint`"
		},
		{
			"heading": "verify-reachability",
			"content": "Start the proxy; check `--port` matches `runtime_config.endpoint`"
		},
		{
			"heading": "verify-reachability",
			"content": "`HTTP 401 from proxy: … (run `hermes auth status nous` to re-auth)`"
		},
		{
			"heading": "verify-reachability",
			"content": "Upstream credentials expired"
		},
		{
			"heading": "verify-reachability",
			"content": "`hermes auth add nous` and complete OAuth"
		},
		{
			"heading": "verify-reachability",
			"content": "`HTTP 404 (proxy version may not forward /models)`"
		},
		{
			"heading": "verify-reachability",
			"content": "Hermes binary has changed the proxy route set"
		},
		{
			"heading": "verify-reachability",
			"content": "Recheck `hermes --version`; file an issue if `0.14.x` no longer forwards `/models`"
		},
		{
			"heading": "verify-reachability",
			"content": "`adapter check timed out after 5000 ms`"
		},
		{
			"heading": "verify-reachability",
			"content": "Proxy started but is hanging"
		},
		{
			"heading": "verify-reachability",
			"content": "Inspect proxy logs; restart"
		},
		{
			"heading": "verify-reachability",
			"content": "`missing endpoint in runtime_config`"
		},
		{
			"heading": "verify-reachability",
			"content": "Manifest is malformed"
		},
		{
			"heading": "verify-reachability",
			"content": "Re-run `uh adapter add hermes-proxy --force`"
		},
		{
			"heading": "configure-the-manifest",
			"content": "The default manifest at `.harness/adapters/hermes-proxy.yaml` is correct for a vanilla local install. Edit only if you've moved the proxy:"
		},
		{
			"heading": "configure-the-manifest",
			"content": "**Important — model id.** `hermes-4-405b` is the manifest default but is NOT in every upstream's catalog. The current Nous Portal upstream proxies via OpenRouter, whose catalog includes ids like `anthropic/claude-opus-4`, `openai/gpt-5-pro`, etc. Run `curl -sS -H 'authorization: Bearer x' http://127.0.0.1:8645/v1/models | jq '.data[].id'` to enumerate, or override per-mission via `runtime_config_overrides.model`."
		},
		{
			"heading": "smoke-run",
			"content": "Create a tiny mission:"
		},
		{
			"heading": "smoke-run",
			"content": "Optionally override the model per mission (recommended on a fresh install):"
		},
		{
			"heading": "smoke-run",
			"content": "Dry-run first to inspect the rendered request:"
		},
		{
			"heading": "smoke-run",
			"content": "Run for real:"
		},
		{
			"heading": "smoke-run",
			"content": "Expected:"
		},
		{
			"heading": "smoke-run",
			"content": "`.harness/missions/hp-smoke/runtime-result.yaml` → `status: passed`."
		},
		{
			"heading": "smoke-run",
			"content": "`.harness/missions/hp-smoke/runtime-final.txt` → one-paragraph summary (extracted from the model's UH-28 sentinel block, when emitted)."
		},
		{
			"heading": "smoke-run",
			"content": "`.harness/missions/hp-smoke/runtime.stdout.log` → full assistant message."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Symptom"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Where it shows up"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Action"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[BLOCKED]` + `endpoint unreachable`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`runtime-result.yaml errors[]`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Proxy died; restart `hermes proxy start`."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[BLOCKED]` + `upstream auth failed`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "runtime-result errors"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Re-auth via `hermes auth add `provider\\`\\`. The full upstream message is in `runtime.stderr.log`."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[BLOCKED]` + `model \"`id`\" not available`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "runtime-result errors"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Pick a model id that `adapter check` enumerated. Override per-mission via `runtime_config_overrides.model`."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[FAIL]` + HTTP 4xx other than 401/403/404"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "runtime-result errors"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Verbatim upstream envelope. Often quota / rate-limit; check the upstream provider's status page."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[FAIL]` + `request timed out after `ms` ms`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "runtime-result errors"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Raise `request_timeout_ms` (manifest or per-mission). 405B routing latencies can exceed 90s."
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "`[FAIL]` + `empty assistant message`"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "runtime-result errors"
		},
		{
			"heading": "failure-modes-during-a-real-run",
			"content": "Upstream returned 200 but no content. Usually a moderation block on the model side."
		},
		{
			"heading": "cleanup",
			"content": "Stop the proxy with `Ctrl+C` in its terminal. Hermes flushes its own state; UH artifacts stay where they are."
		},
		{
			"heading": "cleanup",
			"content": "To completely re-baseline:"
		},
		{
			"heading": "comparison-with-anthropic-via-omp",
			"content": "If you previously used the `anthropic-via-omp` path (see `anthropic-via-omp.md`), `hermes-proxy` is the ToS-positioned replacement. Both routes can coexist in the same UH project — `oh-my-pi` is unaffected. Prefer `hermes-proxy` for new deployments; the OMP stealth surface remains documented but carries the Feb-2026 Anthropic ToS friction."
		},
		{
			"heading": "references",
			"content": "UH-32 epic"
		},
		{
			"heading": "references",
			"content": "Architecture doc"
		},
		{
			"heading": "references",
			"content": "Wire-format spike"
		},
		{
			"heading": "references",
			"content": "Hermes Agent 0.14.0 release notes"
		}
	],
	"headings": [
		{
			"id": "prerequisites",
			"content": "Prerequisites"
		},
		{
			"id": "start-the-proxy",
			"content": "Start the proxy"
		},
		{
			"id": "verify-reachability",
			"content": "Verify reachability"
		},
		{
			"id": "configure-the-manifest",
			"content": "Configure the manifest"
		},
		{
			"id": "smoke-run",
			"content": "Smoke run"
		},
		{
			"id": "failure-modes-during-a-real-run",
			"content": "Failure modes (during a real run)"
		},
		{
			"id": "cleanup",
			"content": "Cleanup"
		},
		{
			"id": "comparison-with-anthropic-via-omp",
			"content": "Comparison with `anthropic-via-omp`"
		},
		{
			"id": "references",
			"content": "References"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#prerequisites",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Prerequisites" })
	},
	{
		depth: 2,
		url: "#start-the-proxy",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Start the proxy" })
	},
	{
		depth: 2,
		url: "#verify-reachability",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Verify reachability" })
	},
	{
		depth: 2,
		url: "#configure-the-manifest",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Configure the manifest" })
	},
	{
		depth: 2,
		url: "#smoke-run",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Smoke run" })
	},
	{
		depth: 2,
		url: "#failure-modes-during-a-real-run",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Failure modes (during a real run)" })
	},
	{
		depth: 2,
		url: "#cleanup",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Cleanup" })
	},
	{
		depth: 2,
		url: "#comparison-with-anthropic-via-omp",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["Comparison with ", (0, import_jsx_runtime.jsx)("code", { children: "anthropic-via-omp" })] })
	},
	{
		depth: 2,
		url: "#references",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "References" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
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
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Zero-to-",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: passed" }),
			" for the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			" adapter. Architecture context lives in ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../architecture/adapter-hermes-proxy.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/adapter-hermes-proxy.md" })
			}),
			"; wire-format discovery is in ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../architecture/hermes-proxy-spike.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/hermes-proxy-spike.md" })
			}),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "prerequisites",
			children: "Prerequisites"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Hermes Agent ≥ 0.14.0" }),
				" installed locally.",
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
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes --version" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Hermes Agent v0.14.0 (2026.5.16)" })
						})
					] })
				}) }),
				"\n",
				"If the version is older, upgrade per the ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16",
					children: "Hermes release notes"
				}),
				". UH's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
				" adapter rejects pre-0.14.0 installs (",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-31",
					children: "UH-31"
				}),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "An authenticated provider." }),
				" Today only the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "nous" }),
				" provider ships in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy" }),
				". Check status:",
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
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes auth status nous" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "nous: ok" })
						})
					] })
				}) }),
				"\n",
				"If the response is ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "logged out (Invalid refresh token)" }),
				", re-auth via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth add nous" }),
				" and complete the vendor OAuth flow."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"A UH project on ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "≥ 0.2.x" }),
					"."
				] }),
				" ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter list" }),
				" must include ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
				". If not, run ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter add hermes-proxy" }),
				" from the project root."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "start-the-proxy",
			children: "Start the proxy"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes proxy start --provider nous" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Starting Hermes proxy for Nous Portal" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  Listening on:  http://127.0.0.1:8645/v1" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  Forwarding to: (resolved per-request from your subscription)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  Use any bearer token in the client — the proxy attaches your real credential." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Press Ctrl+C to stop." })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Defaults: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "127.0.0.1:8645" }),
			". Override with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--host" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--port" }),
			" if 8645 is taken. Keep the proxy running in a dedicated terminal (or process supervisor); UH does not start or supervise it."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "verify-reachability",
			children: "Verify reachability"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ uh adapter check hermes-proxy" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "[PASS] hermes-proxy adapter" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  runtime: hermes-proxy" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  version: proxy reachable at http://127.0.0.1:8645/v1 (406 models available)" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Failure modes from this command:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Output" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Meaning" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Remediation" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint unreachable: … (is " }),
					"hermes proxy start",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " running?)" })
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["Proxy is not listening on ", (0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint" })] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Start the proxy; check ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "--port" }),
					" matches ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config.endpoint" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "HTTP 401 from proxy: … (run " }),
					"hermes auth status nous",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " to re-auth)" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Upstream credentials expired" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth add nous" }), " and complete OAuth"] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "HTTP 404 (proxy version may not forward /models)" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Hermes binary has changed the proxy route set" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Recheck ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes --version" }),
					"; file an issue if ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "0.14.x" }),
					" no longer forwards ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "/models" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check timed out after 5000 ms" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Proxy started but is hanging" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Inspect proxy logs; restart" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "missing endpoint in runtime_config" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Manifest is malformed" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["Re-run ", (0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter add hermes-proxy --force" })] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "configure-the-manifest",
			children: "Configure the manifest"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The default manifest at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/hermes-proxy.yaml" }),
			" is correct for a vanilla local install. Edit only if you've moved the proxy:"
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
							children: "hermes-proxy"
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
							children: "Hermes Proxy"
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
							children: "runtime"
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
							children: "hermes-proxy"
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
						children: "subscription-auth"
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
						children: "oai-compat"
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
						children: "http-transport"
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
						children: "sentinel-protocol"
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
							children: "experimental"
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
						children: "config"
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
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "  default_toolsets"
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
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "  default_provider"
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
							children: "\"\""
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
							children: "  default_model"
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
							children: "\"\""
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
							children: "  worktree_mode"
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
							children: "false"
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
							children: "  pass_session_id"
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
							children: "false"
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
						children: "  runtime_config"
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
							children: "    endpoint"
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
							children: "\"http://127.0.0.1:8645/v1\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "     # change if --host/--port differ"
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
							children: "    model"
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
							children: "\"<a model id from `adapter check` output>\""
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
							children: "    provider"
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
							children: "nous"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "                            # informational; drives re-auth hint"
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
							children: "    request_timeout_ms"
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
							children: "120000"
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
						children: "    extra_headers"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ": {}"
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Important — model id." }),
			" ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-4-405b" }),
			" is the manifest default but is NOT in every upstream's catalog. The current Nous Portal upstream proxies via OpenRouter, whose catalog includes ids like ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic/claude-opus-4" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "openai/gpt-5-pro" }),
			", etc. Run ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "curl -sS -H 'authorization: Bearer x' http://127.0.0.1:8645/v1/models | jq '.data[].id'" }),
			" to enumerate, or override per-mission via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides.model" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "smoke-run",
			children: "Smoke run"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Create a tiny mission:" }),
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"m 4,4 a 1,1 0 0 0 -0.7070312,0.2929687 1,1 0 0 0 0,1.4140625 L 8.5859375,11 3.2929688,16.292969 a 1,1 0 0 0 0,1.414062 1,1 0 0 0 1.4140624,0 l 5.9999998,-6 a 1.0001,1.0001 0 0 0 0,-1.414062 L 4.7070312,4.2929687 A 1,1 0 0 0 4,4 Z m 8,14 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 8 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "uh"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " mission"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " create"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " hp-smoke"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " \\"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "  --title"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " \"hermes-proxy smoke\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " \\"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "  --workflow"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " research-docs"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " \\"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "  --objective"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: " \"Confirm hermes-proxy is wired.\""
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Optionally override the model per mission (recommended on a fresh install):" }),
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
						children: "# .harness/missions/hp-smoke/mission.yaml — append:"
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
							children: "\"anthropic/claude-opus-4\""
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Dry-run first to inspect the rendered request:" }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ uh mission dry-run .harness/missions/hp-smoke/mission.yaml --runtime hermes-proxy --no-sandbox" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Command: POST http://127.0.0.1:8645/v1/chat/completions {" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"model\": \"anthropic/claude-opus-4\"," })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"messages\": [{\"role\": \"user\", \"content\": \"# Mission: hermes-proxy smoke\\n…\"}]," })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"stream\": true" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "}" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Run for real:" }),
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
				children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ uh mission run .harness/missions/hp-smoke/mission.yaml --runtime hermes-proxy --no-sandbox" })
			}) })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Expected:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/hp-smoke/runtime-result.yaml" }),
				" → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: passed" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/hp-smoke/runtime-final.txt" }), " → one-paragraph summary (extracted from the model's UH-28 sentinel block, when emitted)."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/hp-smoke/runtime.stdout.log" }), " → full assistant message."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "failure-modes-during-a-real-run",
			children: "Failure modes (during a real run)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Symptom" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Where it shows up" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Action" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "[BLOCKED]" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint unreachable" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.yaml errors[]" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Proxy died; restart ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy start" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "[BLOCKED]" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "upstream auth failed" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "runtime-result errors" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Re-auth via ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth add " }),
					"provider``. The full upstream message is in ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.stderr.log" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "[BLOCKED]" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "model \"" }),
					"id",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "\" not available" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "runtime-result errors" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Pick a model id that ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check" }),
					" enumerated. Override per-mission via ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides.model" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "[FAIL]" }), " + HTTP 4xx other than 401/403/404"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "runtime-result errors" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Verbatim upstream envelope. Often quota / rate-limit; check the upstream provider's status page." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "[FAIL]" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "request timed out after " }),
					"ms",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " ms" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "runtime-result errors" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Raise ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "request_timeout_ms" }),
					" (manifest or per-mission). 405B routing latencies can exceed 90s."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "[FAIL]" }),
					" + ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "empty assistant message" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "runtime-result errors" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Upstream returned 200 but no content. Usually a moderation block on the model side." })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "cleanup",
			children: "Cleanup"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Stop the proxy with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Ctrl+C" }),
			" in its terminal. Hermes flushes its own state; UH artifacts stay where they are."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "To completely re-baseline:" }),
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"m 4,4 a 1,1 0 0 0 -0.7070312,0.2929687 1,1 0 0 0 0,1.4140625 L 8.5859375,11 3.2929688,16.292969 a 1,1 0 0 0 0,1.414062 1,1 0 0 0 1.4140624,0 l 5.9999998,-6 a 1.0001,1.0001 0 0 0 0,-1.414062 L 4.7070312,4.2929687 A 1,1 0 0 0 4,4 Z m 8,14 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 8 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "hermes"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " auth"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " logout"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " `"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "provider"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "`"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "      # only if you want to invalidate cached tokens"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "rm"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " -rf"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " .harness/missions/hp-smoke"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "   # only if you want to discard the smoke"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h2, {
			id: "comparison-with-anthropic-via-omp",
			children: ["Comparison with ", (0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic-via-omp" })]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"If you previously used the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic-via-omp" }),
			" path (see ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./anthropic-via-omp.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic-via-omp.md" })
			}),
			"), ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			" is the ToS-positioned replacement. Both routes can coexist in the same UH project — ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }),
			" is unaffected. Prefer ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			" for new deployments; the OMP stealth surface remains documented but carries the Feb-2026 Anthropic ToS friction."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "references",
			children: "References"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-32",
				children: "UH-32 epic"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "../architecture/adapter-hermes-proxy.md",
				children: "Architecture doc"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "../architecture/hermes-proxy-spike.md",
				children: "Wire-format spike"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16",
				children: "Hermes Agent 0.14.0 release notes"
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
export { toc as a, structuredData as i, frontmatter as n, hermes_proxy_setup_exports as r, MDXContent as t };
