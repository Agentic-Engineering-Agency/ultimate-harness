/**
 * UH-51 — render-side of the `uh tui screenshot` pipeline.
 *
 * Bun preload boots this file in a child process. We parse `--view`,
 * `--out`, and dimension flags from argv, build a `ScreenshotRender`
 * that mounts the Solid `Dashboard` under OpenTUI's `testRender`,
 * navigates to the requested view via the mock-input adapter, and hands
 * the captured frame back to the pipeline orchestrator.
 */

import { testRender } from "@opentui/solid";
import { createMockKeys } from "@opentui/core/testing";
import { Dashboard } from "./dashboard.js";
import {
  navigationKeysForView,
  runScreenshotPipeline,
  type ScreenshotRender,
  type ScreenshotView,
} from "./screenshot-pipeline.js";
import { PALETTES, resolveTheme } from "./theme.js";

import "../adapters/hermes.js";
import "../adapters/codex.js";
import "../adapters/oh-my-pi.js";
import "../adapters/hermes-proxy.js";

interface ParsedArgs {
  view: string;
  out?: string;
  width?: number;
  height?: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const env = process.env;
  let view = env.UH_TUI_SCREENSHOT_VIEW ?? "overview";
  let out = env.UH_TUI_SCREENSHOT;
  let width = parsePositiveInt(env.UH_TUI_SCREENSHOT_WIDTH);
  let height = parsePositiveInt(env.UH_TUI_SCREENSHOT_HEIGHT);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--view" && next) {
      view = next;
      i += 1;
    } else if (arg === "--out" && next) {
      out = next;
      i += 1;
    } else if (arg === "--width" && next) {
      width = parsePositiveInt(next) ?? width;
      i += 1;
    } else if (arg === "--height" && next) {
      height = parsePositiveInt(next) ?? height;
      i += 1;
    }
  }
  return { view, out, width, height };
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const render: ScreenshotRender = async (req) => {
  const palette = PALETTES[resolveTheme(process.env)];
  const rendered = await testRender(
    () => <Dashboard root={req.root} palette={palette} headless />,
    { width: req.width, height: req.height },
  );
  // Mount-time settle: let the Solid effects + async loaders flush. The
  // existing screenshot capture used the same delay; keep the same
  // budget so docs frames stay byte-comparable across CI runs.
  await new Promise((resolve) => setTimeout(resolve, 650));

  const keys = navigationKeysForView(req.view as ScreenshotView);
  if (keys.length > 0) {
    const mock = createMockKeys(rendered.renderer);
    for (const key of keys) {
      mock.pressKey(key as any);
    }
    await rendered.renderOnce();
    // Small settle window so the keymap overlay / pane focus animation
    // is fully laid out before capture.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await rendered.renderOnce();
  const frame = rendered.captureCharFrame();
  rendered.renderer.destroy();
  return frame;
};

const { view, out, width, height } = parseArgs(process.argv.slice(2));
const root = process.env.UH_TUI_ROOT ?? process.cwd();

const exitCode = await runScreenshotPipeline(
  { view, out, root, width, height },
  { render },
);
process.exit(exitCode);
