import { z } from "zod";

const RelativePathSchema = z.string().min(1).refine((value) => !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.split(/[\\/]/).includes(".."), "path must be relative to its owner");

const AcceptanceWorkerExpectedSchema = z.object({
  status: z.string().min(1),
  blocked_reason: z.string().min(1).optional(),
  admission_blocked_reason: z.string().min(1).optional(),
}).strict();

const AcceptanceFactSourceSchema = z.enum(["first", "last"]);

/**
 * Harness invariants a mission run must satisfy regardless of what the model
 * chose to do. Each name produces one observed fact (`true`, or an array of the
 * offending paths/lines) and, when false, a mismatch. The runner evaluates them
 * from the run's own artifacts (worker worktrees, guard logs, runtime control
 * receipts); see `evaluateAcceptanceInvariants` in `src/harness/acceptance.ts`.
 */
export const AcceptanceInvariantSchema = z.enum([
  "no_writes_outside_roots",
  "no_worker_commits",
  "no_package_install",
  "protected_paths_untouched",
  "guard_log_consistent",
]);
export type AcceptanceInvariant = z.infer<typeof AcceptanceInvariantSchema>;

/**
 * Runner-side actions injected into a live run: cancel the run once it is
 * ready (`cancel_after_ready`) or steer it once it is ready
 * (`steer_after_ready`, carrying the operator message). The injected action and
 * its outcome are recorded in the evidence.
 */
export const AcceptanceInjectSchema = z
  .object({
    cancel_after_ready: z.boolean().optional(),
    steer_after_ready: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) => value.cancel_after_ready === true || value.steer_after_ready !== undefined,
    "inject requires cancel_after_ready: true or steer_after_ready: <message>",
  );
export type AcceptanceInject = z.infer<typeof AcceptanceInjectSchema>;

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
  /** Harness invariants judged from the run's own artifacts. */
  invariants: z.array(AcceptanceInvariantSchema).optional(),
  /**
   * Mechanisms the report should attest fired (`guard_package_install`,
   * `guard_git_mutation`, `guard_write_outside`, `guard_tamper`,
   * `denial_budget`, ...). These are reported, never mismatches, so a model
   * that behaves well still passes while the report shows which fired.
   */
  exercised_report: z.array(z.string().min(1)).optional(),
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
  /**
   * Repository-relative glob patterns naming the files whose behaviour the
   * probe asserts. When absent, evidence freshness falls back to a conservative
   * default (the entry's own mission directory, `acceptance/support/**`, and
   * `src/**`). See `acceptanceInputs` in `src/harness/acceptance.ts`.
   */
  inputs: z.array(RelativePathSchema).optional(),
  /** Runner-side actions injected into a live run (see `AcceptanceInjectSchema`). */
  inject: AcceptanceInjectSchema.optional(),
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
  /**
   * sha256 over the sorted (relative path, content sha256) list of the entry's
   * resolved inputs plus the runtime id, runtime version when known, and model.
   * Stamped when evidence is written or rebound; when present it supersedes
   * `harness_commit` for freshness (which is retained as provenance only).
   */
  input_digest: z.string().min(1).optional(),
  /** Number of tracked files that matched the entry's inputs. */
  inputs_resolved: z.number().int().nonnegative().optional(),
  /** The legacy `harness_commit` a rebind revalidated this record against. */
  rebound_from_commit: z.string().min(1).optional(),
  /**
   * The runtime version the digest was computed with (`cmdc --version
   * --no-auto-update` for command-code, `<cli> --version` otherwise), or
   * `"unknown"` when it could not be read. Freshness reproduces the digest with
   * this value, so it must be recorded alongside the digest.
   */
  runtime_version: z.string().min(1).optional(),
}).strict();
export type AcceptanceEvidence = z.infer<typeof AcceptanceEvidenceSchema>;

export function validateAcceptanceRegistry(value: unknown): AcceptanceRegistry { return AcceptanceRegistrySchema.parse(value); }
export function validateAcceptanceEvidence(value: unknown): AcceptanceEvidence { return AcceptanceEvidenceSchema.parse(value); }
