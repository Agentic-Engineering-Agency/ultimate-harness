import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/tui-framework-B5qBSfYf.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var tui_framework_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "UH-45 — OpenTUI framework selection spike",
	"description": "Closes the discovery phase of [UH-41](https://linear.app/agentic-eng/issue/UH-41). Findings feed:"
};
var structuredData = {
	"contents": [
		{
			"heading": void 0,
			"content": "Closes the discovery phase of UH-41. Findings feed:"
		},
		{
			"heading": void 0,
			"content": "UH-46 — Dashboard: live adapters + missions + sandboxes (three-pane)."
		},
		{
			"heading": void 0,
			"content": "UH-47 — Mission browser: drilldown with `Code` + `Diff` viewers."
		},
		{
			"heading": void 0,
			"content": "UH-44 — Mission run flow: trigger from TUI, stream events live."
		},
		{
			"heading": void 0,
			"content": "UH-43 — Adapter + sandbox manager: live checks, create/discard inline."
		},
		{
			"heading": void 0,
			"content": "UH-42 — Polish: keymap overlay, theming, error states, Agent Skill install."
		},
		{
			"heading": void 0,
			"content": "> **Scope:** exploratory prototype. The shipped prototype at `bin/uh-tui-spike.tsx` is not wired into `src/cli.ts` and is not invoked by the test suite. Downstream slices consume the framework decision + lifecycle invariants, not this file."
		},
		{
			"heading": "1-environment",
			"content": "Workstation: macOS 25.4.0, Apple M4 Pro (arm64)."
		},
		{
			"heading": "1-environment",
			"content": "Bun **1.3.14** (`/opt/homebrew/bin/bun`); Node 24.15.0 available but unused by the spike."
		},
		{
			"heading": "1-environment",
			"content": "TypeScript 6.0.3, `vitest@4.1.6` (unchanged)."
		},
		{
			"heading": "1-environment",
			"content": "OpenTUI **0.2.13** — current `latest` (published 2026-05-17, day-of). Native prebuilt `@opentui/core-darwin-arm64@0.2.13` (1.68 MB unpacked) loads via the parent package's `optionalDependencies` block — no source build, no manual `xcode-select`, no Zig toolchain required."
		},
		{
			"heading": "1-environment",
			"content": "No native-module load errors on macOS arm64. `node_modules/@opentui/core-darwin-arm64/libopentui.dylib` (the Zig core) loads via `bun-ffi-structs` (also a runtime dep of `@opentui/core`) on first import."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Framework"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Version"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Why considered"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "`@opentui/core`"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "0.2.13"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "The native binding itself; lowest layer, no abstraction tax."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "`@opentui/solid`"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "0.2.13"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Solid's fine-grained reactivity (`createSignal`, `createMemo`) was the lead bet for the streaming `mission run` view (UH-44)."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "~~`@opentui/react`~~"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "0.2.13"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "**Skipped.** Same JSX ergonomics story as Solid but pays virtual-DOM diff cost on every event. UH-44's event stream is the hot path; trading off Solid's fine-grained model to gain… nothing else UH wants (no Suspense, no concurrent rendering, no ecosystem libraries we plan to consume) was not defensible. Solid is the only contender at this layer."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Two prototypes were built at commit `8adf04b` (see git history — `git show 8adf04b -- bin/`):"
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "`bin/uh-tui-spike-vanilla.ts` — raw `@opentui/core`, imperative `BoxRenderable` / `SelectRenderable` / `TextRenderable` construction."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "`bin/uh-tui-spike-solid.tsx` — `@opentui/solid` JSX with `createSignal`, `useKeyboard`, `useRenderer`."
		},
		{
			"heading": "2-frameworks-evaluated",
			"content": "Both render the **same screen**: a bordered `Box` titled \"uh tui spike\", a one-line summary of `.harness/sandboxes/index.yaml` (\"`sandboxes loaded from … (0)`\"), a `Select` listing each sandbox with a `● dirty` / `○ clean` badge (or a `(no sandboxes)` placeholder when the index is empty), and a one-line footer with the keymap."
		},
		{
			"heading": "3-decision",
			"content": "**Recommendation: `@opentui/solid` (with `@opentui/core` as a transitive dep).**"
		},
		{
			"heading": "3-decision",
			"content": "Shipping prototype at `bin/uh-tui-spike.tsx`. Run via `bun run tui-spike`."
		},
		{
			"heading": "3-decision",
			"content": "The vanilla prototype boots \\~55 ms faster on a warm Bun runtime but loses on every other axis that matters past the spike: ergonomics for the four downstream slices, the streaming event view in UH-44, and the dependency tree we will ship into the `uh` CLI subcommand. Both prototypes are well inside the 500 ms budget, so boot time is not a tiebreaker."
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Prototype"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "LOC (header + impl)"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Notes"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Vanilla"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "\\~155"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Imperative tree construction — `new BoxRenderable(...)` + `root.add(...)` per node. Quit path wires `renderer.keyInput.on(\"keypress\")` directly."
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Solid"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "\\~130"
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "Declarative JSX tree. `useKeyboard` hook + `createSignal(loadSandboxes())`. Same lifecycle ordering, fewer manual `add()` calls."
		},
		{
			"heading": "41-lines-of-code-same-screen-same-behaviour",
			"content": "LOC is similar today because the spike has four renderables. The gap widens with composition: every dashboard pane in UH-46 (three-pane layout) and every collapsible viewer in UH-47 adds \\~10 lines of vanilla wiring vs. \\~3 lines of Solid JSX."
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "UH-44's mission-run view consumes a live event stream from the adapter (`planned` → `running` → individual `stdout` chunks → `succeeded` / `failed` / `blocked`). Rendering this in vanilla requires:"
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "Mutating `select.options` (or an equivalent custom-renderable buffer)."
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "Calling `renderer.requestRender()` after each mutation."
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "Tracking what changed manually to avoid full re-renders of the visible list when only one row updated."
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "Solid removes all three:"
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "`For` reuses the existing renderables for unchanged rows, mounting only the new event's renderable. This is fine-grained reactivity — no virtual DOM diff, no full-tree walk per push."
		},
		{
			"heading": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "The same pattern composes into UH-46's \"live adapters\" pane and UH-43's \"live checks\" pane. Vanilla is doable; Solid is *trivial*."
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Median of 7 consecutive `bun bin/uh-tui-spike-{vanilla.ts|solid.tsx}` runs after Bun has cached its module graph (a `bun run` immediately prior to seed cache):"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Prototype"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Median"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Range (min–max)"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "First run (cold)"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Vanilla"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "295 ms"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "292–299 ms"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "586 ms"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Solid"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "350 ms"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "345–376 ms"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "583 ms (run 4 outlier in pre-cache batch)"
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "Both budgets include a 50 ms `setTimeout(quit, 50)` self-quit timer that's part of the spike's render-once-then-exit mode (set `UH_TUI_SPIKE_HOLD=1` to disable and inspect manually). True boot-to-first-frame is \\~245 ms (vanilla) vs \\~300 ms (Solid)."
		},
		{
			"heading": "43-boot-time-cold--warm",
			"content": "The 55 ms delta on warm runs is the Solid Babel transform load + the JSX-to-Solid-reconciler hop. Both are far under the 500 ms target. Cold runs (no Bun cache) take \\~580–600 ms for *both* prototypes — dominated by the `@opentui/core` native module load, not the framework. Caching is on by default in Bun."
		},
		{
			"heading": "44-ctrlc--sigint-cleanup",
			"content": "Identical for both prototypes; see §6 below. Both call `renderer.destroy()` explicitly on `q`, and rely on `exitOnCtrlC: true` + the default `exitSignals: [\"SIGINT\", \"SIGTERM\"]` for force-quit. Empirically verified: after exit the terminal is restored to main-screen, cursor visible, raw mode off, stdout passthrough, mouse + kitty kb disabled."
		},
		{
			"heading": "45-bun--macos-arm64-stability",
			"content": "`bun install` + `bun bin/uh-tui-spike-solid.tsx` + Ctrl+C, ten consecutive runs, no SIGSEGV, no `dyld` errors, no warnings. The prebuilt `@opentui/core-darwin-arm64@0.2.13` dylib loads cleanly under Bun 1.3.14 on M4 Pro."
		},
		{
			"heading": "45-bun--macos-arm64-stability",
			"content": "The Solid preload (`bunfig.toml` → `preload = [\"@opentui/solid/preload\"]`) registers a Bun plugin that runs Babel against any `.tsx` or `.jsx` import. The plugin's load filter (`/\\.(js|ts)x(?:[?#].*)?$/`) means plain `.ts` is untouched — `src/cli.ts`, `src/harness/*.ts`, and every `tests/**/*.ts` are unaffected. Vitest runs under Node (not Bun) so the preload is irrelevant there; `bun run test` confirmed 241/241 still green."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Path"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Purpose"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`bin/uh-tui-spike.tsx`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Winning prototype (Solid). Throwaway exploration, NOT wired into `src/cli.ts`."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`bunfig.toml`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Bun preload registering `@opentui/solid`'s Babel transform for `.tsx` files only."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`package.json`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Adds `@opentui/core`, `@opentui/solid`, `solid-js` to `dependencies`; adds `tui-spike` script."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`bun.lock`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Now tracked. Was previously gitignored; per Lalo's no-drift policy we commit it."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`tsconfig.tests.json`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "Includes `bin/**/*.ts` + `bin/**/*.tsx`; adds `jsx: \"preserve\"` + `jsxImportSource: \"@opentui/solid\"` so `bun run typecheck` covers the spike. The main `tsconfig.json` is unchanged — `bin/` stays out of `dist/`."
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "`docs/research/tui-framework.md`"
		},
		{
			"heading": "5-files-this-slice-landed",
			"content": "This file."
		},
		{
			"heading": "6-renderer-lifecycle--cleanup-ordering",
			"content": "The renderer's exit path is non-trivial enough that downstream slices need a contract, not folklore. The contract is what the v0.2.13 source guarantees today; if it changes upstream, UH-42 catches it during polish."
		},
		{
			"heading": "61-the-pipeline",
			"content": "`renderer.destroy()` is the **only** entry to terminal restoration. It guards against re-entry via `_isDestroyed`, then either:"
		},
		{
			"heading": "61-the-pipeline",
			"content": "**In-flight render**: calls `prepareDestroyDuringRender()` → `cleanupBeforeDestroy()` + `lib.suspendRenderer(rendererPtr)`. The actual finalization runs after the in-progress frame completes (`loop()` checks `_destroyPending` and calls `finalizeDestroy()` at the end of the frame)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "**Idle**: calls `finalizeDestroy()` directly."
		},
		{
			"heading": "61-the-pipeline",
			"content": "`cleanupBeforeDestroy()` runs **first**, in this exact order:"
		},
		{
			"heading": "61-the-pipeline",
			"content": "Removes process listeners: `SIGWINCH`, `uncaughtException`, `unhandledRejection`, `warning`, `beforeExit`."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Calls `removeExitListeners()` — detaches `SIGINT` + `SIGTERM` handlers."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Clears every timer (resize, capability, memory snapshot, render)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Sets `_isRunning = false`, `_useMouse = false`."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Removes the stdin `\"data\"` listener."
		},
		{
			"heading": "61-the-pipeline",
			"content": "**`stdin.setRawMode(false)`** — terminal returns to cooked mode here."
		},
		{
			"heading": "61-the-pipeline",
			"content": "`externalOutputMode = \"passthrough\"` — stdout/stderr stop being captured by the renderer's queue."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Flushes split-footer cache (no-op for our prototype; we use alternate-screen mode)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "`finalizeDestroy()` then runs:"
		},
		{
			"heading": "61-the-pipeline",
			"content": "Cleans up `_paletteDetector`, `_paletteCache`, `themeModeState`."
		},
		{
			"heading": "61-the-pipeline",
			"content": "**Emits the `\"destroy\"` event** (`renderer.on(\"destroy\", …)` listeners fire here, *after* terminal is restored to cooked mode — safe to `console.log` from inside)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "`root.destroyRecursively()` — walks the renderable tree, each node's `destroy()` fires."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Destroys `stdinParser`, `console`, clears `oscSubscribers`."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Resets split-footer scrollback to the top."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Restores `stdout.write` to the real fn (renderer was intercepting it for capture)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "**`lib.destroyRenderer(rendererPtr)`** — the Zig core restores the terminal: switches back to main-screen (`\\x1b[?1049l`), shows the cursor, disables kitty keyboard, disables mouse, resets background color (OSC 111)."
		},
		{
			"heading": "61-the-pipeline",
			"content": "Calls the user `_onDestroy()` callback last."
		},
		{
			"heading": "61-the-pipeline",
			"content": "The order matters: stdin is cooked **before** the destroy event fires (so user-land cleanup can safely interact with the terminal); the native Zig teardown runs **after** every TS-side cleanup so any final ANSI escapes the framework wants to emit are still ordered correctly relative to the user's stdout."
		},
		{
			"heading": "62-entry-points",
			"content": "Trigger"
		},
		{
			"heading": "62-entry-points",
			"content": "Path"
		},
		{
			"heading": "62-entry-points",
			"content": "**`q` keypress (our handler)**"
		},
		{
			"heading": "62-entry-points",
			"content": "`useKeyboard((e) => { if (e.name === \"q\") { renderer.destroy(); process.exit(0) } })` — destroy completes synchronously, then exit."
		},
		{
			"heading": "62-entry-points",
			"content": "**Ctrl+C (`exitOnCtrlC: true`)**"
		},
		{
			"heading": "62-entry-points",
			"content": "The internal keypress listener matches `{ name: \"c\", ctrl: true }` and schedules `destroy()` via `process.nextTick()` (so the keypress listener returns first)."
		},
		{
			"heading": "62-entry-points",
			"content": "**SIGINT / SIGTERM (default `exitSignals`)**"
		},
		{
			"heading": "62-entry-points",
			"content": "`addExitListeners()` registers `exitHandler = () => this.destroy()` on each signal. `kill -INT $PID` from another shell exits cleanly."
		},
		{
			"heading": "62-entry-points",
			"content": "**Natural process exit** (event loop drains)"
		},
		{
			"heading": "62-entry-points",
			"content": "`beforeExit` listener calls `exitHandler` → `destroy()`. Catches `return` from `main` without an explicit `process.exit`."
		},
		{
			"heading": "62-entry-points",
			"content": "**Uncaught exception / unhandled rejection**"
		},
		{
			"heading": "62-entry-points",
			"content": "`handleError` is wired to both `uncaughtException` and `unhandledRejection`. It logs the error, calls `destroy()`, then `process.exit(1)`."
		},
		{
			"heading": "63-pitfall-the-spike-caught",
			"content": "`process.exit(0)` does **not** fire the `beforeExit` event. If you call it without first calling `renderer.destroy()`, the terminal stays in raw mode and the alt-screen is never exited. The spike's `quit()` helper explicitly orders `renderer.destroy()` first, then `process.exit(0)`. Downstream slices MUST follow the same ordering when they need explicit exit (e.g. `q` to quit, error paths, \"save & quit\" flows). The `useKeyboard` hook does not auto-destroy on its own."
		},
		{
			"heading": "63-pitfall-the-spike-caught",
			"content": "This is documented in both `bin/uh-tui-spike.tsx` and the rejected `bin/uh-tui-spike-vanilla.ts` (commit `8adf04b`) as comments above the `quit()` function so it survives the deletion of this spike."
		},
		{
			"heading": "64-solids-useterminaldimensions--oncleanup",
			"content": "`useTerminalDimensions()` subscribes to `CliRenderEvents.RESIZE` and returns a Solid `Accessor<{ width, height }>` that updates without re-rendering the whole tree. UH-46's three-pane layout uses this to react to terminal resizes without restarting the renderer."
		},
		{
			"heading": "64-solids-useterminaldimensions--oncleanup",
			"content": "Solid's `onCleanup(...)` runs **per-component** when the component unmounts. It does NOT fire on `renderer.destroy()` by itself; the renderer destroys the renderable tree via `root.destroyRecursively()`, and Solid's reconciler's `onCleanup` hooks fire as each renderable's `destroy()` is called. Order is: child → parent (post-order). Downstream slices that need \"renderer-wide\" cleanup (e.g. closing a websocket the dashboard opened) should listen on `renderer.on(\"destroy\", …)` instead of relying on a top-level `onCleanup`."
		},
		{
			"heading": "7-opentui-agent-skill",
			"content": "Installed via:"
		},
		{
			"heading": "7-opentui-agent-skill",
			"content": "The skill is non-interactive and lands in `~/.agents/skills/opentui/` plus a symlink at `~/.claude/skills/opentui/`. Subagents in this repo pick it up automatically — the `find-skills` skill enumerates it and the description matches on \"OpenTUI\", \"Solid\", \"React\", \"renderer\", \"keymap\", \"components\". Confirmed by `ls ~/.claude/skills/`."
		},
		{
			"heading": "7-opentui-agent-skill",
			"content": "The skill ships canonical docs under `~/.agents/skills/opentui/docs/**/*.mdx` keyed by intent (getting-started, core/renderer, audio, keymap, bindings/solid, bindings/react, components, layout, keyboard, plugins, reference/env-vars). Downstream slices SHOULD reach for it before reverse-engineering from `node_modules`."
		},
		{
			"heading": "7-opentui-agent-skill",
			"content": "Installation is global and idempotent. No per-repo state. Not added to the repo's `.gitignore` because nothing in the repo changes."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**Cold-cache boot is dominated by the native dylib load (\\~580 ms), not the framework.** Bun caches transformed JS aggressively, so warm boots are 2x faster. The 500 ms target is met on warm runs only; first-run-after-`bun install` will spend \\~600 ms loading the Zig core. Acceptable for an interactive tool that stays open; flag for UH-42 if we ever want to short-circuit `uh tui --help` to skip the renderer entirely."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**The Solid preload is a process-wide Bun plugin.** It registers via `Bun.plugin(...)` inside the `preload` script — once installed for the process, it transforms every `.tsx` / `.jsx` import in that process. Vitest runs under Node, so it never sees the plugin. If a future slice introduces a Bun-run test for the TUI, the preload will be active there too — expected and desired."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**Babel transform is opt-in via filename.** Only `.tsx` / `.jsx` files go through Babel. Plain `.ts` files (every existing UH source file) are untouched. This means `bin/uh-tui-spike.tsx` is the only file with JSX in the repo today; if downstream slices add more TUI code they MUST use `.tsx` for it to compile."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**`tsc` cannot transform JSX with `jsxImportSource`.** We set `jsx: \"preserve\"` in `tsconfig.tests.json` — tsc validates the JSX shape (catches type errors) but emits `.tsx` as-is. Bun then runs Babel at module load. This split is deliberate: no separate build step, no two-stage compilation, but typecheck still catches mistakes."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**`renderer.destroy()` is NOT idempotent across instances.** It IS idempotent on the same instance (`_isDestroyed` guard). But there is only ever one CliRenderer per process — `createCliRenderer` should not be called twice. UH-46's three-pane layout uses one renderer with three `Box` children, not three renderers."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**`solid-js` peerDep mismatch warning at install time.** `@opentui/solid` declares `peerDependencies.solid-js: \"1.9.12\"` (exact) but resolves to 1.9.13 in our tree. Bun prints `warn: incorrect peer dependency \"solid-js@1.9.13\"` and proceeds. Empirically works; the API surface we use (`createSignal`, `onCleanup`) is stable across 1.9.x patches. If a future patch breaks the Solid reconciler shape, pin `solid-js@1.9.12` exactly."
		},
		{
			"heading": "8-known-gotchas",
			"content": "**`@opentui/core` is at 0.x.** Surface-level breaking changes between 0.2.x releases are possible. Pin to `^0.2.13` (caret) so we get patch fixes but stay on the same minor; upgrade explicitly in a follow-up if the upstream goes 0.3."
		},
		{
			"heading": "9-acceptance-for-downstream-slices",
			"content": "**UH-46 (dashboard)** consumes the framework decision: build the three-pane layout with `<box flexDirection=\"row\">` + three `<box flexGrow={1}>` children, each with its own list/state. Reuse the `useKeyboard` pattern for global keys (`d` to focus dashboard, `m` for missions, `s` for sandboxes)."
		},
		{
			"heading": "9-acceptance-for-downstream-slices",
			"content": "**UH-47 (mission browser)** uses `code` and `diff` renderables directly via Solid JSX — both exposed through `@opentui/solid`'s intrinsic elements (`code`, `diff`, `line_number`). Tree-sitter syntax highlighting is wired via `@opentui/core`'s `parser.worker.js` worker; UH-47 needs to verify the worker path is resolvable when packaged."
		},
		{
			"heading": "9-acceptance-for-downstream-slices",
			"content": "**UH-44 (mission run flow)** consumes the streaming pattern in §4.2. The adapter's existing per-event push (`runtime-session.yaml` line emitter) becomes `setEvents(prev => [...prev, ev])`. The `For` element handles incremental rendering."
		},
		{
			"heading": "9-acceptance-for-downstream-slices",
			"content": "**UH-43 (adapter + sandbox manager)** consumes `useKeyboard` for the `c` (create), `d` (discard), `r` (recheck) commands and `input` + `select` for the new-sandbox form."
		},
		{
			"heading": "9-acceptance-for-downstream-slices",
			"content": "**UH-42 (polish)** owns: keymap overlay (the `@opentui/keymap` workspace package referenced in the OpenTUI repo isn't on npm yet — file an upstream issue if still missing by the time UH-42 starts; otherwise build a one-off overlay), theming (palette detection via `renderer.getPalette()` — already wired in `cleanupBeforeDestroy()` so light/dark detection is free), error states (lean on `handleError`'s automatic destroy + log path), exit handling (already complete here), Agent Skill install verification (done — §7)."
		},
		{
			"heading": "10-verification-receipts",
			"content": "All five acceptance gates clean. PR can move to draft."
		}
	],
	"headings": [
		{
			"id": "1-environment",
			"content": "1\\. Environment"
		},
		{
			"id": "2-frameworks-evaluated",
			"content": "2\\. Frameworks evaluated"
		},
		{
			"id": "3-decision",
			"content": "3\\. Decision"
		},
		{
			"id": "4-comparison",
			"content": "4\\. Comparison"
		},
		{
			"id": "41-lines-of-code-same-screen-same-behaviour",
			"content": "4.1 Lines of code (same screen, same behaviour)"
		},
		{
			"id": "42-reactivity-for-streaming-event-lists-uh-44",
			"content": "4.2 Reactivity for streaming event lists (UH-44)"
		},
		{
			"id": "43-boot-time-cold--warm",
			"content": "4.3 Boot time (cold + warm)"
		},
		{
			"id": "44-ctrlc--sigint-cleanup",
			"content": "4.4 Ctrl+C / SIGINT cleanup"
		},
		{
			"id": "45-bun--macos-arm64-stability",
			"content": "4.5 Bun + macOS arm64 stability"
		},
		{
			"id": "5-files-this-slice-landed",
			"content": "5\\. Files this slice landed"
		},
		{
			"id": "6-renderer-lifecycle--cleanup-ordering",
			"content": "6\\. Renderer lifecycle — cleanup ordering"
		},
		{
			"id": "61-the-pipeline",
			"content": "6.1 The pipeline"
		},
		{
			"id": "62-entry-points",
			"content": "6.2 Entry points"
		},
		{
			"id": "63-pitfall-the-spike-caught",
			"content": "6.3 Pitfall the spike caught"
		},
		{
			"id": "64-solids-useterminaldimensions--oncleanup",
			"content": "6.4 Solid's `useTerminalDimensions` + `onCleanup`"
		},
		{
			"id": "7-opentui-agent-skill",
			"content": "7\\. OpenTUI Agent Skill"
		},
		{
			"id": "8-known-gotchas",
			"content": "8\\. Known gotchas"
		},
		{
			"id": "9-acceptance-for-downstream-slices",
			"content": "9\\. Acceptance for downstream slices"
		},
		{
			"id": "10-verification-receipts",
			"content": "10\\. Verification receipts"
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
		url: "#2-frameworks-evaluated",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "2. Frameworks evaluated" })
	},
	{
		depth: 2,
		url: "#3-decision",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "3. Decision" })
	},
	{
		depth: 2,
		url: "#4-comparison",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4. Comparison" })
	},
	{
		depth: 3,
		url: "#41-lines-of-code-same-screen-same-behaviour",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4.1 Lines of code (same screen, same behaviour)" })
	},
	{
		depth: 3,
		url: "#42-reactivity-for-streaming-event-lists-uh-44",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4.2 Reactivity for streaming event lists (UH-44)" })
	},
	{
		depth: 3,
		url: "#43-boot-time-cold--warm",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4.3 Boot time (cold + warm)" })
	},
	{
		depth: 3,
		url: "#44-ctrlc--sigint-cleanup",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4.4 Ctrl+C / SIGINT cleanup" })
	},
	{
		depth: 3,
		url: "#45-bun--macos-arm64-stability",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "4.5 Bun + macOS arm64 stability" })
	},
	{
		depth: 2,
		url: "#5-files-this-slice-landed",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "5. Files this slice landed" })
	},
	{
		depth: 2,
		url: "#6-renderer-lifecycle--cleanup-ordering",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6. Renderer lifecycle — cleanup ordering" })
	},
	{
		depth: 3,
		url: "#61-the-pipeline",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6.1 The pipeline" })
	},
	{
		depth: 3,
		url: "#62-entry-points",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6.2 Entry points" })
	},
	{
		depth: 3,
		url: "#63-pitfall-the-spike-caught",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "6.3 Pitfall the spike caught" })
	},
	{
		depth: 3,
		url: "#64-solids-useterminaldimensions--oncleanup",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			"6.4 Solid's ",
			(0, import_jsx_runtime.jsx)("code", { children: "useTerminalDimensions" }),
			" + ",
			(0, import_jsx_runtime.jsx)("code", { children: "onCleanup" })
		] })
	},
	{
		depth: 2,
		url: "#7-opentui-agent-skill",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "7. OpenTUI Agent Skill" })
	},
	{
		depth: 2,
		url: "#8-known-gotchas",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "8. Known gotchas" })
	},
	{
		depth: 2,
		url: "#9-acceptance-for-downstream-slices",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "9. Acceptance for downstream slices" })
	},
	{
		depth: 2,
		url: "#10-verification-receipts",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "10. Verification receipts" })
	}
];
function _createMdxContent(props) {
	const _components = {
		a: "a",
		blockquote: "blockquote",
		code: "code",
		del: "del",
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
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Closes the discovery phase of ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-41",
				children: "UH-41"
			}),
			". Findings feed:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-46",
				children: "UH-46"
			}), " — Dashboard: live adapters + missions + sandboxes (three-pane)."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.a, {
					href: "https://linear.app/agentic-eng/issue/UH-47",
					children: "UH-47"
				}),
				" — Mission browser: drilldown with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Code" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Diff" }),
				" viewers."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-44",
				children: "UH-44"
			}), " — Mission run flow: trigger from TUI, stream events live."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-43",
				children: "UH-43"
			}), " — Adapter + sandbox manager: live checks, create/discard inline."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.a, {
				href: "https://linear.app/agentic-eng/issue/UH-42",
				children: "UH-42"
			}), " — Polish: keymap overlay, theming, error states, Agent Skill install."] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.blockquote, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.p, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Scope:" }),
				" exploratory prototype. The shipped prototype at ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike.tsx" }),
				" is not wired into ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/cli.ts" }),
				" and is not invoked by the test suite. Downstream slices consume the framework decision + lifecycle invariants, not this file."
			] }),
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
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Workstation: macOS 25.4.0, Apple M4 Pro (arm64)." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Bun ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "1.3.14" }),
				" (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "/opt/homebrew/bin/bun" }),
				"); Node 24.15.0 available but unused by the spike."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"TypeScript 6.0.3, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "vitest@4.1.6" }),
				" (unchanged)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"OpenTUI ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "0.2.13" }),
				" — current ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "latest" }),
				" (published 2026-05-17, day-of). Native prebuilt ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core-darwin-arm64@0.2.13" }),
				" (1.68 MB unpacked) loads via the parent package's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "optionalDependencies" }),
				" block — no source build, no manual ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "xcode-select" }),
				", no Zig toolchain required."
			] }),
			"\n"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ bun install" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ @opentui/core@0.2.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ @opentui/solid@0.2.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ solid-js@1.9.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "99 packages installed [1.51s]" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"No native-module load errors on macOS arm64. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "node_modules/@opentui/core-darwin-arm64/libopentui.dylib" }),
			" (the Zig core) loads via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun-ffi-structs" }),
			" (also a runtime dep of ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
			") on first import."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "2-frameworks-evaluated",
			children: "2. Frameworks evaluated"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Framework" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Version" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Why considered" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "0.2.13" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "The native binding itself; lowest layer, no abstraction tax." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "0.2.13" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Solid's fine-grained reactivity (",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "createSignal" }),
					", ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "createMemo" }),
					") was the lead bet for the streaming ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "mission run" }),
					" view (UH-44)."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.del, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/react" }) }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "0.2.13" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Skipped." }), " Same JSX ergonomics story as Solid but pays virtual-DOM diff cost on every event. UH-44's event stream is the hot path; trading off Solid's fine-grained model to gain… nothing else UH wants (no Suspense, no concurrent rendering, no ecosystem libraries we plan to consume) was not defensible. Solid is the only contender at this layer."] })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Two prototypes were built at commit ",
			(0, import_jsx_runtime.jsx)(_components.a, {
				href: "../../bin/uh-tui-spike-vanilla.ts",
				children: (0, import_jsx_runtime.jsx)(_components.code, { children: "8adf04b" })
			}),
			" (see git history — ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "git show 8adf04b -- bin/" }),
			"):"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike-vanilla.ts" }),
				" — raw ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
				", imperative ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "BoxRenderable" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SelectRenderable" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "TextRenderable" }),
				" construction."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike-solid.tsx" }),
				" — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
				" JSX with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createSignal" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useRenderer" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Both render the ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "same screen" }),
			": a bordered ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Box" }),
			" titled \"uh tui spike\", a one-line summary of ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/sandboxes/index.yaml" }),
			" (\"",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "sandboxes loaded from … (0)" }),
			"\"), a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "Select" }),
			" listing each sandbox with a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "● dirty" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "○ clean" }),
			" badge (or a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "(no sandboxes)" }),
			" placeholder when the index is empty), and a one-line footer with the keymap."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "3-decision",
			children: "3. Decision"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: (0, import_jsx_runtime.jsxs)(_components.strong, { children: [
			"Recommendation: ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
			" (with ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
			" as a transitive dep)."
		] }) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Shipping prototype at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike.tsx" }),
			". Run via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run tui-spike" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The vanilla prototype boots ~55 ms faster on a warm Bun runtime but loses on every other axis that matters past the spike: ergonomics for the four downstream slices, the streaming event view in UH-44, and the dependency tree we will ship into the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh" }),
			" CLI subcommand. Both prototypes are well inside the 500 ms budget, so boot time is not a tiebreaker."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "4-comparison",
			children: "4. Comparison"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "41-lines-of-code-same-screen-same-behaviour",
			children: "4.1 Lines of code (same screen, same behaviour)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Prototype" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "LOC (header + impl)" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Notes" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.td, { children: "Vanilla" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "~155" }),
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Imperative tree construction — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "new BoxRenderable(...)" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "root.add(...)" }),
				" per node. Quit path wires ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.keyInput.on(\"keypress\")" }),
				" directly."
			] })
		] }), (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.td, { children: "Solid" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "~130" }),
			(0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Declarative JSX tree. ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard" }),
				" hook + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createSignal(loadSandboxes())" }),
				". Same lifecycle ordering, fewer manual ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "add()" }),
				" calls."
			] })
		] })] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "LOC is similar today because the spike has four renderables. The gap widens with composition: every dashboard pane in UH-46 (three-pane layout) and every collapsible viewer in UH-47 adds ~10 lines of vanilla wiring vs. ~3 lines of Solid JSX." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "42-reactivity-for-streaming-event-lists-uh-44",
			children: "4.2 Reactivity for streaming event lists (UH-44)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"UH-44's mission-run view consumes a live event stream from the adapter (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "planned" }),
			" → ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "running" }),
			" → individual ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "stdout" }),
			" chunks → ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "succeeded" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "failed" }),
			" / ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "blocked" }),
			"). Rendering this in vanilla requires:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Mutating ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "select.options" }),
				" (or an equivalent custom-renderable buffer)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Calling ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.requestRender()" }),
				" after each mutation."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Tracking what changed manually to avoid full re-renders of the visible list when only one row updated." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Solid removes all three:" }),
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
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "const"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: " ["
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "events"
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
							children: "setEvents"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "] "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "="
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: " createSignal"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "<"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "RunEvent"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "[]>([])"
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
						children: "// adapter pushes:"
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
							children: "setEvents"
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
								"--shiki-light": "#E36209",
								"--shiki-dark": "#FFAB70"
							},
							children: "prev"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: " =>"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: " ["
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "..."
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "prev, ev])"
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
						children: "// JSX:"
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
							children: "<"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "For"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: " each"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "="
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#6F42C1",
								"--shiki-dark": "#B392F0"
							},
							children: "events"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "()}>{("
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#E36209",
								"--shiki-dark": "#FFAB70"
							},
							children: "ev"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ") "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "=>"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: " `text`"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "{ev.line}"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: "</"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "text"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#D73A49",
								"--shiki-dark": "#F97583"
							},
							children: ">"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "}</"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#005CC5",
								"--shiki-dark": "#79B8FF"
							},
							children: "For"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ">"
						})
					]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "For" }), " reuses the existing renderables for unchanged rows, mounting only the new event's renderable. This is fine-grained reactivity — no virtual DOM diff, no full-tree walk per push."] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The same pattern composes into UH-46's \"live adapters\" pane and UH-43's \"live checks\" pane. Vanilla is doable; Solid is ",
			(0, import_jsx_runtime.jsx)(_components.em, { children: "trivial" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "43-boot-time-cold--warm",
			children: "4.3 Boot time (cold + warm)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Median of 7 consecutive ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun bin/uh-tui-spike-{vanilla.ts|solid.tsx}" }),
			" runs after Bun has cached its module graph (a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run" }),
			" immediately prior to seed cache):"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Prototype" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Median" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Range (min–max)" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "First run (cold)" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.td, { children: "Vanilla" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "295 ms" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "292–299 ms" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "586 ms" })
		] }), (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.td, { children: "Solid" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "350 ms" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "345–376 ms" }),
			(0, import_jsx_runtime.jsx)(_components.td, { children: "583 ms (run 4 outlier in pre-cache batch)" })
		] })] })] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Both budgets include a 50 ms ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "setTimeout(quit, 50)" }),
			" self-quit timer that's part of the spike's render-once-then-exit mode (set ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "UH_TUI_SPIKE_HOLD=1" }),
			" to disable and inspect manually). True boot-to-first-frame is ~245 ms (vanilla) vs ~300 ms (Solid)."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The 55 ms delta on warm runs is the Solid Babel transform load + the JSX-to-Solid-reconciler hop. Both are far under the 500 ms target. Cold runs (no Bun cache) take ~580–600 ms for ",
			(0, import_jsx_runtime.jsx)(_components.em, { children: "both" }),
			" prototypes — dominated by the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
			" native module load, not the framework. Caching is on by default in Bun."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "44-ctrlc--sigint-cleanup",
			children: "4.4 Ctrl+C / SIGINT cleanup"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Identical for both prototypes; see §6 below. Both call ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
			" explicitly on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "q" }),
			", and rely on ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "exitOnCtrlC: true" }),
			" + the default ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "exitSignals: [\"SIGINT\", \"SIGTERM\"]" }),
			" for force-quit. Empirically verified: after exit the terminal is restored to main-screen, cursor visible, raw mode off, stdout passthrough, mouse + kitty kb disabled."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "45-bun--macos-arm64-stability",
			children: "4.5 Bun + macOS arm64 stability"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun install" }),
			" + ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun bin/uh-tui-spike-solid.tsx" }),
			" + Ctrl+C, ten consecutive runs, no SIGSEGV, no ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "dyld" }),
			" errors, no warnings. The prebuilt ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core-darwin-arm64@0.2.13" }),
			" dylib loads cleanly under Bun 1.3.14 on M4 Pro."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The Solid preload (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bunfig.toml" }),
			" → ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "preload = [\"@opentui/solid/preload\"]" }),
			") registers a Bun plugin that runs Babel against any ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
			" or ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".jsx" }),
			" import. The plugin's load filter (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "/\\.(js|ts)x(?:[?#].*)?$/" }),
			") means plain ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".ts" }),
			" is untouched — ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "src/cli.ts" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "src/harness/*.ts" }),
			", and every ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "tests/**/*.ts" }),
			" are unaffected. Vitest runs under Node (not Bun) so the preload is irrelevant there; ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run test" }),
			" confirmed 241/241 still green."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "5-files-this-slice-landed",
			children: "5. Files this slice landed"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Path" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Purpose" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike.tsx" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Winning prototype (Solid). Throwaway exploration, NOT wired into ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "src/cli.ts" }),
				"."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "bunfig.toml" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Bun preload registering ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
				"'s Babel transform for ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
				" files only."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "package.json" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Adds ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "solid-js" }),
				" to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dependencies" }),
				"; adds ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "tui-spike" }),
				" script."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "bun.lock" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "Now tracked. Was previously gitignored; per Lalo's no-drift policy we commit it." })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "tsconfig.tests.json" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"Includes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/**/*.ts" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/**/*.tsx" }),
				"; adds ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "jsx: \"preserve\"" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "jsxImportSource: \"@opentui/solid\"" }),
				" so ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bun run typecheck" }),
				" covers the spike. The main ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "tsconfig.json" }),
				" is unchanged — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/" }),
				" stays out of ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dist/" }),
				"."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "docs/research/tui-framework.md" }) }), (0, import_jsx_runtime.jsx)(_components.td, { children: "This file." })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "6-renderer-lifecycle--cleanup-ordering",
			children: "6. Renderer lifecycle — cleanup ordering"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The renderer's exit path is non-trivial enough that downstream slices need a contract, not folklore. The contract is what the v0.2.13 source guarantees today; if it changes upstream, UH-42 catches it during polish." }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "61-the-pipeline",
			children: "6.1 The pipeline"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
			" is the ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "only" }),
			" entry to terminal restoration. It guards against re-entry via ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "_isDestroyed" }),
			", then either:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "In-flight render" }),
				": calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "prepareDestroyDuringRender()" }),
				" → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "cleanupBeforeDestroy()" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "lib.suspendRenderer(rendererPtr)" }),
				". The actual finalization runs after the in-progress frame completes (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "loop()" }),
				" checks ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_destroyPending" }),
				" and calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "finalizeDestroy()" }),
				" at the end of the frame)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Idle" }),
				": calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "finalizeDestroy()" }),
				" directly."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "cleanupBeforeDestroy()" }),
			" runs ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "first" }),
			", in this exact order:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Removes process listeners: ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SIGWINCH" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uncaughtException" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "unhandledRejection" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "warning" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "beforeExit" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "removeExitListeners()" }),
				" — detaches ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SIGINT" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SIGTERM" }),
				" handlers."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Clears every timer (resize, capability, memory snapshot, render)." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Sets ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_isRunning = false" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_useMouse = false" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Removes the stdin ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\"data\"" }),
				" listener."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "stdin.setRawMode(false)" }) }), " — terminal returns to cooked mode here."] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "externalOutputMode = \"passthrough\"" }), " — stdout/stderr stop being captured by the renderer's queue."] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Flushes split-footer cache (no-op for our prototype; we use alternate-screen mode)." }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "finalizeDestroy()" }), " then runs:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Cleans up ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_paletteDetector" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_paletteCache" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "themeModeState" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					"Emits the ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "\"destroy\"" }),
					" event"
				] }),
				" (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.on(\"destroy\", …)" }),
				" listeners fire here, ",
				(0, import_jsx_runtime.jsx)(_components.em, { children: "after" }),
				" terminal is restored to cooked mode — safe to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "console.log" }),
				" from inside)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "root.destroyRecursively()" }),
				" — walks the renderable tree, each node's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				" fires."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Destroys ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "stdinParser" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "console" }),
				", clears ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "oscSubscribers" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Resets split-footer scrollback to the top." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Restores ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "stdout.write" }),
				" to the real fn (renderer was intercepting it for capture)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "lib.destroyRenderer(rendererPtr)" }) }),
				" — the Zig core restores the terminal: switches back to main-screen (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "\\x1b[?1049l" }),
				"), shows the cursor, disables kitty keyboard, disables mouse, resets background color (OSC 111)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Calls the user ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_onDestroy()" }),
				" callback last."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The order matters: stdin is cooked ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "before" }),
			" the destroy event fires (so user-land cleanup can safely interact with the terminal); the native Zig teardown runs ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "after" }),
			" every TS-side cleanup so any final ANSI escapes the framework wants to emit are still ordered correctly relative to the user's stdout."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "62-entry-points",
			children: "6.2 Entry points"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.th, { children: "Trigger" }), (0, import_jsx_runtime.jsx)(_components.th, { children: "Path" })] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsxs)(_components.strong, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "q" }), " keypress (our handler)"] }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard((e) => { if (e.name === \"q\") { renderer.destroy(); process.exit(0) } })" }), " — destroy completes synchronously, then exit."] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsxs)(_components.strong, { children: [
				"Ctrl+C (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "exitOnCtrlC: true" }),
				")"
			] }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				"The internal keypress listener matches ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "{ name: \"c\", ctrl: true }" }),
				" and schedules ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				" via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "process.nextTick()" }),
				" (so the keypress listener returns first)."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsxs)(_components.strong, { children: [
				"SIGINT / SIGTERM (default ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "exitSignals" }),
				")"
			] }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "addExitListeners()" }),
				" registers ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "exitHandler = () => this.destroy()" }),
				" on each signal. ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "kill -INT $PID" }),
				" from another shell exits cleanly."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsxs)(_components.td, { children: [(0, import_jsx_runtime.jsx)(_components.strong, { children: "Natural process exit" }), " (event loop drains)"] }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "beforeExit" }),
				" listener calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "exitHandler" }),
				" → ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				". Catches ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "return" }),
				" from ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "main" }),
				" without an explicit ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "process.exit" }),
				"."
			] })] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.strong, { children: "Uncaught exception / unhandled rejection" }) }), (0, import_jsx_runtime.jsxs)(_components.td, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "handleError" }),
				" is wired to both ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uncaughtException" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "unhandledRejection" }),
				". It logs the error, calls ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				", then ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "process.exit(1)" }),
				"."
			] })] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "63-pitfall-the-spike-caught",
			children: "6.3 Pitfall the spike caught"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "process.exit(0)" }),
			" does ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "not" }),
			" fire the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "beforeExit" }),
			" event. If you call it without first calling ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
			", the terminal stays in raw mode and the alt-screen is never exited. The spike's ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "quit()" }),
			" helper explicitly orders ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
			" first, then ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "process.exit(0)" }),
			". Downstream slices MUST follow the same ordering when they need explicit exit (e.g. ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "q" }),
			" to quit, error paths, \"save & quit\" flows). The ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard" }),
			" hook does not auto-destroy on its own."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This is documented in both ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike.tsx" }),
			" and the rejected ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike-vanilla.ts" }),
			" (commit ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "8adf04b" }),
			") as comments above the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "quit()" }),
			" function so it survives the deletion of this spike."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h3, {
			id: "64-solids-useterminaldimensions--oncleanup",
			children: [
				"6.4 Solid's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useTerminalDimensions" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup" })
			]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useTerminalDimensions()" }),
				" subscribes to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "CliRenderEvents.RESIZE" }),
				" and returns a Solid ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Accessor<{ width, height }>" }),
				" that updates without re-rendering the whole tree. UH-46's three-pane layout uses this to react to terminal resizes without restarting the renderer."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Solid's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup(...)" }),
				" runs ",
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "per-component" }),
				" when the component unmounts. It does NOT fire on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }),
				" by itself; the renderer destroys the renderable tree via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "root.destroyRecursively()" }),
				", and Solid's reconciler's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup" }),
				" hooks fire as each renderable's ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "destroy()" }),
				" is called. Order is: child → parent (post-order). Downstream slices that need \"renderer-wide\" cleanup (e.g. closing a websocket the dashboard opened) should listen on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.on(\"destroy\", …)" }),
				" instead of relying on a top-level ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup" }),
				"."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "7-opentui-agent-skill",
			children: "7. OpenTUI Agent Skill"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Installed via:" }),
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ npx skills add anomalyco/opentui --skill opentui -g" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "✓ ~/.agents/skills/opentui" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  universal: Amp, Antigravity, Cline, Codex, Cursor +8 more" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  symlinked: Claude Code" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The skill is non-interactive and lands in ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.agents/skills/opentui/" }),
			" plus a symlink at ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.claude/skills/opentui/" }),
			". Subagents in this repo pick it up automatically — the ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "find-skills" }),
			" skill enumerates it and the description matches on \"OpenTUI\", \"Solid\", \"React\", \"renderer\", \"keymap\", \"components\". Confirmed by ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "ls ~/.claude/skills/" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The skill ships canonical docs under ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "~/.agents/skills/opentui/docs/**/*.mdx" }),
			" keyed by intent (getting-started, core/renderer, audio, keymap, bindings/solid, bindings/react, components, layout, keyboard, plugins, reference/env-vars). Downstream slices SHOULD reach for it before reverse-engineering from ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "node_modules" }),
			"."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Installation is global and idempotent. No per-repo state. Not added to the repo's ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".gitignore" }),
			" because nothing in the repo changes."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "8-known-gotchas",
			children: "8. Known gotchas"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Cold-cache boot is dominated by the native dylib load (~580 ms), not the framework." }),
				" Bun caches transformed JS aggressively, so warm boots are 2x faster. The 500 ms target is met on warm runs only; first-run-after-",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bun install" }),
				" will spend ~600 ms loading the Zig core. Acceptable for an interactive tool that stays open; flag for UH-42 if we ever want to short-circuit ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh tui --help" }),
				" to skip the renderer entirely."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "The Solid preload is a process-wide Bun plugin." }),
				" It registers via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Bun.plugin(...)" }),
				" inside the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "preload" }),
				" script — once installed for the process, it transforms every ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".jsx" }),
				" import in that process. Vitest runs under Node, so it never sees the plugin. If a future slice introduces a Bun-run test for the TUI, the preload will be active there too — expected and desired."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Babel transform is opt-in via filename." }),
				" Only ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
				" / ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".jsx" }),
				" files go through Babel. Plain ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".ts" }),
				" files (every existing UH source file) are untouched. This means ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "bin/uh-tui-spike.tsx" }),
				" is the only file with JSX in the repo today; if downstream slices add more TUI code they MUST use ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
				" for it to compile."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [
					(0, import_jsx_runtime.jsx)(_components.code, { children: "tsc" }),
					" cannot transform JSX with ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "jsxImportSource" }),
					"."
				] }),
				" We set ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "jsx: \"preserve\"" }),
				" in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "tsconfig.tests.json" }),
				" — tsc validates the JSX shape (catches type errors) but emits ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".tsx" }),
				" as-is. Bun then runs Babel at module load. This split is deliberate: no separate build step, no two-stage compilation, but typecheck still catches mistakes."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.destroy()" }), " is NOT idempotent across instances."] }),
				" It IS idempotent on the same instance (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "_isDestroyed" }),
				" guard). But there is only ever one CliRenderer per process — ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createCliRenderer" }),
				" should not be called twice. UH-46's three-pane layout uses one renderer with three ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "Box" }),
				" children, not three renderers."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "solid-js" }), " peerDep mismatch warning at install time."] }),
				" ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
				" declares ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "peerDependencies.solid-js: \"1.9.12\"" }),
				" (exact) but resolves to 1.9.13 in our tree. Bun prints ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "warn: incorrect peer dependency \"solid-js@1.9.13\"" }),
				" and proceeds. Empirically works; the API surface we use (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "createSignal" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "onCleanup" }),
				") is stable across 1.9.x patches. If a future patch breaks the Solid reconciler shape, pin ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "solid-js@1.9.12" }),
				" exactly."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsxs)(_components.strong, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }), " is at 0.x."] }),
				" Surface-level breaking changes between 0.2.x releases are possible. Pin to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "^0.2.13" }),
				" (caret) so we get patch fixes but stay on the same minor; upgrade explicitly in a follow-up if the upstream goes 0.3."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "9-acceptance-for-downstream-slices",
			children: "9. Acceptance for downstream slices"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-46 (dashboard)" }),
				" consumes the framework decision: build the three-pane layout with ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "<box flexDirection=\"row\">" }),
				" + three ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "<box flexGrow={1}>" }),
				" children, each with its own list/state. Reuse the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard" }),
				" pattern for global keys (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }),
				" to focus dashboard, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "m" }),
				" for missions, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "s" }),
				" for sandboxes)."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-47 (mission browser)" }),
				" uses ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "diff" }),
				" renderables directly via Solid JSX — both exposed through ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/solid" }),
				"'s intrinsic elements (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "code" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "diff" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "line_number" }),
				"). Tree-sitter syntax highlighting is wired via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/core" }),
				"'s ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "parser.worker.js" }),
				" worker; UH-47 needs to verify the worker path is resolvable when packaged."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-44 (mission run flow)" }),
				" consumes the streaming pattern in §4.2. The adapter's existing per-event push (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "runtime-session.yaml" }),
				" line emitter) becomes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "setEvents(prev => [...prev, ev])" }),
				". The ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "For" }),
				" element handles incremental rendering."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-43 (adapter + sandbox manager)" }),
				" consumes ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "useKeyboard" }),
				" for the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "c" }),
				" (create), ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "d" }),
				" (discard), ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "r" }),
				" (recheck) commands and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "input" }),
				" + ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "select" }),
				" for the new-sandbox form."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "UH-42 (polish)" }),
				" owns: keymap overlay (the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "@opentui/keymap" }),
				" workspace package referenced in the OpenTUI repo isn't on npm yet — file an upstream issue if still missing by the time UH-42 starts; otherwise build a one-off overlay), theming (palette detection via ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "renderer.getPalette()" }),
				" — already wired in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "cleanupBeforeDestroy()" }),
				" so light/dark detection is free), error states (lean on ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "handleError" }),
				"'s automatic destroy + log path), exit handling (already complete here), Agent Skill install verification (done — §7)."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "10-verification-receipts",
			children: "10. Verification receipts"
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
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ bun install" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ @opentui/core@0.2.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ @opentui/solid@0.2.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "+ solid-js@1.9.13" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "99 packages installed [1.51s]" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ bun run typecheck" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ tsc -p tsconfig.tests.json --noEmit" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "(no errors)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ bun run build" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ tsc -p tsconfig.json" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "(no errors)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ bun run test" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: " Test Files  17 passed (17)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "      Tests  241 passed (241)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "   Duration  5.04s" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "$ time bun run tui-spike" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "(7 consecutive runs, warm Bun cache)" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "run 1: 0.350s    run 5: 0.346s" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "run 2: 0.349s    run 6: 0.345s" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "run 3: 0.376s    run 7: 0.356s" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "run 4: 0.356s    median: 0.350s" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "All five acceptance gates clean. PR can move to draft." })
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
export { tui_framework_exports as a, toc as i, frontmatter as n, structuredData as r, MDXContent as t };
