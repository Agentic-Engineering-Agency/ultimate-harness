import { z } from "zod";
import { RuntimeUsageSchema } from "./artifacts.js";

/** Relative roots whose mutation is a hard runtime policy stop. */
export const DEFAULT_PROTECTED_PATHS = [".harness", ".commandcode", ".omp", ".pi", ".git"];

/** Input fields accepted on mission and worker guard blocks. */
export const ToolGuardFieldsSchema = z.object({
  write_roots: z.array(z.string().min(1)).optional(),
  deny_git_mutations: z.boolean().optional(),
  deny_package_installs: z.boolean().optional(),
  deny_network_clients: z.boolean().optional(),
  agent_clients: z.array(z.string().min(1)).optional(),
  allow_native_subagents: z.boolean().optional(),
}).strict();
export type ToolGuardFields = z.infer<typeof ToolGuardFieldsSchema>;

/** The resolved per-tool guard policy. */
export const ToolGuardPolicySchema = z.object({
  write_roots: z.array(z.string().min(1)).default(["."]),
  deny_git_mutations: z.boolean().default(true),
  deny_package_installs: z.boolean().default(true),
  deny_network_clients: z.boolean().default(true),
  agent_clients: z.array(z.string().min(1)).default(["omp", "cmdc", "codex", "pi", "hermes", "aider", "gemini", "claude", "opencode", "qwen", "goose", "cursor-agent"]),
  /** Lets a runtime use its own sub-agent tool. Delegated routes are still held to the assigned route. */
  allow_native_subagents: z.boolean().default(false),
}).strict();
export type ToolGuardPolicy = z.infer<typeof ToolGuardPolicySchema>;

export function resolveToolGuardPolicy(
  fields: ToolGuardFields | undefined,
  needsNetwork = false,
): ToolGuardPolicy {
  return ToolGuardPolicySchema.parse({
    ...fields,
    deny_network_clients: fields?.deny_network_clients ?? !needsNetwork,
  });
}

/** Durable run artifact containing the applied policy and path protections. */
export const ToolGuardArtifactSchema = ToolGuardPolicySchema.extend({
  schema_version: z.literal("uh.tool-guard.v0"),
  worker_root: z.string().min(1),
  protected_paths: z.array(z.string().min(1)),
  /** Only the explicit Claude Code orchestrator role may set this marker. */
  controller_commands: z.boolean().default(false),
  /**
   * sha256 of each harness-written policy file, keyed by the path relative to
   * `worker_root`. The acceptance `protected_paths_untouched` invariant treats
   * this as the baseline: later copies must match it, so a policy file
   * rewritten identically everywhere is still caught.
   */
  written_files: z.record(z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
}).strict();
export type ToolGuardArtifact = z.infer<typeof ToolGuardArtifactSchema>;

/** Optional limits are enforced by UH, independently of model compliance. */
export const RuntimeLimitsSchema = z.object({
  timeout_ms: z.number().int().positive().optional(),
  memory_mb: z.number().int().positive().optional(),
  startup_timeout_ms: z.number().int().positive().optional(),
  stall_timeout_ms: z.number().int().positive().optional(),
  max_thinking_ms: z.number().int().positive().optional(),
  max_turns: z.number().int().positive().optional(),
  max_denials: z.number().int().positive().optional(),
  max_repeated_failures: z.number().int().positive().optional(),
  max_output_bytes: z.number().int().positive().safe().optional(),
  protected_paths: z.array(z.string().min(1)).optional(),
}).strict();
export type RuntimeLimits = z.infer<typeof RuntimeLimitsSchema>;
export const TeamResourceLimitsSchema = z.object({
  max_parallel: z.number().int().positive().default(4),
  worker_memory_mb: z.number().int().positive().optional(),
  reserve_memory_mb: z.number().int().nonnegative().default(1024),
  max_cost_usd: z.number().positive().optional(),
  worker_cost_reservation_usd: z.number().positive().optional(),
  /**
   * What an unknown completed worker cost does to the next wave. `block` is the
   * default: unknown cost is never treated as zero. `admit` lets the next wave
   * proceed for fleets that cannot report price (for example Command Code) while
   * every such wave records an explicit admission note.
   */
  unknown_cost: z.enum(["block", "admit"]).default("block"),
}).strict().superRefine((limits, ctx) => {
  if ((limits.max_cost_usd === undefined) !== (limits.worker_cost_reservation_usd === undefined)) {
    ctx.addIssue({ code: "custom", message: "Cost admission requires both max_cost_usd and worker_cost_reservation_usd" });
  }
});
export type TeamResourceLimits = z.input<typeof TeamResourceLimitsSchema>;

export const RuntimeRouteSchema = z.object({
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
}).strict();
export type RuntimeRoute = z.infer<typeof RuntimeRouteSchema>;

/**
 * `steered` is not a terminal cancel: the owning controller stops the attempt
 * only to resume the same native session with an operator message. It is
 * resumable and never counts against the recovery `max_resumes` budget.
 */
export const RuntimeStopCodeSchema = z.enum(["startup", "stall", "timeout", "turn_limit", "deadline", "output_limit", "repeated_failure", "denial_budget", "policy", "route_mismatch", "route_unverified", "cancelled", "steered", "runtime_error", "controller_error", "controller_lost"]);
export type RuntimeStopCode = z.infer<typeof RuntimeStopCodeSchema>;
export const RuntimeRecoveryDeadlineSchema = z.object({
  grace_turns: z.number().int().min(1).default(3),
  grace_timeout_ms: z.number().int().positive().default(300000),
  notes: z.string().optional(),
}).strict();
export type RuntimeRecoveryDeadline = z.infer<typeof RuntimeRecoveryDeadlineSchema>;
export const RuntimeRecoveryPolicySchema = z.object({
  max_resumes: z.number().int().nonnegative(),
  notes: z.string().min(1),
  on_deadline: RuntimeRecoveryDeadlineSchema.optional(),
}).strict();
export const RuntimeRecoveryRecordSchema = z.object({
  schema_version: z.literal("uh.runtime-recovery.v0"),
  source_run_id: z.string().min(1),
  session_id: z.string().min(1),
  notes: z.string().min(1),
  source_stop_code: RuntimeStopCodeSchema.optional(),
  source_stop_reason: z.string().optional(),
  grace: z.boolean().default(false),
}).strict();
export const RuntimeControlSchema = z.object({
  schema_version: z.literal("uh.runtime-control.v0"),
  permission_mode: z.enum(["guard", "yolo", "prompt"]).optional(),
  mission_id: z.string().min(1),
  run_id: z.string().min(1),
  runtime: z.string().min(1),
  controller_pid: z.number().int().positive(),
  started_at: z.string().datetime(),
  heartbeat_at: z.string().datetime(),
  ready_at: z.string().datetime().optional(),
  session_id: z.string().min(1).optional(),
  expected_route: RuntimeRouteSchema.optional(),
  review_request_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(["running", "passed", "failed", "blocked", "cancelled"]),
  stop_code: RuntimeStopCodeSchema.optional(),
  stop_reason: z.string().optional(),
  guard_armed: z.boolean().optional(),
  turns: z.number().int().nonnegative(),
  denials: z.number().int().nonnegative(),
  /** Calls the runtime denied natively without invoking the guard hook; also counted in `denials`. */
  native_refusals: z.number().int().nonnegative().optional(),
  inflight_tools: z.number().int().nonnegative(),
  usage: RuntimeUsageSchema.optional(),
  settlement_confirmed: z.boolean().optional(),
  guardian: z.object({
    mode: z.enum(["cache", "per_run"]),
    path: z.string().min(1),
  }).strict().optional(),
  peak_memory_bytes: z.number().int().nonnegative().optional(),
}).strict();
export type RuntimeControl = z.infer<typeof RuntimeControlSchema>;

export const WindowsJobResultSchema = z.object({
  exit_code: z.number().int(),
  peak_memory_bytes: z.number().int().nonnegative(),
  controller_lost: z.boolean(),
  settled: z.boolean(),
  /** Whether the guardian attached a headless pseudoconsole instead of the CREATE_NO_WINDOW fallback. */
  pseudoconsole: z.boolean().optional(),
}).strict();

export const RuntimeCancelRequestSchema = z.object({
  schema_version: z.literal("uh.runtime-cancel-request.v0"),
  mission_id: z.string().min(1),
  run_id: z.string().min(1),
  requested_at: z.string().datetime(),
}).strict();

/**
 * A `uh steer` request, written next to a live attempt's `runtime-control.json`.
 * The owning controller consumes it: it stops the attempt (stop code `steered`)
 * and resumes the same native session with `message` as the first instruction.
 */
export const RuntimeSteerRequestSchema = z.object({
  schema_version: z.literal("uh.runtime-steer-request.v0"),
  mission_id: z.string().min(1),
  run_id: z.string().min(1),
  message: z.string().min(1),
  report: z.boolean().default(false),
  requested_at: z.string().datetime(),
}).strict();
export type RuntimeSteerRequest = z.infer<typeof RuntimeSteerRequestSchema>;
