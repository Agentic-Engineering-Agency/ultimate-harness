import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  INTERVENTION_SCHEMA_VERSION,
  InterventionRecordSchema,
  InterventionSchema,
  InterventionStatusChangeSchema,
  type Intervention,
  type InterventionCause,
  type InterventionQualifier,
  type InterventionRecord,
  type InterventionRefs,
  type InterventionSource,
  type InterventionStatus,
  type InterventionStatusChange,
  type InterventionTrigger,
} from "../schema/intervention.js";
import type { RuntimeStopCode } from "../schema/runtime-control.js";
import { redactSecrets } from "./run-digest.js";
import { chainEntry, lastChainedHash, readJsonLines, verifyChainedLines, type ChainBreak } from "./hash-chain.js";

/**
 * The intervention ledger — every moment a run needed correction.
 *
 * Storage is append-only JSON lines at `.harness/ledger/interventions.ndjson`.
 * New interventions are full records; a status change is a second line that
 * references an entry's id, so the file is never rewritten. Free text is
 * redacted with `redactSecrets` before it is stored, and every automatic capture
 * is best-effort: a ledger write failure never fails the action it records.
 */

/** Directory, relative to a project root, that holds the ledger. */
export const LEDGER_DIRECTORY = path.join(".harness", "ledger");
/** The append-only JSON lines file. */
export const INTERVENTIONS_FILE = "interventions.ndjson";

/** The ledger directory for a project root. */
export function ledgerDir(root: string): string {
  return path.join(root, LEDGER_DIRECTORY);
}

/** The interventions file for a project root. */
export function interventionsPath(root: string): string {
  return path.join(ledgerDir(root), INTERVENTIONS_FILE);
}

/**
 * The project root that owns `.harness` for a run directory. A run lives at
 * `<root>/.harness/missions/<m>/runs/<r>`, and a team worker's run may live
 * under a nested artifact root, so this walks up to the nearest `.harness`
 * ancestor rather than counting levels. With no such ancestor the directory
 * itself is returned, and the capture is simply best-effort.
 */
export function harnessRootFor(runDir: string): string {
  let current = path.resolve(runDir);
  for (;;) {
    if (path.basename(current) === ".harness") return path.dirname(current);
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(runDir);
    current = parent;
  }
}

/** A fresh, collision-resistant intervention id. */
export function generateInterventionId(): string {
  return `iv_${randomUUID()}`;
}

function compactRefs(refs: { run_id?: string; mission_id?: string; team_id?: string }): InterventionRefs {
  const out: InterventionRefs = {};
  if (refs.run_id) out.run_id = refs.run_id;
  if (refs.mission_id) out.mission_id = refs.mission_id;
  if (refs.team_id) out.team_id = refs.team_id;
  return out;
}

/** Input accepted when recording a new intervention; defaults fill the rest. */
export interface InterventionInput {
  id?: string;
  ts?: string;
  source: InterventionSource;
  trigger: InterventionTrigger;
  refs?: { run_id?: string; mission_id?: string; team_id?: string };
  cause?: InterventionCause;
  qualifier?: InterventionQualifier;
  what: string;
  detection?: string;
  countermeasure?: string;
  status?: InterventionStatus;
  evidence?: string;
  verified_by?: string;
}

/** The error an agent-side write gets when it tries to claim owner verification. */
export const OWNER_VERIFICATION_ERROR =
  "Only `uh ledger confirm` may record a verified intervention with verified_by \"owner\"; an agent cannot set it";

/**
 * Build and validate one intervention. `options.owner` marks the only writer
 * allowed to set `verified` with `verified_by: "owner"` (`uh ledger confirm`);
 * every other caller is refused that combination.
 */
export function buildIntervention(input: InterventionInput, options: { owner?: boolean } = {}): Intervention {
  const status = input.status ?? "open";
  const verifiedBy = input.verified_by;
  if (!options.owner && status === "verified" && verifiedBy === "owner") {
    throw new Error(OWNER_VERIFICATION_ERROR);
  }
  const candidate = {
    schema_version: INTERVENTION_SCHEMA_VERSION,
    id: input.id ?? generateInterventionId(),
    ts: input.ts ?? new Date().toISOString(),
    source: input.source,
    trigger: input.trigger,
    refs: compactRefs(input.refs ?? {}),
    cause: input.cause ?? "unknown",
    qualifier: input.qualifier ?? "unknown",
    what: redactSecrets(input.what).trim(),
    detection: redactSecrets(input.detection ?? "unknown").trim(),
    ...(input.countermeasure ? { countermeasure: input.countermeasure } : {}),
    status,
    ...(input.evidence !== undefined ? { evidence: redactSecrets(input.evidence).trim() } : {}),
    ...(verifiedBy !== undefined ? { verified_by: verifiedBy } : {}),
  };
  return InterventionSchema.parse(candidate);
}

/**
 * Append one already-validated record to the ledger, chained to the previous
 * entry. A ledger with no chained line yet (a legacy, pre-chain file) is
 * anchored by this entry: it takes the genesis `prev_hash`, so the unchained
 * lines before it are accepted as a legacy prefix and never rewritten.
 */
export async function appendIntervention(root: string, record: Intervention | InterventionStatusChange): Promise<void> {
  const file = interventionsPath(root);
  const lines = readJsonLines(file);
  const chained = chainEntry(lastChainedHash(lines), record as unknown as Record<string, unknown>);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(chained)}\n`, "utf8");
}

/**
 * The first break in the intervention ledger chain, or undefined when it is
 * intact. Unchained lines before the first chained (anchor) entry are a
 * tolerated legacy prefix; every chained line must link to the one before it.
 */
export function verifyLedgerChain(root: string): ChainBreak | undefined {
  return verifyChainedLines(readJsonLines(interventionsPath(root)), { allowLegacyPrefix: true });
}

/** Build, validate, and append a new intervention. Throws on invalid input. */
export async function recordIntervention(
  root: string,
  input: InterventionInput,
  options: { owner?: boolean } = {},
): Promise<Intervention> {
  const entry = buildIntervention(input, options);
  await appendIntervention(root, entry);
  return entry;
}

/**
 * Best-effort append for automatic capture. A ledger failure is swallowed and
 * reported as `undefined`, so the steer, kill, review, or settlement that
 * triggered it is never failed by the ledger.
 */
export async function tryRecordIntervention(
  root: string,
  input: InterventionInput,
  options: { owner?: boolean } = {},
): Promise<Intervention | undefined> {
  try {
    return await recordIntervention(root, input, options);
  } catch {
    return undefined;
  }
}

/** The reduced view of the ledger used by the summary. */
export interface LedgerRead {
  /** Effective interventions, in first-seen order, with status changes applied. */
  entries: Intervention[];
  /** Every parsed line, in file order. */
  records: InterventionRecord[];
  /** Line index of the full-entry line that created each effective id. */
  createdIndex: Map<string, number>;
  /** Line index where each id first became `landed` or `verified`. */
  landingIndex: Map<string, number>;
}

/** Read and reduce the ledger; a missing file reads as empty, malformed lines are skipped. */
export async function readLedger(root: string): Promise<LedgerRead> {
  let content = "";
  try {
    content = await readFile(interventionsPath(root), "utf8");
  } catch {
    return { entries: [], records: [], createdIndex: new Map(), landingIndex: new Map() };
  }
  const records: InterventionRecord[] = [];
  const effective = new Map<string, Intervention>();
  const createdIndex = new Map<string, number>();
  const landingIndex = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const result = InterventionRecordSchema.safeParse(parsed);
    if (!result.success) continue;
    const record = result.data;
    records.push(record);
    if (!("source" in record)) {
      const change = record as InterventionStatusChange;
      const base = effective.get(change.id);
      if (!base) continue;
      const merged: Intervention = {
        ...base,
        status: change.status,
        ...(change.evidence !== undefined ? { evidence: change.evidence } : {}),
        ...(change.countermeasure !== undefined ? { countermeasure: change.countermeasure } : {}),
        ...(change.verified_by !== undefined ? { verified_by: change.verified_by } : {}),
      };
      effective.set(change.id, merged);
      if ((change.status === "landed" || change.status === "verified") && !landingIndex.has(change.id)) {
        landingIndex.set(change.id, index);
      }
      continue;
    }
    const full = record as Intervention;
    if (!effective.has(full.id)) {
      effective.set(full.id, full);
      createdIndex.set(full.id, index);
      if (full.status === "landed" || full.status === "verified") landingIndex.set(full.id, index);
    }
  }
  return { entries: [...effective.values()], records, createdIndex, landingIndex };
}

/** A filter over effective ledger entries. */
export interface InterventionFilter {
  open?: boolean;
  cause?: InterventionCause;
  missionId?: string;
}

/** Read the ledger and apply a filter, preserving file order. */
export async function listInterventions(root: string, filter: InterventionFilter = {}): Promise<Intervention[]> {
  const ledger = await readLedger(root);
  return ledger.entries.filter((entry) => {
    if (filter.open && entry.status !== "open") return false;
    if (filter.cause && entry.cause !== filter.cause) return false;
    if (filter.missionId && entry.refs.mission_id !== filter.missionId) return false;
    return true;
  });
}

/**
 * Land an open intervention: append a status change that sets `landed` with its
 * evidence, and optionally names the countermeasure (rule, check, or gate) it
 * became. Landing without evidence is refused.
 */
export async function landIntervention(
  root: string,
  id: string,
  options: { evidence: string; countermeasure?: string },
): Promise<Intervention> {
  const ledger = await readLedger(root);
  const base = ledger.entries.find((entry) => entry.id === id);
  if (!base) throw new Error(`No intervention with id ${id}`);
  const evidence = options.evidence.trim();
  if (!evidence) throw new Error("A landed intervention requires non-empty evidence");
  const change = InterventionStatusChangeSchema.parse({
    schema_version: INTERVENTION_SCHEMA_VERSION,
    id,
    ts: new Date().toISOString(),
    status: "landed",
    evidence: redactSecrets(evidence),
    ...(options.countermeasure ? { countermeasure: options.countermeasure } : {}),
  });
  await appendIntervention(root, change);
  return {
    ...base,
    status: "landed",
    evidence: change.evidence,
    ...(change.countermeasure !== undefined ? { countermeasure: change.countermeasure } : {}),
  };
}

/**
 * Confirm an intervention as verified by the owner. This is the only writer
 * allowed to set `verified_by: "owner"`.
 */
export async function confirmIntervention(root: string, id: string): Promise<Intervention> {
  const ledger = await readLedger(root);
  const base = ledger.entries.find((entry) => entry.id === id);
  if (!base) throw new Error(`No intervention with id ${id}`);
  const change = InterventionStatusChangeSchema.parse({
    schema_version: INTERVENTION_SCHEMA_VERSION,
    id,
    ts: new Date().toISOString(),
    status: "verified",
    verified_by: "owner",
    ...(base.evidence !== undefined ? { evidence: base.evidence } : {}),
  });
  await appendIntervention(root, change);
  return { ...base, status: "verified", verified_by: "owner" };
}

/** One line of the predecessor corrections ledger. */
export interface PredecessorCorrection {
  correction?: unknown;
  status?: unknown;
  evidence?: unknown;
  confirmed_by_owner?: unknown;
}

/**
 * Import a predecessor corrections ledger (JSON lines with `correction`,
 * `status`, `evidence`, `confirmed_by_owner`). `open`/`partial` map to `open`,
 * `landed` maps to `landed` with its evidence; a `landed` row without evidence
 * is imported as `open` because landed evidence is required. Nothing is ever
 * imported as `verified`.
 */
export async function importPredecessorLedger(root: string, content: string): Promise<Intervention[]> {
  const created: Intervention[] = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const row = parsed as PredecessorCorrection;
    const what = typeof row.correction === "string" ? row.correction.trim() : "";
    if (!what) continue;
    const evidence = typeof row.evidence === "string" ? row.evidence.trim() : "";
    const landed = row.status === "landed" && evidence.length > 0;
    const entry = await recordIntervention(root, {
      source: "owner",
      trigger: "note",
      cause: "unknown",
      qualifier: "unknown",
      what,
      detection: "imported from a predecessor corrections ledger",
      status: landed ? "landed" : "open",
      ...(landed ? { evidence } : {}),
    });
    created.push(entry);
  }
  return created;
}

/** A countermeasure and how many same-cause entries recurred after it landed. */
export interface CountermeasureRecurrence {
  countermeasure: string;
  cause: InterventionCause;
  qualifier: InterventionQualifier;
  recurrences: number;
}

/** Aggregated ledger counts. */
export interface LedgerSummary {
  total: number;
  by_status: Record<string, number>;
  by_cause: Record<string, number>;
  by_qualifier: Record<string, number>;
  by_mission: Record<string, number>;
  countermeasures: CountermeasureRecurrence[];
}

function countInto(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Summarize the ledger: entries per mission, counts by cause and qualifier, and
 * for each countermeasure the number of entries with the same cause and
 * qualifier recorded after it landed.
 */
export function summarizeLedger(ledger: LedgerRead): LedgerSummary {
  const byStatus = new Map<string, number>();
  const byCause = new Map<string, number>();
  const byQualifier = new Map<string, number>();
  const byMission = new Map<string, number>();
  for (const entry of ledger.entries) {
    countInto(byStatus, entry.status);
    countInto(byCause, entry.cause);
    countInto(byQualifier, entry.qualifier);
    countInto(byMission, entry.refs.mission_id ?? "unassigned");
  }
  const seen = new Set<string>();
  const countermeasures: CountermeasureRecurrence[] = [];
  for (const entry of ledger.entries) {
    const countermeasure = entry.countermeasure;
    if (!countermeasure || seen.has(countermeasure)) continue;
    const landing = ledger.landingIndex.get(entry.id);
    if (landing === undefined) continue;
    seen.add(countermeasure);
    let recurrences = 0;
    for (const other of ledger.entries) {
      const created = ledger.createdIndex.get(other.id);
      if (created === undefined || created <= landing) continue;
      if (other.cause === entry.cause && other.qualifier === entry.qualifier) recurrences += 1;
    }
    countermeasures.push({ countermeasure, cause: entry.cause, qualifier: entry.qualifier, recurrences });
  }
  return {
    total: ledger.entries.length,
    by_status: Object.fromEntries(byStatus),
    by_cause: Object.fromEntries(byCause),
    by_qualifier: Object.fromEntries(byQualifier),
    by_mission: Object.fromEntries(byMission),
    countermeasures,
  };
}

/* -------------------------------------------------------------------------- */
/* Automatic capture                                                          */
/* -------------------------------------------------------------------------- */

/** Kill outcomes that mean a run was actually stopped (and so is an intervention). */
const KILLED_OUTCOMES: ReadonlySet<string> = new Set(["cancelled_gracefully", "force_killed", "orphan_settled"]);

/** Stop codes supervision raises on its own; each settles as an intervention. */
export const SUPERVISION_STOP_CODES: readonly RuntimeStopCode[] = [
  "policy", "denial_budget", "repeated_failure", "stall", "route_mismatch", "route_unverified", "controller_lost",
];

/** The cause and qualifier a stop code implies; anything else is unknown. */
const STOP_CODE_IMPLICATION: Record<string, { cause: InterventionCause; qualifier: InterventionQualifier }> = {
  policy: { cause: "permission", qualifier: "incorrect" },
  denial_budget: { cause: "permission", qualifier: "insufficient" },
  repeated_failure: { cause: "capability", qualifier: "incorrect" },
  stall: { cause: "capability", qualifier: "insufficient" },
  route_mismatch: { cause: "capability", qualifier: "incorrect" },
  route_unverified: { cause: "capability", qualifier: "insufficient" },
  controller_lost: { cause: "unknown", qualifier: "unknown" },
};

/** Record a successful steer. `source` defaults to the orchestrator. */
export async function captureSteer(
  root: string,
  input: { missionId?: string; runId?: string; source?: InterventionSource; what: string },
): Promise<Intervention | undefined> {
  return tryRecordIntervention(root, {
    source: input.source ?? "orchestrator",
    trigger: "steer",
    refs: { mission_id: input.missionId, run_id: input.runId },
    what: input.what,
    detection: "operator or orchestrator steered a run",
  });
}

/** Record each killed run. */
export async function captureKill(
  root: string,
  entries: ReadonlyArray<{ run_id: string; mission_id: string; outcome: string; detail?: string; team_id?: string }>,
  options: { source?: InterventionSource } = {},
): Promise<Intervention[]> {
  const recorded: Intervention[] = [];
  for (const entry of entries) {
    if (!KILLED_OUTCOMES.has(entry.outcome)) continue;
    const result = await tryRecordIntervention(root, {
      source: options.source ?? "owner",
      trigger: "kill",
      refs: { run_id: entry.run_id, mission_id: entry.mission_id, team_id: entry.team_id },
      what: `killed run ${entry.run_id} of mission ${entry.mission_id} (${entry.outcome})${entry.detail ? `: ${entry.detail}` : ""}`,
      detection: "uh kill stopped a live or orphaned run",
    });
    if (result) recorded.push(result);
  }
  return recorded;
}

/** Record each non-pass source of a collected review. */
export async function captureReview(
  root: string,
  input: {
    reviewMissionId: string;
    runId?: string;
    sources: ReadonlyArray<{ mission_id: string; verdict: string }>;
  },
): Promise<Intervention[]> {
  const recorded: Intervention[] = [];
  for (const source of input.sources) {
    if (source.verdict === "pass") continue;
    const result = await tryRecordIntervention(root, {
      source: "review",
      trigger: "review",
      refs: { run_id: input.runId, mission_id: source.mission_id },
      what: `review ${input.reviewMissionId} recommended ${source.verdict} for ${source.mission_id}`,
      detection: "uh review collect found a source that did not pass",
    });
    if (result) recorded.push(result);
  }
  return recorded;
}

/** Record a supervised settlement whose stop code is one supervision raises itself. */
export async function captureSettlement(
  root: string,
  input: { missionId?: string; runId?: string; stopCode: string; stopReason?: string },
): Promise<Intervention | undefined> {
  if (!(SUPERVISION_STOP_CODES as readonly string[]).includes(input.stopCode)) return undefined;
  const implied = STOP_CODE_IMPLICATION[input.stopCode] ?? { cause: "unknown", qualifier: "unknown" };
  return tryRecordIntervention(root, {
    source: "supervisor",
    trigger: "stop",
    refs: { mission_id: input.missionId, run_id: input.runId },
    cause: implied.cause,
    qualifier: implied.qualifier,
    what: `run settled with supervision stop code ${input.stopCode}${input.stopReason ? `: ${input.stopReason}` : ""}`,
    detection: "supervision stopped the run and wrote runtime-control.json",
  });
}

/** Record a `run-team --replace` relaunch. */
export async function captureReplace(
  root: string,
  input: { missionId: string; detail?: string },
): Promise<Intervention | undefined> {
  return tryRecordIntervention(root, {
    source: "owner",
    trigger: "replace",
    refs: { mission_id: input.missionId, team_id: input.missionId },
    what: `relaunched team mission ${input.missionId} with --replace${input.detail ? `: ${input.detail}` : ""}`,
    detection: "uh mission run-team --replace archived a previous run's state",
  });
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

function refsLabel(entry: Intervention): string {
  const labels: string[] = [];
  if (entry.refs.mission_id) labels.push(`mission=${entry.refs.mission_id}`);
  if (entry.refs.run_id) labels.push(`run=${entry.refs.run_id}`);
  if (entry.refs.team_id) labels.push(`team=${entry.refs.team_id}`);
  return labels.join(" ");
}

/** One human-readable line for an intervention. */
export function formatIntervention(entry: Intervention): string {
  const parts = [
    entry.id,
    entry.status,
    entry.source,
    entry.trigger,
    `${entry.cause}/${entry.qualifier}`,
    refsLabel(entry),
    entry.what,
  ].filter((part) => part.length > 0);
  return parts.join("  ");
}

/** A ledger list as human text. */
export function formatInterventionList(entries: Intervention[]): string {
  if (entries.length === 0) return "No interventions recorded.";
  return entries.map(formatIntervention).join("\n");
}

/** A summary as human text. */
export function formatLedgerSummary(summary: LedgerSummary): string {
  const lines: string[] = [`total: ${summary.total}`];
  const grouped = (label: string, counts: Record<string, number>): void => {
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    lines.push(`${label}: ${entries.length > 0 ? entries.map(([key, value]) => `${key}=${value}`).join(" ") : "none"}`);
  };
  grouped("by status", summary.by_status);
  grouped("by cause", summary.by_cause);
  grouped("by qualifier", summary.by_qualifier);
  grouped("by mission", summary.by_mission);
  if (summary.countermeasures.length === 0) {
    lines.push("countermeasures: none");
  } else {
    lines.push("countermeasures:");
    for (const item of summary.countermeasures) {
      lines.push(`  ${item.countermeasure}  ${item.cause}/${item.qualifier}  ${item.recurrences} recurrence(s) after landing`);
    }
  }
  return lines.join("\n");
}
