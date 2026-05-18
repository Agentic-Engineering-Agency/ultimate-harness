#!/usr/bin/env bun
/**
 * UH-45 spike — winning prototype (Solid).
 *
 * Boots @opentui/core via @opentui/solid, reads
 * .harness/sandboxes/index.yaml, renders the sandbox list in a Box +
 * Select with dirty/clean badges, supports `q` to quit and Ctrl+C to
 * force-quit, and exits with the terminal restored.
 *
 * NOT wired into src/cli.ts. Run via `bun run tui-spike`. See
 * docs/research/tui-framework.md for the framework comparison rationale
 * and the comparison commit hash (8adf04b) where the rejected vanilla
 * prototype still lives.
 *
 * Throwaway exploration; downstream slices (UH-46/47/44/43/42) consume
 * the dependency choice and lifecycle invariants captured in the doc,
 * not this file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createSignal, onCleanup } from "solid-js";
import { parse as parseYaml } from "yaml";
import { render, useKeyboard, useRenderer } from "@opentui/solid";

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

function toOptions(entries: SandboxEntry[]) {
  if (entries.length === 0) {
    return [
      {
        name: "(no sandboxes)",
        description: "Run `uh sandbox create` to seed one.",
      },
    ];
  }
  return entries.map((e) => {
    const badge = e.status === "dirty" ? "● dirty" : "○ clean";
    return {
      name: `${e.id}  ${badge}`,
      description: `mission=${e.mission_id}  backend=${e.backend}  status=${e.status}`,
      value: e,
    };
  });
}

function App() {
  const renderer = useRenderer();
  const [entries] = createSignal(loadSandboxes());
  let quitting = false;

  // Quit ordering: renderer.destroy() runs cleanupBeforeDestroy() first
  // (removes SIGINT/SIGTERM/beforeExit/uncaught listeners, drops stdin
  // raw mode, restores stdout passthrough), then finalizeDestroy() emits
  // the DESTROY event, walks root.destroyRecursively(), and finally
  // calls lib.destroyRenderer() so the Zig side restores main-screen +
  // cursor + kitty kb + mouse before we hand control back to the shell.
  // process.exit() alone would skip `beforeExit` and strand the terminal
  // in raw mode. See docs/research/tui-framework.md §6.
  const quit = () => {
    if (quitting) return;
    quitting = true;
    renderer.destroy();
    process.exit(0);
  };

  useKeyboard((event) => {
    if (event.name === "q" && !event.ctrl && !event.meta) {
      quit();
    }
  });

  // Spike: render one frame, exit. Set UH_TUI_SPIKE_HOLD=1 for manual
  // inspection. A long-lived loop in CI defeats the purpose.
  if (!process.env.UH_TUI_SPIKE_HOLD) {
    const timer = setTimeout(quit, 50);
    onCleanup(() => clearTimeout(timer));
  }

  return (
    <box
      flexDirection="column"
      padding={1}
      width="100%"
      height="100%"
      border
      borderStyle="rounded"
      title=" uh tui spike (UH-45) "
      titleAlignment="left"
    >
      <text>
        sandboxes loaded from .harness/sandboxes/index.yaml ({entries().length})
      </text>
      <select
        options={toOptions(entries())}
        showDescription
        showScrollIndicator
        width="100%"
        flexGrow={1}
        marginTop={1}
      />
      <text marginTop={1}>↑/↓ navigate   q quit   ctrl+c force-quit</text>
    </box>
  );
}

render(() => <App />, {
  exitOnCtrlC: true,
  clearOnShutdown: true,
  targetFps: 30,
  consoleMode: "disabled",
}).catch((err: unknown) => {
  process.stderr.write(`uh-tui-spike: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
