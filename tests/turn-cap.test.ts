import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runRuntimeProcess } from "../src/harness/runtime-process.js";

/**
 * A turn cap that is hit while the runtime still sends its normal finish signal must not pass.
 *
 * How each runtime with a turn cap reports it (current docs):
 * - Claude Code: `--max-turns` "Exits with an error when the limit is reached" (code.claude.com cli-reference);
 *   the result record carries `subtype: "error_max_turns"`.
 * - Command Code: `--max-turns`; the run ends with `stopReason: "max_turns"` (its own agent loop, dist/cli.mjs).
 * - oh-my-pi 18.4.4: no turn cap at all (`omp --help` has `--max-time` only), so UH's own `limits.max_turns`,
 *   counted from `turn_end` events, is the only cap.
 * - Hermes: `--max-turns` "Maximum tool-calling iterations"; hitting it is exit code 1 and a terminal
 *   `result` with `exit_code` 1 (Hermes CLI reference, "Exit codes for one-shot runs").
 * - ACP: the agent answers `stopReason: "max_turn_requests"` (ACP v1 prompt turn).
 * - Codex, Pi, anthropic, openrouter, hermes-proxy: no turn cap (`codex exec`, Pi `cli.md`: no such flag).
 * Here the cap is UH's `limits.max_turns` and the runtime goes on to a clean finish anyway.
 */
const line = (value: unknown) => `console.log(JSON.stringify(${JSON.stringify(value)}));`;

const RUNTIMES = [
  ["oh-my-pi", [...Array.from({ length: 4 }, () => line({ type: "turn_start" }) + line({ type: "turn_end" })), line({ type: "agent_end", messages: [] })].join("")],
  ["command-code", [...Array.from({ length: 4 }, () => line({ type: "turn_start" }) + line({ type: "turn_end" })), line({ type: "run_end", result: { finalText: "DONE", stopReason: "end_turn" } })].join("")],
  ["claude-code", [...Array.from({ length: 4 }, (_unused, index) => line({ type: "assistant", message: { id: `msg_${index}`, role: "assistant", content: [{ type: "text", text: "x" }] } })), line({ type: "result", subtype: "success", is_error: false, result: "DONE" })].join("")],
] as const;

describe("a turn cap that is hit while the runtime still finishes cleanly", () => {
  test.each(RUNTIMES)("%s: the run stops at the cap and does not pass", async (runtime, script) => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-turn-cap-"));
    try {
      const result = await runRuntimeProcess({
        command: process.execPath, args: ["-e", script], cwd: root, limits: { max_turns: 2 },
        artifacts: { directory: root, missionId: "one", runId: "capped", runtime },
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.supervisionStopCode).toBe("turn_limit");
      const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
      expect(control).toMatchObject({ status: "failed", stop_code: "turn_limit" });
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);

  test("hermes: a budget stop is a terminal result with exit_code 1, and the run does not pass", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-turn-cap-"));
    try {
      const result = await runRuntimeProcess({
        command: process.execPath, args: ["-e", line({ type: "result", exit_code: 1, error: "max_iterations_reached(3/3)", text: "partial work" })], cwd: root,
        artifacts: { directory: root, missionId: "one", runId: "hermes-capped", runtime: "hermes" },
      });
      expect(result.exitCode).not.toBe(0);
      const control = JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8"));
      expect(control.status).toBe("failed");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);
});
