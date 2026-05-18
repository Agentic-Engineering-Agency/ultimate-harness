import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRuntimeCancelledEvent } from "../src/harness/runtime-events.js";

describe("runtime cancellation events", () => {
  test("appends runtime.cancelled to the mission event log", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-"));
    try {
      const path = appendRuntimeCancelledEvent({
        root,
        missionId: "m-cancel",
        runtime: "codex",
        signal: "SIGTERM",
        timestamp: "2026-05-18T00:00:00.000Z",
      });
      const rows = (await readFile(path, "utf-8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(rows).toEqual([
        {
          event: "runtime.cancelled",
          timestamp: "2026-05-18T00:00:00.000Z",
          runtime: "codex",
          mission_id: "m-cancel",
          signal: "SIGTERM",
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
