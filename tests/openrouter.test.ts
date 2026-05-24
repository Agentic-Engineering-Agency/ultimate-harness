import { test, expect, describe, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  OpenRouterRuntimeConfigSchema,
  OPENROUTER_API_KEY_ENV,
  DEFAULT_OPENROUTER_ENDPOINT,
  openRouterRuntimeChecker,
  planOpenRouterRun,
  defaultOpenRouterRunner,
  parseOpenRouterStream,
} from "../src/adapters/openrouter.js";
import { initializeHarness } from "../src/harness/init.js";

// ---------- env management ----------
// The adapter reads OPENROUTER_API_KEY from the environment. Snapshot + restore
// so tests don't leak into each other (or the dev's real key into assertions).
let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env[OPENROUTER_API_KEY_ENV];
  delete process.env[OPENROUTER_API_KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[OPENROUTER_API_KEY_ENV];
  else process.env[OPENROUTER_API_KEY_ENV] = savedKey;
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

function makeManifest(endpoint: string) {
  return {
    schema_version: "uh.adapter.v0" as const,
    id: "openrouter",
    name: "OpenRouter",
    description: "",
    runtime: "openrouter",
    capabilities: [],
    status: "active" as const,
    config: {
      cli_command: undefined,
      default_toolsets: [],
      default_provider: "",
      default_model: "",
      worktree_mode: false,
      pass_session_id: false,
      runtime_config: { endpoint, model: "openai/gpt-4o-mini", request_timeout_ms: 120_000, extra_headers: {} },
    },
  };
}

describe("openrouter schema", () => {
  test("defaults endpoint to the public OpenRouter base URL", () => {
    const parsed = OpenRouterRuntimeConfigSchema.parse({ model: "openai/gpt-4o-mini" });
    expect(parsed.endpoint).toBe(DEFAULT_OPENROUTER_ENDPOINT);
    expect(parsed.request_timeout_ms).toBe(120_000);
    expect(parsed.extra_headers).toEqual({});
  });

  test("requires model and rejects unknown keys (typo safety)", () => {
    expect(() => OpenRouterRuntimeConfigSchema.parse({})).toThrow();
    expect(() => OpenRouterRuntimeConfigSchema.parse({ model: "x", provider: "nous" })).toThrow();
  });

  test("accepts optional referer/title ranking headers", () => {
    const parsed = OpenRouterRuntimeConfigSchema.parse({
      model: "openai/gpt-4o-mini",
      referer: "https://agenticengineering.lat",
      title: "Ultimate Harness",
    });
    expect(parsed.referer).toBe("https://agenticengineering.lat");
    expect(parsed.title).toBe("Ultimate Harness");
  });
});

describe("openrouter runtime checker", () => {
  test("no OPENROUTER_API_KEY → found:false with a CI-skip signal", async () => {
    const result = await openRouterRuntimeChecker(makeManifest(DEFAULT_OPENROUTER_ENDPOINT), process.cwd());
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/OPENROUTER_API_KEY not set/);
  });

  test("200 with models list (key set) → found + count + bearer sent", async () => {
    process.env[OPENROUTER_API_KEY_ENV] = "sk-or-test";
    const server = await startServer((req, res) => {
      expect(req.url).toBe("/models");
      expect(req.headers.authorization).toBe("Bearer sk-or-test");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }));
    });
    const result = await openRouterRuntimeChecker(makeManifest(`http://127.0.0.1:${server.port}`), process.cwd());
    expect(result.found).toBe(true);
    expect(result.version).toMatch(/openrouter reachable/);
    expect(result.version).toMatch(/2 models available/);
    await server.close();
  });

  test("401 (key set) → found:false with check-key hint", async () => {
    process.env[OPENROUTER_API_KEY_ENV] = "sk-or-bad";
    const server = await startServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "No auth credentials found" } }));
    });
    const result = await openRouterRuntimeChecker(makeManifest(`http://127.0.0.1:${server.port}`), process.cwd());
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/HTTP 401/);
    expect(result.errors[0]).toMatch(/OPENROUTER_API_KEY/);
    await server.close();
  });
});

const TEST_ROOT = "/tmp/uh-test-openrouter";

async function setupHarness(): Promise<{ missionPath: string }> {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "openrouter.yaml"),
    `schema_version: uh.adapter.v0
id: openrouter
name: OpenRouter
runtime: openrouter
capabilities: []
status: active
config:
  runtime_config:
    endpoint: "https://openrouter.ai/api/v1"
    model: "openai/gpt-4o-mini"
    referer: "https://agenticengineering.lat"
    title: "Ultimate Harness"
`,
    "utf-8",
  );
  const missionDir = join(TEST_ROOT, ".harness", "missions", "test-or");
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: test-or
title: openrouter test
workflow_profile: research-docs
objective: ""
`,
    "utf-8",
  );
  return { missionPath };
}

describe("planOpenRouterRun", () => {
  test("with key → real bearer + referer/title headers + OpenAI-compat body", async () => {
    process.env[OPENROUTER_API_KEY_ENV] = "sk-or-plan";
    const { missionPath } = await setupHarness();
    const plan = await planOpenRouterRun(TEST_ROOT, missionPath);
    expect(plan.command).toBe("POST https://openrouter.ai/api/v1/chat/completions");
    expect(plan.body.model).toBe("openai/gpt-4o-mini");
    expect(plan.body.stream).toBe(true);
    expect(plan.headers.authorization).toBe("Bearer sk-or-plan");
    expect(plan.headers["http-referer"]).toBe("https://agenticengineering.lat");
    expect(plan.headers["x-title"]).toBe("Ultimate Harness");
    expect(plan.body.messages[0].content).toContain("uh-runtime-final-message");
    expect(plan.errors).toEqual([]);
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  test("without key → plan surfaces a fail-fast error", async () => {
    const { missionPath } = await setupHarness();
    const plan = await planOpenRouterRun(TEST_ROOT, missionPath);
    expect(plan.errors.some((e) => /OPENROUTER_API_KEY not set/.test(e))).toBe(true);
    await rm(TEST_ROOT, { recursive: true, force: true });
  });
});

describe("parseOpenRouterStream", () => {
  test("concatenates delta content and stops at [DONE]", () => {
    const buffer =
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello " } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "world" } }] })}\n\n` +
      `data: [DONE]\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ignored" } }] })}\n\n`;
    const out = parseOpenRouterStream(buffer);
    expect(out.content).toBe("Hello world");
    expect(out.errorEnvelope).toBeNull();
  });
});

describe("defaultOpenRouterRunner", () => {
  test("happy SSE path: 200 + content + sentinel", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const sentinel = "```uh-runtime-final-message\nMission complete.\n```";
      for (const c of [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Done. " } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: sentinel } }] })}\n\n`,
        `data: [DONE]\n\n`,
      ]) res.write(c);
      res.end();
    });
    const out = await defaultOpenRouterRunner({
      endpoint: `http://127.0.0.1:${server.port}`,
      headers: { "content-type": "application/json", authorization: "Bearer sk-or-run" },
      body: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "hi" }], stream: true },
      cwd: "/tmp",
      timeoutMs: 5_000,
    });
    expect(out.httpStatus).toBe(200);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("Done.");
    expect(out.stdout).toContain("Mission complete.");
    await server.close();
  });
});
