import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { proposeMission } from "../src/harness/propose.js";
import { AcpClient, checkAcp, extractAcpAgentText, planAcpRun, runAcp, type AcpClientOptions } from "../src/adapters/acp.js";
import { AcpRuntimeConfigSchema, AcpSessionPromptResultSchema } from "../src/schema/acp.js";
import { validateRuntimeResult } from "../src/schema/artifacts.js";

/** A transport-less client: `start`/`stop`/`writeMessage` are local, no process. */
class SilentAgentClient extends AcpClient {
  public sent: Record<string, unknown>[] = [];
  override async start(): Promise<void> {
    this.connected = true;
    if (this.cancellationSignal) {
      this.abortListener = () => {
        this.rejectAll(new Error("ACP client cancelled"));
      };
      if (this.cancellationSignal.aborted) this.abortListener();
      else this.cancellationSignal.addEventListener("abort", this.abortListener, { once: true });
    }
  }
  override async stop(): Promise<void> {
    await super.stop();
  }
  protected override writeMessage(message: Record<string, unknown>): void {
    this.sent.push(message);
  }
}

/**
 * A full ACP v1 wire fake. It drives the real `AcpClient` request path
 * (framing + correlation) and answers in camelCase, so tests exercise the code
 * — not a bypassing mock.
 */
class FakeAgentClient extends AcpClient {
  public sent: Record<string, unknown>[] = [];
  public finalText = "acp success output";
  public stopReason = "end_turn";
  constructor(private onPrompt: () => void | Promise<void>, options: AcpClientOptions) {
    super("node", [], process.cwd(), process.env, options);
  }
  override async start(): Promise<void> {
    this.connected = true;
  }
  override async stop(): Promise<void> {
    this.connected = false;
  }
  protected override writeMessage(message: Record<string, unknown>): void {
    this.sent.push(message);
    const id = message.id as number;
    if (message.method === "initialize") {
      this.respond(id, { protocolVersion: 1, agentInfo: { name: "fake-agent", version: "9.9.9" } });
    } else if (message.method === "session/new") {
      this.respond(id, { sessionId: "sess-123" });
    } else if (message.method === "session/prompt") {
      void Promise.resolve(this.onPrompt()).then(() => {
        this.handleChunk(`${JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: this.finalText } } },
        })}\n`);
        this.handleChunk(`${JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { stopReason: this.stopReason, usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 } },
        })}\n`);
      });
    }
  }
  private respond(id: number, result: unknown): void {
    this.handleChunk(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }
}

async function missionFixture(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  await initializeHarness(root);
  await addAdapter(root, "acp");
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
  return { root, missionPath };
}

describe("ACP (Agent-Client Protocol) schema", () => {
  test("defaults an integer protocol version and a bounded timeout", () => {
    const parsed = AcpRuntimeConfigSchema.parse({});
    expect(parsed.server_command).toBe("acp-agent");
    expect(parsed.protocol_version).toBe(1);
    expect(parsed.timeout_ms).toBe(600_000);
  });

  test("rejects unknown runtime_config keys and a string protocol version", () => {
    expect(() => AcpRuntimeConfigSchema.parse({ server_arg: ["--x"] })).toThrow();
    expect(() => AcpRuntimeConfigSchema.parse({ protocol_version: "1.0" })).toThrow();
  });

  test("ACP prompt stop reasons match the v1 enum", () => {
    expect(AcpSessionPromptResultSchema.parse({ stopReason: "max_tokens" }).stopReason).toBe("max_tokens");
    expect(AcpSessionPromptResultSchema.parse({}).stopReason).toBe("end_turn");
    expect(() => AcpSessionPromptResultSchema.parse({ stopReason: "max_turns" })).toThrow();
  });
});

describe("AcpClient JSON-RPC framing and lifecycle", () => {
  test("reassembles a response split across partial-buffer writes", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    await client.start();
    const pending = client.request("initialize", {});
    client.handleChunk('{"jsonrpc":"2.0","id":1,"res');
    client.handleChunk('ult":{"ok":true}}\n');
    await expect(pending).resolves.toEqual({ ok: true });
  });

  test("maps a JSON-RPC error response to a rejected request", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    await client.start();
    const pending = client.request("session/prompt");
    client.handleChunk(`${JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "boom" } })}\n`);
    await expect(pending).rejects.toThrow("ACP error -32000: boom");
  });

  test("dispatches inbound notifications with their params", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    const seen: Array<[string, Record<string, unknown>]> = [];
    client.onNotification((method, params) => seen.push([method, params]));
    await client.start();
    client.handleChunk(`${JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "x" } } })}\n`);
    expect(seen).toEqual([["session/update", { update: { sessionUpdate: "x" } }]]);
  });

  test("answers agent→client requests so the agent never hangs", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    await client.start();
    client.handleChunk(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 77,
      method: "session/request_permission",
      params: { options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "deny", kind: "reject_once" }] },
    })}\n`);
    expect(client.sent).toContainEqual({
      jsonrpc: "2.0",
      id: 77,
      result: { outcome: { outcome: "selected", optionId: "allow" } },
    });
  });

  test("replies -32601 to unsupported agent→client requests", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    await client.start();
    client.handleChunk(`${JSON.stringify({ jsonrpc: "2.0", id: 88, method: "fs/read_text_file", params: { path: "x" } })}\n`);
    expect(client.sent).toContainEqual({
      jsonrpc: "2.0",
      id: 88,
      error: { code: -32601, message: "Method not found: fs/read_text_file" },
    });
  });

  test("rejects a request that exceeds the per-request timeout", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 25 });
    await client.start();
    await expect(client.request("initialize")).rejects.toThrow(/timed out after 25ms/);
  });

  test("rejects pending requests when the cancellation signal aborts", async () => {
    const controller = new AbortController();
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, {
      timeoutMs: 1_000,
      cancellationSignal: controller.signal,
    });
    await client.start();
    const pending = client.request("initialize");
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelled/);
  });

  test("rejects pending requests when the client stops", async () => {
    const client = new SilentAgentClient("node", [], process.cwd(), process.env, { timeoutMs: 1_000 });
    await client.start();
    const pending = client.request("initialize");
    await client.stop();
    await expect(pending).rejects.toThrow(/stopped/);
  });

  test("extractAcpAgentText only reads agent_message_chunk text blocks", () => {
    expect(extractAcpAgentText({ update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } } })).toBe("hi");
    expect(extractAcpAgentText({ update: { sessionUpdate: "tool_call", content: { text: "ignore" } } })).toBe("");
  });
});

describe("checkAcp", () => {
  test("reports not-found for an unrunnable server and for invalid config", async () => {
    const missing = await checkAcp({ config: { cli_command: "definitely-not-a-real-acp-binary-xyz", runtime_config: {} } });
    expect(missing.found).toBe(false);
    expect(missing.errors[0]).toMatch(/could not be executed/);

    const invalid = await checkAcp({ config: { runtime_config: { bogus_key: true } } });
    expect(invalid.found).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});

describe("ACP adapter run", () => {
  test("records run-id, evidence artifacts, and a validating runs-index entry", async () => {
    const { root, missionPath } = await missionFixture("uh-test-acp-");
    const runId = "20260101T000000Z-acp001";
    try {
      const outcome = await runAcp(root, missionPath, {
        runId,
        clientFactory: (_command, _args, _cwd, options) =>
          new FakeAgentClient(async () => {
            await writeFile(path.join(root, "output.txt"), "acp success output");
          }, options),
      });

      // Run-id integrity: the reported id is the on-disk run dir.
      expect(outcome.runId).toBe(runId);
      const runDir = path.join(root, ".harness", "missions", "acp-demo", "runs", runId);
      const persisted = parse(await readFile(path.join(runDir, "runtime-result.yaml"), "utf8"));
      expect(() => validateRuntimeResult(persisted)).not.toThrow();
      expect(outcome.result).toMatchObject({ runtime: "acp", status: "passed", exit_code: 0 });
      expect(outcome.result.usage).toMatchObject({ source: "runtime", input_tokens: 50, output_tokens: 20, total_tokens: 70 });

      // Evidence artifacts.
      expect(await readFile(path.join(runDir, "runtime-final.txt"), "utf8")).toBe("acp success output");
      expect(await readFile(path.join(runDir, "diff.patch"), "utf8")).toContain("output.txt");
      await expect(readFile(path.join(runDir, "runtime.stdout.log"), "utf8")).resolves.toBeTypeOf("string");
      await expect(readFile(path.join(runDir, "runtime.stderr.log"), "utf8")).resolves.toBeTypeOf("string");
      const session = parse(await readFile(path.join(runDir, "runtime-session.yaml"), "utf8")) as Record<string, unknown>;
      expect(session).toMatchObject({ status: "succeeded", runtime: "acp" });

      // runs/index.json entry so the run is not an orphaned run dir.
      const index = JSON.parse(await readFile(path.join(root, ".harness", "missions", "acp-demo", "runs", "index.json"), "utf8")) as {
        runs: Array<Record<string, unknown>>;
      };
      expect(index.runs.find((entry) => entry.run_id === runId)).toMatchObject({ status: "passed", runtime: "acp" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("speaks the ACP v1 camelCase wire format", async () => {
    const { root, missionPath } = await missionFixture("uh-test-acp-wire-");
    try {
      let client: FakeAgentClient | undefined;
      await runAcp(root, missionPath, {
        runId: "20260101T000000Z-acp002",
        collectDiff: async () => ({ patch: "" }),
        clientFactory: (_command, _args, _cwd, options) => {
          client = new FakeAgentClient(() => {}, options);
          return client;
        },
      });
      const initialize = client!.sent.find((message) => message.method === "initialize");
      expect(initialize?.params).toMatchObject({ protocolVersion: 1, clientCapabilities: {} });
      expect((initialize?.params as Record<string, unknown>).protocol_version).toBeUndefined();

      const sessionNew = client!.sent.find((message) => message.method === "session/new");
      expect(sessionNew?.params).toMatchObject({ mcpServers: [] });

      const prompt = client!.sent.find((message) => message.method === "session/prompt");
      const promptParams = prompt?.params as { sessionId: string; prompt: unknown[] };
      expect(promptParams.sessionId).toBe("sess-123");
      expect(Array.isArray(promptParams.prompt)).toBe(true);
      expect((promptParams.prompt[0] as Record<string, unknown>).type).toBe("text");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails cleanly when the ACP server cannot be reached", async () => {
    const { root, missionPath } = await missionFixture("uh-test-acp-err-");
    try {
      class FailingAgentClient extends AcpClient {
        override async start(): Promise<void> {
          this.connected = true;
        }
        override async stop(): Promise<void> {
          this.connected = false;
        }
        override async request<T>(method: string): Promise<T> {
          if (method === "initialize") throw new Error("Connection refused by ACP agent server");
          throw new Error("unexpected call");
        }
      }
      const outcome = await runAcp(root, missionPath, {
        runId: "20260101T000000Z-acp003",
        collectDiff: async () => ({ patch: "" }),
        clientFactory: () => new FailingAgentClient("node", [], root),
      });
      expect(outcome.result.status).toBe("failed");
      expect(outcome.result.errors[0]).toContain("Connection refused by ACP agent server");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("planAcpRun validates the workflow and returns a plan", async () => {
    const { root, missionPath } = await missionFixture("uh-test-acp-plan-");
    try {
      const plan = await planAcpRun(root, missionPath);
      expect(plan.command).toBe("acp-agent");
      expect(plan.config.protocol_version).toBe(1);
      expect(plan.prompt.length).toBeGreaterThan(0);
      expect(plan.worktree).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
