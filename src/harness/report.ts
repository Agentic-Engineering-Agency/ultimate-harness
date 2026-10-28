// uh report — an instant, model-free status report of any run, from disk only.
//
// Everything a report needs is already on disk: the run's `runtime-control.json`,
// its `run-digest.json` (the live projection the supervisor maintains), and its
// `events.ndjson`. When a digest is present the report renders from it and never
// touches the event stream; an older run without one falls back to reading the
// whole `events.ndjson` once and projecting it with the same loop probe the
// supervisor uses. Nothing here starts a controller, calls a model, or writes
// any artifact.
//
// Three invariants hold the safety line:
// - The runtime is read from `runtime-session.yaml` or the digest, never guessed
//   from event shapes.
// - No absolute path reaches any field. Targets are resolved to paths relative
//   to the run's working directory, or to the bounded placeholders the
//   projection already publishes (`<outside>`, `<pattern>`, `unknown`).
// - No credential reaches any field. The last assistant text is scrubbed with a
//   conservative key/token pattern before it is bounded.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { RuntimeSessionSchema } from "../schema/artifacts.js";
import type { RunDigest, RunDigestCurrentActivity, RunDigestDenial, RunDigestUsage } from "../schema/run-digest.js";
import {
  defaultProcessLister,
  discoverRuns,
  isSettled,
  liveness,
  type LiveRunRecord,
  type LivenessVerdict,
  type NativeProcess,
  type ProcessLister,
} from "./live-runs.js";
import {
  deterministicLoopSignals,
  projectActivity,
  type DeterministicLoopSignals,
  type ErrorClass,
  type ToolCallKind,
} from "./loop-probe.js";
import { GUARD_CLASS_NAMES, projectRunDigest, readRunDigest } from "./run-digest.js";
import { nativeCostFactsFromEvents, resolveRunCost, type NativeCostFacts } from "./runtime-accounting.js";
import { loadOperatorPriceTable } from "./cost-table.js";
import type { ToolGuardClass } from "./tool-guard.js";

export { redactSecrets, sanitizeReportText } from "./run-digest.js";

export const REPORT_SCHEMA_VERSION = "uh.report.v0" as const;
/** Completed tool calls shown by default. */
export const DEFAULT_REPORT_LAST = 10;

type NativeEvent = Record<string, unknown>;

/** One denial: the tool, its resolved relative target, and its guard class. */
export interface ReportDenial {
  tool: string;
  target: string;
  guard_class: ToolGuardClass | "denied";
}

/** A projected tool call plus the age of its completion. */
export interface ReportActivityCall {
  tool: string;
  kind: ToolCallKind;
  target: string;
  ok: boolean;
  error_class: ErrorClass;
  age_ms?: number;
}

export interface ReportTokens {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

/** The stable, model-free report document. */
export interface RunReport {
  schema_version: typeof REPORT_SCHEMA_VERSION;
  generated_at: string;
  run_id: string;
  mission_id: string;
  role?: string;
  runtime: string;
  model?: string;
  liveness: LivenessVerdict;
  status?: string;
  stop_code?: string;
  started_at?: string;
  elapsed_ms?: number;
  turns?: number;
  denials: { count: number; events: ReportDenial[]; native_refusals?: number };
  tokens: ReportTokens | null;
  tokens_unknown_reason?: string;
  cost_usd: number | null;
  cost_source?: "reported" | "estimated";
  cost_unknown_reason?: string;
  activity: { source: string; window: number; calls: ReportActivityCall[] };
  loop_signals: DeterministicLoopSignals;
  files_written: string[];
  /** Present only for a run that carries a digest: what the run is doing now. */
  current_activity?: RunDigestCurrentActivity;
  last_assistant_text?: string;
}

export interface ReportOptions {
  /** How many recent completed tool calls to project (default: 10). */
  last?: number;
  /**
   * Retained for compatibility with the CLI flag. A run without a digest is
   * always read in full, so this no longer changes what is read.
   */
  full?: boolean;
  now?: number;
  /** Native process table for the liveness verdict; injected in tests. */
  processes?: NativeProcess[];
  listProcesses?: ProcessLister;
}

/** A report target could not be resolved. Never carries an absolute path. */
export class ReportError extends Error {
  readonly code: string;

  constructor(message: string, code = "report_target") {
    super(message);
    this.name = "ReportError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Event reading                                                              */
/* -------------------------------------------------------------------------- */

/** Read the whole event log once; a missing or unreadable log discloses nothing. */
async function readEventLog(projectRoot: string, controlPath: string): Promise<string[]> {
  const eventsPath = path.join(path.dirname(path.resolve(projectRoot, controlPath)), "events.ndjson");
  try {
    return nonEmptyLines(await readFile(eventsPath, "utf8"));
  } catch {
    return [];
  }
}

function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function parseEvents(lines: readonly string[]): NativeEvent[] {
  const events: NativeEvent[] = [];
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = record(parsed);
    if (event) events.push(event);
  }
  return events;
}

function record(value: unknown): NativeEvent | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as NativeEvent) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Event projection helpers                                                   */
/* -------------------------------------------------------------------------- */

const START_TYPES: ReadonlySet<string> = new Set(["tool_queued", "tool_running", "tool_execution_start"]);
/** Every event that closes a call: a completion or a denial. */
const END_TYPES: ReadonlySet<string> = new Set([
  "tool_execution_end", "tool_completed", "tool_hook_blocked", "tool_call_blocked", "tool_denied",
]);
const PLACEHOLDER_TARGETS: ReadonlySet<string> = new Set(["<outside>", "<pattern>", "unknown"]);

/** The guard classes a report may name, including the bounded `denied` fallback. */
const GUARD_CLASSES: ReadonlySet<string> = new Set<string>([...GUARD_CLASS_NAMES, "denied"]);

/**
 * The completion timestamp of every call `projectActivity` would keep, in the
 * same completion order. Aligned to `projectActivity`'s window by the caller.
 */
function completionTimestamps(events: readonly NativeEvent[]): Array<number | undefined> {
  const active = new Set<string>();
  const timestamps: Array<number | undefined> = [];
  for (const event of events) {
    const type = String(event.type ?? "");
    const id = String(event.toolCallId ?? event.tool_call_id ?? event.id ?? "");
    if (START_TYPES.has(type)) {
      if (!id) continue;
      if (!active.has(id) && eventToolName(event)) active.add(id);
      continue;
    }
    if (!END_TYPES.has(type)) continue;
    if (!id || !active.has(id)) continue;
    active.delete(id);
    const raw = event.timestamp;
    const parsed = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    timestamps.push(Number.isFinite(parsed) ? parsed : undefined);
  }
  return timestamps;
}

function eventToolName(event: NativeEvent): string {
  const name = event.toolName ?? event.tool_name ?? event.tool;
  return typeof name === "string" ? name.trim() : "";
}

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a run id (or a unique prefix of one) against everything discoverable
 * from the project root, including settled runs.
 */
export async function resolveReportTarget(
  projectRoot: string,
  runId: string,
  now: number,
): Promise<LiveRunRecord> {
  const records = await discoverRuns(path.resolve(projectRoot), { includeSettled: true, now, persist: false });
  const exact = records.filter((entry) => entry.run_id === runId);
  if (exact.length === 1) return exact[0]!;
  const prefixed = records.filter((entry) => entry.run_id.startsWith(runId));
  if (prefixed.length === 0) {
    throw new ReportError(
      `No run matching "${runId}" is discoverable from the project root. Try \`uh ps --all\`.`,
      "unknown_target",
    );
  }
  if (prefixed.length > 1) {
    throw new ReportError(
      `"${runId}" is ambiguous: ${prefixed.map((entry) => entry.run_id).sort().join(", ")}`,
      "ambiguous_target",
    );
  }
  return prefixed[0]!;
}

/** The runtime an attempt recorded, from its session document, else the fallback. */
async function resolveRunRuntime(runDir: string, fallback: string): Promise<string> {
  try {
    const parsed = RuntimeSessionSchema.safeParse(parse(await readFile(path.join(runDir, "runtime-session.yaml"), "utf8")));
    if (parsed.success) return parsed.data.runtime;
  } catch {
    // No session document: fall through to the record's own runtime.
  }
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

function definedTokens(usage: RunDigestUsage | undefined): ReportTokens | null {
  if (!usage) return null;
  const tokens: ReportTokens = {};
  if (typeof usage.input_tokens === "number") tokens.input = usage.input_tokens;
  if (typeof usage.output_tokens === "number") tokens.output = usage.output_tokens;
  if (typeof usage.cache_read_tokens === "number") tokens.cache_read = usage.cache_read_tokens;
  if (typeof usage.cache_write_tokens === "number") tokens.cache_write = usage.cache_write_tokens;
  return Object.keys(tokens).length > 0 ? tokens : null;
}

function uniqueTargets(calls: ReadonlyArray<{ kind: ToolCallKind; target: string; ok: boolean }>): string[] {
  const seen = new Set<string>();
  const written: string[] = [];
  for (const call of calls) {
    if (call.kind !== "write" || !call.ok || PLACEHOLDER_TARGETS.has(call.target)) continue;
    if (seen.has(call.target)) continue;
    seen.add(call.target);
    written.push(call.target);
  }
  return written;
}

/** The guard class a digest denial names, normalized against the report's class list. */
function toReportDenial(denial: RunDigestDenial): ReportDenial {
  return {
    tool: denial.tool,
    target: denial.target,
    guard_class: GUARD_CLASSES.has(denial.class) ? (denial.class as ToolGuardClass | "denied") : "denied",
  };
}

interface ReportContext {
  record: LiveRunRecord;
  runtime: string;
  now: number;
  last: number;
  processes: NativeProcess[];
  priceTable: Awaited<ReturnType<typeof loadOperatorPriceTable>>;
  elapsed: number | undefined;
}

/** The identity and lifecycle fields, which come from the run record either way. */
function identityFields(context: ReportContext): Omit<RunReport, "denials" | "tokens" | "cost_usd" | "activity" | "loop_signals" | "files_written"> {
  const { record, runtime, now, processes, elapsed } = context;
  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date(now).toISOString(),
    run_id: record.run_id,
    mission_id: record.mission_id,
    ...(record.team !== undefined ? { role: record.team.role } : {}),
    runtime,
    ...(record.model !== undefined ? { model: record.model } : {}),
    liveness: liveness(record, processes, { now }),
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.stop_code !== undefined ? { stop_code: record.stop_code } : {}),
    ...(record.started_at !== undefined ? { started_at: record.started_at } : {}),
    ...(elapsed !== undefined ? { elapsed_ms: elapsed } : {}),
    ...(record.turns !== undefined ? { turns: record.turns } : {}),
  };
}

/** A report rendered from the live digest: no event stream is read. */
function reportFromDigest(context: ReportContext, digest: RunDigest): RunReport {
  const { record, runtime, now, last } = context;
  const calls: ReportActivityCall[] = digest.recent_calls.slice(-last).map((call) => {
    const completed = Date.parse(call.started_at);
    const age = Number.isFinite(completed) ? Math.max(0, now - (completed + call.duration_ms)) : undefined;
    return {
      tool: call.tool,
      kind: call.kind,
      target: call.target,
      ok: call.status === "ok",
      error_class: call.error_class,
      ...(age !== undefined ? { age_ms: age } : {}),
    };
  });
  const native: NativeCostFacts = Object.keys(digest.usage).length > 0
    ? {
        token_counts: true,
        usage: { source: "runtime", ...digest.usage },
        ...(record.model !== undefined ? { model: record.model } : {}),
      }
    : {};
  const resolved = resolveRunCost({ runtime, native, priceTable: context.priceTable });
  const tokens = definedTokens(digest.usage);
  return {
    ...identityFields(context),
    turns: digest.turns,
    denials: {
      count: record.denials ?? digest.denials.length,
      events: digest.denials.map(toReportDenial),
      native_refusals: digest.native_refusals,
    },
    tokens,
    ...(tokens === null ? { tokens_unknown_reason: "the run digest carries no usage counters" } : {}),
    cost_usd: resolved.cost_usd ?? null,
    ...(resolved.cost_source !== undefined ? { cost_source: resolved.cost_source } : {}),
    ...(resolved.cost_unknown_reason !== undefined ? { cost_unknown_reason: resolved.cost_unknown_reason } : {}),
    activity: { source: runtime, window: last, calls },
    loop_signals: digest.loop_signals,
    files_written: digest.files_written.files,
    current_activity: digest.current_activity,
    ...(digest.last_assistant_text !== undefined ? { last_assistant_text: digest.last_assistant_text } : {}),
  };
}

const ACTIVITY_ALL_WINDOW = 1_000_000;

/** A report rendered from an older run's whole event stream. */
function reportFromEvents(context: ReportContext, events: readonly NativeEvent[], lines: readonly string[]): RunReport {
  const { record, runtime, now, last } = context;
  const window = projectActivity(events, { window: last });
  const all = projectActivity(events, { window: ACTIVITY_ALL_WINDOW });
  const ages = completionTimestamps(events).slice(-window.calls.length);
  const calls: ReportActivityCall[] = window.calls.map((call, index) => {
    const at = ages[index];
    const age = at === undefined ? undefined : Math.max(0, now - at);
    return { ...call, ...(age !== undefined ? { age_ms: age } : {}) };
  });
  const native = nativeCostFactsFromEvents(lines);
  const resolved = resolveRunCost({ runtime, native, priceTable: context.priceTable });
  const tokens = native.token_counts ? definedTokens(native.usage) : null;
  const projected = projectRunDigest(events, {
    runtime,
    ...(record.started_at !== undefined ? { startedAt: Date.parse(record.started_at) } : {}),
    now,
  });
  return {
    ...identityFields(context),
    denials: { count: record.denials ?? projected.denials.length, events: projected.denials.map(toReportDenial) },
    tokens,
    ...(tokens === null ? { tokens_unknown_reason: "the event stream carries no usage counters" } : {}),
    cost_usd: resolved.cost_usd ?? null,
    ...(resolved.cost_source !== undefined ? { cost_source: resolved.cost_source } : {}),
    ...(resolved.cost_unknown_reason !== undefined ? { cost_unknown_reason: resolved.cost_unknown_reason } : {}),
    activity: { source: runtime, window: last, calls },
    loop_signals: deterministicLoopSignals(window),
    files_written: uniqueTargets(all.calls),
    ...(projected.last_assistant_text !== undefined ? { last_assistant_text: projected.last_assistant_text } : {}),
  };
}

/** Build the model-free report for one run. Reads disk only; writes nothing. */
export async function reportRun(
  projectRoot: string,
  runId: string,
  options: ReportOptions = {},
): Promise<RunReport> {
  const root = path.resolve(projectRoot);
  const now = options.now ?? Date.now();
  const record = await resolveReportTarget(root, runId, now);

  const requested = options.last ?? DEFAULT_REPORT_LAST;
  const last = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_REPORT_LAST;

  const processes = options.processes
    ?? (isSettled(record) ? [] : await (options.listProcesses ?? defaultProcessLister)());

  const runDir = path.dirname(path.resolve(root, record.control_path));
  const runtime = await resolveRunRuntime(runDir, record.runtime);
  const priceTable = await loadOperatorPriceTable(root);

  const startedMs = record.started_at !== undefined ? Date.parse(record.started_at) : Number.NaN;
  const reference = record.settled_at !== undefined ? Date.parse(record.settled_at) : now;
  const elapsed = Number.isFinite(startedMs) && Number.isFinite(reference) ? Math.max(0, reference - startedMs) : undefined;

  const context: ReportContext = { record, runtime, now, last, processes, priceTable, elapsed };
  const digest = await readRunDigest(runDir);
  if (digest) return reportFromDigest(context, digest);

  const lines = await readEventLog(root, record.control_path);
  return reportFromEvents(context, parseEvents(lines), lines);
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return "-";
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1000)}s`;
  if (milliseconds < 3_600_000) return `${Math.floor(milliseconds / 60_000)}m${Math.round((milliseconds % 60_000) / 1000)}s`;
  return `${Math.floor(milliseconds / 3_600_000)}h${Math.floor((milliseconds % 3_600_000) / 60_000)}m`;
}

/** Group digits deterministically, independent of the host locale. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function activityClock(iso: string): string {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(11, 19) : iso;
}

/** "reasoning since 18:18:02 (78,541 chars)", "tool since 18:18:02 (read_file src/x.ts)". */
function formatCurrentActivity(activity: RunDigestCurrentActivity): string {
  const since = activityClock(activity.since);
  if (activity.kind === "reasoning") {
    const chars = typeof activity.detail === "number" ? ` (${grouped(activity.detail)} chars)` : "";
    return `current activity: reasoning since ${since}${chars}`;
  }
  if (activity.kind === "tool") {
    const detail = typeof activity.detail === "string" && activity.detail.length > 0 ? ` (${activity.detail})` : "";
    return `current activity: tool since ${since}${detail}`;
  }
  return `current activity: ${activity.kind} since ${since}`;
}

/** A compact, human-readable rendering. Contains no absolute path. */
export function formatRunReport(report: RunReport): string {
  const route = report.model !== undefined ? `${report.runtime}/${report.model}` : report.runtime;
  const role = report.role !== undefined ? `role=${report.role}` : "role=-";
  const refusals = report.denials.native_refusals !== undefined ? `  native_refusals=${report.denials.native_refusals}` : "";
  const lines: string[] = [
    `Run ${report.run_id}  ${report.mission_id}  ${role}  ${route}`,
    `liveness=${report.liveness}  status=${report.status ?? "-"}  elapsed=${formatDuration(report.elapsed_ms)}  turns=${report.turns ?? "-"}  denials=${report.denials.count}${refusals}`,
  ];

  lines.push(
    report.tokens === null
      ? `tokens: unknown (${report.tokens_unknown_reason ?? "not measured"})`
      : `tokens: input=${report.tokens.input ?? "?"} output=${report.tokens.output ?? "?"} cache_read=${report.tokens.cache_read ?? "?"} cache_write=${report.tokens.cache_write ?? "?"}`,
  );
  lines.push(
    report.cost_usd === null
      ? `cost: unknown (${report.cost_unknown_reason ?? "no price"})`
      : `cost: $${report.cost_usd.toFixed(6)} (${report.cost_source ?? "reported"})`,
  );

  if (report.current_activity !== undefined) lines.push(formatCurrentActivity(report.current_activity));

  lines.push(`loop signals: identical_repeats=${report.loop_signals.identical_repeats} alternating_pairs=${report.loop_signals.alternating_pairs} distinct_targets=${report.loop_signals.distinct_targets}`);

  lines.push(`activity (${report.activity.source}, last ${report.activity.calls.length}):`);
  if (report.activity.calls.length === 0) lines.push("  (none)");
  for (const call of report.activity.calls) {
    lines.push(`  ${call.tool}  ${call.kind}  ${call.target}  ${call.ok ? "ok" : "fail"}  ${call.error_class}  age=${formatDuration(call.age_ms)}`);
  }

  if (report.denials.events.length > 0) {
    lines.push("denials:");
    for (const denial of report.denials.events) {
      lines.push(`  ${denial.guard_class}  ${denial.tool}  ${denial.target}`);
    }
  }

  lines.push("files written:");
  if (report.files_written.length === 0) lines.push("  (none)");
  for (const file of report.files_written) lines.push(`  ${file}`);

  lines.push("last assistant text:");
  lines.push(report.last_assistant_text !== undefined ? `  ${report.last_assistant_text}` : "  (none)");

  return lines.join("\n");
}
