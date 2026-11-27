import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, afterEach } from "vitest";
import { exportRunToOtlp, type OtlpTraceExport } from "../src/harness/otel-export.js";

let root: string;

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const MODEL = "claude-sonnet-4-20250514";
const PROVIDER = "anthropic";
const RUN_ID = "run-test-001";
const SESSION_ID = "sess-abc-123";
const RUNTIME = "oh-my-pi";
const MISSION_ID = "mission-otel-test";

function baseRunDir(): string {
  return join(root, ".harness", "missions", MISSION_ID, "runs", RUN_ID);
}

async function writeControl(overrides?: Partial<Record<string, unknown>>): Promise<void> {
  const dir = baseRunDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "runtime-control.json"),
    JSON.stringify({
      schema_version: "uh.runtime-control.v0",
      mission_id: MISSION_ID,
      run_id: RUN_ID,
      runtime: RUNTIME,
      controller_pid: 12345,
      started_at: "2025-09-01T00:00:00.000Z",
      heartbeat_at: "2025-09-01T00:01:00.000Z",
      status: "passed",
      turns: 3,
      denials: 0,
      inflight_tools: 0,
      session_id: SESSION_ID,
      ...overrides,
    }),
    "utf-8",
  );
}

async function writeResult(overrides?: Partial<Record<string, unknown>>): Promise<void> {
  const dir = baseRunDir();
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "runtime-result.yaml"),
    [
      "schema_version: uh.runtime-result.v0",
      `mission_id: "${MISSION_ID}"`,
      `runtime: "${RUNTIME}"`,
      `status: "${overrides?.status ?? "passed"}"`,
      `started_at: "2025-09-01T00:00:00.000Z"`,
      `finished_at: "2025-09-01T00:01:00.000Z"`,
      `model: "${MODEL}"`,
      `provider: "${PROVIDER}"`,
      `usage:`,
      `  input_tokens: 1500`,
      `  output_tokens: 200`,
      `  total_tokens: 1700`,
      `  source: runtime`,
      `cost_usd: 0.042`,
      `cost_basis: provider_reported`,
      "errors: []",
      ...(overrides?.stop_code ? [`stop_code: ${overrides.stop_code}`] : []),
    ].join("\n"),
    "utf-8",
  );
}

function eventLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

async function writeEvents(lines: string[]): Promise<void> {
  const dir = baseRunDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "events.ndjson"), lines.join("\n") + "\n", "utf-8");
}

function makeUsageEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      model: MODEL,
      provider: PROVIDER,
      usage: { input: 100, output: 50, totalTokens: 150, cacheRead: 10, cacheWrite: 5 },
      content: "SECRET-DO-NOT-EXPORT",
    },
    ...overrides,
  };
}

function makeDeltaEvents(count: number): string[] {
  const types = [
    "message_update",
    "tool_execution_update",
    "tool_stream_update",
    "thinking_delta",
    "text_delta",
  ];
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    lines.push(
      eventLine({
        type,
        message: { role: "assistant", content: `delta chunk ${i}` },
        toolCallId: `tc-${i}`,
        text: `streaming chunk ${i}`,
      }),
    );
  }
  return lines;
}

function makeToolStart(toolCallId: string, toolName: string, input?: Record<string, unknown>): string {
  return eventLine({
    type: "tool_execution_start",
    toolCallId,
    toolName,
    ...(input ? { input } : {}),
  });
}

function makeToolEnd(toolCallId: string, opts?: { isError?: boolean; command?: string }): string {
  return eventLine({
    type: "tool_execution_end",
    toolCallId,
    isError: opts?.isError ?? false,
    result: {
      content: [{ text: "SECRET-DO-NOT-EXPORT result" }],
      ...(opts?.command ? { command: opts.command } : {}),
    },
  });
}

async function buildFixture(opts?: {
  usageEvents?: number;
  toolStarts?: Array<{ id: string; name: string; input?: Record<string, unknown> }>;
  toolEnds?: Array<{ id: string; isError?: boolean; command?: string }>;
  corruptLine?: boolean;
  controlOverrides?: Partial<Record<string, unknown>>;
  resultOverrides?: Partial<Record<string, unknown>>;
}): Promise<void> {
  root = await mkdtemp(join(tmpdir(), "otel-test-"));
  await writeControl(opts?.controlOverrides);
  await writeResult(opts?.resultOverrides);

  const events: string[] = [];
  events.push(
    eventLine({ type: "turn_start", timestamp: "2025-09-01T00:00:01.000Z" }),
  );

  // Tool starts and ends
  if (opts?.toolStarts) {
    for (const t of opts.toolStarts) {
      events.push(makeToolStart(t.id, t.name, t.input));
    }
  }
  if (opts?.toolEnds) {
    for (const t of opts.toolEnds) {
      events.push(makeToolEnd(t.id, t));
    }
  }

  // Assistant message_end events with usage
  const usageCount = opts?.usageEvents ?? 2;
  for (let i = 0; i < usageCount; i++) {
    events.push(eventLine(makeUsageEvent()));
  }

  // Delta events (90%+ of a real log)
  events.push(...makeDeltaEvents(300));

  // Corrupt line
  if (opts?.corruptLine) {
    events.push("NOT VALID JSON {{{}}");
  }

  events.push(
    eventLine({ type: "turn_end", timestamp: "2025-09-01T00:01:00.000Z" }),
  );

  await writeEvents(events);
}

describe("exportRunToOtlp", () => {
  test("produces correct OTLP envelope shape with resource and scope", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());

    expect(result).toHaveProperty("resourceSpans");
    expect(result.resourceSpans).toHaveLength(1);

    const rs = result.resourceSpans[0];
    expect(rs).toHaveProperty("resource");
    expect(rs).toHaveProperty("scopeSpans");
    expect(rs.scopeSpans).toHaveLength(1);

    const ss = rs.scopeSpans[0];
    expect(ss.scope.name).toBe("ultimate-harness");
    expect(ss.scope.version).toBeTruthy();
    expect(Array.isArray(ss.spans)).toBe(true);
  });

  test("creates exactly one root span with correct name and kind", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;

    const rootSpans = spans.filter(
      (s: any) => s.name.startsWith("invoke_agent"),
    );
    expect(rootSpans).toHaveLength(1);

    const root = rootSpans[0];
    expect(root.kind).toBe(1); // INTERNAL
    expect(root.name).toBe(`invoke_agent ${RUNTIME}`);
  });

  test("maps GenAI semantic convention attributes on root span", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;

    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );

    expect(attrMap.get("gen_ai.operation.name")?.stringValue).toBe("invoke_agent");
    expect(attrMap.get("gen_ai.agent.name")?.stringValue).toBe(RUNTIME);
    expect(attrMap.get("gen_ai.agent.id")?.stringValue).toBe(RUN_ID);
    expect(attrMap.get("gen_ai.request.model")?.stringValue).toBe(MODEL);
    expect(attrMap.get("gen_ai.provider.name")?.stringValue).toBe(PROVIDER);
    expect(attrMap.get("gen_ai.usage.input_tokens")?.intValue).toBe(1500);
    expect(attrMap.get("gen_ai.usage.output_tokens")?.intValue).toBe(200);
  });

  test("sets gen_ai.conversation.id only when session_id exists in runtime-control.json", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );

    expect(attrMap.get("gen_ai.conversation.id")?.stringValue).toBe(SESSION_ID);
  });

  test("omits gen_ai.conversation.id when no session_id in control", async () => {
    await buildFixture({ controlOverrides: { session_id: undefined } });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );

    expect(attrMap.has("gen_ai.conversation.id")).toBe(false);
  });

  test("creates child spans for assistant message_end events with usage", async () => {
    await buildFixture({ usageEvents: 2 });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;

    const chatSpans = spans.filter((s: any) => s.name.startsWith("chat "));
    expect(chatSpans).toHaveLength(2);

    for (const span of chatSpans) {
      const attrMap = new Map<string, any>(
        span.attributes.map((a: any) => [a.key, a.value]),
      );
      expect(attrMap.get("gen_ai.operation.name")?.stringValue).toBe("chat");
      expect(attrMap.get("gen_ai.response.model")?.stringValue).toBe(MODEL);
      expect(attrMap.get("gen_ai.usage.input_tokens")?.intValue).toBe(100);
      expect(attrMap.get("gen_ai.usage.output_tokens")?.intValue).toBe(50);
      expect(span.parentId).toBeTruthy();
    }
  });

  test("creates child spans for tool calls with correct pairing", async () => {
    await buildFixture({
      toolStarts: [
        { id: "tc-1", name: "shell_command", input: { command: "ls -la" } },
        { id: "tc-2", name: "read_file", input: { file_path: "/tmp/foo" } },
      ],
      toolEnds: [
        { id: "tc-1" },
        { id: "tc-2", isError: true },
      ],
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;

    const toolSpans = spans.filter((s: any) => s.name.startsWith("execute_tool "));
    expect(toolSpans).toHaveLength(2);

    const tc1 = toolSpans.find((s: any) => s.name === "execute_tool shell_command")!;
    const tc1Attr = new Map<string, any>(
      tc1.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(tc1Attr.get("gen_ai.operation.name")?.stringValue).toBe("execute_tool");
    expect(tc1Attr.get("gen_ai.tool.name")?.stringValue).toBe("shell_command");
    expect(tc1Attr.get("gen_ai.tool.call.id")?.stringValue).toBe("tc-1");
    expect(tc1.parentId).toBeTruthy();

    const tc2 = toolSpans.find((s: any) => s.name === "execute_tool read_file")!;
    const tc2Attr = new Map<string, any>(
      tc2.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(tc2Attr.get("error.type")?.stringValue).toBe("tool_error");
  });

  test("marks unfinished tool spans (start with no end) with error.type=unfinished", async () => {
    await buildFixture({
      toolStarts: [{ id: "tc-orphan", name: "write_file" }],
      toolEnds: [],
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;

    const toolSpan = spans.find((s: any) => s.name === "execute_tool write_file")!;
    const attrMap = new Map<string, any>(
      toolSpan.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("error.type")?.stringValue).toBe("unfinished");
  });

  test("sets ERROR status on non-passed run", async () => {
    await buildFixture({
      resultOverrides: { status: "failed", stop_code: "timeout" },
      controlOverrides: { status: "failed", stop_code: "timeout" },
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;

    expect(root.status.code).toBe(2); // ERROR
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("error.type")?.stringValue).toBe("timeout");
  });

  test("uses run status when stop_code is absent", async () => {
    await buildFixture({
      resultOverrides: { status: "failed", stop_code: undefined },
      controlOverrides: { status: "failed", stop_code: undefined },
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;

    expect(root.status.code).toBe(2);
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("error.type")?.stringValue).toBe("failed");
  });

  test("derives deterministic IDs across two exports", async () => {
    await buildFixture();
    const result1 = await exportRunToOtlp(baseRunDir());
    const result2 = await exportRunToOtlp(baseRunDir());

    const spans1 = result1.resourceSpans[0].scopeSpans[0].spans;
    const spans2 = result2.resourceSpans[0].scopeSpans[0].spans;

    expect(spans1).toHaveLength(spans2.length);
    for (let i = 0; i < spans1.length; i++) {
      expect(spans1[i].traceId).toBe(spans2[i].traceId);
      expect(spans1[i].spanId).toBe(spans2[i].spanId);
      expect(spans1[i].parentId).toBe(spans2[i].parentId);
    }
  });

  test("IDs are lowercase hex with correct lengths", async () => {
    await buildFixture({ toolStarts: [{ id: "tc-a", name: "bash" }], toolEnds: [{ id: "tc-a" }] });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;

    for (const span of spans) {
      expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  test("sets UH-specific facts on root span under uh. prefix", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );

    expect(attrMap.get("uh.mission.id")?.stringValue).toBe(MISSION_ID);
    expect(attrMap.get("uh.run.status")?.stringValue).toBe("passed");
    expect(attrMap.get("uh.turns")?.intValue).toBe(3);
  });

  test("never exports SECRET-DO-NOT-EXPORT marker", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const json = JSON.stringify(result);
    expect(json).not.toContain("SECRET-DO-NOT-EXPORT");
  });

  test("skips streaming delta events without creating spans", async () => {
    await buildFixture({ usageEvents: 1 });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    // Should be: 1 root + 1 chat = 2 spans (no delta spans)
    expect(spans.length).toBe(2);
  });

  test("handles corrupt lines in NDJSON without throwing", async () => {
    await buildFixture({ corruptLine: true, usageEvents: 1 });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.length).toBe(2); // root + 1 chat
  });

  test("adds uh.tool.target to tool spans only when includeToolTargets is true", async () => {
    await buildFixture({
      toolStarts: [{ id: "tc-x", name: "shell_command", input: { command: "npm install" } }],
      toolEnds: [{ id: "tc-x" }],
    });

    const withoutTarget = await exportRunToOtlp(baseRunDir());
    const toolSpan1 = withoutTarget.resourceSpans[0].scopeSpans[0].spans.find(
      (s: any) => s.name.startsWith("execute_tool"),
    )!;
    const attrMap1 = new Map<string, any>(
      toolSpan1.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap1.has("uh.tool.target")).toBe(false);

    const withTarget = await exportRunToOtlp(baseRunDir(), { includeToolTargets: true });
    const toolSpan2 = withTarget.resourceSpans[0].scopeSpans[0].spans.find(
      (s: any) => s.name.startsWith("execute_tool"),
    )!;
    const attrMap2 = new Map<string, any>(
      toolSpan2.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap2.get("uh.tool.target")?.stringValue).toBe("npm install");
  });

  test("truncates uh.tool.target to first 120 chars for commands", async () => {
    const longCmd = "a".repeat(200);
    await buildFixture({
      toolStarts: [{ id: "tc-long", name: "shell_command", input: { command: longCmd } }],
      toolEnds: [{ id: "tc-long" }],
    });
    const result = await exportRunToOtlp(baseRunDir(), { includeToolTargets: true });
    const toolSpan = result.resourceSpans[0].scopeSpans[0].spans.find(
      (s: any) => s.name.startsWith("execute_tool"),
    )!;
    const attrMap = new Map<string, any>(
      toolSpan.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("uh.tool.target")?.stringValue).toHaveLength(120);
  });

  test("uses file_path from tool input as uh.tool.target when present", async () => {
    await buildFixture({
      toolStarts: [{ id: "tc-file", name: "read_file", input: { file_path: "/src/main.ts" } }],
      toolEnds: [{ id: "tc-file" }],
    });
    const result = await exportRunToOtlp(baseRunDir(), { includeToolTargets: true });
    const toolSpan = result.resourceSpans[0].scopeSpans[0].spans.find(
      (s: any) => s.name === "execute_tool read_file",
    )!;
    const attrMap = new Map<string, any>(
      toolSpan.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("uh.tool.target")?.stringValue).toBe("/src/main.ts");
  });

  test("parent-child span relationships are correct", async () => {
    await buildFixture({
      usageEvents: 1,
      toolStarts: [{ id: "tc-1", name: "bash" }],
      toolEnds: [{ id: "tc-1" }],
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;

    const children = spans.filter((s: any) => s.parentId === root.spanId);
    expect(children.length).toBe(2); // 1 chat + 1 tool
    expect(root.parentId).toBeFalsy(); // root has no parent
  });

  test("sets timestamps as startTimeUnixNano and endTimeUnixNano strings", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    for (const span of spans) {
      expect(typeof span.startTimeUnixNano).toBe("string");
      expect(typeof span.endTimeUnixNano).toBe("string");
      expect(span.startTimeUnixNano).toMatch(/^\d+$/);
      expect(span.endTimeUnixNano).toMatch(/^\d+$/);
    }
  });

  test("exportRunToOtlp throws on nonexistent runDir", async () => {
    await expect(exportRunToOtlp("/nonexistent/path")).rejects.toThrow();
  });

  test("supports tool_queued / tool_completed event name variants", async () => {
    root = await mkdtemp(join(tmpdir(), "otel-test-"));
    await writeControl();
    await writeResult();
    const events = [
      eventLine({ type: "tool_queued", toolCallId: "tc-q", toolName: "edit_file" }),
      eventLine({ type: "tool_completed", toolCallId: "tc-q", isError: false, result: { content: [{ text: "done" }] } }),
      eventLine(makeUsageEvent()),
      ...makeDeltaEvents(50),
      eventLine({ type: "turn_end", timestamp: "2025-09-01T00:01:00.000Z" }),
    ];
    await writeEvents(events);

    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const toolSpans = spans.filter((s: any) => s.name.startsWith("execute_tool "));
    expect(toolSpans).toHaveLength(1);
    expect(toolSpans[0].name).toBe("execute_tool edit_file");
  });

  test("supports tool_running as tool-start variant", async () => {
    root = await mkdtemp(join(tmpdir(), "otel-test-"));
    await writeControl();
    await writeResult();
    const events = [
      eventLine({ type: "tool_running", toolCallId: "tc-r", toolName: "grep" }),
      eventLine({ type: "tool_execution_end", toolCallId: "tc-r", isError: false }),
      eventLine(makeUsageEvent()),
      ...makeDeltaEvents(20),
      eventLine({ type: "turn_end", timestamp: "2025-09-01T00:01:00.000Z" }),
    ];
    await writeEvents(events);

    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const toolSpans = spans.filter((s: any) => s.name.startsWith("execute_tool "));
    expect(toolSpans).toHaveLength(1);
    expect(toolSpans[0].name).toBe("execute_tool grep");
  });

  test("root span carries uh.cost_usd and uh.cost_basis from runtime-result.yaml", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;
    const attrMap = new Map<string, any>(
      root.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("uh.cost_usd")?.doubleValue).toBeCloseTo(0.042);
    expect(attrMap.get("uh.cost_basis")?.stringValue).toBe("provider_reported");
  });

  test("resource attributes include service information", async () => {
    await buildFixture();
    const result = await exportRunToOtlp(baseRunDir());
    const resource = result.resourceSpans[0].resource;
    const attrMap = new Map<string, any>(
      resource.attributes.map((a: any) => [a.key, a.value]),
    );
    expect(attrMap.get("service.name")?.stringValue).toBe("ultimate-harness");
  });

  test("spans are ordered: root first, then children", async () => {
    await buildFixture({
      usageEvents: 1,
      toolStarts: [{ id: "tc-1", name: "bash" }],
      toolEnds: [{ id: "tc-1" }],
    });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    // First span should be root
    expect(spans[0].name).toBe("invoke_agent oh-my-pi");
    // Remaining should have parentId
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].parentId).toBeTruthy();
    }
  });

  test("multiple assistant messages produce separate chat spans with cumulative usage", async () => {
    await buildFixture({ usageEvents: 3 });
    const result = await exportRunToOtlp(baseRunDir());
    const spans = result.resourceSpans[0].scopeSpans[0].spans;
    const chatSpans = spans.filter((s: any) => s.name.startsWith("chat "));
    expect(chatSpans).toHaveLength(3);
    // Each should be a child of root
    const root = spans.find((s: any) => s.name.startsWith("invoke_agent"))!;
    for (const cs of chatSpans) {
      expect(cs.parentId).toBe(root.spanId);
    }
  });
});
