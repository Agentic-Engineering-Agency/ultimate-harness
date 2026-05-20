import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendRunsIndexEntry,
  assertValidRunId,
  ensureRunDir,
  generateRunId,
  mirrorRuntimeResultToLatest,
  readLatestPointer,
  writeLatestPointer,
} from "../src/harness/run-id.js";
import {
  missionDir,
  missionLatestPointer,
  missionRunDir,
  missionRunsIndex,
} from "../src/harness/paths.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-per-run-"));
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("UH-82 generateRunId", () => {
  test("matches the YYYYMMDDTHHMMSSZ-<6hex> shape", () => {
    const id = generateRunId();
    expect(id).toMatch(/^\d{8}T\d{6}Z-[0-9a-f]{6}$/);
  });

  test("is unique across rapid successive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 32; i++) ids.add(generateRunId());
    // The hex suffix is 24-bit randomness; collisions in 32 are vanishing.
    expect(ids.size).toBeGreaterThanOrEqual(31);
  });
});

describe("UH-82 assertValidRunId", () => {
  test("accepts plugin-shaped ids", () => {
    expect(() => assertValidRunId("20260520T053000Z-deadbe")).not.toThrow();
    expect(() => assertValidRunId("abc.def-ghi_jkl")).not.toThrow();
  });

  test("rejects ids that won't round-trip through the plugin URL", () => {
    expect(() => assertValidRunId("")).toThrow(/Invalid runId/);
    expect(() => assertValidRunId(".leading-dot")).toThrow();
    expect(() => assertValidRunId("has space")).toThrow();
    expect(() => assertValidRunId("has/slash")).toThrow();
  });
});

describe("UH-82 writeLatestPointer + readLatestPointer", () => {
  test("round-trips a pointer through disk", async () => {
    await writeLatestPointer(TEST_ROOT, "demo", {
      schema_version: "uh.latest-run.v0",
      run_id: "20260520T120000Z-abcdef",
      started_at: "2026-05-20T12:00:00.000Z",
      status: "running",
    });
    const read = await readLatestPointer(TEST_ROOT, "demo");
    expect(read).toEqual({
      schema_version: "uh.latest-run.v0",
      run_id: "20260520T120000Z-abcdef",
      started_at: "2026-05-20T12:00:00.000Z",
      status: "running",
    });
  });

  test("returns null when the pointer is missing", async () => {
    const read = await readLatestPointer(TEST_ROOT, "missing");
    expect(read).toBeNull();
  });

  test("returns null when the pointer JSON is malformed", async () => {
    await mkdir(missionDir(TEST_ROOT, "corrupt"), { recursive: true });
    await writeFile(missionLatestPointer(TEST_ROOT, "corrupt"), "{not json}", "utf-8");
    const read = await readLatestPointer(TEST_ROOT, "corrupt");
    expect(read).toBeNull();
  });

  test("rejects pointers that don't match the schema", async () => {
    await expect(
      writeLatestPointer(TEST_ROOT, "demo", {
        schema_version: "uh.latest-run.v0",
        run_id: "x",
        started_at: "2026-05-20T12:00:00.000Z",
        // @ts-expect-error invalid status on purpose
        status: "not-a-real-status",
      }),
    ).rejects.toThrow();
  });
});

describe("UH-82 appendRunsIndexEntry", () => {
  test("appends new entries chronologically", async () => {
    await appendRunsIndexEntry(TEST_ROOT, "demo", {
      run_id: "run-1",
      started_at: "2026-05-20T12:00:00.000Z",
      status: "running",
      runtime: "hermes",
    });
    await appendRunsIndexEntry(TEST_ROOT, "demo", {
      run_id: "run-2",
      started_at: "2026-05-20T12:01:00.000Z",
      status: "running",
      runtime: "codex",
    });
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, "demo"), "utf-8"));
    expect(idx.schema_version).toBe("uh.runs-index.v0");
    expect(idx.runs.map((r: { run_id: string }) => r.run_id)).toEqual(["run-1", "run-2"]);
  });

  test("replaces in place when the same run_id transitions to terminal", async () => {
    await appendRunsIndexEntry(TEST_ROOT, "demo", {
      run_id: "run-1",
      started_at: "2026-05-20T12:00:00.000Z",
      status: "running",
      runtime: "hermes",
    });
    await appendRunsIndexEntry(TEST_ROOT, "demo", {
      run_id: "run-1",
      started_at: "2026-05-20T12:00:00.000Z",
      finished_at: "2026-05-20T12:00:30.000Z",
      status: "passed",
      runtime: "hermes",
    });
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, "demo"), "utf-8"));
    expect(idx.runs).toHaveLength(1);
    expect(idx.runs[0].status).toBe("passed");
    expect(idx.runs[0].finished_at).toBe("2026-05-20T12:00:30.000Z");
  });
});

describe("UH-82 mirrorRuntimeResultToLatest", () => {
  test("copies runtime-result.yaml from runDir to missionDir atomically", async () => {
    const runId = "20260520T120000Z-deadbe";
    const runDir = await ensureRunDir(TEST_ROOT, "demo", runId);
    await writeFile(join(runDir, "runtime-result.yaml"), "status: passed\n", "utf-8");
    await mirrorRuntimeResultToLatest(TEST_ROOT, "demo", runId);
    const mirrored = await readFile(join(missionDir(TEST_ROOT, "demo"), "runtime-result.yaml"), "utf-8");
    expect(mirrored).toBe("status: passed\n");
  });

  test("is a no-op when the per-run runtime-result is absent", async () => {
    const runId = "20260520T120000Z-deadbe";
    await ensureRunDir(TEST_ROOT, "demo", runId);
    await mirrorRuntimeResultToLatest(TEST_ROOT, "demo", runId);
    // missionDir is created by ensureRunDir's parent; the runtime-result.yaml must not exist.
    await expect(
      readFile(join(missionDir(TEST_ROOT, "demo"), "runtime-result.yaml"), "utf-8"),
    ).rejects.toThrow();
  });
});

describe("UH-82 end-to-end per-run write flow", () => {
  test("a thin runner exercises ensureRunDir + pointer + mirror lifecycle", async () => {
    // Simulates what an adapter does end-to-end without invoking a real CLI.
    const missionId = "demo";
    const runId = "20260520T120000Z-abcdef";
    const startedAt = "2026-05-20T12:00:00.000Z";

    const runDir = await ensureRunDir(TEST_ROOT, missionId, runId);
    await writeLatestPointer(TEST_ROOT, missionId, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      status: "running",
    });
    await appendRunsIndexEntry(TEST_ROOT, missionId, {
      run_id: runId,
      started_at: startedAt,
      status: "running",
      runtime: "fake",
    });

    // Pretend the adapter wrote a few artifacts.
    await writeFile(join(runDir, "prompt.md"), "hello", "utf-8");
    await writeFile(join(runDir, "events.ndjson"), '{"event":"runtime.started"}\n', "utf-8");
    await writeFile(join(runDir, "runtime-result.yaml"), "schema_version: uh.runtime-result.v0\nstatus: passed\n", "utf-8");

    await mirrorRuntimeResultToLatest(TEST_ROOT, missionId, runId);

    const finishedAt = "2026-05-20T12:00:30.000Z";
    await writeLatestPointer(TEST_ROOT, missionId, {
      schema_version: "uh.latest-run.v0",
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "passed",
    });
    await appendRunsIndexEntry(TEST_ROOT, missionId, {
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: "passed",
      runtime: "fake",
    });

    // Per-run artifacts present.
    expect(await readFile(join(missionRunDir(TEST_ROOT, missionId, runId), "prompt.md"), "utf-8")).toBe("hello");
    expect(await readFile(join(missionRunDir(TEST_ROOT, missionId, runId), "events.ndjson"), "utf-8")).toContain("runtime.started");
    // Mission-level mirror present.
    expect(
      await readFile(join(missionDir(TEST_ROOT, missionId), "runtime-result.yaml"), "utf-8"),
    ).toContain("status: passed");
    // Pointer reflects terminal status.
    const pointer = await readLatestPointer(TEST_ROOT, missionId);
    expect(pointer?.status).toBe("passed");
    expect(pointer?.finished_at).toBe(finishedAt);
    // Runs index has the entry in terminal state.
    const idx = JSON.parse(await readFile(missionRunsIndex(TEST_ROOT, missionId), "utf-8"));
    expect(idx.runs).toHaveLength(1);
    expect(idx.runs[0].status).toBe("passed");
  });
});
