import { EventEmitter, once } from "node:events";
import { stat } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { indexRuns, paretoFrontier, summarizeRuns, type RunGroupSummary, type RunRecord } from "./experience-store.js";
import { assertSafeMissionId, assertWithinRoot } from "./mission.js";
import { assertValidRunId } from "./run-id.js";
import { getStatusJson } from "./status-json.js";

/**
 * Read-only MCP (Model Context Protocol) server face over the run store.
 *
 * JSON-RPC 2.0 over newline-delimited JSON. This slice exposes what the
 * harness already knows: project status, indexed runs, run groups, and which
 * artifacts a run produced. No tool here starts a runtime, writes a file,
 * renders a prompt, or spends anything.
 *
 * Hosts are mid-migration, so both protocol generations are served:
 *   - `2026-07-28` — stateless. `server/discover`, a per-request protocol
 *     version in `params._meta["io.modelcontextprotocol/protocolVersion"]`,
 *     `resultType` on every result, and cache hints on list results.
 *   - `2025-11-25` — handshake. `initialize`, `notifications/initialized`, `ping`.
 *
 * Confidentiality is treated as a protocol property, not a nicety: values read
 * from disk pass through `redactValue`, mission and run ids are validated
 * before they are ever joined into a path, error text never echoes a
 * caller-supplied value back, and every path a result mentions is relative to
 * the project root with forward slashes.
 */

/** Newest first: the order a negotiating host should prefer. */
export const MCP_PROTOCOL_VERSIONS = ["2026-07-28", "2025-11-25"] as const;

const LATEST_LEGACY_PROTOCOL_VERSION = MCP_PROTOCOL_VERSIONS[MCP_PROTOCOL_VERSIONS.length - 1];
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
const SERVER_NAME = "ultimate-harness";
const LIST_TTL_MS = 60_000;
const CACHE_SCOPE = "private";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

export type McpServerOptions = {
  /** Project root the server reads. Never returned as-is. */
  root: string;
  /** Package version advertised in serverInfo and in `uh_status`. */
  version: string;
};

type RequestId = string | number;
type JsonRpcId = RequestId | null;

export type JsonRpcErrorObject = { code: number; message: string; data?: Record<string, unknown> };

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: JsonRpcErrorObject };

export type McpServer = {
  /** Handles one parsed request. Returns `undefined` for notifications. */
  handle(message: unknown): Promise<JsonRpcResponse | undefined>;
};

/** A tool-level failure: reported inside a `tools/call` result as `isError`. */
class ToolFailure extends Error {}

const GROUP_BY_VALUES = ["runtime", "model", "workflow_profile", "stop_code"] as const;

const StatusArgsSchema = z.object({}).strict();
const RunsArgsSchema = z.object({
  mission_id: z.string().min(1).optional(),
  group_by: z.enum(GROUP_BY_VALUES).optional(),
}).strict();
const RunArgsSchema = z.object({
  mission_id: z.string().min(1),
  run_id: z.string().min(1),
}).strict();

type RunsArgs = z.infer<typeof RunsArgsSchema>;
type RunArgs = z.infer<typeof RunArgsSchema>;

/** Canonical per-run artifact filenames, in ascending byte order. */
const RUN_ARTIFACT_NAMES = [
  "diff.patch",
  "events.ndjson",
  "prompt.md",
  "runtime-control.json",
  "runtime-final.txt",
  "runtime-recovery.json",
  "runtime-session.yaml",
  "runtime-result.yaml",
  "runtime.stderr.log",
  "runtime.stdout.log",
  "verification.yaml",
] as const;

/**
 * Every field of `RunRecord`, listed so absent values render as `null`
 * instead of being dropped or defaulted to 0.
 */
const RUN_RECORD_FIELDS = [
  "mission_id", "run_id", "runtime", "provider", "model", "workflow_profile", "status",
  "stop_code", "stop_reason", "started_at", "finished_at", "duration_ms", "turns", "denials",
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd",
  "cost_basis", "resumed_from", "verification_status", "peak_memory_bytes",
] as const satisfies readonly (keyof RunRecord)[];

const RUN_GROUP_FIELDS = [
  "key", "runs", "passed", "success_rate", "known_cost_runs", "total_cost_usd",
  "mean_cost_usd", "mean_duration_ms", "cache_read_share",
] as const satisfies readonly (keyof RunGroupSummary)[];

type Tool = {
  name: string;
  description: string;
  /** Deterministic usage hint, shown in place of any caller-supplied value. */
  usage: string;
  inputSchema: Record<string, unknown>;
  schema: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown>;
};

function publicRecord(record: RunRecord): Record<string, string | number | null> {
  const view: Record<string, string | number | null> = {};
  for (const field of RUN_RECORD_FIELDS) {
    const value = record[field];
    view[field] = value === undefined ? null : value;
  }
  return view;
}

function publicGroup(group: RunGroupSummary): Record<string, string | number | null> {
  const view: Record<string, string | number | null> = {};
  for (const field of RUN_GROUP_FIELDS) {
    const value = group[field];
    view[field] = value === undefined ? null : value;
  }
  return view;
}

/** Unknown group keys sort last; otherwise ascending by key. */
function compareGroups(a: RunGroupSummary, b: RunGroupSummary): number {
  if (a.key === undefined && b.key === undefined) return 0;
  if (a.key === undefined) return 1;
  if (b.key === undefined) return -1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function sortRecords(records: RunRecord[]): RunRecord[] {
  return [...records].sort((a, b) => {
    if (a.mission_id !== b.mission_id) return a.mission_id < b.mission_id ? -1 : 1;
    if (a.run_id !== b.run_id) return a.run_id < b.run_id ? -1 : 1;
    return 0;
  });
}

/**
 * Validated here, never joined into a path before this returns. Failures name
 * the field and the rule, never the value that broke it.
 */
function requireSafeId(toolName: string, field: "mission_id" | "run_id", value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    assertSafeMissionId(value);
    if (field === "run_id") assertValidRunId(value);
  } catch {
    throw new ToolFailure(`${toolName}: ${field} must be a single safe path segment — letters, numbers, dots, underscores and hyphens, no separators, no "." or "..".`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedVersion(version: string): boolean {
  return (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

function extractId(value: unknown): JsonRpcId {
  if (!isRecord(value)) return null;
  if (typeof value.id === "string" || typeof value.id === "number") return value.id;
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Absolute project paths, in every separator spelling this platform allows. */
function rootNeedles(root: string): RegExp[] {
  const resolved = path.resolve(root);
  const variants = new Set<string>();
  for (const base of [resolved, resolved.replace(/\\/g, "/"), resolved.replace(/\//g, path.sep)]) {
    variants.add(base);
    for (const separator of [path.sep, "/"]) {
      variants.add(base.endsWith(separator) ? base : `${base}${separator}`);
    }
  }
  const flags = process.platform === "win32" ? "gi" : "g";
  return [...variants]
    .filter((variant) => variant.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((variant) => new RegExp(escapeRegExp(variant), flags));
}

/** Replaces any occurrence of the project root, or a path beneath it, with `.`. */
function redactValue(value: string, root: string, needles: RegExp[]): string {
  let redacted = value;
  for (const needle of needles) redacted = redacted.replace(needle, ".");
  return redacted;
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const root = path.resolve(options.root);
  const needles = rootNeedles(root);
  const serverInfo = { name: SERVER_NAME, version: options.version };
  const capabilities = { tools: {} };
  const resultBase = (): Record<string, unknown> => ({ resultType: "complete" });

  /** Deep-copies a result, redacting absolute paths and rootifying `project_root`. */
  function redact(value: unknown): unknown {
    if (typeof value === "string") return redactValue(value, root, needles);
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (isRecord(value)) {
      const view: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        view[key] = key === "project_root" ? "." : redact(item);
      }
      return view;
    }
    return value;
  }

  /** Root-relative, forward-slash path. The only path shape this server emits. */
  function relativeToRoot(target: string): string {
    return path.relative(root, target).split(path.sep).join("/");
  }

  function runDirectory(missionId: string, runId: string): string {
    try {
      return assertWithinRoot(path.join(root, ".harness", "missions", missionId, "runs", runId), root, "run directory");
    } catch {
      throw new ToolFailure("uh_run: the requested run was not found in this project.");
    }
  }

  async function listRuns(rawArgs: unknown): Promise<unknown> {
    const args = rawArgs as RunsArgs;
    const records = await indexRuns(root, args.mission_id === undefined ? {} : { missionId: args.mission_id });
    const payload: Record<string, unknown> = {
      runs: sortRecords(records).map(publicRecord),
      group_by: args.group_by ?? null,
    };
    if (args.group_by === undefined) return redact(payload);
    const groups = summarizeRuns(records, args.group_by).sort(compareGroups);
    payload.groups = groups.map(publicGroup);
    payload.pareto = paretoFrontier(groups).sort(compareGroups).map(publicGroup);
    return redact(payload);
  }

  async function readRun(rawArgs: unknown): Promise<unknown> {
    const args = rawArgs as RunArgs;
    const records = await indexRuns(root, { missionId: args.mission_id });
    const record = records.find((candidate) => candidate.run_id === args.run_id);
    if (!record) throw new ToolFailure("uh_run: the requested run was not found in this project.");
    const runDir = runDirectory(args.mission_id, args.run_id);
    const artifacts: string[] = [];
    for (const name of RUN_ARTIFACT_NAMES) {
      const candidate = path.join(runDir, name);
      try {
        if ((await stat(candidate)).isFile()) artifacts.push(relativeToRoot(candidate));
      } catch {
        // Artifacts that were never written stay absent.
      }
    }
    return redact({ run: publicRecord(record), artifacts });
  }

  async function readStatus(): Promise<unknown> {
    return redact(await getStatusJson(root, { packageVersion: options.version }));
  }

  const statusTool: Tool = {
    name: "uh_status",
    description: "Read the Ultimate Harness project status document — the same object `uh status --json` prints: adapter inventory, mission counts by status, recent runs, drift counts and acceptance counts. Takes no arguments.",
    usage: "accepts no arguments.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    schema: StatusArgsSchema,
    execute: () => readStatus(),
  };
  const runsTool: Tool = {
    name: "uh_runs",
    description: "List every run indexed from .harness/missions, optionally filtered to one mission and grouped by runtime, model, workflow_profile or stop_code. Grouped results add success rate, known-cost totals, and the Pareto frontier of success rate against mean cost. Read-only.",
    usage: "accepts mission_id and group_by only; group_by must be runtime, model, workflow_profile or stop_code.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: { type: "string", minLength: 1, description: "Restrict the listing to one mission id." },
        group_by: { type: "string", enum: [...GROUP_BY_VALUES], description: "Add grouped summaries and the Pareto frontier for this dimension." },
      },
      required: [],
      additionalProperties: false,
    },
    schema: RunsArgsSchema,
    execute: listRuns,
  };
  const runTool: Tool = {
    name: "uh_run",
    description: "Read one run record by mission id and run id, plus the root-relative paths of the artifacts that run actually produced. Artifact contents are never returned, only which files exist. Read-only.",
    usage: "requires mission_id and run_id, and accepts nothing else.",
    inputSchema: {
      type: "object",
      properties: {
        mission_id: { type: "string", minLength: 1, description: "Mission id owning the run." },
        run_id: { type: "string", minLength: 1, description: "Run id, as listed by uh_runs." },
      },
      required: ["mission_id", "run_id"],
      additionalProperties: false,
    },
    schema: RunArgsSchema,
    execute: readRun,
  };

  /** Fixed order: whole-project view, then the index, then one record. */
  const tools: Tool[] = [statusTool, runsTool, runTool];

  async function callTool(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = typeof params.name === "string" ? params.name : "";
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) {
      return {
        ...resultBase(),
        isError: true,
        content: [{ type: "text", text: `Unknown tool. Available tools: ${tools.map((candidate) => candidate.name).join(", ")}.` }],
      };
    }
    const raw = params.arguments === undefined ? {} : params.arguments;
    try {
      if (!isRecord(raw)) throw new ToolFailure(`${tool.name}: ${tool.usage}`);
      const parsed = tool.schema.safeParse(raw);
      if (!parsed.success) throw new ToolFailure(`${tool.name}: ${tool.usage}`);
      const safeArgs = parsed.data as Record<string, unknown>;
      requireSafeId(tool.name, "mission_id", typeof safeArgs.mission_id === "string" ? safeArgs.mission_id : undefined);
      requireSafeId(tool.name, "run_id", typeof safeArgs.run_id === "string" ? safeArgs.run_id : undefined);
      const payload = await tool.execute(parsed.data);
      return {
        ...resultBase(),
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (error) {
      const message = error instanceof ToolFailure ? error.message : `${tool.name}: the request could not be completed.`;
      return { ...resultBase(), isError: true, content: [{ type: "text", text: redactValue(message, root, needles) }] };
    }
  }

  async function handle(message: unknown): Promise<JsonRpcResponse | undefined> {
    if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return { jsonrpc: "2.0", id: extractId(message), error: { code: INVALID_REQUEST, message: "Invalid Request: expected a JSON-RPC 2.0 request object with a string method." } };
    }
    const id = extractId(message);
    if (id === null || message.method.startsWith("notifications/")) return undefined;

    const requested = requestedProtocolVersion(message);
    if (requested !== undefined && !isSupportedVersion(requested)) {
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: INVALID_PARAMS,
          message: `Unsupported protocol version. Supported versions: ${MCP_PROTOCOL_VERSIONS.join(", ")}.`,
          data: { supported: [...MCP_PROTOCOL_VERSIONS], requested },
        },
      };
    }

    switch (message.method) {
      case "server/discover":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            ...resultBase(),
            supportedVersions: [...MCP_PROTOCOL_VERSIONS],
            capabilities,
            serverInfo,
            _meta: { [SERVER_INFO_META_KEY]: serverInfo },
            ttlMs: LIST_TTL_MS,
            cacheScope: CACHE_SCOPE,
          },
        };
      case "initialize": {
        const params = isRecord(message.params) ? message.params : {};
        const requestedLegacy = typeof params.protocolVersion === "string" && isSupportedVersion(params.protocolVersion)
          ? params.protocolVersion
          : LATEST_LEGACY_PROTOCOL_VERSION;
        return { jsonrpc: "2.0", id, result: { ...resultBase(), protocolVersion: requestedLegacy, capabilities, serverInfo } };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: resultBase() };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            ...resultBase(),
            tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
            ttlMs: LIST_TTL_MS,
            cacheScope: CACHE_SCOPE,
          },
        };
      case "tools/call":
        if (!isRecord(message.params)) {
          return { jsonrpc: "2.0", id, error: { code: INVALID_PARAMS, message: "tools/call params must be an object with name and optional arguments." } };
        }
        return { jsonrpc: "2.0", id, result: await callTool(message.params) };
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: METHOD_NOT_FOUND, message: `Method not found. This server implements: server/discover, initialize, ping, tools/list, tools/call.` },
        };
    }
  }

  return { handle };
}

/** Modern clients declare the version in `params._meta`; a few put `_meta` on the request. */
function requestedProtocolVersion(message: Record<string, unknown>): string | undefined {
  const containers = [isRecord(message.params) ? message.params._meta : undefined, message._meta];
  for (const container of containers) {
    if (!isRecord(container)) continue;
    const version = container[PROTOCOL_VERSION_META_KEY];
    if (typeof version === "string") return version;
  }
  return undefined;
}

/**
 * Serves newline-delimited JSON-RPC over the given streams. Resolves when the
 * input ends; the caller owns closing the streams.
 */
export async function serveMcpStdio(
  options: McpServerOptions,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<void> {
  const server = createMcpServer(options);
  const decoder = new StringDecoder("utf8");
  let pending = "";

  async function writeLine(line: string): Promise<void> {
    if (!output.write(line.endsWith("\n") ? line : `${line}\n`)) {
      await once(output as unknown as EventEmitter, "drain");
    }
  }

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      await writeLine(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error: the line was not valid JSON." } }));
      return;
    }
    const response = await server.handle(parsed);
    if (response !== undefined) await writeLine(JSON.stringify(response));
  }

  for await (const chunk of input as unknown as AsyncIterable<string | Uint8Array>) {
    pending += typeof chunk === "string" ? chunk : decoder.write(Buffer.from(chunk));
    let boundary = pending.indexOf("\n");
    while (boundary >= 0) {
      const line = pending.slice(0, boundary);
      pending = pending.slice(boundary + 1);
      await handleLine(line.replace(/\r$/, ""));
      boundary = pending.indexOf("\n");
    }
  }
  const tail = pending + decoder.end();
  if (tail.trim() !== "") await handleLine(tail);
}
