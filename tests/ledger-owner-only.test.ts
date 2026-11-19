import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { ownerOnlyRefusal } from "../src/harness/owner-only.js";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const execFileP = promisify(execFile);

/**
 * #261: "only the owner should run `uh ledger confirm`" was a printed notice. An agent could run it and record
 * `verified_by: owner`. The command is refused in a guarded run (orchestrators included) and in a process with no
 * terminal, and the tool guard denies it to a worker's shell.
 */
describe("uh ledger confirm is the owner's, not an agent's", () => {
  test("a guarded run is refused, whatever its role", () => {
    const refusal = ownerOnlyRefusal({ UH_TOOL_GUARD_POLICY: "/tmp/tool-guard.json" }, ["ledger", "confirm"], true);
    expect(refusal).toMatch(/owner/i);
    expect(refusal).toContain("uh ledger confirm");
  });

  test("a process with no terminal is refused: the owner is at a keyboard", () => {
    expect(ownerOnlyRefusal({}, ["ledger", "confirm"], false)).toMatch(/terminal/i);
  });

  test("the owner at a terminal, outside any worker, is allowed; other commands are untouched", () => {
    expect(ownerOnlyRefusal({}, ["ledger", "confirm"], true)).toBeUndefined();
    expect(ownerOnlyRefusal({ UH_TOOL_GUARD_POLICY: "/tmp/tool-guard.json" }, ["ledger", "list"], false)).toBeUndefined();
    expect(ownerOnlyRefusal({}, ["status"], false)).toBeUndefined();
  });

  test("the CLI refuses it inside a worker and without a terminal", async () => {
    const run = async (env: NodeJS.ProcessEnv) => {
      try {
        const { stdout, stderr } = await execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", "ledger", "confirm", "iv_x", "--root", tmpdir()], { cwd: process.cwd(), env: { ...process.env, ...env } });
        return { code: 0, out: `${stdout}${stderr}` };
      } catch (error) {
        const failure = error as { code?: number; stdout?: string; stderr?: string };
        return { code: failure.code ?? 1, out: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
      }
    };
    const guarded = await run({ UH_TOOL_GUARD_POLICY: "/tmp/tool-guard.json" });
    expect(guarded.code).toBe(2);
    expect(guarded.out).toContain("[BLOCKED]");
    expect(guarded.out).toMatch(/owner/i);
    const piped = await run({ UH_TOOL_GUARD_POLICY: "" });
    expect(piped.code).toBe(2);
    expect(piped.out).toMatch(/terminal/i);
  }, 120_000);

  test("the tool guard denies it to a worker and to an orchestrator alike", () => {
    const policy = resolveToolGuardPolicy({});
    const root = process.platform === "win32" ? "C:\work\checkout" : "/work/checkout";
    for (const allowControllerCommands of [false, true]) {
      expect(decideToolCall(policy, "bash", { command: "uh ledger confirm iv_1" }, root, { allowControllerCommands }).deny?.class).toBe("agent_client");
      expect(decideToolCall(policy, "bash", { command: "node dist/cli.js ledger confirm iv_1" }, root, { allowControllerCommands }).deny?.class).toBe("agent_client");
    }
    expect(decideToolCall(policy, "bash", { command: "uh ledger list" }, root, { allowControllerCommands: true }).deny).toBeUndefined();
  });
});
