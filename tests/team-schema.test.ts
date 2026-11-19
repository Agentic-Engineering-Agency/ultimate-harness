import { describe, expect, test } from "vitest";
import { validateMission } from "../src/schema/mission.js";

const BASE = {
  schema_version: "uh.mission.v0",
  id: "m-team",
  title: "Team mission",
  workflow_profile: "spec-first-feature",
};

describe("mission shape: team", () => {
  test("accepts a valid team mission", () => {
    const m = validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [
          {
            adapter: "codex",
            role: "frontend",
            mission_id: "frontend-mission",
            objective: "Build the UI",
            runtime_config_overrides: { model: "provider/model" },
            limits: { max_turns: 4 },
            expected_outputs: { files: ["out/ui.txt"] },
            seed: 7,
          },
          { adapter: "oh-my-pi", role: "backend", count: 2 },
        ],
        leader: { adapter: "hermes", role: "integrator" },
      },
      integration_report_path: "integration-report.md",
    });
    expect(m.shape).toBe("team");
    expect(m.team?.workers).toHaveLength(2);
    expect(m.team?.workers[1].count).toBe(2);
    expect(m.team?.workers[0].mission_id).toBe("frontend-mission");
    expect(m.team?.workers[0].limits?.max_turns).toBe(4);
    expect(m.team?.workers[0].expected_outputs?.files).toEqual(["out/ui.txt"]);
    expect(m.team?.workers[0].seed).toBe(7);
    expect(m.team?.leader.adapter).toBe("hermes");
    expect(m.integration_report_path).toBe("integration-report.md");
  });

  test("rejects team shape without team.workers", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [],
        leader: { adapter: "hermes" },
      },
    })).toThrow(/at least one worker/i);
  });

  test("rejects team shape with no team block", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
    })).toThrow(/shape: team requires team\.workers and team\.leader/);
  });

  test("rejects unknown adapter id in worker", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "not-a-runtime", role: "frontend" }],
        leader: { adapter: "hermes" },
      },
    })).toThrow();
  });

  test("rejects unknown adapter id in leader", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "codex", role: "frontend" }],
        leader: { adapter: "bogus" },
      },
    })).toThrow();
  });

  test("rejects duplicate worker roles", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [
          { adapter: "codex", role: "shared" },
          { adapter: "oh-my-pi", role: "shared" },
        ],
        leader: { adapter: "hermes" },
      },
    })).toThrow(/Duplicate team\.workers\[\]\.role: shared/);
  });

  test("rejects team.workers missing leader.adapter", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "codex", role: "frontend" }],
        leader: {},
      },
    })).toThrow();
  });
  test("rejects per-worker memory limits with the team resource guidance", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "codex", role: "frontend", limits: { memory_mb: 128 } }],
        leader: { adapter: "hermes" },
      },
    })).toThrow(/team\.resources\.worker_memory_mb/);
  });

  test("rejects unknown worker contract keys", () => {
    expect(() => validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "codex", role: "frontend", unexpected: true }],
        leader: { adapter: "hermes" },
      },
    })).toThrow();
  });

});
