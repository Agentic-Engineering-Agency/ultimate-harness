import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { appendRuntimeCancelledEvent, finalizeRuntimeCancelledRun } from "../src/harness/runtime-events.js";
import { projectDeliveryObservatory } from "../src/harness/delivery-observatory/project.js";

async function seedMission(
  root: string,
  missionId: string,
  latestRun: { run_id: string; started_at: string; status: string },
  runs: Array<{ run_id: string; started_at: string; status: string; runtime: string }>,
): Promise<string> {
  const missionDir = join(root, ".harness", "missions", missionId);
  await mkdir(join(missionDir, "runs"), { recursive: true });
  await writeFile(join(missionDir, "mission.yaml"), [
    "schema_version: uh.mission.v0",
    `id: ${missionId}`,
    "name: Cancellation smoke",
    "workflow_profile: staged",
  ].join("\n"), "utf-8");
  await writeFile(join(missionDir, "latest.json"), JSON.stringify({
    schema_version: "uh.latest-run.v0",
    ...latestRun,
  }), "utf-8");
  await writeFile(join(missionDir, "runs", "index.json"), JSON.stringify({
    schema_version: "uh.runs-index.v0",
    runs,
  }), "utf-8");
  return missionDir;
}

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
  test("finalizes explicit canonical cancellation across latest, runs index, result, and events", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-finalize-"));
    try {
      const missionDir = join(root, ".harness", "missions", "m-cancel-final");
      await mkdir(join(missionDir, "runs"), { recursive: true });
      const runId = "20260521T120000Z-cafe00";
      await writeFile(join(missionDir, "latest.json"), JSON.stringify({
        schema_version: "uh.latest-run.v0",
        run_id: runId,
        started_at: "2026-05-21T12:00:00.000Z",
        status: "running",
      }), "utf-8");
      await writeFile(join(missionDir, "runs", "index.json"), JSON.stringify({
        schema_version: "uh.runs-index.v0",
        runs: [{ run_id: runId, started_at: "2026-05-21T12:00:00.000Z", status: "running", runtime: "oh-my-pi" }],
      }), "utf-8");
      const eventPath = finalizeRuntimeCancelledRun({
        root,
        missionId: "m-cancel-final",
        runId,
        runtime: "oh-my-pi",
        signal: "SIGTERM",
        timestamp: "2026-05-21T12:00:01.000Z",
      });
      expect(eventPath).not.toBeNull();
      expect(JSON.parse(await readFile(join(missionDir, "latest.json"), "utf-8")).status).toBe("cancelled");
      expect(JSON.parse(await readFile(join(missionDir, "runs", "index.json"), "utf-8")).runs[0].status).toBe("cancelled");
      expect(await readFile(join(missionDir, "runs", runId, "runtime-result.yaml"), "utf-8")).toContain("status: cancelled");
      expect((await readFile(eventPath!, "utf-8")).match(/runtime\.cancelled/g)?.length).toBe(1);
      expect((await readFile(eventPath!, "utf-8")).match(/runtime\.finished/g)?.length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("projects cancellation as the selected run through the existing Observatory", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-observatory-"));
    try {
      const runId = "20260522T120000Z-cafe00";
      await seedMission(root, "m-observe-cancel", {
        run_id: runId,
        started_at: "2026-05-22T12:00:00.000Z",
        status: "running",
      }, [{ run_id: runId, started_at: "2026-05-22T12:00:00.000Z", status: "running", runtime: "oh-my-pi" }]);
      finalizeRuntimeCancelledRun({
        root,
        missionId: "m-observe-cancel",
        runId,
        runtime: "oh-my-pi",
        signal: "SIGTERM",
        timestamp: "2026-05-22T12:00:01.000Z",
      });
      const snapshot = await projectDeliveryObservatory(root, { now: "2026-05-22T12:00:02.000Z" });
      expect(snapshot.work_items[0]).toMatchObject({
        operation: "cancelled",
        adapter: { state: "known", value: "oh-my-pi" },
      });
      expect(snapshot.events.some((event) => event.safe_summary === "Run status changed to cancelled.")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("cancels an explicitly selected older run without changing newer latest or mirrors", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-stale-latest-"));
    try {
      const oldRunId = "20260522T120000Z-old000";
      const newRunId = "20260522T120001Z-new000";
      const missionDir = await seedMission(root, "m-stale-cancel", {
        run_id: newRunId,
        started_at: "2026-05-22T12:00:01.000Z",
        status: "running",
      }, [
        { run_id: oldRunId, started_at: "2026-05-22T12:00:00.000Z", status: "running", runtime: "oh-my-pi" },
        { run_id: newRunId, started_at: "2026-05-22T12:00:01.000Z", status: "running", runtime: "oh-my-pi" },
      ]);
      const oldRunDir = join(missionDir, "runs", oldRunId);
      await mkdir(oldRunDir, { recursive: true });
      await writeFile(join(oldRunDir, "runtime-session.yaml"), [
        "schema_version: uh.runtime-session.v0", "mission_id: m-stale-cancel", "runtime: oh-my-pi",
        "status: running", "started_at: 2026-05-22T12:00:00.000Z",
      ].join("\n"), "utf-8");
      const latestBefore = await readFile(join(missionDir, "latest.json"), "utf-8");
      const resultMirrorBefore = "newer result mirror must remain byte-for-byte unchanged\n";
      const sessionMirrorBefore = "newer session mirror must remain byte-for-byte unchanged\n";
      await writeFile(join(missionDir, "runtime-result.yaml"), resultMirrorBefore, "utf-8");
      await writeFile(join(missionDir, "runtime-session.yaml"), sessionMirrorBefore, "utf-8");

      finalizeRuntimeCancelledRun({
        root,
        missionId: "m-stale-cancel",
        runId: oldRunId,
        runtime: "oh-my-pi",
        signal: "SIGTERM",
        timestamp: "2026-05-22T12:00:05.000Z",
      });

      expect(await readFile(join(missionDir, "latest.json"), "utf-8")).toBe(latestBefore);
      expect(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8")).toBe(resultMirrorBefore);
      expect(await readFile(join(missionDir, "runtime-session.yaml"), "utf-8")).toBe(sessionMirrorBefore);
      const index = JSON.parse(await readFile(join(missionDir, "runs", "index.json"), "utf-8")) as {
        runs: Array<{ run_id: string; status: string }>;
      };
      expect(index.runs).toEqual([
        { run_id: oldRunId, started_at: "2026-05-22T12:00:00.000Z", status: "cancelled", runtime: "oh-my-pi", finished_at: "2026-05-22T12:00:05.000Z" },
        { run_id: newRunId, started_at: "2026-05-22T12:00:01.000Z", status: "running", runtime: "oh-my-pi" },
      ]);
      expect(parse(await readFile(join(oldRunDir, "runtime-result.yaml"), "utf-8"))).toMatchObject({
        status: "cancelled",
        started_at: "2026-05-22T12:00:00.000Z",
        finished_at: "2026-05-22T12:00:05.000Z",
      });
      expect(parse(await readFile(join(oldRunDir, "runtime-session.yaml"), "utf-8"))).toMatchObject({
        status: "failed",
        started_at: "2026-05-22T12:00:00.000Z",
        finished_at: "2026-05-22T12:00:05.000Z",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("persists terminal result, session, and index when cancellation event append fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "uh-test-runtime-events-write-failure-"));
    try {
      const runId = "20260522T120002Z-cafe00";
      const missionDir = await seedMission(root, "m-event-failure", {
        run_id: runId,
        started_at: "2026-05-22T12:00:02.000Z",
        status: "running",
      }, [{ run_id: runId, started_at: "2026-05-22T12:00:02.000Z", status: "running", runtime: "oh-my-pi" }]);
      await mkdir(join(missionDir, "runs", runId, "events.ndjson"), { recursive: true });
      const eventPath = finalizeRuntimeCancelledRun({
        root,
        missionId: "m-event-failure",
        runId,
        runtime: "oh-my-pi",
        signal: "SIGTERM",
        timestamp: "2026-05-22T12:00:03.000Z",
      });
      expect(eventPath).toBeNull();
      expect(parse(await readFile(join(missionDir, "runs", runId, "runtime-result.yaml"), "utf-8"))).toMatchObject({ status: "cancelled" });
      expect(parse(await readFile(join(missionDir, "runs", runId, "runtime-session.yaml"), "utf-8"))).toMatchObject({ status: "failed" });
      expect(JSON.parse(await readFile(join(missionDir, "runs", "index.json"), "utf-8")).runs[0]).toMatchObject({
        run_id: runId,
        status: "cancelled",
        finished_at: "2026-05-22T12:00:03.000Z",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
