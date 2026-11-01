import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { MissionDocument } from "../schema/mission.js";
import type { VerificationResultDocument } from "../schema/artifacts.js";
import { isPathWithin } from "./mission.js";

export async function verifyExpectedArtifact(root: string, expected: MissionDocument["expected_artifacts"][number]): Promise<VerificationResultDocument["checks"][number]> {
  const check: VerificationResultDocument["checks"][number] = { name: `artifact:${expected.path}`, type: "artifact", status: "failed" };
  const target = path.resolve(root, expected.path);
  try {
    if (!isPathWithin(target, root)) {
      check.notes = "Declared output escapes the workspace";
      return check;
    }
    if (!isPathWithin(await realpath(target), await realpath(root))) {
      check.notes = "Declared output resolves outside the workspace";
      return check;
    }
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.size === 0) {
      check.notes = "Declared output must be a non-empty regular file";
      return check;
    }
    const json = expected.type === "json" || path.extname(target).toLowerCase() === ".json";
    if (json || expected.completion_marker !== undefined) {
      const text = await readFile(target, "utf8");
      if (json) {
        try { JSON.parse(text.replace(/^\uFEFF/, "")); }
        catch { check.notes = "Declared JSON output is malformed"; return check; }
      }
      if (expected.completion_marker !== undefined) {
        const trimmed = text.trimEnd();
        if (trimmed.slice(trimmed.lastIndexOf("\n") + 1).trim() !== expected.completion_marker) {
          check.notes = "Declared completion marker is missing from the final line";
          return check;
        }
      }
    }
    check.status = "passed";
  } catch { check.notes = "Declared output is missing, unreadable, or outside the workspace"; }
  return check;
}
