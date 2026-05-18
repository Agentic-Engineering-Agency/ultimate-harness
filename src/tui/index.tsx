/**
 * UH-46 — Bun entry point for `uh tui`.
 *
 * Loaded by `bun --preload @opentui/solid/preload <this file>` from
 * `src/cli.ts`. The preload registers the Babel JSX transform so the
 * `.tsx` files compile at module load.
 *
 * Adapter modules are imported for their `runtimeRegistry.register(...)`
 * side effects — the dashboard's on-focus-row check (Q5) calls into the
 * registry, so checkers must be registered before the user can select
 * an adapter row. Same pattern as `src/cli.ts`.
 */
import { render } from "@opentui/solid";
import { Dashboard } from "./dashboard.js";

// Side-effect imports — adapter modules self-register checkers.
import "../adapters/hermes.js";
import "../adapters/codex.js";
import "../adapters/oh-my-pi.js";
import "../adapters/hermes-proxy.js";

const rootEnv = process.env.UH_TUI_ROOT;
const rootArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const root = rootEnv ?? rootArg ?? process.cwd();
const once = process.argv.includes("--once") || process.env.UH_TUI_ONCE === "1";

render(() => <Dashboard root={root} once={once} />, {
  exitOnCtrlC: true,
  clearOnShutdown: true,
  targetFps: 30,
  consoleMode: "disabled",
}).catch((err: unknown) => {
  process.stderr.write(`uh tui: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
