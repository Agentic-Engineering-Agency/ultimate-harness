import { describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { validateMission } from "../src/schema/mission.js";
import { RuntimeResultSchema, RuntimeSessionSchema } from "../src/schema/artifacts.js";

/**
 * #267: the `.v0` schemas gained optional fields after 0.9.0 without a version bump, which is additive for a reader
 * of 0.11 (an artifact written by 0.9.0 still parses) and breaking the other way (a 0.9.0 reader rejects an artifact
 * 0.11 writes, because its schemas are strict). This pins the part that can be pinned here: artifacts as 0.9.0 wrote
 * them, taken from that release, still parse.
 */
const fixtures = path.join(import.meta.dirname, "fixtures", "v0.9.0");

describe("artifacts written by 0.9.0 still parse", () => {
  test("every example mission packet shipped with 0.9.0", async () => {
    const files = (await readdir(path.join(fixtures, "missions"))).filter((name) => name.endsWith(".yaml"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const file of files) {
      const parsed = validateMission(parse(await readFile(path.join(fixtures, "missions", file), "utf-8")));
      expect(parsed.id, file).toBeTruthy();
    }
  });

  test("a runtime session and a runtime result in the 0.9.0 shape", () => {
    expect(RuntimeSessionSchema.parse({
      schema_version: "uh.runtime-session.v0", mission_id: "m1", runtime: "codex", status: "succeeded",
      command: "codex", args: ["exec"], exit_code: 0, started_at: "2026-05-30T00:00:00.000Z", finished_at: "2026-05-30T00:01:00.000Z",
      stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
    }).runtime).toBe("codex");
    expect(RuntimeResultSchema.parse({
      schema_version: "uh.runtime-result.v0", mission_id: "m1", runtime: "codex", status: "passed",
      started_at: "2026-05-30T00:00:00.000Z", finished_at: "2026-05-30T00:01:00.000Z", exit_code: 0,
      prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log", errors: [], notes: "ok",
      verdict: { value: "pass", rationale: "", recorded_by: "auto", recorded_at: "2026-05-30T00:01:00.000Z" },
    }).status).toBe("passed");
  });
});
