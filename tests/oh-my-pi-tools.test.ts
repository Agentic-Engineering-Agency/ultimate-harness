import { test, expect, describe, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import {
  OhMyPiRuntimeConfigSchema,
  planOhMyPiRun,
  runOhMyPi,
  type DiffCollector,
  type OhMyPiRunner,
} from "../src/adapters/oh-my-pi.js";

const TEST_ROOT = mkdtempSync(join(tmpdir(), "uh-test-oh-my-pi-tools-"));

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

async function writeOhMyPiManifest() {
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
    mode: json
    thinking: ""
    allow_extensions: false
    allow_skills: false
`,
    "utf-8",
  );
}

async function writeMission(id: string, runtimeConfigOverrides = "") {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: ${id}
name: OhMyPi Tools Mission
description: Restrict the tools an omp run may use.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
${runtimeConfigOverrides}`,
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
test.afterAll(cleanup);

describe("oh-my-pi runtime_config.tools planning", () => {
  test("emits exactly one --tools argument after the --mode pair", async () => {
    const { missionPath } = await writeMission(
      "tools-list",
      `runtime_config_overrides:
  tools:
    - read
    - grep
`,
    );

    const plan = await planOhMyPiRun(TEST_ROOT, missionPath);

    const modeIndex = plan.args.indexOf("--mode");
    expect(modeIndex).toBeGreaterThanOrEqual(0);
    expect(plan.args[modeIndex + 1]).toBe("json");
    expect(plan.args[modeIndex + 2]).toBe("--tools=read,grep");
    expect(plan.args.filter((arg) => arg.startsWith("--tools")).length).toBe(1);
    expect(plan.args.indexOf("--tools=read,grep")).toBeLessThan(plan.args.indexOf("--no-title"));
  });

  test("without tools the argv matches a baseline plan built the same way", async () => {
    const { missionPath } = await writeMission(
      "tools-baseline",
      `runtime_config_overrides:
  tools:
    - read
    - grep
`,
    );
    const withTools = await planOhMyPiRun(TEST_ROOT, missionPath, { runId: "baseline-run" });

    await writeMission("tools-baseline");
    const baseline = await planOhMyPiRun(TEST_ROOT, missionPath, { runId: "baseline-run" });

    // The tools plan is the baseline plus one inserted --tools argument.
    const toolsArg = withTools.args.find((arg) => arg.startsWith("--tools="));
    expect(toolsArg).toBe("--tools=read,grep");
    expect(withTools.args.filter((arg) => arg !== toolsArg)).toEqual(baseline.args);

    // Existing behaviour is byte-for-byte unchanged when tools is absent.
    expect(baseline.args).toEqual([
      "--print",
      "--mode",
      "json",
      "--no-extensions",
      "--no-skills",
      "--no-title",
      `@${baseline.promptPath}`,
    ]);
  });
});

describe("oh-my-pi runtime_config.tools validation", () => {
  test("schema rejects empty lists, separators, and duplicates", () => {
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: [] }).success).toBe(false);
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: ["read,grep"] }).success).toBe(false);
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: ["read grep"] }).success).toBe(false);
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: ["read=1"] }).success).toBe(false);
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: ["read", "read"] }).success).toBe(false);
    expect(OhMyPiRuntimeConfigSchema.safeParse({ tools: ["read", "grep"] }).success).toBe(true);
  });

  const invalidOverrides: Array<[string, string]> = [
    ["empty-list", `runtime_config_overrides:\n  tools: []\n`],
    ["comma-name", `runtime_config_overrides:\n  tools:\n    - "read,grep"\n`],
    ["space-name", `runtime_config_overrides:\n  tools:\n    - "read grep"\n`],
    ["duplicate-name", `runtime_config_overrides:\n  tools:\n    - read\n    - read\n`],
  ];

  for (const [label, overrides] of invalidOverrides) {
    test(`planOhMyPiRun surfaces a ${label} rejection`, async () => {
      const { missionPath } = await writeMission(`tools-invalid-${label}`, overrides);
      await expect(planOhMyPiRun(TEST_ROOT, missionPath)).rejects.toThrow(
        /runtime_config_overrides validation failed/,
      );
    });
  }
});

describe("oh-my-pi runtime_config.tools execution", () => {
  test("runOhMyPi hands the runner --tools and splices --config before --no-title", async () => {
    const { missionPath } = await writeMission(
      "tools-run",
      `runtime_config_overrides:
  tools:
    - read
    - grep
`,
    );

    let seenArgs: string[] | undefined;
    const runner: OhMyPiRunner = async (input) => {
      seenArgs = input.args;
      return { stdout: "", stderr: "", exitCode: 0, timedOut: false };
    };
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff, runId: "tools-run" });

    expect(seenArgs).toContain("--tools=read,grep");
    const configIndex = seenArgs!.indexOf("--config");
    const noTitleIndex = seenArgs!.indexOf("--no-title");
    expect(configIndex).toBeGreaterThanOrEqual(0);
    expect(configIndex).toBeLessThan(noTitleIndex);
  });
});
