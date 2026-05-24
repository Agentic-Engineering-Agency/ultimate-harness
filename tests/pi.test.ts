import { test, expect, describe, beforeAll } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";
import {
  checkPi,
  detectPiQuotaError,
  dryRunPi,
  parsePiOutput,
  planPiRun,
  runPi,
  type DiffCollector,
  type PiRunner,
} from "../src/adapters/pi.js";

const TEST_ROOT = "/tmp/uh-test-pi-adapter";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

async function writePiManifest(overrides = "", mode = "json") {
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "pi.yaml"),
    `schema_version: uh.adapter.v0
id: pi
name: pi
runtime: pi
capabilities:
  - cli-execution
status: experimental
config:
  cli_command: pi
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    mode: ${mode}
    thinking: ""
    allow_extensions: false
    allow_skills: false
${overrides}`,
    "utf-8",
  );
}

async function writeHarnessMission(id = "mission-one") {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: ${id}
name: Pi Artifact Mission
description: Persist pi runtime artifacts.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
`,
    "utf-8",
  );
  return { missionDir, missionPath };
}

beforeAll(cleanup);
test.beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writePiManifest();
});
test.afterEach(cleanup);

describe("uh adapter check pi", () => {
  test("returns a well-formed check result regardless of pi presence", async () => {
    const result = await checkPi();
    expect(result.runtime).toBe("pi");
    // Deterministic across runners: don't assume a `pi` binary is (or isn't) on
    // PATH. When it's absent we must surface a clear hint; when present we just
    // require a non-error shape (some `pi` builds print no version to stdout).
    if (!result.found) {
      expect(result.errors.join("\n")).toContain("pi CLI not found in PATH");
    }
  });

  test("validates the selected root adapter manifest", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "pi.yaml"));
    const result = await checkPi(TEST_ROOT);
    expect(result.found).toBe(false);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });
});

describe("uh mission dry-run --runtime pi", () => {
  test("persists prompt and planned runtime session for harness mission", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("dry-run-pi");

    const result = await dryRunPi(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    const runsDir = join(missionDir, "runs");
    const runDirs = await (await import("node:fs/promises")).readdir(runsDir);
    expect(runDirs).toHaveLength(1);
    const runDir = join(runsDir, runDirs[0]);
    expect(await readFile(join(runDir, "prompt.md"), "utf-8")).toBe(result.prompt);
    expect(result.command).toBe("pi");
    expect(result.args).toEqual([
      "--print",
      "--mode",
      "json",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-title",
      result.prompt,
    ]);
    const sessionPath = join(runDir, "runtime-session.yaml");
    const sessionValidation = await validateFile(sessionPath);
    expect(sessionValidation).toMatchObject({ valid: true, schema_version: "uh.runtime-session.v0" });
    const session = parse(await readFile(sessionPath, "utf-8"));
    expect(session).toMatchObject({
      schema_version: "uh.runtime-session.v0",
      mission_id: "dry-run-pi",
      runtime: "pi",
      status: "planned",
      command: "pi",
    });
    expect(session.args).toEqual(result.args);
  });

  test("surfaces rpc-ui mode errors in the run plan", async () => {
    await writePiManifest("", "rpc-ui");
    const { missionPath } = await writeHarnessMission("bad-rpc-ui");

    const result = await planPiRun(TEST_ROOT, missionPath);

    expect(result.errors).toContain("pi mode rpc-ui expects a TUI parent; use mode: json, text, or rpc for headless runs");
  });

  test("merges mission runtime_config_overrides on top of adapter defaults", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("override-model");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: override-model
name: Override Model
description: Use Anthropic via OMP for this mission.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  model: anthropic/claude-opus-4-7
  thinking: high
`, "utf-8");

    const result = await planPiRun(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    expect(result.args).toEqual([
      "--print",
      "--model",
      "anthropic/claude-opus-4-7",
      "--thinking",
      "high",
      "--mode",
      "json",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-title",
      result.prompt,
    ]);
    expect(missionDir).toContain("override-model");
  });

  test("rejects typos in mission runtime_config_overrides via strict schema", async () => {
    const { missionPath } = await writeHarnessMission("typo-override");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: typo-override
name: Typo Override
description: Mistyped override key.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  modell: anthropic/claude-opus-4-7
`, "utf-8");

    await expect(planPiRun(TEST_ROOT, missionPath)).rejects.toThrow(/runtime_config_overrides validation failed.*modell/s);
  });

  test("prefers UH-28 sentinel block over heuristic finalMessage", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("sentinel-omp");
    const stdout = [
      '{"type":"message","role":"assistant","content":"first reasoning chunk"}',
      '{"type":"message","role":"assistant","content":"```uh-runtime-final-message\\nBounded pi summary.\\n```"}',
      '',
    ].join("\n");
    const runner: PiRunner = async () => ({
      stdout,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const runId = "test-sentinel-omp";
    const result = await runPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    expect(await readFile(join(missionDir, "runs", runId, "runtime-final.txt"), "utf-8")).toBe("Bounded pi summary.");
  });
});

describe("pi output parsing", () => {
  test("handles NDJSON and extracts final message from the last assistant-like event", () => {
    const result = parsePiOutput('{"type":"message","role":"assistant","content":"first"}\n{"type":"result","text":"last"}\n');

    expect(result.events).toEqual([
      { type: "message", role: "assistant", content: "first" },
      { type: "result", text: "last" },
    ]);
    expect(result.parseErrors).toEqual([]);
    expect(result.finalMessage).toBe("last");
  });

  test("handles single-dump JSON and extracts the final assistant message", () => {
    const result = parsePiOutput(JSON.stringify({
      messages: [
        { role: "assistant", content: "first" },
        { role: "user", content: "ignore" },
        { role: "assistant", content: "final" },
      ],
    }));

    expect(result.events).toEqual([{ messages: [
      { role: "assistant", content: "first" },
      { role: "user", content: "ignore" },
      { role: "assistant", content: "final" },
    ] }]);
    expect(result.parseErrors).toEqual([]);
    expect(result.finalMessage).toBe("final");
  });

  test("tolerates malformed JSON lines", () => {
    const result = parsePiOutput('{"type":"message","role":"assistant","content":"ok"}\nNOT_JSON\n{"type":"result","text":"done"}\n');

    expect(result.events).toEqual([
      { type: "message", role: "assistant", content: "ok" },
      { type: "result", text: "done" },
    ]);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain("line 2");
    expect(result.finalMessage).toBe("done");
  });

  test("detects quota and auth failures", () => {
    expect(detectPiQuotaError("", "401 Unauthorized")).toContain("pi auth or quota error");
    expect(detectPiQuotaError("rate limit exceeded", "")).toContain("pi auth or quota error");
    expect(detectPiQuotaError("", "API key missing")).toContain("pi auth or quota error");
    expect(detectPiQuotaError("all good", "")).toBeNull();
  });
});

describe("uh mission run --runtime pi", () => {
  test("persists success artifacts with pi events and runtime result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("run-success");
    const runner: PiRunner = async () => ({
      stdout: '{"type":"message","role":"assistant","content":"pi completed the mission."}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "diff --git a/x b/x\n" });

    const runId = "test-omp-run-success";
    const result = await runPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    const runDir = join(missionDir, "runs", runId);
    expect(await readFile(join(runDir, "runtime-final.txt"), "utf-8")).toBe("pi completed the mission.");
    const events = (await readFile(join(runDir, "events.ndjson"), "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.event)).toEqual([
      "runtime.started",
      "pi.message",
      "runtime.finished",
      "runtime.usage",
    ]);
    const runtimeResultPath = join(missionDir, "runtime-result.yaml");
    expect(await validateFile(runtimeResultPath)).toMatchObject({ valid: true, schema_version: "uh.runtime-result.v0" });
    const runtimeResult = parse(await readFile(runtimeResultPath, "utf-8"));
    expect(runtimeResult).toMatchObject({
      status: "passed",
      runtime: "pi",
      diff_path: `.harness/missions/run-success/runs/${runId}/diff.patch`,
      stdout_path: `.harness/missions/run-success/runs/${runId}/runtime.stdout.log`,
      stderr_path: `.harness/missions/run-success/runs/${runId}/runtime.stderr.log`,
    });
  });

  test("classifies quota failures as blocked", async () => {
    const { missionPath } = await writeHarnessMission("quota-blocked");
    const runner: PiRunner = async () => ({
      stdout: "",
      stderr: "API key not configured",
      exitCode: 2,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runPi(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors.some((error) => /api key/i.test(error))).toBe(true);
  });

  test("blocks when pi exits zero without a final assistant message", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("missing-final");
    const runner: PiRunner = async () => ({
      stdout: '{"type":"metadata","text":"not final"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const runId = "test-omp-missing-final";
    const result = await runPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors).toContain("pi did not emit a final assistant message");
    expect(await readFile(join(missionDir, "runs", runId, "runtime-final.txt"), "utf-8")).toBe("");
  });
});
