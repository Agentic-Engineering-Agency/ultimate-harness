import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeSupervision, nativeRuntimeCompleted, runtimeRouteMismatch, runtimeTerminalFailure, sameRouteIdentifier } from "../src/harness/runtime-supervision.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/runtime-events", import.meta.url));

/** Parse a native event excerpt: one JSON event per line. */
function fixture(name: string): unknown[] {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as unknown);
}

describe("runtime supervision", () => {
  test("a blocked tool leaves in-flight state so subsequent stalls remain detectable", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 50, max_denials: 3 }, 0);
    run.observe({ type: "tool_execution_start", toolCallId: "call" }, 1);
    expect(run.check(100)).toBeUndefined();
    run.observe({ type: "tool_hook_blocked", toolCallId: "call" }, 101);
    expect(run.check(152)).toMatch(/stalled/);
    expect(run.denials).toBe(1);
  });
  test("counts observed denials, not proposed tools or quoted denial text", () => {
    const run = new RuntimeSupervision({ max_denials: 2 }, 0);
    run.observe({ type: "tool_queued", toolCallId: "one", input: { content: "tool_hook_blocked" } }, 1);
    expect(run.observe({ event: { type: "tool_hook_blocked", toolCallId: "one" } }, 2)).toBeUndefined();
    expect(run.observe({ event: { type: "tool_hook_blocked", toolCallId: "two" } }, 3)).toMatch(/hook-denied calls/);
  });
  test("in-flight work cannot evade the wall-time budget", () => {
    const run = new RuntimeSupervision({ timeout_ms: 50, stall_timeout_ms: 10 }, 0);
    run.observe({ type: "tool_running", toolCallId: "call" }, 1);
    expect(run.check(49)).toBeUndefined();
    expect(run.check(50)).toMatch(/wall-time/);
  });
  test("streaming malformed tool arguments does not reset the progress clock", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 20 }, 0);
    run.observe({ type: "message_update", delta: "more broken arguments" }, 19);
    expect(run.check(20)).toMatch(/stalled/);
  });
  test("varied reasoning refreshes the stall clock", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 100, max_thinking_ms: 1_000 }, 0);
    const varied = Array.from({ length: 5_000 }, (_, index) => String.fromCharCode(32 + index % 95)).join("");
    run.observe({ type: "thinking_start" }, 0);
    for (const [index, now] of [50, 100, 150, 200].entries()) {
      run.observe({ type: "message_update", assistantMessageEvent: {
        type: "thinking_delta", delta: varied.slice(index * 1_250, (index + 1) * 1_250),
      } }, now);
    }
    expect(run.check(299)).toBeUndefined();
  });
  test("configured thinking budget stops a live reasoning stretch", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 100, max_thinking_ms: 350 }, 0);
    run.observe({ type: "thinking_start" }, 0);
    for (const now of [50, 100, 150, 200, 250, 300]) {
      run.observe({ type: "thinking_delta", delta: "varied reasoning" }, now);
    }
    expect(run.check(349)).toBeUndefined();
    expect(run.check(350)).toBe("Reasoning exceeded max_thinking_ms without a tool call or message");
    expect(run.stopCode).toBe("stall");
  });
  test("thinking uses four times the stall timeout by default", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 100 }, 0);
    run.observe({ type: "thinking_start" }, 0);
    for (const now of [90, 180, 270]) run.observe({ type: "thinking_delta", delta: "varied reasoning" }, now);
    expect(run.check(350)).toBeUndefined();
    expect(run.check(400)).toBe("Reasoning exceeded max_thinking_ms without a tool call or message");
  });
  test("repeated reasoning text still stalls at the ordinary stall timeout", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 100 }, 0);
    run.observe({ type: "thinking_start" }, 0);
    run.observe({ type: "thinking_delta", delta: "R".repeat(4_096) }, 10);
    expect(run.check(99)).toBeUndefined();
    expect(run.check(100)).toBe("Runtime stalled without an in-flight tool");
  });
  test("text deltas alone do not count as progress", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 20 }, 0);
    run.observe({ type: "text_delta", delta: "varied output" }, 19);
    expect(run.check(20)).toBe("Runtime stalled without an in-flight tool");
  });
  test("a tool call resets the reasoning stretch budget", () => {
    const run = new RuntimeSupervision({ stall_timeout_ms: 1_000, max_thinking_ms: 300 }, 0);
    run.observe({ type: "thinking_start" }, 0);
    run.observe({ type: "tool_execution_start", toolCallId: "call" }, 100);
    run.observe({ type: "tool_execution_end", toolCallId: "call" }, 110);
    run.observe({ type: "thinking_delta", delta: "varied reasoning" }, 150);
    expect(run.check(300)).toBeUndefined();
    expect(run.check(449)).toBeUndefined();
    expect(run.check(450)).toBe("Reasoning exceeded max_thinking_ms without a tool call or message");
  });
  test("a session banner is not readiness", () => {
    const run = new RuntimeSupervision({ startup_timeout_ms: 20 }, 0);
    run.observe({ type: "session", id: "saved-session" }, 1);
    expect(run.sessionId).toBe("saved-session");
    expect(run.check(20)).toMatch(/readiness/);
  });
  test("turn budget permits terminal completion but prevents another turn", () => {
    const run = new RuntimeSupervision({ max_turns: 1 }, 0);
    run.observe({ type: "turn_start" }, 1);
    run.observe({ type: "turn_end" }, 2);
    expect(run.observe({ type: "agent_end", messages: [] }, 3)).toBeUndefined();
    expect(run.observe({ type: "turn_start" }, 4)).toMatch(/Turn limit/);
  });
  test("a native max_turns terminal stop settles as turn_limit naming the cap and the turn count", () => {
    const run = new RuntimeSupervision({ max_turns: 200 }, 0);
    run.observe({ type: "model_request_start", model: "assigned" }, 1);
    expect(run.observe({ type: "result", subtype: "error_max_turns", stopReason: "max_turns", num_turns: 100 }, 2))
      .toBe("Native turn cap (max_turns) reached after 100 turns");
    expect(run.stopCode).toBe("turn_limit");
  });
  test("a native turn cap is recognized without a num_turns counter by counting turn_end events", () => {
    const run = new RuntimeSupervision({}, 0);
    run.observe({ type: "turn_end" }, 1);
    run.observe({ type: "turn_end" }, 2);
    expect(run.observe({ type: "result", stopReason: "max_turns" }, 3))
      .toBe("Native turn cap (max_turns) reached after 2 turns");
    expect(run.stopCode).toBe("turn_limit");
  });
  test("an unrecognized native terminal stop settles as runtime_error with the reason copied", () => {
    const run = new RuntimeSupervision({}, 0);
    expect(run.observe({ type: "result", finalText: "partial", stopReason: "aborted", num_turns: 4 }, 1))
      .toBe("Runtime reported failure (aborted)");
    expect(run.stopCode).toBe("runtime_error");
  });
  test("a native time cap settles as timeout", () => {
    const run = new RuntimeSupervision({}, 0);
    run.observe({ type: "result", stopReason: "max_time" }, 1);
    expect(run.stopCode).toBe("timeout");
  });
  test("a native turn cap settles turn_limit after a final assistant message and the sentinel", () => {
    // A final message is not a natural end: the runtime's own cap still ends
    // the attempt, so the run can never settle as completed.
    for (const limits of [{ max_turns: 2 }, {}]) {
      const run = new RuntimeSupervision(limits, 0);
      let stopped: string | undefined;
      for (const [index, value] of fixture("command-code-native-turn-cap.ndjson").entries()) {
        stopped = run.observe(value, index + 1);
      }
      expect(stopped).toBe("Native turn cap (max_turns) reached after 2 turns");
      expect(run.stopCode).toBe("turn_limit");
      expect(run.terminal).toBe(true);
      expect(nativeRuntimeCompleted({
        nativeTerminal: run.terminal, nativeTerminalFailure: run.terminalFailure,
        supervisionStopCode: run.stopCode, finalMessage: "completed just before the cap", errors: [],
      })).toBe(false);
    }
  });
  test("a native turn cap named only by an error subtype still settles turn_limit", () => {
    const run = new RuntimeSupervision({}, 0);
    expect(run.observe({ type: "result", subtype: "error_max_turns", num_turns: 3 }, 1))
      .toBe("Native turn cap (max_turns) reached after 3 turns");
    expect(run.stopCode).toBe("turn_limit");
  });
  test("a deadline grace attempt settles its expected native cap as deadline, never turn_limit", () => {
    const run = new RuntimeSupervision({ max_turns: 3 }, 0, undefined, undefined, undefined, undefined,
      { grace_turns: 2, grace_timeout_ms: 300_000, grace: true });
    let stopped: string | undefined;
    for (const [index, value] of fixture("command-code-native-turn-cap.ndjson").entries()) {
      stopped = run.observe(value, index + 1);
    }
    expect(stopped).toBeUndefined();
    expect(run.failure).toBeUndefined();
    expect(run.stopCode).toBe("deadline");
    expect(run.terminal).toBe(true);
    expect(run.terminalFailure).toBeUndefined();
  });
  test("repeated failure accounting follows tool identity and structured outcome", () => {
    const run = new RuntimeSupervision({ max_repeated_failures: 2 }, 0);
    for (const id of ["one", "two"]) {
      run.observe({ type: "tool_execution_start", toolCallId: id, args: { command: "build" } }, 1);
      run.observe({ type: "tool_execution_end", toolCallId: id, isError: true }, 2);
    }
    expect(run.check(3)).toMatch(/same command failed/);
    expect(run.inflight.size).toBe(0);
  });
  test("nested native terminal failures override apparent wrapper completion", () => {
    expect(runtimeTerminalFailure({ type: "run_end", result: { stopReason: "max_turns" } })).toMatch(/failure/);
    expect(runtimeTerminalFailure({ type: "agent_end", messages: [{ stopReason: "error" }] })).toMatch(/failure/);
    expect(runtimeTerminalFailure({ type: "result", status: "completed" })).toBeUndefined();
  });
  test("agent_end ignores prior toolResult errors after a completed stop", () => {
    expect(runtimeTerminalFailure({
      type: "agent_end",
      messages: [
        { role: "toolResult", isError: true, content: [{ type: "text", text: "CONTRACT: denied" }] },
        { role: "assistant", stopReason: "stop" },
      ],
    })).toBeUndefined();
  });
  test("stops a native provider mismatch but ignores route-looking tool data", () => {
    const run = new RuntimeSupervision({}, 0, { provider: "assigned", model: "model-one" });
    run.observe({ type: "tool_completed", result: { model: "unassigned", provider: "other" } }, 1);
    expect(run.check(2)).toBeUndefined();
    run.observe({ type: "message_end", message: { role: "assistant", provider: "assigned", model: "model-one" } }, 3);
    expect(run.check(4)).toBeUndefined();
    run.observe({ type: "model_request_start", provider: "other", model: "model-one" }, 5);
    expect(run.stopCode).toBe("route_mismatch");
    expect(run.check(6)).toBeDefined();
  });
  test("does not treat configured metadata as observed route attestation", () => {
    const run = new RuntimeSupervision({}, 0, { model: "assigned" });
    run.observe({ type: "session", model: "assigned" }, 1);
    run.observe({ type: "result", finalText: "done" }, 2);
    run.settle();
    expect(run.stopCode).toBe("route_unverified");
  });
  test("denial budget names the denied tool, target, and hook text", () => {
    const run = new RuntimeSupervision({ max_denials: 3 }, 0);
    for (const [id, target] of [["one", "out/a.txt"], ["two", "out/b.txt"], ["three", "out/c.txt"]]) {
      run.observe({ type: "tool_queued", toolCallId: id, toolName: "write_file", input: { path: target } }, 1);
      run.observe({ type: "tool_hooks", toolCallId: id, phase: "pre", outcome: { kind: "block", text: "writes are locked" } }, 2);
      run.observe({ type: "tool_hook_blocked", toolCallId: id }, 3);
    }
    expect(run.stopCode).toBe("denial_budget");
    expect(run.failure).toBe("3 hook-denied calls; last: write_file out/c.txt: writes are locked");
  });

  test("protected path mutations stop before execution while reads and output writes continue", () => {
    const protectedFile = new RuntimeSupervision({}, 0);
    protectedFile.observe({ type: "tool_queued", toolCallId: "file", toolName: "write_file", input: { path: ".harness/adapters/oh-my-pi.yaml" } }, 1);
    expect(protectedFile.stopCode).toBe("policy");
    expect(protectedFile.failure).toContain(".harness/adapters/oh-my-pi.yaml");

    const protectedShell = new RuntimeSupervision({}, 0);
    protectedShell.observe({ type: "tool_queued", toolCallId: "shell", toolName: "bash", input: { command: "echo x > .git/config" } }, 1);
    expect(protectedShell.stopCode).toBe("policy");
    const commandCodeProtectedShell = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard");
    commandCodeProtectedShell.observe({ type: "tool_queued", toolCallId: "command-code-shell", toolName: "shell_command",
      input: { command: "rm .harness/temporary.txt" } }, 1);
    expect(commandCodeProtectedShell.stopCode).toBe("policy");
    expect(commandCodeProtectedShell.failure).toContain(".harness/temporary.txt");


    const protectedRead = new RuntimeSupervision({}, 0);
    protectedRead.observe({ type: "tool_queued", toolCallId: "read", toolName: "bash", input: { command: "cat .git/config" } }, 1);
    expect(protectedRead.stopCode).toBeUndefined();

    const output = new RuntimeSupervision({}, 0);
    output.observe({ type: "tool_queued", toolCallId: "output", toolName: "write_file", input: { path: "out/x.txt" } }, 1);
    expect(output.stopCode).toBeUndefined();
  });
  test("absolute protected paths are scoped to the working directory", () => {
    const workspace = path.resolve("supervision-workspace");
    const inside = new RuntimeSupervision({}, 0, undefined, workspace);
    inside.observe({ type: "tool_queued", toolCallId: "inside", toolName: "write_file", input: {
      path: path.join(workspace, ".harness", "adapters", "oh-my-pi.yaml"),
    } }, 1);
    expect(inside.stopCode).toBe("policy");

    const outside = new RuntimeSupervision({}, 0, undefined, workspace);
    outside.observe({ type: "tool_queued", toolCallId: "outside", toolName: "write_file", input: {
      path: path.resolve("outside-workspace", ".harness", "adapter.yaml"),
    } }, 1);
    expect(outside.stopCode).toBeUndefined();
  });
  test("protected path mutations stop on oh-my-pi tool_execution_start", () => {
    const run = new RuntimeSupervision({}, 0);
    run.observe({ type: "tool_execution_start", toolCallId: "call", toolName: "write", args: { path: ".harness/adapters/oh-my-pi.yaml" } }, 1);
    expect(run.stopCode).toBe("policy");
    expect(run.failure).toContain(".harness/adapters/oh-my-pi.yaml");
  });

  test.each([
    ["clean native completion", { nativeTerminal: true, finalMessage: "DONE" }, true],
    ["missing terminal", { nativeTerminal: false, finalMessage: "DONE" }, false],
    ["terminal failure", { nativeTerminal: true, nativeTerminalFailure: "failure", finalMessage: "DONE" }, false],
    ["supervisor stop", { nativeTerminal: true, supervisionStopCode: "policy" as const, finalMessage: "DONE" }, false],
  ])("native completion settlement: %s", (_name, facts, expected) => {
    expect(nativeRuntimeCompleted(facts)).toBe(expected);
  });
  test("freezes denial count and reason after denial budget stop while retaining terminal facts", () => {
    const run = new RuntimeSupervision({ max_denials: 3 }, 0);
    for (const id of ["one", "two", "three"]) run.observe({ type: "tool_hook_blocked", toolCallId: id }, 1);
    const reason = run.failure;
    run.observe({ type: "tool_hook_blocked", toolCallId: "four" }, 2);
    run.observe({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] }, 3);
    expect(run.denials).toBe(3);
    expect(run.failure).toBe(reason);
    expect(run.stopCode).toBe("denial_budget");
    expect(run.terminal).toBe(true);
  });

  test("freezes repeated-failure and turn counters after their stop decisions", () => {
    const failures = new RuntimeSupervision({ max_repeated_failures: 2 }, 0);
    for (const id of ["one", "two"]) {
      failures.observe({ type: "tool_execution_start", toolCallId: id, args: { command: "build" } }, 1);
      failures.observe({ type: "tool_execution_end", toolCallId: id, isError: true }, 2);
    }
    const failureReason = failures.failure;
    failures.observe({ type: "tool_execution_start", toolCallId: "three", args: { command: "build" } }, 3);
    failures.observe({ type: "tool_execution_end", toolCallId: "three", isError: true }, 4);
    expect(failures.failure).toBe(failureReason);
    expect(failures.failures.get("build")).toBe(2);

    const turns = new RuntimeSupervision({ max_turns: 1 }, 0);
    turns.observe({ type: "turn_start" }, 1);
    turns.observe({ type: "turn_end" }, 2);
    turns.observe({ type: "turn_start" }, 3);
    const turnReason = turns.failure;
    turns.observe({ type: "turn_end" }, 4);
    expect(turns.turns).toBe(1);

    expect(turns.failure).toBe(turnReason);
  });
  test("Command Code shell failures parsed from result text trip the repeated-failure guard", () => {
    const run = new RuntimeSupervision({ max_repeated_failures: 3 }, 0);
    let completions = 0;
    let stoppedOn: number | undefined;
    for (const [index, value] of fixture("command-code-repeated-shell-failure.ndjson").entries()) {
      if ((value as { type?: unknown }).type === "tool_completed") completions += 1;
      const stopped = run.observe(value, index + 1);
      if (stopped && stoppedOn === undefined) stoppedOn = completions;
    }
    expect(stoppedOn).toBe(3);
    expect(run.stopCode).toBe("repeated_failure");
    expect(run.failure).toBe('The same command failed 3 times (exit 1): node -e "process.exit(1)"');
    expect(run.failures.get('node -e "process.exit(1)"')).toBe(3);
    expect(run.inflight.size).toBe(0);
  });
  test("Command Code stdout that merely mentions an exit code never counts as a failure", () => {
    const run = new RuntimeSupervision({ max_repeated_failures: 1 }, 0);
    for (const [index, value] of fixture("command-code-shell-exit-code-in-stdout.ndjson").entries()) {
      run.observe(value, index + 1);
    }
    expect(run.failure).toBeUndefined();
    expect(run.failures.size).toBe(0);
  });
  test("oh-my-pi error outcomes still count through their structured fields", () => {
    const run = new RuntimeSupervision({ max_repeated_failures: 3 }, 0);
    for (const [index, value] of fixture("oh-my-pi-healthy.ndjson").entries()) {
      run.observe(value, index + 1);
    }
    expect(run.failure).toBeUndefined();
    expect(run.failures.get("gitnexus_impact x")).toBe(1);
    expect(run.failures.get("bunx x")).toBe(1);
  });
  test("guard tamper in the guard log is a non-resumable policy stop", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "uh-guard-tamper-"));
    const logPath = path.join(directory, "tool-guard.log");
    writeFileSync(logPath, `${JSON.stringify({ class: "guard_tamper", tool: "shell_command" })}\n`);
    try {
      const run = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard", logPath);
      run.observe({ type: "tool_execution_start", toolCallId: "tamper", toolName: "shell_command", args: { command: "echo x" } }, 1);
      run.observe({ type: "tool_execution_end", toolCallId: "tamper", result: { exitCode: 0 } }, 2);
      expect(run.stopCode).toBe("policy");
      expect(run.failure).toBe("Guard tamper attempted");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("native guard tamper denials stop before denial-budget accounting", () => {
    const run = new RuntimeSupervision({ max_denials: 1 }, 0);
    run.observe({ type: "tool_denied", toolCallId: "tamper", class: "guard_tamper" }, 1);
    expect(run.stopCode).toBe("policy");
    expect(run.failure).toBe("Guard tamper attempted");
    expect(run.denials).toBe(0);
  });
  test("guard permission fails closed when completed tool has no guard-log evidence", () => {
    const run = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard", "T:/missing-tool-guard.log");
    run.observe({ type: "tool_execution_start", toolCallId: "call", toolName: "shell_command", args: { command: "echo x" } }, 1);
    run.observe({ type: "tool_execution_end", toolCallId: "call", result: { exitCode: 0 } }, 2);
    expect(run.stopCode).toBe("policy");
    expect(run.failure).toBe("Guard hook did not run; refusing to continue with permissions enabled");
    expect(run.guardArmed).toBe(false);
    run.observe({ type: "agent_end", messages: [{ role: "assistant", stopReason: "stop" }] }, 3);
    expect(run.terminal).toBe(true);
  });
  test("guard permission distinguishes a hook that ran but could not log", () => {
    const run = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard", "T:/missing-tool-guard.log");
    run.observe({ type: "tool_hooks", toolCallId: "call", phase: "pre", outcome: { kind: "allow" } }, 1);
    run.observe({ type: "tool_execution_start", toolCallId: "call", toolName: "shell_command", args: { command: "echo x" } }, 2);
    run.observe({ type: "tool_execution_end", toolCallId: "call", result: { exitCode: 0 } }, 3);
    expect(run.stopCode).toBe("policy");
    expect(run.failure).toBe("Guard hook ran but could not log; refusing to continue with permissions enabled");
    expect(run.guardArmed).toBe(false);
  });

  test("guard permission does not arm from pre-hook event alone", () => {
    const run = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard");
    run.observe({ type: "tool_hooks", toolCallId: "call", phase: "pre", outcome: { kind: "allow" } }, 1);
    run.observe({ type: "tool_execution_start", toolCallId: "call", toolName: "shell_command", args: { command: "echo x" } }, 2);
    expect(run.stopCode).toBeUndefined();
    expect(run.guardArmed).toBeUndefined();
  });

  test("a native tool refusal keeps the guard armed and counts separately", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "uh-native-refusal-"));
    const logPath = path.join(directory, "tool-guard.log");
    writeFileSync(logPath, `${JSON.stringify({
      ts: "2026-01-01T00:00:09.000Z", call_id: "call-1", tool: "shell_command", class: "allow", target: "bunx x",
    })}\n`);
    try {
      const run = new RuntimeSupervision({ max_denials: 5 }, 0, undefined, "C:\\worker", "guard", logPath);
      let stopped: string | undefined;
      for (const [index, value] of fixture("command-code-native-unknown-tool.ndjson").entries()) {
        stopped = run.observe(value, index + 1);
      }
      expect(stopped).toBeUndefined();
      expect(run.stopCode).toBeUndefined();
      expect(run.guardArmed).toBe(true);
      expect(run.nativeRefusals).toBe(1);
      expect(run.denials).toBe(1);
      expect(run.terminal).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("repeated native refusals exhaust the denial budget naming the tool without disarming the guard", () => {
    const run = new RuntimeSupervision({ max_denials: 2 }, 0, undefined, "C:\\worker", "guard", "T:/missing-tool-guard.log");
    run.observe({ type: "tool_queued", toolCallId: "one", toolName: "shell", input: { command: "echo x" } }, 1);
    expect(run.observe({ type: "tool_denied", toolCallId: "one", toolName: "shell" }, 2)).toBeUndefined();
    run.observe({ type: "tool_queued", toolCallId: "two", toolName: "shell", input: { command: "echo x" } }, 3);
    expect(run.observe({ type: "tool_denied", toolCallId: "two", toolName: "shell" }, 4))
      .toBe("2 denied calls; last: native refusal of shell");
    expect(run.stopCode).toBe("denial_budget");
    expect(run.nativeRefusals).toBe(2);
    expect(run.denials).toBe(2);
    expect(run.guardArmed).toBeUndefined();
  });

  test("guard evidence must belong to the completed call, not only match totals", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "uh-guard-evidence-"));
    const logPath = path.join(directory, "tool-guard.log");
    writeFileSync(logPath, `${JSON.stringify({
      ts: "2026-01-01T00:00:01.000Z", call_id: "other", tool: "read_file", class: "allow", target: "src/x.ts",
    })}\n`);
    try {
      const run = new RuntimeSupervision({}, 0, undefined, "C:\\worker", "guard", logPath);
      run.observe({ type: "tool_queued", toolCallId: "call", toolName: "shell_command", input: { command: "bun run test" } }, 1);
      run.observe({ type: "tool_completed", toolCallId: "call", toolName: "shell_command", result: [] }, 2);
      expect(run.stopCode).toBe("policy");
      expect(run.failure).toBe("Guard hook did not run; refusing to continue with permissions enabled");
      expect(run.guardArmed).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("deadline wall-time stops at grace boundary with remaining budget", () => {
    const run = new RuntimeSupervision({ timeout_ms: 10_000 }, 1_000, undefined, undefined, undefined, undefined,
      { grace_turns: 2, grace_timeout_ms: 3_000 });
    expect(run.check(8_000)).toContain("3000ms remaining for grace");
    expect(run.stopCode).toBe("deadline");
  });

  test("deadline turn budget stops before the grace turns", () => {
    const run = new RuntimeSupervision({ max_turns: 4 }, 0, undefined, undefined, undefined, undefined,
      { grace_turns: 2, grace_timeout_ms: 3_000 });
    run.observe({ type: "turn_end" }, 1);
    run.observe({ type: "turn_end" }, 2);
    expect(run.observe({ type: "turn_start" }, 3)).toContain("2 turns remaining for grace");
    expect(run.stopCode).toBe("deadline");
  });
});

describe("route identifier comparison", () => {
  test("letter case and surrounding whitespace do not distinguish a route", () => {
    expect(sameRouteIdentifier("qwen/qwen3.8-flash", "Qwen/Qwen3.8-Flash")).toBe(true);
    expect(sameRouteIdentifier("  Qwen  ", "qwen")).toBe(true);
    expect(sameRouteIdentifier("gpt-5.6-luna", "GPT-5.6-Luna")).toBe(true);
  });

  test("a provider prefix on exactly one side is dropped for comparison", () => {
    expect(sameRouteIdentifier("qwen/qwen3.8-flash", "Qwen3.8-Flash")).toBe(true);
    expect(sameRouteIdentifier("Qwen3.8-Flash", "qwen/qwen3.8-flash")).toBe(true);
  });

  test("a different model still mismatches", () => {
    expect(sameRouteIdentifier("qwen/qwen3.8-flash", "qwen/qwen3.8-max")).toBe(false);
    expect(sameRouteIdentifier("gpt-5.6-luna", "gpt-5.6")).toBe(false);
    expect(sameRouteIdentifier("google-antigravity/gemini-3.8-flash", "openai-codex/gemini-3.8-flash")).toBe(false);
  });

  test("runtimeRouteMismatch compares providers and models case-insensitively", () => {
    expect(runtimeRouteMismatch({ provider: "Qwen", model: "Qwen/Qwen3.8-Flash" }, { provider: "qwen", model: "qwen/qwen3.8-flash" })).toBe(false);
    expect(runtimeRouteMismatch({ provider: "qwen", model: "qwen/qwen3.8-max" }, { provider: "qwen", model: "qwen/qwen3.8-flash" })).toBe(true);
    expect(runtimeRouteMismatch({ provider: "other", model: "qwen/qwen3.8-flash" }, { provider: "qwen", model: "qwen/qwen3.8-flash" })).toBe(true);
  });

  test("a model_request_start reporting a different-case route does not stop the run", () => {
    const run = new RuntimeSupervision({}, 0, { provider: "qwen", model: "qwen/qwen3.8-flash" });
    expect(run.observe({ type: "model_request_start", provider: "Qwen", model: "Qwen/Qwen3.8-Flash" }, 1)).toBeUndefined();
    expect(run.stopCode).toBeUndefined();
  });

  test("a model_request_start on another model still stops the run with route_mismatch", () => {
    const run = new RuntimeSupervision({}, 0, { provider: "qwen", model: "qwen/qwen3.8-flash" });
    run.observe({ type: "model_request_start", provider: "Qwen", model: "Qwen/Qwen3.8-Max" }, 1);
    expect(run.stopCode).toBe("route_mismatch");
  });
});
