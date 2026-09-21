import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

const VERSION = "0.11.0";

export interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean };
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status: { code: number; message?: string };
}

export interface OtlpScopeSpans {
  scope: { name: string; version: string };
  spans: OtlpSpan[];
}

export interface OtlpTraceExport {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: OtlpScopeSpans[];
  }>;
}

interface RunResult {
  runtime?: string;
  model?: string;
  provider?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  stop_code?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
    total_tokens?: number;
  };
  cost_usd?: number;
  cost_basis?: string;
  errors?: string[];
}

interface RunControl {
  session_id?: string;
  status?: string;
  stop_code?: string;
  turns?: number;
  denials?: number;
  cost_usd?: number;
  cost_basis?: string;
  mission_id?: string;
}

interface StreamedEvent {
  type: string;
  message?: { role?: string; model?: string; provider?: string; usage?: Record<string, unknown> };
  toolCallId?: string;
  toolName?: string;
  tool_call_id?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
  isError?: boolean;
  result?: Record<string, unknown>;
  timestamp?: string;
}

const DELTA_TYPES = new Set([
  "message_update",
  "tool_execution_update",
  "tool_stream_update",
  "thinking_delta",
  "text_delta",
]);

const TOOL_START_TYPES = new Set(["tool_queued", "tool_execution_start", "tool_running"]);
const TOOL_END_TYPES = new Set(["tool_execution_end", "tool_completed"]);

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function deriveSpanId(runId: string, counter: number): string {
  return sha256Hex(`${runId}:span:${counter}`).slice(0, 16);
}

function deriveTraceId(runId: string): string {
  return sha256Hex(`${runId}:trace`).slice(0, 32);
}

function tsToNano(ts: string | undefined, fallback: string): string {
  if (!ts) return fallback;
  try {
    const ms = new Date(ts).getTime();
    return String(BigInt(ms) * 1_000_000n);
  } catch {
    return fallback;
  }
}

function strAttr(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: value } };
}

function doubleAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { doubleValue: value } };
}

function parseEvents(eventsPath: string): StreamedEvent[] {
  if (!existsSync(eventsPath)) return [];
  const raw = readFileSync(eventsPath, "utf-8");
  const events: StreamedEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as StreamedEvent);
    } catch {
      // skip unparseable lines
    }
  }
  return events;
}

function readResult(runDir: string): RunResult {
  const resultPath = join(runDir, "runtime-result.yaml");
  if (!existsSync(resultPath)) return {};
  try {
    return JSON.parse(JSON.stringify(parseYaml(readFileSync(resultPath, "utf-8")))) as RunResult;
  } catch {
    return {};
  }
}

function readControl(runDir: string): RunControl {
  const controlPath = join(runDir, "runtime-control.json");
  if (!existsSync(controlPath)) return {};
  try {
    return JSON.parse(readFileSync(controlPath, "utf-8")) as RunControl;
  } catch {
    return {};
  }
}

function extractToolTarget(event: StreamedEvent): string | undefined {
  const input = (event.input ?? event.args) as Record<string, unknown> | undefined;
  if (!input) return undefined;
  if (typeof input.command === "string") return input.command.slice(0, 120);
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.path === "string") return input.path;
  if (typeof input.filePath === "string") return input.filePath;
  return undefined;
}

function extractUsage(msg: Record<string, unknown> | undefined): {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
} {
  if (!msg?.usage || typeof msg.usage !== "object") return {};
  const u = msg.usage as Record<string, unknown>;
  const input = typeof u.input === "number" ? u.input : typeof u.prompt_tokens === "number" ? u.prompt_tokens : typeof u.inputTokens === "number" ? u.inputTokens : undefined;
  const output = typeof u.output === "number" ? u.output : typeof u.completion_tokens === "number" ? u.completion_tokens : typeof u.outputTokens === "number" ? u.outputTokens : undefined;
  const cacheRead = typeof u.cacheRead === "number" ? u.cacheRead : typeof u.cache_read_tokens === "number" ? u.cache_read_tokens : typeof u.cacheReadTokens === "number" ? u.cacheReadTokens : undefined;
  const cacheWrite = typeof u.cacheWrite === "number" ? u.cacheWrite : typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : typeof u.cacheWriteTokens === "number" ? u.cacheWriteTokens : undefined;
  return { input, output, cacheRead, cacheWrite };
}

interface ToolSpanInfo {
  toolCallId: string;
  toolName: string;
  startTimeNs: string;
  endTimeNs: string;
  isError: boolean;
  unfinished?: boolean;
  target?: string;
}

export async function exportRunToOtlp(
  runDir: string,
  options?: { includeToolTargets?: boolean },
): Promise<OtlpTraceExport> {
  if (!existsSync(runDir)) throw new Error(`Run directory does not exist: ${runDir}`);

  const result = readResult(runDir);
  const control = readControl(runDir);
  const events = parseEvents(join(runDir, "events.ndjson"));

  const runtime = result.runtime ?? control.status ?? "unknown";
  const runId = control.status !== undefined ? `${runDir}` : runIdFromDir(runDir);
  const traceId = deriveTraceId(runId);
  const rootSpanId = deriveSpanId(runId, 0);
  let spanCounter = 0;

  const startedAt = result.started_at ?? events.find(e => e.timestamp)?.timestamp ?? "2025-01-01T00:00:00.000Z";
  const finishedAt = result.finished_at ?? startedAt;

  const startTimeNs = tsToNano(startedAt, "0");
  const endTimeNs = tsToNano(finishedAt, "0");

  // Build child spans from events
  const chatSpans: OtlpSpan[] = [];
  const toolSpans: OtlpSpan[] = [];
  const toolStarts = new Map<string, StreamedEvent>();
  const toolFinished = new Set<string>();

  for (const event of events) {
    const type = event.type;

    // Skip deltas
    if (DELTA_TYPES.has(type)) continue;

    // Assistant message_end with usage
    if (type === "message_end" && event.message?.role === "assistant") {
      const usage = extractUsage(event.message as Record<string, unknown>);
      if (usage.input !== undefined || usage.output !== undefined) {
        const sid = deriveSpanId(runId, spanCounter++);
        const attrs: OtlpAttribute[] = [
          strAttr("gen_ai.operation.name", "chat"),
        ];
        if (event.message.model) attrs.push(strAttr("gen_ai.response.model", event.message.model));
        if (usage.input !== undefined) attrs.push(intAttr("gen_ai.usage.input_tokens", usage.input));
        if (usage.output !== undefined) attrs.push(intAttr("gen_ai.usage.output_tokens", usage.output));
        if (usage.cacheRead !== undefined) attrs.push(intAttr("gen_ai.usage.cache_read.input_tokens", usage.cacheRead));
        if (usage.cacheWrite !== undefined) attrs.push(intAttr("gen_ai.usage.cache_write.input_tokens", usage.cacheWrite));

        const msgTs = tsToNano(event.timestamp, startTimeNs);
        chatSpans.push({
          traceId,
          spanId: sid,
          parentId: rootSpanId,
          name: `chat ${event.message.model ?? result.model ?? "unknown"}`,
          kind: 1,
          startTimeUnixNano: msgTs,
          endTimeUnixNano: msgTs,
          attributes: attrs,
          status: { code: 0 },
        });
      }
      continue;
    }

    // Tool starts
    if (TOOL_START_TYPES.has(type)) {
      const id = event.toolCallId ?? event.tool_call_id ?? "";
      if (id) toolStarts.set(id, event);
      continue;
    }

    // Tool ends
    if (TOOL_END_TYPES.has(type)) {
      const id = event.toolCallId ?? event.tool_call_id ?? "";
      const startEvent = toolStarts.get(id);
      const toolName = startEvent?.toolName ?? "unknown";
      const startTimeNsLocal = tsToNano(startEvent?.timestamp, startTimeNs);
      const endTimeNsLocal = tsToNano(event.timestamp, endTimeNs);
      const isError = event.isError === true;
      const target = options?.includeToolTargets && startEvent ? extractToolTarget(startEvent) : undefined;

      const toolSpanInfo: ToolSpanInfo = {
        toolCallId: id,
        toolName,
        startTimeNs: startTimeNsLocal,
        endTimeNs: endTimeNsLocal,
        isError,
        target,
      };
      toolSpans.push(buildToolSpan(runId, traceId, rootSpanId, toolSpanInfo, spanCounter++));
      toolFinished.add(id);
      continue;
    }
  }

  // Unfinished tools: starts without matching ends
  for (const [id, startEvent] of toolStarts) {
    if (toolFinished.has(id)) continue;
    const toolName = startEvent.toolName ?? "unknown";
    const startTimeNsLocal = tsToNano(startEvent.timestamp, startTimeNs);
    const target = options?.includeToolTargets ? extractToolTarget(startEvent) : undefined;
    const toolSpanInfo: ToolSpanInfo = {
      toolCallId: id,
      toolName,
      startTimeNs: startTimeNsLocal,
      endTimeNs: endTimeNs,
      isError: true,
      unfinished: true,
      target,
    };
    toolSpans.push(buildToolSpan(runId, traceId, rootSpanId, toolSpanInfo, spanCounter++));
  }

  // Build root span
  const passed = result.status === "passed";
  const rootAttrs: OtlpAttribute[] = [
    strAttr("gen_ai.operation.name", "invoke_agent"),
    strAttr("gen_ai.agent.name", runtime),
    strAttr("gen_ai.agent.id", runIdFromDir(runDir)),
  ];
  if (result.model) rootAttrs.push(strAttr("gen_ai.request.model", result.model));
  if (result.provider) rootAttrs.push(strAttr("gen_ai.provider.name", result.provider));
  if (result.usage?.input_tokens !== undefined) rootAttrs.push(intAttr("gen_ai.usage.input_tokens", result.usage.input_tokens));
  if (result.usage?.output_tokens !== undefined) rootAttrs.push(intAttr("gen_ai.usage.output_tokens", result.usage.output_tokens));
  if (result.usage?.cache_read_tokens !== undefined) rootAttrs.push(intAttr("gen_ai.usage.cache_read.input_tokens", result.usage.cache_read_tokens));
  if (result.usage?.cache_write_tokens !== undefined) rootAttrs.push(intAttr("gen_ai.usage.cache_write.input_tokens", result.usage.cache_write_tokens));
  if (control.session_id) rootAttrs.push(strAttr("gen_ai.conversation.id", control.session_id));

  // UH-specific facts
  rootAttrs.push(strAttr("uh.mission.id", runIdFromMissionDir(runDir)));
  rootAttrs.push(strAttr("uh.run.status", result.status ?? control.status ?? "unknown"));
  if (control.turns !== undefined) rootAttrs.push(intAttr("uh.turns", control.turns));
  if (control.denials !== undefined) rootAttrs.push(intAttr("uh.denials", control.denials));
  if (result.cost_usd !== undefined) rootAttrs.push(doubleAttr("uh.cost_usd", result.cost_usd));
  if (result.cost_basis) rootAttrs.push(strAttr("uh.cost_basis", result.cost_basis));
  if (result.stop_code ?? control.stop_code) {
    rootAttrs.push(strAttr("uh.stop_code", String(result.stop_code ?? control.stop_code)));
  }

  const rootStatus = passed ? { code: 0 } : { code: 2, message: result.stop_code ?? control.stop_code ?? result.status ?? "unknown" };
  if (!passed) {
    rootAttrs.push(strAttr("error.type", result.stop_code ?? control.stop_code ?? result.status ?? "unknown"));
  }

  const rootSpan: OtlpSpan = {
    traceId,
    spanId: rootSpanId,
    name: `invoke_agent ${runtime}`,
    kind: 1,
    startTimeUnixNano: startTimeNs,
    endTimeUnixNano: endTimeNs,
    attributes: rootAttrs,
    status: rootStatus,
  };

  const allSpans = [rootSpan, ...chatSpans, ...toolSpans];

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            strAttr("service.name", "ultimate-harness"),
            strAttr("service.version", VERSION),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "ultimate-harness", version: VERSION },
            spans: allSpans,
          },
        ],
      },
    ],
  };
}

function buildToolSpan(
  runId: string,
  traceId: string,
  parentId: string,
  info: ToolSpanInfo,
  counter: number,
): OtlpSpan {
  const spanId = deriveSpanId(runId, counter);
  const attrs: OtlpAttribute[] = [
    strAttr("gen_ai.operation.name", "execute_tool"),
    strAttr("gen_ai.tool.name", info.toolName),
    strAttr("gen_ai.tool.call.id", info.toolCallId),
  ];
  if (info.target) attrs.push(strAttr("uh.tool.target", info.target));
  if (info.unfinished) {
    attrs.push(strAttr("error.type", "unfinished"));
  } else if (info.isError && info.toolCallId) {
    attrs.push(strAttr("error.type", "tool_error"));
  }

  return {
    traceId,
    spanId,
    parentId: parentId,
    name: `execute_tool ${info.toolName}`,
    kind: 1,
    startTimeUnixNano: info.startTimeNs,
    endTimeUnixNano: info.endTimeNs,
    attributes: attrs,
    status: { code: 0 },
  };
}

function runIdFromDir(runDir: string): string {
  const parts = runDir.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? "unknown";
}

function runIdFromMissionDir(runDir: string): string {
  const parts = runDir.replace(/\\/g, "/").split("/");
  const runsIdx = parts.indexOf("runs");
  if (runsIdx >= 0 && runsIdx >= 2) return parts[runsIdx - 1];
  const missionsIdx = parts.indexOf("missions");
  if (missionsIdx >= 0 && missionsIdx < parts.length - 2) return parts[missionsIdx + 1];
  return "unknown";
}
