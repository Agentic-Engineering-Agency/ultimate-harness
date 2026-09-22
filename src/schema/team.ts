import { z } from "zod";
import { RuntimeLimitsSchema } from "./runtime-control.js";

export const CanonicalTeamStatusSchema = z.enum([
  "running",
  "passed",
  "passed_partial",
  "failed",
  "blocked",
]);

export const CanonicalTeamWorkerStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "error",
]);

export const CanonicalTeamLeaderStatusSchema = z.enum([
  "queued",
  "integrating",
  "succeeded",
  "failed",
  "blocked",
]);

const CanonicalWorkerContractSchema = z.object({
  objective: z.string().min(1).optional(),
  constraints: z.array(z.string()).optional(),
  runtime_config_overrides: z.record(z.string(), z.unknown()).optional(),
  limits: RuntimeLimitsSchema.omit({ memory_mb: true }).optional(),
  expected_outputs: z.object({
    files: z.array(z.string().min(1)),
  }).strict().optional(),
  seed: z.number().int().nonnegative().optional(),
}).strict();

const CanonicalWorkerOutputSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["passed", "failed"]),
  notes: z.string().optional(),
}).strict();

/**
 * Salvage record for a worker that settled as failed with a recoverable stop
 * code (turn_limit / timeout / deadline / stall / policy). Records whether the
 * worktree held non-protected changes (`eligible`) and, when it did, whether
 * the worker's declared outputs and its `verification.required_checks` both
 * passed. A committed `branch` is only written when both passed — the leader
 * never merges a failed worker automatically.
 */
const CanonicalWorkerSalvageSchema = z.object({
  eligible: z.boolean(),
  outputs_passed: z.boolean(),
  checks_passed: z.boolean(),
  branch: z.string().min(1),
}).strict();

/**
 * Changed paths a worker left outside its resolved write roots (and that are
 * not protected), so they were never staged into the worker commit. `paths` is
 * capped for the canonical state; `total` is the true count.
 */
const CanonicalWorkerOutOfRootsSchema = z.object({
  paths: z.array(z.string().min(1)),
  total: z.number().int().nonnegative(),
}).strict();

export const CanonicalTeamWorkerSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  mission_id: z.string().min(1).optional(),
  adapter: z.string().min(1),
  run_id: z.string().min(1),
  artifact_scope: z.string().min(1),
  runtime_result_path: z.string().min(1).nullable(),
  status: CanonicalTeamWorkerStatusSchema,
  completion: z.enum(["complete", "incomplete"]).default("complete"),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  contract: CanonicalWorkerContractSchema.optional(),
  blocked_reason: z.string().optional(),
  outputs: z.array(CanonicalWorkerOutputSchema).optional(),
  salvage: CanonicalWorkerSalvageSchema.optional(),
  /**
   * Changed paths left unstaged because they fell outside the worker's write
   * roots and declared outputs. Present only when such paths existed.
   */
  out_of_roots: CanonicalWorkerOutOfRootsSchema.optional(),
  /**
   * Commit id every worker (and the leader) branched from, resolved once per
   * team run. Also written to `git config branch.<branch>.base` so independent
   * review reads the exact fork point instead of a moving ref.
   */
  base_commit: z.string().min(1).optional(),
}).strict();

export const CanonicalTeamLeaderSchema = z.object({
  role: z.string().min(1),
  adapter: z.string().min(1),
  status: CanonicalTeamLeaderStatusSchema,
}).strict();

export const CanonicalTeamStateSchema = z.object({
  schema_version: z.literal("uh.team-run.v0"),
  mission_id: z.string().min(1),
  run_id: z.string().min(1),
  status: CanonicalTeamStatusSchema,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  integration_report_path: z.string().min(1),
  verification_status: z.enum(["passed", "failed", "blocked", "waived"]).nullable(),
  admission_blocked_reason: z.string().min(1).optional(),
  /** Waves admitted despite unknown completed cost, one explicit note each. */
  admission_notes: z.array(z.string().min(1)).optional(),
  leader: CanonicalTeamLeaderSchema,
  workers: z.array(CanonicalTeamWorkerSchema),
}).strict();

export type CanonicalTeamStatus = z.infer<typeof CanonicalTeamStatusSchema>;
export type CanonicalTeamWorkerStatus = z.infer<typeof CanonicalTeamWorkerStatusSchema>;
export type CanonicalTeamState = z.infer<typeof CanonicalTeamStateSchema>;
export type CanonicalTeamWorker = z.infer<typeof CanonicalTeamWorkerSchema>;

export function validateCanonicalTeamState(data: unknown): CanonicalTeamState {
  return CanonicalTeamStateSchema.parse(data);
}
