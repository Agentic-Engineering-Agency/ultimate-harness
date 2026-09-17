import { z } from "zod";

const RelativePathSchema = z.string().min(1).refine((value) => !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes(".."), "path must be relative to its owner");

const AcceptanceWorkerExpectedSchema = z.object({
  status: z.string().min(1),
  blocked_reason: z.string().min(1).optional(),
  admission_blocked_reason: z.string().min(1).optional(),
}).strict();

const AcceptanceFactSourceSchema = z.enum(["first", "last"]);

export const AcceptanceExpectedSchema = z.object({
  status: z.string().min(1),
  stop_code: z.string().min(1).optional(),
  resumed: z.boolean().optional(),
  required_files: z.array(RelativePathSchema).optional(),
  required_records: z.record(z.string(), z.unknown()).optional(),
  workers: z.record(z.string(), AcceptanceWorkerExpectedSchema).optional(),
  outputs: z.record(z.string(), z.string().min(1)).optional(),
  settlement_confirmed: z.boolean().optional(),
  guardian_receipt: z.boolean().optional(),
  path_style: z.literal("forward_slashes").optional(),
  fact_sources: z.record(z.string(), AcceptanceFactSourceSchema).optional(),
}).strict();
export type AcceptanceExpected = z.infer<typeof AcceptanceExpectedSchema>;

export const AcceptanceRegistryEntrySchema = z.object({
  title: z.string().min(1),
  capability: z.string().min(1),
  mission: RelativePathSchema,
  shape: z.enum(["single", "team"]),
  runtime: z.string().min(1),
  model: z.string().min(1).optional(),
  real_mission: z.enum(["real", "not_applicable"]).default("real"),
  reason: z.string().default(""),
  expected: AcceptanceExpectedSchema,
  freshness_days: z.number().int().positive().default(30),
  notes: z.string().default(""),
}).strict();
export type AcceptanceRegistryEntry = z.infer<typeof AcceptanceRegistryEntrySchema>;

export const AcceptanceRegistrySchema = z.object({
  schema_version: z.literal("uh.acceptance-registry.v0"),
  entries: z.record(z.string().min(1), AcceptanceRegistryEntrySchema),
}).strict();
export type AcceptanceRegistry = z.infer<typeof AcceptanceRegistrySchema>;

export const AcceptanceMismatchSchema = z.object({
  field: z.string().min(1),
  expected: z.unknown(),
  observed: z.unknown().optional(),
}).strict();
export const AcceptanceEvidenceSchema = z.object({
  schema_version: z.literal("uh.acceptance-evidence.v0"),
  capability: z.string().min(1),
  outcome: z.enum(["passed", "failed"]),
  checked_at: z.string().datetime(),
  harness_commit: z.string().min(1),
  runtime: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  cost_usd: z.union([z.number().nonnegative(), z.literal("unknown")]),
  workspace: RelativePathSchema.or(z.string().min(1)),
  run_ids: z.array(z.string().min(1)),
  mission_id: z.string().min(1),
  expected: AcceptanceExpectedSchema,
  observed: z.record(z.string(), z.unknown()),
  fact_sources: z.record(z.string(), z.string().min(1)),
  mismatches: z.array(AcceptanceMismatchSchema),
  artifact_root: z.string().min(1),
}).strict();
export type AcceptanceEvidence = z.infer<typeof AcceptanceEvidenceSchema>;

export function validateAcceptanceRegistry(value: unknown): AcceptanceRegistry { return AcceptanceRegistrySchema.parse(value); }
export function validateAcceptanceEvidence(value: unknown): AcceptanceEvidence { return AcceptanceEvidenceSchema.parse(value); }
