/**
 * UH-89 — structural diff helper for two runtime-result documents.
 *
 * Top-level key compare only (per the slice contract): nested objects
 * are diffed by deep-equality on their JSON serialization but only
 * surface a single row per top-level key.
 */
import { describe, test, expect } from "vitest";
import { runtimeResultDiff } from "../apps/hermes-plugin/dashboard/src/mission-compare-helpers.js";

describe("runtimeResultDiff", () => {
  test("identical objects -> all rows differs=false", () => {
    const a = { status: "passed", exit_code: 0, runtime: "hermes" };
    const b = { status: "passed", exit_code: 0, runtime: "hermes" };
    const rows = runtimeResultDiff(a, b);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.differs === false)).toBe(true);
    expect(rows.map((r) => r.key)).toEqual(["status", "exit_code", "runtime"]);
  });

  test("one differing value -> only that row marked differs", () => {
    const a = { status: "passed", exit_code: 0, runtime: "hermes" };
    const b = { status: "failed", exit_code: 0, runtime: "hermes" };
    const rows = runtimeResultDiff(a, b);
    const map = new Map(rows.map((r) => [r.key, r]));
    expect(map.get("status")?.differs).toBe(true);
    expect(map.get("status")?.aValue).toBe("passed");
    expect(map.get("status")?.bValue).toBe("failed");
    expect(map.get("exit_code")?.differs).toBe(false);
    expect(map.get("runtime")?.differs).toBe(false);
  });

  test("missing key on one side -> differs=true with one side undefined", () => {
    const a = { status: "passed", exit_code: 0 };
    const b = { status: "passed" };
    const rows = runtimeResultDiff(a, b);
    const exitCodeRow = rows.find((r) => r.key === "exit_code");
    expect(exitCodeRow?.differs).toBe(true);
    expect(exitCodeRow?.aValue).toBe(0);
    expect(exitCodeRow?.bValue).toBeUndefined();
  });

  test("only-on-right key surfaces with aValue undefined", () => {
    const a = { status: "passed" };
    const b = { status: "passed", notes: "first attempt" };
    const rows = runtimeResultDiff(a, b);
    expect(rows.map((r) => r.key)).toEqual(["status", "notes"]);
    const notes = rows.find((r) => r.key === "notes");
    expect(notes?.differs).toBe(true);
    expect(notes?.aValue).toBeUndefined();
    expect(notes?.bValue).toBe("first attempt");
  });

  test("deeply-nested objects compared by structural equality", () => {
    const a = { verdict: { value: "pass", recorded_by: "auto" } };
    const b1 = { verdict: { value: "pass", recorded_by: "auto" } };
    const b2 = { verdict: { value: "fail", recorded_by: "auto" } };
    expect(runtimeResultDiff(a, b1)[0]?.differs).toBe(false);
    expect(runtimeResultDiff(a, b2)[0]?.differs).toBe(true);
  });

  test("two empty objects -> empty diff", () => {
    expect(runtimeResultDiff({}, {})).toEqual([]);
  });

  test("nulls treated as empty so the renderer never crashes", () => {
    const rows = runtimeResultDiff(null, { status: "passed" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.differs).toBe(true);
    expect(rows[0]?.aValue).toBeUndefined();
    expect(rows[0]?.bValue).toBe("passed");
  });
});