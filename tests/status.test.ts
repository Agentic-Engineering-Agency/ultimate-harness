import { test, expect, describe } from "vitest";
import { mkdir, rm, writeFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getStatus } from "../src/harness/status.js";
import { initializeHarness } from "../src/harness/init.js";

const TEST_ROOT = "/tmp/uh-test-status";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

describe("uh status", () => {
  test("fails clearly outside a harness project", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await expect(getStatus(TEST_ROOT)).rejects.toThrow("Not a Ultimate Harness project");
  });

  test("reports initialized project correctly", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.name).toBeTruthy();
    expect(s.schema_version).toBe("uh.project.v0");
    expect(s.adapters_count).toBe(0);
    expect(s.active_missions_count).toBe(0);
  });

  test("counts workflow profiles", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.workflow_profiles_count).toBe(5);
  });

  test("counts adapters", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
      "schema_version: uh.adapter.v0\nid: hermes\nname: Hermes\nruntime: hermes\n",
      "utf-8"
    );
    const s = await getStatus(TEST_ROOT);
    expect(s.adapters_count).toBe(1);
  });

  test("counts active missions", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    await mkdir(join(TEST_ROOT, ".harness", "missions", "test-mission"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "test-mission", "mission.yaml"),
      "schema_version: uh.mission.v0\nid: test\nname: Test\nworkflow_profile: research-docs\n",
      "utf-8"
    );
    const s = await getStatus(TEST_ROOT);
    expect(s.active_missions_count).toBe(1);
  });

  test("counts recent audit events", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const s = await getStatus(TEST_ROOT);
    expect(s.recent_audit_events).toBe(1); // init event
  });
});
