import { test, expect, describe } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { validateFile } from "../src/harness/validate.js";
import { initializeHarness } from "../src/harness/init.js";

const TEST_ROOT = "/tmp/uh-test-validate";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

describe("uh validate", () => {
  test("valid project YAML passes", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const result = await validateFile(join(TEST_ROOT, ".harness", "project.yaml"));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("missing required project fields fails", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "bad-project.yaml"),
      "schema_version: uh.project.v0\n",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "bad-project.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("valid mission YAML passes", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "mission.yaml"),
      `schema_version: uh.mission.v0
id: test-mission
name: Test Mission
workflow_profile: research-docs
`,
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "mission.yaml"));
    expect(result.valid).toBe(true);
  });

  test("unknown schema version fails", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "unknown.yaml"),
      "schema_version: uh.nonexistent.v99\n",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "unknown.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown schema version");
  });

  test("invalid YAML returns useful error", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "broken.yaml"),
      "key: [unterminated",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "broken.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("YAML parse error");
  });

  test("example mission packet validates", async () => {
    const result = await validateFile("examples/missions/documentation-spine.yaml");
    expect(result.valid).toBe(true);
  });
});
