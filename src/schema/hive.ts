import { z } from "zod";

/**
 * UH hive — the shared blackboard.
 *
 * Three persisted artifacts under `.harness/hive/`:
 *
 *   items.yaml     — the open work and its state, one list entry per item.
 *   facts.ndjson   — one proven, hash-chained fact per line, append-only.
 *   claims.ndjson  — unproven agent statements, never injected anywhere.
 *
 * Land and queue feed facts in; dispatch reads them back out. Both files are
 * authored by hand as often as by the CLI, so the schemas are strict: an
 * unknown key is rejected rather than silently dropped, and a malformed fact
 * line is rejected by its line number (see `src/harness/hive.ts`).
 *
 * Every fact carries a `prev_hash` (the previous entry's canonical hash, or the
 * fixed genesis value for the first) and its own `hash` (sha256 over its
 * canonical JSON without `hash`), so the file is a chain an edit to any line
 * breaks. Every fact must also cite controller evidence — a run, commit,
 * verification, or review — whose artifact hash the writer recomputes.
 */

/** Lifecycle of an item on the blackboard. */
export const HiveItemStatusSchema = z.enum(["open", "in-progress", "done", "blocked"]);
export type HiveItemStatus = z.infer<typeof HiveItemStatusSchema>;

/** One open item: a stable id, a title, and where it stands. */
export const HiveItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: HiveItemStatusSchema,
  /** The mission that owns this item, when known. */
  owner_mission: z.string().min(1).optional(),
  /** Repo paths that support the item's state. */
  evidence: z.array(z.string()).optional(),
}).strict();
export type HiveItem = z.infer<typeof HiveItemSchema>;

/** `items.yaml` is a bare list of items. */
export const HiveItemsSchema = z.array(HiveItemSchema);
export type HiveItems = z.infer<typeof HiveItemsSchema>;

/** Who recorded a fact. */
export const HiveFactSourceSchema = z.enum(["land", "queue", "verify", "manual"]);
export type HiveFactSource = z.infer<typeof HiveFactSourceSchema>;

/** Hard cap on a fact's text: one line, at most 200 characters. */
export const HIVE_FACT_TEXT_MAX = 200;

/** The fixed value a chain's first `prev_hash` names. */
export const HIVE_GENESIS_HASH = "0".repeat(64);

/** A 64-hex sha256, as carried by `prev_hash` and `hash`. */
export const HiveHashSchema = z.string().regex(/^[a-f0-9]{64}$/, { message: "must be a 64-character lowercase sha256" });

/** The kind of controller artifact a fact cites. */
export const HiveFactEvidenceKindSchema = z.enum(["run", "commit", "verification", "review"]);
export type HiveFactEvidenceKind = z.infer<typeof HiveFactEvidenceKindSchema>;

/**
 * Controller evidence a fact cites: a run record, a git commit, a
 * `verification.yaml`, or a collected review assessment. `sha256` is the hash
 * of the cited artifact (its 64-hex content digest, or the 40/64-hex commit id
 * git resolves for a commit); `appendFact` recomputes it and refuses a mismatch.
 */
export const HiveFactEvidenceSchema = z.object({
  kind: HiveFactEvidenceKindSchema,
  ref: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{40,64}$/, { message: "must be a 40- or 64-character lowercase hex digest" }),
}).strict();
export type HiveFactEvidence = z.infer<typeof HiveFactEvidenceSchema>;

/**
 * One proven fact: a single line of truth with the controller evidence that
 * backs it, chained to the fact before it, optionally bound to the item ids and
 * repo paths it is about.
 */
export const HiveFactSchema = z.object({
  id: z.string().min(1),
  /** ISO timestamp; facts are rendered newest first. */
  at: z.string().min(1),
  text: z.string().min(1).max(HIVE_FACT_TEXT_MAX).regex(/^[^\r\n]*$/, {
    message: "fact text must be a single line",
  }),
  /** Controller evidence: an artifact reference and its recomputed hash. */
  evidence: HiveFactEvidenceSchema,
  /** The previous entry's `hash`, or {@link HIVE_GENESIS_HASH} for the first. */
  prev_hash: HiveHashSchema,
  /** sha256 over this entry's canonical JSON without `hash`. */
  hash: HiveHashSchema,
  item_ids: z.array(z.string().min(1)).optional(),
  paths: z.array(z.string().min(1)).optional(),
  source: HiveFactSourceSchema,
}).strict();
export type HiveFact = z.infer<typeof HiveFactSchema>;

/**
 * An unproven agent statement. Claims are recorded at `.harness/hive/claims.ndjson`
 * and are never facts and never injected into a prompt; only controller-verified
 * facts reach an agent.
 */
export const HiveClaimSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  text: z.string().min(1).max(HIVE_FACT_TEXT_MAX).regex(/^[^\r\n]*$/, {
    message: "claim text must be a single line",
  }),
  /** The agent or role that made the claim, when known. */
  by: z.string().min(1).optional(),
}).strict();
export type HiveClaim = z.infer<typeof HiveClaimSchema>;
