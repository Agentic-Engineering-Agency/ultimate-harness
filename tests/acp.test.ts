import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { proposeMission } from "../src/harness/propose.js";
import { checkAcp, planAcpRun, runAcp, AcpClient } from "../src/adapters/acp.js";
import { AcpRuntimeConfigSchema } from "../src/schema/acp.js";

describe("ACP (Agent-Client Protocol) Adapter", () => {
  test("validates schema defaults and server command overrides", () => {
    const parsed = AcpRuntimeConfigSchema.parse({});
    expect(parsed.server_command).toBe("acp-agent");
    expect(parsed.protocol_version).toBe("1.0");
    expect(parsed.timeout_ms).toBe(600_000);

    const custom = AcpRuntimeConfigSchema.parse({
      server_command: "openhands-acp",
      server_args: ["--port", "9000"],
      model: "openhands/gemini",
    });
    expect(custom.server_command).toBe("openhands-acp");
    expect(custom.model).toBe("openhands/gemini");
  });

  test("checkAcp checks protocol version", async () => {
    const result = await checkAcp({ config: { runtime_config: { protocol_version: "2.0" } } });
    expect(result.found).toBe(true);
    expect(result.version).toBe("2.0");
  });

  test("runs end-to-end mission through mock ACP JSON-RPC client", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-test-acp-"));
    try {
      await initializeHarness(root);
      await addAdapter(root, "acp");
      const { execFileSync } = await import("node:child_process");
      execFileSync("git", ["init", "--quiet"], { cwd: root });
      await writeFile(path.join(root, "input.txt"), "hello acp");
      execFileSync("git", ["add", "--all"], { cwd: root });
      execFileSync("git", ["-c", "user.name=UH Test", "-c", "user.email=test@example.com", "commit", "--quiet", "-m", "init"], { cwd: root });
      const proposeResult = await proposeMission(root, {
        id: "acp-demo",
        title: "ACP Demo Mission",
        objective: "Perform task through ACP",
        workflow: "research-docs",
        expectedOutputs: ["output.txt"],
        completionCriteria: ["output exists"],
      });
      const missionPath = typeof proposeResult === "string" ? proposeResult : proposeResult.path;

      // Mock ACP Client responding to initialize, session/new, session/prompt
      class MockAcpClient extends AcpClient {
        constructor() {
          super("mock", [], root);
        }
        override async start(): Promise<void> {}
        override async stop(): Promise<void> {}
        override async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
          if (method === "initialize") {
            return {
              protocol_version: "1.0",
              agent_info: { name: "mock-agent", version: "1.0.0", model: "acp-model-1" },
            } as unknown as T;
          }
          if (method === "session/new") {
            return { session_id: "sess-12345" } as unknown as T;
          }
          if (method === "session/prompt") {
            // simulate writing output file in root
            await writeFile(path.join(root, "output.txt"), "acp success output");
            return {
              stop_reason: "end_turn",
              final_text: "Task finished successfully",
              usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
            } as unknown as T;
          }
          throw new Error(`Unknown method: ${method}`);
        }
      }

      const outcome = await runAcp(root, missionPath, {
        clientFactory: () => new MockAcpClient(),
      });

      expect(outcome.result.status).toBe("passed");
      expect(outcome.result.runtime).toBe("acp");
      expect(outcome.result.output).toBe("Task finished successfully");
      expect(outcome.result.usage).toEqual({ input_tokens: 50, output_tokens: 20, total_tokens: 70 });
      expect(outcome.result.diff).toContain("output.txt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("handles ACP server error gracefully without unhandled crashes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-test-acp-err-"));
    try {
      await initializeHarness(root);
      await addAdapter(root, "acp");
      const proposeResult = await proposeMission(root, {
        id: "acp-err",
        title: "ACP Error Mission",
        objective: "Fail cleanly",
        workflow: "research-docs",
      });
      const missionPath = typeof proposeResult === "string" ? proposeResult : proposeResult.path;

      class FailingAcpClient extends AcpClient {
        constructor() { super("mock-fail", [], root); }
        override async start(): Promise<void> {}
        override async stop(): Promise<void> {}
        override async request<T = unknown>(method: string): Promise<T> {
          if (method === "initialize") {
            throw new Error("Connection refused by ACP agent server");
          }
          throw new Error("unexpected call");
        }
      }

      const outcome = await runAcp(root, missionPath, {
        clientFactory: () => new FailingAcpClient(),
      });

      expect(outcome.result.status).toBe("failed");
      expect(outcome.result.errors[0]).toContain("Connection refused by ACP agent server");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
