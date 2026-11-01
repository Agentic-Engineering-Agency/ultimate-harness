import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";

const execFileP = promisify(execFile);

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-observatory-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) {
    await rm(TEST_ROOT, { recursive: true, force: true });
  }
});

async function runUh(args: string[]) {
  return execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    timeout: 30_000,
    env: {
      ...process.env,
      UH_TELEMETRY: "",
      UH_POSTHOG_API_KEY: "",
    },
  });
}

async function runUhFailure(args: string[]) {
  try {
    const result = await runUh(args);
    throw new Error(`expected uh ${args.join(" ")} to fail, got stdout=${result.stdout} stderr=${result.stderr}`);
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    expect(e.code).not.toBe(0);
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code };
  }
}

async function createFixtureRuns(missionId = "mission-alpha") {
  const missionDir = join(TEST_ROOT, ".harness", "missions", missionId);
  const runsDir = join(missionDir, "runs");
  await mkdir(runsDir, { recursive: true });

  // Mission document
  await writeFile(
    join(missionDir, "mission.yaml"),
    stringify({
      schema_version: "uh.mission.v0",
      id: missionId,
      title: "Observatory Test Mission",
      workflow_profile: "spec-first-feature",
      objective: "Test observatory runs and export commands",
    }),
    "utf-8",
  );

  // Fixture Run 1: Passed run with known cost and duration
  const run1Dir = join(runsDir, "run-pass-1");
  await mkdir(run1Dir, { recursive: true });
  await writeFile(
    join(run1Dir, "runtime-result.yaml"),
    stringify({
      schema_version: "uh.runtime-result.v0",
      mission_id: missionId,
      runtime: "hermes",
      status: "passed",
      started_at: "2026-09-21T10:00:00.000Z",
      finished_at: "2026-09-21T10:00:02.000Z",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
      provider: "provider-a",
      model: "model-a",
      cost_usd: 1.25,
      usage: {
        source: "runtime",
        input_tokens: 100,
        output_tokens: 20,
        cost_usd: 1.25,
      },
    }),
    "utf-8",
  );
  await writeFile(
    join(run1Dir, "runtime-control.json"),
    JSON.stringify({
      schema_version: "uh.runtime-control.v0",
      mission_id: missionId,
      run_id: "run-pass-1",
      runtime: "hermes",
      controller_pid: 1234,
      started_at: "2026-09-21T10:00:00.000Z",
      heartbeat_at: "2026-09-21T10:00:02.000Z",
      status: "passed",
      turns: 3,
      denials: 0,
      inflight_tools: 0,
    }),
    "utf-8",
  );
  await writeFile(
    join(run1Dir, "events.ndjson"),
    [
      JSON.stringify({ type: "session_start", timestamp: "2026-09-21T10:00:00.000Z" }),
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", model: "model-a", usage: { input_tokens: 100, output_tokens: 20 } },
        timestamp: "2026-09-21T10:00:01.000Z",
      }),
    ].join("\n") + "\n",
    "utf-8",
  );

  // Fixture Run 2: Failed run with unknown cost, duration, and stop_code
  const run2Dir = join(runsDir, "run-fail-2");
  await mkdir(run2Dir, { recursive: true });
  await writeFile(
    join(run2Dir, "runtime-result.yaml"),
    stringify({
      schema_version: "uh.runtime-result.v0",
      mission_id: missionId,
      runtime: "codex",
      status: "failed",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
    }),
    "utf-8",
  );
  await writeFile(
    join(run2Dir, "runtime-control.json"),
    JSON.stringify({
      schema_version: "uh.runtime-control.v0",
      mission_id: missionId,
      run_id: "run-fail-2",
      runtime: "codex",
      controller_pid: 5678,
      started_at: "2026-09-21T10:05:00.000Z",
      heartbeat_at: "2026-09-21T10:05:05.000Z",
      status: "failed",
      stop_code: "timeout",
      stop_reason: "Execution exceeded timeout",
      turns: 1,
      denials: 0,
      inflight_tools: 0,
    }),
    "utf-8",
  );
  await writeFile(
    join(run2Dir, "events.ndjson"),
    JSON.stringify({ type: "session_start", timestamp: "2026-09-21T10:05:00.000Z" }) + "\n",
    "utf-8",
  );

  // Pointer to latest run (pointing to run-pass-1)
  await writeFile(
    join(missionDir, "latest.json"),
    JSON.stringify({
      schema_version: "uh.latest-run.v0",
      run_id: "run-pass-1",
      started_at: "2026-09-21T10:00:00.000Z",
      finished_at: "2026-09-21T10:00:02.000Z",
      status: "passed",
    }),
    "utf-8",
  );

  // Runs index
  await writeFile(
    join(runsDir, "index.json"),
    JSON.stringify({
      schema_version: "uh.runs-index.v0",
      mission_id: missionId,
      entries: [
        { run_id: "run-pass-1", started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:00:02.000Z", status: "passed", runtime: "hermes" },
        { run_id: "run-fail-2", started_at: "2026-09-21T10:05:00.000Z", status: "failed", runtime: "codex" },
      ],
    }),
    "utf-8",
  );
}

async function createArmRuns(missionId: string, arms: Array<{ template: string; passed: number; failed: number; cost?: number }>) {
  const missionDir = join(TEST_ROOT, ".harness", "missions", missionId);
  const runsDir = join(missionDir, "runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    join(missionDir, "mission.yaml"),
    stringify({
      schema_version: "uh.mission.v0",
      id: missionId,
      title: "Arm Comparison Mission",
      workflow_profile: "spec-first-feature",
      objective: "Compare two session templates",
    }),
    "utf-8",
  );

  for (const armSpec of arms) {
    for (const [index, status] of Array.from({ length: armSpec.passed + armSpec.failed }, (_, i) => (i < armSpec.passed ? "passed" : "failed")).entries()) {
      const runId = `${armSpec.template}-${status}-${index}`;
      const runDir = join(runsDir, runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, "runtime-result.yaml"),
        stringify({
          schema_version: "uh.runtime-result.v0",
          mission_id: missionId,
          runtime: "hermes",
          status,
          started_at: "2026-09-21T10:00:00.000Z",
          finished_at: "2026-09-21T10:00:02.000Z",
          prompt_path: "prompt.md",
          stdout_path: "stdout.log",
          stderr_path: "stderr.log",
          provider: "provider-a",
          model: "model-a",
          usage: armSpec.cost === undefined
            ? { source: "runtime", input_tokens: 100, output_tokens: 20 }
            : { source: "runtime", input_tokens: 100, output_tokens: 20, cost_usd: armSpec.cost, cost_basis: "provider_reported" },
        }),
        "utf-8",
      );
      await writeFile(
        join(runDir, "session-template.json"),
        JSON.stringify({ template_id: armSpec.template, tier: armSpec.template, containment: "standard", overridden_by_mission: [] }),
        "utf-8",
      );
    }
  }
}

describe("uh observatory runs", () => {
  test("lists runs in JSON format matching RunRecord shape", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--json"]);
    const records = JSON.parse(stdout) as Array<{
      mission_id: string;
      run_id: string;
      runtime?: string;
      status?: string;
      stop_code?: string;
      cost_usd?: number;
      cost_source?: string;
      duration_ms?: number;
      token_totals?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
    }>;

    expect(Array.isArray(records)).toBe(true);
    expect(records).toHaveLength(2);

    const run1 = records.find((r) => r.run_id === "run-pass-1");
    expect(run1).toBeDefined();
    expect(run1).toMatchObject({
      mission_id: "mission-alpha",
      run_id: "run-pass-1",
      runtime: "hermes",
      status: "passed",
      duration_ms: 2000,
      cost_usd: 1.25,
      cost_source: "estimated",
      token_totals: { input: 100, output: 20 },
    });

    const run2 = records.find((r) => r.run_id === "run-fail-2");
    expect(run2).toBeDefined();
    expect(run2).toMatchObject({
      mission_id: "mission-alpha",
      run_id: "run-fail-2",
      runtime: "codex",
      status: "failed",
      stop_code: "timeout",
    });
    expect(run2?.cost_usd).toBeUndefined();
    expect(run2?.duration_ms).toBeUndefined();
  });

  test("renders plain aligned table and prints unknown for missing values, never 0", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT]);

    // Check table headers
    expect(stdout).toMatch(/MISSION_ID\s+RUN_ID\s+RUNTIME\s+MODEL\s+WORKFLOW_PROFILE\s+STATUS\s+STOP_CODE\s+DURATION\s+TOKENS\s+COST\s+COST_SOURCE/);

    // Run 1 has known values
    expect(stdout).toContain("run-pass-1");
    expect(stdout).toContain("hermes");
    expect(stdout).toContain("2000ms");
    expect(stdout).toContain("$1.25");

    // Run 2 has missing cost and duration: must render as "unknown", NEVER as 0 or $0
    expect(stdout).toContain("run-fail-2");
    expect(stdout).toContain("codex");
    expect(stdout).toContain("timeout");

    // The line for run-fail-2 must have "unknown" in the duration and cost columns
    const lines = stdout.trim().split("\n");
    const run2Line = lines.find((l) => l.includes("run-fail-2"));
    expect(run2Line).toBeDefined();
    expect(run2Line).toContain("unknown");
    // Ensure run-fail-2 never renders 0 or $0
    expect(run2Line).not.toMatch(/\$0(?:\.0+)?(?:\s|$)/);
    expect(run2Line).not.toMatch(/\s0ms(?:\s|$)/);
  });

  test("supports --group-by with --json returning summaries and pareto_frontier", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--group-by", "runtime", "--json"]);
    const parsed = JSON.parse(stdout) as {
      summaries: Array<{
        key?: string;
        runs: number;
        passed: number;
        success_rate: number;
        mean_cost_usd?: number;
      }>;
      pareto_frontier: Array<{ key?: string }>;
    };

    expect(parsed.summaries).toBeDefined();
    expect(parsed.pareto_frontier).toBeDefined();
    expect(parsed.summaries.length).toBe(2);

    const hermes = parsed.summaries.find((s) => s.key === "hermes");
    expect(hermes).toMatchObject({
      key: "hermes",
      runs: 1,
      passed: 1,
      success_rate: 1,
      mean_cost_usd: 1.25,
    });

    const codex = parsed.summaries.find((s) => s.key === "codex");
    expect(codex).toMatchObject({
      key: "codex",
      runs: 1,
      passed: 0,
      success_rate: 0,
    });
    expect(codex?.mean_cost_usd).toBeUndefined();

    // Hermes has 100% success rate with known cost, so it's on the pareto frontier
    expect(parsed.pareto_frontier.map((p) => p.key)).toContain("hermes");
  });

  test("renders plain aligned table for --group-by marking pareto frontier and unknown values", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--group-by", "runtime"]);

    expect(stdout).toMatch(/RUNTIME\s+RUNS\s+PASSED\s+SUCCESS_RATE\s+MEAN_COST\s+TOTAL_COST\s+MEAN_DURATION\s+PARETO/);
    expect(stdout).toContain("hermes");
    expect(stdout).toContain("codex");

    const lines = stdout.trim().split("\n");
    const hermesLine = lines.find((l) => l.includes("hermes"));
    expect(hermesLine).toBeDefined();
    expect(hermesLine).toContain("yes");

    const codexLine = lines.find((l) => l.includes("codex"));
    expect(codexLine).toBeDefined();
    expect(codexLine).toContain("no");
    // codex unknown mean cost rendered as unknown, never 0
    expect(codexLine).toContain("unknown");
    expect(codexLine).not.toMatch(/\$0(?:\.0+)?(?:\s|$)/);
  });

  test("rejects invalid --group-by dimension", async () => {
    await createFixtureRuns("mission-alpha");

    const res = await runUhFailure(["observatory", "runs", "--root", TEST_ROOT, "--group-by", "invalid_dim"]);
    expect(`${res.stdout}${res.stderr}`).toMatch(/must be one of runtime, model, workflow_profile, stop_code/i);
  });

  test("groups model spellings onto one canonical key row in --group-by model", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "model-group");
    const runsDir = join(missionDir, "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      stringify({
        schema_version: "uh.mission.v0",
        id: "model-group",
        title: "Model Identity",
        workflow_profile: "spec-first-feature",
        objective: "One model reported under several spellings",
      }),
      "utf-8",
    );
    const spellings = ["Qwen3.8-Flash", "Qwen/Qwen3.8-Flash", "qwen/qwen3.8-flash"];
    for (const [index, model] of spellings.entries()) {
      const runDir = join(runsDir, `run-spelled-${index}`);
      await mkdir(runDir, { recursive: true });
      await writeFile(
        join(runDir, "runtime-result.yaml"),
        stringify({
          schema_version: "uh.runtime-result.v0",
          mission_id: "model-group",
          runtime: "hermes",
          status: "passed",
          started_at: "2026-09-22T00:00:00.000Z",
          finished_at: "2026-09-22T00:00:02.000Z",
          prompt_path: "prompt.md",
          stdout_path: "stdout.log",
          stderr_path: "stderr.log",
          provider: "openrouter",
          model,
          usage: { source: "runtime", input_tokens: 10, output_tokens: 2 },
        }),
        "utf-8",
      );
    }

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--group-by", "model", "--json"]);
    const parsed = JSON.parse(stdout) as { summaries: Array<{ key?: string; runs: number; passed: number }> };
    expect(parsed.summaries).toHaveLength(1);
    expect(parsed.summaries[0]).toMatchObject({ key: "qwen3.8-flash", runs: 3, passed: 3 });

    const { stdout: plain } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--group-by", "model"]);
    expect(plain).toMatch(/MODEL\s+RUNS\s+PASSED/);
    const row = plain.split("\n").find((line) => line.includes("qwen3.8-flash"));
    expect(row).toBeDefined();
    expect(row).toMatch(/\s3\s/);
    // The table shows the canonical key, never a raw reported spelling.
    expect(plain).not.toContain("Qwen/");
  });

  test("shows native token totals and operator-priced provenance for a command-code run", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "mission-cmdc");
    const runDir = join(missionDir, "runs", "run-cmdc-usage");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      stringify({
        schema_version: "uh.mission.v0",
        id: "mission-cmdc",
        title: "Command Code Usage",
        workflow_profile: "spec-first-feature",
        objective: "Test native token totals",
      }),
      "utf-8",
    );
    await writeFile(
      join(runDir, "runtime-result.yaml"),
      stringify({
        schema_version: "uh.runtime-result.v0",
        mission_id: "mission-cmdc",
        runtime: "command-code",
        status: "passed",
        started_at: "2026-09-22T00:00:00.000Z",
        finished_at: "2026-09-22T00:01:00.000Z",
        prompt_path: "prompt.md",
        stdout_path: "stdout.log",
        stderr_path: "stderr.log",
      }),
      "utf-8",
    );
    await writeFile(
      join(runDir, "events.ndjson"),
      await readFile(join(process.cwd(), "tests", "fixtures", "runtime-events", "command-code-usage.ndjson"), "utf-8"),
      "utf-8",
    );
    await writeFile(
      join(TEST_ROOT, ".harness", "prices.yaml"),
      [
        "schema_version: uh.prices.v0",
        "models:",
        "  qwen/qwen3.8-flash:",
        "    input_usd_per_million: 2",
        "    output_usd_per_million: 8",
        "    cache_read_usd_per_million: 0.4",
        "    cache_write_usd_per_million: 1",
        '    source: "test placeholder, not a real price"',
      ].join("\n") + "\n",
      "utf-8",
    );

    const { stdout } = await runUh(["observatory", "runs", "--root", TEST_ROOT]);
    const line = stdout.split("\n").find((l) => l.includes("run-cmdc-usage"));
    expect(line).toBeDefined();
    // 39076 input + 580 output + 18432 cache-read + 0 cache-write.
    expect(line).toContain("58088");
    expect(line).toContain("$0.0902");
    expect(line).toContain("estimated");

    const { stdout: json } = await runUh(["observatory", "runs", "--root", TEST_ROOT, "--json"]);
    const record = (JSON.parse(json) as Array<{
      run_id: string;
      cost_usd?: number;
      cost_source?: string;
      token_totals?: { input?: number; output?: number; cache_read?: number; cache_write?: number };
    }>).find((r) => r.run_id === "run-cmdc-usage");
    expect(record?.token_totals).toEqual({ input: 39076, output: 580, cache_read: 18432, cache_write: 0 });
    expect(record?.cost_usd).toBeCloseTo(0.0901648, 12);
    expect(record?.cost_source).toBe("estimated");
  });
});

describe("uh observatory export", () => {
  test("requires --otlp option", async () => {
    await createFixtureRuns("mission-alpha");

    const res = await runUhFailure(["observatory", "export", "mission-alpha", "--root", TEST_ROOT]);
    expect(`${res.stdout}${res.stderr}`).toContain("--otlp");
  });

  test("exports latest run to stdout as OTLP JSON structure", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh(["observatory", "export", "mission-alpha", "--otlp", "--root", TEST_ROOT]);
    const exportData = JSON.parse(stdout) as {
      resourceSpans?: Array<{
        resource: { attributes: Array<{ key: string; value: unknown }> };
        scopeSpans: Array<{
          spans: Array<{
            name: string;
            traceId: string;
            spanId: string;
            attributes: Array<{ key: string; value: unknown }>;
          }>;
        }>;
      }>;
    };

    expect(exportData.resourceSpans).toBeDefined();
    expect(exportData.resourceSpans!.length).toBeGreaterThan(0);
    const spans = exportData.resourceSpans![0].scopeSpans[0].spans;
    expect(spans.length).toBeGreaterThan(0);
    // Root span exists
    expect(spans[0].traceId).toBeDefined();
    expect(spans[0].spanId).toBeDefined();
  });

  test("exports specific run with --run-id and includes tool targets when requested", async () => {
    await createFixtureRuns("mission-alpha");

    const { stdout } = await runUh([
      "observatory",
      "export",
      "mission-alpha",
      "--otlp",
      "--run-id",
      "run-pass-1",
      "--include-tool-targets",
      "--root",
      TEST_ROOT,
    ]);
    const exportData = JSON.parse(stdout) as { resourceSpans?: unknown[] };
    expect(exportData.resourceSpans).toBeDefined();
  });

  test("writes export to --out file inside project root", async () => {
    await createFixtureRuns("mission-alpha");

    const outRel = "exported-trace.json";
    const { stdout } = await runUh([
      "observatory",
      "export",
      "mission-alpha",
      "--otlp",
      "--run-id",
      "run-pass-1",
      "--out",
      outRel,
      "--root",
      TEST_ROOT,
    ]);

    expect(stdout).toBe("");
    const fileContent = await readFile(join(TEST_ROOT, outRel), "utf-8");
    const parsed = JSON.parse(fileContent) as { resourceSpans?: unknown[] };
    expect(parsed.resourceSpans).toBeDefined();
  });

  test("refuses --out path outside project root", async () => {
    await createFixtureRuns("mission-alpha");

    const outsidePath = "../outside-trace.json";
    const res = await runUhFailure([
      "observatory",
      "export",
      "mission-alpha",
      "--otlp",
      "--run-id",
      "run-pass-1",
      "--out",
      outsidePath,
      "--root",
      TEST_ROOT,
    ]);

    expect(`${res.stdout}${res.stderr}`).toMatch(/--out path must resolve inside the project root/i);
    // Ensure file was not created outside root
    await expect(access(join(TEST_ROOT, outsidePath))).rejects.toThrow();
  });
});

describe("uh mission run terminal contract", () => {
  test("preflight failure prints [BLOCKED] and exits with code 2", async () => {
    const missionPath = join(TEST_ROOT, "blocked-mission.yaml");
    await writeFile(
      missionPath,
      stringify({
        schema_version: "uh.mission.v0",
        id: "blocked-mission",
        title: "Blocked Mission",
        workflow_profile: "spec-first-feature",
        objective: "Test blocked preflight",
        runtime_requirements: {
          min_context_tokens: 999999999,
        },
      }),
      "utf-8",
    );

    const res = await runUhFailure(["mission", "run", missionPath, "--runtime", "hermes", "--root", TEST_ROOT]);
    expect(res.code).toBe(2);
    expect(`${res.stdout}${res.stderr}`).toContain("[BLOCKED]");
  });

  test("prints UH_RESULT as the last line with relative run_dir and suppressed output on --quiet", async () => {
    // Copy hermes adapter manifest
    await mkdir(join(TEST_ROOT, ".harness", "adapters"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
      await readFile(join(process.cwd(), ".harness", "adapters", "hermes.yaml"), "utf-8"),
      "utf-8",
    );

    const missionDir = join(TEST_ROOT, ".harness", "missions", "spine-test");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      stringify({
        schema_version: "uh.mission.v0",
        id: "spine-test",
        title: "Spine Test",
        workflow_profile: "spec-first-feature",
        objective: "Test quiet run",
      }),
      "utf-8",
    );

    const res = await runUhFailure(["mission", "run", missionPath, "--runtime", "hermes", "--root", TEST_ROOT, "--quiet"]);
    expect(res.code).toBe(2);

    const lines = res.stdout.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toMatch(/^UH_RESULT /);

    const payload = JSON.parse(lastLine.slice("UH_RESULT ".length)) as {
      mission_id: string;
      run_id: string;
      runtime: string;
      status: string;
      stop_code?: string;
      exit_code: number;
      run_dir: string;
    };

    expect(payload.mission_id).toBe("spine-test");
    expect(payload.runtime).toBe("hermes");
    expect(payload.run_id).toBeDefined();
    expect(payload.status).toBe("blocked");
    expect(payload.exit_code).toBe(2);
    expect(payload.run_dir).toBe(`.harness/missions/spine-test/runs/${payload.run_id}`);
    // Verify no absolute paths
    expect(payload.run_dir).not.toContain(":");
    expect(payload.run_dir.startsWith("/")).toBe(false);
    expect(payload.run_dir).not.toContain("\\");

    // With --quiet, runtime prompt/query output should be suppressed
    expect(res.stdout).not.toContain("=== Rendered mission prompt ===");
    expect(res.stdout).not.toContain("=== End mission prompt ===");
  });
});

describe("uh observatory compare", () => {
  const COMPARE_MISSION = "compare-mission";

  type ComparisonJson = {
    by: string;
    a_value: string;
    b_value: string;
    comparison: {
      a: { runs: number; passed: number; success_rate: number; interval: { low: number; high: number }; known_cost_runs: number; total_cost_usd?: number; mean_cost_usd?: number; cost_per_success_usd?: number; mean_duration_ms?: number };
      b: ComparisonJson["comparison"]["a"];
      delta_success_rate: number;
      intervals_overlap: boolean;
      cheaper_per_success: string;
      verdict: string;
    };
    plain_repeats_of_weaker: {
      arm: string;
      value: string;
      baseline_success_rate: number;
      target_success_rate: number;
      attempts?: number;
      reaches_target: boolean;
      mean_cost_usd?: number;
      total_cost_usd?: number;
    };
  };

  async function createTemplateArms() {
    await createArmRuns(COMPARE_MISSION, [
      { template: "strict", passed: 9, failed: 1, cost: 2 },
      { template: "loose", passed: 2, failed: 8, cost: 1 },
      { template: "opaque", passed: 1, failed: 4 },
    ]);
  }

  test("compares two template arms on outcome and cost in JSON", async () => {
    await createTemplateArms();

    const { stdout } = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict", "--b", "loose", "--json"]);
    const parsed = JSON.parse(stdout) as ComparisonJson;

    expect(parsed.by).toBe("template");
    expect(parsed.a_value).toBe("strict");
    expect(parsed.b_value).toBe("loose");
    expect(parsed.comparison.a).toMatchObject({ runs: 10, passed: 9, success_rate: 0.9, known_cost_runs: 10, total_cost_usd: 20, mean_cost_usd: 2, mean_duration_ms: 2000 });
    expect(parsed.comparison.a.cost_per_success_usd).toBeCloseTo(20 / 9, 10);
    expect(parsed.comparison.a.interval.low).toBeCloseTo(0.5958, 3);
    expect(parsed.comparison.a.interval.high).toBeCloseTo(0.9821, 3);
    expect(parsed.comparison.b.interval.low).toBeCloseTo(0.0567, 3);
    expect(parsed.comparison.b.interval.high).toBeCloseTo(0.5098, 3);
    expect(parsed.comparison.b).toMatchObject({ runs: 10, passed: 2, success_rate: 0.2, mean_cost_usd: 1, cost_per_success_usd: 5 });
    expect(parsed.comparison.delta_success_rate).toBeCloseTo(0.7, 10);
    expect(parsed.comparison.intervals_overlap).toBe(false);
    expect(parsed.comparison.cheaper_per_success).toBe("a");
    expect(parsed.comparison.verdict).toBe("a_better");

    // 11 plain runs of the 20% arm reach 91.4%, clearing the strict arm's 90%.
    expect(parsed.plain_repeats_of_weaker).toMatchObject({ arm: "b", value: "loose", attempts: 11, reaches_target: true, mean_cost_usd: 1 });
    expect(parsed.plain_repeats_of_weaker.total_cost_usd).toBeCloseTo(11, 10);
  });

  test("reads the same arms by tier and reports a clear gap as no_clear_difference when intervals overlap", async () => {
    await createTemplateArms();

    const { stdout } = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "tier", "--a", "loose", "--b", "opaque", "--json"]);
    const parsed = JSON.parse(stdout) as ComparisonJson;
    expect(parsed.comparison.verdict).toBe("no_clear_difference");
    expect(parsed.comparison.intervals_overlap).toBe(true);
    expect(parsed.comparison.delta_success_rate).toBe(0);

    const plain = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "tier", "--a", "loose", "--b", "opaque"]);
    expect(plain.stdout).toContain("both arms pass at 20.0%");
  });

  test("prints both arms, a one-sentence verdict, and the plain-repeats cost", async () => {
    await createTemplateArms();

    const { stdout } = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict", "--b", "loose"]);
    expect(stdout).toMatch(/ARM\s+VALUE\s+RUNS\s+PASSED\s+SUCCESS_RATE\s+WILSON_95\s+KNOWN_COST_RUNS\s+MEAN_COST\s+TOTAL_COST\s+COST_PER_SUCCESS\s+MEAN_DURATION/);

    const strictLine = stdout.split("\n").find((line) => line.includes("strict"));
    expect(strictLine).toContain("59.6% - 98.2%");
    const looseLine = stdout.split("\n").find((line) => line.includes("loose"));
    expect(looseLine).toContain("5.7% - 51.0%");

    const verdict = stdout.split("\n").find((line) => line.startsWith("Verdict:"));
    expect(verdict).toBeDefined();
    expect(verdict).toContain("a_better");
    // One sentence: a single terminal period and no sentence break inside.
    expect((verdict ?? "").split(". ").length).toBe(1);
    expect((verdict ?? "").endsWith(".")).toBe(true);

    const repeats = stdout.split("\n").find((line) => line.startsWith("Plain repeats:"));
    expect(repeats).toContain("11 plain repeat(s) of loose at 20.0% would match strict's 90.0%");
    expect(repeats).toContain("$11.00");
    expect(repeats).toContain("$1.0000 mean cost per run");
    expect(stdout).not.toMatch(/\$0(?:\.0+)?(?:\s|$)/);
  });

  test("keeps unpriced arm cost unknown instead of reading it as free", async () => {
    await createTemplateArms();

    const { stdout } = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict", "--b", "opaque"]);
    const opaqueLine = stdout.split("\n").find((line) => line.includes("opaque"));
    expect(opaqueLine).toBeDefined();
    expect(opaqueLine).toContain("unknown");
    expect(opaqueLine).not.toMatch(/\$0(?:\.0+)?(?:\s|$)/);

    const cost = stdout.split("\n").find((line) => line.startsWith("Cost:"));
    expect(cost).toContain("cheaper per success is unknown");

    const repeats = stdout.split("\n").find((line) => line.startsWith("Plain repeats:"));
    expect(repeats).toContain("cost unknown because opaque's mean cost per run is unknown");

    const { stdout: json } = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict", "--b", "opaque", "--json"]);
    const parsed = JSON.parse(json) as ComparisonJson;
    expect(parsed.comparison.b.known_cost_runs).toBe(0);
    expect(parsed.comparison.b.total_cost_usd).toBeUndefined();
    expect(parsed.comparison.b.mean_cost_usd).toBeUndefined();
    expect(parsed.comparison.b.cost_per_success_usd).toBeUndefined();
    expect(parsed.comparison.cheaper_per_success).toBe("unknown");
    expect(parsed.plain_repeats_of_weaker.total_cost_usd).toBeUndefined();
  });

  test("reports insufficient_data for a thin arm and says plainly when repeats cannot help", async () => {
    await createArmRuns(COMPARE_MISSION, [
      { template: "thin", passed: 4, failed: 0, cost: 1 },
      { template: "never", passed: 0, failed: 6, cost: 1 },
    ]);

    const thin = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "thin", "--b", "never"]);
    expect(thin.stdout).toMatch(/Verdict: insufficient_data/);
    expect(thin.stdout).toContain("at least 5 per arm");
    // A perfect 4-of-4 is still not allowed to look like a winner.
    expect(thin.stdout.split("\n").find((line) => line.includes("thin"))).toContain("100.0%");
    expect(thin.stdout).toContain("none of never's runs passed");
    expect(thin.stdout).not.toMatch(/\$0(?:\.0+)?(?:\s|$)/);

    const both = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "never", "--b", "never"]);
    expect(both.stdout).toMatch(/Verdict: no_clear_difference/);
    expect(both.stdout).toContain("cheaper per success is unknown");
    expect(both.stdout).toContain("neither arm passed a run");
  });

  test("rejects an unsupported dimension and a missing arm value", async () => {
    await createTemplateArms();

    const badDimension = await runUhFailure(["observatory", "compare", "--root", TEST_ROOT, "--by", "status", "--a", "strict", "--b", "loose"]);
    expect(`${badDimension.stdout}${badDimension.stderr}`).toMatch(/Invalid --by: must be one of template, tier, model, runtime/);

    const missingArm = await runUhFailure(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict"]);
    expect(`${missingArm.stdout}${missingArm.stderr}`).toMatch(/requires --a <value> and --b <value>/);
  });

  test("scopes the comparison to one mission with --mission", async () => {
    await createTemplateArms();
    await createArmRuns("other-mission", [{ template: "strict", passed: 0, failed: 10, cost: 2 }]);

    const scoped = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--mission", COMPARE_MISSION, "--by", "template", "--a", "strict", "--b", "loose", "--json"]);
    expect((JSON.parse(scoped.stdout) as ComparisonJson).comparison.a.runs).toBe(10);

    const unscoped = await runUh(["observatory", "compare", "--root", TEST_ROOT, "--by", "template", "--a", "strict", "--b", "loose", "--json"]);
    const parsed = JSON.parse(unscoped.stdout) as ComparisonJson;
    expect(parsed.comparison.a.runs).toBe(20);
    expect(parsed.comparison.a.passed).toBe(9);
    expect(parsed.comparison.verdict).toBe("no_clear_difference");
  });
});
