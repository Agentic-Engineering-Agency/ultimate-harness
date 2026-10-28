import { z } from "zod";

/**
 * Agent-Client Protocol (ACP) v1 wire schemas.
 *
 * ACP is bidirectional JSON-RPC 2.0 over stdio. The client (`ultimate-harness`)
 * starts the agent server, drives the `initialize` → `session/new` →
 * `session/prompt` lifecycle, and must also answer the agent's own requests
 * (`session/request_permission`, `fs/*`, `terminal/*`) so the agent never
 * stalls. These schemas are applied to every untrusted agent payload — the
 * wire format is camelCase with an integer major `protocolVersion`.
 *
 * Reference: Agent Client Protocol v1 — Initialization, Session Setup, Prompt Turn.
 */

/** ACP majors the protocol version as a single integer (e.g. `1`). */
export const AcpProtocolVersionSchema = z.number().int().positive();

export const AcpJsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
}).strict();

export const AcpJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const AcpJsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

/**
 * A JSON-RPC 2.0 response. Exactly one of `result`/`error` must be present;
 * a response carries no `method`.
 */
export const AcpJsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: AcpJsonRpcErrorSchema.optional(),
}).superRefine((message, ctx) => {
  if (message.result !== undefined && message.error !== undefined) {
    ctx.addIssue({ code: "custom", message: "JSON-RPC response cannot carry both result and error" });
  }
  if (message.result === undefined && message.error === undefined) {
    ctx.addIssue({ code: "custom", message: "JSON-RPC response must carry result or error" });
  }
});

/** ACP content blocks; `text` blocks carry the prompt and streamed agent text. */
export const AcpContentBlockSchema = z.object({
  type: z.string().min(1),
  text: z.string().optional(),
}).passthrough();

export const AcpClientInfoSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  version: z.string().optional(),
}).strict();

export const AcpInitializeResultSchema = z.object({
  protocolVersion: AcpProtocolVersionSchema.optional(),
  agentInfo: z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    version: z.string().optional(),
  }).passthrough().optional(),
  agentCapabilities: z.record(z.string(), z.unknown()).optional(),
  authMethods: z.array(z.unknown()).optional(),
}).passthrough();

export const AcpSessionNewResultSchema = z.object({
  sessionId: z.string().min(1),
}).passthrough();

/** ACP v1 prompt-turn stop reasons (distinct from the harness result statuses). */
export const AcpStopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);
export type AcpStopReason = z.infer<typeof AcpStopReasonSchema>;

export const AcpPromptUsageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  totalTokens: z.number().nonnegative().optional(),
}).passthrough();

export const AcpSessionPromptResultSchema = z.object({
  stopReason: AcpStopReasonSchema.default("end_turn"),
  usage: AcpPromptUsageSchema.optional(),
}).passthrough();

/** `session/update` notification params (streamed agent output). */
export const AcpSessionUpdateSchema = z.object({
  sessionId: z.string().min(1).optional(),
  update: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

/**
 * A `session/new` MCP server. stdio servers carry a command/args/env triple;
 * http servers carry a URL and headers. Strict so an unknown key in an entry is
 * rejected rather than silently dropped. Values are never persisted to artifacts.
 */
export const AcpMcpServerStdioSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
}).strict();

export const AcpMcpServerHttpSchema = z.object({
  type: z.literal("http"),
  name: z.string().min(1),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
}).strict();

export const AcpMcpServerSchema = z.union([AcpMcpServerHttpSchema, AcpMcpServerStdioSchema]);
export type AcpMcpServer = z.infer<typeof AcpMcpServerSchema>;

/**
 * A `drop` entry is an exact variable name or a `NAME_PREFIX*` pattern; no other
 * glob syntax is accepted.
 */
export const ACP_ENV_DROP_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*\*?$/;

export const AcpEnvPolicySchema = z.object({
  set: z.record(z.string(), z.string()).default({}),
  drop: z.array(z.string().regex(ACP_ENV_DROP_PATTERN, "Expected an exact variable name or a NAME_PREFIX* pattern")).default([]),
}).strict();
export type AcpEnvPolicy = z.infer<typeof AcpEnvPolicySchema>;

/**
 * Strict schema for `.harness/adapters/acp.yaml` → `config.runtime_config`.
 *
 * Strict so typos at adapter-load or mission-override time raise a Zod error
 * instead of being silently dropped.
 */
export const AcpRuntimeConfigSchema = z.object({
  server_command: z.string().min(1).default("acp-agent"),
  server_args: z.array(z.string()).default([]),
  model: z.string().optional(),
  timeout_ms: z.number().int().positive().default(600_000),
  protocol_version: AcpProtocolVersionSchema.default(1),
  mcp_servers: z.array(AcpMcpServerSchema).default([]),
  env: AcpEnvPolicySchema.default({ set: {}, drop: [] }),
}).strict();

export type AcpRuntimeConfig = z.infer<typeof AcpRuntimeConfigSchema>;
export type AcpInitializeResult = z.infer<typeof AcpInitializeResultSchema>;
export type AcpSessionNewResult = z.infer<typeof AcpSessionNewResultSchema>;
export type AcpSessionPromptResult = z.infer<typeof AcpSessionPromptResultSchema>;
export type AcpSessionUpdate = z.infer<typeof AcpSessionUpdateSchema>;
