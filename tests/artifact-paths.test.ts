import { describe, expect, test } from "vitest";
import path from "node:path";
import { relativeArtifactPath } from "../src/harness/artifact-paths.js";

describe("relativeArtifactPath", () => {
  test("uses relative forward-slash paths on one volume", () => {
    const from = path.win32.join("C:\\project", ".harness", "missions", "m1");
    const to = path.win32.join(from, "runs", "r1", "team-state.json");
    expect(relativeArtifactPath(from, to)).toBe("runs/r1/team-state.json");
  });

  test("keeps a cross-volume target absolute with forward slashes", () => {
    const from = path.win32.join("C:\\project", ".harness");
    const to = path.win32.join("T:\\artifacts", "team-state.json");
    expect(relativeArtifactPath(from, to)).toBe("T:/artifacts/team-state.json");
  });
});
