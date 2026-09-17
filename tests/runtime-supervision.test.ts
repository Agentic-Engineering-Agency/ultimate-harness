import path from "node:path";
import { RuntimeSupervision, nativeRuntimeCompleted, runtimeTerminalFailure } from "../src/harness/runtime-supervision.js";

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
