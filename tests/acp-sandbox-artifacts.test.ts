import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { proposeMission } from "../src/harness/propose.js";
import { AcpClient, runAcp, type AcpClientOptions } from "../src/adapters/acp.js";
import { validateRuntimeResult } from "../src/schema/artifacts.js";

/**
 * An in-process ACP v1 wire fake (the `FakeAgentClient` pattern from
 * tests/acp.test.ts): it answers `initialize`, `session/new` and
 * `session/prompt` on the real `AcpClient` request path, so the adapter's
 * artifact/session/new wiring is exercised without a child process.
 */
class SandboxAgentClient extends AcpClient {
  public sent: Record<string, unknown>[] = [];
  constructor(options: AcpClientOptions) {
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
      this.respond(id, { sessionId: "sess-sandbox" });
    } else if (message.method === "session/prompt") {
      this.handleChunk(`${JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "sandbox done" } } },
      })}\n`);
      this.handleChunk(`${JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: { stopReason: "end_turn", usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } },
      })}\n`);
    }
  }
  private respond(id: number, result: unknown): void {
    this.handleChunk(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }
}

/** Init a harness, add the acp adapter and propose the `acp-demo` mission. */
async function harnessRootWithMission(prefix: string) {
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

describe("ACP sandbox artifact routing", () => {
  test("a routed run persists every artifact under the canonical root, not the sandbox", async () => {
    const project = await harnessRootWithMission("uh-acp-sandbox-project-");
    const sandbox = await harnessRootWithMission("uh-acp-sandbox-work-");
    const runId = "20260101T000000Z-sbx001";
    try {
      let client: SandboxAgentClient | undefined;
      const outcome = await runAcp(sandbox.root, sandbox.missionPath, {
        runId,
        artifactRoot: project.root,
        collectDiff: async () => ({ patch: "" }),
        clientFactory: (_command, _args, _cwd, options) => {
          client = new SandboxAgentClient(options);
          return client;
        },
      });

      expect(outcome.runId).toBe(runId);

      // Every core artifact lands in the canonical project root's run dir.
      const runDir = path.join(project.root, ".harness", "missions", "acp-demo", "runs", runId);
      const result = validateRuntimeResult(parse(await readFile(path.join(runDir, "runtime-result.yaml"), "utf8")));
      expect(result.status).toBe("passed");
      expect(await readFile(path.join(runDir, "runtime-final.txt"), "utf8")).toBe("sandbox done");
      await expect(readFile(path.join(runDir, "events.ndjson"), "utf8")).resolves.toContain("runtime.finished");
      await expect(readFile(path.join(runDir, "prompt.md"), "utf8")).resolves.toBeTypeOf("string");

      // The sandbox worktree stays artifact-free.
      const sandboxRuns = path.join(sandbox.root, ".harness", "missions", "acp-demo", "runs");
      expect(await pathExists(sandboxRuns)).toBe(false);

      // The agent still works against the sandbox: session/new cwd is the sandbox root.
      const sessionNew = client!.sent.find((message) => message.method === "session/new");
      expect((sessionNew!.params as Record<string, unknown>).cwd).toBe(sandbox.root);
    } finally {
      await rm(project.root, { recursive: true, force: true });
      await rm(sandbox.root, { recursive: true, force: true });
    }
  });

  test("an un-routed run still writes under its own root", async () => {
    const { root, missionPath } = await harnessRootWithMission("uh-acp-unrouted-");
    const runId = "20260101T000000Z-unrouted001";
    try {
      const outcome = await runAcp(root, missionPath, {
        runId,
        collectDiff: async () => ({ patch: "" }),
        clientFactory: (_command, _args, _cwd, options) => new SandboxAgentClient(options),
      });

      expect(outcome.runId).toBe(runId);
      const runDir = path.join(root, ".harness", "missions", "acp-demo", "runs", runId);
      const result = validateRuntimeResult(parse(await readFile(path.join(runDir, "runtime-result.yaml"), "utf8")));
      expect(result.status).toBe("passed");
      await expect(readFile(path.join(runDir, "prompt.md"), "utf8")).resolves.toBeTypeOf("string");
      await expect(readFile(path.join(runDir, "events.ndjson"), "utf8")).resolves.toContain("runtime.finished");
      await expect(readFile(path.join(runDir, "runtime-final.txt"), "utf8")).resolves.toBe("sandbox done");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
