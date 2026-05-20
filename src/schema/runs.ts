import { z } from "zod";

/**
 * UH-82: per-run artifact directories.
 *
 * `latest.json` at the mission root points at the most recent run.
 * `runs/index.json` carries an append-only history (status flips in place
 * on a single run's transition from `running` -> terminal).
 */

export const RunStatusSchema = z.enum([
  "running",
  "passed",
  "failed",
  "blocked",
  "cancelled",
  "timeout",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const LatestRunPointerSchema = z
  .object({
    schema_version: z.literal("uh.latest-run.v0"),
    run_id: z.string().min(1),
    started_at: z.string(),
    finished_at: z.string().nullable().optional(),
    status: RunStatusSchema,
  })
  .strict();
export type LatestRunPointer = z.infer<typeof LatestRunPointerSchema>;

export const RunsIndexEntrySchema = z
  .object({
    run_id: z.string().min(1),
    started_at: z.string(),
    finished_at: z.string().nullable().optional(),
    status: RunStatusSchema,
    runtime: z.string().optional(),
    // UH-90 — retention. Present + true means the per-run directory has
    // been pruned by the retention policy; the index entry survives so
    // the audit trail stays intact. Absent (i.e. entries written before
    // UH-90) is treated as "not archived" — no default is applied here
    // on purpose so a missing field round-trips as missing on rewrite.
    archived: z.boolean().optional(),
  })
  .strict();
export type RunsIndexEntry = z.infer<typeof RunsIndexEntrySchema>;

export const RunsIndexSchema = z
  .object({
    schema_version: z.literal("uh.runs-index.v0"),
    runs: z.array(RunsIndexEntrySchema),
  })
  .strict();
export type RunsIndex = z.infer<typeof RunsIndexSchema>;
