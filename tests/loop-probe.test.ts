import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { DEFAULT_TYPESAFE_MODEL } from "../src/harness/typesafe.js";
import {
  LOOP_PROBE_QUESTIONS,
  LOOP_PROBE_QUESTIONS as QUESTIONS,
  DEFAULT_ACTIVITY_WINDOW,
  MIN_PROBE_CALLS,
  deterministicLoopSignals,
  evaluateLoopProbe,
  loopProbeQuestions,
  projectActivity,
  serializeLoopProbeState,
  type ActivityWindow,
  type ProjectedToolCall,
} from "../src/harness/loop-probe.js";

/** A fake key for the disabled-path tests; never a real credential. */
const FAKE_KEY = "test-key-not-a-secret";
const VERSIONED_MODEL = "jev-2026-09-01";
const WORKING_DIRECTORY = "/repo/work";
/** Planted in arguments, tool output and message text: none may reach the request. */
const MARKER = "SENTINEL-MUST-NOT-APPEAR-4f9a1c";
const noDelay = async () => {};

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/runtime-events", import.meta.url));

/** Parse a native event excerpt: one JSON event per line. */
function fixture(name: string): unknown[] {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as unknown);
}

const commandCodeHealthy = () => fixture("command-code-healthy.ndjson");
const commandCodeDenied = () => fixture("command-code-denied-retries.ndjson");
const ohMyPiHealthy = () => fixture("oh-my-pi-healthy.ndjson");

type CapturedBody = {
  model: string;
  state: { activity: ActivityWindow };
  questions: Record<string, { type: string; instructions?: string; criteria?: { true?: string; false?: string } }>;
};

function bodyOf(init?: RequestInit): CapturedBody {
  return JSON.parse(String(init?.body)) as CapturedBody;
}

/** Answers every asked Noul with `noul`, mirroring the provider envelope. */
function envelopeFor(body: CapturedBody, noul: number | ((name: string) => number)): string {
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(body.questions)) {
    answers[name] = { type: question.type, noul: typeof noul === "number" ? noul : noul(name) };
  }
  return JSON.stringify({ model: VERSIONED_MODEL, answers, usage: { input_tokens: 9, output_tokens: 4 } });
}

function provider(noul: number | ((name: string) => number) = 0.8): Mock<typeof fetch> {
  return vi.fn<typeof fetch>(async (_input, init) => new Response(envelopeFor(bodyOf(init), noul), { status: 200 }));
}

/** Command Code: `tool_queued` carries `input`, the call is keyed by `toolCallId`. */
function queued(toolCallId: string, toolName: string, input: Record<string, unknown>) {
  return { type: "tool_queued", toolCallId, toolName, input };
}

function running(toolCallId: string, toolName: string) {
  return { type: "tool_running", toolCallId, toolName };
}

function completed(toolCallId: string, toolName: string, extra: Record<string, unknown> = {}) {
  return { type: "tool_completed", toolCallId, toolName, deferred: false, result: [{ type: "text", text: "x" }], ...extra };
}

function hookBlocked(toolCallId: string, toolName: string) {
  return { type: "tool_hook_blocked", toolCallId, toolName };
}

/** oh-my-pi: `tool_execution_start` carries `args`, `tool_execution_end` carries `isError`. */
function ompStart(toolCallId: string, toolName: string, args: Record<string, unknown>) {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function ompEnd(toolCallId: string, toolName: string, extra: Record<string, unknown> = {}) {
  return { type: "tool_execution_end", toolCallId, toolName, result: { isError: false }, ...extra };
}

function events(...values: unknown[]): unknown[] {
  return values;
}

beforeEach(() => {
  // Keep the ambient environment from selecting a model or enabling a real call.
  vi.stubEnv("UH_TYPESAFE_MODEL", "");
  vi.stubEnv("TYPESAFE_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Four shell calls on the same target that keep failing: the smallest probeable window. */
function loopingEvents(): unknown[] {
  const calls = [
    ["s1", "bun test"],
    ["s2", "bun  test"],
    ["s3", "bun test"],
    ["s4", "bun test"],
  ] as const;
  return calls.flatMap(([id, command]) => [
    ompStart(id, "bash", { command }),
    ompEnd(id, "bash", { isError: true, result: { exitCode: 1, content: [{ text: `failure ${MARKER}` }] } }),
  ]);
}

describe("projectActivity", () => {
  test("projects a real Command Code healthy run from `input.paths`, `pattern` and the shell executable", () => {
    const window = projectActivity(commandCodeHealthy(), { workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("command-code");
    expect(window.calls).toEqual([
      { tool: "read_file", kind: "read", target: "src/harness/team-run.ts", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "tests/team-run.test.ts", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "tests/worktree-lock.test.ts", ok: true, error_class: "none" },
      { tool: "grep", kind: "read", target: "<pattern>", ok: true, error_class: "none" },
      { tool: "write_file", kind: "write", target: "tests/team-commit-hygiene.test.ts", ok: true, error_class: "none" },
      { tool: "shell_command", kind: "shell", target: "bunx", ok: true, error_class: "none" },
      { tool: "edit_file", kind: "write", target: "src/harness/team-run.ts", ok: true, error_class: "none" },
      { tool: "edit_file", kind: "write", target: "src/harness/team-run.ts", ok: true, error_class: "none" },
      { tool: "edit_file", kind: "write", target: "src/harness/team-run.ts", ok: true, error_class: "none" },
      { tool: "shell_command", kind: "shell", target: "bunx", ok: true, error_class: "none" },
    ]);
    // The signal the provider receives: every target resolved, a healthy spread, no loop.
    expect(window.calls.every(call => call.target !== "unknown")).toBe(true);
    expect(deterministicLoopSignals(window)).toEqual({
      identical_repeats: 2,
      alternating_pairs: 0,
      distinct_targets: 5,
    });
  });

  test("projects a real Command Code denied run: hook blocks complete as denials and the repeated write target is visible", () => {
    const window = projectActivity(commandCodeDenied(), { workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("command-code");
    // The window keeps the last 12 completed calls (call-25 is queued but never completes).
    expect(window.calls).toEqual([
      { tool: "write_file", kind: "write", target: "<outside>", ok: false, error_class: "denied" },
      { tool: "write_file", kind: "write", target: "<outside>", ok: false, error_class: "denied" },
      { tool: "shell_command", kind: "shell", target: "echo", ok: false, error_class: "denied" },
      { tool: "glob", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: ".commandcode/settings.json", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "shell_command", kind: "shell", target: "echo", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "grep", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "grep", kind: "read", target: "<outside>", ok: true, error_class: "none" },
      { tool: "read_file", kind: "read", target: "<outside>", ok: true, error_class: "none" },
    ]);
    expect(window.calls.filter(call => call.error_class === "denied")).toHaveLength(3);
    expect(window.calls.filter(call => call.kind === "write")).toEqual([
      { tool: "write_file", kind: "write", target: "<outside>", ok: false, error_class: "denied" },
      { tool: "write_file", kind: "write", target: "<outside>", ok: false, error_class: "denied" },
    ]);
  });

  test("resolves oh-my-pi targets from `args`", () => {
    const window = projectActivity(ohMyPiHealthy(), { window: 30, workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("oh-my-pi");
    // Calls are projected in completion order, and every read resolves from `args.path`.
    const reads = window.calls.filter(call => call.tool === "read").map(call => call.target);
    expect(reads).toEqual([
      "src/harness/acceptance.ts",
      "docs/acceptance/README.md",
      "tests/acceptance.test.ts",
      "src/schema/acceptance.ts",
      "src/harness/acceptance.ts:106-145",
      "src/harness/acceptance.ts:470-482",
      "tests/acceptance.test.ts:50-100",
      ".claude/skills/gitnexus/impact-analysis/SKILL.md",
    ]);
    expect(reads.every(target => target !== "unknown")).toBe(true);
    expect(window.calls.filter(call => call.tool === "grep").map(call => call.target)).toEqual([
      "src;tests",
      "src/cli.ts;src/harness",
    ]);
    expect(window.calls.filter(call => call.tool === "bash").map(call => call.target)).toEqual([
      "gitnexus_impact",
      "bunx",
    ]);
    // A search without a path keeps only its position, never its query.
    expect(window.calls.filter(call => call.tool === "grep").map(call => call.kind)).toEqual(["read", "read"]);
  });

  test("joins arguments captured at the start event to the completion by toolCallId", () => {
    const window = projectActivity(events(
      queued("cc1", "read_file", { file_path: "src/a.ts" }),
      running("cc1", "read_file"),
      completed("cc1", "read_file"),
      // A completion without a registered start names nothing and is dropped.
      completed("orphan", "read_file"),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls).toEqual([
      { tool: "read_file", kind: "read", target: "src/a.ts", ok: true, error_class: "none" },
    ]);
  });

  test("unwraps the Command Code `event` envelope", () => {
    const window = projectActivity(events(
      { type: "event", event: { type: "tool_queued", toolCallId: "e1", toolName: "shell_command", input: { command: "bun test" } } },
      { type: "event", event: { type: "tool_completed", toolCallId: "e1", toolName: "shell_command", result: [{ type: "text", text: "x" }] } },
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("command-code");
    expect(window.calls).toEqual([
      { tool: "shell_command", kind: "shell", target: "bun", ok: true, error_class: "none" },
    ]);
  });

  test("normalizes paths to forward slashes relative to the working directory, with <outside> beyond it", () => {
    const window = projectActivity(events(
      queued("a", "read_file", { paths: [`${WORKING_DIRECTORY}/src//nested/../harness/a.ts`] }),
      completed("a", "read_file"),
      queued("b", "read_file", { file_path: "./relative/b.ts" }),
      completed("b", "read_file"),
      queued("c", "read_file", { file_path: "../escaped/c.ts" }),
      completed("c", "read_file"),
      queued("d", "read_file", { file_path: "/etc/other/d.ts" }),
      completed("d", "read_file"),
      queued("e", "read_file", { file_path: `${WORKING_DIRECTORY}/../sibling/e.ts` }),
      completed("e", "read_file"),
      queued("f", "read_file", { path: WORKING_DIRECTORY }),
      completed("f", "read_file"),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls.map(call => call.target)).toEqual([
      "src/harness/a.ts",
      "relative/b.ts",
      "<outside>",
      "<outside>",
      "<outside>",
      ".",
    ]);
  });

  test("reduces a shell target to the extension-stripped executable token", () => {
    const window = projectActivity(events(
      queued("a", "shell_command", { command: "   BUN.EXE   test --run" }),
      completed("a", "shell_command"),
      queued("b", "shell_command", { command: "/usr/local/bin/my-tool.exe run" }),
      completed("b", "shell_command"),
      queued("c", "shell_command", { command: "./scripts/ci.CMD build" }),
      completed("c", "shell_command"),
      queued("d", "shell_command", { command: "" }),
      completed("d", "shell_command"),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls.map(call => call.target)).toEqual(["bun", "my-tool", "ci", "unknown"]);
  });

  test("classifies error classes and never classifies an absent result as a denial", () => {
    const window = projectActivity(events(
      queued("d1", "write_file", { file_path: "src/a.ts" }),
      hookBlocked("d1", "write_file"),
      queued("d2", "write_file", { file_path: "src/b.ts" }),
      completed("d2", "write_file", { isError: true, result: { text: "CONTRACT: guarded print-mode refusal" } }),
      ompStart("t1", "bash", { command: "bun test" }),
      ompEnd("t1", "bash", { isError: true, result: { content: [{ text: "assertion failed" }] } }),
      ompStart("z1", "bash", { command: "bun test" }),
      ompEnd("z1", "bash", { result: { exitCode: 1 } }),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls.map(call => [call.target, call.ok, call.error_class])).toEqual([
      ["src/a.ts", false, "denied"],
      ["src/b.ts", false, "denied"],
      ["bun", false, "tool_error"],
      ["bun", false, "nonzero_exit"],
    ]);
    expect(window.calls.every(call => call.tool === "write_file" || call.tool === "bash")).toBe(true);
  });

  test("keeps the last `window` completed calls and ignores starts without ends", () => {
    const mixed = [
      ...events(ompStart("drop", "bash", { command: "bun lint" })),
      ...loopingEvents(),
    ];
    const full = projectActivity(mixed, { workingDirectory: WORKING_DIRECTORY });
    expect(full.calls).toHaveLength(MIN_PROBE_CALLS);
    expect(full.calls.map(call => call.target)).toEqual(["bun", "bun", "bun", "bun"]);

    const trimmed = projectActivity(mixed, { workingDirectory: WORKING_DIRECTORY, window: 2 });
    expect(trimmed.window).toBe(2);
    expect(trimmed.calls).toHaveLength(2);
    expect(trimmed.source).toBe("oh-my-pi");

    const invalid = projectActivity(mixed, { workingDirectory: WORKING_DIRECTORY, window: 0 });
    expect(invalid.window).toBe(DEFAULT_ACTIVITY_WINDOW);
  });

  test("names an unclassified tool by `unknown` rather than by its command line", () => {
    const window = projectActivity(events(
      queued("a", "task", { command: `delegate ${MARKER}`, prompt: `instructions ${MARKER}` }),
      completed("a", "task"),
      queued("b", "web_fetch", { url: "https://example.invalid/docs" }),
      completed("b", "web_fetch"),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls).toEqual([
      { tool: "task", kind: "other", target: "unknown", ok: true, error_class: "none" },
      { tool: "web_fetch", kind: "other", target: "unknown", ok: true, error_class: "none" },
    ]);
  });

  test("drops events from another runtime and carries no fields beyond the whitelist", () => {
    const window = projectActivity(events(
      queued("a", "read_file", { file_path: "src/a.ts" }),
      ompEnd("other", "read_file", {}),
      completed("a", "read_file"),
    ), { workingDirectory: WORKING_DIRECTORY });
    expect(window.calls).toHaveLength(1);
    for (const call of window.calls) {
      expect(Object.keys(call).sort()).toEqual(["error_class", "kind", "ok", "target", "tool"]);
    }
  });
});

describe("deterministicLoopSignals", () => {
  const call = (overrides: Partial<ProjectedToolCall>): ProjectedToolCall => ({
    tool: "bash",
    kind: "shell",
    target: "bun",
    ok: true,
    error_class: "none",
    ...overrides,
  });

  function windowOf(calls: ProjectedToolCall[]): ActivityWindow {
    return { source: "oh-my-pi", window: DEFAULT_ACTIVITY_WINDOW, generated_at: "2026-09-21T00:00:00.000Z", calls };
  }

  test("counts the longest consecutive repeat run and A B A B alternation on a crafted loop", () => {
    const loop = windowOf([
      call({ tool: "edit_file", target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ tool: "edit_file", target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ tool: "edit_file", target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
      call({ tool: "edit_file", target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
    ]);

    expect(deterministicLoopSignals(loop)).toEqual({
      // Three identical calls are one run: two repeats after the first.
      identical_repeats: 2,
      // Indices 4 and 5 step back to the state two calls earlier without repeating their neighbour.
      alternating_pairs: 2,
      distinct_targets: 2,
    });
  });

  test("reports no repeats or alternation on a healthy trajectory", () => {
    const healthy = windowOf([
      call({ tool: "read_file", target: "docs/README.md", kind: "read" }),
      call({ tool: "read_file", target: "src/a.ts", kind: "read" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
      call({ tool: "edit_file", target: "src/a.ts", kind: "write", ok: false, error_class: "denied" }),
      call({ target: "bun", ok: true }),
      call({ tool: "write_file", target: "src/b.ts", kind: "write" }),
    ]);

    expect(deterministicLoopSignals(healthy)).toEqual({
      identical_repeats: 0,
      alternating_pairs: 0,
      distinct_targets: 4,
    });
  });

  test("ignores the pattern and outside placeholders when counting distinct targets", () => {
    const window = windowOf([
      call({ tool: "grep", target: "<pattern>", kind: "read" }),
      call({ tool: "read_file", target: "<outside>", kind: "read" }),
      call({ tool: "read_file", target: "src/a.ts", kind: "read" }),
    ]);
    expect(deterministicLoopSignals(window)).toEqual({
      identical_repeats: 0,
      alternating_pairs: 0,
      distinct_targets: 1,
    });
  });

  test("counts nothing on an empty window", () => {
    expect(deterministicLoopSignals(windowOf([]))).toEqual({
      identical_repeats: 0,
      alternating_pairs: 0,
      distinct_targets: 0,
    });
  });
});

describe("loopProbeQuestions", () => {
  test("returns the fixed atomic Noul set with true and false criteria", () => {
    const questions = loopProbeQuestions();

    expect(Object.keys(questions)).toEqual(["retrying", "progressing", "alternating"]);
    expect(LOOP_PROBE_QUESTIONS).toEqual({ retrying: "retrying", progressing: "progressing", alternating: "alternating" });
    expect(questions).toEqual({
      retrying: {
        type: "noul",
        instructions: expect.stringContaining("same failing action"),
        criteria: { true: expect.any(String), false: expect.any(String) },
      },
      progressing: expect.objectContaining({ type: "noul" }),
      alternating: expect.objectContaining({ type: "noul" }),
    });
    for (const [name, question] of Object.entries(questions)) {
      const satisfied = String(question.criteria?.true ?? "");
      const unsatisfied = String(question.criteria?.false ?? "");
      expect(question.type).toBe("noul");
      expect(satisfied.trim().length).toBeGreaterThan(0);
      expect(unsatisfied.trim().length).toBeGreaterThan(0);
      expect(satisfied).not.toBe(unsatisfied);
      expect(question.instructions).toContain(name === "retrying" ? "repeatedly" : "activity.calls");
    }
  });
});

describe("evaluateLoopProbe", () => {
  test("asks the fixed question set about the projected window and returns typed answers with signals", async () => {
    const fetchMock = provider(0.9);
    const signals = deterministicLoopSignals(projectActivity(loopingEvents(), { workingDirectory: WORKING_DIRECTORY }));

    const result = await evaluateLoopProbe(
      projectActivity(loopingEvents(), { workingDirectory: WORKING_DIRECTORY }),
      { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay },
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.model).toBe(VERSIONED_MODEL);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.answers).toEqual({
      retrying: { noul: 0.9 },
      progressing: { noul: 0.9 },
      alternating: { noul: 0.9 },
    });
    expect(result.usage).toEqual({ input_tokens: 9, output_tokens: 4 });
    expect(result.signals).toEqual(signals);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = bodyOf(fetchMock.mock.calls[0]?.[1]);
    expect(Object.keys(body.questions)).toEqual(["retrying", "progressing", "alternating"]);
    expect(body.state.activity.calls).toHaveLength(MIN_PROBE_CALLS);
    expect(body.state.activity.calls[0]).toEqual({
      tool: "bash", kind: "shell", target: "bun", ok: false, error_class: "nonzero_exit",
    });
    expect(body.model).toBe(DEFAULT_TYPESAFE_MODEL);
  });

  test("never places an absolute path, a command line or argument text in the serialized request", async () => {
    const fetchMock = provider();
    const window = projectActivity(events(
      ...commandCodeDenied(),
      queued("m1", "read_file", { file_path: "/repo/work/src/a.ts", extra: `argument ${MARKER}` }),
      completed("m1", "read_file", { result: [{ type: "text", text: `file contents ${MARKER}` }] }),
      queued("m2", "shell_command", { command: `bun test ${MARKER} --filter "progressing"` }),
      completed("m2", "shell_command", { isError: true, result: [{ type: "text", text: `stderr ${MARKER}` }] }),
      queued("m3", "write_file", { file_path: "/repo/work/src/c.ts", content: `payload ${MARKER}` }),
      completed("m3", "write_file", { isError: true }),
      queued("m4", "read_file", { file_path: "src/harness/a.ts", offset: 1, limit: 5 }),
      running("m4", "read_file"),
      completed("m4", "read_file"),
    ), { workingDirectory: WORKING_DIRECTORY });

    const result = await evaluateLoopProbe(window, { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay });

    const body = bodyOf(fetchMock.mock.calls[0]?.[1]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(MARKER);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain("/outside/path");
    expect(serialized).not.toContain("/repo/");
    expect(serialized).not.toContain("echo x");
    expect(serialized).not.toContain("cd x");
    expect(serialized).not.toContain("--filter");
    // The executable name is allowed; the command line and its arguments are not.
    expect(body.state.activity.calls.some(call => call.target === "bun" || call.target === "echo")).toBe(true);
    expect(body.state.activity.calls.every(call => !call.target.startsWith("/"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(MARKER);
    expect(serializeLoopProbeState(window)).toEqual(body.state);
  });

  test("sends no request when the window holds fewer than four completed calls", async () => {
    const fetchMock = provider();
    const short = projectActivity(events(
      queued("a", "read_file", { file_path: "src/a.ts" }),
      completed("a", "read_file"),
      queued("b", "read_file", { file_path: "src/b.ts" }),
      completed("b", "read_file"),
      queued("c", "read_file", { file_path: "src/c.ts" }),
      completed("c", "read_file"),
    ), { workingDirectory: WORKING_DIRECTORY });

    const result = await evaluateLoopProbe(short, { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "skipped",
      reason: "insufficient_activity",
      calls: 3,
      signals: deterministicLoopSignals(short),
    });
  });

  test("skips without a request at exactly the threshold minus one and probes at the threshold", async () => {
    const fetchMock = provider();
    const atThreshold = projectActivity(loopingEvents(), { workingDirectory: WORKING_DIRECTORY });
    expect(atThreshold.calls).toHaveLength(MIN_PROBE_CALLS);
    await evaluateLoopProbe(atThreshold, { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const oneShort = projectActivity(
      events(queued("a", "read_file", { file_path: "src/a.ts" }), completed("a", "read_file")),
      { workingDirectory: WORKING_DIRECTORY },
    );
    const skipped = await evaluateLoopProbe(oneShort, { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(skipped.kind).toBe("skipped");
  });

  test("passes disabled, unavailable and malformed provider results through unchanged alongside signals", async () => {
    const window = projectActivity(loopingEvents(), { workingDirectory: WORKING_DIRECTORY });
    const signals = deterministicLoopSignals(window);

    const disabled = await evaluateLoopProbe(window, {
      apiKey: "", fetch: provider(), delay: noDelay, configured: false,
    });
    expect(disabled).toEqual({ kind: "disabled", signals });

    const unavailable = await evaluateLoopProbe(window, {
      apiKey: FAKE_KEY,
      fetch: vi.fn<typeof fetch>(async () => { throw new Error("transport down"); }),
      delay: noDelay,
    });
    expect(unavailable).toEqual({ kind: "unavailable", reason: "transport", signals });

    const httpUnavailable = await evaluateLoopProbe(window, {
      apiKey: FAKE_KEY,
      fetch: vi.fn<typeof fetch>(async () => new Response("rate limited", { status: 500 })),
      delay: noDelay,
    });
    expect(httpUnavailable).toEqual({ kind: "unavailable", reason: "http", status: 500, signals });

    const badJson = await evaluateLoopProbe(window, {
      apiKey: FAKE_KEY,
      fetch: vi.fn<typeof fetch>(async () => new Response("<not json>", { status: 200 })),
      delay: noDelay,
    });
    expect(badJson).toEqual({ kind: "malformed", reason: "invalid_json", signals });

    const badEnvelope = await evaluateLoopProbe(window, {
      apiKey: FAKE_KEY,
      fetch: vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ model: VERSIONED_MODEL, answers: {} }), { status: 200 })),
      delay: noDelay,
    });
    expect(badEnvelope).toEqual({ kind: "malformed", reason: "invalid_envelope", signals });
  });

  test("reports the same three answer keys and signals whether or not the provider answered", async () => {
    const window = projectActivity(loopingEvents(), { workingDirectory: WORKING_DIRECTORY });
    const answered = await evaluateLoopProbe(window, {
      apiKey: FAKE_KEY, fetch: provider(name => (name === QUESTIONS.retrying ? 0.95 : 0.1)), delay: noDelay,
    });
    expect(answered.kind).toBe("ok");
    if (answered.kind !== "ok") return;
    expect(Object.keys(answered.answers).sort()).toEqual(Object.keys(QUESTIONS).sort());
    expect(answered.answers[QUESTIONS.retrying]?.noul).toBe(0.95);
    expect(answered.answers[QUESTIONS.progressing]?.noul).toBe(0.1);
    expect(answered.signals).toEqual(deterministicLoopSignals(window));
  });
});
