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

describe("parseRoute — missionCompare (UH-89)", () => {
  test("parses #/missions/<id>/compare?a=<runA>&b=<runB>", () => {
    const r = parseRoute("#/missions/m/compare?a=r1&b=r2");
    expect(r).toEqual({ view: "missionCompare", missionId: "m", runA: "r1", runB: "r2" });
  });

  test("falls back to mission view when a or b is missing", () => {
    expect(parseRoute("#/missions/m/compare?a=r1").view).toBe("mission");
    expect(parseRoute("#/missions/m/compare?b=r2").view).toBe("mission");
    expect(parseRoute("#/missions/m/compare").view).toBe("mission");
  });

  test("buildHash round-trips a missionCompare route", () => {
    const hash = buildHash({ view: "missionCompare", missionId: "m", runA: "r1", runB: "r2" });
    expect(hash).toBe("#/missions/m/compare?a=r1&b=r2");
    expect(parseRoute(hash)).toEqual({ view: "missionCompare", missionId: "m", runA: "r1", runB: "r2" });
  });

  test("URL-encodes special characters in run ids on build", () => {
    const hash = buildHash({ view: "missionCompare", missionId: "m", runA: "a/b", runB: "c d" });
    expect(hash).toBe("#/missions/m/compare?a=a%2Fb&b=c%20d");
    const back = parseRoute(hash);
    expect(back.runA).toBe("a/b");
    expect(back.runB).toBe("c d");
  });
});
