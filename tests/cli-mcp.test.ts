import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeHarness } from "../src/harness/init.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-cli-mcp-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) {
    await rm(TEST_ROOT, { recursive: true, force: true });
  }
});

interface McpRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function withResolvers<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runUhMcp(args: string[], inputMessages: unknown[]): Promise<McpRunResult> {
  const { promise, resolve, reject } = withResolvers<McpRunResult>();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...args],
    { cwd: process.cwd() },
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });

  child.on("error", reject);
  child.on("close", (code, signal) => {
    resolve({ code, signal, stdout, stderr });
  });

  for (const msg of inputMessages) {
    const line = typeof msg === "string" ? msg : JSON.stringify(msg);
    child.stdin.write(line + "\n");
  }
  child.stdin.end();
  return promise;
}

describe("uh mcp serve CLI", () => {
  test("serves JSON-RPC protocol over stdin/stdout and exits 0 on stdin close", async () => {
    const discoverRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
    };
    const toolsListRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    };

    const result = await runUhMcp(
      ["mcp", "serve", "--root", TEST_ROOT],
      [discoverRequest, toolsListRequest],
    );

    expect(result.code).toBe(0);

    const lines = result.stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(lines.length).toBe(2);

    // Assert that every stdout line parses as JSON-RPC
    const parsedResponses = lines.map((line) => {
      const parsed = JSON.parse(line) as {
        jsonrpc: string;
        id: number;
        result?: Record<string, unknown>;
        error?: Record<string, unknown>;
      };
      expect(parsed.jsonrpc).toBe("2.0");
      return parsed;
    });

    // Assert the two responses match their ids
    expect(parsedResponses[0].id).toBe(1);
    expect(parsedResponses[1].id).toBe(2);

    // Assert the tool names are exactly uh_status, uh_runs, uh_run in that order
    const tools = (parsedResponses[1].result?.tools ?? []) as Array<{ name: string }>;
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toEqual(["uh_status", "uh_runs", "uh_run"]);

    // Assert stdout contains no absolute path of the temporary project
    expect(result.stdout).not.toContain(TEST_ROOT);
    expect(result.stdout).not.toContain(TEST_ROOT.replace(/\\/g, "/"));
  }, 30_000);

  test("handles uh_status tool call and returns valid protocol message without leaking project root", async () => {
    const callRequest = {
      jsonrpc: "2.0",
      id: "status-call-42",
      method: "tools/call",
      params: {
        name: "uh_status",
        arguments: {},
      },
    };

    const result = await runUhMcp(
      ["mcp", "serve", "--root", TEST_ROOT],
      [callRequest],
    );

    expect(result.code).toBe(0);
    const lines = result.stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]) as {
      jsonrpc: string;
      id: string;
      result?: { content: Array<{ type: string; text: string }> };
    };
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBe("status-call-42");
    expect(parsed.result).toBeDefined();

    // Verify stdout contains no absolute path
    expect(result.stdout).not.toContain(TEST_ROOT);
    expect(result.stdout).not.toContain(TEST_ROOT.replace(/\\/g, "/"));
  }, 30_000);

  test("returns JSON-RPC parse error on malformed input without writing banners or non-protocol output to stdout", async () => {
    const result = await runUhMcp(
      ["mcp", "serve", "--root", TEST_ROOT],
      ["NOT VALID JSON"],
    );

    expect(result.code).toBe(0);
    const lines = result.stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]) as {
      jsonrpc: string;
      id: unknown;
      error?: { code: number; message: string };
    };
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBeNull();
    expect(parsed.error?.code).toBe(-32700);
  }, 30_000);
});
