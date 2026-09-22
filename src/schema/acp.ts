import { z } from "zod";

/**
 * Standard JSON-RPC 2.0 and Agent-Client Protocol (ACP) Schemas.
 * Covers initialization, session lifecycle, prompts, notifications, and tool events.
 */

export const AcpJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const AcpJsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }).strict().optional(),
}).strict();

export const AcpNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const AcpInitializeResultSchema = z.object({
  protocol_version: z.string().default("1.0"),
  agent_info: z.object({
    name: z.string().min(1),
    version: z.string().optional(),
    model: z.string().optional(),
  }).passthrough().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const AcpSessionNewResultSchema = z.object({
  session_id: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const AcpSessionPromptResultSchema = z.object({
  stop_reason: z.enum(["end_turn", "max_turns", "cancelled", "error", "refusal"]).default("end_turn"),
  final_text: z.string().optional(),
  usage: z.object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

export const AcpRuntimeConfigSchema = z.object({
  server_command: z.string().min(1).default("acp-agent"),
  server_args: z.array(z.string()).default([]),
  model: z.string().optional(),
  timeout_ms: z.number().int().positive().default(600_000),
  protocol_version: z.string().default("1.0"),
}).passthrough();

export type AcpRuntimeConfig = z.infer<typeof AcpRuntimeConfigSchema>;
export type AcpInitializeResult = z.infer<typeof AcpInitializeResultSchema>;
export type AcpSessionNewResult = z.infer<typeof AcpSessionNewResultSchema>;
export type AcpSessionPromptResult = z.infer<typeof AcpSessionPromptResultSchema>;
