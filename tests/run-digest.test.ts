import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  projectRunDigest,
  readRunDigest,
  relativeRunTarget,
  runDigestPath,
} from "../src/harness/run-digest.js";
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
    expect(digest.loop_signals).toEqual({ identical_repeats: 2, alternating_pairs: 0, distinct_targets: 5 });
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
