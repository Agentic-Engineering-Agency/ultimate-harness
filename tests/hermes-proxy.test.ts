import { test, expect, describe } from "vitest";
import { validateAdapter } from "../src/schema/adapter.js";
import {
  HermesProxyRuntimeConfigSchema,
  dryRunHermesProxy,
  hermesProxyRuntimeChecker,
  runHermesProxy,
} from "../src/adapters/hermes-proxy.js";
import { listAdapterTemplates } from "../src/harness/adapter-add.js";

/**
 * UH-35 — schema + manifest + template + dispatch entry.
 *
 * Real HTTP behavior arrives in UH-39 + UH-37; this suite locks the strict
 * schema, the structural shape of the dispatch stubs, and the fact that
 * `uh adapter add hermes-proxy` is wired into the templates list.
 */

describe("hermes-proxy schema", () => {
  test("accepts the canonical local-proxy manifest", () => {
    const cfg = HermesProxyRuntimeConfigSchema.parse({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
      provider: "nous",
      request_timeout_ms: 120_000,
      extra_headers: { "X-UH": "1" },
    });
    expect(cfg.endpoint).toBe("http://127.0.0.1:8645/v1");
    expect(cfg.model).toBe("hermes-4-405b");
    expect(cfg.provider).toBe("nous");
    expect(cfg.request_timeout_ms).toBe(120_000);
    expect(cfg.extra_headers).toEqual({ "X-UH": "1" });
  });

  test("defaults request_timeout_ms to 120_000 and extra_headers to {}", () => {
    const cfg = HermesProxyRuntimeConfigSchema.parse({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
    });
    expect(cfg.request_timeout_ms).toBe(120_000);
    expect(cfg.extra_headers).toEqual({});
    expect(cfg.provider).toBeUndefined();
  });

  test("rejects unknown keys (typo safety)", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        endpoiint: "http://nope",
      }),
    ).toThrow(/endpoiint/);
  });

  test("rejects non-URL endpoint", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "not-a-url",
        model: "hermes-4-405b",
      }),
    ).toThrow(/url|URL/);
  });

  test("requires model", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
      }),
    ).toThrow();
  });

  test("rejects empty-string model", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "",
      }),
    ).toThrow();
  });

  test("rejects unknown provider value", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        provider: "groq",
      }),
    ).toThrow();
  });

  test("rejects negative request_timeout_ms", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        request_timeout_ms: -1,
      }),
    ).toThrow();
  });

  test("rejects non-integer request_timeout_ms", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        request_timeout_ms: 1.5,
      }),
    ).toThrow();
  });
});

describe("hermes-proxy manifest validation via validateAdapter", () => {
  test("full manifest with valid runtime_config passes", async () => {
    // Force-import for the registerRuntimeConfigSchema side effect.
    await import("../src/adapters/hermes-proxy.js");
    const doc = validateAdapter({
      schema_version: "uh.adapter.v0",
      id: "hermes-proxy",
      name: "Hermes Proxy",
      runtime: "hermes-proxy",
      capabilities: ["oai-compat"],
      status: "experimental",
      config: {
        runtime_config: {
          endpoint: "http://127.0.0.1:8645/v1",
          model: "hermes-4-405b",
          provider: "nous",
        },
      },
    });
    expect(doc.runtime).toBe("hermes-proxy");
    expect(doc.config?.runtime_config).toMatchObject({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
      provider: "nous",
      request_timeout_ms: 120_000,
      extra_headers: {},
    });
  });

  test("typo in runtime_config key is rejected at adapter load", async () => {
    await import("../src/adapters/hermes-proxy.js");
    expect(() =>
      validateAdapter({
        schema_version: "uh.adapter.v0",
        id: "hermes-proxy",
        name: "Hermes Proxy",
        runtime: "hermes-proxy",
        config: {
          runtime_config: {
            endpoint: "http://127.0.0.1:8645/v1",
            model: "hermes-4-405b",
            modle: "hermes-4-405b", // typo
          },
        },
      }),
    ).toThrow(/modle/);
  });
});

describe("hermes-proxy runtime checker (live HTTP probe — UH-37)", () => {
  // Use a dedicated http import here to avoid forward-declaring before the
  // UH-39 suite below; the second require is a no-op for node.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require("node:http") as typeof import("node:http");

  function makeManifest(endpoint: string, provider?: string) {
    return {
      schema_version: "uh.adapter.v0" as const,
      id: "hermes-proxy",
      name: "Hermes Proxy",
      description: "",
      runtime: "hermes-proxy",
      capabilities: [],
      status: "experimental" as const,
      config: {
        cli_command: undefined,
        default_toolsets: [],
        default_provider: "",
        default_model: "",
        worktree_mode: false,
        pass_session_id: false,
        runtime_config: {
          endpoint,
          model: "hermes-4-405b",
          ...(provider ? { provider } : {}),
          request_timeout_ms: 120_000,
          extra_headers: {},
        },
      },
    };
  }

  function startServer(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void): Promise<{ port: number; close: () => Promise<void> }> {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") throw new Error("bad addr");
        resolve({
          port: addr.port,
          close: () => new Promise<void>((res) => server.close(() => res())),
        });
      });
    });
  }

  test("200 with models list → found + count surfaced", async () => {
    const server = await startServer((req, res) => {
      expect(req.url).toBe("/v1/models");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] }));
    });
    const result = await hermesProxyRuntimeChecker(
      makeManifest(`http://127.0.0.1:${server.port}/v1`),
      process.cwd(),
    );
    expect(result.found).toBe(true);
    expect(result.version).toMatch(/proxy reachable/);
    expect(result.version).toMatch(/3 models available/);
    expect(result.errors).toEqual([]);
    await server.close();
  });

  test("401 surfaces re-auth hint with provider name", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Failed to refresh credentials", type: "upstream_auth_failed", code: "upstream_auth_failed" } }));
    });
    const result = await hermesProxyRuntimeChecker(
      makeManifest(`http://127.0.0.1:${server.port}/v1`, "nous"),
      process.cwd(),
    );
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/HTTP 401/);
    expect(result.errors[0]).toMatch(/hermes auth status nous/);
    await server.close();
  });

  test("404 surfaces proxy-version-mismatch hint", async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Path /v1/models is not forwarded by this proxy", type: "path_not_allowed", code: "path_not_allowed" } }));
    });
    const result = await hermesProxyRuntimeChecker(
      makeManifest(`http://127.0.0.1:${server.port}/v1`),
      process.cwd(),
    );
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/HTTP 404/);
    expect(result.errors[0]).toMatch(/proxy version/);
    await server.close();
  });

  test("ECONNREFUSED → endpoint-unreachable hint with `hermes proxy start`", async () => {
    const closed = await startServer(() => undefined);
    const port = closed.port;
    await closed.close();
    const result = await hermesProxyRuntimeChecker(
      makeManifest(`http://127.0.0.1:${port}/v1`),
      process.cwd(),
    );
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/endpoint unreachable/);
    expect(result.errors[0]).toMatch(/hermes proxy start/);
  });

  test("missing endpoint → explicit missing-endpoint error", async () => {
    const manifest = makeManifest("placeholder");
    // Override runtime_config to drop endpoint.
    if (manifest.config && manifest.config.runtime_config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (manifest.config.runtime_config as any).endpoint = "";
    }
    const result = await hermesProxyRuntimeChecker(manifest, process.cwd());
    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/missing endpoint/);
  });
});

// (Dispatch stub tests replaced by the UH-39 implementation suites below.)

describe("hermes-proxy adapter-add template", () => {
  test("hermes-proxy is listed by uh adapter add", () => {
    expect(listAdapterTemplates()).toContain("hermes-proxy");
  });
});

// ---------- UH-39 implementation suites ----------

import * as http from "node:http";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  parseHermesProxyStream,
  planHermesProxyRun,
  defaultHermesProxyRunner,
  type HermesProxyRunnerOutput,
} from "../src/adapters/hermes-proxy.js";
import { initializeHarness } from "../src/harness/init.js";

const TEST_ROOT = "/tmp/uh-test-hermes-proxy";

async function setupHarness(): Promise<{ missionPath: string }> {
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "hermes-proxy.yaml"),
    `schema_version: uh.adapter.v0
id: hermes-proxy
name: Hermes Proxy
runtime: hermes-proxy
capabilities: []
status: experimental
config:
  runtime_config:
    endpoint: "http://127.0.0.1:8645/v1"
    model: "hermes-4-405b"
    provider: nous
`,
    "utf-8",
  );
  const missionDir = join(TEST_ROOT, ".harness", "missions", "test-uh39");
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: test-uh39
title: UH-39 test
workflow_profile: research-docs
objective: ""
`,
    "utf-8",
  );
  return { missionPath };
}

async function cleanup(): Promise<void> {
  await rm(TEST_ROOT, { recursive: true, force: true });
}

describe("parseHermesProxyStream", () => {
  test("concatenates delta content across multiple frames", () => {
    const buf = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: ", " } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "world." } }] })}\n\n`,
      `data: [DONE]\n\n`,
    ].join("");
    const out = parseHermesProxyStream(buf);
    expect(out.content).toBe("Hello, world.");
    expect(out.events).toHaveLength(3);
    expect(out.errorEnvelope).toBeNull();
  });

  test("stops at [DONE] and ignores trailing frames", () => {
    const buf = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`,
      `data: [DONE]\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ignored" } }] })}\n\n`,
    ].join("");
    const out = parseHermesProxyStream(buf);
    expect(out.content).toBe("ok");
  });

  test("surfaces an error envelope and stops accumulating", () => {
    const buf = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`,
      `data: ${JSON.stringify({ error: { message: "upstream auth failed", type: "upstream_auth_failed", code: "upstream_auth_failed" } })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "never" } }] })}\n\n`,
    ].join("");
    const out = parseHermesProxyStream(buf);
    expect(out.content).toBe("partial");
    expect(out.errorEnvelope?.type).toBe("upstream_auth_failed");
  });

  test("tolerates CRLF frame separators", () => {
    const buf = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\r\n\r\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "b" } }] })}\r\n\r\n`,
      `data: [DONE]\r\n\r\n`,
    ].join("");
    expect(parseHermesProxyStream(buf).content).toBe("ab");
  });
});

describe("planHermesProxyRun", () => {
  test("builds an OpenAI-compat request body with sentinel instruction", async () => {
    const { missionPath } = await setupHarness();
    const plan = await planHermesProxyRun(TEST_ROOT, missionPath);
    expect(plan.endpoint).toBe("http://127.0.0.1:8645/v1");
    expect(plan.command).toBe("POST http://127.0.0.1:8645/v1/chat/completions");
    expect(plan.body.model).toBe("hermes-4-405b");
    expect(plan.body.stream).toBe(true);
    expect(plan.body.messages).toHaveLength(1);
    expect(plan.body.messages[0].role).toBe("user");
    expect(plan.body.messages[0].content).toContain("uh-runtime-final-message");
    expect(plan.headers["content-type"]).toBe("application/json");
    expect(plan.headers.authorization).toMatch(/^Bearer /);
    expect(plan.requestTimeoutMs).toBe(120_000);
    expect(plan.errors).toEqual([]);
    await cleanup();
  });

  test("applies mission runtime_config_overrides on top of adapter defaults", async () => {
    const { missionPath } = await setupHarness();
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: test-uh39
title: override test
workflow_profile: research-docs
objective: ""
runtime_config_overrides:
  model: "claude-opus-4"
  request_timeout_ms: 30000
  extra_headers:
    x-trace: "override"
`,
      "utf-8",
    );
    const plan = await planHermesProxyRun(TEST_ROOT, missionPath);
    expect(plan.body.model).toBe("claude-opus-4");
    expect(plan.requestTimeoutMs).toBe(30_000);
    expect(plan.headers["x-trace"]).toBe("override");
    await cleanup();
  });

  test("rejects unknown override keys at planning time", async () => {
    const { missionPath } = await setupHarness();
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: test-uh39
title: bad override
workflow_profile: research-docs
objective: ""
runtime_config_overrides:
  modle: "claude-opus-4"
`,
      "utf-8",
    );
    await expect(planHermesProxyRun(TEST_ROOT, missionPath)).rejects.toThrow(/modle/);
    await cleanup();
  });
});

// ---------- runner (HTTP) suite ----------

function startTestServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("bad addr");
      resolve({
        port: addr.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

function makeRunnerInput(port: number, overrides: Partial<{ timeoutMs: number; model: string; extra_headers: Record<string, string> }> = {}) {
  return {
    endpoint: `http://127.0.0.1:${port}/v1`,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test",
      ...(overrides.extra_headers ?? {}),
    },
    body: {
      model: overrides.model ?? "hermes-4-405b",
      messages: [{ role: "user" as const, content: "hi" }],
      stream: true,
    },
    cwd: "/tmp",
    timeoutMs: overrides.timeoutMs ?? 5_000,
  };
}

describe("defaultHermesProxyRunner", () => {
  test("happy SSE path: 200 + content + sentinel", async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const sentinel = "```uh-runtime-final-message\nMission complete.\n```";
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Done. " } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: sentinel } }] })}\n\n`,
        `data: [DONE]\n\n`,
      ];
      for (const c of chunks) res.write(c);
      res.end();
    });
    const out = await defaultHermesProxyRunner(makeRunnerInput(server.port));
    expect(out.httpStatus).toBe(200);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("Done.");
    expect(out.stdout).toContain("Mission complete.");
    expect(out.errorEnvelope).toBeUndefined();
    await server.close();
  });

  test("401 with upstream_auth_failed JSON envelope", async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Failed to refresh Nous Portal credentials", type: "upstream_auth_failed", code: "upstream_auth_failed" } }));
    });
    const out = await defaultHermesProxyRunner(makeRunnerInput(server.port));
    expect(out.httpStatus).toBe(401);
    expect(out.exitCode).toBe(1);
    expect(out.errorEnvelope?.type).toBe("upstream_auth_failed");
    await server.close();
  });

  test("404 with model_not_found envelope", async () => {
    const server = await startTestServer((_req, res) => {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "model claude-opus-4 not available", type: "model_not_found", code: "model_not_found" } }));
    });
    const out = await defaultHermesProxyRunner(makeRunnerInput(server.port, { model: "claude-opus-4" }));
    expect(out.httpStatus).toBe(404);
    expect(out.exitCode).toBe(1);
    expect(out.errorEnvelope?.code).toBe("model_not_found");
    await server.close();
  });

  test("ECONNREFUSED when nothing is listening", async () => {
    // Pick a port we know is closed by binding+closing.
    const closed = await startTestServer(() => undefined);
    const closedPort = closed.port;
    await closed.close();
    const out = await defaultHermesProxyRunner(makeRunnerInput(closedPort));
    expect(out.exitCode).toBe(1);
    expect(out.networkError).toBeDefined();
    // Either ECONNREFUSED or fetch-level "ECONNREFUSED" via cause.code surfaces.
    expect(out.networkError + " " + out.stderr).toMatch(/ECONNREFUSED|fetch failed/i);
  });
});

// ---------- end-to-end via runHermesProxy with injected runner ----------
describe("runHermesProxy (orchestrator)", () => {
  test("passed when runner returns 200 + content + sentinel", async () => {
    const { missionPath } = await setupHarness();
    const runId = "test-proxy-pass";
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "Mission accomplished.\n```uh-runtime-final-message\nDone.\n```",
        stderr: "",
        exitCode: 0,
        httpStatus: 200,
        timedOut: false,
        events: [{ choices: [{ delta: { content: "..." } }] }],
      }),
      collectDiff: async () => ({ patch: "", errors: undefined }),
      runId,
    });
    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    const finalPath = join(TEST_ROOT, ".harness", "missions", "test-uh39", "runs", runId, "runtime-final.txt");
    expect(await readFile(finalPath, "utf-8")).toBe("Done.");
    const runtimeResultPath = join(TEST_ROOT, ".harness", "missions", "test-uh39", "runtime-result.yaml");
    const rr = parseYaml(await readFile(runtimeResultPath, "utf-8"));
    expect(rr.status).toBe("passed");
    expect(rr.runtime).toBe("hermes-proxy");
    await cleanup();
  });

  test("emits a runtime.usage event with real tokens from the proxy response", async () => {
    const { missionPath } = await setupHarness();
    const runId = "test-proxy-usage";
    await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "ok\n```uh-runtime-final-message\nDone.\n```",
        stderr: "",
        exitCode: 0,
        httpStatus: 200,
        timedOut: false,
        events: [],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        usageModel: "nousresearch/hermes-4-405b",
      }),
      collectDiff: async () => ({ patch: "" }),
      runId,
    });
    const eventsPath = join(TEST_ROOT, ".harness", "missions", "test-uh39", "runs", runId, "events.ndjson");
    const events = (await readFile(eventsPath, "utf-8")).trim().split("\n").map((l) => JSON.parse(l));
    const usage = events.find((e) => e.event === "runtime.usage");
    expect(usage).toMatchObject({
      event: "runtime.usage",
      runtime: "hermes-proxy",
      source: "runtime",
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      model: "nousresearch/hermes-4-405b",
    });
    await cleanup();
  });

  test("blocked on ECONNREFUSED with remediation hint", async () => {
    const { missionPath } = await setupHarness();
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "",
        stderr: "ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:8645\n",
        exitCode: 1,
        networkError: "ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:8645",
        timedOut: false,
        events: [],
      }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors?.join(" ")).toMatch(/endpoint unreachable/);
    expect(result.result?.errors?.join(" ")).toMatch(/hermes proxy start/);
    await cleanup();
  });

  test("blocked on 401 upstream_auth_failed with re-auth hint", async () => {
    const { missionPath } = await setupHarness();
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "",
        stderr: "auth failed",
        exitCode: 1,
        httpStatus: 401,
        errorEnvelope: { message: "Failed to refresh Nous Portal credentials", type: "upstream_auth_failed", code: "upstream_auth_failed" },
        timedOut: false,
        events: [],
      }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors?.join(" ")).toMatch(/upstream auth failed/);
    expect(result.result?.errors?.join(" ")).toMatch(/hermes auth status/);
    await cleanup();
  });

  test("blocked on 404 model_not_found with model hint", async () => {
    const { missionPath } = await setupHarness();
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "",
        stderr: "model missing",
        exitCode: 1,
        httpStatus: 404,
        errorEnvelope: { message: "model not found", type: "model_not_found", code: "model_not_found" },
        timedOut: false,
        events: [],
      }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors?.join(" ")).toMatch(/hermes-4-405b/);
    await cleanup();
  });

  test("failed on 200 with empty assistant content", async () => {
    const { missionPath } = await setupHarness();
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        httpStatus: 200,
        timedOut: false,
        events: [],
      }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("failed");
    expect(result.result?.errors?.join(" ")).toMatch(/empty assistant message/);
    await cleanup();
  });

  test("passed on 200 with content but no sentinel (runtime-final.txt empty)", async () => {
    const { missionPath } = await setupHarness();
    const runId = "test-proxy-no-sentinel";
    const result = await runHermesProxy(TEST_ROOT, missionPath, {
      runner: async (): Promise<HermesProxyRunnerOutput> => ({
        stdout: "Just a regular response with no sentinel.",
        stderr: "",
        exitCode: 0,
        httpStatus: 200,
        timedOut: false,
        events: [],
      }),
      collectDiff: async () => ({ patch: "" }),
      runId,
    });
    expect(result.result?.status).toBe("passed");
    const finalPath = join(TEST_ROOT, ".harness", "missions", "test-uh39", "runs", runId, "runtime-final.txt");
    expect(await readFile(finalPath, "utf-8")).toBe("");
    await cleanup();
  });
});

// ---------- UH-38 promotion assertion ----------

import { readFile as readFileForPromotion } from "node:fs/promises";
import { parse as parseYamlForPromotion } from "yaml";
import { validateAdapter as validateAdapterForPromotion } from "../src/schema/adapter.js";

describe("hermes-proxy promotion (UH-38)", () => {
  test("the local manifest is status: active", async () => {
    const raw = await readFileForPromotion(".harness/adapters/hermes-proxy.yaml", "utf-8");
    const parsed = parseYamlForPromotion(raw);
    const doc = validateAdapterForPromotion(parsed);
    expect(doc.status).toBe("active");
    expect(doc.runtime).toBe("hermes-proxy");
  });

  test("the adapter-add template also ships as status: active", async () => {
    const { addAdapter } = await import("../src/harness/adapter-add.js");
    const tmp = "/tmp/uh-test-uh38-tpl";
    await rm(tmp, { recursive: true, force: true });
    await mkdir(join(tmp, ".harness", "adapters"), { recursive: true });
    await addAdapter(tmp, "hermes-proxy");
    const raw = await readFileForPromotion(join(tmp, ".harness", "adapters", "hermes-proxy.yaml"), "utf-8");
    const doc = validateAdapterForPromotion(parseYamlForPromotion(raw));
    expect(doc.status).toBe("active");
    expect(doc.runtime).toBe("hermes-proxy");
    await rm(tmp, { recursive: true, force: true });
  });
});
