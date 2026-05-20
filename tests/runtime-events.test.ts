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

  test("returns null and emits stderr warning when no latest.json pointer exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-noptr-"));
    try {
      // Capture stderr writes to verify the operator-visible warning fires.
      const original = process.stderr.write.bind(process.stderr);
      const captured: string[] = [];
      (process.stderr as unknown as { write: (c: string | Uint8Array) => boolean }).write = (chunk) => {
        captured.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      };
      try {
        const result = appendRuntimeCancelledEvent({
          root,
          missionId: "m-no-run",
          runtime: "codex",
          signal: "SIGTERM",
        });
        expect(result).toBeNull();
        expect(captured.join("")).toContain(
          "runtime.cancelled skipped: no latest.json for mission m-no-run",
        );
      } finally {
        (process.stderr as unknown as { write: typeof original }).write = original;
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("uses explicit runId without reading latest.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-explicit-"));
    try {
      const path = appendRuntimeCancelledEvent({
        root,
        missionId: "m-explicit",
        runId: "20260520T120000Z-cafe00",
        runtime: "codex",
        signal: "SIGTERM",
        source: "cli",
        timestamp: "2026-05-20T12:00:00.000Z",
      });
      expect(path).not.toBeNull();
      const rows = (await readFile(path!, "utf-8")).trim().split("\n").map((line) => JSON.parse(line));
      expect(rows[0]).toMatchObject({
        event: "runtime.cancelled",
        mission_id: "m-explicit",
        run_id: "20260520T120000Z-cafe00",
        source: "cli",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("UH_QUIET_CANCEL=1 suppresses the missing-pointer warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-quiet-"));
    const prev = process.env.UH_QUIET_CANCEL;
    process.env.UH_QUIET_CANCEL = "1";
    try {
      const captured: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      (process.stderr as unknown as { write: (c: string | Uint8Array) => boolean }).write = (chunk) => {
        captured.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
        return true;
      };
      try {
        const result = appendRuntimeCancelledEvent({
          root,
          missionId: "m-quiet",
          runtime: "codex",
          signal: "SIGTERM",
        });
        expect(result).toBeNull();
        expect(captured.join("")).not.toContain("runtime.cancelled skipped");
      } finally {
        (process.stderr as unknown as { write: typeof original }).write = original;
      }
    } finally {
      if (prev === undefined) delete process.env.UH_QUIET_CANCEL;
      else process.env.UH_QUIET_CANCEL = prev;
      await rm(root, { recursive: true, force: true });
    }
  });
});
