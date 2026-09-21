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
      duration_ms?: number;
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
    expect(stdout).toMatch(/MISSION_ID\s+RUN_ID\s+RUNTIME\s+MODEL\s+WORKFLOW_PROFILE\s+STATUS\s+STOP_CODE\s+DURATION\s+COST/);

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
