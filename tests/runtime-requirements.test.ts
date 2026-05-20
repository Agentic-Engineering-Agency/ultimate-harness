import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertRuntimeRequirements,
  evaluateAdapterEligibility,
  matchRuntimeRequirements,
  resolveRuntimeRequirements,
} from "../src/harness/runtime-requirements.js";
import { getCapabilities } from "../src/adapters/capabilities/index.js";
import { validateMission } from "../src/schema/mission.js";

async function writeMission(
  root: string,
  id: string,
  runtimeRequirements?: Record<string, unknown>,
): Promise<string> {
  const dir = join(root, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  const missionPath = join(dir, "mission.yaml");
  const yaml = [
    "schema_version: uh.mission.v0",
    `id: ${id}`,
    "title: Runtime requirements mission",
    "workflow_profile: implementation",
  ];
  if (runtimeRequirements !== undefined) {
    yaml.push("runtime_requirements:");
    for (const [key, value] of Object.entries(runtimeRequirements)) {
      yaml.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  yaml.push("");
  await writeFile(missionPath, yaml.join("\n"), "utf-8");
  return missionPath;
}

describe("runtime requirements matching", () => {
  test("skips missions without runtime_requirements block", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-req-"));
    try {
      const missionPath = await writeMission(root, "legacy");
      await expect(assertRuntimeRequirements(missionPath, "oh-my-pi")).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("passes when adapter satisfies declared requirements", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-req-"));
    try {
      const missionPath = await writeMission(root, "m-pass", {
        needs_network: false,
        needs_shell: true,
        needs_fs_write: true,
      });
      const match = await assertRuntimeRequirements(missionPath, "hermes");
      expect(match?.runtime).toBe("hermes");
      expect(match?.exclusionReasons).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks needs_network against oh-my-pi", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-req-"));
    try {
      const missionPath = await writeMission(root, "m-network", { needs_network: true });
      await expect(assertRuntimeRequirements(missionPath, "oh-my-pi")).rejects.toThrow(/needs_network/);
      const match = await matchRuntimeRequirements(missionPath, "oh-my-pi");
      expect(match?.exclusionReasons).toContain("needs_network");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("blocks min_context_tokens above adapter limit", async () => {
    const caps = getCapabilities("oh-my-pi");
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-req-"));
    try {
      const missionPath = await writeMission(root, "m-context", {
        min_context_tokens: caps.max_context_tokens + 1,
      });
      await expect(assertRuntimeRequirements(missionPath, "oh-my-pi")).rejects.toThrow(/min_context_tokens/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("evaluateAdapterEligibility reports max_cost_class violations", () => {
    const mission = validateMission({
      schema_version: "uh.mission.v0",
      id: "costy",
      title: "Costy",
      workflow_profile: "implementation",
      runtime_requirements: { max_cost_class: "free" },
    });
    const requirements = resolveRuntimeRequirements(mission);
    const reasons = evaluateAdapterEligibility(getCapabilities("codex"), requirements);
    expect(reasons.some((r) => r.startsWith("max_cost_class"))).toBe(true);
  });
});
