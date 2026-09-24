import { z } from "zod";

/**
 * UH intervention ledger — the moments a run needed correction.
 *
 * A steer, a kill, a `run-team --replace`, a review that did not pass, a
 * supervision stop: each is an intervention, and each is the main learning
 * signal. This document is one such record. The ledger is append-only JSON
 * lines; a status change is a *new* line that references an entry's id, never a
 * rewrite, so the file keeps both what was believed and what changed.
 */
export const INTERVENTION_SCHEMA_VERSION = "uh.intervention.v0" as const;

/** Who intervened: the human owner, the orchestrating agent, supervision, a review, or a guard. */
export const InterventionSourceSchema = z.enum(["owner", "orchestrator", "supervisor", "review", "guard"]);
export type InterventionSource = z.infer<typeof InterventionSourceSchema>;

/** What kind of moment this was. */
export const InterventionTriggerSchema = z.enum(["steer", "kill", "replace", "review", "stop", "note"]);
export type InterventionTrigger = z.infer<typeof InterventionTriggerSchema>;

/** The category of the cause behind the intervention. */
export const InterventionCauseSchema = z.enum(["tool", "info", "permission", "capability", "unclear-spec", "unknown"]);
export type InterventionCause = z.infer<typeof InterventionCauseSchema>;

/** How the cause was wrong: missing, incorrect, or insufficient. */
export const InterventionQualifierSchema = z.enum(["missing", "incorrect", "insufficient", "unknown"]);
export type InterventionQualifier = z.infer<typeof InterventionQualifierSchema>;

/** Where the intervention sits: open, its fix landed, mechanically or owner verified, or an owner decision. */
export const InterventionStatusSchema = z.enum(["open", "landed", "verified", "owner-decision"]);
export type InterventionStatus = z.infer<typeof InterventionStatusSchema>;

/** Optional pointers to the run, mission, or team the intervention concerns. */
export const InterventionRefsSchema = z.object({
  run_id: z.string().min(1).optional(),
  mission_id: z.string().min(1).optional(),
  team_id: z.string().min(1).optional(),
}).strict();
export type InterventionRefs = z.infer<typeof InterventionRefsSchema>;

const Text = z.string().trim().min(1);

/**
 * One intervention. `evidence` is required once a fix has `landed`; `verified_by`
 * is required once it is `verified`, and names either `owner` or the id of the
 * mechanical check that proved it. An agent may never set `verified` with
 * `verified_by: "owner"` — only `uh ledger confirm` does, and that guard lives
 * in the harness, not the schema.
 */
export const InterventionSchema = z.object({
  schema_version: z.literal(INTERVENTION_SCHEMA_VERSION),
  id: z.string().min(1),
  ts: z.string().datetime(),
  source: InterventionSourceSchema,
  trigger: InterventionTriggerSchema,
  refs: InterventionRefsSchema.default({}),
  cause: InterventionCauseSchema,
  qualifier: InterventionQualifierSchema,
  what: Text,
  detection: Text,
  countermeasure: z.string().min(1).optional(),
  status: InterventionStatusSchema,
  evidence: Text.optional(),
  verified_by: z.string().min(1).optional(),
}).strict().superRefine((entry, ctx) => {
  if (entry.status === "landed" && entry.evidence === undefined) {
    ctx.addIssue({ code: "custom", message: "A landed intervention requires evidence" });
  }
  if (entry.status === "verified" && entry.verified_by === undefined) {
    ctx.addIssue({ code: "custom", message: "A verified intervention requires verified_by" });
  }
});
export type Intervention = z.infer<typeof InterventionSchema>;

/**
 * A status change appended after the entry it refers to. It carries only the id
 * and the fields the change sets, so the ledger stays append-only and the
 * original record is never rewritten.
 */
export const InterventionStatusChangeSchema = z.object({
  schema_version: z.literal(INTERVENTION_SCHEMA_VERSION),
  id: z.string().min(1),
  ts: z.string().datetime(),
  status: InterventionStatusSchema,
  evidence: Text.optional(),
  countermeasure: z.string().min(1).optional(),
  verified_by: z.string().min(1).optional(),
}).strict().superRefine((change, ctx) => {
  if (change.status === "landed" && change.evidence === undefined) {
    ctx.addIssue({ code: "custom", message: "A landed intervention requires evidence" });
  }
  if (change.status === "verified" && change.verified_by === undefined) {
    ctx.addIssue({ code: "custom", message: "A verified intervention requires verified_by" });
  }
});
export type InterventionStatusChange = z.infer<typeof InterventionStatusChangeSchema>;

/**
 * A stored line: either a new intervention or a status change. The two are
 * discriminated structurally — a status change names no `source`, a full entry
 * always does — so no extra marker field is needed.
 */
export const InterventionRecordSchema = z.union([InterventionSchema, InterventionStatusChangeSchema]);
export type InterventionRecord = z.infer<typeof InterventionRecordSchema>;

/** Whether a stored record is a status change rather than a full intervention. */
export function isStatusChange(record: InterventionRecord): record is InterventionStatusChange {
  return !("source" in record);
}
