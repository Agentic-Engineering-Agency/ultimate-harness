import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { indexRuns, paretoFrontier, summarizeRuns } from "../src/harness/experience-store.js";

let root: string;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function putRun(missionId: string, runId: string, files: Record<string, unknown | string>) {
  const dir = path.join(root, ".harness", "missions", missionId, "runs", runId);
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(dir, name), typeof value === "string" ? value : name.endsWith(".yaml") ? stringify(value) : JSON.stringify(value), "utf8");
  }
  return dir;
}

const result = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "uh.runtime-result.v0", mission_id: "mission-a", runtime: "hermes", status: "passed",
  started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:00:02.000Z",
  prompt_path: "prompt.md", stdout_path: "stdout.log", stderr_path: "stderr.log",
  provider: "provider-a", model: "model-a", usage: { source: "runtime", input_tokens: 100, output_tokens: 20, cache_read_tokens: 30, cache_write_tokens: 10, cost_usd: 1.25, cost_basis: "provider_reported" },
  ...overrides,
});

const control = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "uh.runtime-control.v0", mission_id: "mission-a", run_id: "run-a", runtime: "hermes",
  controller_pid: 1, started_at: "2026-09-21T10:00:00.000Z", heartbeat_at: "2026-09-21T10:00:02.000Z",
  status: "passed", turns: 4, denials: 1, inflight_tools: 0, peak_memory_bytes: 4096, ...overrides,
});

describe("experience store", () => {
  test("indexes readable settled artifacts without inventing missing values", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-"));
    await putRun("mission-a", "run-a", {
      "mission.yaml": { schema_version: "uh.mission.v0", id: "mission-a", title: "A", workflow_profile: "spec-first-feature" },
      "runtime-result.yaml": result(), "runtime-control.json": control(),
      "verification.yaml": { schema_version: "uh.verification-result.v0", mission_id: "mission-a", status: "passed", checks: [] },
      "session-template.json": { template_id: "balanced", tier: "balanced", containment: "standard", overridden_by_mission: [] },
    });
    await writeFile(path.join(root, ".harness", "missions", "mission-a", "mission.yaml"), stringify({
      schema_version: "uh.mission.v0", id: "mission-a", title: "A", workflow_profile: "spec-first-feature",
    }), "utf8");
    await putRun("mission-a", "run-b", {
      "runtime-result.yaml": result({ status: "failed", provider: undefined, model: undefined, usage: { source: "runtime" }, cost_usd: undefined, cost_basis: undefined }),
      "runtime-control.json": control({ run_id: "run-b", status: "failed", stop_code: "timeout", stop_reason: "deadline exceeded", turns: 2, denials: 0, peak_memory_bytes: undefined }),
    });
    await putRun("mission-a", "run-c", {
      "runtime-result.yaml": result({ status: "passed", runtime: "codex", provider: "provider-b", model: "model-b", usage: { source: "runtime", input_tokens: 10, output_tokens: 2, cost_usd: 0.5, cost_basis: "runtime_estimate" } }),
      "runtime-control.json": control({ run_id: "run-c", runtime: "codex", turns: 3, denials: 0 }),
      "runtime-recovery.json": { schema_version: "uh.runtime-recovery.v0", source_run_id: "run-b", session_id: "saved", notes: "resume" },
    });
    await putRun("mission-a", "truncated", { "runtime-control.json": "{\"schema_version\":" });

    const records = await indexRuns(root);
    expect(records).toHaveLength(3);
    expect(records.find((record) => record.run_id === "run-a")).toMatchObject({
      mission_id: "mission-a", workflow_profile: "spec-first-feature", duration_ms: 2000,
      turns: 4, denials: 1, cost_usd: 1.25, verification_status: "passed", peak_memory_bytes: 4096,
      template_id: "balanced", tier: "balanced",
    });
    expect(records.find((record) => record.run_id === "run-b")).toMatchObject({ status: "failed", stop_code: "timeout" });
    expect(records.find((record) => record.run_id === "run-b")?.cost_usd).toBeUndefined();
    expect(records.find((record) => record.run_id === "run-b")?.template_id).toBeUndefined();
    expect(records.find((record) => record.run_id === "run-b")?.tier).toBeUndefined();
    expect(records.find((record) => record.run_id === "run-c")).toMatchObject({ resumed_from: "run-b", runtime: "codex" });
  });

  test("filters missions and summarizes known cost only", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-"));
    await putRun("one", "one-pass", { "runtime-result.yaml": result({ mission_id: "one", cost_usd: 2 }), "runtime-control.json": control({ mission_id: "one", run_id: "one-pass" }) });
    await putRun("two", "two-pass", { "runtime-result.yaml": result({ mission_id: "two", runtime: "codex", cost_usd: 9 }), "runtime-control.json": control({ mission_id: "two", run_id: "two-pass", runtime: "codex" }) });
    const records = await indexRuns(root, { missionId: "one" });
    expect(records).toHaveLength(1);
    const all = await indexRuns(root);
    const summaries = summarizeRuns(all, "runtime");
    expect(summaries.find((summary) => summary.key === "hermes")).toMatchObject({ runs: 1, passed: 1, success_rate: 1, known_cost_runs: 1, total_cost_usd: 2, mean_cost_usd: 2 });
  });

  test("groups runs by adopted template id and tier, leaving runs without the file ungrouped", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-"));
    await putRun("mission-a", "run-balanced", {
      "runtime-result.yaml": result({ mission_id: "mission-a" }),
      "runtime-control.json": control({ mission_id: "mission-a", run_id: "run-balanced" }),
      "session-template.json": { template_id: "balanced", tier: "balanced", containment: "standard", overridden_by_mission: [] },
    });
    await putRun("mission-a", "run-cheap", {
      "runtime-result.yaml": result({ mission_id: "mission-a" }),
      "runtime-control.json": control({ mission_id: "mission-a", run_id: "run-cheap" }),
      "session-template.json": { template_id: "low-cost", tier: "low-cost", containment: "standard", overridden_by_mission: ["limits"] },
    });
    await putRun("mission-a", "run-untemplated", {
      "runtime-result.yaml": result({ mission_id: "mission-a" }),
      "runtime-control.json": control({ mission_id: "mission-a", run_id: "run-untemplated" }),
    });

    const records = await indexRuns(root);
    const untemplated = records.find((record) => record.run_id === "run-untemplated");
    expect(untemplated?.template_id).toBeUndefined();
    expect(untemplated?.tier).toBeUndefined();

    const byTemplate = summarizeRuns(records, "template");
    expect(byTemplate.find((summary) => summary.key === "balanced")).toMatchObject({ runs: 1, passed: 1, success_rate: 1 });
    expect(byTemplate.find((summary) => summary.key === "low-cost")).toMatchObject({ runs: 1, passed: 1 });
    expect(byTemplate.find((summary) => summary.key === undefined)).toMatchObject({ runs: 1, passed: 1 });

    const byTier = summarizeRuns(records, "tier");
    expect(byTier.find((summary) => summary.key === "balanced")).toMatchObject({ runs: 1 });
    expect(byTier.find((summary) => summary.key === "low-cost")).toMatchObject({ runs: 1 });
    expect(byTier.find((summary) => summary.key === undefined)).toMatchObject({ runs: 1 });
  });

  test("removes dominated groups and never treats unknown cost as free", () => {
    const summaries = [
      { key: "cheap-success", runs: 2, passed: 2, success_rate: 1, known_cost_runs: 2, total_cost_usd: 2, mean_cost_usd: 1, mean_duration_ms: 1, cache_read_share: 0 },
      { key: "dominated", runs: 2, passed: 1, success_rate: 0.5, known_cost_runs: 2, total_cost_usd: 10, mean_cost_usd: 5, mean_duration_ms: 2, cache_read_share: 0 },
      { key: "unknown-cost", runs: 1, passed: 1, success_rate: 1, known_cost_runs: 0, total_cost_usd: 0, mean_cost_usd: undefined, mean_duration_ms: undefined, cache_read_share: undefined },
    ];
    expect(paretoFrontier(summaries)).toEqual([summaries[0]]);
  });
});
