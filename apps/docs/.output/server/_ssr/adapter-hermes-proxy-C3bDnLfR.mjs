import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/adapter-hermes-proxy-C3bDnLfR.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var adapter_hermes_proxy_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Hermes Proxy Runtime Adapter",
	"description": "The `hermes-proxy` adapter maps Ultimate Harness missions onto a local **`hermes proxy`** instance (shipped in [Hermes Agent ≥ 0.14.0](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16)). The proxy is an OpenAI-compatible"
};
var structuredData = {
	"contents": [
		{
			"heading": "purpose",
			"content": "The `hermes-proxy&#x60; adapter maps Ultimate Harness missions onto a local &#x2A;*`hermes proxy`** instance (shipped in Hermes Agent ≥ 0.14.0). The proxy is an OpenAI-compatible local HTTP server that attaches a user's own OAuth-authenticated subscription credentials to outbound requests — UH speaks plain OAI-compat over HTTP and Hermes handles the upstream auth."
		},
		{
			"heading": "purpose",
			"content": "It exists alongside the spawn-based adapters (`hermes`, `codex`, `oh-my-pi`) and shares the same runtime adapter contract: mission packets in, structured runtime sessions and artifacts out, no implicit promotion."
		},
		{
			"heading": "purpose",
			"content": "The wire-format discovery work is captured in `hermes-proxy-spike.md` (UH-36). This doc focuses on the adapter's design."
		},
		{
			"heading": "tos-positioning",
			"content": "Two paths exist today for routing UH missions through a subscription (Claude / ChatGPT / SuperGrok / Nous Portal):"
		},
		{
			"heading": "tos-positioning",
			"content": "Path"
		},
		{
			"heading": "tos-positioning",
			"content": "Mechanism"
		},
		{
			"heading": "tos-positioning",
			"content": "ToS posture"
		},
		{
			"heading": "tos-positioning",
			"content": "**`hermes-proxy`** (this adapter)"
		},
		{
			"heading": "tos-positioning",
			"content": "Hermes-shipped local OAI-compat proxy. UA / headers / auth attach are owned by Hermes."
		},
		{
			"heading": "tos-positioning",
			"content": "**Sanctioned.** Hermes ships this as an officially supported integration point."
		},
		{
			"heading": "tos-positioning",
			"content": "`anthropic-via-omp` (see `docs/runbooks/anthropic-via-omp.md`)"
		},
		{
			"heading": "tos-positioning",
			"content": "OMP routes via stealth surface (UA spoofing, OAuth token injection)."
		},
		{
			"heading": "tos-positioning",
			"content": "**Risky.** Subscription ToS prohibits third-party token injection (Anthropic Feb 2026 update)."
		},
		{
			"heading": "tos-positioning",
			"content": "UH supports both; the runbooks document the trade-offs. For new deployments, prefer `hermes-proxy` whenever the upstream is available."
		},
		{
			"heading": "transport",
			"content": "HTTP. Not a subprocess."
		},
		{
			"heading": "transport",
			"content": "The proxy listens on `127.0.0.1:8645/v1` by default. It forwards `/chat/completions`, `/completions`, `/embeddings`, `/models` only — anything else returns `path_not_allowed`. Bearer auth is required on every request, but the proxy ignores the bearer value and attaches its own credentials."
		},
		{
			"heading": "transport",
			"content": "In `0.14.0` the upstream provider is `nous` (Nous Portal). Nous Portal itself fans out across multiple model backends (OpenRouter, Anthropic, etc.) — UH treats the upstream as opaque."
		},
		{
			"heading": "schema",
			"content": "`HermesProxyRuntimeConfigSchema` (strict, registered via `registerRuntimeConfigSchema`):"
		},
		{
			"heading": "schema",
			"content": "Strictness means typos like `endpoiint` or `modle` fail at adapter-load or mission-override time instead of being silently dropped. Mission `runtime_config_overrides` are merged on top, then re-validated through the same schema (UH-27 / UH-33 parity)."
		},
		{
			"heading": "status-classification",
			"content": "Condition"
		},
		{
			"heading": "status-classification",
			"content": "Status"
		},
		{
			"heading": "status-classification",
			"content": "Error hint"
		},
		{
			"heading": "status-classification",
			"content": "`networkError` matches `ECONNREFUSED`"
		},
		{
			"heading": "status-classification",
			"content": "blocked"
		},
		{
			"heading": "status-classification",
			"content": "`endpoint unreachable: `endpoint`(is`hermes proxy start` running?)`"
		},
		{
			"heading": "status-classification",
			"content": "`networkError` matches `ETIMEDOUT` / `ENETUNREACH`"
		},
		{
			"heading": "status-classification",
			"content": "blocked"
		},
		{
			"heading": "status-classification",
			"content": "verbatim network error"
		},
		{
			"heading": "status-classification",
			"content": "Other `networkError`"
		},
		{
			"heading": "status-classification",
			"content": "failed"
		},
		{
			"heading": "status-classification",
			"content": "verbatim"
		},
		{
			"heading": "status-classification",
			"content": "`runner.timedOut`"
		},
		{
			"heading": "status-classification",
			"content": "failed"
		},
		{
			"heading": "status-classification",
			"content": "`request timed out after `ms` ms`"
		},
		{
			"heading": "status-classification",
			"content": "`errorEnvelope.type === upstream_auth_failed` (or message matches `auth(entication)?` / `invalid_api_key`)"
		},
		{
			"heading": "status-classification",
			"content": "blocked"
		},
		{
			"heading": "status-classification",
			"content": "`upstream auth failed: `message`(run`hermes auth status `provider`` to re-auth)`"
		},
		{
			"heading": "status-classification",
			"content": "HTTP 401 / 403"
		},
		{
			"heading": "status-classification",
			"content": "blocked"
		},
		{
			"heading": "status-classification",
			"content": "re-auth hint with provider name"
		},
		{
			"heading": "status-classification",
			"content": "HTTP 404 with envelope mentioning `model`"
		},
		{
			"heading": "status-classification",
			"content": "blocked"
		},
		{
			"heading": "status-classification",
			"content": "`model \"`id`\" not available on this proxy`"
		},
		{
			"heading": "status-classification",
			"content": "Other HTTP 4xx / 5xx"
		},
		{
			"heading": "status-classification",
			"content": "failed"
		},
		{
			"heading": "status-classification",
			"content": "verbatim envelope"
		},
		{
			"heading": "status-classification",
			"content": "`runner.exitCode !== 0`"
		},
		{
			"heading": "status-classification",
			"content": "failed"
		},
		{
			"heading": "status-classification",
			"content": "empty-message hint if applicable"
		},
		{
			"heading": "status-classification",
			"content": "HTTP 200 + empty content"
		},
		{
			"heading": "status-classification",
			"content": "failed"
		},
		{
			"heading": "status-classification",
			"content": "`empty assistant message`"
		},
		{
			"heading": "status-classification",
			"content": "HTTP 200 + content (with UH-28 sentinel)"
		},
		{
			"heading": "status-classification",
			"content": "passed"
		},
		{
			"heading": "status-classification",
			"content": "`runtime-final.txt` ← sentinel content"
		},
		{
			"heading": "status-classification",
			"content": "HTTP 200 + content (no sentinel)"
		},
		{
			"heading": "status-classification",
			"content": "passed"
		},
		{
			"heading": "status-classification",
			"content": "`runtime-final.txt` ← `\"\"` (matches oh-my-pi)"
		},
		{
			"heading": "status-classification",
			"content": "`surfaceBlocked: true` is set in `RUNTIME_WIRINGS[\"hermes-proxy\"]`, so the CLI exits non-zero on `blocked` results — verification gates upstream see the failure cleanly."
		},
		{
			"heading": "adapter-check",
			"content": "`uh adapter check hermes-proxy` performs a live `GET `endpoint`/models` probe (5-second `AbortController` timeout). Maps to `AdapterCheckResult`:"
		},
		{
			"heading": "adapter-check",
			"content": "Response"
		},
		{
			"heading": "adapter-check",
			"content": "`found`"
		},
		{
			"heading": "adapter-check",
			"content": "`version` / `errors`"
		},
		{
			"heading": "adapter-check",
			"content": "200 + JSON `{ data: [...] }`"
		},
		{
			"heading": "adapter-check",
			"content": "true"
		},
		{
			"heading": "adapter-check",
			"content": "`proxy reachable at `endpoint` (`N` models available)`"
		},
		{
			"heading": "adapter-check",
			"content": "401 / 403"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "re-auth hint with provider name"
		},
		{
			"heading": "adapter-check",
			"content": "404"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "`proxy version may not forward /models`"
		},
		{
			"heading": "adapter-check",
			"content": "ECONNREFUSED / fetch failed"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "`endpoint unreachable: `endpoint`(is`hermes proxy start` running?)`"
		},
		{
			"heading": "adapter-check",
			"content": "Timeout (5s)"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "`adapter check timed out after 5000 ms`"
		},
		{
			"heading": "adapter-check",
			"content": "Other HTTP errors"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "verbatim envelope"
		},
		{
			"heading": "adapter-check",
			"content": "Missing `endpoint` in `runtime_config`"
		},
		{
			"heading": "adapter-check",
			"content": "false"
		},
		{
			"heading": "adapter-check",
			"content": "`missing endpoint in runtime_config`"
		},
		{
			"heading": "adapter-check",
			"content": "The 5-second budget is constant (`HERMES_PROXY_CHECK_TIMEOUT_MS`) — separate from the per-mission `request_timeout_ms` to keep `adapter check` snappy."
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Adapter"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Transport"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Auth surface"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Upstream control"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "`hermes`"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Spawn (`hermes chat -q`)"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Hermes-owned (per its config)"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Whatever the user's `hermes` config routes to"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "`codex`"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Spawn (`codex exec`)"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "ChatGPT subscription via codex-cli"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "ChatGPT only"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "`oh-my-pi`"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Spawn (`omp --print --mode json`)"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "OMP's own credential store"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "Multi-provider, including the stealth `anthropic-via-omp` path"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "**`hermes-proxy`**"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "**HTTP (fetch)**"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "**Hermes proxy attaches credentials downstream**"
		},
		{
			"heading": "comparison-vs-other-adapters",
			"content": "**Any provider hermes proxy supports — currently `nous`**"
		},
		{
			"heading": "risks--limits-v1",
			"content": "**No tool-use channel.** The model returns its full deliverable in the assistant message content; the harness does not apply structured file mutations. Future slice can wire OAI-compat tool calls into the runner's `events` and into the diff-application pipeline."
		},
		{
			"heading": "risks--limits-v1",
			"content": "**No proxy lifecycle management.** UH does not start, stop, or supervise the proxy. The operator runs `hermes proxy start` in a separate process (see runbook)."
		},
		{
			"heading": "risks--limits-v1",
			"content": "**Auth state is opaque to UH.** When the proxy returns `upstream_auth_failed`, UH surfaces a re-auth hint pointing at `hermes auth status `provider\\`\\`. The actual re-auth flow is provider-specific and lives outside UH."
		},
		{
			"heading": "risks--limits-v1",
			"content": "**Model catalog depends on the upstream.** As of Hermes 0.14.0, `hermes proxy start --provider nous` routes via Nous Portal, which itself proxies through OpenRouter. The available model ids are whatever OpenRouter exposes — not the Hermes-native model names. Run `uh adapter check hermes-proxy` to enumerate."
		},
		{
			"heading": "risks--limits-v1",
			"content": "**Request body is minimal.** Today only `{ model, messages, stream: true }` is sent. Sampling controls (`temperature`, `max_tokens`) are not in the UH-35 schema; adding them is a future schema bump."
		},
		{
			"heading": "references",
			"content": "UH-32 epic"
		},
		{
			"heading": "references",
			"content": "UH-36 spike (wire format)"
		},
		{
			"heading": "references",
			"content": "Operator runbook"
		},
		{
			"heading": "references",
			"content": "Runtime adapter contract"
		},
		{
			"heading": "references",
			"content": "Sentinel protocol (UH-28)"
		},
		{
			"heading": "references",
			"content": "Diff capture helper (UH-34)"
		},
		{
			"heading": "promotion-record",
			"content": "Adapter promoted from `experimental` → `active` on **2026-05-18** (UH-38). Smoke evidence + receipts: `docs/runbooks/hermes-proxy-e2e-smoke.md`."
		}
	],
	"headings": [
		{
			"id": "purpose",
			"content": "Purpose"
		},
		{
			"id": "tos-positioning",
			"content": "ToS positioning"
		},
		{
			"id": "transport",
			"content": "Transport"
		},
		{
			"id": "schema",
			"content": "Schema"
		},
		{
			"id": "lifecycle",
			"content": "Lifecycle"
		},
		{
			"id": "status-classification",
			"content": "Status classification"
		},
		{
			"id": "adapter-check",
			"content": "Adapter check"
		},
		{
			"id": "comparison-vs-other-adapters",
			"content": "Comparison vs other adapters"
		},
		{
			"id": "capabilities-manifest",
			"content": "Capabilities (manifest)"
		},
		{
			"id": "risks--limits-v1",
			"content": "Risks / limits (v1)"
		},
		{
			"id": "references",
			"content": "References"
		},
		{
			"id": "promotion-record",
			"content": "Promotion record"
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
		url: "#tos-positioning",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "ToS positioning" })
	},
	{
		depth: 2,
		url: "#transport",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Transport" })
	},
	{
		depth: 2,
		url: "#schema",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Schema" })
	},
	{
		depth: 2,
		url: "#lifecycle",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Lifecycle" })
	},
	{
		depth: 2,
		url: "#status-classification",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Status classification" })
	},
	{
		depth: 2,
		url: "#adapter-check",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Adapter check" })
	},
	{
		depth: 2,
		url: "#comparison-vs-other-adapters",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Comparison vs other adapters" })
	},
	{
		depth: 2,
		url: "#capabilities-manifest",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Capabilities (manifest)" })
	},
	{
		depth: 2,
		url: "#risks--limits-v1",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Risks / limits (v1)" })
	},
	{
		depth: 2,
		url: "#references",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "References" })
	},
	{
		depth: 2,
		url: "#promotion-record",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Promotion record" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		h2: "h2",
		li: "li",
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
			id: "purpose",
			children: "Purpose"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			" adapter maps Ultimate Harness missions onto a local ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy" }) }),
			" instance (shipped in ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16",
				children: "Hermes Agent ≥ 0.14.0"
			}),
			"). The proxy is an OpenAI-compatible local HTTP server that attaches a user's own OAuth-authenticated subscription credentials to outbound requests — UH speaks plain OAI-compat over HTTP and Hermes handles the upstream auth."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"It exists alongside the spawn-based adapters (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }),
			") and shares the same ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runtime-adapter-contract.md",
				children: "runtime adapter contract"
			}),
			": mission packets in, structured runtime sessions and artifacts out, no implicit promotion."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The wire-format discovery work is captured in ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./hermes-proxy-spike.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy-spike.md" })
			}),
			" (UH-36). This doc focuses on the adapter's design."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "tos-positioning",
			children: "ToS positioning"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Two paths exist today for routing UH missions through a subscription (Claude / ChatGPT / SuperGrok / Nous Portal):" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Path" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Mechanism" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "ToS posture" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }) }), " (this adapter)"] }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "Hermes-shipped local OAI-compat proxy. UA / headers / auth attach are owned by Hermes." }),
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Sanctioned." }), " Hermes ships this as an officially supported integration point."] })
		] }), (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic-via-omp" }),
				" (see ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/runbooks/anthropic-via-omp.md" }),
				")"
			] }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "OMP routes via stealth surface (UA spoofing, OAuth token injection)." }),
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Risky." }), " Subscription ToS prohibits third-party token injection (Anthropic Feb 2026 update)."] })
		] })] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"UH supports both; the runbooks document the trade-offs. For new deployments, prefer ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }),
			" whenever the upstream is available."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "transport",
			children: "Transport"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "HTTP. Not a subprocess." }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      ┌──────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   UH adapter                         │ hermes proxy             │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   ─────────                          │ (local process, port     │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      │  8645 by default)        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   fetch(`endpoint`/chat/completions) │                          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   ─────────────────────────────────▶ │  attaches user's real    │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      │  OAuth credentials       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   SSE stream (or JSON)               │                          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   ◀───────────────────────────────── │  forwards upstream       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      │  (Nous Portal /          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      │   OpenRouter / etc.)     │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                      └──────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The proxy listens on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "127.0.0.1:8645/v1" }),
			" by default. It forwards ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/chat/completions" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/completions" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/embeddings" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/models" }),
			" only — anything else returns ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "path_not_allowed" }),
			". Bearer auth is required on every request, but the proxy ignores the bearer value and attaches its own credentials."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"In ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "0.14.0" }),
			" the upstream provider is ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "nous" }),
			" (Nous Portal). Nous Portal itself fans out across multiple model backends (OpenRouter, Anthropic, etc.) — UH treats the upstream as opaque."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "schema",
			children: "Schema"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "HermesProxyRuntimeConfigSchema" }),
			" (strict, registered via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "registerRuntimeConfigSchema" }),
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "{"
					})
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
							children: "  endpoint"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "string"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "url"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(),                          "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "// required, includes /v1 prefix"
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
							children: "  model"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "string"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "min"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "("
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "1"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "),                            "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "// required, passed verbatim"
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
							children: "  provider"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "enum"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(["
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"nous\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"claude\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"chatgpt\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ","
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"supergrok\""
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "])."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "optional"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(),"
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
							children: "  request_timeout_ms"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "number"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "int"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "positive"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "default"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "("
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "120_000"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "),"
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
							children: "  extra_headers"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "record"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "string"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "(), z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "string"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "())."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "default"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "({}),"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "}"
					})
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Strictness means typos like ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoiint" }),
			" or ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "modle" }),
			" fail at adapter-load or mission-override time instead of being silently dropped. Mission ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config_overrides" }),
			" are merged on top, then re-validated through the same schema (UH-27 / UH-33 parity)."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "lifecycle",
			children: "Lifecycle"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                ┌──────────────────────────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                │ uh mission run --runtime hermes-proxy …  │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                └──────────────────┬───────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              ┌────────────────────▼────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ planHermesProxyRun                      │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  load adapter + mission                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  merge runtime_config_overrides         │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  strict-reparse                         │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  build OAI request body                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  append UH-28 sentinel to prompt        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              └────────────────────┬────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              ┌────────────────────▼────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ runtime.started event +                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ runtime-session.yaml (status: running)  │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              └────────────────────┬────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              ┌────────────────────▼────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ defaultHermesProxyRunner                │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  fetch(endpoint/chat/completions)       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  AbortController honors timeout         │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  sniff Content-Type:                    │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │    text/event-stream → SSE decode       │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │    application/json → JSON parse        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  accumulate assistant content           │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  capture httpStatus / errorEnvelope /   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │   networkError / events                 │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              └────────────────────┬────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              ┌────────────────────▼────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ captureDiffWithUntracked (UH-34)        │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  → diff.patch (tracked + untracked)     │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              └────────────────────┬────────────────────┘" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "                                   │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              ┌────────────────────▼────────────────────┐" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │ collectHermesProxySession               │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  classify status (see table below)      │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  extract UH-28 sentinel → runtime-final │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  write runtime-result.yaml              │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              │  append runtime.finished event          │" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "              └─────────────────────────────────────────┘" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "status-classification",
			children: "Status classification"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Condition" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Status" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Error hint" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "networkError" }),
					" matches ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "ECONNREFUSED" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "blocked" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint unreachable: " }),
					"endpoint",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "(is" }),
					"hermes proxy start",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " running?)" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "networkError" }),
					" matches ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "ETIMEDOUT" }),
					" / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "ENETUNREACH" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "blocked" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "verbatim network error" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["Other ", (0, import_jsx_runtime.jsx)(_components.code, { children: "networkError" })] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "failed" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "verbatim" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runner.timedOut" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "failed" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "request timed out after " }),
					"ms",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " ms" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "errorEnvelope.type === upstream_auth_failed" }),
					" (or message matches ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "auth(entication)?" }),
					" / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "invalid_api_key" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "blocked" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "upstream auth failed: " }),
					"message",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "(run" }),
					"hermes auth status ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "provider`` to re-auth)" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "HTTP 401 / 403" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "blocked" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "re-auth hint with provider name" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["HTTP 404 with envelope mentioning ", (0, import_jsx_runtime.jsx)(_components.code, { children: "model" })] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "blocked" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "model \"" }),
					"id",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "\" not available on this proxy" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Other HTTP 4xx / 5xx" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "failed" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "verbatim envelope" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runner.exitCode !== 0" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "failed" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "empty-message hint if applicable" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "HTTP 200 + empty content" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "failed" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "empty assistant message" }) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "HTTP 200 + content (with UH-28 sentinel)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "passed" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }), " ← sentinel content"] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "HTTP 200 + content (no sentinel)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "passed" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }),
					" ← ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "\"\"" }),
					" (matches oh-my-pi)"
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "surfaceBlocked: true" }),
			" is set in ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "RUNTIME_WIRINGS[\"hermes-proxy\"]" }),
			", so the CLI exits non-zero on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "blocked" }),
			" results — verification gates upstream see the failure cleanly."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "adapter-check",
			children: "Adapter check"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter check hermes-proxy" }),
			" performs a live ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "GET " }),
			"endpoint",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/models" }),
			" probe (5-second ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "AbortController" }),
			" timeout). Maps to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "AdapterCheckResult" }),
			":"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Response" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "found" }) }),
			(0, import_jsx_runtime.jsxs)(_components.th, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "version" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "errors" })
			] })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["200 + JSON ", (0, import_jsx_runtime.jsx)(_components.code, { children: "{ data: [...] }" })] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "proxy reachable at " }),
					"endpoint",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " (" }),
					"N",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " models available)" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "401 / 403" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "re-auth hint with provider name" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "404" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "proxy version may not forward /models" }) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "ECONNREFUSED / fetch failed" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint unreachable: " }),
					"endpoint",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "(is" }),
					"hermes proxy start",
					(0, import_jsx_runtime.jsx)(_components.code, { children: " running?)" })
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Timeout (5s)" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check timed out after 5000 ms" }) })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Other HTTP errors" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "verbatim envelope" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Missing ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint" }),
					" in ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "missing endpoint in runtime_config" }) })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The 5-second budget is constant (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "HERMES_PROXY_CHECK_TIMEOUT_MS" }),
			") — separate from the per-mission ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "request_timeout_ms" }),
			" to keep ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check" }),
			" snappy."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "comparison-vs-other-adapters",
			children: "Comparison vs other adapters"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Adapter" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Transport" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Auth surface" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Upstream control" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Spawn (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes chat -q" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Hermes-owned (per its config)" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Whatever the user's ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
					" config routes to"
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Spawn (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "ChatGPT subscription via codex-cli" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "ChatGPT only" })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Spawn (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "omp --print --mode json" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "OMP's own credential store" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Multi-provider, including the stealth ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "anthropic-via-omp" }),
					" path"
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "hermes-proxy" }) }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: "HTTP (fetch)" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: "Hermes proxy attaches credentials downstream" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsxs)(_components.strong, { children: ["Any provider hermes proxy supports — currently ", (0, import_jsx_runtime.jsx)(_components.code, { children: "nous" })] }) })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "capabilities-manifest",
			children: "Capabilities (manifest)"
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
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "  - "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "subscription-auth"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "      # routes via user's own subscription"
						})
					]
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
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "oai-compat"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "             # request/response shape is OpenAI Chat Completions"
						})
					]
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
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "http-transport"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "         # not a subprocess"
						})
					]
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
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "sentinel-protocol"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "      # UH-28 sentinel respected"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "risks--limits-v1",
			children: "Risks / limits (v1)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "No tool-use channel." }),
				" The model returns its full deliverable in the assistant message content; the harness does not apply structured file mutations. Future slice can wire OAI-compat tool calls into the runner's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "events" }),
				" and into the diff-application pipeline."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "No proxy lifecycle management." }),
				" UH does not start, stop, or supervise the proxy. The operator runs ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy start" }),
				" in a separate process (see ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "../runbooks/hermes-proxy-setup.md",
					children: "runbook"
				}),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Auth state is opaque to UH." }),
				" When the proxy returns ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "upstream_auth_failed" }),
				", UH surfaces a re-auth hint pointing at ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth status " }),
				"provider``. The actual re-auth flow is provider-specific and lives outside UH."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Model catalog depends on the upstream." }),
				" As of Hermes 0.14.0, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy start --provider nous" }),
				" routes via Nous Portal, which itself proxies through OpenRouter. The available model ids are whatever OpenRouter exposes — not the Hermes-native model names. Run ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter check hermes-proxy" }),
				" to enumerate."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Request body is minimal." }),
				" Today only ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "{ model, messages, stream: true }" }),
				" is sent. Sampling controls (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "temperature" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "max_tokens" }),
				") are not in the UH-35 schema; adding them is a future schema bump."
			] }),
			"\n"
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
				href: "./hermes-proxy-spike.md",
				children: "UH-36 spike (wire format)"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "../runbooks/hermes-proxy-setup.md",
				children: "Operator runbook"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runtime-adapter-contract.md",
				children: "Runtime adapter contract"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "../../src/harness/runtime-final-message.ts",
				children: "Sentinel protocol (UH-28)"
			}) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.a, {
				href: "../../src/harness/diff-capture.ts",
				children: "Diff capture helper (UH-34)"
			}) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "promotion-record",
			children: "Promotion record"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Adapter promoted from ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "experimental" }),
			" → ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "active" }),
			" on ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "2026-05-18" }),
			" (",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-38",
				children: "UH-38"
			}),
			"). Smoke evidence + receipts: ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../runbooks/hermes-proxy-e2e-smoke.md",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/runbooks/hermes-proxy-e2e-smoke.md" })
			}),
			"."
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
export { toc as a, structuredData as i, adapter_hermes_proxy_exports as n, frontmatter as r, MDXContent as t };
