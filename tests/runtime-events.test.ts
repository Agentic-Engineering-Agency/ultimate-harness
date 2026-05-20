import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRuntimeCancelledEvent } from "../src/harness/runtime-events.js";

describe("runtime cancellation events", () => {
  test("appends runtime.cancelled to the active run's events.ndjson", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-"));
    try {
      const missionDir = join(root, ".harness", "missions", "m-cancel");
      await mkdir(missionDir, { recursive: true });
      // UH-82: cancel handler reads latest.json to find the active run dir.
      await writeFile(
        join(missionDir, "latest.json"),
        JSON.stringify({
          schema_version: "uh.latest-run.v0",
          run_id: "20260518T000000Z-aaaaaa",
          started_at: "2026-05-18T00:00:00.000Z",
          status: "running",
        }),
        "utf-8",
      );
      const path = appendRuntimeCancelledEvent({
        root,
        missionId: "m-cancel",
        runtime: "codex",
        signal: "SIGTERM",
        timestamp: "2026-05-18T00:00:00.000Z",
      });
      expect(path).not.toBeNull();
      expect(path!.endsWith(join("runs", "20260518T000000Z-aaaaaa", "events.ndjson"))).toBe(true);
      const rows = (await readFile(path!, "utf-8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(rows).toEqual([
        {
          event: "runtime.cancelled",
          timestamp: "2026-05-18T00:00:00.000Z",
          runtime: "codex",
          mission_id: "m-cancel",
          run_id: "20260518T000000Z-aaaaaa",
          signal: "SIGTERM",
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns null when no latest.json pointer exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-noptr-"));
    try {
      const result = appendRuntimeCancelledEvent({
        root,
        missionId: "m-no-run",
        runtime: "codex",
        signal: "SIGTERM",
      });
      expect(result).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
