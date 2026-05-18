import { describe, test, expect } from "vitest";
import { buildRunArgs, resolveDefaultCliEntry } from "../src/tui/run-orchestrator.js";

describe("tui/run-orchestrator buildRunArgs", () => {
  test("builds the expected argv for a sandbox-routed run", () => {
    const args = buildRunArgs({
      missionPath: "/repo/examples/missions/foo.yaml",
      root: "/repo",
      runtime: "codex",
    }, "/abs/dist/cli.js");
    expect(args).toEqual([
      "/abs/dist/cli.js",
      "mission",
      "run",
      "/repo/examples/missions/foo.yaml",
      "--runtime",
      "codex",
      "--root",
      "/repo",
    ]);
  });

  test("appends --no-sandbox when requested", () => {
    const args = buildRunArgs({
      missionPath: "/r/m.yaml",
      root: "/r",
      runtime: "hermes",
      noSandbox: true,
    }, "/abs/cli.js");
    expect(args.at(-1)).toBe("--no-sandbox");
  });
});

describe("tui/run-orchestrator resolveDefaultCliEntry", () => {
  test("returns an absolute path pointing to cli.{js,ts} beside the module", () => {
    const entry = resolveDefaultCliEntry();
    expect(entry).toMatch(/[\/\\]cli\.(ts|js)$/);
    expect(entry.startsWith("/")).toBe(true);
  });
});
