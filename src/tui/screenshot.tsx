import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { testRender } from "@opentui/solid";
import { Dashboard } from "./dashboard.js";

import "../adapters/hermes.js";
import "../adapters/codex.js";
import "../adapters/oh-my-pi.js";
import "../adapters/hermes-proxy.js";

const rootEnv = process.env.UH_TUI_ROOT;
const output = process.env.UH_TUI_SCREENSHOT;
const width = Number.parseInt(process.env.UH_TUI_SCREENSHOT_WIDTH ?? "120", 10);
const height = Number.parseInt(process.env.UH_TUI_SCREENSHOT_HEIGHT ?? "36", 10);

if (!output) {
  process.stderr.write("uh tui screenshot: UH_TUI_SCREENSHOT is required\n");
  process.exit(1);
}
if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
  process.stderr.write("uh tui screenshot: width and height must be positive integers\n");
  process.exit(1);
}

const root = rootEnv ?? process.cwd();

try {
  const rendered = await testRender(() => <Dashboard root={root} />, { width, height });
  await new Promise((resolve) => setTimeout(resolve, 650));
  await rendered.renderOnce();
  const frame = rendered.captureCharFrame();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, frame.endsWith("\n") ? frame : `${frame}\n`, "utf-8");
  rendered.renderer.destroy();
} catch (err) {
  process.stderr.write(`uh tui screenshot: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
}
