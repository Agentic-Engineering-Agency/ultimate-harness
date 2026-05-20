import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { getStatusJson, STATUS_JSON_SCHEMA } from "../src/harness/status-json.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-statusjson-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

async function seedMission(id: string, opts: { result?: Record<string, unknown>; session?: Record<string, unknown> } = {}) {
  const dir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "spec-first-feature",
  }), "utf-8");
  if (opts.result) {
    await writeFile(join(dir, "runtime-result.yaml"), stringify({
      schema_version: "uh.runtime-result.v0",
      mission_id: id,
      runtime: "hermes",
      status: "passed",
      started_at: "2026-05-19T00:00:00.000Z",
      finished_at: "2026-05-19T00:01:00.000Z",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
      errors: [],
      ...opts.result,
    }), "utf-8");
  }
  if (opts.session) {
    await writeFile(join(dir, "runtime-session.yaml"), stringify({
      schema_version: "uh.runtime-session.v0",
      mission_id: id,
      runtime: "hermes",
      status: "running",
      command: "noop",
      args: [],
      started_at: "2026-05-19T00:00:00.000Z",
      ...opts.session,
    }), "utf-8");
  }
}

describe("UH-78 uh status --json", () => {
  test("empty project shape is stable", async () => {
    const doc = await getStatusJson(TEST_ROOT, {
      packageVersion: "9.9.9",
      now: "2026-05-19T12:00:00.000Z",
    });
    expect(doc.schema_version).toBe(STATUS_JSON_SCHEMA);
    expect(doc.version).toBe("9.9.9");
    expect(doc.generated_at).toBe("2026-05-19T12:00:00.000Z");
    expect(doc.project_root).toBe(TEST_ROOT);
    expect(doc.adapters).toEqual([]);
    expect(doc.missions).toEqual({
      total: 0,
      by_status: { passed: 0, blocked: 0, failed: 0, running: 0, pending: 0 },
    });
    expect(doc.recent_runs).toEqual([]);
    expect(doc.drift).toEqual({ kinds_with_issues: 0, issues_total: 0 });
  });

  test("schema version is pinned to uh.status.v0", () => {
    expect(STATUS_JSON_SCHEMA).toBe("uh.status.v0");
  });

  test("multi-mission shape counts each status", async () => {
    await seedMission("m-pass", { result: { status: "passed" } });
    await seedMission("m-fail", { result: { status: "failed" } });
    await seedMission("m-blocked", { result: { status: "blocked" } });
    await seedMission("m-cancelled", { result: { status: "cancelled" } });
    await seedMission("m-running", { session: { status: "running" } });
    await seedMission("m-pending");
    const adapterDir = join(TEST_ROOT, ".harness", "adapters");
    await mkdir(adapterDir, { recursive: true });
    await writeFile(join(adapterDir, "codex.yaml"), stringify({
      schema_version: "uh.adapter.v0",
      id: "codex",
      name: "Codex",
      runtime: "codex",
      status: "active",
    }), "utf-8");
    const doc = await getStatusJson(TEST_ROOT, { packageVersion: "1.0.0" });
    expect(doc.missions.total).toBe(6);
    expect(doc.missions.by_status).toEqual({
      passed: 1,
      failed: 1,
      blocked: 2,
      running: 1,
      pending: 1,
    });
    expect(doc.recent_runs).toHaveLength(4);
    expect(doc.recent_runs[0].mission_id).toBeDefined();
    expect(doc.adapters).toHaveLength(1);
    expect(doc.adapters[0].id).toBe("codex");
    expect(doc.adapters[0].version).toBe("");
    expect(doc.adapters[0].checked_at).toBeNull();
  });

  test("drift block reports kinds_with_issues and issues_total", async () => {
    // Create a stale worker lock to trigger drift.
    const dir = join(TEST_ROOT, ".harness", "missions", "m1", "team", "workers", "frontend");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "lock"), "999999", "utf-8");
    await writeFile(join(TEST_ROOT, ".harness", "missions", "m1", "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id: "m1",
      title: "m1",
      workflow_profile: "spec-first-feature",
    }), "utf-8");
    const doc = await getStatusJson(TEST_ROOT, { packageVersion: "1.0.0" });
    expect(doc.drift.kinds_with_issues).toBeGreaterThanOrEqual(1);
    expect(doc.drift.issues_total).toBeGreaterThanOrEqual(1);
  });

  test("recent_runs respects --json verdict overlay", async () => {
    await seedMission("m-v", {
      result: {
        status: "passed",
        verdict: {
          value: "needs-attention",
          rationale: "subtle issue",
          recorded_by: "manual",
          recorded_at: "2026-05-19T00:05:00.000Z",
        },
      },
    });
    const doc = await getStatusJson(TEST_ROOT, { packageVersion: "1.0.0" });
    expect(doc.recent_runs[0].verdict).toBe("needs-attention");
  });

  test("sub-500ms wall clock on a 50-mission fixture", async () => {
    for (let i = 0; i < 50; i += 1) {
      const id = `m${String(i).padStart(2, "0")}`;
      await seedMission(id, {
        result: {
          status: i % 5 === 0 ? "failed" : "passed",
          finished_at: `2026-05-19T00:0${i % 10}:00.000Z`,
        },
      });
    }
    const start = Date.now();
    const doc = await getStatusJson(TEST_ROOT, { packageVersion: "1.0.0" });
    const wall = Date.now() - start;
    expect(doc.missions.total).toBe(50);
    expect(wall).toBeLessThan(500);
  });
});
