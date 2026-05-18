#!/usr/bin/env bun
/**
 * UH-45 spike — VANILLA @opentui/core prototype.
 *
 * Throwaway exploration. Boots a CliRenderer, reads
 * `.harness/sandboxes/index.yaml`, renders the sandbox list in a Box +
 * SelectRenderable, supports `q` to quit and Ctrl+C to force-quit, then exits
 * with the terminal restored.
 *
 * Not wired into `src/cli.ts`. Run via `bun run tui-spike`.
 *
 * See `docs/research/tui-framework.md` for the framework comparison this
 * file participates in.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  BoxRenderable,
  SelectRenderable,
  TextRenderable,
  createCliRenderer,
  type SelectOption,
} from "@opentui/core";

interface SandboxEntry {
  id: string;
  mission_id: string;
  backend: string;
  status: string;
  path?: string;
}

interface SandboxesIndex {
  schema_version: string;
  sandboxes: SandboxEntry[];
}

const HARNESS_INDEX = path.resolve(
  process.cwd(),
  ".harness/sandboxes/index.yaml",
);

function loadSandboxes(): SandboxEntry[] {
  try {
    const raw = readFileSync(HARNESS_INDEX, "utf8");
    const doc = parseYaml(raw) as SandboxesIndex | null;
    return doc?.sandboxes ?? [];
  } catch (err) {
    process.stderr.write(
      `uh-tui-spike: could not read ${HARNESS_INDEX}: ${(err as Error).message}\n`,
    );
    return [];
  }
}

function toOptions(entries: SandboxEntry[]): SelectOption[] {
  if (entries.length === 0) {
    return [
      {
        name: "(no sandboxes)",
        description: "Run `uh sandbox create` to seed one.",
      },
    ];
  }
  return entries.map((e) => {
    const dirty = e.status === "dirty";
    const badge = dirty ? "● dirty" : "○ clean";
    return {
      name: `${e.id}  ${badge}`,
      description: `mission=${e.mission_id}  backend=${e.backend}  status=${e.status}`,
      value: e,
    };
  });
}

async function main() {
  // exitOnCtrlC + clearOnShutdown handle Ctrl+C and screen restoration
  // automatically; the explicit destroy() in `quit` covers the `q` path.
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    clearOnShutdown: true,
    targetFps: 30,
    consoleMode: "disabled",
  });

  const entries = loadSandboxes();

  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    padding: 1,
    width: "100%",
    height: "100%",
    border: true,
    borderStyle: "rounded",
    title: " uh tui spike — vanilla (UH-45) ",
    titleAlignment: "left",
  });
  renderer.root.add(root);

  const header = new TextRenderable(renderer, {
    id: "header",
    content: `sandboxes loaded from .harness/sandboxes/index.yaml  (${entries.length})`,
  });
  root.add(header);

  const select = new SelectRenderable(renderer, {
    id: "sandbox-list",
    options: toOptions(entries),
    showDescription: true,
    showScrollIndicator: true,
    width: "100%",
    flexGrow: 1,
    marginTop: 1,
  });
  root.add(select);

  const footer = new TextRenderable(renderer, {
    id: "footer",
    content: "↑/↓ navigate   q quit   ctrl+c force-quit",
    marginTop: 1,
  });
  root.add(footer);

  let quitting = false;
  const quit = () => {
    if (quitting) return;
    quitting = true;
    // destroy() restores terminal modes in this order:
    //   cleanupBeforeDestroy() — remove SIGINT/SIGTERM listeners, drop
    //   stdin raw mode, restore stdout passthrough, then finalizeDestroy()
    //   — emit DESTROY, walk root.destroyRecursively(), lib.destroyRenderer
    //   (Zig side restores main-screen, cursor, kitty kb, mouse). Without
    //   this, process.exit() skips `beforeExit` and leaves the terminal in
    //   raw mode. See docs/research/tui-framework.md §6.
    renderer.destroy();
    process.exit(0);
  };

  renderer.keyInput.on("keypress", (event) => {
    if (event.name === "q" && !event.ctrl && !event.meta) {
      quit();
    }
  });

  renderer.start();

  // Spike: render once and exit, unless UH_TUI_SPIKE_HOLD is set (for manual
  // inspection). Holding the loop forever in CI defeats the purpose.
  if (!process.env.UH_TUI_SPIKE_HOLD) {
    // One frame is enough to prove the pipeline works end-to-end.
    setTimeout(() => quit(), 50);
  }
}

main().catch((err) => {
  process.stderr.write(`uh-tui-spike-vanilla: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
