import { test, expect, describe, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AnthropicRuntimeConfigSchema,
  ANTHROPIC_API_KEY_ENV,
  ANTHROPIC_VERSION,
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  anthropicRuntimeChecker,
  planAnthropicRun,
  defaultAnthropicRunner,
  parseAnthropicResponse,
  extractMessageText,
} from "../src/adapters/anthropic.js";
import { usageFromAnthropic } from "../src/harness/usage.js";
import { initializeHarness } from "../src/harness/init.js";

// ---------- env management ----------
// The adapter reads ANTHROPIC_API_KEY from the environment. Snapshot + restore
// so tests don't leak into each other (or the dev's real key into assertions).
let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env[ANTHROPIC_API_KEY_ENV];
  delete process.env[ANTHROPIC_API_KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[ANTHROPIC_API_KEY_ENV];
  else process.env[ANTHROPIC_API_KEY_ENV] = savedKey;
});

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bad addr");
      resolve({ port: addr.port, close: () => new Promise<void>((res) => server.close(() => res())) });
    });
  });
}

function makeManifest(baseUrl: string) {
  return {
    schema_version: "uh.adapter.v0" as const,
    id: "anthropic",
    name: "Anthropic",
    description: "",
    runtime: "anthropic",
    capabilities: [],
    status: "experimental" as const,
    config: {
      cli_command: undefined,
      default_toolsets: [],
      default_provider: "",
      default_model: "",
      worktree_mode: false,
      pass_session_id: false,
      runtime_config: { base_url: baseUrl, model: DEFAULT_ANTHROPIC_MODEL, max_tokens: 8192, request_timeout_ms: 120_000, extra_headers: {} },
    },
  };
}

describe("anthropic schema", () => {
  test("defaults base_url, model, max_tokens, timeout", () => {
    const parsed = AnthropicRuntimeConfigSchema.parse({});
    expect(parsed.base_url).toBe(DEFAULT_ANTHROPIC_BASE_URL);
    expect(parsed.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(parsed.max_tokens).toBe(DEFAULT_ANTHROPIC_MAX_TOKENS);
    expect(parsed.request_timeout_ms).toBe(120_000);
    expect(parsed.extra_headers).toEqual({});
  });

  test("rejects unknown keys (typo safety)", () => {
    expect(() => AnthropicRuntimeConfigSchema.parse({ model: "x", provider: "nous" })).toThrow();
    expect(() => AnthropicRuntimeConfigSchema.parse({ model: "x", endpoint: "https://x" })).toThrow();
  });

  test("accepts an overridden model + max_tokens", () => {
    const parsed = AnthropicRuntimeConfigSchema.parse({ model: "claude-haiku-4-6", max_tokens: 1024 });
    expect(parsed.model).toBe("claude-haiku-4-6");
    expect(parsed.max_tokens).toBe(1024);
  });
});

describe("usageFromAnthropic", () => {
  test("maps input_tokens/output_tokens to RuntimeUsage", () => {
    const usage = usageFromAnthropic({ input_tokens: 100, output_tokens: 42 }, "claude-sonnet-4-6");
    expect(usage).not.toBeNull();
    expect(usage!.input_tokens).toBe(100);
    expect(usage!.output_tokens).toBe(42);
    expect(usage!.total_tokens).toBe(142);
    expect(usage!.source).toBe("runtime");
    expect(usage!.model).toBe("claude-sonnet-4-6");
  });

  test("returns null on absent/empty shapes", () => {
    expect(usageFromAnthropic(undefined)).toBeNull();
    expect(usageFromAnthropic({})).toBeNull();
    // OpenAI-style keys are NOT Anthropic keys → null.
    expect(usageFromAnthropic({ prompt_tokens: 5, completion_tokens: 6 })).toBeNull();
  });
});

describe("extractMessageText / parseAnthropicResponse", () => {
  test("concatenates text content blocks, ignores non-text", () => {
    const text = extractMessageText({
      content: [
        { type: "text", text: "Hello " },
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "world" },
      ],
    });
    expect(text).toBe("Hello world");
  });

  test("parseAnthropicResponse surfaces content + usage + stop_reason", () => {
    const body = JSON.stringify({
      id: "msg_1",
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Done." }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    const out = parseAnthropicResponse(body);
    expect(out.content).toBe("Done.");
    expect(out.stopReason).toBe("end_turn");
    expect(out.errorEnvelope).toBeNull();
    expect(usageFromAnthropic(out.usage)).not.toBeNull();
  });

  test("parseAnthropicResponse surfaces an error envelope", () => {
    const body = JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    const out = parseAnthropicResponse(body);
    expect(out.content).toBe("");
    expect(out.errorEnvelope?.message).toMatch(/invalid x-api-key/);
    expect(out.errorEnvelope?.type).toBe("authentication_error");
  });
});

describe("anthropic runtime checker", () => {
  test("no ANTHROPIC_API_KEY → found:false with a CI-skip signal", async () => {
    const result = await anthropicRuntimeChecker(makeManifest(DEFAULT_ANTHROPIC_BASE_URL), process.cwd());
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/ANTHROPIC_API_KEY not set/);
  });

  test("200 with models list (key set) → found + count + headers sent", async () => {
    process.env[ANTHROPIC_API_KEY_ENV] = "sk-ant-test";
    const server = await startServer((req, res) => {
      expect(req.url).toBe("/models");
      expect(req.headers["x-api-key"]).toBe("sk-ant-test");
      expect(req.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "claude-sonnet-4-6" }, { id: "claude-haiku-4-6" }] }));
    });
    const result = await anthropicRuntimeChecker(makeManifest(`http://127.0.0.1:${server.port}`), process.cwd());
    expect(result.found).toBe(true);
    expect(result.version).toMatch(/anthropic reachable/);
    expect(result.version).toMatch(/2 models available/);
    await server.close();
  });

  test("401 (key set) → found:false with check-key hint", async () => {
    process.env[ANTHROPIC_API_KEY_ENV] = "sk-ant-bad";
    const server = await startServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    });
    const result = await anthropicRuntimeChecker(makeManifest(`http://127.0.0.1:${server.port}`), process.cwd());
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/HTTP 401/);
    expect(result.errors[0]).toMatch(/ANTHROPIC_API_KEY/);
    await server.close();
  });
});

const TEST_ROOT = "/tmp/uh-test-anthropic";

async function setupHarness(): Promise<{ missionPath: string }> {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "anthropic.yaml"),
    `schema_version: uh.adapter.v0
id: anthropic
name: Anthropic
runtime: anthropic
capabilities: []
status: experimental
config:
  runtime_config:
    base_url: "https://api.anthropic.com/v1"
    model: "claude-sonnet-4-6"
    max_tokens: 8192
`,
    "utf-8",
  );
  const missionDir = join(TEST_ROOT, ".harness", "missions", "test-anthropic");
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: test-anthropic
title: anthropic test
workflow_profile: research-docs
objective: ""
`,
    "utf-8",
  );
  return { missionPath };
}

describe("planAnthropicRun", () => {
  test("with key → x-api-key + anthropic-version headers + Messages body", async () => {
    process.env[ANTHROPIC_API_KEY_ENV] = "sk-ant-plan";
    const { missionPath } = await setupHarness();
    const plan = await planAnthropicRun(TEST_ROOT, missionPath);
    expect(plan.command).toBe("POST https://api.anthropic.com/v1/messages");
    expect(plan.body.model).toBe("claude-sonnet-4-6");
    expect(plan.body.max_tokens).toBe(8192);
    expect(plan.headers["x-api-key"]).toBe("sk-ant-plan");
    expect(plan.headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(plan.headers["content-type"]).toBe("application/json");
    expect(plan.body.messages[0].role).toBe("user");
    expect(plan.body.messages[0].content).toContain("uh-runtime-final-message");
    expect(plan.errors).toEqual([]);
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  test("without key → plan surfaces a fail-fast error", async () => {
    const { missionPath } = await setupHarness();
    const plan = await planAnthropicRun(TEST_ROOT, missionPath);
    expect(plan.errors.some((e) => /ANTHROPIC_API_KEY not set/.test(e))).toBe(true);
    await rm(TEST_ROOT, { recursive: true, force: true });
  });
});

describe("defaultAnthropicRunner", () => {
  test("happy path: 200 + content + sentinel + usage", async () => {
    const sentinel = "```uh-runtime-final-message\nMission complete.\n```";
    const server = await startServer((req, res) => {
      expect(req.url).toBe("/messages");
      expect(req.method).toBe("POST");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "msg_1",
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: `Done. ${sentinel}` }],
        usage: { input_tokens: 12, output_tokens: 5 },
      }));
    });
    const out = await defaultAnthropicRunner({
      baseUrl: `http://127.0.0.1:${server.port}`,
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-run", "anthropic-version": ANTHROPIC_VERSION },
      body: { model: "claude-sonnet-4-6", max_tokens: 8192, messages: [{ role: "user", content: "hi" }] },
      cwd: "/tmp",
      timeoutMs: 5_000,
    });
    expect(out.httpStatus).toBe(200);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("Done.");
    expect(out.stdout).toContain("Mission complete.");
    expect(out.stopReason).toBe("end_turn");
    expect(usageFromAnthropic(out.usage, out.usageModel)).not.toBeNull();
    await server.close();
  });

  test("401 → exitCode 1 + error envelope captured", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    });
    const out = await defaultAnthropicRunner({
      baseUrl: `http://127.0.0.1:${server.port}`,
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-bad", "anthropic-version": ANTHROPIC_VERSION },
      body: { model: "claude-sonnet-4-6", max_tokens: 8192, messages: [{ role: "user", content: "hi" }] },
      cwd: "/tmp",
      timeoutMs: 5_000,
    });
    expect(out.httpStatus).toBe(401);
    expect(out.exitCode).toBe(1);
    expect(out.errorEnvelope?.message).toMatch(/invalid x-api-key/);
    await server.close();
  });
});
