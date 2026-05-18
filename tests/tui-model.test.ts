import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import {
  loadAdapters,
  loadHarnessInfo,
  loadMissions,
  loadSandboxes,
  loadDashboardSnapshot,
} from "../src/tui/model.js";

const TEST_ROOT = "/tmp/uh-test-tui-model";
const HARNESS = join(TEST_ROOT, ".harness");

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

beforeEach(cleanup);
afterEach(cleanup);

async function seedAdapters() {
  await mkdir(join(HARNESS, "adapters"), { recursive: true });
  await writeFile(
    join(HARNESS, "adapters", "hermes.yaml"),
    [
      "schema_version: uh.adapter.v0",
      "id: hermes",
      "name: Hermes",
      "runtime: hermes",
      "status: active",
    ].join("\n") + "\n",
    "utf-8",
  );
  await writeFile(
    join(HARNESS, "adapters", "codex.yaml"),
    [
      "schema_version: uh.adapter.v0",
      "id: codex",
      "name: OpenAI Codex",
      "runtime: codex",
      "status: experimental",
    ].join("\n") + "\n",
    "utf-8",
  );
  // Broken YAML — model MUST surface a row with status=error, not crash.
  await writeFile(join(HARNESS, "adapters", "broken.yaml"), "::: not yaml :::\n", "utf-8");
}

async function seedMissionDir(id: string, options: {
  yaml?: string;
  mtimeMs?: number;
  omitYaml?: boolean;
} = {}) {
  const dir = join(HARNESS, "missions", id);
  await mkdir(dir, { recursive: true });
  if (!options.omitYaml) {
    await writeFile(
      join(dir, "mission.yaml"),
      options.yaml ?? [
        "schema_version: uh.mission.v0",
        `id: ${id}`,
        `name: Mission ${id}`,
        "workflow_profile: research-docs",
      ].join("\n") + "\n",
      "utf-8",
    );
  }
  if (options.mtimeMs !== undefined) {
    const t = new Date(options.mtimeMs);
    await utimes(dir, t, t);
  }
}

async function seedSandboxIndex(entries: string) {
  await mkdir(join(HARNESS, "sandboxes"), { recursive: true });
  await writeFile(
    join(HARNESS, "sandboxes", "index.yaml"),
    [
      "schema_version: uh.sandboxes-index.v0",
      entries,
    ].join("\n") + "\n",
    "utf-8",
  );
}

describe("tui/model loadAdapters", () => {
  test("returns empty array when adapters dir missing", async () => {
    await mkdir(HARNESS, { recursive: true });
    expect(await loadAdapters(TEST_ROOT)).toEqual([]);
  });

  test("parses well-formed adapter manifests and sorts by id", async () => {
    await seedAdapters();
    const rows = await loadAdapters(TEST_ROOT);
    expect(rows.map((r) => r.id)).toEqual(["broken", "codex", "hermes"]);
    const codex = rows.find((r) => r.id === "codex");
    expect(codex).toMatchObject({
      id: "codex",
      name: "OpenAI Codex",
      runtime: "codex",
      status: "experimental",
    });
    expect(codex?.manifestPath.endsWith("codex.yaml")).toBe(true);
  });

  test("surfaces malformed manifest as status=error without throwing", async () => {
    await seedAdapters();
    const rows = await loadAdapters(TEST_ROOT);
    const broken = rows.find((r) => r.id === "broken");
    expect(broken?.status).toBe("error");
    expect(broken?.runtime).toBe("");
  });
});

describe("tui/model loadMissions", () => {
  test("returns empty array when missions dir missing", async () => {
    await mkdir(HARNESS, { recursive: true });
    expect(await loadMissions(TEST_ROOT)).toEqual([]);
  });

  test("sorts missions newest-first by mtime and exposes workflow", async () => {
    const older = Date.UTC(2026, 0, 1) / 1; // ms
    const newer = Date.UTC(2026, 5, 1) / 1;
    await seedMissionDir("older-one", { mtimeMs: older });
    await seedMissionDir("newer-one", { mtimeMs: newer });
    const rows = await loadMissions(TEST_ROOT);
    expect(rows.map((r) => r.id)).toEqual(["newer-one", "older-one"]);
    expect(rows[0]).toMatchObject({
      id: "newer-one",
      workflow: "research-docs",
      state: "valid",
    });
    expect(rows[0].updatedAt > rows[1].updatedAt).toBe(true);
  });

  test("flags missions with missing mission.yaml as state=missing", async () => {
    await seedMissionDir("no-yaml", { omitYaml: true });
    const rows = await loadMissions(TEST_ROOT);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("missing");
    expect(rows[0].workflow).toBe("");
  });

  test("flags malformed mission.yaml as state=invalid but still returns the row", async () => {
    await seedMissionDir("bad", { yaml: "::: not yaml :::" });
    const rows = await loadMissions(TEST_ROOT);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("invalid");
    expect(rows[0].id).toBe("bad");
  });
});

describe("tui/model loadSandboxes", () => {
  test("returns empty when index missing", async () => {
    await mkdir(HARNESS, { recursive: true });
    expect(await loadSandboxes(TEST_ROOT)).toEqual([]);
  });

  test("returns empty when schema_version does not match", async () => {
    await seedSandboxIndex("sandboxes: []");
    // missing schema_version → invalid
    expect(await loadSandboxes(TEST_ROOT)).toEqual([]);
  });

  test("returns rows for valid entries", async () => {
    await seedSandboxIndex([
      "sandboxes:",
      "  - id: sbx-1",
      "    mission_id: m-1",
      "    backend: git-worktree",
      "    status: created",
      "    path: /tmp/uh-test-tui-model/.harness/sandboxes/sbx-1/worktree",
    ].join("\n"));
    const rows = await loadSandboxes(TEST_ROOT);
    expect(rows).toEqual([
      {
        id: "sbx-1",
        missionId: "m-1",
        backend: "git-worktree",
        status: "created",
        worktreePath: "/tmp/uh-test-tui-model/.harness/sandboxes/sbx-1/worktree",
      },
    ]);
  });
});

describe("tui/model loadHarnessInfo", () => {
  test("reports initialized=false when project.yaml is missing", async () => {
    await mkdir(HARNESS, { recursive: true });
    const info = await loadHarnessInfo(TEST_ROOT);
    expect(info.initialized).toBe(false);
    expect(info.projectName).toBe("");
  });

  test("reads project name from project.yaml", async () => {
    await mkdir(HARNESS, { recursive: true });
    await writeFile(
      join(HARNESS, "project.yaml"),
      "schema_version: uh.project.v0\nname: my-proj\n",
      "utf-8",
    );
    const info = await loadHarnessInfo(TEST_ROOT);
    expect(info.initialized).toBe(true);
    expect(info.projectName).toBe("my-proj");
  });

  test("malformed project.yaml still counts as initialized=true", async () => {
    await mkdir(HARNESS, { recursive: true });
    await writeFile(join(HARNESS, "project.yaml"), "::: not yaml :::\n", "utf-8");
    const info = await loadHarnessInfo(TEST_ROOT);
    expect(info.initialized).toBe(true);
    expect(info.projectName).toBe("");
  });
});

describe("tui/model loadDashboardSnapshot", () => {
  test("composes adapters, missions, sandboxes and stamps capturedAt", async () => {
    await seedAdapters();
    await seedMissionDir("m-a");
    await seedSandboxIndex("sandboxes: []");
    const before = Date.now();
    const snap = await loadDashboardSnapshot(TEST_ROOT);
    const captured = Date.parse(snap.capturedAt);
    expect(captured).not.toBeNaN();
    expect(captured).toBeGreaterThanOrEqual(before);
    expect(snap.harness.initialized).toBe(false);
    expect(snap.adapters.length).toBeGreaterThan(0);
    expect(snap.missions).toHaveLength(1);
    expect(snap.sandboxes).toEqual([]);
  });

  test("returns empty rows on a totally bare root", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    const snap = await loadDashboardSnapshot(TEST_ROOT);
    expect(snap.harness.initialized).toBe(false);
    expect(snap.adapters).toEqual([]);
    expect(snap.missions).toEqual([]);
    expect(snap.sandboxes).toEqual([]);
  });
});
