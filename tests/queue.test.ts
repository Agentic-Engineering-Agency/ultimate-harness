import { describe, expect, test } from "vitest";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { QUEUE_STATE_SCHEMA_VERSION, validateQueueFile } from "../src/schema/queue.js";
import {
  createQueueLauncher,
  runQueue,
  type QueueLaunchRequest,
  type QueueLauncher,
  type QueueLauncherDeps,
  type QueueSettleOutcome,
  type QueueSettlementNotice,
  type QueueSettler,
} from "../src/harness/queue.js";
import { WaitError, type WaitOutcome } from "../src/harness/wait.js";

const MB = 1024 * 1024;
const PLENTY = 64 * 1024 * MB;

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "uh-queue-"));
}

async function writeQueue(root: string, document: unknown): Promise<string> {
  const file = path.join(root, "queue.yaml");
  await writeFile(file, stringify(document), "utf8");
  return file;
}

function immediateLauncher(log: QueueLaunchRequest[], outcomes: Record<string, "passed" | "failed"> = {}): QueueLauncher {
  return async (request) => {
    log.push(request);
    const status = outcomes[request.entryId] ?? "passed";
    return {
      run_id: request.resumeRunId ?? `run-${request.entryId}`,
      settled: Promise.resolve({ status, exit_code: status === "passed" ? 0 : 1 }),
    };
  };
}

function gatedLauncher(log: QueueLaunchRequest[]): { launcher: QueueLauncher; release: (entryId: string, outcome: QueueSettleOutcome) => void } {
  const gates = new Map<string, (outcome: QueueSettleOutcome) => void>();
  const launcher: QueueLauncher = async (request) => {
    log.push(request);
    const settled = new Promise<QueueSettleOutcome>((resolve) => { gates.set(request.entryId, resolve); });
    return { run_id: request.resumeRunId ?? `run-${request.entryId}`, settled };
  };
  return {
    launcher,
    release: (entryId, outcome) => {
      const gate = gates.get(entryId);
      if (gate === undefined) throw new Error(`No pending launch for entry "${entryId}"`);
      gate(outcome);
    },
  };
}

function noticeCounter(): { notices: QueueSettlementNotice[]; notify: (root: string, notice: QueueSettlementNotice) => void } {
  const notices: QueueSettlementNotice[] = [];
  return { notices, notify: (_root, notice) => { notices.push(notice); } };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the queue scheduler");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForCondition(predicate: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for the queue scheduler");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A spawner whose child is a bare EventEmitter, so a test drives its exit. */
function fakeChildSpawner(): { spawner: NonNullable<QueueLauncherDeps["spawner"]>; children: EventEmitter[] } {
  const children: EventEmitter[] = [];
  const spawner: NonNullable<QueueLauncherDeps["spawner"]> = () => {
    const child = new EventEmitter();
    children.push(child);
    return child as unknown as ChildProcess;
  };
  return { spawner, children };
}

/** A settle step whose promise the test resolves by hand. */
function gatedSettler(): { settle: QueueSettler; resolve: (outcome: QueueSettleOutcome) => void; started: () => boolean } {
  let resolveOutcome: ((outcome: QueueSettleOutcome) => void) | undefined;
  let started = false;
  const settle: QueueSettler = () => {
    started = true;
    return new Promise<QueueSettleOutcome>((resolve) => { resolveOutcome = resolve; });
  };
  return {
    settle,
    resolve: (outcome) => {
      if (resolveOutcome === undefined) throw new Error("settle has not started");
      resolveOutcome(outcome);
    },
    started: () => started,
  };
}

/** A `wait` harness that answers with one fake run record of the given shape. */
function fakeWaitReport(
  outcome: WaitOutcome,
  extra: { status?: string; stop_code?: string } = {},
): NonNullable<QueueLauncherDeps["wait"]> {
  return async (_root, options = {}) => {
    const runId = options.runId ?? "run-unknown";
    const status = extra.status ?? (outcome === "settled" ? "passed" : outcome);
    return {
      schema_version: "uh.wait.v0",
      generated_at: new Date(0).toISOString(),
      project_root: "/project",
      timeout_ms: 0,
      elapsed_ms: 0,
      entries: [{
        run_id: runId,
        mission_id: "m",
        runtime: "codex",
        controller_pid: 1,
        outcome,
        status,
        ...(extra.stop_code !== undefined ? { stop_code: extra.stop_code } : {}),
      }],
      counts: {
        matched: 1,
        settled: outcome === "settled" ? 1 : 0,
        passed: status === "passed" ? 1 : 0,
        failed: outcome === "settled" && status !== "passed" ? 1 : 0,
        orphaned: outcome === "orphaned" ? 1 : 0,
        timed_out: outcome === "timed_out" ? 1 : 0,
      },
      summary: "",
      exit_code: outcome === "settled" ? (status === "passed" ? 0 : 1) : outcome === "orphaned" ? 3 : 4,
    };
  };
}

async function persistedEntry(
  root: string,
  queueId: string,
  entryId: string,
): Promise<{ status: string; run_id: string | null; exit_code: number | null } | undefined> {
  try {
    const state = JSON.parse(await readFile(path.join(root, ".harness", "queue", queueId, "state.json"), "utf8"));
    return state.entries.find((entry: { id: string }) => entry.id === entryId);
  } catch {
    return undefined;
  }
}

describe("queue schema", () => {
  test("accepts a well-formed queue", () => {
    const queue = validateQueueFile({
      id: "wave-1",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex", after: ["a"] },
      ],
    });
    expect(queue.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  test("rejects unknown fields", () => {
    expect(() => validateQueueFile({ id: "q", entries: [], extra: true })).toThrow();
    expect(() => validateQueueFile({
      id: "q",
      entries: [{ id: "a", mission: "m.yaml", runtime: "codex", priority: 1 }],
    })).toThrow();
  });

  test("rejects duplicate entry ids", () => {
    expect(() => validateQueueFile({
      id: "q",
      entries: [
        { id: "a", mission: "a.yaml", runtime: "codex" },
        { id: "a", mission: "b.yaml", runtime: "codex" },
      ],
    })).toThrow(/Duplicate queue entry id/);
  });

  test("rejects unknown after references", () => {
    expect(() => validateQueueFile({
      id: "q",
      entries: [{ id: "a", mission: "a.yaml", runtime: "codex", after: ["ghost"] }],
    })).toThrow(/unknown entry/);
  });

  test("rejects after cycles", () => {
    expect(() => validateQueueFile({
      id: "q",
      entries: [
        { id: "a", mission: "a.yaml", runtime: "codex", after: ["b"] },
        { id: "b", mission: "b.yaml", runtime: "codex", after: ["a"] },
      ],
    })).toThrow(/cycle/);
  });
});

describe("uh queue run", () => {
  test("launches in file order and only after dependencies pass", async () => {
    const root = await makeRoot();
    const log: QueueLaunchRequest[] = [];
    const file = await writeQueue(root, {
      id: "order",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex", after: ["a"] },
        { id: "c", mission: "missions/c.yaml", runtime: "codex" },
      ],
    });
    const result = await runQueue(file, {
      root,
      launcher: immediateLauncher(log),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 3,
      notify: () => {},
    });
    expect(log.map((request) => request.entryId)).toEqual(["a", "c", "b"]);
    expect(result.status).toBe("passed");
    expect(result.counts).toMatchObject({ passed: 3, failed: 0, skipped: 0 });
  });

  test("never runs more than --max-orchestrators at once", async () => {
    const root = await makeRoot();
    const log: QueueLaunchRequest[] = [];
    const { launcher, release } = gatedLauncher(log);
    const file = await writeQueue(root, {
      id: "cap",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex" },
        { id: "c", mission: "missions/c.yaml", runtime: "codex" },
      ],
    });
    const pending = runQueue(file, {
      root,
      launcher,
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 2,
      notify: () => {},
    });
    await waitUntil(() => log.length >= 2);
    expect(log.map((request) => request.entryId)).toEqual(["a", "b"]);
    release("a", { status: "passed", exit_code: 0 });
    await waitUntil(() => log.length >= 3);
    expect(log.map((request) => request.entryId)).toEqual(["a", "b", "c"]);
    release("b", { status: "passed", exit_code: 0 });
    release("c", { status: "passed", exit_code: 0 });
    const result = await pending;
    expect(result.counts.passed).toBe(3);
  });

  test("refuses to launch under the free-memory floor, then launches once headroom returns", async () => {
    const root = await makeRoot();
    const events: string[] = [];
    const log: QueueLaunchRequest[] = [];
    let probes = 0;
    const file = await writeQueue(root, {
      id: "floor",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex" },
      ],
    });
    const result = await runQueue(file, {
      root,
      maxOrchestrators: 2,
      memoryFloorMb: 1024,
      runMemoryMb: 1024,
      memoryRetryMs: 1,
      freeMemoryBytes: () => {
        probes += 1;
        events.push("probe");
        return probes === 1 ? 0 : PLENTY;
      },
      launcher: async (request) => {
        events.push(`launch:${request.entryId}`);
        log.push(request);
        return {
          run_id: request.resumeRunId ?? `run-${request.entryId}`,
          settled: Promise.resolve({ status: "passed", exit_code: 0 }),
        };
      },
      notify: () => {},
    });
    // The first probe reports no headroom, so the entry is refused; only after
    // the retry probe reports headroom does it launch.
    expect(events.slice(0, 3)).toEqual(["probe", "probe", "launch:a"]);
    expect(probes).toBeGreaterThan(1);
    expect(log.map((request) => request.entryId)).toEqual(["a", "b"]);
    expect(result.counts.passed).toBe(2);
  });

  test("skips an entry whose dependency failed, never launching it", async () => {
    const root = await makeRoot();
    const log: QueueLaunchRequest[] = [];
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "skip",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex", after: ["a"] },
        { id: "c", mission: "missions/c.yaml", runtime: "codex", after: ["b"] },
      ],
    });
    const result = await runQueue(file, {
      root,
      launcher: immediateLauncher(log, { a: "failed" }),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 2,
      notify,
    });
    expect(log.map((request) => request.entryId)).toEqual(["a"]);
    expect(result.status).toBe("failed");
    expect(result.entries.find((entry) => entry.id === "b")?.status).toBe("skipped");
    expect(result.entries.find((entry) => entry.id === "c")?.status).toBe("skipped");
    expect(notices.map((notice) => `${notice.entryId}:${notice.status}`)).toEqual(["a:failed", "b:skipped", "c:skipped"]);
  });

  test("sends exactly one notification per settled entry", async () => {
    const root = await makeRoot();
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "notify",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex" },
        { id: "c", mission: "missions/c.yaml", runtime: "codex" },
      ],
    });
    await runQueue(file, {
      root,
      launcher: immediateLauncher([]),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 2,
      notify,
    });
    expect(notices).toHaveLength(3);
    expect(notices.map((notice) => notice.entryId).sort()).toEqual(["a", "b", "c"]);
    expect(notices.every((notice) => notice.status === "passed")).toBe(true);
  });

  test("resumes from state.json: keeps a passed entry and waits on a recorded running run id", async () => {
    const root = await makeRoot();
    const log: QueueLaunchRequest[] = [];
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "resume",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex", after: ["a"] },
      ],
    });
    const stateDir = path.join(root, ".harness", "queue", "resume");
    await mkdir(stateDir, { recursive: true });
    await writeFile(path.join(stateDir, "state.json"), JSON.stringify({
      schema_version: QUEUE_STATE_SCHEMA_VERSION,
      queue_id: "resume",
      entries: [
        { id: "a", status: "passed", run_id: "run-a", started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:01:00.000Z", exit_code: 0 },
        { id: "b", status: "running", run_id: "run-b", started_at: "2026-01-01T00:01:00.000Z", finished_at: null, exit_code: null },
      ],
    }, null, 2), "utf8");

    const result = await runQueue(file, {
      root,
      launcher: immediateLauncher(log),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 2,
      notify,
    });

    expect(log).toHaveLength(1);
    expect(log[0].entryId).toBe("b");
    expect(log[0].resumeRunId).toBe("run-b");
    expect(notices.map((notice) => notice.entryId)).toEqual(["b"]);
    expect(result.status).toBe("passed");
    const a = result.entries.find((entry) => entry.id === "a");
    expect(a).toMatchObject({ status: "passed", run_id: "run-a", exit_code: 0 });
    const persisted = JSON.parse(await readFile(path.join(stateDir, "state.json"), "utf8"));
    expect(persisted.entries.find((entry: { id: string }) => entry.id === "b")).toMatchObject({ status: "passed", run_id: "run-b" });
  });

  test("records an orphaned run as failed/orphaned and skips its dependants", async () => {
    const root = await makeRoot();
    const { spawner } = fakeChildSpawner();
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "orphan",
      entries: [
        { id: "a", mission: "missions/a.yaml", runtime: "codex" },
        { id: "b", mission: "missions/b.yaml", runtime: "codex", after: ["a"] },
      ],
    });
    const result = await runQueue(file, {
      root,
      launcher: createQueueLauncher({ spawner, wait: fakeWaitReport("orphaned") }),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 2,
      notify,
    });
    expect(result.status).toBe("failed");
    expect(result.entries.find((entry) => entry.id === "a")).toMatchObject({ status: "failed" });
    expect(result.entries.find((entry) => entry.id === "b")?.status).toBe("skipped");
    expect(notices.map((notice) => `${notice.entryId}:${notice.status}`)).toEqual(["a:failed", "b:skipped"]);
    expect(notices[0].reason).toBe("orphaned");
    expect(notices).toHaveLength(2);
  });

  test("keeps a slow-settling entry running until its record settles, then passes", async () => {
    const root = await makeRoot();
    const { spawner, children } = fakeChildSpawner();
    const { settle, resolve, started } = gatedSettler();
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "slow",
      entries: [{ id: "a", mission: "missions/a.yaml", runtime: "codex" }],
    });
    const pending = runQueue(file, {
      root,
      launcher: createQueueLauncher({ spawner, settle }),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 1,
      notify,
    });
    await waitForCondition(async () => (await persistedEntry(root, "slow", "a"))?.run_id != null);
    expect(started()).toBe(true);
    // The controller child exits before the run's record settles.
    children[0].emit("exit", 0);
    expect(notices).toHaveLength(0);
    expect(await persistedEntry(root, "slow", "a")).toMatchObject({ status: "running" });
    resolve({ status: "passed", exit_code: 0 });
    const result = await pending;
    expect(result.status).toBe("passed");
    expect(result.entries[0].status).toBe("passed");
    expect(notices.map((notice) => `${notice.entryId}:${notice.status}`)).toEqual(["a:passed"]);
    expect(notices).toHaveLength(1);
  });

  test("fails a live run past the wait timeout as wait-timeout and keeps its run id", async () => {
    const root = await makeRoot();
    const { spawner } = fakeChildSpawner();
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "timeout",
      entries: [{ id: "a", mission: "missions/a.yaml", runtime: "codex" }],
    });
    const result = await runQueue(file, {
      root,
      launcher: createQueueLauncher({ spawner, wait: fakeWaitReport("timed_out") }),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 1,
      notify,
    });
    const entry = result.entries[0];
    expect(result.status).toBe("failed");
    expect(entry.status).toBe("failed");
    expect(entry.run_id).not.toBeNull();
    expect(entry.run_id).toBe((await persistedEntry(root, "timeout", "a"))?.run_id);
    expect(notices).toHaveLength(1);
    expect(notices[0].reason).toBe("wait-timeout");
  });

  test("fails a child that exits non-zero before any run record as launch-failed", async () => {
    const root = await makeRoot();
    const { spawner, children } = fakeChildSpawner();
    const { notices, notify } = noticeCounter();
    const file = await writeQueue(root, {
      id: "launch-failed",
      entries: [{ id: "a", mission: "missions/a.yaml", runtime: "codex" }],
    });
    const missing: NonNullable<QueueLauncherDeps["wait"]> = async () => {
      throw new WaitError("no run matching the launch is discoverable yet", "unknown_target");
    };
    const pending = runQueue(file, {
      root,
      launcher: createQueueLauncher({ spawner, wait: missing }),
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 1,
      notify,
    });
    await waitForCondition(async () => children.length === 1);
    children[0].emit("exit", 1);
    const result = await pending;
    expect(result.status).toBe("failed");
    expect(result.entries[0]).toMatchObject({ status: "failed", exit_code: 1 });
    expect(notices).toHaveLength(1);
    expect(notices[0].reason).toBe("launch-failed");
  });
});
