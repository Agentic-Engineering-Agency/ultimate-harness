import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-cli-mission-show-"));
  await mkdir(join(ROOT, ".harness", "missions", "show-me"), { recursive: true });
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

function runMissionShow(missionId: string) {
  return spawnSync("bun", ["x", "tsx", CLI, "mission", "show", missionId, "--root", ROOT], {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  });
}

describe("uh mission show", () => {
  test("prints mission metadata and design.md readback for a known mission", async () => {
    const missionPath = join(ROOT, ".harness", "missions", "show-me", "mission.yaml");
    await writeFile(
      missionPath,
      stringify({
        schema_version: "uh.mission.v0",
        id: "show-me",
        title: "Show Me Mission",
        workflow_profile: "spec-first-feature",
        objective: "Demonstrate mission show output",
        priority: "high",
        acceptance_criteria: [
          { id: "ac-1", description: "First criterion" },
          { id: "ac-2", description: "Second criterion", severity: "warn" as const },
        ],
      }),
      "utf-8",
    );
    const designPath = join(ROOT, ".harness", "missions", "show-me", "design.md");
    await writeFile(designPath, "# Design\n\nContext and approach here.", "utf-8");

    const result = runMissionShow("show-me");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Mission: show-me");
    expect(result.stdout).toContain("Title: Show Me Mission");
    expect(result.stdout).toContain("Workflow: spec-first-feature");
    expect(result.stdout).toContain("Priority: high");
    expect(result.stdout).toContain("Objective: Demonstrate mission show output");
    expect(result.stdout).toContain("Acceptance criteria (2):");
    expect(result.stdout).toContain("  - ac-1 [block] First criterion");
    expect(result.stdout).toContain("  - ac-2 [warn] Second criterion");
    expect(result.stdout).toContain("=== design.md ===");
    expect(result.stdout).toContain("# Design");
    expect(result.stdout).toContain("Context and approach here.");
    expect(result.stdout).toContain("=== End design.md ===");
  });

  test("reports an error for an unknown mission id", () => {
    const result = runMissionShow("nonexistent");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[FAIL]");
    expect(result.stderr).toContain("nonexistent");
  });
});
