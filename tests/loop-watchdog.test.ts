import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_EVERY_CALLS,
  IDENTICAL_REPEAT_THRESHOLD,
  ALTERNATING_PAIR_THRESHOLD,
  createLoopWatchdog,
  resolveLoopWatchdogMode,
  type LoopWatchdogProvider,
} from "../src/harness/loop-watchdog.js";
import { MIN_PROBE_CALLS } from "../src/harness/loop-probe.js";
import { DecisionReceiptSchema } from "../src/schema/decisions.js";
import type { EvaluateSystemOneOptions, SystemOneResult } from "../src/harness/typesafe.js";
import { runRuntimeProcess, type RuntimeProcessOutput } from "../src/harness/runtime-process.js";

/** A synthetic absolute working directory: no filesystem is touched by a projection. */
const WORKING_DIRECTORY = "/repo/work";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

beforeEach(() => {
  // The default provider must resolve a disabled state, never reach the network.
  vi.stubEnv("TYPESAFE_API_KEY", "");
});

async function scratchRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-loop-watchdog-"));
  roots.push(root);
  return root;
}

/** A mission directory that receipts may be written under. */
async function missionDir(): Promise<string> {
  const root = await scratchRoot();
  await mkdir(root, { recursive: true });
  return root;
}

type Event = Record<string, unknown>;

/** oh-my-pi registers a call once, at `tool_execution_start`, and completes it later. */
function omp(toolCallId: string, toolName: string, args: Event, end: Event = {}): Event[] {
  return [
    { type: "tool_execution_start", toolCallId, toolName, args },
    { type: "tool_execution_end", toolCallId, toolName, result: { isError: false }, ...end },
  ];
}

/** `count` identical failing shell calls: a pure reasoning-in-circles window. */
function repeatedEvents(count: number): unknown[] {
  const events: unknown[] = [];
  for (let index = 0; index < count; index++) {
    events.push(...omp(`c${index}`, "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
  }
  return events;
}

/** `count` distinct successful reads: a productive trajectory with no loop. */
function distinctEvents(count: number): unknown[] {
  const events: unknown[] = [];
  for (let index = 0; index < count; index++) {
    events.push(...omp(`r${index}`, "read_file", { file_path: `src/f${index}.ts` }));
  }
  return events;
}

/** A-B-A-B-A-B: two distinct states the agent ping-pongs between. */
function alternatingEvents(pairs: number): unknown[] {
  const events: unknown[] = [];
  for (let index = 0; index < pairs * 2; index++) {
    events.push(...(index % 2 === 0
      ? omp(`a${index}`, "read_file", { file_path: "src/a.ts" })
      : omp(`b${index}`, "write_file", { file_path: "src/b.ts" })));
  }
  return events;
}

function disabledProvider(): { provider: LoopWatchdogProvider; calls: EvaluateSystemOneOptions[] } {
  const calls: EvaluateSystemOneOptions[] = [];
  return { provider: async (options) => { calls.push(options); return { kind: "disabled" }; }, calls };
}

const OK_RESULT: SystemOneResult = {
  kind: "ok",
  model: "jev-2026-09-01",
  answers: { retrying: { noul: 0.9 }, progressing: { noul: 0.2 }, alternating: { noul: 0.1 } },
  usage: { input_tokens: 9, output_tokens: 4 },
  latency_ms: 12,
};

function okProvider(): { provider: LoopWatchdogProvider; calls: EvaluateSystemOneOptions[] } {
  const calls: EvaluateSystemOneOptions[] = [];
  return { provider: async (options) => { calls.push(options); return OK_RESULT; }, calls };
}

async function receiptFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(path.join(directory, "decision-receipts"))).filter(name => name.endsWith(".json"));
  } catch {
    return [];
  }
}

async function readReceipt(directory: string, index = 0): Promise<Record<string, unknown>> {
  const files = await receiptFiles(directory);
  const raw = await readFile(path.join(directory, "decision-receipts", files[index]), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Read the receipt with its exact serialized bytes so a leak can be asserted. */
async function readReceiptRaw(directory: string, index = 0): Promise<string> {
  const files = await receiptFiles(directory);
  return readFile(path.join(directory, "decision-receipts", files[index]), "utf8");
}

describe("createLoopWatchdog", () => {
  test("performs no evaluation below minCalls even when a signal already crosses its threshold", async () => {
    const dir = await missionDir();
    const { provider, calls } = disabledProvider();
    const watchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one", everyCalls: 1, minCalls: 6 });

    const events = repeatedEvents(5);
    await watchdog.observe(events);

    expect(calls).toHaveLength(0);
    expect(watchdog.evaluations).toBe(0);
    expect(await receiptFiles(dir)).toEqual([]);

    events.push(...omp("c5", "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
    await watchdog.observe(events);

    expect(calls).toHaveLength(1);
    expect(watchdog.evaluations).toBe(1);
  });

  test("evaluates only every everyCalls newly completed tool calls", async () => {
    const dir = await missionDir();
    const { provider, calls } = disabledProvider();
    const watchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one", everyCalls: 6 });

    const events: unknown[] = [];
    for (let index = 0; index < 5; index++) {
      events.push(...omp(`c${index}`, "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
      await watchdog.observe(events);
    }
    expect(calls).toHaveLength(0);

    // Sixth call: first cadence point.
    events.push(...omp("c5", "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
    await watchdog.observe(events);
    expect(calls).toHaveLength(1);

    // Calls seven through eleven add no cadence point.
    for (let index = 6; index < 11; index++) {
      events.push(...omp(`c${index}`, "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
      await watchdog.observe(events);
    }
    expect(calls).toHaveLength(1);

    // Twelfth call: the second cadence point.
    events.push(...omp("c11", "bash", { command: "bun test" }, { isError: true, result: { exitCode: 1 } }));
    await watchdog.observe(events);
    expect(calls).toHaveLength(2);
    expect(DEFAULT_EVERY_CALLS).toBe(6);
  });

  test("records the deterministic signals and a disabled provider outcome and calls the provider once", async () => {
    const dir = await missionDir();
    const { provider, calls } = disabledProvider();
    const watchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one" });

    await watchdog.observe(repeatedEvents(6));

    expect(calls).toHaveLength(1);
    expect(watchdog.evaluations).toBe(1);
    const receipt = await readReceipt(dir);
    expect(receipt).toMatchObject({
      schema_version: "uh.decision-receipt.v0",
      kind: "retry-stop",
      status: "advisory",
      authorizer: "shadow",
      applied: false,
      human_required: true,
      provider_status: "disabled",
      provider_outcome: "disabled",
      deterministic_fallback: true,
      provider: { name: "typesafe" },
    });
    expect(receipt.loop_signals).toMatchObject({ identical_repeats: 5 });
    expect((receipt.loop_signals as { identical_repeats: number }).identical_repeats)
      .toBeGreaterThanOrEqual(IDENTICAL_REPEAT_THRESHOLD);
    expect(receipt.answers).toBeUndefined();
    expect(() => DecisionReceiptSchema.parse(receipt)).not.toThrow();
  });

  test("calls the provider only when a deterministic signal crosses its threshold", async () => {
    const dir = await missionDir();
    const quiet = disabledProvider();
    const quietWatchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider: quiet.provider, missionDir: dir, missionId: "one" });

    // Six distinct successful reads: no repeats, no alternation.
    await quietWatchdog.observe(distinctEvents(6));
    expect(quiet.calls).toHaveLength(0);
    expect(await receiptFiles(dir)).toEqual([]);

    // A-B-A-B-A-B: alternation crosses its threshold.
    const alternating = disabledProvider();
    const alternatingWatchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider: alternating.provider, missionDir: dir, missionId: "one" });
    await alternatingWatchdog.observe(alternatingEvents(4));
    expect(alternating.calls).toHaveLength(1);
    const receipt = await readReceipt(dir);
    expect((receipt.loop_signals as { alternating_pairs: number }).alternating_pairs)
      .toBeGreaterThanOrEqual(ALTERNATING_PAIR_THRESHOLD);
  });

  test("writes an ok receipt with answers, model and usage when the provider answers", async () => {
    const dir = await missionDir();
    const { provider, calls } = okProvider();
    const watchdog = createLoopWatchdog({ source: "command-code", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one", runId: "run-1" });

    await watchdog.observe(repeatedEvents(6));
    expect(calls).toHaveLength(1);
    // The projected window the provider was asked about carries no absolute path.
    const state = JSON.stringify(calls[0]?.state);
    expect(state).not.toContain("/repo/");
    expect(state).toContain("activity");

    const receipt = await readReceipt(dir);
    expect(receipt).toMatchObject({
      kind: "retry-stop",
      status: "advisory",
      authorizer: "shadow",
      applied: false,
      human_required: true,
      provider_status: "available",
      provider_outcome: "ok",
      deterministic_fallback: false,
      run_id: "run-1",
      provider: { name: "typesafe", model: "jev-2026-09-01", latency_ms: 12, usage: { input_tokens: 9, output_tokens: 4 } },
      answers: { retrying: { noul: 0.9 }, progressing: { noul: 0.2 }, alternating: { noul: 0.1 } },
      state_transition: { from: "activity", to: "activity", unlocked: [] },
    });
    // The mission event log records the receipt.
    const events = await readFile(path.join(dir, "events.ndjson"), "utf8");
    expect(events).toContain("decision.recorded");
    expect(events).toContain("loop-watchdog");
  });

  test("a throwing provider is caught, written as loop_watchdog_error and writes no receipt", async () => {
    const dir = await missionDir();
    const appended: Event[] = [];
    const watchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider: async () => { throw new Error("provider exploded"); },
      missionDir: dir, missionId: "one", runId: "run-1",
      appendEvent: async (event) => { appended.push(event); } });

    await expect(watchdog.observe(repeatedEvents(6))).resolves.toBeUndefined();

    expect(await receiptFiles(dir)).toEqual([]);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ event: "loop_watchdog_error", mission_id: "one", run_id: "run-1" });
  });

  test("mode off observes nothing at all", async () => {
    const dir = await missionDir();
    const { provider, calls } = disabledProvider();
    const appended: Event[] = [];
    const watchdog = createLoopWatchdog({ source: "oh-my-pi", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one", mode: "off",
      appendEvent: async (event) => { appended.push(event); } });

    await watchdog.observe(repeatedEvents(12));

    expect(calls).toHaveLength(0);
    expect(watchdog.evaluations).toBe(0);
    expect(await receiptFiles(dir)).toEqual([]);
    expect(appended).toEqual([]);
  });

  test("the serialized receipt contains no absolute path", async () => {
    const dir = await missionDir();
    const { provider } = disabledProvider();
    const watchdog = createLoopWatchdog({ source: "command-code", workingDirectory: WORKING_DIRECTORY,
      provider, missionDir: dir, missionId: "one" });

    const events: unknown[] = [];
    for (let index = 0; index < 6; index++) {
      events.push(...omp(`w${index}`, "write_file", { file_path: `${WORKING_DIRECTORY}/src/a.ts` },
        { isError: true, result: { exitCode: 1 } }));
    }
    await watchdog.observe(events);

    const raw = await readReceiptRaw(dir);
    expect(raw).not.toContain("/repo");
    expect(raw).not.toContain(WORKING_DIRECTORY);
    expect(raw).not.toContain("/src/a.ts");
    expect(raw).not.toContain("bun test");
  });
});

describe("resolveLoopWatchdogMode", () => {
  async function mission(contents: string): Promise<string> {
    const dir = await scratchRoot();
    await writeFile(path.join(dir, "mission.yaml"), contents, "utf8");
    return path.join(dir, "mission.yaml");
  }

  test("reads runtime_config.loop_watchdog, defaulting to shadow", async () => {
    expect(await resolveLoopWatchdogMode(await mission(
      "schema_version: uh.mission.v0\nid: one\ntitle: t\nworkflow_profile: research-docs\nruntime_config:\n  loop_watchdog: off\n"))).toBe("off");
    expect(await resolveLoopWatchdogMode(await mission(
      "schema_version: uh.mission.v0\nid: one\ntitle: t\nworkflow_profile: research-docs\nruntime_config:\n  loop_watchdog: shadow\n"))).toBe("shadow");
    expect(await resolveLoopWatchdogMode(await mission(
      "schema_version: uh.mission.v0\nid: one\ntitle: t\nworkflow_profile: research-docs\n"))).toBe("shadow");
  });

  test("degrades to no watchdog when the mission cannot be read", async () => {
    expect(await resolveLoopWatchdogMode(path.join(tmpdir(), "uh-missing-mission.yaml"))).toBeUndefined();
  });
});

describe("runtime supervision wiring", () => {
  const LOOP_FIXTURE = `
    const out = value => process.stdout.write(JSON.stringify(value) + "\\n");
    out({ type: "session", sessionId: "loop-session" });
    out({ type: "model_request_start", model: "m" });
    for (let index = 0; index < 8; index++) {
      out({ type: "tool_execution_start", toolCallId: "c" + index, toolName: "bash", args: { command: "bun test" } });
      out({ type: "tool_execution_end", toolCallId: "c" + index, toolName: "bash", result: { exitCode: 1 } });
    }
    out({ type: "result", subtype: "success", sessionId: "loop-session", stopReason: "end_turn", finalText: "done" });
  `;

  async function fixture(mode: "shadow" | "off"): Promise<{ root: string; missionDir: string; fixturePath: string }> {
    const root = await scratchRoot();
    const missionDir = path.join(root, ".harness", "missions", "one");
    await mkdir(missionDir, { recursive: true });
    await writeFile(path.join(missionDir, "mission.yaml"), [
      "schema_version: uh.mission.v0",
      "id: one",
      "title: Loop watchdog supervision",
      "workflow_profile: research-docs",
      "runtime_config:",
      `  loop_watchdog: ${mode}`,
      "",
    ].join("\n"), "utf8");
    const fixturePath = path.join(root, "loop-fixture.cjs");
    await writeFile(fixturePath, LOOP_FIXTURE, "utf8");
    return { root, missionDir, fixturePath };
  }

  async function run(root: string, fixturePath: string, runId: string): Promise<RuntimeProcessOutput> {
    return runRuntimeProcess({
      command: process.execPath,
      args: [fixturePath],
      cwd: root,
      limits: {},
      artifacts: {
        directory: path.join(root, ".harness", "missions", "one", "runs", runId),
        missionId: "one",
        runId,
        runtime: "command-code",
      },
    });
  }

  test("a looping run settles exactly as it does with the watchdog off", async () => {
    const off = await fixture("off");
    const offOutput = await run(off.root, off.fixturePath, "off-run");
    expect(await receiptFiles(off.missionDir)).toEqual([]);

    const shadow = await fixture("shadow");
    const shadowOutput = await run(shadow.root, shadow.fixturePath, "shadow-run");

    // Identical settlement: same exit, same terminal facts, no supervision stop.
    expect(shadowOutput.exitCode).toBe(offOutput.exitCode);
    expect(shadowOutput.nativeTerminal).toBe(offOutput.nativeTerminal);
    expect(shadowOutput.nativeTerminalFailure).toBe(offOutput.nativeTerminalFailure);
    expect(shadowOutput.supervisionStopCode).toBeUndefined();
    expect(offOutput.supervisionStopCode).toBeUndefined();
    expect(shadowOutput.cancelled).toBe(offOutput.cancelled);
    expect(shadowOutput.timedOut).toBe(offOutput.timedOut);

    // The shadow run recorded advisory receipts; the off run recorded none.
    const files = await receiptFiles(shadow.missionDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const receipt = await readReceipt(shadow.missionDir);
    expect(receipt).toMatchObject({ kind: "retry-stop", status: "advisory", authorizer: "shadow", applied: false });
  }, 30_000);
});
