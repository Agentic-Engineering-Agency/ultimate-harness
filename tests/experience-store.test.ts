import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { indexRuns, paretoFrontier, summarizeRuns } from "../src/harness/experience-store.js";

let root: string;

const usageFixture = () => readFile(path.join(process.cwd(), "tests", "fixtures", "runtime-events", "command-code-usage.ndjson"), "utf8");

const pricesYaml = [
  "schema_version: uh.prices.v0",
  "models:",
  "  qwen/qwen3.8-flash:",
  "    input_usd_per_million: 2",
  "    output_usd_per_million: 8",
  "    cache_read_usd_per_million: 0.4",
  "    cache_write_usd_per_million: 1",
  '    source: "test placeholder, not a real price"',
].join("\n") + "\n";

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

  test("groups the same model reported under different identities onto one canonical key", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-model-"));
    await putRun("mission-a", "run-plain", {
      "runtime-result.yaml": result({ provider: "openrouter", model: "Qwen3.8-Flash" }),
    });
    await putRun("mission-a", "run-prefixed", {
      "runtime-result.yaml": result({ provider: "openrouter", model: "Qwen/Qwen3.8-Flash" }),
    });
    await putRun("mission-a", "run-spaced", {
      "runtime-result.yaml": result({ provider: "gateway", model: " qwen/qwen3.8-flash " }),
    });
    await putRun("mission-a", "run-other", {
      "runtime-result.yaml": result({ provider: "provider-c", model: "deepseek/deepseek-v4.1-flash" }),
    });

    const records = await indexRuns(root);
    const byModel = summarizeRuns(records, "model");
    const qwen = byModel.filter((summary) => summary.key === "qwen3.8-flash");
    expect(qwen).toHaveLength(1);
    expect(qwen[0]).toMatchObject({ runs: 3, passed: 3, success_rate: 1 });
    expect(byModel.find((summary) => summary.key === "deepseek-v4.1-flash")).toMatchObject({ runs: 1 });
    expect(byModel.some((summary) => summary.key === "Qwen/Qwen3.8-Flash")).toBe(false);

    // The raw reported model and provider stay on each record.
    expect(records.find((record) => record.run_id === "run-plain")).toMatchObject({
      model_key: "qwen3.8-flash", model: "Qwen3.8-Flash", provider: "openrouter",
    });
    expect(records.find((record) => record.run_id === "run-prefixed")).toMatchObject({
      model_key: "qwen3.8-flash", model: "Qwen/Qwen3.8-Flash", provider: "openrouter",
    });
    expect(records.find((record) => record.run_id === "run-spaced")).toMatchObject({
      model_key: "qwen3.8-flash", model: " qwen/qwen3.8-flash ", provider: "gateway",
    });
    expect(records.find((record) => record.run_id === "run-other")?.model_key).toBe("deepseek-v4.1-flash");
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

async function putArtifact(filePath: string, value: unknown | string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, typeof value === "string" ? value : filePath.endsWith(".yaml") ? stringify(value) : JSON.stringify(value), "utf8");
}

type TeamWorkerFixture = { id: string; role: string; missionId?: string; runId: string; status?: string; model?: string; cost?: number; events?: string };

/**
 * A team parent under `.harness/missions/<id>/team/` with one artifact scope
 * per worker, mirroring what `run-team` writes: the parent run plus a
 * `team-state.json` pointer to each worker's own canonical run.
 */
async function putTeamRun(missionId: string, parentRunId: string, workers: TeamWorkerFixture[]) {
  const missionRoot = path.join(root, ".harness", "missions", missionId);
  const teamRoot = path.join(missionRoot, "team");
  await putArtifact(path.join(missionRoot, "mission.yaml"), {
    schema_version: "uh.mission.v0", id: missionId, title: "Team mission", workflow_profile: "staged", shape: "team",
  });
  await putArtifact(path.join(missionRoot, "runs", parentRunId, "runtime-result.yaml"), {
    schema_version: "uh.runtime-result.v0", mission_id: missionId, runtime: "ultimate-harness-team", status: "passed",
    started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:05:00.000Z",
    prompt_path: "prompt.md", stdout_path: "stdout.log", stderr_path: "stderr.log",
  });
  await putArtifact(path.join(missionRoot, "runs", parentRunId, "team-state.json"), {
    schema_version: "uh.team-run.v0", mission_id: missionId, run_id: parentRunId, status: "passed",
    started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:05:00.000Z",
    integration_report_path: `.harness/missions/${missionId}/team/integration-report.md`,
    verification_status: null,
    leader: { role: "integrator", adapter: "hermes", status: "succeeded" },
    workers: workers.map((worker) => ({
      id: worker.id,
      role: worker.role,
      ...(worker.missionId ? { mission_id: worker.missionId } : {}),
      adapter: "command-code",
      run_id: worker.runId,
      artifact_scope: `artifacts/${parentRunId}/workers/${worker.id}`,
      runtime_result_path: null,
      status: worker.status ?? "succeeded",
      completion: "complete",
      started_at: "2026-09-21T10:00:00.000Z",
      finished_at: "2026-09-21T10:04:00.000Z",
    })),
  });
  for (const worker of workers) {
    const workerMissionId = worker.missionId ?? missionId;
    const workerMissionRoot = path.join(teamRoot, "artifacts", parentRunId, "workers", worker.id, ".harness", "missions", workerMissionId);
    await putArtifact(path.join(workerMissionRoot, "mission.yaml"), {
      schema_version: "uh.mission.v0", id: workerMissionId, title: `Worker ${worker.id}`, workflow_profile: "bugfix-contained",
    });
    await putArtifact(path.join(workerMissionRoot, "runs", worker.runId, "runtime-result.yaml"), {
      schema_version: "uh.runtime-result.v0", mission_id: workerMissionId, runtime: "command-code",
      status: worker.status ?? "passed",
      started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:04:00.000Z",
      prompt_path: "prompt.md", stdout_path: "stdout.log", stderr_path: "stderr.log",
      ...(worker.model ? { model: worker.model } : {}),
      ...(worker.cost !== undefined ? { cost_usd: worker.cost, cost_basis: "provider_reported" } : {}),
    });
    if (worker.events !== undefined) {
      await putArtifact(path.join(workerMissionRoot, "runs", worker.runId, "events.ndjson"), worker.events);
    }
  }
}

describe("experience store — team worker runs", () => {
  test("indexes team worker runs with the worker role and team mission id", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-team-"));
    await putTeamRun("team-1", "parent-1", [
      { id: "worker-a", role: "worker-a", missionId: "w1", runId: "run-wa", model: "provider/model", cost: 2 },
      { id: "worker-b", role: "worker-b", runId: "run-wb", status: "failed" },
    ]);

    const records = await indexRuns(root);
    expect(records).toHaveLength(3);

    const workerA = records.find((record) => record.run_id === "run-wa");
    expect(workerA).toMatchObject({
      mission_id: "w1",
      runtime: "command-code",
      team: { mission_id: "team-1", role: "worker-a" },
      cost_usd: 2,
      cost_source: "reported",
    });
    expect(workerA?.cost_unknown_reason).toBeUndefined();

    // A worker without its own mission id indexes under the team mission id.
    expect(records.find((record) => record.run_id === "run-wb")).toMatchObject({
      mission_id: "team-1",
      team: { mission_id: "team-1", role: "worker-b" },
      status: "failed",
    });

    // The parent team run is still indexed.
    expect(records.find((record) => record.run_id === "parent-1")).toMatchObject({ runtime: "ultimate-harness-team" });

    // Team worker runs are visible to template grouping.
    const summaries = summarizeRuns(records, "template");
    expect(summaries.reduce((total, summary) => total + summary.runs, 0)).toBe(3);
  });

  test("records why a costless Command Code worker's cost is unknown", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-team-cost-"));
    await putTeamRun("team-1", "parent-1", [{ id: "worker-a", role: "worker-a", runId: "run-wa" }]);

    const record = (await indexRuns(root)).find((candidate) => candidate.run_id === "run-wa");
    expect(record?.cost_usd).toBeUndefined();
    expect(record?.cost_source).toBeUndefined();
    expect(record?.cost_unknown_reason).toMatch(/command-code/i);
  });

  test("indexes native token totals and operator-priced cost for a Command Code worker", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-team-usage-"));
    await putTeamRun("team-1", "parent-1", [{ id: "worker-a", role: "worker-a", runId: "run-wa", events: await usageFixture() }]);
    await writeFile(path.join(root, ".harness", "prices.yaml"), pricesYaml, "utf8");

    const record = (await indexRuns(root)).find((candidate) => candidate.run_id === "run-wa");
    expect(record?.cost_usd).toBeCloseTo(0.0901648, 12);
    expect(record?.cost_source).toBe("estimated");
    expect(record?.cost_unknown_reason).toBeUndefined();
    expect(record?.token_totals).toEqual({ input: 39076, output: 580, cache_read: 18432, cache_write: 0 });
    // The stream names the model even though the result document does not.
    expect(record?.model).toBe("Qwen/Qwen3.8-Flash");
  });

  test("records token totals independent of price when no table entry prices the model", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-team-unpriced-"));
    await putTeamRun("team-1", "parent-1", [{ id: "worker-a", role: "worker-a", runId: "run-wa", events: await usageFixture() }]);

    const record = (await indexRuns(root)).find((candidate) => candidate.run_id === "run-wa");
    expect(record?.cost_usd).toBeUndefined();
    expect(record?.cost_source).toBeUndefined();
    expect(record?.cost_unknown_reason).toMatch(/Qwen\/Qwen3\.8-Flash/);
    expect(record?.cost_unknown_reason).toMatch(/prices\.yaml/);
    expect(record?.token_totals).toEqual({ input: 39076, output: 580, cache_read: 18432, cache_write: 0 });
  });

  test("does not double count a run reachable through its own mission", async () => {
    root = await mkdtemp(path.join(tmpdir(), "uh-experience-team-dedup-"));
    await putTeamRun("team-1", "parent-1", [{ id: "worker-a", role: "worker-a", missionId: "w1", runId: "run-wa" }]);
    // The same canonical run also lives under the mission the worker names, so
    // the plain walk reaches it too.
    await putRun("w1", "run-wa", {
      "runtime-result.yaml": result({ mission_id: "w1", runtime: "command-code", cost_usd: 5 }),
    });

    const records = await indexRuns(root);
    const workerRuns = records.filter((record) => record.run_id === "run-wa");
    expect(workerRuns).toHaveLength(1);
    expect(workerRuns[0].team).toEqual({ mission_id: "team-1", role: "worker-a" });
  });
});
