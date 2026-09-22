import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stringify } from "yaml";
import {
  projectRunDigest,
  readRunDigest,
  relativeRunTarget,
  runDigestPath,
} from "../src/harness/run-digest.js";
import { indexRuns, summarizeRuns, type RunRecord } from "../src/harness/experience-store.js";
import { formatRunReport, reportRun } from "../src/harness/report.js";
import { registerLiveRun } from "../src/harness/live-runs.js";
import type { RunDigest } from "../src/schema/run-digest.js";
import { runRuntimeProcess } from "../src/harness/runtime-process.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/runtime-events", import.meta.url));
const NOW = Date.parse("2026-01-01T06:00:00.000Z");
const iso = (milliseconds: number): string => new Date(milliseconds).toISOString();

/** Parse a native event excerpt: one JSON event per line. */
function fixture(name: string): unknown[] {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function digestOf(events: readonly unknown[], options: { runtime?: string; workingDirectory?: string } = {}): RunDigest {
  return projectRunDigest(events, {
    runtime: options.runtime ?? "command-code",
    ...(options.workingDirectory !== undefined ? { workingDirectory: options.workingDirectory } : {}),
    startedAt: NOW,
    now: NOW,
  });
}

describe("run digest — Command Code fixtures", () => {
  test("reduces the healthy stream to calls, files, turns, usage and activity", () => {
    const digest = digestOf(fixture("command-code-healthy.ndjson"));

    expect(digest.schema_version).toBe("uh.run-digest.v0");
    expect(digest.runtime).toBe("command-code");
    expect(digest.turns).toBe(10);
    expect(digest.recent_calls).toHaveLength(10);
    expect(digest.recent_calls[0]).toMatchObject({ tool: "read_file", kind: "read", target: "src/harness/team-run.ts", status: "ok", error_class: "none" });
    expect(digest.recent_calls.at(-1)).toMatchObject({ tool: "shell_command", kind: "shell", target: "bunx", status: "ok", error_class: "none" });
    // A call that completed is no longer in flight, so the run reads idle.
    expect(digest.current_activity.kind).toBe("idle");
    expect(digest.files_written).toEqual({ files: ["tests/team-commit-hygiene.test.ts", "src/harness/team-run.ts"], total: 2 });
    expect(digest.denials).toEqual([]);
    expect(digest.native_refusals).toBe(0);
    expect(digest.usage).toEqual({});
    expect(digest.loop_signals).toEqual({ identical_repeats: 2, alternating_pairs: 0, distinct_targets: 5, long_running_tools: [] });
  });

  test("counts a native refusal without disarming anything", () => {
    const digest = digestOf(fixture("command-code-native-unknown-tool.ndjson"));

    expect(digest.turns).toBe(2);
    expect(digest.recent_calls).toHaveLength(2);
    expect(digest.recent_calls[0]).toMatchObject({ tool: "shell_command", target: "bunx", status: "ok" });
    expect(digest.recent_calls[1]).toMatchObject({ tool: "shell", target: "echo", status: "denied", error_class: "denied" });
    expect(digest.denials).toEqual([{ class: "denied", tool: "shell", target: "echo" }]);
    expect(digest.native_refusals).toBe(1);
    expect(digest.current_activity.kind).toBe("idle");
  });

  test("sums the token counters the stream reports exactly once", () => {
    const digest = digestOf(fixture("command-code-usage.ndjson"));

    expect(digest.recent_calls.map((call) => call.tool)).toEqual(["read_file", "edit_file"]);
    expect(digest.usage).toEqual({ input_tokens: 39076, output_tokens: 580, cache_read_tokens: 18432, cache_write_tokens: 0 });
    expect(digest.turns).toBe(3);
  });
});

describe("run digest — target resolution", () => {
  test("resolves the three Windows path forms against the working directory", () => {
    expect(relativeRunTarget("C:\\worker\\src\\a.ts", "C:\\worker")).toBe("src/a.ts");
    expect(relativeRunTarget("/C:/worker/src/b.ts", "C:\\worker")).toBe("src/b.ts");
    expect(relativeRunTarget("c:/Worker/src/c.ts", "C:\\worker")).toBe("src/c.ts");
    expect(relativeRunTarget("C:\\worker", "C:\\worker")).toBe(".");
  });

  test("shows anything outside the working directory as <outside>, never absolute", () => {
    expect(relativeRunTarget("C:\\outside\\d.ts", "C:\\worker")).toBe("<outside>");
    expect(relativeRunTarget("/C:/outside/e.ts", "C:\\worker")).toBe("<outside>");
    expect(relativeRunTarget("/home/mateo/private/notes.md", "/home/mateo/run")).toBe("<outside>");
    expect(relativeRunTarget("..\\escape.txt", "C:\\worker")).toBe("<outside>");
    expect(relativeRunTarget("/home/mateo/run/src/x.ts", "/home/mateo/run")).toBe("src/x.ts");
  });

  test("projects the three path forms onto the call and file lists", () => {
    const workdir = "C:\\worker";
    const base = NOW - 30_000;
    const write = (id: string, file: string, offset: number): unknown[] => [
      { type: "tool_queued", toolCallId: id, toolName: "write_file", input: { file_path: file, content: "x" }, timestamp: iso(base + offset) },
      { type: "tool_completed", toolCallId: id, toolName: "write_file", result: [{ type: "text", text: "x" }], timestamp: iso(base + offset + 1_000) },
    ];
    const events = [
      ...write("a", "C:\\worker\\src\\a.ts", 0),
      ...write("b", "/C:/worker/src/b.ts", 2_000),
      ...write("c", "c:/worker/src/c.ts", 4_000),
      ...write("d", "C:\\outside\\d.ts", 6_000),
    ];

    const digest = digestOf(events, { workingDirectory: workdir });

    expect(digest.recent_calls.map((call) => call.target)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts", "<outside>"]);
    expect(digest.files_written).toEqual({ files: ["src/a.ts", "src/b.ts", "src/c.ts"], total: 3 });
  });
});

describe("run digest — reasoning and secrets", () => {
  test("keeps a tool call visible under 30,000 reasoning deltas and reports reasoning as current", () => {
    const base = NOW - 60_000;
    const tool: unknown[] = [
      { type: "tool_queued", toolCallId: "c1", toolName: "read_file", input: { paths: ["src/a.ts"] }, timestamp: iso(base) },
      { type: "tool_completed", toolCallId: "c1", toolName: "read_file", result: [{ type: "text", text: "x" }], timestamp: iso(base + 1_000) },
    ];
    const reasoning: unknown[] = Array.from({ length: 30_000 }, (_, index) => ({
      type: "thinking_delta",
      delta: "x",
      timestamp: iso(base + 2_000 + index),
    }));

    const digest = digestOf([...tool, ...reasoning]);

    expect(digest.recent_calls).toHaveLength(1);
    expect(digest.recent_calls[0]).toMatchObject({ tool: "read_file", target: "src/a.ts", status: "ok" });
    expect(digest.current_activity.kind).toBe("reasoning");
    expect(digest.current_activity.detail).toBe(30_000);
    expect(digest.current_activity.since).toBe(iso(base + 2_000));
  });

  test("never carries a credential or an absolute path in any field", () => {
    const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    const leaked = "/home/mateo/private/notes.md";
    const base = NOW - 10_000;
    const events: unknown[] = [
      { type: "tool_queued", toolCallId: "w", toolName: "write_file", input: { file_path: "C:\\worker\\src\\a.ts", content: "x" }, timestamp: iso(base) },
      { type: "tool_completed", toolCallId: "w", toolName: "write_file", result: [{ type: "text", text: "x" }], timestamp: iso(base + 500) },
      { type: "result", result: `see ${leaked} with token ${secret}`, timestamp: iso(base + 1_000) },
    ];

    const digest = digestOf(events, { workingDirectory: "C:\\worker" });
    const serialized = JSON.stringify(digest);

    expect(digest.last_assistant_text).toBeDefined();
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("/home/mateo");
    expect(serialized).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(digest.recent_calls[0]?.target).toBe("src/a.ts");
  });

  test("bounds the last assistant text", () => {
    const digest = digestOf([
      { type: "result", result: "A".repeat(2_000), timestamp: iso(NOW - 1_000) },
    ]);
    expect(digest.last_assistant_text).toBe("A".repeat(600));
  });
});

describe("run digest — persistence", () => {
  test("the supervisor persists run-digest.json from the live event stream", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-run-digest-live-"));
    const child = [
      "console.log(JSON.stringify({type:'session',id:'digest-run'}));",
      "console.log(JSON.stringify({type:'turn_start',turnNumber:1,timestamp:new Date().toISOString()}));",
      "console.log(JSON.stringify({type:'tool_queued',toolCallId:'c1',toolName:'read_file',input:{paths:['src/a.ts']},timestamp:new Date().toISOString()}));",
      "console.log(JSON.stringify({type:'tool_completed',toolCallId:'c1',toolName:'read_file',result:[{type:'text',text:'x'}],timestamp:new Date().toISOString()}));",
      "console.log(JSON.stringify({type:'turn_end',turnNumber:1,timestamp:new Date().toISOString()}));",
      "console.log(JSON.stringify({type:'result',subtype:'success',stopReason:'end_turn',num_turns:1,timestamp:new Date().toISOString()}));",
    ].join(" ");
    try {
      const output = await runRuntimeProcess({
        command: process.execPath,
        args: ["-e", child],
        cwd: root,
        artifacts: { directory: root, missionId: "one", runId: "digest", runtime: "command-code" },
      });
      expect(output.exitCode).toBe(0);
      const digest = await readRunDigest(root);
      expect(digest).toBeDefined();
      expect(digest?.runtime).toBe("command-code");
      expect(digest?.turns).toBe(1);
      expect(digest?.recent_calls).toHaveLength(1);
      expect(digest?.recent_calls[0]).toMatchObject({ tool: "read_file", target: "src/a.ts", status: "ok" });
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);

  test("round-trips through run-digest.json and ignores a malformed artifact", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-run-digest-"));
    try {
      const digest = digestOf(fixture("command-code-healthy.ndjson"));
      await writeFile(runDigestPath(root), JSON.stringify(digest), "utf-8");
      expect(await readRunDigest(root)).toEqual(digest);

      await writeFile(runDigestPath(root), "{ not json", "utf-8");
      expect(await readRunDigest(root)).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ efficiency */

interface StreamCall {
  tool: string;
  args: Record<string, unknown>;
  text: string;
}

/**
 * A small Command Code stream with exactly known efficiency values: eight model
 * requests (context 1,000..8,000), nine tool calls of 10 ms each, seven turns
 * with one call and one with two, five reads of which one repeats a `(path,
 * range)` already read, and output bytes split across the four tool kinds.
 */
function efficiencyStream(): unknown[] {
  const inputs = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
  const turns: StreamCall[][] = [
    [{ tool: "read_file", args: { file_path: "src/a.ts" }, text: "AAAA" }],
    [{ tool: "read_file", args: { file_path: "src/a.ts:10-20" }, text: "BB" }],
    [{ tool: "edit_file", args: { file_path: "src/a.ts" }, text: "CCC" }],
    [{ tool: "shell_command", args: { command: "bun test" }, text: "DDDDD" }],
    [{ tool: "read_file", args: { file_path: "src/b.ts" }, text: "E" }],
    [{ tool: "read_file", args: { file_path: "src/a.ts" }, text: "FF" }],
    [{ tool: "write_file", args: { file_path: "docs/x.md" }, text: "GGG" }],
    [
      { tool: "todo", args: { op: "x" }, text: "HHHH" },
      { tool: "read_file", args: { file_path: "src/a.ts:1-5" }, text: "I" },
    ],
  ];
  const events: unknown[] = [];
  let clock = NOW - 200_000;
  const at = (delta: number): string => { clock += delta; return iso(clock); };
  turns.forEach((calls, turnIndex) => {
    events.push({ type: "turn_start", turnNumber: turnIndex + 1, timestamp: at(1) });
    events.push({ type: "model_request_start", timestamp: at(1) });
    const requestStart = clock;
    events.push({
      type: "model_request_end",
      usage: { inputTokens: inputs[turnIndex] ?? 0, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      timestamp: iso(requestStart + 100),
    });
    clock = requestStart + 100;
    calls.forEach((call, callIndex) => {
      const id = `t${turnIndex}-c${callIndex}`;
      events.push({ type: "tool_queued", toolCallId: id, toolName: call.tool, input: call.args, timestamp: at(1) });
      events.push({ type: "tool_completed", toolCallId: id, toolName: call.tool, result: [{ type: "text", text: call.text }], timestamp: at(10) });
    });
    events.push({ type: "turn_end", turnNumber: turnIndex + 1, timestamp: at(1) });
  });
  events.push({ type: "result", num_turns: turns.length, timestamp: at(1) });
  return events;
}

describe("run digest — efficiency", () => {
  test("measures every field of the efficiency block", () => {
    const digest = digestOf(efficiencyStream());

    expect(digest.efficiency).toEqual({
      context_tokens_first: 1000,
      context_tokens_after_five: 6000,
      context_tokens_last: 8000,
      single_tool_turn_share: 0.875,
      read_calls: 5,
      re_read_calls: 1,
      tool_output_bytes: { read: 10, write: 6, shell: 5, other: 4 },
      model_time_ms: 800,
      tool_time_ms: 90,
    });
  });

  test("counts a re-read per (path, line range), so a new range is not a re-read", () => {
    const base = NOW - 30_000;
    const read = (id: string, args: Record<string, unknown>, offset: number): unknown[] => [
      { type: "tool_queued", toolCallId: id, toolName: "read_file", input: args, timestamp: iso(base + offset) },
      { type: "tool_completed", toolCallId: id, toolName: "read_file", result: [{ type: "text", text: "x" }], timestamp: iso(base + offset + 1) },
    ];
    const events = [
      ...read("r1", { file_path: "src/a.ts" }, 0),
      ...read("r2", { file_path: "src/a.ts", offset: 10, limit: 20 }, 10),
      ...read("r3", { file_path: "src/a.ts" }, 20),
      ...read("r4", { file_path: "src/a.ts", offset: 10, limit: 20 }, 30),
      ...read("r5", { file_path: "src/a.ts", offset: 1, limit: 5 }, 40),
    ];

    const digest = digestOf(events);

    expect(digest.efficiency.read_calls).toBe(5);
    // r3 repeats the whole-file read and r4 repeats the 10:20 window; r5 is a new range.
    expect(digest.efficiency.re_read_calls).toBe(2);
  });

  test("surfaces a tool with no end event and no output for more than five minutes", () => {
    const started = NOW - 20 * 60_000;
    const events: unknown[] = [
      { type: "tool_queued", toolCallId: "hung", toolName: "shell_command", input: { command: "cat out | pipeline" }, timestamp: iso(started) },
      { type: "tool_queued", toolCallId: "fresh", toolName: "read_file", input: { file_path: "src/a.ts" }, timestamp: iso(NOW - 60_000) },
      { type: "tool_queued", toolCallId: "done", toolName: "read_file", input: { file_path: "src/b.ts" }, timestamp: iso(started) },
      { type: "tool_completed", toolCallId: "done", toolName: "read_file", result: [{ type: "text", text: "x" }], timestamp: iso(started + 1_000) },
    ];

    const digest = digestOf(events);

    expect(digest.loop_signals.long_running_tools).toEqual([{ tool: "shell_command", target: "cat", minutes: 20 }]);
  });

  test("does not flag a stalled call that reported output recently", () => {
    const started = NOW - 10 * 60_000;
    const events: unknown[] = [
      { type: "tool_queued", toolCallId: "x", toolName: "shell_command", input: { command: "run slow" }, timestamp: iso(started) },
      { type: "tool_execution_update", toolCallId: "x", timestamp: iso(NOW - 30_000) },
    ];

    const digest = digestOf(events);

    expect(digest.loop_signals.long_running_tools).toEqual([]);
  });
});

describe("run digest — oh-my-pi parity", () => {
  test("files written from edit and write calls, and usage from the runtime.usage event", () => {
    const digest = digestOf(fixture("oh-my-pi-efficiency.ndjson"), { runtime: "oh-my-pi" });

    expect(digest.runtime).toBe("oh-my-pi");
    // `edit` and `write` name their target in `args.path`; the `:18-28` range is not part of it.
    expect(digest.files_written.files).toEqual(["src/schema/runtime-control.ts", "docs/notes.md"]);
    expect(digest.files_written.total).toBe(2);
    expect(digest.files_written.files.every((file) => !file.includes(":"))).toBe(true);
    expect(digest.usage).toEqual({ input_tokens: 51234, output_tokens: 1234, cache_read_tokens: 40000, cache_write_tokens: 0 });
    // oh-my-pi reports no per-request context, so the context fields stay absent, never zero.
    expect(digest.efficiency.context_tokens_first).toBeUndefined();
    expect(digest.efficiency.context_tokens_last).toBeUndefined();
  });
});

describe("run digest — efficiency medians", () => {
  test("indexes a run's efficiency from run-digest.json and reports its median", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-digest-efficiency-"));
    try {
      const runDir = path.join(root, ".harness", "missions", "mission-eff", "runs", "run-eff");
      await mkdir(runDir, { recursive: true });
      await writeFile(
        path.join(runDir, "runtime-result.yaml"),
        stringify({
          schema_version: "uh.runtime-result.v0",
          mission_id: "mission-eff",
          runtime: "command-code",
          status: "passed",
          started_at: iso(NOW - 100_000),
          finished_at: iso(NOW),
          prompt_path: "prompt.md",
          stdout_path: "stdout.log",
          stderr_path: "stderr.log",
        }),
        "utf-8",
      );
      const digest = projectRunDigest(efficiencyStream(), { runtime: "command-code", now: NOW });
      await writeFile(runDigestPath(runDir), JSON.stringify(digest), "utf-8");

      const records = await indexRuns(root, {});
      expect(records).toHaveLength(1);
      expect(records[0]!.efficiency).toEqual(digest.efficiency);

      const [summary] = summarizeRuns(records, "runtime");
      expect(summary!.efficiency_medians).toEqual({
        context_tokens_first: 1000,
        context_tokens_after_five: 6000,
        context_tokens_last: 8000,
        single_tool_turn_share: 0.875,
        read_calls: 5,
        re_read_calls: 1,
        model_time_ms: 800,
        tool_time_ms: 90,
      });
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  test("medians each measured field and omits the rest", () => {
    const records: RunRecord[] = [
      { mission_id: "m", run_id: "a", runtime: "command-code", efficiency: { context_tokens_first: 1000, single_tool_turn_share: 0.5, read_calls: 4, re_read_calls: 1, model_time_ms: 100, tool_time_ms: 10 } },
      { mission_id: "m", run_id: "b", runtime: "command-code", efficiency: { context_tokens_first: 3000, single_tool_turn_share: 1, read_calls: 8, re_read_calls: 3, model_time_ms: 300, tool_time_ms: 30 } },
      { mission_id: "m", run_id: "c", runtime: "command-code" },
    ];

    const [summary] = summarizeRuns(records, "runtime");

    expect(summary!.efficiency_medians).toEqual({
      context_tokens_first: 2000,
      single_tool_turn_share: 0.75,
      read_calls: 6,
      re_read_calls: 2,
      model_time_ms: 200,
      tool_time_ms: 20,
    });
    expect(summary!.efficiency_medians?.context_tokens_after_five).toBeUndefined();
  });
});

describe("run digest — report rendering", () => {
  test("prints the efficiency block and a long-running tool in uh report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-digest-report-"));
    try {
      await mkdir(path.join(root, ".harness"), { recursive: true });
      await writeFile(path.join(root, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: digest report\n", "utf-8");
      const runId = "20260101T000000Z-eff";
      const runDir = path.join(root, ".harness", "missions", "m", "runs", runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(
        path.join(runDir, "runtime-control.json"),
        JSON.stringify({
          schema_version: "uh.runtime-control.v0",
          mission_id: "m",
          run_id: runId,
          runtime: "command-code",
          controller_pid: 4242,
          started_at: iso(NOW - 100_000),
          heartbeat_at: iso(NOW - 1_000),
          status: "running",
          turns: 8,
          denials: 0,
          inflight_tools: 1,
        }),
        "utf-8",
      );
      const events = [
        ...efficiencyStream(),
        { type: "tool_queued", toolCallId: "hung", toolName: "shell_command", input: { command: "cat out | pipeline" }, timestamp: iso(NOW - 15 * 60_000) },
      ];
      const digest = projectRunDigest(events, { runtime: "command-code", now: NOW });
      await writeFile(runDigestPath(runDir), JSON.stringify(digest), "utf-8");
      await registerLiveRun({ projectRoot: root, artifactRoot: root, runId, missionId: "m", runtime: "command-code", startedAt: iso(NOW - 100_000) });

      const report = await reportRun(root, runId, { now: NOW, processes: [] });
      const text = formatRunReport(report);

      expect(text).toContain("efficiency: context first=1,000 after5=6,000 last=8,000");
      expect(text).toContain("efficiency: single-tool turns=87.5%");
      expect(text).toContain("reads=5 re-reads=1");
      expect(text).toContain("efficiency: tool output bytes read=10 write=6 shell=5 other=4");
      expect(text).toContain("long-running tools: shell_command cat (15m)");
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
});
