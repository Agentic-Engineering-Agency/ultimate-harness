/**
 * UH-51 — orchestration for the automated TUI screenshot pipeline.
 *
 * This module owns the *logic* of `uh tui screenshot --view <name>
 * --out <path>`: it validates the view, routes to the right key sequence
 * the dashboard understands, asks an injected renderer to produce one
 * deterministic ANSI frame, writes that frame to a file (or stdout), and
 * maps every outcome to an exit code.
 *
 * The renderer itself is provided by `src/tui/screenshot.tsx`, which
 * mounts the real Solid Dashboard under OpenTUI's `testRender`. The
 * indirection keeps this module pure-ish and unit-testable without
 * loading Bun, native bindings, or the JSX runtime.
 *
 * Acceptance:
 *   - boots the TUI in non-interactive headless mode (sets
 *     `UH_TUI_HEADLESS=1`),
 *   - renders the requested view ONCE,
 *   - captures the rendered terminal buffer as ANSI text to stdout OR a
 *     file,
 *   - exits 0 on success, 1 on unknown view / write failure / render
 *     failure.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Views the screenshot pipeline knows how to navigate to. */
export type ScreenshotView = "overview" | "missions" | "sandboxes" | "workflows";

export const SCREENSHOT_VIEWS: readonly ScreenshotView[] = [
  "overview",
  "missions",
  "sandboxes",
  "workflows",
];

export interface ScreenshotOptions {
  /** Requested view (`overview` | `missions` | `sandboxes` | `workflows`). */
  view: string;
  /** Output path. Omit (or pass `-`) to write to stdout. */
  out?: string;
  /** Project root for the underlying Dashboard. Defaults to cwd. */
  root?: string;
  /** Frame width in columns. */
  width?: number;
  /** Frame height in rows. */
  height?: number;
}

export interface ScreenshotRenderRequest {
  view: ScreenshotView;
  root: string;
  width: number;
  height: number;
}

/**
 * Render-side adapter. Implementations mount the Dashboard, navigate to
 * the requested view, and return the captured ANSI/char frame.
 */
export type ScreenshotRender = (req: ScreenshotRenderRequest) => Promise<string>;

export interface ScreenshotIO {
  /** Defaults to `node:fs/promises` `mkdir` + `writeFile`. */
  writeFile?: (filePath: string, contents: string) => Promise<void>;
  /** Defaults to `process.stdout`. */
  stdout?: { write: (chunk: string) => void };
  /** Defaults to `process.stderr`. */
  stderr?: { write: (chunk: string) => void };
  /** Render-side adapter. Required when actually capturing. */
  render: ScreenshotRender;
  /** Environment used to set headless flag. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 36;

function isScreenshotView(value: string): value is ScreenshotView {
  return (SCREENSHOT_VIEWS as readonly string[]).includes(value);
}

async function defaultWriteFile(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf-8");
}

/**
 * Run the screenshot pipeline. Returns the exit code (`0` on success,
 * `1` on any failure path).
 */
export async function runScreenshotPipeline(
  opts: ScreenshotOptions,
  io: ScreenshotIO,
): Promise<number> {
  const stderr = io.stderr ?? process.stderr;
  const stdout = io.stdout ?? process.stdout;
  const env = io.env ?? process.env;

  if (!isScreenshotView(opts.view)) {
    stderr.write(
      `uh tui screenshot: unknown view "${opts.view}". Valid views: ${SCREENSHOT_VIEWS.join(", ")}\n`,
    );
    return 1;
  }

  // Headless flag is part of the contract — Dashboard et al. read this
  // to skip fs watchers and any other surface that would otherwise hold
  // the event loop open in a non-interactive context.
  env.UH_TUI_HEADLESS = "1";

  const req: ScreenshotRenderRequest = {
    view: opts.view,
    root: opts.root ?? process.cwd(),
    width: opts.width ?? DEFAULT_WIDTH,
    height: opts.height ?? DEFAULT_HEIGHT,
  };

  let frame: string;
  try {
    frame = await io.render(req);
  } catch (err) {
    stderr.write(`uh tui screenshot: render failed: ${(err as Error).stack ?? err}\n`);
    return 1;
  }

  const normalized = frame.endsWith("\n") ? frame : `${frame}\n`;
  try {
    if (!opts.out || opts.out === "-") {
      stdout.write(normalized);
    } else {
      const writer = io.writeFile ?? defaultWriteFile;
      await writer(path.resolve(opts.out), normalized);
    }
  } catch (err) {
    stderr.write(`uh tui screenshot: write failed: ${(err as Error).stack ?? err}\n`);
    return 1;
  }

  return 0;
}

/**
 * Map a view to the key sequence the Dashboard needs to navigate there
 * from the default `overview` mount. Exposed so the render-side script
 * can drive `mockInput.pressKey` deterministically.
 */
export function navigationKeysForView(view: ScreenshotView): readonly string[] {
  switch (view) {
    case "overview":
      return [];
    case "missions":
      return ["m"];
    case "sandboxes":
      return ["s"];
    case "workflows":
      // Workflows are surfaced through the `?` keymap overlay so a docs
      // capture shows the full bindings; the Dashboard view itself does
      // not (yet) have a dedicated workflows pane.
      return ["?"];
  }
}
