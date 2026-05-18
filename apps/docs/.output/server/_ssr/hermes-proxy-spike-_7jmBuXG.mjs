import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hermes-proxy-spike-_7jmBuXG.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var hermes_proxy_spike_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "hermes-proxy wire-format spike (UH-36)",
	"description": "Closes the discovery phase of [UH-32](https://linear.app/agentic-eng/issue/UH-32). Findings feed:"
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Closes the discovery phase of UH-32. Findings feed:"
		},
		{
			"heading": void 0,
			"content": "UH-35 — schema + manifest fields for `runtime_config`."
		},
		{
			"heading": void 0,
			"content": "UH-39 — adapter implementation: planner / runner / parser / sentinel / blocked classification."
		},
		{
			"heading": void 0,
			"content": "UH-37 — CLI dispatch + sandbox routing parity."
		},
		{
			"heading": void 0,
			"content": "UH-40 — operator runbook."
		},
		{
			"heading": void 0,
			"content": "UH-38 — E2E smoke + promotion criteria."
		},
		{
			"heading": void 0,
			"content": "> **Scope:** read-only research. No production code changed in this slice."
		},
		{
			"heading": "1-environment",
			"content": "Hermes Agent &#x2A;*`v0.14.0 (2026.5.16)`** — installed at `/Users/eduardojaviergarcialopez/.hermes/hermes-agent`, Python 3.11.14, OpenAI SDK 2.24.0. Confirmed minimum version per UH-31 (`MINIMUM_HERMES_VERSION = 0.14.0`)."
		},
		{
			"heading": "1-environment",
			"content": "Proxy launched on the workstation with:"
		},
		{
			"heading": "1-environment",
			"content": "Listening on &#x2A;*`http://127.0.0.1:8645/v1`**. Forwards per-request to the upstream provider, attaching credentials owned by the local `hermes auth` store."
		},
		{
			"heading": "2-cli-surface-v0140",
			"content": "**Providers available in `0.14.0`:** *only* `nous` (Nous Portal). The handoff narrative and UH-32 epic description mention Claude Pro / ChatGPT Pro / SuperGrok backends — these are **not yet shipped as first-class `hermes proxy` providers**. They are reachable today only because Nous Portal itself fans out to multiple upstream model backends server-side; the UH adapter does **not** need to know about the upstream provider beyond what model id to request."
		},
		{
			"heading": "2-cli-surface-v0140",
			"content": "**Implication for the adapter:** treat the upstream as opaque OAI-compat. `runtime_config` exposes the `endpoint`, `model`, and an `auth_token` (any non-empty string; the proxy ignores the value and attaches its own credentials). When/if Hermes ships a `claude` provider, no schema change is needed — operators just point at a proxy started with `--provider claude`."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Confirmed by probing each route directly:"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Route"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Status"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Notes"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "`POST /v1/chat/completions`"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "forwarded"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "OpenAI Chat Completions wire shape. Supports `stream: true` (SSE)."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "`POST /v1/completions`"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "forwarded"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Legacy text-completion shape; not used by UH."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "`POST /v1/embeddings`"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "forwarded"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Out of scope for UH today."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "`GET  /v1/models`"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "forwarded"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Requires valid upstream auth before model listing succeeds."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "anything else (e.g. `/v1/health`, `/`)"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "**404**"
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "Returns `{\"error\":{\"type\":\"path_not_allowed\",\"code\":\"path_not_allowed\", …}}`."
		},
		{
			"heading": "3-routes-forwarded-by-the-proxy",
			"content": "**Server header** observed: `Server: Python/3.11 aiohttp/3.13.4`. No CORS headers, no rate-limit headers in any observed response."
		},
		{
			"heading": "4-auth-handoff",
			"content": "The proxy **requires** the `Authorization: Bearer `value\\`\\` header on every call. Missing or malformed → `401`."
		},
		{
			"heading": "4-auth-handoff",
			"content": "The proxy **ignores the bearer value** — it attaches *its own* credentials (resolved from `hermes auth`) to the upstream request. UH can send any non-empty bearer; the canonical placeholder used in the spike was `Bearer probe`."
		},
		{
			"heading": "4-auth-handoff",
			"content": "When upstream credentials are stale / missing / refresh-token-revoked:"
		},
		{
			"heading": "4-auth-handoff",
			"content": "Operator remediation lives entirely outside UH — `hermes auth status `provider\\`\\` and the provider-specific re-auth flow (`hermes auth add nous`, vendor OAuth dance). The UH adapter MUST surface this as `runtime-result.status: blocked` with a clear pointer to `hermes auth status`."
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "Every error observed in the spike — across `401` and `404` — returns the same shape:"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "`type`"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "HTTP"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "Adapter classification (UH-39)"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "`upstream_auth_failed`"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "401"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "**blocked** — operator re-auth required."
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "`path_not_allowed`"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "404"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "**failed** — configuration error; surfaces config bug."
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "(future) quota / rate"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "429"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "**blocked** — re-run later, no diff produced."
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "(future) server\\_error"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "5xx"
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "**failed** — non-deterministic; capture body verbatim."
		},
		{
			"heading": "5-error-envelope-canonical",
			"content": "Streaming requests with `stream: true` that fail at the proxy layer still return a **single JSON body** with the error envelope (not an SSE error event). The adapter therefore MUST tolerate both wire shapes — JSON or SSE — depending on whether the proxy reached the upstream."
		},
		{
			"heading": "6-successful-path-expectations-not-live-verified",
			"content": "A successful path could not be live-verified in this spike because the local `nous` provider credentials are stale:"
		},
		{
			"heading": "6-successful-path-expectations-not-live-verified",
			"content": "The OAI-compat shape is contractual, so the adapter is designed against the standard wire (matching OpenAI Chat Completions API verbatim):"
		},
		{
			"heading": "6-successful-path-expectations-not-live-verified",
			"content": "Non-streaming success → `200`, body shape:"
		},
		{
			"heading": "6-successful-path-expectations-not-live-verified",
			"content": "Streaming success → `text/event-stream`, `data: { … delta … }\\n\\n` chunks terminated by `data: [DONE]\\n\\n`."
		},
		{
			"heading": "6-successful-path-expectations-not-live-verified",
			"content": "UH-38 (E2E smoke) is gated on the operator re-authenticating Hermes against the upstream provider. Once green, the smoke run will be captured in `docs/runbooks/hermes-proxy-smoke.md`."
		},
		{
			"heading": "7-recommendations-for-uh-35-hermesproxyruntimeconfigschema",
			"content": "All keys above are validated through the existing `registerRuntimeConfigSchema(\"hermes-proxy\", …)` plumbing established in UH-26."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "Hermes-proxy is fundamentally different from `hermes` / `codex` / `oh-my-pi`: **no subprocess, no stdout stream from a CLI**. It is an HTTP client. Concrete deltas vs the existing spawn-based adapters:"
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**No `command` / `args`.** The dry-run record's `command` field should be set to `\"POST `endpoint`/chat/completions\"` for human readability and the `args` array should contain the JSON request body (pretty-printed) for parity with `dryRunHermes`."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**stdout = the model's assistant message content** (or, for streaming, the concatenated `delta.content` chunks). Stderr remains a real string but typically empty; non-200 bodies are appended to stderr for forensics."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**Final-message sentinel (UH-28).** The mission prompt MUST include `runtimeFinalMessageInstruction()`. The assistant's final message is scanned with `extractRuntimeFinalMessageSentinel(content)`. `runtime-final.txt` is written exactly as in hermes/codex/oh-my-pi."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**Diff capture (UH-34).** Delegate to `captureDiffWithUntracked(cwd)`. Note: the model itself does **not** mutate the working tree in v1 — it returns proposed changes in its message body and the harness applies them in a future slice. For UH-32's v1, the adapter produces an empty diff in the common case (the assistant's message content becomes the artifact). This matches the UH-27 / UH-33 \"model emits assistant message + harness applies\" pattern already supported elsewhere."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**Sandbox seed (UH-29).** Free — `createSandbox` already copies the bound mission dir."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**Blocked classification (the key spike output):**"
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "`upstream_auth_failed` → `runtime-result.status: blocked`, `errors: [\"hermes-proxy: upstream auth invalid; run `hermes auth status `provider``\"]`."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "HTTP 429 with any code → `blocked` with the upstream `Retry-After` header surfaced if present."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "HTTP 5xx → `failed` (config / upstream outage)."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "Network unreachable (ECONNREFUSED, ETIMEDOUT) → `blocked`, `errors: [\"hermes-proxy: cannot reach `endpoint`; is `hermes proxy start` running?\"]`."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "200 with no `choices[0].message.content` → `failed` (empty assistant message)."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "200 but no `uh-runtime-final-message` block in the content → `passed` with a warning, mirroring oh-my-pi behavior (sentinel is recommended, not required)."
		},
		{
			"heading": "8-recommendations-for-uh-39-adapter-shape",
			"content": "**Dispatch wiring:** add to `RUNTIME_WIRINGS` with `surfaceBlocked: true` (consistent with codex and oh-my-pi — blocked auth must non-zero-exit for CI/verification gates)."
		},
		{
			"heading": "9-adapter-manifest-recommendation-for-uh-35",
			"content": "`cli_command` is **not** populated — there is no spawn target. `adapter check hermes-proxy` should perform a lightweight `GET `endpoint`/models` and surface the same wire-shape error envelope it would surface during a mission run."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`uh adapter check hermes-proxy` should do roughly:"
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "Read the manifest. Validate `runtime_config` via the registered Zod schema (UH-26 path)."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`fetch(``endpoint`/models`, { headers: { authorization: `Bearer `auth_token`` } })`."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "Map response:"
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`200` with a `data: [...]` array → `available: true`, surface model ids."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`401 upstream_auth_failed` → `available: false`, `errors: [\"upstream auth invalid — run `hermes auth status `provider``\"]`."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`404 path_not_allowed` on `/models` → `available: false`, `errors: [\"proxy version mismatch: /models not forwarded\"]` (would only trigger if Hermes changes the route set)."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "`ECONNREFUSED` → `available: false`, `errors: [\"proxy unreachable at `endpoint`; run `hermes proxy start`\"]`."
		},
		{
			"heading": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "Return `AdapterCheckResult` identical in shape to the hermes / codex / oh-my-pi checkers."
		},
		{
			"heading": "11-known-gotchas",
			"content": "**No upstream model list without auth.** `GET /v1/models` requires valid upstream creds. So `adapter check` cannot enumerate models when the user is logged out — the check must report \"configured but locked\" rather than \"broken\"."
		},
		{
			"heading": "11-known-gotchas",
			"content": "**No `--ask-for-approval`-style flag drift surface.** HTTP wire is contractually stable across hermes versions (OAI-compat is the contract). Version skew should be invisible. UH-30 doesn't recur."
		},
		{
			"heading": "11-known-gotchas",
			"content": "**Streaming + error mix.** A request with `stream: true` that fails at the proxy returns one JSON body (not SSE). Parser MUST sniff `content-type` before assuming SSE."
		},
		{
			"heading": "11-known-gotchas",
			"content": "**No file mutation channel in v1.** The model returns its full deliverable in the assistant message content; the harness applies. If we later wire OAI-compat **tool use**, that's a separate epic — not in UH-32 scope."
		},
		{
			"heading": "11-known-gotchas",
			"content": "**Provider expansion is out-of-band.** When Hermes adds a `claude` provider, it ships as a new `--provider claude` startup flag — no UH change required, since UH only talks to `localhost:8645/v1`."
		},
		{
			"heading": "12-acceptance-for-downstream-slices",
			"content": "**UH-35** lands `.harness/adapters/hermes-proxy.yaml`, `src/adapters/hermes-proxy.ts` (schema-only export), and the `uh adapter add hermes-proxy` template. No HTTP behaviour yet."
		},
		{
			"heading": "12-acceptance-for-downstream-slices",
			"content": "**UH-39** lands `planHermesProxyRun`, `runHermesProxy`, `dryRunHermesProxy`, the runtime checker, sentinel extraction, blocked classification, and unit tests with an injectable `fetchImpl` (so tests deterministically simulate 200 / 401 / 404 / 429 / ECONNREFUSED)."
		},
		{
			"heading": "12-acceptance-for-downstream-slices",
			"content": "**UH-37** replaces the dispatch stub with the real functions, adds `surfaceBlocked: true`, and proves sandbox routing parity."
		},
		{
			"heading": "12-acceptance-for-downstream-slices",
			"content": "**UH-40** publishes `docs/architecture/adapter-hermes-proxy.md` + `docs/runbooks/hermes-proxy-setup.md` cross-referencing this spike."
		},
		{
			"heading": "12-acceptance-for-downstream-slices",
			"content": "**UH-38** runs `uh mission run --runtime hermes-proxy` end-to-end against a re-authenticated upstream, captures the receipt in `docs/runbooks/hermes-proxy-smoke.md`, and promotes the manifest from `experimental` to `active`."
		},
		{
			"heading": "13-blocker-passed-to-operator",
			"content": "UH-38 cannot complete until `hermes auth status nous` (or whatever provider becomes the smoke target) reports a non-expired refresh token. The current state is:"
		},
		{
			"heading": "13-blocker-passed-to-operator",
			"content": "Re-auth is owned by the operator (`hermes auth add nous` or equivalent). All earlier slices (UH-35 / UH-39 / UH-37 / UH-40) are unblocked and proceed without a live upstream."
		}
	],
	"headings": [
		{
			"id": "1-environment",
			"content": "1\\. Environment"
		},
		{
			"id": "2-cli-surface-v0140",
			"content": "2\\. CLI surface (v0.14.0)"
		},
		{
			"id": "3-routes-forwarded-by-the-proxy",
			"content": "3\\. Routes forwarded by the proxy"
		},
		{
			"id": "4-auth-handoff",
			"content": "4\\. Auth handoff"
		},
		{
			"id": "5-error-envelope-canonical",
			"content": "5\\. Error envelope (canonical)"
		},
		{
			"id": "6-successful-path-expectations-not-live-verified",
			"content": "6\\. Successful-path expectations (NOT live-verified)"
		},
		{
			"id": "7-recommendations-for-uh-35-hermesproxyruntimeconfigschema",
			"content": "7\\. Recommendations for UH-35 (`HermesProxyRuntimeConfigSchema`)"
		},
		{
			"id": "8-recommendations-for-uh-39-adapter-shape",
			"content": "8\\. Recommendations for UH-39 (adapter shape)"
		},
		{
			"id": "9-adapter-manifest-recommendation-for-uh-35",
			"content": "9\\. Adapter manifest (recommendation for UH-35)"
		},
		{
			"id": "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			"content": "10\\. Adapter check shape (recommendation for UH-39 / UH-37)"
		},
		{
			"id": "11-known-gotchas",
			"content": "11\\. Known gotchas"
		},
		{
			"id": "12-acceptance-for-downstream-slices",
			"content": "12\\. Acceptance for downstream slices"
		},
		{
			"id": "13-blocker-passed-to-operator",
			"content": "13\\. Blocker passed to operator"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#1-environment",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "1. Environment" })
	},
	{
		depth: 2,
		url: "#2-cli-surface-v0140",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "2. CLI surface (v0.14.0)" })
	},
	{
		depth: 2,
		url: "#3-routes-forwarded-by-the-proxy",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "3. Routes forwarded by the proxy" })
	},
	{
		depth: 2,
		url: "#4-auth-handoff",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4. Auth handoff" })
	},
	{
		depth: 2,
		url: "#5-error-envelope-canonical",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "5. Error envelope (canonical)" })
	},
	{
		depth: 2,
		url: "#6-successful-path-expectations-not-live-verified",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6. Successful-path expectations (NOT live-verified)" })
	},
	{
		depth: 2,
		url: "#7-recommendations-for-uh-35-hermesproxyruntimeconfigschema",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			"7. Recommendations for UH-35 (",
			(0, import_jsx_runtime.jsx)("code", { children: "HermesProxyRuntimeConfigSchema" }),
			")"
		] })
	},
	{
		depth: 2,
		url: "#8-recommendations-for-uh-39-adapter-shape",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "8. Recommendations for UH-39 (adapter shape)" })
	},
	{
		depth: 2,
		url: "#9-adapter-manifest-recommendation-for-uh-35",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "9. Adapter manifest (recommendation for UH-35)" })
	},
	{
		depth: 2,
		url: "#10-adapter-check-shape-recommendation-for-uh-39--uh-37",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "10. Adapter check shape (recommendation for UH-39 / UH-37)" })
	},
	{
		depth: 2,
		url: "#11-known-gotchas",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "11. Known gotchas" })
	},
	{
		depth: 2,
		url: "#12-acceptance-for-downstream-slices",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "12. Acceptance for downstream slices" })
	},
	{
		depth: 2,
		url: "#13-blocker-passed-to-operator",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "13. Blocker passed to operator" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		blockquote: "blockquote",
		code: "code",
		em: "em",
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
			"Closes the discovery phase of ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-32",
				children: "UH-32"
			}),
			". Findings feed:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-35",
					children: "UH-35"
				}),
				" — schema + manifest fields for ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-39",
				children: "UH-39"
			}), " — adapter implementation: planner / runner / parser / sentinel / blocked classification."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-37",
				children: "UH-37"
			}), " — CLI dispatch + sandbox routing parity."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-40",
				children: "UH-40"
			}), " — operator runbook."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-38",
				children: "UH-38"
			}), " — E2E smoke + promotion criteria."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.blockquote, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Scope:" }), " read-only research. No production code changed in this slice."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "1-environment",
			children: "1. Environment"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Hermes Agent ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "v0.14.0 (2026.5.16)" }) }),
				" — installed at ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/Users/eduardojaviergarcialopez/.hermes/hermes-agent" }),
				", Python 3.11.14, OpenAI SDK 2.24.0. Confirmed minimum version per ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-31",
					children: "UH-31"
				}),
				" (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "MINIMUM_HERMES_VERSION = 0.14.0" }),
				")."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Proxy launched on the workstation with:",
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
						children: (0, import_jsx_runtime.jsx)(_components.span, { children: "hermes proxy start --provider nous" })
					}) })
				}) }),
				"\n",
				"Listening on ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "http://127.0.0.1:8645/v1" }) }),
				". Forwards per-request to the upstream provider, attaching credentials owned by the local ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth" }),
				" store."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "2-cli-surface-v0140",
			children: "2. CLI surface (v0.14.0)"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes proxy --help" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "usage: hermes proxy [-h] {start,status,providers} ..." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  start       Run the proxy in the foreground" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  status      Show which proxy upstreams are ready" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  providers   List available proxy upstream providers" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes proxy start --help" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --provider PROVIDER    Upstream provider (default: nous)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --host HOST            Bind address (default: 127.0.0.1)." })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --port PORT            Bind port (default: 8645)." })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
				"Providers available in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "0.14.0" }),
				":"
			] }),
			" ",
			(0, import_jsx_runtime.jsx)(_components.em, { children: "only" }),
			" ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "nous" }),
			" (Nous Portal). The handoff narrative and UH-32 epic description mention Claude Pro / ChatGPT Pro / SuperGrok backends — these are ",
			(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
				"not yet shipped as first-class ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes proxy" }),
				" providers"
			] }),
			". They are reachable today only because Nous Portal itself fans out to multiple upstream model backends server-side; the UH adapter does ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
			" need to know about the upstream provider beyond what model id to request."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Implication for the adapter:" }),
			" treat the upstream as opaque OAI-compat. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" }),
			" exposes the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "endpoint" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "model" }),
			", and an ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "auth_token" }),
			" (any non-empty string; the proxy ignores the value and attaches its own credentials). When/if Hermes ships a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "claude" }),
			" provider, no schema change is needed — operators just point at a proxy started with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--provider claude" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "3-routes-forwarded-by-the-proxy",
			children: "3. Routes forwarded by the proxy"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Confirmed by probing each route directly:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Route" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Status" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Notes" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "POST /v1/chat/completions" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "forwarded" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"OpenAI Chat Completions wire shape. Supports ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "stream: true" }),
					" (SSE)."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "POST /v1/completions" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "forwarded" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Legacy text-completion shape; not used by UH." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "POST /v1/embeddings" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "forwarded" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Out of scope for UH today." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "GET  /v1/models" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "forwarded" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Requires valid upstream auth before model listing succeeds." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"anything else (e.g. ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "/v1/health" }),
					", ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "/" }),
					")"
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: "404" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Returns ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "{\"error\":{\"type\":\"path_not_allowed\",\"code\":\"path_not_allowed\", …}}" }),
					"."
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "Server header" }),
			" observed: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Server: Python/3.11 aiohttp/3.13.4" }),
			". No CORS headers, no rate-limit headers in any observed response."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "4-auth-handoff",
			children: "4. Auth handoff"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The proxy ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "requires" }),
				" the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Authorization: Bearer " }),
				"value`` header on every call. Missing or malformed → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "401" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The proxy ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "ignores the bearer value" }),
				" — it attaches ",
				(0, import_jsx_runtime.jsx)(_components.em, { children: "its own" }),
				" credentials (resolved from ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth" }),
				") to the upstream request. UH can send any non-empty bearer; the canonical placeholder used in the spike was ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Bearer probe" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"When upstream credentials are stale / missing / refresh-token-revoked:",
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
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "HTTP/1.1 401 Unauthorized" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Content-Type: application/json; charset=utf-8" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, {})
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "{\"error\": {" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"message\": \"Failed to refresh Nous Portal credentials: Invalid refresh token\"," })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"type\": \"upstream_auth_failed\"," })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"code\": \"upstream_auth_failed\"" })
						}),
						"\n",
						(0, import_jsx_runtime.jsx)(_components.span, {
							className: "line",
							children: (0, import_jsx_runtime.jsx)(_components.span, { children: "}}" })
						})
					] })
				}) }),
				"\n",
				"Operator remediation lives entirely outside UH — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth status " }),
				"provider`` and the provider-specific re-auth flow (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth add nous" }),
				", vendor OAuth dance). The UH adapter MUST surface this as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
				" with a clear pointer to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth status" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "5-error-envelope-canonical",
			children: "5. Error envelope (canonical)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Every error observed in the spike — across ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "401" }),
			" and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "404" }),
			" — returns the same shape:"
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
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: (0, import_jsx_runtime.jsxs)(_components.span, {
				className: "line",
				children: [
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "{ "
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "\"error\""
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ": { "
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "\"message\""
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
						children: "\"…\""
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ", "
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "\"type\""
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
						children: "\"…\""
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ", "
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "\"code\""
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
						children: "\"…\""
					}),
					(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: " } }"
					})
				]
			}) })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "type" }) }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "HTTP" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Adapter classification (UH-39)" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "upstream_auth_failed" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "401" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "blocked" }), " — operator re-auth required."] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "path_not_allowed" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "404" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "failed" }), " — configuration error; surfaces config bug."] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "(future) quota / rate" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "429" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "blocked" }), " — re-run later, no diff produced."] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "(future) server_error" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "5xx" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "failed" }), " — non-deterministic; capture body verbatim."] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Streaming requests with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "stream: true" }),
			" that fail at the proxy layer still return a ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "single JSON body" }),
			" with the error envelope (not an SSE error event). The adapter therefore MUST tolerate both wire shapes — JSON or SSE — depending on whether the proxy reached the upstream."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "6-successful-path-expectations-not-live-verified",
			children: "6. Successful-path expectations (NOT live-verified)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"A successful path could not be live-verified in this spike because the local ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "nous" }),
			" provider credentials are stale:"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ hermes auth status nous" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "nous: logged out (Invalid refresh token)" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The OAI-compat shape is contractual, so the adapter is designed against the standard wire (matching OpenAI Chat Completions API verbatim):" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Non-streaming success → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "200" }),
				", body shape:",
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
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "  \"id\""
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
									children: "\"chatcmpl-…\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ","
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
									children: "  \"object\""
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
									children: "\"chat.completion\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ","
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
									children: "  \"created\""
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
									children: "1755568000"
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ","
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
									children: "  \"model\""
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
									children: "\"hermes-4-405b\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ","
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
									children: "  \"choices\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ": [{ "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"index\""
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
									children: "0"
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ", "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"message\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ": { "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"role\""
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
									children: "\"assistant\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ", "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"content\""
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
									children: "\"…\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: " }, "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"finish_reason\""
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
									children: "\"stop\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: " }],"
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
									children: "  \"usage\""
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ": { "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"prompt_tokens\""
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
										"--shiki-light": "#B31D28",
										"--shiki-light-font-style": "italic",
										"--shiki-dark": "#FDAEB7",
										"--shiki-dark-font-style": "italic"
									},
									children: "…"
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ", "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"completion_tokens\""
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
										"--shiki-light": "#B31D28",
										"--shiki-light-font-style": "italic",
										"--shiki-dark": "#FDAEB7",
										"--shiki-dark-font-style": "italic"
									},
									children: "…"
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: ", "
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#005CC5",
										"--shiki-dark": "#79B8FF"
									},
									children: "\"total_tokens\""
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
										"--shiki-light": "#B31D28",
										"--shiki-light-font-style": "italic",
										"--shiki-dark": "#FDAEB7",
										"--shiki-dark-font-style": "italic"
									},
									children: "…"
								}),
								(0, import_jsx_runtime.jsx)(_components.span, {
									style: {
										"--shiki-light": "#24292E",
										"--shiki-dark": "#E1E4E8"
									},
									children: " }"
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
				"\n"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Streaming success → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "text/event-stream" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "data: { … delta … }\\n\\n" }),
				" chunks terminated by ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "data: [DONE]\\n\\n" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"UH-38 (E2E smoke) is gated on the operator re-authenticating Hermes against the upstream provider. Once green, the smoke run will be captured in ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/runbooks/hermes-proxy-smoke.md" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h2, {
			id: "7-recommendations-for-uh-35-hermesproxyruntimeconfigschema",
			children: [
				"7. Recommendations for UH-35 (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "HermesProxyRuntimeConfigSchema" }),
				")"
			]
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "export"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: " const"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " HermesProxyRuntimeConfigSchema"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: " ="
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: " z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "object"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "({"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Proxy endpoint, including `/v1`. Default matches `hermes proxy start`'s"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * out-of-box bind (127.0.0.1:8645). Operators expose 0.0.0.0 + LAN-bind"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * via `hermes proxy start --host 0.0.0.0` if they want shared access."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  endpoint: z."
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
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"http://127.0.0.1:8645/v1\""
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
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Model identifier passed verbatim in the `model` field. Whatever the"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * upstream provider exposes (e.g. `hermes-4-405b`, `claude-opus-4-7`,"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * `gpt-5-pro`). Required — there is no useful default."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  model: z."
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
							children: "),"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Bearer value sent on every request. The proxy ignores the value but"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * REQUIRES the header to be present. Defaults to `\"hermes-proxy\"` (any"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * non-empty placeholder works)."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  auth_token: z."
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
							children: ")."
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
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "\"hermes-proxy\""
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
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Optional system prompt prefix. When set, prepended as a `system` message"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * before the buildMissionPrompt() user message. Lets operators inject"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * provider-specific persona/policy text without editing mission templates."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  system_prompt: z."
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
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Sampling controls forwarded to the upstream. Standard OAI knobs only."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  temperature: z."
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
							children: "0"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ")."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "max"
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
							children: "2"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ")."
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
							children: "0"
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
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "  max_tokens: z."
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
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Request timeout in ms. Long-context missions hit 405B routing latencies"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * north of 90s; the default leaves headroom for one model retry server-side."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  request_timeout_ms: z."
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
							children: "300_000"
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
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "  /**"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * Whether to stream. Streaming is preferred so the harness can flush"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * stdout to `runtime-session.yaml`'s stdout.log in near-real-time and"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   * surface the sentinel block as soon as the model emits it."
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "   */"
					})
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
							children: "  stream: z."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "boolean"
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
							children: "true"
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
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "})."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "strict"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "();"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"All keys above are validated through the existing ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "registerRuntimeConfigSchema(\"hermes-proxy\", …)" }),
			" plumbing established in ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-26",
				children: "UH-26"
			}),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "8-recommendations-for-uh-39-adapter-shape",
			children: "8. Recommendations for UH-39 (adapter shape)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Hermes-proxy is fundamentally different from ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "oh-my-pi" }),
			": ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "no subprocess, no stdout stream from a CLI" }),
			". It is an HTTP client. Concrete deltas vs the existing spawn-based adapters:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"No ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "command" }),
					" / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "args" }),
					"."
				] }),
				" The dry-run record's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "command" }),
				" field should be set to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\"POST " }),
				"endpoint",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/chat/completions\"" }),
				" for human readability and the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "args" }),
				" array should contain the JSON request body (pretty-printed) for parity with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dryRunHermes" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "stdout = the model's assistant message content" }),
				" (or, for streaming, the concatenated ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "delta.content" }),
				" chunks). Stderr remains a real string but typically empty; non-200 bodies are appended to stderr for forensics."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"Final-message sentinel (",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://linear.app/agentic-eng/issue/UH-28",
						children: "UH-28"
					}),
					")."
				] }),
				" The mission prompt MUST include ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtimeFinalMessageInstruction()" }),
				". The assistant's final message is scanned with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "extractRuntimeFinalMessageSentinel(content)" }),
				". ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }),
				" is written exactly as in hermes/codex/oh-my-pi."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"Diff capture (",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://linear.app/agentic-eng/issue/UH-34",
						children: "UH-34"
					}),
					")."
				] }),
				" Delegate to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "captureDiffWithUntracked(cwd)" }),
				". Note: the model itself does ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
				" mutate the working tree in v1 — it returns proposed changes in its message body and the harness applies them in a future slice. For UH-32's v1, the adapter produces an empty diff in the common case (the assistant's message content becomes the artifact). This matches the ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-33",
					children: "UH-27 / UH-33"
				}),
				" \"model emits assistant message + harness applies\" pattern already supported elsewhere."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"Sandbox seed (",
					(0, import_jsx_runtime.jsx)(_components.a, {
						href: "https://linear.app/agentic-eng/issue/UH-29",
						children: "UH-29"
					}),
					")."
				] }),
				" Free — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createSandbox" }),
				" already copies the bound mission dir."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Blocked classification (the key spike output):" }),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.code, { children: "upstream_auth_failed" }),
						" → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
						", ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "errors: [\"hermes-proxy: upstream auth invalid; run " }),
						"hermes auth status ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "provider``\"]" }),
						"."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						"HTTP 429 with any code → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "blocked" }),
						" with the upstream ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "Retry-After" }),
						" header surfaced if present."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						"HTTP 5xx → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "failed" }),
						" (config / upstream outage)."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						"Network unreachable (ECONNREFUSED, ETIMEDOUT) → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "blocked" }),
						", ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "errors: [\"hermes-proxy: cannot reach " }),
						"endpoint",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "; is " }),
						"hermes proxy start",
						(0, import_jsx_runtime.jsx)(_components.code, { children: " running?\"]" }),
						"."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						"200 with no ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "choices[0].message.content" }),
						" → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "failed" }),
						" (empty assistant message)."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						"200 but no ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "uh-runtime-final-message" }),
						" block in the content → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "passed" }),
						" with a warning, mirroring oh-my-pi behavior (sentinel is recommended, not required)."
					] }),
					"\n"
				] }),
				"\n"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Dispatch wiring:" }),
				" add to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "RUNTIME_WIRINGS" }),
				" with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "surfaceBlocked: true" }),
				" (consistent with codex and oh-my-pi — blocked auth must non-zero-exit for CI/verification gates)."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "9-adapter-manifest-recommendation-for-uh-35",
			children: "9. Adapter manifest (recommendation for UH-35)"
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
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "# .harness/adapters/hermes-proxy.yaml"
					})
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
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6A737D",
								"--shiki-dark": "#6A737D"
							},
							children: "                 # UH-38 promotes to active"
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
							children: "description"
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
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "|"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "  HTTP client targeting a local `hermes proxy` instance."
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
						children: "  Provider-agnostic OAI-compat routing for OAuth-backed subscriptions"
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
						children: "  (Nous Portal in 0.14.0; future Hermes versions may add claude/chatgpt/supergrok)."
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
							children: "\"hermes-4-405b\""
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
							children: "    auth_token"
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
							children: "\"hermes-proxy\""
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
							children: "    temperature"
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
							children: "0"
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
							children: "300000"
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
							children: "    stream"
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
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "cli_command" }),
			" is ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
			" populated — there is no spawn target. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check hermes-proxy" }),
			" should perform a lightweight ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "GET " }),
			"endpoint",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/models" }),
			" and surface the same wire-shape error envelope it would surface during a mission run."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "10-adapter-check-shape-recommendation-for-uh-39--uh-37",
			children: "10. Adapter check shape (recommendation for UH-39 / UH-37)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter check hermes-proxy" }), " should do roughly:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Read the manifest. Validate ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime_config" }),
				" via the registered Zod schema (UH-26 path)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "fetch(``endpoint" }),
				"/models",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ", { headers: { authorization: " }),
				"Bearer ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "auth_token`` } })" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Map response:",
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.code, { children: "200" }),
						" with a ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "data: [...]" }),
						" array → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "available: true" }),
						", surface model ids."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.code, { children: "401 upstream_auth_failed" }),
						" → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "available: false" }),
						", ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "errors: [\"upstream auth invalid — run " }),
						"hermes auth status ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "provider``\"]" }),
						"."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.code, { children: "404 path_not_allowed" }),
						" on ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "/models" }),
						" → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "available: false" }),
						", ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "errors: [\"proxy version mismatch: /models not forwarded\"]" }),
						" (would only trigger if Hermes changes the route set)."
					] }),
					"\n",
					(0, import_jsx_runtime.jsxs)(_components.li, { children: [
						(0, import_jsx_runtime.jsx)(_components.code, { children: "ECONNREFUSED" }),
						" → ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "available: false" }),
						", ",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "errors: [\"proxy unreachable at " }),
						"endpoint",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "; run " }),
						"hermes proxy start",
						(0, import_jsx_runtime.jsx)(_components.code, { children: "\"]" }),
						"."
					] }),
					"\n"
				] }),
				"\n"
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Return ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "AdapterCheckResult" }),
				" identical in shape to the hermes / codex / oh-my-pi checkers."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "11-known-gotchas",
			children: "11. Known gotchas"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "No upstream model list without auth." }),
				" ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "GET /v1/models" }),
				" requires valid upstream creds. So ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "adapter check" }),
				" cannot enumerate models when the user is logged out — the check must report \"configured but locked\" rather than \"broken\"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"No ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "--ask-for-approval" }),
					"-style flag drift surface."
				] }),
				" HTTP wire is contractually stable across hermes versions (OAI-compat is the contract). Version skew should be invisible. ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-30",
					children: "UH-30"
				}),
				" doesn't recur."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Streaming + error mix." }),
				" A request with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "stream: true" }),
				" that fails at the proxy returns one JSON body (not SSE). Parser MUST sniff ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "content-type" }),
				" before assuming SSE."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "No file mutation channel in v1." }),
				" The model returns its full deliverable in the assistant message content; the harness applies. If we later wire OAI-compat ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "tool use" }),
				", that's a separate epic — not in UH-32 scope."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Provider expansion is out-of-band." }),
				" When Hermes adds a ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "claude" }),
				" provider, it ships as a new ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--provider claude" }),
				" startup flag — no UH change required, since UH only talks to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "localhost:8645/v1" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "12-acceptance-for-downstream-slices",
			children: "12. Acceptance for downstream slices"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-35" }),
				" lands ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/hermes-proxy.yaml" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/adapters/hermes-proxy.ts" }),
				" (schema-only export), and the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh adapter add hermes-proxy" }),
				" template. No HTTP behaviour yet."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-39" }),
				" lands ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "planHermesProxyRun" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runHermesProxy" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dryRunHermesProxy" }),
				", the runtime checker, sentinel extraction, blocked classification, and unit tests with an injectable ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "fetchImpl" }),
				" (so tests deterministically simulate 200 / 401 / 404 / 429 / ECONNREFUSED)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-37" }),
				" replaces the dispatch stub with the real functions, adds ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "surfaceBlocked: true" }),
				", and proves sandbox routing parity."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-40" }),
				" publishes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/adapter-hermes-proxy.md" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/runbooks/hermes-proxy-setup.md" }),
				" cross-referencing this spike."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-38" }),
				" runs ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh mission run --runtime hermes-proxy" }),
				" end-to-end against a re-authenticated upstream, captures the receipt in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/runbooks/hermes-proxy-smoke.md" }),
				", and promotes the manifest from ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "experimental" }),
				" to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "active" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "13-blocker-passed-to-operator",
			children: "13. Blocker passed to operator"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"UH-38 cannot complete until ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth status nous" }),
			" (or whatever provider becomes the smoke target) reports a non-expired refresh token. The current state is:"
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
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: (0, import_jsx_runtime.jsx)(_components.span, {
				className: "line",
				children: (0, import_jsx_runtime.jsx)(_components.span, { children: "nous: logged out (Invalid refresh token)" })
			}) })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Re-auth is owned by the operator (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "hermes auth add nous" }),
			" or equivalent). All earlier slices (UH-35 / UH-39 / UH-37 / UH-40) are unblocked and proceed without a live upstream."
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
export { toc as a, structuredData as i, frontmatter as n, hermes_proxy_spike_exports as r, MDXContent as t };
