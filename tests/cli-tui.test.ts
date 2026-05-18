/**
 * UH-46 — `uh tui` subcommand registration shape test.
 *
 * Does NOT spawn Bun; just asserts that running `uh tui --help` lists
 * the documented flags. Catches regressions where the subcommand goes
 * missing or `--once`/`--root` get dropped from the option set.
 */
import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const REPO_ROOT = path.dirname(path.dirname(CLI));

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync("bun", ["x", "tsx", CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

describe("uh tui — CLI registration", () => {
  test("appears in `uh --help`", () => {
    const r = runCli(["--help"]);
    expect(r.stdout + r.stderr).toMatch(/\btui\b/);
  });

  test("`uh tui --help` documents --root and --once", () => {
    const r = runCli(["tui", "--help"]);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/--root/);
    expect(out).toMatch(/--once/);
    expect(out).toMatch(/Mission Control|interactive terminal UI/i);
  });
});
