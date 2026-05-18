import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/codex-e2e-smoke-C4jYHG15.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var codex_e2e_smoke_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Codex adapter — end-to-end smoke runbook",
	"description": "Status: **GATED ON QUOTA**. Last attempt failed with `You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.` The adapter classified that correctly as `runtime-result.status: blocked`."
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Status: **GATED ON QUOTA**. Last attempt failed with `You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.` The adapter classified that correctly as `runtime-result.status: blocked`."
		},
		{
			"heading": void 0,
			"content": "This runbook is the minimum-cost path to flip the Codex manifest from `experimental` → `active` once ChatGPT subscription credits are available."
		},
		{
			"heading": "preconditions",
			"content": "`codex --version` reports `codex-cli 0.130.0` or newer."
		},
		{
			"heading": "preconditions",
			"content": "The local Codex account has remaining subscription quota. Verify at https\\://chatgpt.com/codex/settings/usage."
		},
		{
			"heading": "preconditions",
			"content": "Repo is on a clean branch off `dev`. Suggested branch: `chore/codex-e2e-smoke`."
		},
		{
			"heading": "preconditions",
			"content": "`dist/` is up to date: `bun run build`."
		},
		{
			"heading": "one-shot-smoke",
			"content": "Expected end-state:"
		},
		{
			"heading": "one-shot-smoke",
			"content": "`.harness/missions/codex-e2e-smoke/runtime-result.yaml` has `status: passed`."
		},
		{
			"heading": "one-shot-smoke",
			"content": "`.harness/missions/codex-e2e-smoke/runtime-final.txt` contains a one-paragraph summary."
		},
		{
			"heading": "one-shot-smoke",
			"content": "`.harness/missions/codex-e2e-smoke/diff.patch` contains exactly one new file: `docs/codex-smoke.txt`."
		},
		{
			"heading": "one-shot-smoke",
			"content": "`verify` reports `[PASS]`."
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "After the smoke succeeds, edit:"
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "`.harness/adapters/codex.yaml`: `status: experimental` → `status: active`."
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "`src/harness/adapter-add.ts`: same change in the Codex template."
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "`docs/architecture/adapter-codex.md`: append a dated `Promoted to active` paragraph under the implementation status section."
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "Tests: extend `tests/codex.test.ts` with a manifest-loader assertion `expect(adapter.status).toBe('active')`."
		},
		{
			"heading": "flip-manifest-to-active",
			"content": "Open a PR titled `chore(codex): promote adapter to active after E2E smoke` and link the runtime-result.yaml + final.txt + diff.patch as evidence."
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Symptom"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Where it shows up"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Action"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`runtime-result.status: blocked`, error contains `usage limit` / `purchase more credits`"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "stdout/stderr → `errors[]`"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Quota exhausted. Top up subscription. Re-run from step 2."
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`runtime-result.status: blocked`, error: `Codex did not write --output-last-message`"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "exit 0 but final file absent"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Codex CLI version regression. Inspect `runtime.stdout.log` (JSONL events). File issue upstream if reproducible."
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`runtime-result.status: failed`, `Spawn error: ENOENT`"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "stderr"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`codex` not on PATH. `command -v codex` to confirm; reinstall via `brew install --cask codex`."
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`runtime-result.status: failed`, exit non-zero, no quota text"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "stderr"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Read `runtime.stderr.log` and the trailing `turn.failed` event in `runtime.stdout.log`."
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Diff is empty but Codex reported success"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "`diff.patch` zero bytes"
		},
		{
			"heading": "failure-modes-and-how-to-read-them",
			"content": "Codex did not modify the worktree. Inspect `runtime-final.txt` for \"I would have written ...\" — usually a sandbox or approval mismatch. Re-check `--sandbox workspace-write` made it into args."
		},
		{
			"heading": "re-running-after-a-partial-failure",
			"content": "The sandbox stays bound to the mission. To retry without rebuilding state:"
		},
		{
			"heading": "re-running-after-a-partial-failure",
			"content": "To start completely fresh:"
		},
		{
			"heading": "re-running-after-a-partial-failure",
			"content": "(Or just copy `examples/missions/codex-e2e-smoke.yaml` into place once — it is the source of truth for the smoke mission packet.)"
		},
		{
			"heading": "why-this-mission",
			"content": "Single expected artifact (`docs/codex-smoke.txt`). Minimizes token spend on the real Codex backend."
		},
		{
			"heading": "why-this-mission",
			"content": "Verification check is a one-liner: file exists + contains an ISO 8601 timestamp."
		},
		{
			"heading": "why-this-mission",
			"content": "Diff is trivially reviewable — one new file with one line."
		},
		{
			"heading": "why-this-mission",
			"content": "Exercises every adapter path: planner, runner, JSONL parse, final-message capture, diff capture, runtime-result emission, verify routing into the sandbox worktree."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "The Codex adapter is promoted to `active` only after **all** of:"
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "One real `mission run --runtime codex` run with `runtime-result.status: passed`."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "`verify` returns `[PASS]`."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "`runtime-final.txt` is non-empty and contains a coherent summary."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "`diff.patch` contains the expected single file."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "No silent fallbacks observed — quota/auth/missing-binary still produce `blocked` not `passed`."
		},
		{
			"heading": "acceptance-for-promotion",
			"content": "`bun run test` green (no regressions in the experimental → active transition)."
		}
	],
	"headings": [
		{
			"id": "preconditions",
			"content": "Preconditions"
		},
		{
			"id": "one-shot-smoke",
			"content": "One-shot smoke"
		},
		{
			"id": "flip-manifest-to-active",
			"content": "Flip manifest to `active`"
		},
		{
			"id": "failure-modes-and-how-to-read-them",
			"content": "Failure modes and how to read them"
		},
		{
			"id": "re-running-after-a-partial-failure",
			"content": "Re-running after a partial failure"
		},
		{
			"id": "why-this-mission",
			"content": "Why this mission"
		},
		{
			"id": "acceptance-for-promotion",
			"content": "Acceptance for promotion"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#preconditions",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Preconditions" })
	},
	{
		depth: 2,
		url: "#one-shot-smoke",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "One-shot smoke" })
	},
	{
		depth: 2,
		url: "#flip-manifest-to-active",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: ["Flip manifest to ", (0, import_jsx_runtime.jsx)("code", { children: "active" })] })
	},
	{
		depth: 2,
		url: "#failure-modes-and-how-to-read-them",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Failure modes and how to read them" })
	},
	{
		depth: 2,
		url: "#re-running-after-a-partial-failure",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Re-running after a partial failure" })
	},
	{
		depth: 2,
		url: "#why-this-mission",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Why this mission" })
	},
	{
		depth: 2,
		url: "#acceptance-for-promotion",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Acceptance for promotion" })
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
			"Status: ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "GATED ON QUOTA" }),
			". Last attempt failed with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits." }),
			" The adapter classified that correctly as ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This runbook is the minimum-cost path to flip the Codex manifest from ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "experimental" }),
			" → ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "active" }),
			" once ChatGPT subscription credits are available."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "preconditions",
			children: "Preconditions"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex --version" }),
				" reports ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex-cli 0.130.0" }),
				" or newer."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The local Codex account has remaining subscription quota. Verify at ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://chatgpt.com/codex/settings/usage",
					children: "https://chatgpt.com/codex/settings/usage"
				}),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Repo is on a clean branch off ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dev" }),
				". Suggested branch: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "chore/codex-e2e-smoke" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dist/" }),
				" is up to date: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run build" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "one-shot-smoke",
			children: "One-shot smoke"
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"m 4,4 a 1,1 0 0 0 -0.7070312,0.2929687 1,1 0 0 0 0,1.4140625 L 8.5859375,11 3.2929688,16.292969 a 1,1 0 0 0 0,1.414062 1,1 0 0 0 1.4140624,0 l 5.9999998,-6 a 1.0001,1.0001 0 0 0 0,-1.414062 L 4.7070312,4.2929687 A 1,1 0 0 0 4,4 Z m 8,14 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 8 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#6A737D",
							"--shiki-dark": "#6A737D"
						},
						children: "# 1. Allocate a sandbox bound to the mission"
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " sandbox"
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
							children: " codex-smoke-sb"
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
						children: "  --mission"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: " codex-e2e-smoke"
					})]
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
						children: "# 2. Run the mission against the real Codex CLI"
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
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
							children: " run"
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
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "  .harness/missions/codex-e2e-smoke/mission.yaml"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: " \\"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "  --runtime"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: " codex"
					})]
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
						children: "# 3. Verify"
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " verify"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " codex-e2e-smoke"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Expected end-state:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/codex-e2e-smoke/runtime-result.yaml" }),
				" has ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: passed" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/codex-e2e-smoke/runtime-final.txt" }), " contains a one-paragraph summary."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/codex-e2e-smoke/diff.patch" }),
				" contains exactly one new file: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/codex-smoke.txt" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "verify" }),
				" reports ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "[PASS]" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h2, {
			id: "flip-manifest-to-active",
			children: ["Flip manifest to ", (0, import_jsx_runtime.jsx)(_components.code, { children: "active" })]
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "After the smoke succeeds, edit:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/codex.yaml" }),
				": ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: experimental" }),
				" → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: active" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "src/harness/adapter-add.ts" }), ": same change in the Codex template."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/architecture/adapter-codex.md" }),
				": append a dated ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Promoted to active" }),
				" paragraph under the implementation status section."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Tests: extend ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "tests/codex.test.ts" }),
				" with a manifest-loader assertion ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "expect(adapter.status).toBe('active')" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Open a PR titled ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "chore(codex): promote adapter to active after E2E smoke" }),
			" and link the runtime-result.yaml + final.txt + diff.patch as evidence."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "failure-modes-and-how-to-read-them",
			children: "Failure modes and how to read them"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Symptom" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Where it shows up" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Action" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
					", error contains ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "usage limit" }),
					" / ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "purchase more credits" })
				] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: ["stdout/stderr → ", (0, import_jsx_runtime.jsx)(_components.code, { children: "errors[]" })] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Quota exhausted. Top up subscription. Re-run from step 2." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
					", error: ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "Codex did not write --output-last-message" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "exit 0 but final file absent" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Codex CLI version regression. Inspect ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.stdout.log" }),
					" (JSONL events). File issue upstream if reproducible."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: failed" }),
					", ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "Spawn error: ENOENT" })
				] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "stderr" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
					" not on PATH. ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "command -v codex" }),
					" to confirm; reinstall via ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "brew install --cask codex" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: failed" }), ", exit non-zero, no quota text"] }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "stderr" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Read ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.stderr.log" }),
					" and the trailing ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "turn.failed" }),
					" event in ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.stdout.log" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Diff is empty but Codex reported success" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "diff.patch" }), " zero bytes"] }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Codex did not modify the worktree. Inspect ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }),
					" for \"I would have written ...\" — usually a sandbox or approval mismatch. Re-check ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox workspace-write" }),
					" made it into args."
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "re-running-after-a-partial-failure",
			children: "Re-running after a partial failure"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The sandbox stays bound to the mission. To retry without rebuilding state:" }),
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " sandbox"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " status"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " codex-smoke-sb"
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
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
							children: " run"
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
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "  .harness/missions/codex-e2e-smoke/mission.yaml"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: " \\"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "  --runtime"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: " codex"
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "To start completely fresh:" }),
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " sandbox"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " discard"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " codex-smoke-sb"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: " --force"
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
							children: " .harness/missions/codex-e2e-smoke"
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
							children: "node"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " dist/cli.js"
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
							children: " codex-e2e-smoke"
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
							children: " \"Codex E2E Smoke\""
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
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "  --objective"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " \"Single timestamp marker file\""
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
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-dark": "#79B8FF"
						},
						children: "  --force"
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
							children: "cp"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " examples/missions/codex-e2e-smoke.yaml"
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
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "   .harness/missions/codex-e2e-smoke/mission.yaml"
					})
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"(Or just copy ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "examples/missions/codex-e2e-smoke.yaml" }),
			" into place once — it is the source of truth for the smoke mission packet.)"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "why-this-mission",
			children: "Why this mission"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Single expected artifact (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "docs/codex-smoke.txt" }),
				"). Minimizes token spend on the real Codex backend."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Verification check is a one-liner: file exists + contains an ISO 8601 timestamp." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Diff is trivially reviewable — one new file with one line." }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Exercises every adapter path: planner, runner, JSONL parse, final-message capture, diff capture, runtime-result emission, verify routing into the sandbox worktree." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "acceptance-for-promotion",
			children: "Acceptance for promotion"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The Codex adapter is promoted to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "active" }),
			" only after ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "all" }),
			" of:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"One real ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mission run --runtime codex" }),
				" run with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: passed" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "verify" }),
				" returns ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "[PASS]" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }), " is non-empty and contains a coherent summary."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "diff.patch" }), " contains the expected single file."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"No silent fallbacks observed — quota/auth/missing-binary still produce ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "blocked" }),
				" not ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "passed" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run test" }), " green (no regressions in the experimental → active transition)."] }),
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
export { toc as a, structuredData as i, codex_e2e_smoke_exports as n, frontmatter as r, MDXContent as t };
