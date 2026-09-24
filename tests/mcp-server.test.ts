import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { stringify } from "yaml";
import { indexRuns } from "../src/harness/experience-store.js";
import { MCP_PROTOCOL_VERSIONS, createMcpServer, serveMcpStdio } from "../src/harness/mcp-server.js";

const VERSION = "9.9.9";
const MODERN = MCP_PROTOCOL_VERSIONS[0];
const LEGACY = MCP_PROTOCOL_VERSIONS[1];
const PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion";

let root: string;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

function server() {
  return createMcpServer({ root, version: VERSION });
}

/** The modern generation declares its protocol version per request through `_meta`. */
function modern(id: string | number, method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id, method, params: { _meta: { [PROTOCOL_VERSION_META]: MODERN }, ...params } };
}

async function putRun(missionId: string, runId: string, files: Record<string, unknown | string>) {
  const dir = path.join(root, ".harness", "missions", missionId, "runs", runId);
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(dir, name), typeof value === "string" ? value : name.endsWith(".yaml") ? stringify(value) : JSON.stringify(value), "utf8");
  }
  return dir;
}

const runtimeResult = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "uh.runtime-result.v0", mission_id: "mission-a", runtime: "hermes", status: "passed",
  started_at: "2026-09-21T10:00:00.000Z", finished_at: "2026-09-21T10:00:02.000Z",
  prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
  provider: "provider-a", model: "model-a",
  usage: { source: "runtime", input_tokens: 100, output_tokens: 20, cache_read_tokens: 30, cache_write_tokens: 10, cost_usd: 1.25, cost_basis: "provider_reported" },
  ...overrides,
});

const runtimeControl = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "uh.runtime-control.v0", mission_id: "mission-a", run_id: "run-a1", runtime: "hermes",
  controller_pid: 1, started_at: "2026-09-21T10:00:00.000Z", heartbeat_at: "2026-09-21T10:00:02.000Z",
  status: "passed", turns: 4, denials: 1, inflight_tools: 0, peak_memory_bytes: 4096, ...overrides,
});

const RUN_A1 = ".harness/missions/mission-a/runs/run-a1";
const RUN_A2 = ".harness/missions/mission-a/runs/run-a2";

/** One mission with two fixture run directories; returns the first run directory. */
async function seedProject(): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), "uh-mcp-"));
  const missionDir = path.join(root, ".harness", "missions", "mission-a");
  await mkdir(missionDir, { recursive: true });
  await writeFile(path.join(missionDir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0", id: "mission-a", title: "Fixture mission", workflow_profile: "spec-first-feature",
  }), "utf8");
  const runA1 = await putRun("mission-a", "run-a1", {
    "runtime-result.yaml": runtimeResult(),
    "runtime-control.json": runtimeControl(),
    "verification.yaml": { schema_version: "uh.verification-result.v0", mission_id: "mission-a", status: "passed", checks: [] },
    "prompt.md": "PROMPT BODY MUST NEVER LEAVE THE FILESYSTEM",
    "events.ndjson": `{"type":"prompt","text":"PROMPT BODY MUST NEVER LEAVE THE FILESYSTEM"}\n`,
    "runtime.stdout.log": "PROMPT BODY MUST NEVER LEAVE THE FILESYSTEM",
    "runtime.stderr.log": "PROMPT BODY MUST NEVER LEAVE THE FILESYSTEM",
  });
  // What a settled run leaves at the mission level (see mirrorRuntimeResultToLatest).
  await writeFile(path.join(missionDir, "runtime-result.yaml"), stringify(runtimeResult()), "utf8");
  await putRun("mission-a", "run-a2", {
    "runtime-control.json": runtimeControl({
      run_id: "run-a2", runtime: "codex", status: "failed", stop_code: "timeout",
      stop_reason: `deadline exceeded under ${root}`, turns: 2, denials: 0, peak_memory_bytes: undefined,
    }),
  });
  return runA1;
}

async function callTool(name: string, args?: Record<string, unknown>) {
  const response = await server().handle(modern(1, "tools/call", { name, arguments: args })) as Record<string, any>;
  expect(response.error).toBeUndefined();
  return response.result as Record<string, any>;
}

function textOf(result: Record<string, unknown>) {
  const content = result.content as Array<Record<string, unknown>>;
  expect(content.map((item) => item.type)).toEqual(["text"]);
  return String(content[0].text);
}

describe("mcp server: 2026-07-28 stateless generation", () => {
  test("answers server/discover with versions, capabilities, identity and cache hints", async () => {
    await seedProject();
    const response = await server().handle(modern("discover-1", "server/discover")) as Record<string, any>;
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe("discover-1");
    expect(response.error).toBeUndefined();
    expect(response.result.resultType).toBe("complete");
    expect(response.result.supportedVersions).toEqual([MODERN, LEGACY]);
    expect(response.result.capabilities).toEqual({ tools: {} });
    expect(response.result.serverInfo).toEqual({ name: "ultimate-harness", version: VERSION });
    expect(response.result._meta["io.modelcontextprotocol/serverInfo"]).toEqual({ name: "ultimate-harness", version: VERSION });
    expect(response.result.ttlMs).toBe(60_000);
    expect(response.result.cacheScope).toBe("private");
  });

  test("answers server/discover when the client sends no per-request metadata", async () => {
    await seedProject();
    const response = await server().handle({ jsonrpc: "2.0", id: 7, method: "server/discover" }) as Record<string, any>;
    expect(response.result.supportedVersions).toContain(MODERN);
  });

  test("rejects an unsupported protocol version with -32602 naming the supported versions", async () => {
    await seedProject();
    const response = await server().handle({
      jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: { [PROTOCOL_VERSION_META]: "1900-01-01" } },
    }) as Record<string, any>;
    expect(response.result).toBeUndefined();
    expect(response.error.code).toBe(-32602);
    for (const version of MCP_PROTOCOL_VERSIONS) expect(response.error.message).toContain(version);
    expect(response.error.data.supported).toEqual([MODERN, LEGACY]);
    expect(response.error.data.requested).toBe("1900-01-01");
  });
});

describe("mcp server: 2025-11-25 handshake generation", () => {
  test("initializes, swallows notifications/initialized and answers ping", async () => {
    await seedProject();
    const initialize = await server().handle({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "host", version: "1" } },
    }) as Record<string, any>;
    expect(initialize.result.protocolVersion).toBe(LEGACY);
    expect(initialize.result.capabilities).toEqual({ tools: {} });
    expect(initialize.result.serverInfo).toEqual({ name: "ultimate-harness", version: VERSION });
    expect(initialize.result.resultType).toBe("complete");

    expect(await server().handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();

    const ping = await server().handle({ jsonrpc: "2.0", id: 2, method: "ping" }) as Record<string, any>;
    expect(ping.id).toBe(2);
    expect(ping.error).toBeUndefined();
    expect(ping.result.resultType).toBe("complete");
  });

  test("negotiates the newest supported legacy version when initialize asks for another", async () => {
    await seedProject();
    const response = await server().handle({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "host", version: "1" } },
    }) as Record<string, any>;
    expect(response.result.protocolVersion).toBe(LEGACY);
  });

  test("never responds to a notification, known or not", async () => {
    await seedProject();
    for (const method of ["notifications/initialized", "notifications/cancelled", "notifications/nope"]) {
      expect(await server().handle({ jsonrpc: "2.0", method })).toBeUndefined();
    }
    expect(await server().handle({ jsonrpc: "2.0", id: 5, method: "notifications/initialized" })).toBeUndefined();
    expect(await server().handle({ jsonrpc: "2.0", id: null, method: "ping" })).toBeUndefined();
  });
});

describe("mcp server: framing and error codes", () => {
  test("lists tools in a fixed order with cache fields and closed input schemas", async () => {
    await seedProject();
    const response = await server().handle(modern(1, "tools/list")) as Record<string, any>;
    const tools = response.result.tools as Array<Record<string, any>>;
    expect(tools.map((tool) => tool.name)).toEqual(["uh_status", "uh_runs", "uh_run"]);
    expect(response.result.resultType).toBe("complete");
    expect(response.result.ttlMs).toBe(60_000);
    expect(response.result.cacheScope).toBe("private");
    for (const tool of tools) {
      expect(String(tool.description).length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    expect(tools[0].inputSchema.properties).toEqual({});
    expect(tools[1].inputSchema.required).toEqual([]);
    expect(tools[1].inputSchema.properties.group_by.enum).toEqual(["runtime", "model", "workflow_profile", "stop_code"]);
    expect(tools[2].inputSchema.required).toEqual(["mission_id", "run_id"]);

    const again = await server().handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }) as Record<string, any>;
    expect(again.result.tools.map((tool: Record<string, unknown>) => tool.name)).toEqual(tools.map((tool) => tool.name));
  });

  test("answers unknown methods with -32601", async () => {
    await seedProject();
    const response = await server().handle(modern(9, "resources/list")) as Record<string, any>;
    expect(response.error.code).toBe(-32601);
    expect(response.result).toBeUndefined();
  });

  test("answers requests that are not request objects with -32600", async () => {
    await seedProject();
    const cases: unknown[] = ["nope", 42, null, [], { jsonrpc: "2.0", id: 4 }, { jsonrpc: "2.0", id: 4, method: 7 }, { method: "ping", id: 4 }];
    for (const value of cases) {
      const response = await server().handle(value) as Record<string, any>;
      expect(response.error.code, JSON.stringify(value)).toBe(-32600);
      expect(response.result).toBeUndefined();
    }
  });
});

describe("mcp server: tools", () => {
  test("uh_status returns the status document with the project root rendered as relative", async () => {
    await seedProject();
    const result = await callTool("uh_status");
    expect(result.isError).toBeUndefined();
    const status = result.structuredContent as Record<string, any>;
    expect(status.schema_version).toBe("uh.status.v0");
    expect(status.version).toBe(VERSION);
    expect(status.project_root).toBe(".");
    expect(status.missions).toEqual({ total: 1, by_status: { passed: 1, blocked: 0, failed: 0, running: 0, pending: 0 } });
    expect(status.recent_runs.map((run: Record<string, unknown>) => run.mission_id)).toContain("mission-a");
    expect(JSON.parse(textOf(result))).toEqual(status);
  });

  test("uh_status takes no arguments and rejects any it is given", async () => {
    await seedProject();
    const result = await callTool("uh_status", { mission_id: "mission-a" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("uh_status");
  });

  test("uh_runs indexes runs and nulls unknown values instead of inventing zero", async () => {
    await seedProject();
    const payload = (await callTool("uh_runs")).structuredContent as Record<string, any>;
    expect(Object.keys(payload)).toEqual(["runs", "group_by"]);
    expect(payload.group_by).toBeNull();
    expect(payload.runs.map((run: Record<string, unknown>) => run.run_id)).toEqual(["run-a1", "run-a2"]);
    const [first, second] = payload.runs;
    expect(first).toMatchObject({
      mission_id: "mission-a", run_id: "run-a1", runtime: "hermes", model: "model-a",
      workflow_profile: "spec-first-feature", status: "passed", duration_ms: 2000, cost_usd: 1.25,
      verification_status: "passed", stop_code: null,
    });
    expect(second).toMatchObject({ run_id: "run-a2", status: "failed", stop_code: "timeout" });
    for (const field of ["cost_usd", "finished_at", "duration_ms", "verification_status", "model", "peak_memory_bytes"]) {
      expect(second[field], field).toBeNull();
    }
  });

  test("uh_runs filters by mission and summarizes with the pareto frontier", async () => {
    await seedProject();
    const grouped = (await callTool("uh_runs", { group_by: "runtime" })).structuredContent as Record<string, any>;
    expect(grouped.group_by).toBe("runtime");
    expect(grouped.groups.map((group: Record<string, unknown>) => group.key)).toEqual(["codex", "hermes"]);
    expect(grouped.groups[1]).toMatchObject({ runs: 1, passed: 1, success_rate: 1, known_cost_runs: 1, total_cost_usd: 1.25, mean_cost_usd: 1.25 });
    expect(grouped.pareto.map((group: Record<string, unknown>) => group.key)).toEqual(["hermes"]);

    const filtered = (await callTool("uh_runs", { mission_id: "mission-a", group_by: "stop_code" })).structuredContent as Record<string, any>;
    expect(filtered.groups.map((group: Record<string, unknown>) => group.key)).toEqual(["timeout", null]);
    expect(filtered.groups[1]).toMatchObject({ runs: 1, passed: 1, known_cost_runs: 1 });
    expect(filtered.pareto.map((group: Record<string, unknown>) => group.key)).toEqual([null]);
  });

  test("uh_run returns one record plus only the artifacts that exist", async () => {
    await seedProject();
    const result = await callTool("uh_run", { mission_id: "mission-a", run_id: "run-a1" });
    const payload = result.structuredContent as Record<string, any>;
    expect(payload.run).toMatchObject({ mission_id: "mission-a", run_id: "run-a1", cost_usd: 1.25 });
    expect(payload.artifacts).toEqual([
      `${RUN_A1}/events.ndjson`,
      `${RUN_A1}/prompt.md`,
      `${RUN_A1}/runtime-control.json`,
      `${RUN_A1}/runtime-result.yaml`,
      `${RUN_A1}/runtime.stderr.log`,
      `${RUN_A1}/runtime.stdout.log`,
      `${RUN_A1}/verification.yaml`,
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PROMPT BODY MUST NEVER LEAVE THE FILESYSTEM");
    for (const missing of ["diff.patch", "runtime-final.txt", "runtime-session.yaml", "runtime-recovery.json"]) {
      expect(serialized, missing).not.toContain(missing);
    }
  });

  test("uh_run on a control-only run reports just its control artifact", async () => {
    await seedProject();
    const payload = (await callTool("uh_run", { mission_id: "mission-a", run_id: "run-a2" })).structuredContent as Record<string, any>;
    expect(payload.run).toMatchObject({ run_id: "run-a2", runtime: "codex", status: "failed", stop_code: "timeout" });
    expect(payload.artifacts).toEqual([`${RUN_A2}/runtime-control.json`]);
  });

  test("reports unknown tools, invalid arguments and unknown runs as isError results", async () => {
    await seedProject();
    const noName = await server().handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {} }) as Record<string, any>;
    expect(noName.error).toBeUndefined();
    expect(noName.result.isError).toBe(true);

    expect((await callTool("uh_delete_everything")).isError).toBe(true);
    expect(textOf(await callTool("uh_nope"))).toContain("Unknown tool");

    const badGroup = await callTool("uh_runs", { group_by: "cost_usd" });
    expect(badGroup.isError).toBe(true);
    expect(textOf(badGroup)).toContain("group_by");

    expect((await callTool("uh_runs", { mission_id: 7 })).isError).toBe(true);
    expect((await callTool("uh_runs", { group_by: "runtime", extra: true })).isError).toBe(true);
    expect((await callTool("uh_run", { mission_id: "mission-a" })).isError).toBe(true);
    expect((await callTool("uh_run", { mission_id: "mission-a", run_id: "run-zz" })).isError).toBe(true);
    expect(textOf(await callTool("uh_run", { mission_id: "mission-a", run_id: "run-zz" }))).toContain("not found");
    expect((await callTool("uh_run", { mission_id: "mission-zz", run_id: "run-a1" })).isError).toBe(true);
    expect((await callTool("uh_runs", "not-an-object" as unknown as Record<string, unknown>)).isError).toBe(true);
  });

  test("rejects path traversal in mission_id and run_id before touching the filesystem", async () => {
    await seedProject();
    const attempts: Array<Record<string, unknown>> = [
      { mission_id: "../secret" },
      { mission_id: "mission-a/../../secret" },
      { mission_id: path.resolve(root, "..", "secret") },
      { mission_id: ".." },
      { mission_id: "." },
      { mission_id: "miss*on-a" },
      { mission_id: "mission-a", run_id: "../run-a1" },
      { mission_id: "mission-a", run_id: "..\\..\\runs" },
      { mission_id: "mission-a", run_id: "/" },
      { mission_id: "mission-a", run_id: "run a1" },
    ];
    for (const args of attempts) {
      const run = await callTool("uh_run", { run_id: "run-a1", ...args });
      expect(run.isError, JSON.stringify(args)).toBe(true);
      expect(JSON.stringify(run)).not.toContain("PROMPT BODY");
      const list = await callTool("uh_runs", args);
      expect(list.isError, JSON.stringify(args)).toBe(true);
    }
  });

  test("returns -32602 when tools/call params are not an object", async () => {
    await seedProject();
    const response = await server().handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: "nope" }) as Record<string, any>;
    expect(response.error.code).toBe(-32602);
  });
});

describe("mcp server: confidentiality", () => {
  test("no result ever contains an absolute filesystem path", async () => {
    const runA1 = await seedProject();
    // The raw store does leak: the failing run's stop_reason names the root.
    // Without redaction every assertion below would fail.
    const [, leaking] = await indexRuns(root);
    expect(leaking.stop_reason).toContain(root);
    const needles = [...new Set([root, runA1, path.dirname(runA1), tmpdir(), root.replace(/\\/g, "/"), tmpdir().replace(/\\/g, "/")])];
    const requests: unknown[] = [
      { jsonrpc: "2.0", id: 1, method: "server/discover" },
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: LEGACY, capabilities: {}, clientInfo: { name: "host", version: "1" } } },
      { jsonrpc: "2.0", id: 3, method: "ping" },
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      modern(5, "tools/call", { name: "uh_status" }),
      modern(6, "tools/call", { name: "uh_runs", arguments: { group_by: "runtime" } }),
      modern(7, "tools/call", { name: "uh_run", arguments: { mission_id: "mission-a", run_id: "run-a1" } }),
      modern(8, "tools/call", { name: "uh_run", arguments: { mission_id: "mission-a", run_id: "run-a2" } }),
      modern(9, "tools/call", { name: "uh_nope" }),
      modern(10, "tools/call", { name: "uh_run", arguments: { mission_id: path.resolve(root, "..", "escape"), run_id: "run-a1" } }),
      modern(11, "no_such_method"),
    ];
    for (const request of requests) {
      const serialized = JSON.stringify(await server().handle(request));
      for (const needle of needles) {
        expect(serialized, `${needle} leaked`).not.toContain(needle);
      }
      expect(serialized).not.toMatch(/[A-Za-z]:[\\/]{1,2}Users/);
    }
  });

  test("error text never echoes back the offending identifier", async () => {
    await seedProject();
    const result = await callTool("uh_run", { mission_id: "top-secret-mission-name", run_id: "top secret run" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("top-secret-mission-name");
    expect(textOf(result)).not.toContain("top secret run");
  });
});

describe("mcp server: stdio transport", () => {
  async function serve(lines: string[]) {
    const input = Readable.from(lines.map((line) => Buffer.from(`${line}\n`, "utf8")));
    const output = new PassThrough();
    let captured = "";
    output.on("data", (chunk: Buffer) => { captured += chunk.toString("utf8"); });
    await serveMcpStdio({ root, version: VERSION }, input, output);
    return captured;
  }

  test("serves newline-delimited JSON and reports parse errors with id null", async () => {
    await seedProject();
    const captured = await serve([
      JSON.stringify(modern(1, "tools/list")),
      "{this is not json",
      "",
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: "two", method: "tools/call", params: { name: "uh_runs", arguments: { group_by: "model" } } }),
      `${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" })}\r`,
    ]);
    const responses = captured.trim().split("\n").map((line) => JSON.parse(line) as Record<string, any>);
    expect(responses.map((response) => response.id)).toEqual([1, null, "two", 3]);
    expect(responses[1].error.code).toBe(-32700);
    expect(responses[1].jsonrpc).toBe("2.0");
    expect(responses[2].result.structuredContent.group_by).toBe("model");
    expect(responses[3].result.resultType).toBe("complete");
    expect(captured.endsWith("\n")).toBe(true);
    expect(captured).not.toContain(root);
  });

  test("finishes a request that arrives without a trailing newline", async () => {
    await seedProject();
    const captured = await serve([JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })]);
    expect((JSON.parse(captured) as Record<string, unknown>).id).toBe(1);
  });

  test("answers a request that arrives split across chunks", async () => {
    await seedProject();
    const payload = JSON.stringify(modern(42, "ping"));
    const input = Readable.from([Buffer.from(payload.slice(0, 20), "utf8"), Buffer.from(`${payload.slice(20)}\n`, "utf8")]);
    const output = new PassThrough();
    let captured = "";
    output.on("data", (chunk: Buffer) => { captured += chunk.toString("utf8"); });
    await serveMcpStdio({ root, version: VERSION }, input, output);
    expect((JSON.parse(captured) as Record<string, unknown>).id).toBe(42);
  });
});
