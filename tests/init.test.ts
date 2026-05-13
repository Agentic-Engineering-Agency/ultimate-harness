import { test, expect, describe } from "vitest";
import { mkdir, rm, access, stat, readdir } from "node:fs/promises";
import { initializeHarness } from "../src/harness/init.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const TEST_ROOT = "/tmp/uh-test-init";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

describe("uh init", () => {
  test("creates .harness/project.yaml", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await access(join(TEST_ROOT, ".harness", "project.yaml"));
  });

  test("creates required directories", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const expectedDirs = [
      ".harness/adapters",
      ".harness/workflows",
      ".harness/skills",
      ".harness/specs/active",
      ".harness/specs/archive",
      ".harness/missions",
      ".harness/sandboxes",
      ".harness/audit",
    ];
    for (const d of expectedDirs) {
      const s = await stat(join(TEST_ROOT, d));
      expect(s.isDirectory()).toBe(true);
    }
  });

  test("creates five default workflow YAML files", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const wfDir = join(TEST_ROOT, ".harness", "workflows");
    const files = await readdir(wfDir);
    const yamlFiles = files.filter((f) => f.endsWith(".yaml"));
    expect(yamlFiles.length).toBe(5);
  });

  test("creates empty .harness/audit/events.ndjson", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await stat(join(TEST_ROOT, ".harness", "audit", "events.ndjson"));
    expect(s.isFile()).toBe(true);
  });

  test("does not overwrite existing project file without --force", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const result = await initializeHarness(TEST_ROOT);
    expect(result.existed.length).toBeGreaterThan(0);
    expect(result.created.length).toBe(0);
  });

  test("allows overwrite with --force", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const result = await initializeHarness(TEST_ROOT, true);
    expect(result.created.length).toBeGreaterThan(0);
    expect(result.existed.length).toBe(0);
  });
});
