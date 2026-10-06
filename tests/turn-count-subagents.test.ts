import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runRuntimeProcess } from "../src/harness/runtime-process.js";

/**
 * U-064 (GH #266): Claude Code reports a sub-agent's messages in the same stream as its own, marked with the
 * `parent_tool_use_id` of the tool call that started the sub-agent. Those are not the run's turns, so they must not
 * count against `limits.max_turns` (or show up as `turns` in `uh ps`).
 */
const line = (value: unknown) => `console.log(JSON.stringify(${JSON.stringify(value)}));`;
const assistant = (id: string, parent?: string) => line({
  type: "assistant",
  ...(parent ? { parent_tool_use_id: parent } : { parent_tool_use_id: null }),
  message: { id, role: "assistant", content: [{ type: "text", text: "x" }] },
});
const result = line({ type: "result", subtype: "success", is_error: false, result: "DONE", stop_reason: "end_turn" });

async function run(script: string, maxTurns: number) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-turn-count-"));
  try {
    const outcome = await runRuntimeProcess({
      command: process.execPath, args: ["-e", script], cwd: root, limits: { max_turns: maxTurns }, requireNativeTerminal: true,
      artifacts: { directory: root, missionId: "one", runId: "r", runtime: "claude-code" },
    });
    return { outcome, control: JSON.parse(await readFile(path.join(root, "runtime-control.json"), "utf8")) as Record<string, unknown> };
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe("Claude Code turn counting", () => {
  test("sub-agent messages are not the run's turns", async () => {
    const script = [assistant("m1"), ...Array.from({ length: 6 }, (_unused, index) => assistant(`sub${index}`, "toolu_task")), assistant("m2"), result].join("");
    const { outcome, control } = await run(script, 2);
    expect(outcome.supervisionStopCode).toBeUndefined();
    expect(control).toMatchObject({ status: "passed", turns: 2 });
  }, 20_000);

  test("the run's own messages still reach the cap", async () => {
    const script = [assistant("m1"), assistant("sub0", "toolu_task"), assistant("m2"), assistant("m3"), result].join("");
    const { outcome } = await run(script, 2);
    expect(outcome.supervisionStopCode).toBe("turn_limit");
  }, 20_000);
});
