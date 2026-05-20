import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendRunsIndexEntry,
  ensureRunDir,
  pruneOldRuns,
} from "../src/harness/run-id.js";
import { missionRunDir, missionRunsIndex } from "../src/harness/paths.js";

let TEST_ROOT: string;
const MISSION = "demo";

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-prune-"));
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

async function seedRuns(count: number): Promise<string[]> {
  // Monotonically-increasing started_at so prune order is deterministic
  // (oldest = run-00 .. newest = run-(count-1)).
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const runId = `run-${i.toString().padStart(2, "0")}`;
    const minute = i.toString().padStart(2, "0");
    await ensureRunDir(TEST_ROOT, MISSION, runId);
    await appendRunsIndexEntry(TEST_ROOT, MISSION, {
      run_id: runId,
      started_at: `2026-05-20T12:${minute}:00.000Z`,
      status: "passed",
      runtime: "hermes",
    });
    ids.push(runId);
  }
  return ids;
}

async function dirExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

describe("UH-90 pruneOldRuns", () => {
  test("max >= total: no-op, returns 0, no archived flips", async () => {
    const ids = await seedRuns(5);
    const pruned = await pruneOldRuns(TEST_ROOT, MISSION, 10);
    expect(pruned).toBe(0);
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, MISSION), "utf-8"));
    expect(idx.runs).toHaveLength(5);
    for (const entry of idx.runs) {
      expect(entry.archived).toBeUndefined();
    }
    for (const id of ids) {
      expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, id))).toBe(true);
    }
  });

  test("max=3 with 5 runs: prune 2 oldest, dirs gone, entries archived", async () => {
    await seedRuns(5);
    const pruned = await pruneOldRuns(TEST_ROOT, MISSION, 3);
    expect(pruned).toBe(2);
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, MISSION), "utf-8"));
    const byId = new Map<string, any>(idx.runs.map((r: any) => [r.run_id, r]));
    expect(byId.get("run-00")?.archived).toBe(true);
    expect(byId.get("run-01")?.archived).toBe(true);
    expect(byId.get("run-02")?.archived).toBeUndefined();
    expect(byId.get("run-03")?.archived).toBeUndefined();
    expect(byId.get("run-04")?.archived).toBeUndefined();
    expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, "run-00"))).toBe(false);
    expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, "run-01"))).toBe(false);
    expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, "run-02"))).toBe(true);
    expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, "run-03"))).toBe(true);
    expect(await dirExists(missionRunDir(TEST_ROOT, MISSION, "run-04"))).toBe(true);
  });

  test("max=0 throws positive-integer error", async () => {
    await seedRuns(3);
    await expect(pruneOldRuns(TEST_ROOT, MISSION, 0)).rejects.toThrow(
      /max_runs_per_mission must be a positive integer or null/,
    );
  });

  test("non-positive / non-integer values throw with positive-integer message", async () => {
    await seedRuns(3);
    await expect(pruneOldRuns(TEST_ROOT, MISSION, -1)).rejects.toThrow(
      /must be a positive integer or null/,
    );
    await expect(pruneOldRuns(TEST_ROOT, MISSION, 1.5)).rejects.toThrow(
      /must be a positive integer or null/,
    );
    await expect(pruneOldRuns(TEST_ROOT, MISSION, Number.NaN)).rejects.toThrow(
      /must be a positive integer or null/,
    );
  });

  test("re-running prune is idempotent (state and on-disk both stable)", async () => {
    await seedRuns(5);
    const first = await pruneOldRuns(TEST_ROOT, MISSION, 3);
    expect(first).toBe(2);
    const idxAfterFirst = await readFile(missionRunsIndex(TEST_ROOT, MISSION), "utf-8");
    const second = await pruneOldRuns(TEST_ROOT, MISSION, 3);
    expect(second).toBe(0);
    const idxAfterSecond = await readFile(missionRunsIndex(TEST_ROOT, MISSION), "utf-8");
    expect(idxAfterSecond).toBe(idxAfterFirst);
  });

  test("archived entries do not count against the cap on subsequent prunes", async () => {
    // Seed 5, prune to 3 (run-00/01 archived). Add 2 more fresh runs → 7
    // index rows of which 5 are non-archived. Prune again to 3 → 2 more
    // pruned (run-02, run-03).
    await seedRuns(5);
    await pruneOldRuns(TEST_ROOT, MISSION, 3);
    for (const i of [5, 6]) {
      const runId = `run-${i.toString().padStart(2, "0")}`;
      const minute = i.toString().padStart(2, "0");
      await ensureRunDir(TEST_ROOT, MISSION, runId);
      await appendRunsIndexEntry(TEST_ROOT, MISSION, {
        run_id: runId,
        started_at: `2026-05-20T12:${minute}:00.000Z`,
        status: "passed",
        runtime: "hermes",
      });
    }
    const pruned = await pruneOldRuns(TEST_ROOT, MISSION, 3);
    expect(pruned).toBe(2);
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, MISSION), "utf-8"));
    const byId = new Map<string, any>(idx.runs.map((r: any) => [r.run_id, r]));
    expect(byId.get("run-00")?.archived).toBe(true);
    expect(byId.get("run-01")?.archived).toBe(true);
    expect(byId.get("run-02")?.archived).toBe(true);
    expect(byId.get("run-03")?.archived).toBe(true);
    expect(byId.get("run-04")?.archived).toBeUndefined();
    expect(byId.get("run-05")?.archived).toBeUndefined();
    expect(byId.get("run-06")?.archived).toBeUndefined();
    const nonArchived = idx.runs.filter((r: any) => r.archived !== true);
    expect(nonArchived).toHaveLength(3);
  });

  test("missing index.json: returns 0 (mission has never run)", async () => {
    const pruned = await pruneOldRuns(TEST_ROOT, "never-ran", 3);
    expect(pruned).toBe(0);
  });
});