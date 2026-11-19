import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  DEFAULT_REPORT_LAST,
  REPORT_SCHEMA_VERSION,
  ReportError,
  formatRunReport,
  redactSecrets,
  reportRun,
  sanitizeReportText,
  type RunReport,
} from "../src/harness/report.js";
import { projectRunDigest, runDigestPath } from "../src/harness/run-digest.js";
import { registerLiveRun, type NativeProcess } from "../src/harness/live-runs.js";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/runtime-events", import.meta.url));

const NOW = Date.parse("2026-01-01T06:00:00.000Z");
const iso = (milliseconds: number): string => new Date(milliseconds).toISOString();

/** Planted in assistant text and tool arguments: none may reach any output. */
const SECRET_ANTHROPIC = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
const SECRET_AWS = "AKIAIOSFODNN7EXAMPLE";
const LEAKED_PATH = "/home/mateo/private/notes.md";

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(path.join(tmpdir(), "uh-report-"));
  await mkdir(path.join(ROOT, ".harness"), { recursive: true });
  await writeFile(
    path.join(ROOT, ".harness", "project.yaml"),
    "schema_version: uh.project.v0\nname: report fixture\n",
    "utf-8",
  );
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ helpers */

function processes(list: Array<Partial<NativeProcess> & { pid: number; ppid: number }>): NativeProcess[] {
  return list.map((entry) => ({
    pid: entry.pid,
    ppid: entry.ppid,
    name: entry.name ?? "node.exe",
    command: entry.command ?? "node",
  }));
}

function controlPayload(missionId: string, runId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "uh.runtime-control.v0",
    mission_id: missionId,
    run_id: runId,
    runtime: "command-code",
    controller_pid: 4242,
    started_at: iso(NOW - 60_000),
    heartbeat_at: iso(NOW - 2_000),
    status: "running",
    turns: 5,
    denials: 0,
    inflight_tools: 0,
    ...overrides,
  };
}

interface SeedOptions {
  runId?: string;
  missionId?: string;
  model?: string;
  role?: string;
  control?: Record<string, unknown>;
  extraLines?: string[];
  /** Replace the fixture contents entirely (used for synthetic logs). */
  events?: string;
}

async function seedRun(fixture: string, options: SeedOptions = {}): Promise<{ runId: string; runDir: string }> {
  const runId = options.runId ?? "20260101T000000Z-aaaaaa";
  const missionId = options.missionId ?? "wave";
  const runDir = path.join(ROOT, ".harness", "missions", missionId, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const body = options.events ?? (await readFile(path.join(FIXTURE_DIR, fixture), "utf-8"));
  const lines = [...body.split(/\r?\n/).filter(Boolean), ...(options.extraLines ?? [])];
  await writeFile(path.join(runDir, "events.ndjson"), lines.join("\n") + "\n", "utf-8");
  const runtime = (options.control?.runtime as string | undefined) ?? "command-code";
  await writeFile(
    path.join(runDir, "runtime-control.json"),
    JSON.stringify(controlPayload(missionId, runId, { runtime, ...(options.control ?? {}) })),
    "utf-8",
  );
  await registerLiveRun({
    projectRoot: ROOT,
    artifactRoot: ROOT,
    runId,
    missionId,
    runtime,
    startedAt: (options.control?.started_at as string | undefined) ?? iso(NOW - 60_000),
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.role !== undefined ? { team: { mission_id: missionId, role: options.role } } : {}),
  });
  return { runId, runDir };
}

const liveProcesses = () => processes([{ pid: 4242, ppid: 1 }]);

async function makeReport(fixture: string, options: SeedOptions = {}, reportOptions: Record<string, unknown> = {}): Promise<RunReport> {
  const { runId } = await seedRun(fixture, options);
  return reportRun(ROOT, runId, { now: NOW, processes: liveProcesses(), ...reportOptions });
}

/* ------------------------------------------------------------------ healthy */

describe("uh report — healthy Command Code window", () => {
  test("summarizes mission, role, route, liveness, turns and activity", async () => {
    const report = await makeReport("command-code-healthy.ndjson", {
      model: "deepseek/deepseek-v4.1-flash",
      role: "backend",
      control: { runtime: "command-code", turns: 11 },
    });

    expect(report.schema_version).toBe(REPORT_SCHEMA_VERSION);
    expect(report.mission_id).toBe("wave");
    expect(report.role).toBe("backend");
    expect(report.runtime).toBe("command-code");
    expect(report.model).toBe("deepseek/deepseek-v4.1-flash");
    expect(report.liveness).toBe("live");
    expect(report.status).toBe("running");
    expect(report.turns).toBe(11);
    expect(report.elapsed_ms).toBe(60_000);

    // The default window is the last 10 completed calls, projected by projectActivity.
    expect(report.activity.window).toBe(DEFAULT_REPORT_LAST);
    expect(report.activity.source).toBe("command-code");
    expect(report.activity.calls).toHaveLength(10);
    expect(report.activity.calls[0]).toMatchObject({ tool: "read_file", kind: "read", target: "src/harness/team-run.ts", ok: true, error_class: "none" });
    expect(report.activity.calls.at(-1)).toMatchObject({ tool: "shell_command", kind: "shell", target: "bunx" });

    // Ages are derived from the completion timestamps and run newest-last.
    const ages = report.activity.calls.map((call) => call.age_ms);
    expect(ages.every((age) => typeof age === "number" && age >= 0)).toBe(true);
    for (let index = 1; index < ages.length; index += 1) {
      expect(ages[index]!).toBeLessThanOrEqual(ages[index - 1]!);
    }
  });

  test("lists files written so far from write events, and the loop signals over the window", async () => {
    const report = await makeReport("command-code-healthy.ndjson", { control: { turns: 11 } });

    expect(report.files_written).toEqual(["tests/team-commit-hygiene.test.ts", "src/harness/team-run.ts"]);
    expect(report.loop_signals).toEqual({ identical_repeats: 2, alternating_pairs: 0, distinct_targets: 5 });
  });

  test("reports unknown tokens and cost when the stream carries neither", async () => {
    const report = await makeReport("command-code-healthy.ndjson");
    expect(report.tokens).toBeNull();
    expect(report.tokens_unknown_reason).toBeTruthy();
    expect(report.cost_usd).toBeNull();
    expect(report.cost_unknown_reason).toBeTruthy();
    expect(report.last_assistant_text).toBeUndefined();
  });

  test("reports tokens when the stream carries usage and keeps cost unknown without a price", async () => {
    const report = await makeReport("command-code-usage.ndjson", {
      model: "Qwen/Qwen3.8-Flash",
      control: { runtime: "command-code", turns: 3 },
    });

    // model_request_end carries the usage; turn_end repeats it and must not double count.
    expect(report.tokens).toEqual({ input: 39076, output: 580, cache_read: 18432, cache_write: 0 });
    expect(report.cost_usd).toBeNull();
    expect(report.cost_unknown_reason).toContain("Qwen/Qwen3.8-Flash");
  });
});

/* ------------------------------------------------------------------ denials */

describe("uh report — denied retries window", () => {
  test("surfaces denials with their guard class and relative target", async () => {
    const report = await makeReport("command-code-denied-retries.ndjson", { control: { turns: 25, denials: 6 } });

    expect(report.denials.count).toBe(6);
    expect(report.denials.events).toHaveLength(6);
    expect(report.denials.events.every((event) => event.guard_class === "denied")).toBe(true);
    // Every target is relative (or a bounded placeholder); no absolute path leaks.
    expect(report.denials.events.map((event) => event.target)).toEqual([
      "<outside>", "<outside>", "cd", "<outside>", "<outside>", "echo",
    ]);
    for (const event of report.denials.events) {
      expect(event.target.startsWith("/")).toBe(false);
      expect(event.target).not.toMatch(/^[A-Za-z]:\\/);
    }

    // The projected window also keeps the denial class visible on the calls.
    const denied = report.activity.calls.filter((call) => call.error_class === "denied");
    expect(denied.length).toBeGreaterThanOrEqual(1);
    expect(denied.every((call) => call.ok === false)).toBe(true);
  });

  test("recovers a specific tool-guard class when the stream discloses the block reason", async () => {
    const gitReason = "CONTRACT: no git mutations; the harness commits for you. Use read-only git (status, diff, log) or skip it.";
    const report = await makeReport("command-code-denied-retries.ndjson", {
      control: { turns: 25, denials: 7 },
      extraLines: [
        JSON.stringify({ type: "tool_queued", toolCallId: "call-git", toolName: "shell_command", input: { command: "git commit -m x" }, timestamp: iso(NOW - 5_000) }),
        JSON.stringify({ type: "tool_hooks", toolCallId: "call-git", toolName: "shell_command", phase: "pre", outcome: { kind: "block", text: gitReason }, timestamp: iso(NOW - 4_000) }),
        JSON.stringify({ type: "tool_hook_blocked", toolCallId: "call-git", toolName: "shell_command", hookOutput: gitReason, timestamp: iso(NOW - 3_000) }),
      ],
    });

    const gitDenial = report.denials.events.find((event) => event.tool === "shell_command" && event.guard_class === "git_mutation");
    expect(gitDenial).toBeDefined();
    expect(gitDenial?.target).toBe("git");
  });
});

/* ------------------------------------------------------------------ oh-my-pi */

describe("uh report — oh-my-pi window", () => {
  test("projects an oh-my-pi run with relative targets", async () => {
    const report = await makeReport("oh-my-pi-healthy.ndjson", { model: "gpt-5.6-luna", control: { runtime: "oh-my-pi", turns: 20 } }, { last: 30 });

    expect(report.runtime).toBe("oh-my-pi");
    expect(report.activity.source).toBe("oh-my-pi");
    expect(report.activity.calls.length).toBeGreaterThan(0);
    for (const call of report.activity.calls) {
      expect(call.target.startsWith("/")).toBe(false);
      expect(call.target).not.toMatch(/^[A-Za-z]:\\/);
    }
    expect(report.activity.calls.some((call) => call.tool === "read" && call.target === "src/harness/acceptance.ts")).toBe(true);
    expect(report.activity.calls.some((call) => call.tool === "bash" && call.target === "bunx")).toBe(true);
  });
});

/* ----------------------------------------------------- whole-file reading */

describe("uh report — whole-file reading without a digest", () => {
  const fillerLine = JSON.stringify({ type: "message_delta", text: "x".repeat(80), timestamp: iso(NOW - 10_000) });
  function largeLog(): string {
    const head = [
      JSON.stringify({ type: "tool_queued", toolCallId: "head", toolName: "write_file", input: { file_path: "head/early.txt", content: "x" }, timestamp: iso(NOW - 900_000) }),
      JSON.stringify({ type: "tool_completed", toolCallId: "head", toolName: "write_file", deferred: false, result: [{ type: "text", text: "x" }], timestamp: iso(NOW - 899_000) }),
    ];
    const filler = Array.from({ length: 5_000 }, () => fillerLine);
    const tail = [
      JSON.stringify({ type: "tool_queued", toolCallId: "tail", toolName: "write_file", input: { file_path: "tail/late.txt", content: "x" }, timestamp: iso(NOW - 5_000) }),
      JSON.stringify({ type: "tool_completed", toolCallId: "tail", toolName: "write_file", deferred: false, result: [{ type: "text", text: "x" }], timestamp: iso(NOW - 4_000) }),
    ];
    return [...head, ...filler, ...tail].join("\n") + "\n";
  }

  test("recovers calls older than any byte window", async () => {
    const { runId } = await seedRun("", { events: largeLog(), control: { turns: 1 } });

    const report = await reportRun(ROOT, runId, { now: NOW, processes: liveProcesses() });
    expect(report.files_written).toEqual(["head/early.txt", "tail/late.txt"]);
  });
});

/* ------------------------------------------------------------------ digest */

describe("uh report — live run digest", () => {
  async function writeDigest(runDir: string, events: readonly unknown[], runtime = "command-code"): Promise<RunReport> {
    const digest = projectRunDigest(events, { runtime, workingDirectory: ROOT, now: NOW });
    await writeFile(runDigestPath(runDir), JSON.stringify(digest), "utf-8");
    return reportRun(ROOT, "20260101T000000Z-aaaaaa", { now: NOW, processes: liveProcesses() });
  }

  function readEvents(runDir: string): unknown[] {
    return readFileSync(path.join(runDir, "events.ndjson"), "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }

  test("renders every projection from run-digest.json instead of the event stream", async () => {
    const { runDir } = await seedRun("command-code-healthy.ndjson", { model: "m", control: { turns: 10 } });
    const digest = projectRunDigest(readEvents(runDir), { runtime: "command-code", workingDirectory: ROOT, now: NOW });
    await writeFile(runDigestPath(runDir), JSON.stringify(digest), "utf-8");

    const report = await reportRun(ROOT, "20260101T000000Z-aaaaaa", { now: NOW, processes: liveProcesses() });

    expect(report.current_activity).toEqual(digest.current_activity);
    expect(report.turns).toBe(digest.turns);
    expect(report.loop_signals).toEqual(digest.loop_signals);
    expect(report.files_written).toEqual(digest.files_written.files);
    expect(report.activity.calls.map((call) => call.tool)).toEqual(digest.recent_calls.map((call) => call.tool));
    expect(report.activity.source).toBe("command-code");
    // Legacy-only runs never carry this field; a digest run always does.
    expect("current_activity" in report).toBe(true);
    // No absolute path reaches any report field.
    expect(JSON.stringify(report)).not.toMatch(/[A-Za-z]:[\\/]/);
  });

  test("reports 'reasoning since' and keeps the completed tool call under 30,000 deltas", async () => {
    const { runDir } = await seedRun("", { events: "", control: { turns: 1 } });
    const base = NOW - 60_000;
    const events: unknown[] = [
      { type: "tool_queued", toolCallId: "c1", toolName: "read_file", input: { paths: ["src/a.ts"] }, timestamp: iso(base) },
      { type: "tool_completed", toolCallId: "c1", toolName: "read_file", result: [{ type: "text", text: "x" }], timestamp: iso(base + 1_000) },
      ...Array.from({ length: 30_000 }, (_, index) => ({ type: "thinking_delta", delta: "x", timestamp: iso(base + 2_000 + index) })),
    ];
    const report = await writeDigest(runDir, events);

    const text = formatRunReport(report);
    expect(text).toContain("reasoning since");
    expect(text).toContain("30,000 chars");
    expect(text).toContain("read_file");
    expect(report.activity.calls.some((call) => call.tool === "read_file" && call.target === "src/a.ts")).toBe(true);
  });

  test("a legacy run without a digest omits the digest-only fields", async () => {
    const report = await makeReport("command-code-healthy.ndjson");
    expect("current_activity" in report).toBe(false);
    expect(report.current_activity).toBeUndefined();
    expect(report.denials.native_refusals).toBeUndefined();
  });
});

/* ------------------------------------------------------------- secret scrub */

describe("uh report — secret scrub", () => {
  test("strips secrets and absolute paths from the last assistant text and every field", async () => {
    const assistantText = `Done. Deployed with token ${SECRET_ANTHROPIC} and key ${SECRET_AWS}; see ${LEAKED_PATH} for details.`;
    const report = await makeReport("command-code-healthy.ndjson", {
      extraLines: [
        JSON.stringify({ type: "result", is_error: false, result: assistantText, timestamp: iso(NOW - 3_000) }),
        JSON.stringify({ type: "tool_queued", toolCallId: "leak", toolName: "write_file", input: { file_path: LEAKED_PATH, content: `secret ${SECRET_ANTHROPIC}` }, timestamp: iso(NOW - 2_000) }),
        JSON.stringify({ type: "tool_completed", toolCallId: "leak", toolName: "write_file", deferred: false, result: [{ type: "text", text: "x" }], timestamp: iso(NOW - 1_000) }),
      ],
    });

    expect(report.last_assistant_text).toBeDefined();
    expect(report.last_assistant_text).toContain("[redacted]");
    expect(report.last_assistant_text).not.toContain(SECRET_ANTHROPIC);
    expect(report.last_assistant_text).not.toContain(SECRET_AWS);
    expect(report.last_assistant_text).not.toContain(LEAKED_PATH);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(SECRET_ANTHROPIC);
    expect(serialized).not.toContain(SECRET_AWS);
    expect(serialized).not.toContain("/home/mateo");
    expect(report.files_written).not.toContain(LEAKED_PATH);
  });

  test("bounds the last assistant text to 600 characters", async () => {
    const longText = "A".repeat(2_000);
    const report = await makeReport("command-code-healthy.ndjson", {
      extraLines: [JSON.stringify({ type: "result", is_error: false, result: longText, timestamp: iso(NOW - 1_000) })],
    });
    expect(report.last_assistant_text).toBe("A".repeat(600));
  });

  test("redactSecrets removes recognized credentials and sanitizeReportText removes absolute paths", () => {
    expect(redactSecrets(`key=${SECRET_ANTHROPIC}`)).not.toContain(SECRET_ANTHROPIC);
    expect(redactSecrets(`credential ${SECRET_AWS}`)).toContain("[redacted]");
    expect(redactSecrets("Bearer abcdefghijklmnop")).toContain("[redacted]");
    const sanitized = sanitizeReportText(`read ${LEAKED_PATH} and C:\\Users\\mateo\\secret.txt`);
    expect(sanitized).not.toContain(LEAKED_PATH);
    expect(sanitized).not.toContain("C:\\Users\\mateo");
  });
});

/* --------------------------------------------------------------- JSON shape */

describe("uh report — JSON shape", () => {
  test("emits a stable, documented document", async () => {
    const report = await makeReport("command-code-healthy.ndjson", {
      model: "m",
      role: "qa",
      control: { turns: 4, denials: 2 },
      extraLines: [JSON.stringify({ type: "result", is_error: false, result: "All checks passed.", timestamp: iso(NOW - 1_000) })],
    });

    expect(Object.keys(report).sort()).toEqual([
      "activity",
      "cost_unknown_reason",
      "cost_usd",
      "denials",
      "elapsed_ms",
      "files_written",
      "generated_at",
      "last_assistant_text",
      "liveness",
      "loop_signals",
      "mission_id",
      "model",
      "role",
      "run_id",
      "runtime",
      "schema_version",
      "started_at",
      "status",
      "tokens",
      "tokens_unknown_reason",
      "turns",
    ]);
    expect(report.denials).toEqual({ count: 2, events: [] });
    expect(report.activity.calls[0]).toHaveProperty("age_ms");
    expect(typeof report.generated_at).toBe("string");
    expect(JSON.stringify(report)).not.toContain(ROOT);
  });
});

/* -------------------------------------------------------- target resolution */

describe("uh report — target resolution", () => {
  test("resolves a run by a unique prefix and rejects unknown or ambiguous ids", async () => {
    const { runId } = await seedRun("command-code-healthy.ndjson", { runId: "20260101T000000Z-abc123" });

    const resolved = await reportRun(ROOT, "20260101T000000Z-abc", { now: NOW, processes: liveProcesses() });
    expect(resolved.run_id).toBe(runId);

    await expect(reportRun(ROOT, "does-not-exist", { now: NOW, processes: [] })).rejects.toBeInstanceOf(ReportError);
    await expect(reportRun(ROOT, "nope", { now: NOW, processes: [] })).rejects.toMatchObject({ code: "unknown_target" });
  });
});

/* ------------------------------------------------------------- CLI contract */

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync("bun", ["x", "tsx", CLI, ...args], {
    encoding: "utf-8",
    timeout: 60_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  }) as { status: number | null; stdout: string; stderr: string };
}

describe("uh report CLI", () => {
  test("prints a human report and a JSON report, and exits 1 for an unknown run", async () => {
    const { runId } = await seedRun("command-code-healthy.ndjson", { model: "deepseek/deepseek-v4.1-flash", control: { turns: 11 } });

    const human = runCli(["report", runId, "--root", ROOT]);
    expect(human.status).toBe(0);
    expect(human.stdout).toContain(runId);

    const json = runCli(["report", runId, "--root", ROOT, "--json"]);
    expect(json.status).toBe(0);
    const parsed = JSON.parse(json.stdout) as RunReport;
    expect(parsed.run_id).toBe(runId);
    expect(parsed.schema_version).toBe(REPORT_SCHEMA_VERSION);

    const missing = runCli(["report", "no-such-run", "--root", ROOT]);
    expect(missing.status).toBe(1);
  }, 60_000);
});
