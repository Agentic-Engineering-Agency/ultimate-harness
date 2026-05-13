import { test, expect, describe, beforeAll } from "vitest";
import { chmod, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { checkHermes, dryRunHermes, runHermes } from "../src/adapters/hermes.js";
import { validateAdapter } from "../src/schema/adapter.js";

const TEST_ROOT = "/tmp/uh-test-adapter";
const execFileP = promisify(execFile);

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

beforeAll(cleanup);
test.beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
    `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
description: Runtime adapter for Hermes Agent
runtime: hermes
capabilities:
  - cli-execution
config:
  cli_command: hermes
  default_toolsets:
    - terminal
    - file
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: true
`,
    "utf-8"
  );
});
test.afterEach(cleanup);

describe("adapter schema", () => {
  test("generic adapter config does not inject cli_command", () => {
    const adapter = validateAdapter({
      schema_version: "uh.adapter.v0",
      id: "generic-runtime",
      name: "Generic Runtime",
      runtime: "generic",
      config: {},
    });

    expect(adapter.config).toBeDefined();
    expect(adapter.config).not.toHaveProperty("cli_command");
  });
});

describe("uh adapter check hermes", () => {
  test("returns valid check result when hermes is installed", async () => {
    const result = await checkHermes();
    expect(result.runtime).toBe("hermes");
    if (result.found) {
      expect(result.version.length).toBeGreaterThan(0);
    }
  });

  test("validates the selected root adapter manifest", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"));
    const result = await checkHermes(TEST_ROOT);
    expect(result.found).toBe(false);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });
});

describe("uh mission dry-run --runtime hermes", () => {
  test("produces valid dry-run result for example mission", async () => {
    const result = await dryRunHermes(TEST_ROOT, "examples/missions/documentation-spine.yaml");
    expect(result.errors).toEqual([]);
    expect(result.command).toBe("hermes");
    expect(result.args[0]).toBe("chat");
    expect(result.args[1]).toBe("-q");
    expect(result.args.includes("--source")).toBe(true);
    expect(result.args.includes("ultimate-harness")).toBe(true);
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.prompt).toContain("Mission: Documentation Spine Creation");
  });

  test("fails when adapter manifest is missing", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"));
    const result = await dryRunHermes(TEST_ROOT, "examples/missions/documentation-spine.yaml");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });

  test("fails when mission file is invalid", async () => {
    const badPath = join(TEST_ROOT, "bad-mission.yaml");
    await writeFile(badPath, "not: yaml: [broken\n", "utf-8");
    const result = await dryRunHermes(TEST_ROOT, badPath);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Mission load error");
  });
});

describe("uh mission run --runtime hermes", () => {
  test("CLI prints a friendly failure when runHermes throws", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"));

    try {
      await execFileP(
        join(process.cwd(), "node_modules", ".bin", "tsx"),
        [
          "src/cli.ts",
          "mission",
          "run",
          "examples/missions/documentation-spine.yaml",
          "--root",
          TEST_ROOT,
        ],
        { cwd: process.cwd() }
      );
      throw new Error("expected CLI to fail");
    } catch (err) {
      const output = `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`;
      expect(output).toContain("[FAIL] mission run error:");
      expect(output).toContain("Adapter manifest not found");
      expect(output).not.toContain("Error: Adapter manifest not found");
    }
  });

  test("runHermes sends the rendered workflow prompt to the configured executable", async () => {
    const fakeHermes = join(TEST_ROOT, "fake-hermes.mjs");
    const argvPath = join(TEST_ROOT, "fake-hermes-argv.json");
    await writeFile(
      fakeHermes,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.env.FAKE_HERMES_ARGV_PATH, JSON.stringify(process.argv.slice(2)));
`,
      "utf-8"
    );
    await chmod(fakeHermes, 0o755);
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
      `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
description: Runtime adapter for Hermes Agent
runtime: hermes
capabilities:
  - cli-execution
config:
  cli_command: ${fakeHermes}
  default_toolsets:
    - terminal
    - file
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: true
`,
      "utf-8"
    );

    const previousArgvPath = process.env.FAKE_HERMES_ARGV_PATH;
    process.env.FAKE_HERMES_ARGV_PATH = argvPath;
    try {
      const result = await runHermes(TEST_ROOT, "examples/missions/documentation-spine.yaml");
      expect(result).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });

      const argv = JSON.parse(await readFile(argvPath, "utf-8")) as string[];
      const prompt = argv[argv.indexOf("-q") + 1];
      expect(prompt).toContain("## Workflow: Research & Documentation");
      expect(prompt).toContain("### research (researcher)");
      expect(prompt).toContain("Research and gather information");
    } finally {
      if (previousArgvPath === undefined) {
        delete process.env.FAKE_HERMES_ARGV_PATH;
      } else {
        process.env.FAKE_HERMES_ARGV_PATH = previousArgvPath;
      }
    }
  });
});
