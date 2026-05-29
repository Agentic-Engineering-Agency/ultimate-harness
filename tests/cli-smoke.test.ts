import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")) as { version: string }).version;

let testRoot: string;

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "uh-cli-smoke-"));
});

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

function runCli(args: string[], opts: { cwd?: string } = {}) {
  return spawnSync("bun", ["x", "tsx", CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    env: {
      ...process.env,
      UH_TELEMETRY: "",
      UH_POSTHOG_API_KEY: "",
    },
  });
}

describe("uh CLI smoke", () => {
  test("prints help and package version", () => {
    const help = runCli(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Ultimate Harness CLI");
    expect(help.stdout).toMatch(/\bmission\b/);

    const version = runCli(["--version"]);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(PACKAGE_VERSION);
  });

  test("parses nested commands without requiring a harness project", () => {
    const result = runCli(["adapter", "capabilities", "--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { adapters: Array<{ id: string }> };
    expect(parsed.adapters.map((adapter) => adapter.id)).toContain("codex");
  });

  test("validates config files and rejects malformed project YAML", async () => {
    const projectYaml = join(testRoot, "project.yaml");
    await writeFile(projectYaml, "schema_version: uh.project.v0\nunexpected: true\n", "utf-8");

    const result = runCli(["validate", projectYaml]);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("[FAIL]");
    expect(result.stdout + result.stderr).toContain("Invalid input");
  });

  test("emits status JSON from an initialized project", () => {
    const init = runCli(["init", "--root", testRoot]);
    expect(init.status).toBe(0);

    const status = runCli(["status", "--root", testRoot, "--json"]);
    expect(status.status).toBe(0);
    const parsed = JSON.parse(status.stdout) as { schema_version: string; project_root: string };
    expect(parsed.schema_version).toBe("uh.status.v0");
    expect(parsed.project_root).toBe(testRoot);
  });
});
