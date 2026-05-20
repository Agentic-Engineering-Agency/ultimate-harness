import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, stat, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { staleWorkerKind } from "../src/harness/validate/drift/kinds/stale-worker.js";
import { missingCompletionTimestampKind } from "../src/harness/validate/drift/kinds/missing-completion-timestamp.js";
import { truncatedEventsNdjsonKind } from "../src/harness/validate/drift/kinds/truncated-events-ndjson.js";
import { staleRenderKind } from "../src/harness/validate/drift/kinds/stale-render.js";
import { roadmapLinearDivergenceKind } from "../src/harness/validate/drift/kinds/roadmap-linear-divergence.js";
import { runDrift, groupByKind, DRIFT_KINDS } from "../src/harness/validate/drift/registry.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-drift-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

async function seedStaleWorker(missionId: string, role: string, pid: number): Promise<string> {
  const dir = join(TEST_ROOT, ".harness", "missions", missionId, "team", "workers", role);
  await mkdir(dir, { recursive: true });
  const lockPath = join(dir, "lock");
  await writeFile(lockPath, String(pid), "utf-8");
  return lockPath;
}

async function seedRuntimeResult(missionId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const dir = join(TEST_ROOT, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "runtime-result.yaml");
  await writeFile(path, stringify({
    schema_version: "uh.runtime-result.v0",
    mission_id: missionId,
    runtime: "hermes",
    status: "passed",
    started_at: "2026-05-19T00:00:00.000Z",
    finished_at: "2026-05-19T00:01:00.000Z",
    prompt_path: "prompt.md",
    stdout_path: "stdout.log",
    stderr_path: "stderr.log",
    errors: [],
    ...overrides,
  }), "utf-8");
  return path;
}

async function seedEventsNdjson(missionId: string, content: string): Promise<string> {
  const dir = join(TEST_ROOT, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "events.ndjson");
  await writeFile(path, content, "utf-8");
  return path;
}

describe("UH-77 stale-worker", () => {
  test("detects a dead-PID lock", async () => {
    await seedStaleWorker("m1", "frontend", 999999);
    const issues = await staleWorkerKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("stale-worker");
    expect(issues[0].metadata?.role).toBe("frontend");
  });

  test("skips a live-PID lock", async () => {
    await seedStaleWorker("m1", "frontend", process.pid);
    const issues = await staleWorkerKind.detect(TEST_ROOT);
    expect(issues).toEqual([]);
  });

  test("repair is idempotent: second call yields the same result", async () => {
    const lockPath = await seedStaleWorker("m1", "frontend", 999999);
    const [issue] = await staleWorkerKind.detect(TEST_ROOT);
    const first = await staleWorkerKind.repair(issue, TEST_ROOT);
    const second = await staleWorkerKind.repair(issue, TEST_ROOT);
    expect(first.outcome).toBe("repaired");
    expect(second.outcome).toBe("repaired");
    await expect(stat(lockPath)).rejects.toThrow();
  });
});

describe("UH-77 missing-completion-timestamp", () => {
  test("detects passed mission with missing finished_at", async () => {
    await seedRuntimeResult("m2", { finished_at: "" });
    const issues = await missingCompletionTimestampKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("missing-completion-timestamp");
  });

  test("ignores running missions", async () => {
    await seedRuntimeResult("m2", { status: "blocked", finished_at: "" });
    const issues = await missingCompletionTimestampKind.detect(TEST_ROOT);
    expect(issues).toEqual([]);
  });

  test("repair fills finished_at and is idempotent", async () => {
    await seedRuntimeResult("m2", { finished_at: "" });
    const [issue] = await missingCompletionTimestampKind.detect(TEST_ROOT);
    const first = await missingCompletionTimestampKind.repair(issue, TEST_ROOT);
    expect(first.outcome).toBe("repaired");
    const after1 = await missingCompletionTimestampKind.detect(TEST_ROOT);
    expect(after1).toEqual([]);
    const second = await missingCompletionTimestampKind.repair(issue, TEST_ROOT);
    expect(second.outcome).toBe("repaired");
  });
});

describe("UH-77 truncated-events-ndjson", () => {
  test("detects a non-JSON trailing line", async () => {
    const path = await seedEventsNdjson("m3", '{"event":"a"}\n{"partial":');
    const issues = await truncatedEventsNdjsonKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].target).toBe(path);
  });

  test("repair truncates and is idempotent", async () => {
    const path = await seedEventsNdjson("m3", '{"event":"a"}\n{"partial":');
    const [issue] = await truncatedEventsNdjsonKind.detect(TEST_ROOT);
    const first = await truncatedEventsNdjsonKind.repair(issue, TEST_ROOT);
    expect(first.outcome).toBe("repaired");
    expect((await readFile(path, "utf-8")).trim()).toBe('{"event":"a"}');
    const after = await truncatedEventsNdjsonKind.detect(TEST_ROOT);
    expect(after).toEqual([]);
    const second = await truncatedEventsNdjsonKind.repair(issue, TEST_ROOT);
    expect(second.outcome).toBe("repaired");
  });
});

describe("UH-77 stale-render (warn-only)", () => {
  test("warns when runtime-session.yaml is older than mission.yaml", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m4");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "mission.yaml"), "schema_version: uh.mission.v0\n", "utf-8");
    await writeFile(join(dir, "prompt.txt"), "prompt", "utf-8");
    await writeFile(join(dir, "runtime-session.yaml"), "schema_version: uh.runtime-session.v0\n", "utf-8");
    // Force session into the past.
    const past = new Date("2020-01-01T00:00:00Z");
    await utimes(join(dir, "runtime-session.yaml"), past, past);
    const issues = await staleRenderKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
    const repair = await staleRenderKind.repair(issues[0], TEST_ROOT);
    expect(repair.outcome).toBe("needs-human");
  });
});

describe("UH-77 roadmap-linear-divergence (warn-only)", () => {
  test("warns when mission ref is missing from ROADMAP", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m5");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id: "m5",
      title: "M5",
      workflow_profile: "spec-first-feature",
      issue_refs: [{ provider: "linear", id: "UH-999" }],
    }), "utf-8");
    await mkdir(join(TEST_ROOT, "docs"), { recursive: true });
    await writeFile(join(TEST_ROOT, "docs", "ROADMAP.md"), "# Roadmap\n\n- UH-1 done\n", "utf-8");
    const issues = await roadmapLinearDivergenceKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].metadata?.ref).toBe("UH-999");
    const repair = await roadmapLinearDivergenceKind.repair(issues[0], TEST_ROOT);
    expect(repair.outcome).toBe("needs-human");
  });

  test("no warning when ref is in ROADMAP", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m5");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id: "m5",
      title: "M5",
      workflow_profile: "spec-first-feature",
      issue_refs: [{ provider: "linear", id: "UH-1" }],
    }), "utf-8");
    await mkdir(join(TEST_ROOT, "docs"), { recursive: true });
    await writeFile(join(TEST_ROOT, "docs", "ROADMAP.md"), "# Roadmap\n\n- UH-1 done\n", "utf-8");
    const issues = await roadmapLinearDivergenceKind.detect(TEST_ROOT);
    expect(issues).toEqual([]);
  });
});

describe("UH-77 registry cap=2 settle", () => {
  test("runs detect-repair-detect with --repair=false (no mutation)", async () => {
    await seedStaleWorker("m6", "frontend", 999999);
    const before = await readFile(join(TEST_ROOT, ".harness", "missions", "m6", "team", "workers", "frontend", "lock"), "utf-8");
    const outcome = await runDrift(TEST_ROOT, { repair: false });
    expect(outcome.cycles).toBe(0);
    expect(outcome.repairs).toEqual([]);
    expect(outcome.issues.length).toBeGreaterThanOrEqual(1);
    const after = await readFile(join(TEST_ROOT, ".harness", "missions", "m6", "team", "workers", "frontend", "lock"), "utf-8");
    expect(after).toBe(before);
  });

  test("runs detect-repair-detect with --repair=true and settles", async () => {
    await seedStaleWorker("m6", "frontend", 999999);
    await seedRuntimeResult("m6", { finished_at: "" });
    await seedEventsNdjson("m6", '{"event":"a"}\n{"part');
    const outcome = await runDrift(TEST_ROOT, { repair: true });
    expect(outcome.cycles).toBeGreaterThan(0);
    expect(outcome.cycles).toBeLessThanOrEqual(2);
    expect(outcome.capReached).toBe(false);
    expect(outcome.issues).toEqual([]);
    expect(outcome.repairs.every((r) => r.outcome === "repaired")).toBe(true);
  });

  test("cap stops at 2 cycles when drift keeps reappearing", async () => {
    // We use a permanent warning-only kind to ensure repair loop terminates
    // even when issues never disappear.
    await seedStaleWorker("m6", "frontend", 999999); // repairable
    const dir = join(TEST_ROOT, ".harness", "missions", "m6");
    await writeFile(join(dir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id: "m6",
      title: "M6",
      workflow_profile: "spec-first-feature",
      issue_refs: [{ provider: "linear", id: "UH-9999" }],
    }), "utf-8");
    await mkdir(join(TEST_ROOT, "docs"), { recursive: true });
    await writeFile(join(TEST_ROOT, "docs", "ROADMAP.md"), "no refs\n", "utf-8");

    const outcome = await runDrift(TEST_ROOT, { repair: true });
    // Stale worker repaired; warning-only divergence remains.
    expect(outcome.issues.every((i) => i.severity === "warn")).toBe(true);
    expect(outcome.cycles).toBeLessThanOrEqual(2);
  });

  test("groupByKind buckets issues by kind", async () => {
    await seedStaleWorker("m7", "frontend", 999999);
    await seedStaleWorker("m7", "backend", 999998);
    const outcome = await runDrift(TEST_ROOT);
    const grouped = groupByKind(outcome.issues);
    expect(grouped["stale-worker"].length).toBeGreaterThanOrEqual(2);
    expect(grouped["truncated-events-ndjson"]).toEqual([]);
  });

  test("DRIFT_KINDS exposes the six declared kinds", () => {
    const kinds = DRIFT_KINDS.map((k) => k.kind);
    expect(new Set(kinds)).toEqual(new Set([
      "stale-worker",
      "orphaned-worktree",
      "missing-completion-timestamp",
      "truncated-events-ndjson",
      "stale-render",
      "roadmap-linear-divergence",
    ]));
  });
});
