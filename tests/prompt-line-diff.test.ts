/**
 * UH-89 — LCS-based line diff backing the prompt.md panel of the
 * compare view. Asserts the contract: shared lines appear as `eq`,
 * removed lines as `del`, inserted lines as `add`; the walk is
 * deterministic.
 */
import { describe, test, expect } from "vitest";
import { lineDiff, type LineDiffOp } from "../apps/hermes-plugin/dashboard/src/mission-compare-helpers.js";

function kinds(ops: LineDiffOp[]): string[] {
  return ops.map((o) => o.kind);
}

describe("lineDiff", () => {
  test("identical inputs -> all eq, no markers", () => {
    const ops = lineDiff("alpha\nbeta\ngamma", "alpha\nbeta\ngamma");
    expect(kinds(ops)).toEqual(["eq", "eq", "eq"]);
    expect(ops.map((o) => o.text)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("single insertion in the middle", () => {
    const ops = lineDiff("alpha\ngamma", "alpha\nbeta\ngamma");
    expect(kinds(ops)).toEqual(["eq", "add", "eq"]);
    expect(ops[1]).toEqual({ kind: "add", text: "beta" });
  });

  test("single deletion in the middle", () => {
    const ops = lineDiff("alpha\nbeta\ngamma", "alpha\ngamma");
    expect(kinds(ops)).toEqual(["eq", "del", "eq"]);
    expect(ops[1]).toEqual({ kind: "del", text: "beta" });
  });

  test("full replacement -> all del then all add", () => {
    const ops = lineDiff("a\nb\nc", "x\ny\nz");
    // With zero common lines the LCS walk first emits the dels then the adds.
    const dels = ops.filter((o) => o.kind === "del").map((o) => o.text);
    const adds = ops.filter((o) => o.kind === "add").map((o) => o.text);
    expect(dels).toEqual(["a", "b", "c"]);
    expect(adds).toEqual(["x", "y", "z"]);
    expect(ops.filter((o) => o.kind === "eq")).toEqual([]);
  });

  test("empty inputs -> empty op list", () => {
    expect(lineDiff("", "")).toEqual([]);
  });

  test("empty a -> all adds", () => {
    const ops = lineDiff("", "x\ny");
    expect(kinds(ops)).toEqual(["add", "add"]);
    expect(ops.map((o) => o.text)).toEqual(["x", "y"]);
  });

  test("empty b -> all dels", () => {
    const ops = lineDiff("x\ny", "");
    expect(kinds(ops)).toEqual(["del", "del"]);
    expect(ops.map((o) => o.text)).toEqual(["x", "y"]);
  });

  test("interleaved edits preserve shared lines as eq", () => {
    const a = "shared\nA1\nshared2\nA2";
    const b = "shared\nB1\nshared2\nB2";
    const ops = lineDiff(a, b);
    const shared = ops.filter((o) => o.kind === "eq").map((o) => o.text);
    expect(shared).toEqual(["shared", "shared2"]);
    const adds = ops.filter((o) => o.kind === "add").map((o) => o.text);
    const dels = ops.filter((o) => o.kind === "del").map((o) => o.text);
    expect(dels).toContain("A1");
    expect(dels).toContain("A2");
    expect(adds).toContain("B1");
    expect(adds).toContain("B2");
  });
});