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

/** oh-my-pi shapes: start carries `args`, end carries `isError` and `result`. */
function ompStart(toolCallId: string, toolName: string, args: Record<string, unknown>) {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function ompEnd(toolCallId: string, extra: Record<string, unknown> = {}) {
  return { type: "tool_execution_end", toolCallId, ...extra };
}

/** Command Code shapes: keyed by `id`, arguments in `input`. */
function cmdc(id: string, toolName: string, input: Record<string, unknown>) {
  return { type: "tool_queued", id, toolName, input };
}

function cmdcDone(id: string, extra: Record<string, unknown> = {}) {
  return { type: "tool_completed", id, ...extra };
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
    ompEnd(id, { isError: true, result: { exitCode: 1, content: [{ text: `failure ${MARKER}` }] } }),
  ]);
}

describe("projectActivity", () => {
  test("projects completed oh-my-pi tool calls into whitelisted fields", () => {
    const window = projectActivity(events(
      ompStart("r1", "read_file", { file_path: "src/harness/typesafe.ts" }),
      ompEnd("r1", { result: { content: [{ text: `contents ${MARKER}` }] } }),
      ompStart("w1", "edit_file", { path: "src/harness/loop-probe.ts" }),
      ompEnd("w1", {}),
      ompStart("s1", "bash", { command: "bun test tests/loop-probe.test.ts 2>&1" }),
      ompEnd("s1", { result: { exitCode: 0 } }),
      { type: "message_update", delta: `streamed text ${MARKER}` },
      { type: "agent_end", messages: [] },
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("oh-my-pi");
    expect(window.window).toBe(DEFAULT_ACTIVITY_WINDOW);
    expect(window.calls).toEqual([
      { tool: "read_file", kind: "read", target: "src/harness/typesafe.ts", ok: true, error_class: "none" },
      { tool: "edit_file", kind: "write", target: "src/harness/loop-probe.ts", ok: true, error_class: "none" },
      { tool: "bash", kind: "shell", target: "bun", ok: true, error_class: "none" },
    ]);
  });

  test("projects completed Command Code tool calls from `id` and `input`", () => {
    const window = projectActivity(events(
      cmdc("c1", "read_file", { file_path: "/repo/work/docs/README.md" }),
      cmdcDone("c1", {}),
      cmdc("c2", "write_file", { path: "notes.md" }),
      cmdcDone("c2", { isError: true, result: { text: `rejected ${MARKER}` } }),
      cmdc("c3", "shell_command", { command: "NPM_CONFIG_TOKEN=hidden bun run build --verbose" }),
      cmdcDone("c3", { result: { exit_code: 2 } }),
      cmdc("c4", "shell_command", { command: "echo hi" }),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.source).toBe("command-code");
    expect(window.calls).toEqual([
      { tool: "read_file", kind: "read", target: "docs/README.md", ok: true, error_class: "none" },
      { tool: "write_file", kind: "write", target: "notes.md", ok: false, error_class: "tool_error" },
      { tool: "shell_command", kind: "shell", target: "bun", ok: false, error_class: "nonzero_exit" },
    ]);
  });

  test("classifies error classes and never classifies an absent result as a denial", () => {
    const window = projectActivity(events(
      cmdc("d1", "write_file", { path: "src/a.ts" }),
      { type: "tool_hook_blocked", id: "d1", hookOutput: "CONTRACT: protected path write attempted" },
      cmdc("d2", "write_file", { path: "src/b.ts" }),
      cmdcDone("d2", { isError: true, result: { content: [{ text: "CONTRACT: guarded print-mode refusal" }] } }),
      ompStart("t1", "bash", { command: "bun test" }),
      ompEnd("t1", { isError: true, result: { content: [{ text: "assertion failed" }] } }),
      ompStart("z1", "bash", { command: "bun test" }),
      ompEnd("z1", { result: { exitCode: 1 } }),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls.map(call => [call.target, call.ok, call.error_class])).toEqual([
      ["src/a.ts", false, "denied"],
      ["src/b.ts", false, "denied"],
      ["bun", false, "tool_error"],
      ["bun", false, "nonzero_exit"],
    ]);
    expect(window.calls.every(call => call.tool === "write_file" || call.tool === "bash")).toBe(true);
  });

  test("normalizes paths to forward slashes relative to the working directory, with <outside> beyond it", () => {
    const window = projectActivity(events(
      cmdc("a", "read_file", { file_path: `${WORKING_DIRECTORY}/src//nested/../harness/a.ts` }),
      cmdcDone("a", {}),
      cmdc("b", "read_file", { file_path: "./relative/b.ts" }),
      cmdcDone("b", {}),
      cmdc("c", "read_file", { file_path: "../escaped/c.ts" }),
      cmdcDone("c", {}),
      cmdc("d", "read_file", { file_path: "/etc/other/d.ts" }),
      cmdcDone("d", {}),
      cmdc("e", "read_file", { file_path: `${WORKING_DIRECTORY}/../sibling/e.ts` }),
      cmdcDone("e", {}),
      cmdc("f", "read_file", { path: WORKING_DIRECTORY }),
      cmdcDone("f", {}),
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
      cmdc("a", "shell_command", { command: "   BUN.EXE   test --run" }),
      cmdcDone("a", {}),
      cmdc("b", "shell_command", { command: "/usr/local/bin/my-tool.exe run" }),
      cmdcDone("b", {}),
      cmdc("c", "shell_command", { command: "./scripts/ci.CMD build" }),
      cmdcDone("c", {}),
      cmdc("d", "shell_command", { command: "" }),
      cmdcDone("d", {}),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls.map(call => call.target)).toEqual(["bun", "my-tool", "ci", "unknown"]);
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
      cmdc("a", "task", { command: `delegate ${MARKER}`, prompt: `instructions ${MARKER}` }),
      cmdcDone("a", {}),
      cmdc("b", "web_fetch", { url: "https://example.invalid/docs" }),
      cmdcDone("b", {}),
    ), { workingDirectory: WORKING_DIRECTORY });

    expect(window.calls).toEqual([
      { tool: "task", kind: "other", target: "unknown", ok: true, error_class: "none" },
      { tool: "web_fetch", kind: "other", target: "unknown", ok: true, error_class: "none" },
    ]);
  });

  test("drops events from another runtime and carries no fields beyond the whitelist", () => {
    const window = projectActivity(events(
      cmdc("a", "read_file", { file_path: "src/a.ts" }),
      ompEnd("other", {}),
      cmdcDone("a", {}),
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

  test("counts identical repeats and alternation on a crafted loop", () => {
    const loop = windowOf([
      call({ target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
      call({ target: "src/a.ts", kind: "write", ok: false, error_class: "tool_error" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
    ]);

    expect(deterministicLoopSignals(loop)).toEqual({
      // Three repeats of the failing write after its first attempt, plus one repeat of the failing command.
      identical_repeats: 4,
      alternating_pairs: 3,
      distinct_targets: 2,
    });
  });

  test("reports no repeats or alternation on a healthy trajectory", () => {
    const healthy = windowOf([
      call({ target: "docs/README.md", kind: "read" }),
      call({ target: "src/a.ts", kind: "read" }),
      call({ target: "bun", ok: false, error_class: "nonzero_exit" }),
      call({ target: "src/a.ts", kind: "write", ok: false, error_class: "denied" }),
      call({ target: "bun", ok: true }),
      call({ target: "src/b.ts", kind: "write" }),
    ]);

    expect(deterministicLoopSignals(healthy)).toEqual({
      identical_repeats: 0,
      alternating_pairs: 0,
      distinct_targets: 4,
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

  test("never places arguments, output, command lines or message text in the serialized request", async () => {
    const fetchMock = provider();
    const window = projectActivity(events(
      cmdc("a", "read_file", { file_path: "/repo/work/src/a.ts", extra: `argument ${MARKER}` }),
      cmdcDone("a", { result: { content: [{ text: `file contents ${MARKER}` }], stdout: `output ${MARKER}` } }),
      cmdc("b", "shell_command", { command: `bun test ${MARKER} --filter "progressing"` }),
      cmdcDone("b", { result: { exitCode: 1, stderr: `stderr ${MARKER}` } }),
      cmdc("c", "edit_file", { path: "/repo/work/src/c.ts", content: `payload ${MARKER}` }),
      cmdcDone("c", { isError: true, message: `assistant message ${MARKER}` }),
      cmdc("d", "bash", { command: `printf '%s' ${MARKER}` }),
      cmdcDone("d", { isError: true, result: { content: [{ text: `rejected ${MARKER}` }] } }),
    ), { workingDirectory: WORKING_DIRECTORY });

    const result = await evaluateLoopProbe(window, { apiKey: FAKE_KEY, fetch: fetchMock, delay: noDelay });

    const serialized = JSON.stringify({ state: bodyOf(fetchMock.mock.calls[0]?.[1]).state, questions: bodyOf(fetchMock.mock.calls[0]?.[1]).questions });
    expect(serialized).not.toContain(MARKER);
    expect(serialized).not.toContain("--filter");
    // The executable name is allowed; the command line and its arguments are not.
    expect(serialized).not.toContain("printf '%s'");
    expect(serialized).not.toContain("/repo/");
    expect(serialized).not.toContain(FAKE_KEY);
    expect(JSON.stringify(result)).not.toContain(MARKER);
    expect(window.calls.map(call => call.target)).toEqual(["src/a.ts", "bun", "src/c.ts", "printf"]);
  });

  test("sends no request when the window holds fewer than four completed calls", async () => {
    const fetchMock = provider();
    const short = projectActivity(events(
      cmdc("a", "read_file", { file_path: "src/a.ts" }),
      cmdcDone("a", {}),
      cmdc("b", "read_file", { file_path: "src/b.ts" }),
      cmdcDone("b", {}),
      cmdc("c", "read_file", { file_path: "src/c.ts" }),
      cmdcDone("c", {}),
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
      events(cmdc("a", "read_file", { file_path: "src/a.ts" }), cmdcDone("a", {})),
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
