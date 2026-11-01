import { describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SteerRecordSchema, ResumeLinkSchema, ReservationFileSchema, PostCheckFileSchema } from "../src/schema/index.js";

/**
 * #259: AGENTS.md says persisted contracts start in src/schema. Two versioned contracts (the steer record and the
 * resume link) were defined in src/harness. Any versioned schema literal outside src/schema fails here.
 */
async function sources(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sources(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

describe("persisted contracts live in src/schema", () => {
  test("no versioned schema literal is defined outside src/schema", async () => {
    const offenders: string[] = [];
    for (const file of await sources("src")) {
      const normalized = file.split(path.sep).join("/");
      if (normalized.startsWith("src/schema/")) continue;
      const text = await readFile(file, "utf-8");
      for (const match of text.matchAll(/z\s*\.literal\(\s*"(uh\.[a-z-]+\.v\d+)"\s*\)/g)) offenders.push(`${normalized}: ${match[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  test("the steer record and the resume link are exported from the schema index and parse a real record", () => {
    const now = new Date().toISOString();
    expect(SteerRecordSchema.parse({ mission_id: "m", run_id: "r", status: "not_applied", reason: "x", message_digest: "d", recorded_at: now }).schema_version).toBe("uh.steer-record.v0");
    expect(() => SteerRecordSchema.parse({ mission_id: "m", run_id: "r", status: "not_applied", reason: "x", message_digest: "d", recorded_at: "yesterday" })).toThrow();
    expect(ResumeLinkSchema.parse({ schema_version: "uh.resume-link.v0", mission_id: "m", run_id: "r", runtime: "codex", resume_origin: "operator", created_at: now }).report).toBe(false);
  });

  test("a reservation file carries a version, and one written before the field existed still parses", () => {
    const now = new Date().toISOString();
    const old = { reserved_mb: 700, created_at: now, release_after_ms: 60000, pid: 4242, worker: "slot-0" };
    expect(ReservationFileSchema.parse(old).schema_version).toBe("uh.reservation.v0");
    expect(() => ReservationFileSchema.parse({ ...old, schema_version: "uh.reservation.v9" })).toThrow();
  });

  test("a post-checks file may be a bare list or a versioned document, and both give the same checks", () => {
    const checks = [{ name: "lint", command: "bun run lint" }];
    const bare = PostCheckFileSchema.parse(checks);
    const versioned = PostCheckFileSchema.parse({ schema_version: "uh.post-checks.v0", checks });
    expect(versioned).toEqual(bare);
    expect(bare[0].timeout_ms).toBe(900_000);
    expect(() => PostCheckFileSchema.parse({ schema_version: "uh.post-checks.v0", checks: [...checks, ...checks] })).toThrow(/duplicate/);
  });
});
