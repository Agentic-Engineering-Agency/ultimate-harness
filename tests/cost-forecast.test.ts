import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { missionDir, missionRunsIndex, missionRunDir } from "../src/harness/paths.js";
import { CAPABILITIES } from "../src/adapters/capabilities/index.js";
import { costUsd, forecastCost, readUsageHistory } from "../src/harness/cost-forecast.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-forecast-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

async function seedMission(id: string) {
  const dir = missionDir(TEST_ROOT, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "spec-first-feature",
  }), "utf-8");
}

async function seedRun(
  missionId: string,
  runId: string,
  usageLines: Array<{ input: number; output: number; source?: string }>,
  opts: { archived?: boolean } = {},
) {
  if (!opts.archived) {
    const runDir = missionRunDir(TEST_ROOT, missionId, runId);
    await mkdir(runDir, { recursive: true });
    const lines = [
      JSON.stringify({ event: "runtime.started", runtime: "codex", mission_id: missionId }),
      ...usageLines.map((u) =>
        JSON.stringify({
          event: "runtime.usage",
          runtime: "codex",
          mission_id: missionId,
          input_tokens: u.input,
          output_tokens: u.output,
          source: u.source ?? "estimated",
        }),
      ),
    ];
    await writeFile(join(runDir, "events.ndjson"), lines.join("\n") + "\n", "utf-8");
  }
}

async function writeRunsIndex(missionId: string, runs: Array<{ run_id: string; archived?: boolean }>) {
  await writeFile(missionRunsIndex(TEST_ROOT, missionId), JSON.stringify({
    schema_version: "uh.runs-index.v0",
    runs: runs.map((r) => ({
      run_id: r.run_id,
      started_at: "2026-05-20T00:00:00.000Z",
      status: "passed",
      ...(r.archived ? { archived: true } : {}),
    })),
  }), "utf-8");
}

describe("costUsd", () => {
  test("prices $/Mtok by cost class", () => {
    expect(costUsd("free", 1_000_000, 1_000_000)).toBe(0);
    // standard = {input:3, output:15} per Mtok
    expect(costUsd("standard", 1_000_000, 1_000_000)).toBeCloseTo(18, 6);
    expect(costUsd("cheap", 2_000_000, 0)).toBeCloseTo(0.5, 6);
  });
});

describe("readUsageHistory", () => {
  test("collects runtime.usage samples and skips archived runs", async () => {
    await seedMission("m1");
    await seedRun("m1", "r1", [{ input: 100, output: 50, source: "runtime" }]);
    await seedRun("m1", "r2", [{ input: 200, output: 100 }]);
    await seedRun("m1", "r-old", [{ input: 9999, output: 9999 }], { archived: true });
    await writeRunsIndex("m1", [{ run_id: "r1" }, { run_id: "r2" }, { run_id: "r-old", archived: true }]);

    const samples = await readUsageHistory(TEST_ROOT, "m1");
    expect(samples).toHaveLength(2);
    expect(samples.map((s) => s.input_tokens).sort((a, b) => a - b)).toEqual([100, 200]);
  });

  test("returns empty when no index exists", async () => {
    await seedMission("none");
    expect(await readUsageHistory(TEST_ROOT, "none")).toEqual([]);
  });
});

describe("forecastCost", () => {
  test("averages history and prices it (basis=history)", async () => {
    await seedMission("m2");
    await seedRun("m2", "r1", [{ input: 100, output: 50 }]);
    await seedRun("m2", "r2", [{ input: 300, output: 150 }]);
    await writeRunsIndex("m2", [{ run_id: "r1" }, { run_id: "r2" }]);

    const f = await forecastCost(TEST_ROOT, "m2", "codex");
    expect(f.basis).toBe("history");
    expect(f.runs_sampled).toBe(2);
    expect(f.est_input_tokens).toBe(200); // avg(100,300)
    expect(f.est_output_tokens).toBe(100); // avg(50,150)
    const cc = CAPABILITIES.codex.cost_class;
    expect(f.cost_class).toBe(cc);
    expect(f.est_cost_usd).toBeCloseTo(Number(costUsd(cc, 200, 100).toFixed(6)), 6);
  });

  test("falls back to heuristic when no usage history (basis=heuristic)", async () => {
    await seedMission("m3");
    const f = await forecastCost(TEST_ROOT, "m3", "codex");
    expect(f.basis).toBe("heuristic");
    expect(f.runs_sampled).toBe(0);
    expect(f.est_input_tokens).toBeGreaterThan(0);
    expect(f.est_output_tokens).toBe(Math.ceil(f.est_input_tokens * 0.5));
  });

  test("throws on unknown adapter", async () => {
    await seedMission("m4");
    // @ts-expect-error — exercising the runtime guard with an invalid id
    await expect(forecastCost(TEST_ROOT, "m4", "nope")).rejects.toThrow(/Unknown adapter/);
  });
});
