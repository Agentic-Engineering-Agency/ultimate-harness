#!/usr/bin/env bun
/**
 * UH-45 spike — SOLID @opentui/solid prototype.
 *
 * Same screen as `bin/uh-tui-spike-vanilla.ts` but in JSX with fine-grained
 * reactive primitives. Throwaway exploration. Not wired into `src/cli.ts`.
 *
 * Run via: `bun bin/uh-tui-spike-solid.tsx` (preload comes from bunfig.toml).
 *
 * See `docs/research/tui-framework.md` for the framework comparison this
 * file participates in.
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

  const quit = () => {
    if (quitting) return;
    quitting = true;
    // See vanilla prototype for cleanup-order rationale; both paths funnel
    // into renderer.destroy() so the terminal restoration sequence is
    // identical regardless of framework.
    renderer.destroy();
    process.exit(0);
  };

  useKeyboard((event) => {
    if (event.name === "q" && !event.ctrl && !event.meta) {
      quit();
    }
  });

  // Spike: render-once mode unless UH_TUI_SPIKE_HOLD is set.
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
      title=" uh tui spike — solid (UH-45) "
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
  process.stderr.write(`uh-tui-spike-solid: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
