/**
 * Codex round 7 P3: parseRoute must not throw on malformed hash segments.
 * Pasted URLs with truncated `%` escapes used to crash the plugin view
 * during render; now they degrade to the overview.
 */
import { describe, test, expect } from "vitest";
import { parseRoute, buildHash } from "../apps/hermes-plugin/dashboard/src/router-pure.js";

describe("parseRoute", () => {
  test("falls back to overview on malformed percent-encoding in mission segment", () => {
    expect(parseRoute("#/missions/%E0%A4%A")).toEqual({ view: "overview" });
  });

  test("falls back to mission view when only the runId segment is malformed", () => {
    const r = parseRoute("#/missions/M-1/runs/%E0%A4%A");
    expect(r.view).toBe("mission");
    expect(r.missionId).toBe("M-1");
  });

  test("falls back to overview when workflow name is malformed", () => {
    expect(parseRoute("#/workflows/%E0%A4%A")).toEqual({ view: "overview" });
  });

  test("decodes valid percent-encoded segments normally", () => {
    const r = parseRoute("#/missions/M%20with%20space");
    expect(r.view).toBe("mission");
    expect(r.missionId).toBe("M with space");
  });

  test("round-trips a valid route through buildHash + parseRoute", () => {
    const hash = buildHash({ view: "missionRun", missionId: "M-1", runId: "20260519T120000Z-deadbeef" });
    const parsed = parseRoute(hash);
    expect(parsed).toEqual({ view: "missionRun", missionId: "M-1", runId: "20260519T120000Z-deadbeef" });
  });
});
