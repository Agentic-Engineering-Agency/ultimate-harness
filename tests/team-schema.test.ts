import { describe, expect, test } from "vitest";
import { validateMission, TEAM_ADAPTER_IDS } from "../src/schema/mission.js";

const BASE = {
  schema_version: "uh.mission.v0",
  id: "m-team",
  title: "Team mission",
  workflow_profile: "spec-first-feature",
};

describe("mission shape: team", () => {
  test("defaults shape to 'single' and design_path to 'design.md'", () => {
    const m = validateMission(BASE);
    expect(m.shape).toBe("single");
    expect(m.design_path).toBe("design.md");
    expect(m.team).toBeUndefined();
  });

  test("accepts a valid team mission", () => {
    const m = validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [
          { adapter: "codex", role: "frontend" },
          { adapter: "oh-my-pi", role: "backend", count: 2 },
        ],
        leader: { adapter: "hermes", role: "integrator" },
      },
      integration_report_path: "integration-report.md",
    });
    expect(m.shape).toBe("team");
    expect(m.team?.workers).toHaveLength(2);
    expect(m.team?.workers[1].count).toBe(2);
    expect(m.team?.leader.adapter).toBe("hermes");
    expect(m.integration_report_path).toBe("integration-report.md");
  });

  test("defaults worker.count to 1", () => {
    const m = validateMission({
      ...BASE,
      shape: "team",
      team: {
        workers: [{ adapter: "codex", role: "solo" }],
        leader: { adapter: "hermes" },
      },
    });
    expect(m.team?.workers[0].count).toBe(1);
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

  test("TEAM_ADAPTER_IDS exposes the registered runtimes", () => {
    expect(new Set(TEAM_ADAPTER_IDS)).toEqual(
      new Set(["hermes", "codex", "oh-my-pi", "hermes-proxy", "openrouter", "anthropic", "pi"]),
    );
  });
});
