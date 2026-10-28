import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverRuns, registerLiveRun } from "../src/harness/live-runs.js";

const reads = vi.hoisted(() => ({ events: 0 }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = ((file: unknown, ...rest: unknown[]) => {
    if (String(file).endsWith("events.ndjson")) reads.events += 1;
    return (actual.readFile as (...args: unknown[]) => unknown)(file, ...rest);
  }) as unknown as typeof actual.readFile;
  return { ...actual, readFile };
});

/**
 * #266: `uh ps` read and parsed the whole events.ndjson of every run that reported no turn count, even for a runtime
 * whose turns UH cannot count from events, and again on every refresh. It now skips those runtimes and caches the count
 * by the file's size and modification time.
 */
const NOW = Date.parse("2026-09-22T10:05:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "uh-ps-events-"));
  await mkdir(path.join(root, ".harness"), { recursive: true });
  await writeFile(path.join(root, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: ps events\n", "utf-8");
  reads.events = 0;
});
afterEach(async () => { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

async function seed(runtime: string, runId: string, events: string): Promise<string> {
  const runDir = path.join(root, ".harness", "missions", "m1", "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: "m1", run_id: runId, runtime, controller_pid: 4242,
    started_at: iso(NOW - 60_000), heartbeat_at: iso(NOW - 2_000), status: "running", turns: 0, denials: 0, inflight_tools: 0,
  }), "utf-8");
  await writeFile(path.join(runDir, "events.ndjson"), events, "utf-8");
  await registerLiveRun({ projectRoot: root, artifactRoot: root, runId, missionId: "m1", runtime });
  return runDir;
}
const assistant = (id: string) => `${JSON.stringify({ type: "assistant", message: { id, role: "assistant", content: [] } })}\n`;

describe("uh ps and the events file", () => {
  test("a runtime whose turns cannot be counted from events never has its events file read for a count", async () => {
    await seed("hermes", "20260922T100000Z-aaaaa1", `${JSON.stringify({ type: "x" })}\n`.repeat(2000));
    await discoverRuns(root, { now: NOW, persist: false });
    await discoverRuns(root, { now: NOW, persist: false });
    expect(reads.events).toBe(0);
  });

  test("the count of a runtime that can be counted is cached until the file changes", async () => {
    const runDir = await seed("claude-code", "20260922T100100Z-bbbbb2", assistant("m1") + assistant("m2"));
    const first = (await discoverRuns(root, { now: NOW, persist: false })).find((run) => run.run_id === "20260922T100100Z-bbbbb2")!;
    expect(first.turns).toBe(2);
    const readsAfterFirst = reads.events;
    expect(readsAfterFirst).toBeGreaterThan(0);
    const second = (await discoverRuns(root, { now: NOW, persist: false })).find((run) => run.run_id === "20260922T100100Z-bbbbb2")!;
    expect(second.turns).toBe(2);
    expect(reads.events).toBe(readsAfterFirst);
    await appendFile(path.join(runDir, "events.ndjson"), assistant("m3"), "utf-8");
    const third = (await discoverRuns(root, { now: NOW, persist: false })).find((run) => run.run_id === "20260922T100100Z-bbbbb2")!;
    expect(third.turns).toBe(3);
    expect(reads.events).toBeGreaterThan(readsAfterFirst);
  });
});
