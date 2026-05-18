import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/adapter-codex-BXv3B9gM.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var adapter_codex_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Codex Runtime Adapter",
	"description": "The Codex adapter maps Ultimate Harness missions onto the OpenAI Codex CLI"
};
var structuredData = {
	"contents": [
		{
			"heading": "purpose",
			"content": "The Codex adapter maps Ultimate Harness missions onto the OpenAI Codex CLI\n(`codex`). It exists alongside the Hermes adapter and shares the same\nruntime adapter contract: mission packets in,\nstructured runtime sessions and artifacts out, no implicit promotion."
		},
		{
			"heading": "purpose",
			"content": "This document is the design — not the implementation. Wiring lives in a\nfollow-up issue. The manifest stub is at `.harness/adapters/codex.yaml`."
		},
		{
			"heading": "invocation",
			"content": "Codex is launched non-interactively through `codex exec` (alias `codex e`).\nThe adapter never opens a TTY; missions run unattended inside a sandbox\nmanaged by both Codex and the harness."
		},
		{
			"heading": "invocation",
			"content": "Baseline command:"
		},
		{
			"heading": "invocation",
			"content": "Flag rationale:"
		},
		{
			"heading": "invocation",
			"content": "`exec` — non-interactive mode. Required; the harness owns the lifecycle and\nmust not depend on a human keypress inside Codex."
		},
		{
			"heading": "invocation",
			"content": "`--sandbox workspace-write` — Codex confines writes to the sandbox cwd and\nblocks unrelated filesystem effects. This is the recommended replacement for\nthe deprecated `--full-auto` macro."
		},
		{
			"heading": "invocation",
			"content": "`--ask-for-approval` was retired in `codex-cli 0.130`. Under\n`--sandbox workspace-write`, in-sandbox actions are auto-approved without\nan explicit flag. Elevation prompts (network access, writes outside the\nsandbox) still surface; the adapter exposes them as `runtime.blocked`\nevents rather than answering them. The `approval_policy` runtime\\_config\nkey is retained for backward-compat with manifests written against\npre-0.130 codex CLIs but is currently a no-op (see UH-30)."
		},
		{
			"heading": "invocation",
			"content": "`--cd `sandbox-path\\`\\` — pins Codex to the worktree allocated by the sandbox\nbackend. The adapter never invokes Codex from the canonical repo root."
		},
		{
			"heading": "invocation",
			"content": "`--json` — emits a JSON Lines event stream on stdout. The adapter consumes\nit to build `runtime-session.yaml` and `events.ndjson`."
		},
		{
			"heading": "invocation",
			"content": "`--output-last-message `path\\`\\` — writes the final assistant message to a\nknown file so the adapter does not have to re-parse the JSONL tail to\nrecover the summary."
		},
		{
			"heading": "--full-auto-compatibility",
			"content": "`codex exec --full-auto` is retained by Codex as a deprecated compatibility\nflag that prints a warning on every run. The adapter does **not** emit it.\nA `compat_full_auto: true` field on the adapter config is reserved for users\npinned to older Codex builds that lack `--sandbox`; when set, the adapter\nsubstitutes `--full-auto` and records a `runtime.deprecated_flag` event."
		},
		{
			"heading": "elevated-mode",
			"content": "`--sandbox danger-full-access` is permitted only when the mission explicitly\ndeclares `sandbox.escalation: danger-full-access` and the workflow profile\nallows it. The adapter refuses to silently upgrade."
		},
		{
			"heading": "capability-flags",
			"content": "Declared in `.harness/adapters/codex.yaml` so the registry and mission\ncompiler can route work correctly. The adapter advertises:"
		},
		{
			"heading": "capability-flags",
			"content": "Capability"
		},
		{
			"heading": "capability-flags",
			"content": "Value"
		},
		{
			"heading": "capability-flags",
			"content": "Meaning"
		},
		{
			"heading": "capability-flags",
			"content": "`interactive`"
		},
		{
			"heading": "capability-flags",
			"content": "false"
		},
		{
			"heading": "capability-flags",
			"content": "`codex exec` is one-shot; the adapter does not stream a chat session."
		},
		{
			"heading": "capability-flags",
			"content": "`oneShot`"
		},
		{
			"heading": "capability-flags",
			"content": "true"
		},
		{
			"heading": "capability-flags",
			"content": "The adapter executes a mission to completion and exits."
		},
		{
			"heading": "capability-flags",
			"content": "`background`"
		},
		{
			"heading": "capability-flags",
			"content": "true"
		},
		{
			"heading": "capability-flags",
			"content": "Runs unattended; the harness owns supervision and cancellation."
		},
		{
			"heading": "capability-flags",
			"content": "`worktree`"
		},
		{
			"heading": "capability-flags",
			"content": "true"
		},
		{
			"heading": "capability-flags",
			"content": "Requires a git-worktree sandbox; cwd must be the allocated worktree."
		},
		{
			"heading": "capability-flags",
			"content": "`jsonOutput`"
		},
		{
			"heading": "capability-flags",
			"content": "true"
		},
		{
			"heading": "capability-flags",
			"content": "Consumes `codex exec --json` JSONL events for structured reporting."
		},
		{
			"heading": "capability-flags",
			"content": "`mcp`"
		},
		{
			"heading": "capability-flags",
			"content": "true"
		},
		{
			"heading": "capability-flags",
			"content": "Honors MCP tools configured in the user's `~/.codex/config.toml`."
		},
		{
			"heading": "capability-flags",
			"content": "These map onto the contract vocabulary as: `non_interactive_run`,\n`structured_events`, `sandbox_native`, `json_output`, `diff_output`,\n`file_tools`. `interactive_steering`, `subagents`, `skills`, and `browser`\nare intentionally **not** advertised; missions that require them must route\nto a different adapter."
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "The adapter compiles the mission packet into a single prompt string passed as\nthe trailing positional argument to `codex exec`. The shape is the same\nMarkdown block used by Hermes (`buildMissionPrompt`) so prompts stay\nruntime-portable:"
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "Codex-specific additions appended after the shared body:"
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "A `## Sandbox` block stating the worktree path and the active sandbox flag,\nso the model does not propose `cd` outside its scope."
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "A `## Constraints` block enumerating mission `constraints[]` verbatim."
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "A trailing instruction to emit a final summary block (see below) as the\nlast assistant message so `--output-last-message` captures it cleanly."
		},
		{
			"heading": "mission-prompt-input-shape",
			"content": "The prompt is persisted to `.harness/missions/`id`/prompt.md` exactly as\nsent. The mission id appears in the first line so it survives any log dump."
		},
		{
			"heading": "run-result-block-format",
			"content": "The prompt asks Codex to end with a fenced block that the adapter parses into\n`runtime-session.yaml` and the canonical `uh.runtime-result.v0` shape:"
		},
		{
			"heading": "run-result-block-format",
			"content": "If the model omits the block, the adapter synthesizes one from the JSONL\nevent stream and the captured diff, and stamps `status: blocked` with a\n`runtime.missing_result_block` finding. The harness never trusts the model's\nstatus word alone — `status: completed` requires a non-empty diff *and*\neither an empty `blockers[]` or explicit waiver."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Each mission run produces a fixed set of files inside\n`.harness/missions/`id`/`:"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "File"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Source"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`prompt.md`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Compiled mission prompt sent to Codex."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`runtime.log`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Raw stdout (JSONL stream) tee'd as the child writes."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`runtime.stderr.log`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Raw stderr from `codex exec`."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`events.ndjson`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Normalized lifecycle events derived from the JSONL stream."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`runtime-final.txt`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Final assistant message captured via `--output-last-message`."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`runtime-session.yaml`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`uh.runtime-session.v0` document with command, args, exit code."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`diff.patch`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`git diff` against the sandbox base ref at collection time."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`artifacts/`"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Files emitted outside the worktree's tracked paths, copied in."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "Capture rules:"
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "The adapter spawns Codex with `stdio: [\"pipe\", \"pipe\", \"pipe\"]` and\nstreams stdout/stderr to disk as bytes arrive. No buffering of full output\nin memory; this mirrors the Hermes adapter's `child.stdout.on(\"data\", …)`\npattern."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "JSONL parsing is line-incremental. Unparseable lines are written to\n`runtime.log` verbatim and surfaced as `runtime.parse_error` events;\nthey do not abort the run."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "`diff.patch` is produced by `git -C `sandbox-path`diff --binary`base-ref`...HEAD` after Codex exits (or after cancellation). Untracked\nfiles are appended via `git ls-files --others --exclude-standard` plus\n`git diff --no-index /dev/null `path\\`\\` so reviewers see them too."
		},
		{
			"heading": "stdoutstderrdiff-capture",
			"content": "All artifact paths are validated to live inside the mission directory\nbefore writing, using the same `assertPathInsideMissionDir` guard the\nHermes adapter uses. Symlinked mission directories are refused."
		},
		{
			"heading": "verification-triggering",
			"content": "The Codex adapter does not run verification itself. After `collect`, it:"
		},
		{
			"heading": "verification-triggering",
			"content": "Maps each entry in `mission.verification.required_checks[]` into the\n`checks_suggested[]` list of the runtime result, preserving order."
		},
		{
			"heading": "verification-triggering",
			"content": "Appends Codex-derived suggestions from the JSONL stream: any\n`item.kind: command` that exited non-zero becomes a `re-run` suggestion,\nany new test file becomes a `run-tests `path\\`\\` suggestion."
		},
		{
			"heading": "verification-triggering",
			"content": "Emits a `runtime.verification_ready` event so the harness can invoke\n`uh verify `mission-id\\`\\`. The verify command is the system of record for\npass/fail; the adapter only stages the intent."
		},
		{
			"heading": "verification-triggering",
			"content": "Mission `verification.review_gates[]` are passed through unchanged and\nsurface in the review step that follows verification."
		},
		{
			"heading": "default-flags",
			"content": "The manifest's `config` block carries the runtime defaults. They are\noverridable per-mission via workflow profiles."
		},
		{
			"heading": "default-flags",
			"content": "Config field"
		},
		{
			"heading": "default-flags",
			"content": "Default"
		},
		{
			"heading": "default-flags",
			"content": "Notes"
		},
		{
			"heading": "default-flags",
			"content": "`cli_command`"
		},
		{
			"heading": "default-flags",
			"content": "`codex`"
		},
		{
			"heading": "default-flags",
			"content": "Resolved through `PATH`."
		},
		{
			"heading": "default-flags",
			"content": "`default_toolsets`"
		},
		{
			"heading": "default-flags",
			"content": "`[]`"
		},
		{
			"heading": "default-flags",
			"content": "Codex tool surface is controlled in `~/.codex/config`."
		},
		{
			"heading": "default-flags",
			"content": "`default_provider`"
		},
		{
			"heading": "default-flags",
			"content": "`\"\"`"
		},
		{
			"heading": "default-flags",
			"content": "Unused; provider is configured in Codex itself."
		},
		{
			"heading": "default-flags",
			"content": "`default_model`"
		},
		{
			"heading": "default-flags",
			"content": "`\"\"`"
		},
		{
			"heading": "default-flags",
			"content": "Empty means \"let Codex pick its configured default\"."
		},
		{
			"heading": "default-flags",
			"content": "`worktree_mode`"
		},
		{
			"heading": "default-flags",
			"content": "`true`"
		},
		{
			"heading": "default-flags",
			"content": "Codex always runs in an allocated worktree."
		},
		{
			"heading": "default-flags",
			"content": "`pass_session_id`"
		},
		{
			"heading": "default-flags",
			"content": "`false`"
		},
		{
			"heading": "default-flags",
			"content": "Codex assigns its own thread id; the adapter records it."
		},
		{
			"heading": "default-flags",
			"content": "Hard-coded launch flags (not in the manifest because they are part of the\nadapter contract, not user policy):"
		},
		{
			"heading": "default-flags",
			"content": "`exec`"
		},
		{
			"heading": "default-flags",
			"content": "`--sandbox workspace-write`"
		},
		{
			"heading": "default-flags",
			"content": "`--cd `sandbox-path\\`\\`"
		},
		{
			"heading": "default-flags",
			"content": "`--json`"
		},
		{
			"heading": "default-flags",
			"content": "`--output-last-message `mission-dir`/runtime-final.txt`"
		},
		{
			"heading": "default-flags",
			"content": "`--skip-git-repo-check`"
		},
		{
			"heading": "default-flags",
			"content": "The mission prompt is the trailing positional argument."
		},
		{
			"heading": "risks-and-limits",
			"content": "**Sandbox depth.** `--sandbox workspace-write` constrains Codex but does\nnot isolate environment variables, shell aliases, or network access. The\ngit-worktree sandbox backend gives filesystem isolation; network policy is\nout of scope for this adapter."
		},
		{
			"heading": "risks-and-limits",
			"content": "**Deprecated `--full-auto`.** The flag still works but Codex warns on every\nrun and may remove it. The adapter avoids it by default; the\n`compat_full_auto` escape hatch exists only for pinned older builds."
		},
		{
			"heading": "risks-and-limits",
			"content": "**Elevation prompts block progress.** In `codex-cli 0.130+`, any operation\noutside the sandbox (network, writes outside cwd) still surfaces as an\nelevation request. The adapter exposes it as a `runtime.blocked` event\nrather than auto-approving, to avoid silently widening permissions."
		},
		{
			"heading": "risks-and-limits",
			"content": "**JSONL schema drift.** Codex event types (`thread.started`, `turn.*`,\n`item.*`, `mcp_tool_call`, …) evolve. The adapter parses by event name\nwith a fallback bucket; unknown events are stored verbatim so we do not\ndrop signal during version upgrades."
		},
		{
			"heading": "risks-and-limits",
			"content": "**Final-message reliability.** Models occasionally skip the requested\nYAML result block. The adapter's synthesis path handles this but the\nreconstructed result is marked `synthesized: true` and downgrades to\n`status: blocked` if the diff is also empty."
		},
		{
			"heading": "risks-and-limits",
			"content": "**MCP scope.** Codex's MCP tools run with the user's full config; the\nadapter inherits whatever servers are registered. Missions that must\ndisable specific MCP servers need to declare it as a constraint —\nthe adapter cannot reach into `~/.codex/config.toml` for them."
		},
		{
			"heading": "risks-and-limits",
			"content": "**Resume semantics.** `codex exec resume` is available but the harness\ndoes not use it for MVP missions: every mission run is treated as a fresh\nthread so audit boundaries stay clean. A `resume_session_id` config flag is\nreserved for future iteration."
		},
		{
			"heading": "risks-and-limits",
			"content": "**No subagent fan-out.** Codex runs as a single thread. Missions that\nexpect parallel subagent execution must route to an adapter that\nadvertises `subagents`."
		},
		{
			"heading": "implementation-status-2026-05-17",
			"content": "The adapter is now wired as `experimental` in `src/adapters/codex.ts` (CLI transport via `codex exec`, JSONL parsing, final-message capture, diff capture, runtime-result emission). End-to-end against the real Codex backend is gated on subscription quota and is NOT yet verified."
		},
		{
			"heading": "implementation-status-2026-05-17",
			"content": "Local CLI probed: `codex-cli 0.130.0`. Supports `--cd`, `--sandbox`, `--ask-for-approval`, `--json`, `--output-last-message`, `--skip-git-repo-check`."
		},
		{
			"heading": "implementation-status-2026-05-17",
			"content": "Quota / auth failures are classified as `runtime-result.status: blocked` with an explicit remediation message; they are NOT failures of the mission."
		},
		{
			"heading": "why-no-direct-chatgpt-backend-oauth-client",
			"content": "Both `NousResearch/hermes-agent` and `can1357/oh-my-pi` treat the Codex backend (`https://chatgpt.com/backend-api`) as a specialized OAuth-backed surface (`OpenAI-Beta: responses=experimental`, `chatgpt-account-id` from a JWT claim, `originator` header). Implementing that wire protocol inside Ultimate Harness would duplicate fragile semi-private behavior and require credential/refresh storage decisions."
		},
		{
			"heading": "why-no-direct-chatgpt-backend-oauth-client",
			"content": "The official `codex exec` CLI already owns OAuth, account state, session ids, and rate-limit handling, and exposes the exact non-interactive primitives we need. Using it as the transport is the smallest correct slice."
		},
		{
			"heading": "why-no-direct-chatgpt-backend-oauth-client",
			"content": "Reuse of broker/gateway patterns (oh-my-pi `auth-broker`/`auth-gateway`) is parked as a future option — tracked in the roadmap."
		}
	],
	"headings": [
		{
			"id": "purpose",
			"content": "Purpose"
		},
		{
			"id": "invocation",
			"content": "Invocation"
		},
		{
			"id": "--full-auto-compatibility",
			"content": "`--full-auto` compatibility"
		},
		{
			"id": "elevated-mode",
			"content": "Elevated mode"
		},
		{
			"id": "capability-flags",
			"content": "Capability flags"
		},
		{
			"id": "mission-prompt-input-shape",
			"content": "Mission-prompt input shape"
		},
		{
			"id": "run-result-block-format",
			"content": "Run-result block format"
		},
		{
			"id": "stdoutstderrdiff-capture",
			"content": "stdout/stderr/diff capture"
		},
		{
			"id": "verification-triggering",
			"content": "Verification triggering"
		},
		{
			"id": "default-flags",
			"content": "Default flags"
		},
		{
			"id": "risks-and-limits",
			"content": "Risks and limits"
		},
		{
			"id": "implementation-status-2026-05-17",
			"content": "Implementation status (2026-05-17)"
		},
		{
			"id": "why-no-direct-chatgpt-backend-oauth-client",
			"content": "Why no direct ChatGPT backend OAuth client"
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
		url: "#invocation",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Invocation" })
	},
	{
		depth: 3,
		url: "#--full-auto-compatibility",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [(0, import_jsx_runtime.jsx)("code", { children: "--full-auto" }), " compatibility"] })
	},
	{
		depth: 3,
		url: "#elevated-mode",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Elevated mode" })
	},
	{
		depth: 2,
		url: "#capability-flags",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Capability flags" })
	},
	{
		depth: 2,
		url: "#mission-prompt-input-shape",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Mission-prompt input shape" })
	},
	{
		depth: 2,
		url: "#run-result-block-format",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Run-result block format" })
	},
	{
		depth: 2,
		url: "#stdoutstderrdiff-capture",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "stdout/stderr/diff capture" })
	},
	{
		depth: 2,
		url: "#verification-triggering",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Verification triggering" })
	},
	{
		depth: 2,
		url: "#default-flags",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Default flags" })
	},
	{
		depth: 2,
		url: "#risks-and-limits",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Risks and limits" })
	},
	{
		depth: 2,
		url: "#implementation-status-2026-05-17",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Implementation status (2026-05-17)" })
	},
	{
		depth: 2,
		url: "#why-no-direct-chatgpt-backend-oauth-client",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Why no direct ChatGPT backend OAuth client" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		code: "code",
		em: "em",
		h2: "h2",
		h3: "h3",
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
			id: "purpose",
			children: "Purpose"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The Codex adapter maps Ultimate Harness missions onto the OpenAI Codex CLI\n(",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }),
			"). It exists alongside the Hermes adapter and shares the same\n",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "./runtime-adapter-contract.md",
				children: "runtime adapter contract"
			}),
			": mission packets in,\nstructured runtime sessions and artifacts out, no implicit promotion."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This document is the design — not the implementation. Wiring lives in a\nfollow-up issue. The manifest stub is at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/codex.yaml" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "invocation",
			children: "Invocation"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Codex is launched non-interactively through ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
			" (alias ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex e" }),
			").\nThe adapter never opens a TTY; missions run unattended inside a sandbox\nmanaged by both Codex and the harness."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Baseline command:" }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "codex exec \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --sandbox workspace-write \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --cd `sandbox-path` \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --json \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --output-last-message `mission-dir`/runtime-final.txt \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  --skip-git-repo-check \\" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  \"`mission-prompt`\"" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Flag rationale:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "exec" }), " — non-interactive mode. Required; the harness owns the lifecycle and\nmust not depend on a human keypress inside Codex."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox workspace-write" }),
				" — Codex confines writes to the sandbox cwd and\nblocks unrelated filesystem effects. This is the recommended replacement for\nthe deprecated ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--full-auto" }),
				" macro."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--ask-for-approval" }),
				" was retired in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex-cli 0.130" }),
				". Under\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox workspace-write" }),
				", in-sandbox actions are auto-approved without\nan explicit flag. Elevation prompts (network access, writes outside the\nsandbox) still surface; the adapter exposes them as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.blocked" }),
				"\nevents rather than answering them. The ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "approval_policy" }),
				" runtime_config\nkey is retained for backward-compat with manifests written against\npre-0.130 codex CLIs but is currently a no-op (see UH-30)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "--cd " }), "sandbox-path`` — pins Codex to the worktree allocated by the sandbox\nbackend. The adapter never invokes Codex from the canonical repo root."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--json" }),
				" — emits a JSON Lines event stream on stdout. The adapter consumes\nit to build ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "--output-last-message " }), "path`` — writes the final assistant message to a\nknown file so the adapter does not have to re-parse the JSONL tail to\nrecover the summary."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h3, {
			id: "--full-auto-compatibility",
			children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "--full-auto" }), " compatibility"]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec --full-auto" }),
			" is retained by Codex as a deprecated compatibility\nflag that prints a warning on every run. The adapter does ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
			" emit it.\nA ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "compat_full_auto: true" }),
			" field on the adapter config is reserved for users\npinned to older Codex builds that lack ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox" }),
			"; when set, the adapter\nsubstitutes ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--full-auto" }),
			" and records a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.deprecated_flag" }),
			" event."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "elevated-mode",
			children: "Elevated mode"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox danger-full-access" }),
			" is permitted only when the mission explicitly\ndeclares ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "sandbox.escalation: danger-full-access" }),
			" and the workflow profile\nallows it. The adapter refuses to silently upgrade."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "capability-flags",
			children: "Capability flags"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Declared in ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/adapters/codex.yaml" }),
			" so the registry and mission\ncompiler can route work correctly. The adapter advertises:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Capability" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Value" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Meaning" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "interactive" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "false" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }), " is one-shot; the adapter does not stream a chat session."] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "oneShot" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "The adapter executes a mission to completion and exits." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "background" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Runs unattended; the harness owns supervision and cancellation." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "worktree" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Requires a git-worktree sandbox; cwd must be the allocated worktree." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "jsonOutput" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Consumes ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec --json" }),
					" JSONL events for structured reporting."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "mcp" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "true" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Honors MCP tools configured in the user's ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.codex/config.toml" }),
					"."
				] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"These map onto the contract vocabulary as: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "non_interactive_run" }),
			",\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "structured_events" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "sandbox_native" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "json_output" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "diff_output" }),
			",\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "file_tools" }),
			". ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "interactive_steering" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "subagents" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "skills" }),
			", and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "browser" }),
			"\nare intentionally ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
			" advertised; missions that require them must route\nto a different adapter."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "mission-prompt-input-shape",
			children: "Mission-prompt input shape"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The adapter compiles the mission packet into a single prompt string passed as\nthe trailing positional argument to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
			". The shape is the same\nMarkdown block used by Hermes (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "buildMissionPrompt" }),
			") so prompts stay\nruntime-portable:"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "# Mission: `mission.name`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "`mission.description`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Workflow: `workflow.name`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "### `phase.name` (`phase.agent_role`)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "`phase.description`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Related Issues" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- [`source`] `reference` (`url`)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Read First" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- `path`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Expected Artifacts" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- `path` (`type`)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "## Verification Checks" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "- `check`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "Execute this mission and produce the expected artifacts." })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Codex-specific additions appended after the shared body:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "## Sandbox" }),
				" block stating the worktree path and the active sandbox flag,\nso the model does not propose ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "cd" }),
				" outside its scope."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "## Constraints" }),
				" block enumerating mission ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "constraints[]" }),
				" verbatim."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"A trailing instruction to emit a final summary block (see below) as the\nlast assistant message so ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--output-last-message" }),
				" captures it cleanly."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The prompt is persisted to ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/prompt.md" }),
			" exactly as\nsent. The mission id appears in the first line so it survives any log dump."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "run-result-block-format",
			children: "Run-result block format"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The prompt asks Codex to end with a fenced block that the adapter parses into\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }),
			" and the canonical ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh.runtime-result.v0" }),
			" shape:"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "```yaml" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "schema_version: uh.runtime-result.v0" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "mission_id: `mission.id`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "runtime:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  adapter_id: codex" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  session_id: `codex-thread-id`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "status: completed   # completed | failed | cancelled | blocked" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "summary: <one-line summary>" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "artifacts:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  - path: `path`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    kind: <documentation|code|test|config>" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    status: <created|modified|deleted>" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "changes:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  diff_ref: .harness/missions/`id`/diff.patch" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  files_changed:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "    - `path`" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "checks_suggested:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  - <command or named check>" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "blockers: []" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "logs:" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  - .harness/missions/`id`/runtime.log" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "```" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"If the model omits the block, the adapter synthesizes one from the JSONL\nevent stream and the captured diff, and stamps ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "status: blocked" }),
			" with a\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.missing_result_block" }),
			" finding. The harness never trusts the model's\nstatus word alone — ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "status: completed" }),
			" requires a non-empty diff ",
			(0, import_jsx_runtime.jsx)(_components.em, { children: "and" }),
			"\neither an empty ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "blockers[]" }),
			" or explicit waiver."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "stdoutstderrdiff-capture",
			children: "stdout/stderr/diff capture"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Each mission run produces a fixed set of files inside\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/missions/" }),
			"id",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/" }),
			":"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "File" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Source" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "prompt.md" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Compiled mission prompt sent to Codex." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.log" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Raw stdout (JSONL stream) tee'd as the child writes." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.stderr.log" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Raw stderr from ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
				"."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "events.ndjson" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Normalized lifecycle events derived from the JSONL stream." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-final.txt" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Final assistant message captured via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--output-last-message" }),
				"."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "uh.runtime-session.v0" }), " document with command, args, exit code."] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "diff.patch" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "git diff" }), " against the sandbox base ref at collection time."] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "artifacts/" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Files emitted outside the worktree's tracked paths, copied in." })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Capture rules:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The adapter spawns Codex with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "stdio: [\"pipe\", \"pipe\", \"pipe\"]" }),
				" and\nstreams stdout/stderr to disk as bytes arrive. No buffering of full output\nin memory; this mirrors the Hermes adapter's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "child.stdout.on(\"data\", …)" }),
				"\npattern."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"JSONL parsing is line-incremental. Unparseable lines are written to\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.log" }),
				" verbatim and surfaced as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.parse_error" }),
				" events;\nthey do not abort the run."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "diff.patch" }),
				" is produced by ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "git -C " }),
				"sandbox-path",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "diff --binary" }),
				"base-ref",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "...HEAD" }),
				" after Codex exits (or after cancellation). Untracked\nfiles are appended via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "git ls-files --others --exclude-standard" }),
				" plus\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "git diff --no-index /dev/null " }),
				"path`` so reviewers see them too."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"All artifact paths are validated to live inside the mission directory\nbefore writing, using the same ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "assertPathInsideMissionDir" }),
				" guard the\nHermes adapter uses. Symlinked mission directories are refused."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "verification-triggering",
			children: "Verification triggering"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The Codex adapter does not run verification itself. After ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "collect" }),
			", it:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Maps each entry in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mission.verification.required_checks[]" }),
				" into the\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "checks_suggested[]" }),
				" list of the runtime result, preserving order."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Appends Codex-derived suggestions from the JSONL stream: any\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "item.kind: command" }),
				" that exited non-zero becomes a ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "re-run" }),
				" suggestion,\nany new test file becomes a ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "run-tests " }),
				"path`` suggestion."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Emits a ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.verification_ready" }),
				" event so the harness can invoke\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh verify " }),
				"mission-id``. The verify command is the system of record for\npass/fail; the adapter only stages the intent."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Mission ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "verification.review_gates[]" }),
			" are passed through unchanged and\nsurface in the review step that follows verification."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "default-flags",
			children: "Default flags"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The manifest's ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "config" }),
			" block carries the runtime defaults. They are\noverridable per-mission via workflow profiles."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Config field" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Default" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Notes" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "cli_command" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "codex" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Resolved through ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "PATH" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "default_toolsets" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "[]" }) }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Codex tool surface is controlled in ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.codex/config" }),
					"."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "default_provider" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "\"\"" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Unused; provider is configured in Codex itself." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "default_model" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "\"\"" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Empty means \"let Codex pick its configured default\"." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "worktree_mode" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "true" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Codex always runs in an allocated worktree." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "pass_session_id" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "false" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Codex assigns its own thread id; the adapter records it." })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Hard-coded launch flags (not in the manifest because they are part of the\nadapter contract, not user policy):" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "exec" }) }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox workspace-write" }) }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "--cd " }), "sandbox-path``"] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "--json" }) }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--output-last-message " }),
				"mission-dir",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/runtime-final.txt" })
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "--skip-git-repo-check" }) }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The mission prompt is the trailing positional argument." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "risks-and-limits",
			children: "Risks and limits"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Sandbox depth." }),
				" ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox workspace-write" }),
				" constrains Codex but does\nnot isolate environment variables, shell aliases, or network access. The\ngit-worktree sandbox backend gives filesystem isolation; network policy is\nout of scope for this adapter."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"Deprecated ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "--full-auto" }),
					"."
				] }),
				" The flag still works but Codex warns on every\nrun and may remove it. The adapter avoids it by default; the\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "compat_full_auto" }),
				" escape hatch exists only for pinned older builds."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Elevation prompts block progress." }),
				" In ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex-cli 0.130+" }),
				", any operation\noutside the sandbox (network, writes outside cwd) still surfaces as an\nelevation request. The adapter exposes it as a ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime.blocked" }),
				" event\nrather than auto-approving, to avoid silently widening permissions."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "JSONL schema drift." }),
				" Codex event types (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "thread.started" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "turn.*" }),
				",\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "item.*" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "mcp_tool_call" }),
				", …) evolve. The adapter parses by event name\nwith a fallback bucket; unknown events are stored verbatim so we do not\ndrop signal during version upgrades."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Final-message reliability." }),
				" Models occasionally skip the requested\nYAML result block. The adapter's synthesis path handles this but the\nreconstructed result is marked ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "synthesized: true" }),
				" and downgrades to\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "status: blocked" }),
				" if the diff is also empty."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "MCP scope." }),
				" Codex's MCP tools run with the user's full config; the\nadapter inherits whatever servers are registered. Missions that must\ndisable specific MCP servers need to declare it as a constraint —\nthe adapter cannot reach into ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.codex/config.toml" }),
				" for them."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Resume semantics." }),
				" ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec resume" }),
				" is available but the harness\ndoes not use it for MVP missions: every mission run is treated as a fresh\nthread so audit boundaries stay clean. A ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "resume_session_id" }),
				" config flag is\nreserved for future iteration."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "No subagent fan-out." }),
				" Codex runs as a single thread. Missions that\nexpect parallel subagent execution must route to an adapter that\nadvertises ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "subagents" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "implementation-status-2026-05-17",
			children: "Implementation status (2026-05-17)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The adapter is now wired as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "experimental" }),
				" in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/adapters/codex.ts" }),
				" (CLI transport via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
				", JSONL parsing, final-message capture, diff capture, runtime-result emission). End-to-end against the real Codex backend is gated on subscription quota and is NOT yet verified."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Local CLI probed: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex-cli 0.130.0" }),
				". Supports ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--cd" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--sandbox" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--ask-for-approval" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--json" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--output-last-message" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "--skip-git-repo-check" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Quota / auth failures are classified as ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-result.status: blocked" }),
				" with an explicit remediation message; they are NOT failures of the mission."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "why-no-direct-chatgpt-backend-oauth-client",
			children: "Why no direct ChatGPT backend OAuth client"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Both ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "NousResearch/hermes-agent" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "can1357/oh-my-pi" }),
				" treat the Codex backend (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "https://chatgpt.com/backend-api" }),
				") as a specialized OAuth-backed surface (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "OpenAI-Beta: responses=experimental" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "chatgpt-account-id" }),
				" from a JWT claim, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "originator" }),
				" header). Implementing that wire protocol inside Ultimate Harness would duplicate fragile semi-private behavior and require credential/refresh storage decisions."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The official ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "codex exec" }),
				" CLI already owns OAuth, account state, session ids, and rate-limit handling, and exposes the exact non-interactive primitives we need. Using it as the transport is the smallest correct slice."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Reuse of broker/gateway patterns (oh-my-pi ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "auth-broker" }),
				"/",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "auth-gateway" }),
				") is parked as a future option — tracked in the ",
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "../ROADMAP.md",
					children: "roadmap"
				}),
				"."
			] }),
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
export { toc as a, structuredData as i, adapter_codex_exports as n, frontmatter as r, MDXContent as t };
