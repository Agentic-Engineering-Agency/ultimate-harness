import { z } from "zod";

/**
 * UH run digest — the live projection of a supervised attempt.
 *
 * The supervisor already consumes every native event as it arrives. This
 * document is that same stream reduced, incrementally, to a bounded snapshot:
 * what the run is doing right now, its recent completed calls, the files it
 * wrote, its denials and native refusals, the tokens it spent, the
 * deterministic loop signals over its recent calls, and its last assistant
 * text. `uh report` reads this instead of re-projecting the raw stream, so a
 * report stays instant even on a multi-megabyte event log.
 *
 * Every path in every field is relative to the run's working directory, or one
 * of the bounded placeholders the projection publishes (`<outside>`,
 * `<pattern>`, `unknown`); an absolute path never appears here. The last
 * assistant text is sanitized before it is bounded.
 *
 * The digest is a convenience index, never an authority: it is written
 * best-effort on the heartbeat cadence and at settlement, and a reader must
 * fall back to the raw event stream when it is absent or malformed.
 */
export const RUN_DIGEST_SCHEMA_VERSION = "uh.run-digest.v0" as const;

/** What the run is doing now. */
export const RunDigestActivityKindSchema = z.enum(["reasoning", "tool", "text", "idle"]);
export type RunDigestActivityKind = z.infer<typeof RunDigestActivityKindSchema>;

/**
 * `detail` is the tool name and its relative target for a `tool` activity, or
 * the reasoning character count for a `reasoning` activity.
 */
export const RunDigestCurrentActivitySchema = z
  .object({
    kind: RunDigestActivityKindSchema,
    since: z.string().datetime(),
    detail: z.union([z.string().min(1), z.number().int().nonnegative()]).optional(),
  })
  .strict();
export type RunDigestCurrentActivity = z.infer<typeof RunDigestCurrentActivitySchema>;

export const RunDigestCallStatusSchema = z.enum(["ok", "failed", "denied"]);
export type RunDigestCallStatus = z.infer<typeof RunDigestCallStatusSchema>;

/** The projected kind of a call, matching the loop probe's classification. */
export const RunDigestToolKindSchema = z.enum(["read", "write", "shell", "other"]);
export type RunDigestToolKind = z.infer<typeof RunDigestToolKindSchema>;

export const RunDigestErrorClassSchema = z.enum(["none", "nonzero_exit", "tool_error", "denied"]);
export type RunDigestErrorClass = z.infer<typeof RunDigestErrorClassSchema>;

/** The guard class of a denial, or `denied` when the stream disclosed no finer class. */
export const RunDigestGuardClassSchema = z.enum([
  "write_outside",
  "git_mutation",
  "delete_outside",
  "kill_or_format",
  "package_install",
  "network_client",
  "agent_client",
  "protected_root",
  "guard_tamper",
  "containment_escape",
  "virtual_device",
  "denied",
]);
export type RunDigestGuardClass = z.infer<typeof RunDigestGuardClassSchema>;

/** One completed tool call, reduced to the fields a reader is allowed to name. */
export const RunDigestCallSchema = z
  .object({
    tool: z.string().min(1),
    kind: RunDigestToolKindSchema,
    target: z.string(),
    status: RunDigestCallStatusSchema,
    error_class: RunDigestErrorClassSchema,
    started_at: z.string().datetime(),
    duration_ms: z.number().int().nonnegative(),
  })
  .strict();
export type RunDigestCall = z.infer<typeof RunDigestCallSchema>;

/** Distinct write targets that completed successfully, capped, with the true total. */
export const RunDigestFilesWrittenSchema = z
  .object({
    files: z.array(z.string()),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type RunDigestFilesWritten = z.infer<typeof RunDigestFilesWrittenSchema>;

export const RunDigestDenialSchema = z
  .object({
    class: RunDigestGuardClassSchema,
    tool: z.string().min(1),
    target: z.string(),
  })
  .strict();
export type RunDigestDenial = z.infer<typeof RunDigestDenialSchema>;

/** Token counters summed from the native usage events the supervisor already reads. */
export const RunDigestUsageSchema = z
  .object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    cache_read_tokens: z.number().nonnegative().optional(),
    cache_write_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
  })
  .strict();
export type RunDigestUsage = z.infer<typeof RunDigestUsageSchema>;

/** A tool call that never completed and stopped reporting for longer than the stall window. */
export const RunDigestLongRunningToolSchema = z
  .object({
    tool: z.string().min(1),
    target: z.string(),
    minutes: z.number().int().nonnegative(),
  })
  .strict();
export type RunDigestLongRunningTool = z.infer<typeof RunDigestLongRunningToolSchema>;

export const RunDigestLoopSignalsSchema = z
  .object({
    identical_repeats: z.number().int().nonnegative(),
    alternating_pairs: z.number().int().nonnegative(),
    distinct_targets: z.number().int().nonnegative(),
    /** Calls still in flight with no end event and no output for more than five minutes. */
    long_running_tools: z.array(RunDigestLongRunningToolSchema),
  })
  .strict();
export type RunDigestLoopSignals = z.infer<typeof RunDigestLoopSignalsSchema>;

/** Bytes of tool output attributed to one projection kind. */
export const RunDigestToolOutputBytesSchema = z
  .object({
    read: z.number().int().nonnegative(),
    write: z.number().int().nonnegative(),
    shell: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  })
  .strict();
export type RunDigestToolOutputBytes = z.infer<typeof RunDigestToolOutputBytesSchema>;

/**
 * The efficiency view of a run. Every field is optional and is omitted rather
 * than zero-filled when its measurement is unavailable: a runtime that reports
 * no per-request context leaves the context fields absent, never `0`.
 */
export const RunDigestEfficiencySchema = z
  .object({
    /** Input tokens (context) at the first, sixth and last model request. */
    context_tokens_first: z.number().int().nonnegative().optional(),
    context_tokens_after_five: z.number().int().nonnegative().optional(),
    context_tokens_last: z.number().int().nonnegative().optional(),
    /** Fraction of recorded turns that carried exactly one tool call. */
    single_tool_turn_share: z.number().min(0).max(1).optional(),
    read_calls: z.number().int().nonnegative().optional(),
    /** Read calls that repeated an earlier `(path, line range)`; a new range is not a re-read. */
    re_read_calls: z.number().int().nonnegative().optional(),
    tool_output_bytes: RunDigestToolOutputBytesSchema.optional(),
    model_time_ms: z.number().nonnegative().optional(),
    tool_time_ms: z.number().nonnegative().optional(),
  })
  .strict();
export type RunDigestEfficiency = z.infer<typeof RunDigestEfficiencySchema>;

export const RunDigestSchema = z
  .object({
    schema_version: z.literal(RUN_DIGEST_SCHEMA_VERSION),
    generated_at: z.string().datetime(),
    runtime: z.string().min(1),
    turns: z.number().int().nonnegative(),
    current_activity: RunDigestCurrentActivitySchema,
    recent_calls: z.array(RunDigestCallSchema),
    files_written: RunDigestFilesWrittenSchema,
    denials: z.array(RunDigestDenialSchema),
    native_refusals: z.number().int().nonnegative(),
    usage: RunDigestUsageSchema,
    /** The measured efficiency of the attempt; sparse, never zero-filled. */
    efficiency: RunDigestEfficiencySchema,
    loop_signals: RunDigestLoopSignalsSchema,
    last_assistant_text: z.string().optional(),
  })
  .strict();
export type RunDigest = z.infer<typeof RunDigestSchema>;
