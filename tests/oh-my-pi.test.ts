import { test, expect, describe, beforeAll } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";
import {
  checkOhMyPi,
  detectOhMyPiQuotaError,
  dryRunOhMyPi,
  parseOhMyPiOutput,
  planOhMyPiRun,
  runOhMyPi,
  type DiffCollector,
  type OhMyPiRunner,
} from "../src/adapters/oh-my-pi.js";

const TEST_ROOT = "/tmp/uh-test-oh-my-pi-adapter";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

async function writeOhMyPiManifest(overrides = "", mode = "json") {
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "oh-my-pi.yaml"),
    `schema_version: uh.adapter.v0
id: oh-my-pi
name: oh-my-pi
runtime: oh-my-pi
capabilities:
  - cli-execution
status: experimental
config:
  cli_command: omp
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
name: OhMyPi Artifact Mission
description: Persist oh-my-pi runtime artifacts.
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
  await writeOhMyPiManifest();
});
test.afterEach(cleanup);

describe("uh adapter check oh-my-pi", () => {
  test("returns valid check result when omp is installed", async () => {
    const result = await checkOhMyPi();
    expect(result.runtime).toBe("oh-my-pi");
    if (result.found) {
      expect(result.version.length).toBeGreaterThan(0);
    } else {
      expect(result.errors.join("\n")).toContain("omp CLI not found in PATH");
    }
  });

  test("validates the selected root adapter manifest", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "oh-my-pi.yaml"));
    const result = await checkOhMyPi(TEST_ROOT);
    expect(result.found).toBe(false);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });
});

describe("uh mission dry-run --runtime oh-my-pi", () => {
  test("persists prompt and planned runtime session for harness mission", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("dry-run-oh-my-pi");

    const result = await dryRunOhMyPi(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    expect(await readFile(join(missionDir, "prompt.md"), "utf-8")).toBe(result.prompt);
    expect(result.command).toBe("omp");
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
    const sessionPath = join(missionDir, "runtime-session.yaml");
    const sessionValidation = await validateFile(sessionPath);
    expect(sessionValidation).toMatchObject({ valid: true, schema_version: "uh.runtime-session.v0" });
    const session = parse(await readFile(sessionPath, "utf-8"));
    expect(session).toMatchObject({
      schema_version: "uh.runtime-session.v0",
      mission_id: "dry-run-oh-my-pi",
      runtime: "oh-my-pi",
      status: "planned",
      command: "omp",
    });
    expect(session.args).toEqual(result.args);
  });

  test("surfaces rpc-ui mode errors in the run plan", async () => {
    await writeOhMyPiManifest("", "rpc-ui");
    const { missionPath } = await writeHarnessMission("bad-rpc-ui");

    const result = await planOhMyPiRun(TEST_ROOT, missionPath);

    expect(result.errors).toContain("oh-my-pi mode rpc-ui expects a TUI parent; use mode: json, text, or rpc for headless runs");
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

    const result = await planOhMyPiRun(TEST_ROOT, missionPath);

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

    await expect(planOhMyPiRun(TEST_ROOT, missionPath)).rejects.toThrow(/runtime_config_overrides validation failed.*modell/s);
  });
});

describe("oh-my-pi output parsing", () => {
  test("handles NDJSON and extracts final message from the last assistant-like event", () => {
    const result = parseOhMyPiOutput('{"type":"message","role":"assistant","content":"first"}\n{"type":"result","text":"last"}\n');

    expect(result.events).toEqual([
      { type: "message", role: "assistant", content: "first" },
      { type: "result", text: "last" },
    ]);
    expect(result.parseErrors).toEqual([]);
    expect(result.finalMessage).toBe("last");
  });

  test("handles single-dump JSON and extracts the final assistant message", () => {
    const result = parseOhMyPiOutput(JSON.stringify({
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
    const result = parseOhMyPiOutput('{"type":"message","role":"assistant","content":"ok"}\nNOT_JSON\n{"type":"result","text":"done"}\n');

    expect(result.events).toEqual([
      { type: "message", role: "assistant", content: "ok" },
      { type: "result", text: "done" },
    ]);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain("line 2");
    expect(result.finalMessage).toBe("done");
  });

  test("detects quota and auth failures", () => {
    expect(detectOhMyPiQuotaError("", "401 Unauthorized")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("rate limit exceeded", "")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("", "API key missing")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("all good", "")).toBeNull();
  });
});

describe("uh mission run --runtime oh-my-pi", () => {
  test("persists success artifacts with oh-my-pi events and runtime result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("run-success");
    const runner: OhMyPiRunner = async () => ({
      stdout: '{"type":"message","role":"assistant","content":"oh-my-pi completed the mission."}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "diff --git a/x b/x\n" });

    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    expect(await readFile(join(missionDir, "runtime-final.txt"), "utf-8")).toBe("oh-my-pi completed the mission.");
    const events = (await readFile(join(missionDir, "events.ndjson"), "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.event)).toEqual([
      "runtime.started",
      "oh-my-pi.message",
      "runtime.finished",
    ]);
    const runtimeResultPath = join(missionDir, "runtime-result.yaml");
    expect(await validateFile(runtimeResultPath)).toMatchObject({ valid: true, schema_version: "uh.runtime-result.v0" });
    const runtimeResult = parse(await readFile(runtimeResultPath, "utf-8"));
    expect(runtimeResult).toMatchObject({
      status: "passed",
      runtime: "oh-my-pi",
      diff_path: ".harness/missions/run-success/diff.patch",
      stdout_path: ".harness/missions/run-success/runtime.stdout.log",
      stderr_path: ".harness/missions/run-success/runtime.stderr.log",
    });
  });

  test("classifies quota failures as blocked", async () => {
    const { missionPath } = await writeHarnessMission("quota-blocked");
    const runner: OhMyPiRunner = async () => ({
      stdout: "",
      stderr: "API key not configured",
      exitCode: 2,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors.some((error) => /api key/i.test(error))).toBe(true);
  });

  test("blocks when oh-my-pi exits zero without a final assistant message", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("missing-final");
    const runner: OhMyPiRunner = async () => ({
      stdout: '{"type":"metadata","text":"not final"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors).toContain("oh-my-pi did not emit a final assistant message");
    expect(await readFile(join(missionDir, "runtime-final.txt"), "utf-8")).toBe("");
  });
});
