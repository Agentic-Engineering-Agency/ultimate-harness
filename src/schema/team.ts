import { z } from "zod";

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

export const CanonicalTeamWorkerSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  adapter: z.string().min(1),
  run_id: z.string().min(1),
  artifact_scope: z.string().min(1),
  runtime_result_path: z.string().min(1).nullable(),
  status: CanonicalTeamWorkerStatusSchema,
  started_at: z.string(),
  finished_at: z.string().nullable(),
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
