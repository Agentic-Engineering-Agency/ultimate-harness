/**
 * Regression test for `apps/hermes-plugin/dashboard/src/yaml-pretty.ts`.
 *
 * UH-PR89 finding #1 — the original array branch stripped leading spaces of
 * the *whole* nested render and then re-appended the tail, causing each key
 * after the first to render twice for arrays of objects. This test pins the
 * correct multiline output for both arrays-of-objects and arrays-of-arrays.
 */
import { describe, it, expect } from "vitest";
import { yamlStringify } from "../apps/hermes-plugin/dashboard/src/yaml-pretty.js";

describe("yamlStringify", () => {
  it("renders plain scalars and mappings", () => {
    expect(yamlStringify({ a: 1, b: "two" })).toBe("a: 1\nb: two");
  });

  it("quotes ambiguous scalars", () => {
    expect(yamlStringify({ s: "true", n: "1", x: "a: b" })).toBe(
      's: "true"\nn: "1"\nx: "a: b"',
    );
  });

  it("renders empty containers", () => {
    // Empty `[]` / `{}` are not "plain" by the printer's classifier, so
    // they take the nested branch and render on a new line. Pinning the
    // actual shape keeps this contract explicit (the YAML below still
    // round-trips through any YAML parser).
    expect(yamlStringify({ arr: [], obj: {} })).toBe(
      "arr:\n  []\nobj:\n  {}",
    );
  });

  it("renders array of objects without duplicating subsequent keys", () => {
    const out = yamlStringify({
      items: [
        { id: "a", name: "Alpha", severity: "warn" },
        { id: "b", name: "Beta", severity: "fail" },
      ],
    });
    expect(out).toBe(
      [
        "items:",
        "  - id: a",
        "    name: Alpha",
        "    severity: warn",
        "  - id: b",
        "    name: Beta",
        "    severity: fail",
      ].join("\n"),
    );
    // Hard assertion: each key appears the expected number of times.
    expect((out.match(/name:/g) ?? []).length).toBe(2);
    expect((out.match(/severity:/g) ?? []).length).toBe(2);
  });

  it("renders array of arrays as nested block scalars", () => {
    const out = yamlStringify({
      matrix: [
        ["a", "b"],
        ["c", "d"],
      ],
    });
    expect(out).toBe(
      [
        "matrix:",
        "  - - a",
        "    - b",
        "  - - c",
        "    - d",
      ].join("\n"),
    );
  });

  it("round-trips a mission-shaped document", () => {
    const doc = {
      schema_version: "uh.mission.v0",
      id: "demo",
      acceptance_criteria: [
        { id: "ac-1", description: "did the thing", severity: "warn" },
        { id: "ac-2", description: "did another", severity: "fail" },
      ],
    };
    const out = yamlStringify(doc);
    expect(out).toContain("  - id: ac-1");
    expect(out).toContain("    description: did the thing");
    expect(out).toContain("  - id: ac-2");
    expect(out).toContain("    description: did another");
    const descLines = out.split("\n").filter((l) => l.includes("description:"));
    expect(descLines.length).toBe(2);
  });
});