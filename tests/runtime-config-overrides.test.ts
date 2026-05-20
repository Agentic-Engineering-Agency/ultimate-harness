import { describe, expect, test, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { planHermesRun } from "../src/adapters/hermes.js";
import { validateMission } from "../src/schema/mission.js";
import {
  mergeRuntimeConfigOverrides,
  parseRuntimeConfigOverridesJson,
} from "../src/harness/runtime-config-overrides.js";

const TEST_ROOT = "/tmp/uh-test-runtime-config-overrides";

describe("parseRuntimeConfigOverridesJson", () => {
  test("returns the parsed object for a valid JSON object", () => {
    expect(parseRuntimeConfigOverridesJson('{"model":"x","temperature":0.2}')).toEqual({
      model: "x",
      temperature: 0.2,
    });
  });

  test("accepts the empty object", () => {
    expect(parseRuntimeConfigOverridesJson("{}")).toEqual({});
  });

  test("throws operator-friendly error on invalid JSON", () => {
    expect(() => parseRuntimeConfigOverridesJson("{not-json")).toThrow(
      /--runtime-config-overrides: invalid JSON/,
    );
  });

  test("throws on JSON array", () => {
    expect(() => parseRuntimeConfigOverridesJson("[1,2,3]")).toThrow(
      /must be a JSON object, got array/,
    );
  });

  test("throws on JSON null", () => {
    expect(() => parseRuntimeConfigOverridesJson("null")).toThrow(
      /must be a JSON object, got null/,
    );
  });

  test("throws on JSON primitive (string)", () => {
    expect(() => parseRuntimeConfigOverridesJson('"plain"')).toThrow(
      /must be a JSON object, got string/,
    );
  });

  test("throws on JSON primitive (number)", () => {
    expect(() => parseRuntimeConfigOverridesJson("42")).toThrow(
      /must be a JSON object, got number/,
    );
  });
});

describe("mergeRuntimeConfigOverrides", () => {
  function mission(overrides: Record<string, unknown>) {
    // Run the real Zod validator so we don't drift from the schema's shape
    // (which currently sets `runtime_config_overrides: {}` as the default).
    return validateMission({
      schema_version: "uh.mission.v0",
      id: "merge-test",
      name: "merge-test",
      description: "test",
      workflow_profile: "research-docs",
      issues: [],
      read_first: [],
      expected_artifacts: [],
      verification: { checks: [] },
      runtime_config_overrides: overrides,
    });
  }

  test("absent extras returns mission overrides verbatim", () => {
    expect(mergeRuntimeConfigOverrides(mission({ a: 1, b: "two" }))).toEqual({
      a: 1,
      b: "two",
    });
  });

  test("extras win over mission overrides on key collisions", () => {
    const merged = mergeRuntimeConfigOverrides(
      mission({ model: "gpt-4", a: 1 }),
      { model: "gpt-5", b: 2 },
    );
    expect(merged).toEqual({ model: "gpt-5", a: 1, b: 2 });
  });

  test("empty mission overrides + extras = extras only", () => {
    const merged = mergeRuntimeConfigOverrides(mission({}), { foo: "bar" });
    expect(merged).toEqual({ foo: "bar" });
  });

  test("empty extras object does not erase mission keys", () => {
    const merged = mergeRuntimeConfigOverrides(mission({ a: 1 }), {});
    expect(merged).toEqual({ a: 1 });
  });
});

describe("planHermesRun threads extra overrides through the merge (UH-81)", () => {
  async function cleanup(): Promise<void> {
    try {
      await rm(TEST_ROOT, { recursive: true, force: true });
    } catch {
      // first run
    }
  }

  beforeAll(cleanup);
  beforeEach(async () => {
    await cleanup();
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    // Hermes manifest with NO runtime_config block — keeps the strict
    // HermesRuntimeConfigSchema happy (it currently rejects unknown keys).
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
      `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
runtime: hermes
config:
  cli_command: hermes
  default_toolsets: [terminal]
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: true
`,
      "utf-8",
    );
    const missionDir = join(TEST_ROOT, ".harness", "missions", "merge-mission");
    await mkdir(missionDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      `schema_version: uh.mission.v0
id: merge-mission
name: Merge Mission
description: Verify UH-81 override merge.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
`,
      "utf-8",
    );
  });
  afterEach(cleanup);

  test("CLI extras land in the planner's strict-parse path without breaking the empty-strict schema", async () => {
    // HermesRuntimeConfigSchema is currently empty-strict, so ANY override
    // key (mission-level or CLI-level) MUST trip the strict parser. This
    // proves the helper actually merges CLI extras into mergedRuntimeConfig
    // — if it didn't, the call below would succeed instead of throwing on
    // the rogue `model` key.
    const missionPath = join(
      TEST_ROOT,
      ".harness",
      "missions",
      "merge-mission",
      "mission.yaml",
    );
    await expect(
      planHermesRun(TEST_ROOT, missionPath, {
        extraRuntimeConfigOverrides: { model: "gpt-5" },
      }),
    ).rejects.toThrow(/runtime_config_overrides validation failed[\s\S]*model/i);

    // Sanity check: without extras, the empty merge passes strict parse.
    const plan = await planHermesRun(TEST_ROOT, missionPath);
    expect(plan.command).toBe("hermes");
    expect(plan.errors).toEqual([]);
  });
});