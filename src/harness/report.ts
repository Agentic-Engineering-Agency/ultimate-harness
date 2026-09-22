// uh report — an instant, model-free status report of any run, from disk only.
//
// Everything a report needs is already on disk: the run's `runtime-control.json`
// and its `events.ndjson`. This module reads the last 256 KB of the event stream
// (the whole file under `--full`), projects it with the same `projectActivity`
// the loop probe uses, and reduces it to a bounded, redacted document. Nothing
// here starts a controller, calls a model, or writes any artifact.
//
// Two invariants hold the safety line:
// - No absolute path reaches any field. Guard targets and written files are
//   resolved to paths relative to the run's working directory, or to the
//   bounded placeholders `projectActivity` already publishes (`<outside>`,
//   `<pattern>`, `unknown`).
// - No credential reaches any field. The last assistant text is scrubbed with a
//   conservative key/token pattern before it is bounded to 600 characters.
import { open, readFile } from "node:fs/promises";
import path from "node:path";
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
  relativeDisplayPath,
  type DeterministicLoopSignals,
  type ErrorClass,
  type ToolCallKind,
} from "./loop-probe.js";
import { nativeCostFactsFromEvents, resolveRunCost } from "./runtime-accounting.js";
import { loadOperatorPriceTable } from "./cost-table.js";
import type { ToolGuardClass } from "./tool-guard.js";

export const REPORT_SCHEMA_VERSION = "uh.report.v0" as const;
/** Never read more than the tail of an append-only event log for a report. */
export const EVENTS_REPORT_TAIL_BYTES = 256 * 1024;
/** Completed tool calls shown by default. */
export const DEFAULT_REPORT_LAST = 10;
/** The last assistant text is never longer than this many characters. */
export const LAST_ASSISTANT_TEXT_LIMIT = 600;
/** A projection window large enough to hold every call in the tail. */
const ACTIVITY_ALL_WINDOW = 1_000_000;
const REDACTED = "[redacted]";
const PATH_PLACEHOLDER = "[path]";

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
  denials: { count: number; events: ReportDenial[] };
  tokens: ReportTokens | null;
  tokens_unknown_reason?: string;
  cost_usd: number | null;
  cost_source?: "reported" | "estimated";
  cost_unknown_reason?: string;
  activity: { source: string; window: number; calls: ReportActivityCall[] };
  loop_signals: DeterministicLoopSignals;
  files_written: string[];
  last_assistant_text?: string;
}

export interface ReportOptions {
  /** How many recent completed tool calls to project (default: 10). */
  last?: number;
  /** Read the whole events.ndjson instead of its last 256 KB. */
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
/* Redaction                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Conservative credential shapes. This is a denylist of recognizable keys and
 * tokens, not a general secret detector: unmatched text is left intact rather
 * than over-redacted.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bya29\.[0-9A-Za-z_-]{10,}\b/g,
  /\bph[csx]_[A-Za-z0-9]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
];

/** Named credentials keep their name; only the value is replaced. */
const NAMED_CREDENTIAL = /((?:api[_-]?key|access[_-]?key|secret|token|password|passwd|credential|authorization)["']?\s*[:=]\s*["']?)([A-Za-z0-9_\-./+]{6,})/gi;

/** Absolute Unix paths (two or more segments) and Windows drive paths. */
const POSIX_ABSOLUTE_PATH = /\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g;
const WINDOWS_ABSOLUTE_PATH = /[A-Za-z]:\\(?:[^\\\s"']+\\)*[^\\\s"']*/g;

/** Replace every recognizable credential with a fixed placeholder. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(NAMED_CREDENTIAL, (_match, prefix: string) => `${prefix}${REDACTED}`);
  return out;
}

/**
 * Sanitize free text for a report: known credentials and absolute paths are
 * replaced, so a report field can never publish a credential or a home
 * directory.
 */
export function sanitizeReportText(text: string): string {
  return redactSecrets(text)
    .replace(WINDOWS_ABSOLUTE_PATH, PATH_PLACEHOLDER)
    .replace(POSIX_ABSOLUTE_PATH, PATH_PLACEHOLDER)
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Event reading                                                              */
/* -------------------------------------------------------------------------- */

interface EventLog {
  /** Raw, non-empty JSON lines; the tail drops the first partial line. */
  lines: string[];
  truncated: boolean;
}

async function readEventLog(projectRoot: string, controlPath: string, full: boolean): Promise<EventLog> {
  const eventsPath = path.join(path.dirname(path.resolve(projectRoot, controlPath)), "events.ndjson");
  if (full) {
    try {
      const raw = await readFile(eventsPath, "utf8");
      return { lines: nonEmptyLines(raw), truncated: false };
    } catch {
      return { lines: [], truncated: false };
    }
  }
  let handle;
  try {
    handle = await open(eventsPath, "r");
  } catch {
    return { lines: [], truncated: false };
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return { lines: [], truncated: false };
    const length = Math.min(size, EVENTS_REPORT_TAIL_BYTES);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    let truncated = false;
    if (size > length) {
      truncated = true;
      const newline = text.indexOf("\n");
      text = newline >= 0 ? text.slice(newline + 1) : "";
    }
    return { lines: nonEmptyLines(text), truncated };
  } finally {
    await handle.close();
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

/* -------------------------------------------------------------------------- */
/* Event projection helpers                                                   */
/* -------------------------------------------------------------------------- */

const START_TYPES: ReadonlySet<string> = new Set(["tool_queued", "tool_running", "tool_execution_start"]);
/** Every event that closes a call: a completion or a denial. */
const END_TYPES: ReadonlySet<string> = new Set([
  "tool_execution_end", "tool_completed", "tool_hook_blocked", "tool_call_blocked", "tool_denied",
]);
const DENY_TYPES: ReadonlySet<string> = new Set(["tool_hook_blocked", "tool_call_blocked", "tool_denied"]);

const SHELL_TOOLS: ReadonlySet<string> = new Set([
  "bash", "shell", "shell_command", "run_command", "terminal", "execute", "powershell", "zsh", "cmd",
]);
const PATH_ARGUMENT_KEYS = ["path", "file_path", "filePath", "file", "target_file", "notebook_path", "abs_path"] as const;
const PLACEHOLDER_TARGETS: ReadonlySet<string> = new Set(["<outside>", "<pattern>", "unknown"]);

function record(value: unknown): NativeEvent | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as NativeEvent) : undefined;
}

/** Command Code wraps native events in an `event` envelope; oh-my-pi does not. */
function unwrap(value: unknown): NativeEvent | undefined {
  const outer = record(value);
  if (!outer) return undefined;
  return record(outer.event) ?? outer;
}

function eventId(event: NativeEvent): string {
  return String(event.toolCallId ?? event.tool_call_id ?? event.id ?? "");
}

function eventToolName(event: NativeEvent): string {
  const name = event.toolName ?? event.tool_name ?? event.tool;
  return typeof name === "string" ? name.trim() : "";
}

function eventArgs(event: NativeEvent): NativeEvent | undefined {
  const args = record(event.input) ?? record(event.args);
  if (args) return args;
  return typeof event.command === "string" ? { command: event.command } : undefined;
}

function eventTimestamp(event: NativeEvent): number | undefined {
  const raw = event.timestamp;
  if (typeof raw !== "string") return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The completion timestamp of every call `projectActivity` would keep, in the
 * same completion order. Aligned to `projectActivity`'s window by the caller.
 */
function completionTimestamps(events: readonly NativeEvent[]): Array<number | undefined> {
  const active = new Set<string>();
  const timestamps: Array<number | undefined> = [];
  for (const event of events) {
    const type = String(event.type ?? "");
    const id = eventId(event);
    if (START_TYPES.has(type)) {
      if (!id) continue;
      if (!active.has(id) && eventToolName(event)) active.add(id);
      continue;
    }
    if (!END_TYPES.has(type)) continue;
    if (!id || !active.has(id)) continue;
    active.delete(id);
    timestamps.push(eventTimestamp(event));
  }
  return timestamps;
}

const GUARD_CLASSES: ReadonlySet<string> = new Set<ToolGuardClass>([
  "write_outside", "git_mutation", "delete_outside", "kill_or_format", "package_install",
  "network_client", "agent_client", "protected_root", "guard_tamper", "containment_escape",
]);

/** The guard class a disclosed `CONTRACT:` block reason names, when it names one. */
function guardClassFromText(text: string | undefined): ToolGuardClass | undefined {
  if (!text) return undefined;
  const value = text.toLowerCase();
  if (value.includes("write only under")) return "write_outside";
  if (value.includes("no git mutations")) return "git_mutation";
  if (value.includes("no package installs")) return "package_install";
  if (value.includes("no sub-agents")) return "agent_client";
  if (value.includes("no network or agent clients")) return "network_client";
  if (value.includes("no launches outside the supervised process tree")) return "containment_escape";
  if (value.includes("harness policy and its state are not yours")) return "guard_tamper";
  if (value.includes("deletes and process kills only inside")) return "kill_or_format";
  if (value.includes("belongs to the harness and is read-only")) return "protected_root";
  return undefined;
}

/** A structured `class` a guard may attach to its own denial record. */
function explicitGuardClass(event: NativeEvent, depth = 0): ToolGuardClass | undefined {
  if (depth > 4) return undefined;
  if (typeof event.class === "string" && GUARD_CLASSES.has(event.class)) return event.class as ToolGuardClass;
  for (const value of Object.values(event)) {
    const item = record(value);
    if (item) {
      const found = explicitGuardClass(item, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

function containsContract(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof value === "string") return value.trimStart().startsWith("CONTRACT:");
  if (Array.isArray(value)) return value.some((item) => containsContract(item, depth + 1));
  const item = record(value);
  if (!item) return false;
  if (typeof item.text === "string" && item.text.trimStart().startsWith("CONTRACT:")) return true;
  if (typeof item.reason === "string" && item.reason.trimStart().startsWith("CONTRACT:")) return true;
  if (["denied", "blocked", "permission_denied"].includes(String(item.status ?? item.kind ?? "").toLowerCase())) return true;
  return Object.values(item).some((child) => containsContract(child, depth + 1));
}

function executableName(token: string): string {
  const bare = token.replace(/^['"]|['"]$/g, "");
  const base = bare.split("/").filter(Boolean).pop() ?? "";
  const lowered = base.toLowerCase();
  if (!lowered) return "unknown";
  const dot = lowered.lastIndexOf(".");
  return dot > 0 ? lowered.slice(0, dot) : lowered;
}

function shellExecutable(command: string): string {
  for (const token of command.trim().split(/\s+/)) {
    if (!token) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    if (token === "sudo" || token === "env" || token === "time") continue;
    return token;
  }
  return "";
}

function firstPathArg(args: NativeEvent | undefined): string | undefined {
  if (!args) return undefined;
  if (Array.isArray(args.paths)) {
    for (const value of args.paths) if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const key of PATH_ARGUMENT_KEYS) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function denialTarget(toolName: string, args: NativeEvent | undefined): string {
  const name = toolName.toLowerCase();
  if (SHELL_TOOLS.has(name) || name.startsWith("run_")) {
    const command = typeof args?.command === "string" ? args.command : "";
    return executableName(shellExecutable(command));
  }
  const value = firstPathArg(args);
  if (value !== undefined) return relativeDisplayPath(value);
  if (typeof args?.pattern === "string" && args.pattern.trim()) return "<pattern>";
  return "unknown";
}

/** Every denial in the stream, each with its relative target and guard class. */
function projectDenials(events: readonly NativeEvent[]): ReportDenial[] {
  const starts = new Map<string, { toolName: string; args: NativeEvent | undefined }>();
  const blockTexts = new Map<string, string>();
  const denials: ReportDenial[] = [];
  for (const event of events) {
    const type = String(event.type ?? "");
    const id = eventId(event);
    const name = eventToolName(event);
    if (START_TYPES.has(type)) {
      if (!id) continue;
      const pending = starts.get(id);
      if (pending) {
        if (!pending.args) pending.args = eventArgs(event);
        continue;
      }
      if (!name) continue;
      starts.set(id, { toolName: name, args: eventArgs(event) });
      continue;
    }
    if (type === "tool_hooks") {
      const outcome = record(event.outcome);
      if (event.phase === "pre" && outcome?.kind === "block" && typeof outcome.text === "string" && id) {
        blockTexts.set(id, outcome.text);
      }
      continue;
    }
    if (!END_TYPES.has(type)) continue;
    const start = id ? starts.get(id) : undefined;
    if (!start) continue;
    starts.delete(id);
    const denied = DENY_TYPES.has(type)
      || event.denied === true
      || event.is_denied === true
      || containsContract(event);
    if (!denied) continue;
    const text = blockTexts.get(id);
    const guard_class = explicitGuardClass(event) ?? guardClassFromText(text) ?? "denied";
    denials.push({ tool: start.toolName, target: denialTarget(start.toolName, start.args), guard_class });
  }
  return denials;
}

/* -------------------------------------------------------------------------- */
/* Assistant text                                                             */
/* -------------------------------------------------------------------------- */

function textOf(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      const item = record(block);
      if (item && typeof item.text === "string" && item.text.trim()) parts.push(item.text);
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  const item = record(content);
  if (item && typeof item.text === "string") return item.text.trim() || undefined;
  return undefined;
}

function assistantTextFromEvent(event: NativeEvent): string | undefined {
  const type = String(event.type ?? "");
  if (type === "result" && typeof event.result === "string") return event.result.trim() || undefined;
  const message = record(event.message);
  if (message?.role === "assistant") {
    const text = textOf(message.content) ?? (typeof message.text === "string" ? message.text : undefined);
    if (text) return text;
  }
  if (type === "assistant") {
    const text = textOf(event.content) ?? (typeof event.text === "string" ? event.text : undefined);
    if (text) return text;
  }
  if (type === "agent_end" && Array.isArray(event.messages)) {
    for (let index = event.messages.length - 1; index >= 0; index -= 1) {
      const item = record(event.messages[index]);
      if (item?.role === "assistant") {
        const text = textOf(item.content);
        if (text) return text;
      }
    }
  }
  return undefined;
}

/** The last assistant-authored text in the stream, before redaction or bounding. */
export function lastAssistantText(events: readonly NativeEvent[]): string | undefined {
  let found: string | undefined;
  for (const event of events) {
    const text = assistantTextFromEvent(event);
    if (text !== undefined) found = text;
  }
  return found;
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

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

function definedTokens(usage: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number } | undefined): ReportTokens | null {
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

  const log = await readEventLog(root, record.control_path, options.full === true);
  const events = parseEvents(log.lines);

  const window = projectActivity(events, { window: last });
  const all = projectActivity(events, { window: ACTIVITY_ALL_WINDOW });
  const ages = completionTimestamps(events).slice(-window.calls.length);
  const calls: ReportActivityCall[] = window.calls.map((call, index) => {
    const at = ages[index];
    const age = at === undefined ? undefined : Math.max(0, now - at);
    return { ...call, ...(age !== undefined ? { age_ms: age } : {}) };
  });

  const native = nativeCostFactsFromEvents(log.lines);
  const priceTable = await loadOperatorPriceTable(root);
  const resolved = resolveRunCost({ runtime: record.runtime, native, priceTable });
  const tokens = native.token_counts ? definedTokens(native.usage) : null;

  const denialEvents = projectDenials(events);
  const rawAssistant = lastAssistantText(events);
  const lastAssistant = rawAssistant === undefined
    ? undefined
    : sanitizeReportText(rawAssistant).slice(0, LAST_ASSISTANT_TEXT_LIMIT);

  const startedMs = record.started_at !== undefined ? Date.parse(record.started_at) : Number.NaN;
  const reference = record.settled_at !== undefined ? Date.parse(record.settled_at) : now;
  const elapsed = Number.isFinite(startedMs) && Number.isFinite(reference)
    ? Math.max(0, reference - startedMs)
    : undefined;

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    generated_at: new Date(now).toISOString(),
    run_id: record.run_id,
    mission_id: record.mission_id,
    ...(record.team !== undefined ? { role: record.team.role } : {}),
    runtime: record.runtime,
    ...(record.model !== undefined ? { model: record.model } : {}),
    liveness: liveness(record, processes, { now }),
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.stop_code !== undefined ? { stop_code: record.stop_code } : {}),
    ...(record.started_at !== undefined ? { started_at: record.started_at } : {}),
    ...(elapsed !== undefined ? { elapsed_ms: elapsed } : {}),
    ...(record.turns !== undefined ? { turns: record.turns } : {}),
    denials: { count: record.denials ?? denialEvents.length, events: denialEvents },
    tokens,
    ...(tokens === null ? { tokens_unknown_reason: "the event stream carries no usage counters" } : {}),
    cost_usd: resolved.cost_usd ?? null,
    ...(resolved.cost_source !== undefined ? { cost_source: resolved.cost_source } : {}),
    ...(resolved.cost_unknown_reason !== undefined ? { cost_unknown_reason: resolved.cost_unknown_reason } : {}),
    activity: { source: window.source, window: last, calls },
    loop_signals: deterministicLoopSignals(window),
    files_written: uniqueTargets(all.calls),
    ...(lastAssistant !== undefined ? { last_assistant_text: lastAssistant } : {}),
  };
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

/** A compact, human-readable rendering. Contains no absolute path. */
export function formatRunReport(report: RunReport): string {
  const route = report.model !== undefined ? `${report.runtime}/${report.model}` : report.runtime;
  const role = report.role !== undefined ? `role=${report.role}` : "role=-";
  const lines: string[] = [
    `Run ${report.run_id}  ${report.mission_id}  ${role}  ${route}`,
    `liveness=${report.liveness}  status=${report.status ?? "-"}  elapsed=${formatDuration(report.elapsed_ms)}  turns=${report.turns ?? "-"}  denials=${report.denials.count}`,
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
