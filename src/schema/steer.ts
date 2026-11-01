import { z } from "zod";

/** Explicit record of a steer request outcome, written next to the run by the controller that could not apply it. */
export const SteerRecordSchema = z
  .object({
    schema_version: z.literal("uh.steer-record.v0").default("uh.steer-record.v0"),
    mission_id: z.string().min(1),
    run_id: z.string().min(1),
    status: z.literal("not_applied"),
    reason: z.string().min(1),
    message_digest: z.string().min(1),
    digest: z.string().min(1).optional(),
    recorded_at: z.string().datetime(),
  })
  .strict();
export type SteerRecord = z.infer<typeof SteerRecordSchema>;

/**
 * The operator-authored lineage of a resume, written in both directions:
 * `resumed_from` on the new run, `resumed_by` on the source run.
 */
export const ResumeLinkSchema = z
  .object({
    schema_version: z.literal("uh.resume-link.v0"),
    mission_id: z.string().min(1),
    run_id: z.string().min(1),
    runtime: z.string().min(1),
    resume_origin: z.literal("operator"),
    resumed_from: z.string().min(1).optional(),
    resumed_by: z.string().min(1).optional(),
    report: z.boolean().default(false),
    created_at: z.string().min(1),
  })
  .strict();
export type ResumeLink = z.infer<typeof ResumeLinkSchema>;
