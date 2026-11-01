import { z } from "zod";

/**
 * One worker-memory reservation file under `.harness/worker-admission/reservations`. Files written before the version
 * field existed still parse (the field defaults).
 */
export const ReservationFileSchema = z.object({
  schema_version: z.literal("uh.reservation.v0").default("uh.reservation.v0"),
  reserved_mb: z.number().int().positive(),
  created_at: z.string().datetime(),
  release_after_ms: z.number().int().positive(),
  pid: z.number().int().positive(),
  worker: z.string().min(1).optional(),
}).strict();
export type ReservationFile = z.infer<typeof ReservationFileSchema>;
