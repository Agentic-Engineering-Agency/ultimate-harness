import { describe, test, expect, vi } from "vitest";
import {
  navigationKeysForView,
  runScreenshotPipeline,
  SCREENSHOT_VIEWS,
  type ScreenshotRender,
} from "../src/tui/screenshot-pipeline.js";

function captureStream() {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
    },
    get text() {
      return chunks.join("");
    },
  };
}

describe("tui/screenshot-pipeline runScreenshotPipeline", () => {
  test("rejects an unknown view with exit code 1 and a helpful error", async () => {
    const stderr = captureStream();
    const render = vi.fn<ScreenshotRender>();
    const code = await runScreenshotPipeline(
      { view: "neon", out: "-" },
      { render, stderr, env: {} },
    );
    expect(code).toBe(1);
    expect(render).not.toHaveBeenCalled();
    expect(stderr.text).toMatch(/unknown view "neon"/);
    expect(stderr.text).toContain("overview");
  });

  test("renders requested view, writes to file, returns 0, sets UH_TUI_HEADLESS=1", async () => {
    const env: NodeJS.ProcessEnv = {};
    const writeFile = vi.fn(async (_path: string, _contents: string) => {});
    const render: ScreenshotRender = vi.fn(async (req) => `FRAME:${req.view}@${req.width}x${req.height}`);
    const code = await runScreenshotPipeline(
      { view: "missions", out: "/tmp/screenshots/missions.txt", root: "/repo", width: 80, height: 24 },
      { render, writeFile, env },
    );
    expect(code).toBe(0);
    expect(env.UH_TUI_HEADLESS).toBe("1");
    expect(render).toHaveBeenCalledWith({
      view: "missions",
      root: "/repo",
      width: 80,
      height: 24,
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [calledPath, calledContents] = writeFile.mock.calls[0]!;
    expect(calledPath).toBe("/tmp/screenshots/missions.txt");
    expect(calledContents).toContain("FRAME:missions@80x24");
    // File output is always newline-terminated.
    expect(calledContents.endsWith("\n")).toBe(true);
  });

  test("omitted --out writes the frame to stdout instead of a file", async () => {
    const stdout = captureStream();
    const writeFile = vi.fn();
    const render: ScreenshotRender = async () => "DASHBOARD";
    const code = await runScreenshotPipeline(
      { view: "overview" },
      { render, writeFile, stdout, env: {} },
    );
    expect(code).toBe(0);
    expect(writeFile).not.toHaveBeenCalled();
    expect(stdout.text).toBe("DASHBOARD\n");
  });

  test("--out=- also goes to stdout", async () => {
    const stdout = captureStream();
    const render: ScreenshotRender = async () => "X";
    const code = await runScreenshotPipeline(
      { view: "sandboxes", out: "-" },
      { render, stdout, env: {} },
    );
    expect(code).toBe(0);
    expect(stdout.text).toBe("X\n");
  });

  test("render failure becomes exit code 1 with error message", async () => {
    const stderr = captureStream();
    const render: ScreenshotRender = async () => {
      throw new Error("renderer exploded");
    };
    const code = await runScreenshotPipeline(
      { view: "overview", out: "-" },
      { render, stderr, env: {} },
    );
    expect(code).toBe(1);
    expect(stderr.text).toMatch(/render failed/);
    expect(stderr.text).toMatch(/renderer exploded/);
  });

  test("write failure becomes exit code 1 with error message", async () => {
    const stderr = captureStream();
    const render: ScreenshotRender = async () => "frame";
    const writeFile = vi.fn(async () => {
      throw new Error("EACCES");
    });
    const code = await runScreenshotPipeline(
      { view: "overview", out: "/root/forbidden.txt" },
      { render, writeFile, stderr, env: {} },
    );
    expect(code).toBe(1);
    expect(stderr.text).toMatch(/write failed/);
    expect(stderr.text).toMatch(/EACCES/);
  });

  test("default width/height fall back to 120x36", async () => {
    const seen: Array<{ width: number; height: number }> = [];
    const render: ScreenshotRender = async (req) => {
      seen.push({ width: req.width, height: req.height });
      return "ok";
    };
    await runScreenshotPipeline(
      { view: "overview", out: "-" },
      { render, env: {}, stdout: captureStream() },
    );
    expect(seen).toEqual([{ width: 120, height: 36 }]);
  });
});

describe("tui/screenshot-pipeline navigationKeysForView", () => {
  test("overview needs no navigation", () => {
    expect(navigationKeysForView("overview")).toEqual([]);
  });

  test("missions / sandboxes route to the matching pane mnemonic", () => {
    expect(navigationKeysForView("missions")).toEqual(["m"]);
    expect(navigationKeysForView("sandboxes")).toEqual(["s"]);
  });

  test("workflows routes through the help overlay", () => {
    expect(navigationKeysForView("workflows")).toEqual(["?"]);
  });

  test("every catalogued view returns a navigation sequence", () => {
    for (const view of SCREENSHOT_VIEWS) {
      const keys = navigationKeysForView(view);
      expect(Array.isArray(keys)).toBe(true);
    }
  });
});
