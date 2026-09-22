// The live run digest — a small projection fed by the same native event loop
// `RuntimeSupervision` already consumes. Nothing here reads a file: the builder
// is handed each parsed event as it arrives, so a run never parses its stream a
// second time. `uh report` reads the persisted snapshot instead of the raw log.
//
// Two invariants hold for every field:
// - No absolute path survives. Targets are resolved against the run's working
//   directory with the path forms Command Code emits (`/C:/...`, backslashes,
//   mixed-case drive letters); anything outside becomes `<outside>`.
// - No credential survives. The last assistant text is scrubbed and bounded.
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  RUN_DIGEST_SCHEMA_VERSION,
  RunDigestSchema,
  type RunDigest,
  type RunDigestCall,
  type RunDigestCallStatus,
  type RunDigestCurrentActivity,
  type RunDigestEfficiency,
  type RunDigestErrorClass,
  type RunDigestGuardClass,
  type RunDigestLongRunningTool,
  type RunDigestToolOutputBytes,
  type RunDigestUsage,
} from "../schema/run-digest.js";
import {
  deterministicLoopSignals,
  type ActivitySource,
  type ActivityWindow,
  type ErrorClass,
  type ProjectedToolCall,
  type ToolCallKind,
} from "./loop-probe.js";
import { nativeToolFailure } from "./native-tool-result.js";
import { nativeRuntimeEvent } from "./runtime-supervision.js";
import type { ToolGuardClass } from "./tool-guard.js";

/** The digest artifact name; it lives next to `runtime-control.json`. */
export const RUN_DIGEST_FILE = "run-digest.json";
/** Completed calls the digest retains. */
export const RUN_DIGEST_RECENT_CALLS = 12;
/** Distinct write targets the digest lists before it caps the array. */
export const RUN_DIGEST_FILES_LIMIT = 50;
/** Denials the digest retains, so a denial storm cannot grow the artifact without bound. */
export const RUN_DIGEST_DENIALS_LIMIT = 100;
/** The last assistant text is never longer than this many characters. */
export const LAST_ASSISTANT_TEXT_LIMIT = 600;
/** A call still in flight with no end event or output for this long is a loop signal. */
export const LONG_RUNNING_TOOL_MS = 5 * 60 * 1000;
/** The context snapshot is taken at the first request, the request after five, and the last. */
const CONTEXT_AFTER_FIVE = 5;
/** The efficiency block measures output bytes for each projection kind. */
const EMPTY_OUTPUT_BYTES: RunDigestToolOutputBytes = { read: 0, write: 0, shell: 0, other: 0 };

const OUTSIDE = "<outside>";
const UNKNOWN_TARGET = "unknown";
const PATTERN_TARGET = "<pattern>";
const PLACEHOLDER_TARGETS: ReadonlySet<string> = new Set([OUTSIDE, PATTERN_TARGET, UNKNOWN_TARGET]);
const REDACTED = "[redacted]";
const PATH_PLACEHOLDER = "[path]";

type Event = Record<string, unknown>;

const record = (value: unknown): Event | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined;

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
 * Sanitize free text for a digest or report: known credentials and absolute
 * paths are replaced, so a field can never publish a credential or a home
 * directory.
 */
export function sanitizeReportText(text: string): string {
  return redactSecrets(text)
    .replace(WINDOWS_ABSOLUTE_PATH, PATH_PLACEHOLDER)
    .replace(POSIX_ABSOLUTE_PATH, PATH_PLACEHOLDER)
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Guard classes                                                              */
/* -------------------------------------------------------------------------- */

/** Every guard class a denial may name, including the bounded `denied` fallback. */
export const GUARD_CLASS_NAMES: readonly string[] = [
  "write_outside", "git_mutation", "delete_outside", "kill_or_format", "package_install",
  "network_client", "agent_client", "protected_root", "guard_tamper", "containment_escape",
  "virtual_device",
];

const GUARD_CLASSES: ReadonlySet<string> = new Set<ToolGuardClass>([
  "write_outside", "git_mutation", "delete_outside", "kill_or_format", "package_install",
  "network_client", "agent_client", "protected_root", "guard_tamper", "containment_escape",
  "virtual_device",
]);

/** The guard class a disclosed `CONTRACT:` block reason names, when it names one. */
export function guardClassFromText(text: string | undefined): ToolGuardClass | undefined {
  if (!text) return undefined;
  const value = text.toLowerCase();
  if (value.includes("write only under")) return "write_outside";
  if (value.includes("no git mutations")) return "git_mutation";
  if (value.includes("no package installs")) return "package_install";
  if (value.includes("no sub-agents")) return "agent_client";
  if (value.includes("no network or agent clients")) return "network_client";
  if (value.includes("no launches outside the supervised process tree")) return "containment_escape";
  if (value.includes("virtual devices are not available")) return "virtual_device";
  if (value.includes("harness policy and its state are not yours")) return "guard_tamper";
  if (value.includes("deletes and process kills only inside")) return "kill_or_format";
  if (value.includes("belongs to the harness and is read-only")) return "protected_root";
  return undefined;
}

/** A structured `class` a guard may attach to its own denial record. */
export function explicitGuardClass(event: Event, depth = 0): ToolGuardClass | undefined {
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

/* -------------------------------------------------------------------------- */
/* Event shapes                                                               */
/* -------------------------------------------------------------------------- */

const START_TYPES: ReadonlySet<string> = new Set(["tool_queued", "tool_running", "tool_execution_start"]);
const END_TYPES: ReadonlySet<string> = new Set(["tool_execution_end", "tool_completed"]);
const DENY_TYPES: ReadonlySet<string> = new Set(["tool_hook_blocked", "tool_call_blocked", "tool_denied"]);

const SHELL_TOOLS: ReadonlySet<string> = new Set([
  "bash", "shell", "shell_command", "run_command", "terminal", "execute", "powershell", "zsh", "cmd",
]);
const READ_TOOLS: ReadonlySet<string> = new Set([
  "read_file", "read", "view", "cat", "head", "tail", "glob", "grep", "search", "list_dir", "read_directory", "ls",
]);
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "write_file", "edit_file", "write", "edit", "apply_patch", "patch", "create_file", "str_replace", "multi_edit", "notebook_edit", "search_replace",
]);
const PATH_ARGUMENT_KEYS = ["path", "file_path", "filePath", "file", "target_file", "notebook_path", "abs_path"] as const;

function eventCallId(event: Event): string {
  return String(event.toolCallId ?? event.tool_call_id ?? event.id ?? "");
}

function eventToolName(event: Event): string {
  const name = event.toolName ?? event.tool_name ?? event.tool;
  return typeof name === "string" ? name.trim() : "";
}

function eventArgs(event: Event): Event | undefined {
  const args = record(event.input) ?? record(event.args);
  if (args) return args;
  return typeof event.command === "string" ? { command: event.command } : undefined;
}

function eventTimestamp(event: Event): number | undefined {
  const raw = event.timestamp;
  if (typeof raw !== "string") return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function classifyToolKind(toolName: string): ToolCallKind {
  const name = toolName.toLowerCase();
  if (READ_TOOLS.has(name) || name.startsWith("view_") || name.startsWith("list_")) return "read";
  if (WRITE_TOOLS.has(name) || name.startsWith("write_") || name.startsWith("edit_")) return "write";
  if (SHELL_TOOLS.has(name) || name.startsWith("run_")) return "shell";
  return "other";
}

/** The first shell token that is not a leading `NAME=value` assignment. */
function shellExecutable(command: string): string {
  for (const token of command.trim().split(/\s+/)) {
    if (!token) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    if (token === "sudo" || token === "env" || token === "time") continue;
    return token;
  }
  return "";
}

function executableName(token: string): string {
  const bare = token.replace(/^['"]|['"]$/g, "");
  const base = bare.split("/").filter(Boolean).pop() ?? "";
  const lowered = base.toLowerCase();
  if (!lowered) return UNKNOWN_TARGET;
  const dot = lowered.lastIndexOf(".");
  return dot > 0 ? lowered.slice(0, dot) : lowered;
}

function firstPathValue(args: Event | undefined): string | undefined {
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

/**
 * oh-my-pi names a line range inside `args.path` (`src/a.ts:18-28`); Command
 * Code carries it in `offset`/`limit`. Split it so a write target is the bare
 * path and a read key can name the range it read. A path with no numeric range
 * suffix is left intact.
 */
function splitPathRange(value: string): { path: string; range?: string } {
  const trimmed = value.trim();
  const match = /^(.*?):(\d+)(?:-(\d+))?$/.exec(trimmed);
  if (!match || !match[1]) return { path: trimmed };
  const start = match[2]!;
  return { path: match[1], range: match[3] ? `${start}-${match[3]}` : start };
}

/** The line range a call read, from an explicit suffix or from `offset`/`limit`. */
function rangeFromArgs(args: Event | undefined, inline?: string): string {
  if (inline !== undefined) return inline;
  if (!args) return "";
  const offset = numberOf(args.offset) ?? numberOf(args.start_line) ?? numberOf(args.startLine);
  const limit = numberOf(args.limit) ?? numberOf(args.end_line) ?? numberOf(args.endLine);
  if (offset === undefined && limit === undefined) return "";
  return `${offset ?? ""}:${limit ?? ""}`;
}

interface CallTarget {
  target: string;
  range: string;
}

/** The relative target and the line range a call names, without ever publishing an absolute path. */
function callTargetInfo(args: Event | undefined, kind: ToolCallKind, workingDirectory?: string): CallTarget {
  if (kind === "shell") {
    const command = typeof args?.command === "string" ? args.command : typeof args?.cmd === "string" ? args.cmd : "";
    return { target: executableName(shellExecutable(command)), range: "" };
  }
  const value = firstPathValue(args);
  if (value !== undefined) {
    const split = splitPathRange(value);
    return { target: relativeRunTarget(split.path, workingDirectory), range: rangeFromArgs(args, split.range) };
  }
  if (typeof args?.pattern === "string" && args.pattern.trim()) return { target: PATTERN_TARGET, range: "" };
  return { target: UNKNOWN_TARGET, range: "" };
}

/** The bytes of tool output a completed call produced, from its text result. */
function outputTextOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(outputTextOf).join("");
  const item = record(value);
  if (!item) return "";
  if (typeof item.text === "string") return item.text;
  if (item.content !== undefined) return outputTextOf(item.content);
  return "";
}

function toolOutputBytes(event: Event): number {
  const raw = event.result ?? event.output ?? event.content;
  const text = outputTextOf(raw);
  return text.length === 0 ? 0 : Buffer.byteLength(text, "utf8");
}

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

function normalizeSlashes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/\\/g, "/");
}

/** Command Code writes an absolute Windows path as `/C:/dir/file`; fold the leading slash. */
function foldDrivePath(value: string): string {
  return value.replace(/^\/([A-Za-z]:)/, "$1");
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

/** Collapse `.`/`..` segments while keeping the drive or root prefix. */
function collapse(value: string): string {
  const folded = foldDrivePath(normalizeSlashes(value));
  const drive = /^([A-Za-z]:)\//.exec(folded);
  const prefix = drive ? `${drive[1]}/` : folded.startsWith("/") ? "/" : "";
  const segments: string[] = [];
  for (const segment of folded.slice(prefix.length).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0) segments.pop();
      else if (prefix === "") segments.push("..");
      continue;
    }
    segments.push(segment);
  }
  return prefix + segments.join("/");
}

/**
 * A path the digest may name: relative to the working directory with forward
 * slashes, or `<outside>` when it lies beyond it. Absolute paths never survive,
 * so a digest cannot publish a home directory, a volume root or a sibling
 * checkout. Windows drive paths compare case-insensitively regardless of the
 * host platform, so `C:\Worker\x`, `/C:/Worker/x` and `c:/worker/x` relate to
 * the same working directory the same way everywhere.
 */
export function relativeRunTarget(value: string, workingDirectory?: string): string {
  const clean = normalizeSlashes(value);
  if (!clean) return UNKNOWN_TARGET;
  const folded = foldDrivePath(clean);
  if (!isAbsolutePath(folded)) {
    const local = collapse(clean);
    return local === ".." || local.startsWith("../") ? OUTSIDE : local || ".";
  }
  if (!workingDirectory) return OUTSIDE;
  const candidate = collapse(clean);
  const root = collapse(workingDirectory);
  const base = root.replace(/\/+$/, "");
  const caseInsensitive = /^[A-Za-z]:\//.test(candidate) || /^[A-Za-z]:\//.test(base);
  const left = caseInsensitive ? candidate.toLowerCase() : candidate;
  const right = caseInsensitive ? base.toLowerCase() : base;
  if (left === right) return ".";
  if (left.startsWith(`${right}/`)) {
    const relative = candidate.slice(base.length).replace(/^\/+/, "");
    return relative || ".";
  }
  return OUTSIDE;
}

function projectCallTarget(args: Event | undefined, kind: ToolCallKind, workingDirectory?: string): string {
  return callTargetInfo(args, kind, workingDirectory).target;
}

/* -------------------------------------------------------------------------- */
/* Call status and assistant text                                             */
/* -------------------------------------------------------------------------- */

function exitCodeOf(source: Event | undefined): number | undefined {
  const value = source?.exitCode ?? source?.exit_code;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Whether a completed call failed, and in which way. Mirrors the loop probe's split. */
function projectStatus(event: Event): { status: RunDigestCallStatus; error_class: RunDigestErrorClass } {
  const result = record(event.result);
  const native = nativeToolFailure(event);
  const exitCode = native.exit_code ?? exitCodeOf(result) ?? exitCodeOf(event);
  const isError = event.isError === true || result?.isError === true || result?.is_error === true ||
    event.error === true || (typeof event.error === "object" && event.error !== null);
  if (exitCode !== undefined && exitCode !== 0) return { status: "failed", error_class: "nonzero_exit" };
  if (native.failed || isError) return { status: "failed", error_class: "tool_error" };
  if (result?.ok === false || result?.success === false) return { status: "failed", error_class: "tool_error" };
  return { status: "ok", error_class: "none" };
}

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

function assistantTextFromEvent(event: Event): string | undefined {
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
export function lastAssistantText(events: Iterable<unknown>): string | undefined {
  let found: string | undefined;
  for (const value of events) {
    const event = record(value);
    if (!event) continue;
    const text = assistantTextFromEvent(event);
    if (text !== undefined) found = text;
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/* Usage                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Command Code names token counters in camelCase; oh-my-pi names them in short
 * camelCase (`input`, `output`, `cacheRead`, `cacheWrite`); canonical usage uses
 * snake_case. Every spelling of the same counter maps to one canonical field.
 */
const TOKEN_FIELDS = [
  { canonical: "input_tokens", aliases: ["inputTokens", "input_tokens", "input", "prompt_tokens"] },
  { canonical: "output_tokens", aliases: ["outputTokens", "output_tokens", "output", "completion_tokens"] },
  { canonical: "cache_read_tokens", aliases: ["cacheReadTokens", "cache_read_tokens", "cacheRead", "cache_read"] },
  { canonical: "cache_write_tokens", aliases: ["cacheWriteTokens", "cache_write_tokens", "cacheWrite", "cache_write"] },
] as const;

/** The aliases of the input counter, which is the context size of a model request. */
const INPUT_TOKEN_KEYS = TOKEN_FIELDS[0].aliases;

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function firstNumber(source: Event | undefined, keys: readonly string[]): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = numberOf(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** The usage object an event may carry at the top level, on its message, or on its result. */
function usageObjectOf(event: Event): Event | undefined {
  return record(event.usage) ?? record(record(event.message)?.usage) ?? record(record(event.result)?.usage);
}

/**
 * oh-my-pi appends one run-level `runtime.usage` event (carrying the counters at
 * the top level) after the run finishes. It is named in the `event` field, not
 * in `type`, so it survives the native-event unwrap as the event itself.
 */
function isRuntimeUsageEvent(event: Event, type: string): boolean {
  return type === "runtime.usage" || event.event === "runtime.usage";
}

/** The usage object of a `runtime.usage` event: its `usage` object, or the event itself. */
function runtimeUsageObjectOf(event: Event): Event | undefined {
  return record(event.usage) ?? event;
}

/* -------------------------------------------------------------------------- */
/* Reasoning and text deltas                                                  */
/* -------------------------------------------------------------------------- */

function thinkingEventKind(event: Event, type: string): string | undefined {
  if (type === "thinking_delta" || type === "thinking_start" || type === "thinking_end") return type;
  if (type !== "message_update") return undefined;
  const inner = record(event.assistantMessageEvent);
  return typeof inner?.type === "string" && inner.type.startsWith("thinking") ? inner.type : undefined;
}

function thinkingText(event: Event, type: string): string | undefined {
  const source = type === "message_update" ? record(event.assistantMessageEvent) : event;
  for (const key of ["delta", "text", "content"]) {
    if (typeof source?.[key] === "string") return source[key] as string;
  }
  return undefined;
}

function isTextDelta(event: Event, type: string): boolean {
  if (type === "text_delta") return true;
  if (type !== "message_update") return false;
  return record(event.assistantMessageEvent)?.type === "text_delta";
}

function textDeltaText(event: Event, type: string): string | undefined {
  const source = type === "message_update" ? record(event.assistantMessageEvent) : event;
  for (const key of ["delta", "text"]) {
    if (typeof source?.[key] === "string") return source[key] as string;
  }
  return undefined;
}

function activitySourceFor(runtime: string): ActivitySource {
  return runtime.toLowerCase() === "oh-my-pi" ? "oh-my-pi" : "command-code";
}

/* -------------------------------------------------------------------------- */
/* The builder                                                                */
/* -------------------------------------------------------------------------- */

export interface RunDigestOptions {
  /** The run's runtime, taken from the attempt, never guessed from event shapes. */
  runtime: string;
  /** The run's working directory; every target is resolved against it. */
  workingDirectory?: string;
  /** When the attempt started, used as the `since` of the initial idle activity. */
  startedAt?: number;
}

interface PendingCall {
  tool: string;
  args: Event | undefined;
  startedMs: number;
  /** The timestamp of the last event that referenced this call; the stall clock resets here. */
  lastSeenMs: number;
}

interface ActivityState {
  kind: RunDigestCurrentActivity["kind"];
  sinceMs: number;
  chars: number;
  detail?: string;
  callId?: string;
}

/**
 * An incremental projection of the native event stream. `observe` is called
 * once per event, in stream order, by the same loop that feeds supervision;
 * `snapshot` renders the bounded document that is written as
 * `run-digest.json`. The builder retries nothing, writes nothing and never
 * decides anything.
 */
export class RunDigestBuilder {
  private turns = 0;
  private activity: ActivityState;
  private readonly pending = new Map<string, PendingCall>();
  private readonly recent: RunDigestCall[] = [];
  private readonly files = new Set<string>();
  private readonly denials: RunDigest["denials"] = [];
  private readonly hookCalls = new Set<string>();
  private readonly hookBlocks = new Map<string, string>();
  private readonly requestUsages: Event[] = [];
  private readonly runtimeUsages: Event[] = [];
  private readonly turnEndUsages: Event[] = [];
  private sawModelRequestEnd = false;
  private nativeRefusals = 0;
  private lastAssistantRaw: string | undefined;
  // Efficiency accumulators. Each is only published once it has been measured.
  private readonly requestContexts: number[] = [];
  private readonly turnToolCallCounts: number[] = [];
  private callsInTurn = 0;
  private completedCalls = 0;
  private readCalls = 0;
  private reReads = 0;
  private readonly readKeys = new Set<string>();
  private readonly outputBytes: RunDigestToolOutputBytes = { ...EMPTY_OUTPUT_BYTES };
  private toolTimeMs = 0;
  private modelTimeMs = 0;
  private modelRequestsMeasured = 0;
  private modelRequestStartedAt: number | undefined;

  constructor(private readonly options: RunDigestOptions) {
    const startedAt = options.startedAt ?? Date.now();
    this.activity = { kind: "idle", sinceMs: Number.isFinite(startedAt) ? startedAt : Date.now(), chars: 0 };
  }

  private setActivity(kind: ActivityState["kind"], sinceMs: number, extra: { detail?: string; callId?: string } = {}): void {
    this.activity = {
      kind,
      sinceMs,
      chars: 0,
      ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
      ...(extra.callId !== undefined ? { callId: extra.callId } : {}),
    };
  }

  private observeUsage(event: Event, type: string): void {
    if (type === "model_request_end") {
      this.sawModelRequestEnd = true;
      const usage = usageObjectOf(event);
      if (!usage) return;
      this.requestUsages.push(usage);
      // The input of a model request is the context the model was given.
      const context = firstNumber(usage, INPUT_TOKEN_KEYS);
      if (context !== undefined) this.requestContexts.push(context);
      return;
    }
    // oh-my-pi reports one run-level usage event; Command Code reports per request
    // and repeats the same object on `turn_end` (summing both would double count).
    if (isRuntimeUsageEvent(event, type)) {
      const usage = runtimeUsageObjectOf(event);
      if (usage) this.runtimeUsages.push(usage);
      return;
    }
    const usage = usageObjectOf(event);
    if (usage && type === "turn_end") this.turnEndUsages.push(usage);
  }

  observe(value: unknown, now: number): void {
    const event = nativeRuntimeEvent(value);
    if (!event) return;
    const type = typeof event.type === "string" ? event.type : "";
    const usageEvent = isRuntimeUsageEvent(event, type);
    if (!type && !usageEvent) return;
    const id = eventCallId(event);
    const timestamp = eventTimestamp(event) ?? now;

    this.observeUsage(event, type);
    // Any event that references an in-flight call is output; the stall clock resets here.
    const inflight = id ? this.pending.get(id) : undefined;
    if (inflight) inflight.lastSeenMs = timestamp;
    if (!type) return;
    const assistant = assistantTextFromEvent(event);
    if (assistant !== undefined) this.lastAssistantRaw = assistant;

    const thinking = thinkingEventKind(event, type);
    if (thinking !== undefined) {
      if (this.activity.kind !== "reasoning") this.setActivity("reasoning", timestamp);
      const text = thinkingText(event, type);
      if (text) this.activity.chars += text.length;
      return;
    }
    if (isTextDelta(event, type)) {
      if (this.activity.kind !== "text") this.setActivity("text", timestamp);
      const text = textDeltaText(event, type);
      if (text) this.activity.chars += text.length;
      return;
    }

    // A model request is one round trip: its duration is model time, distinct from tool time.
    if (type === "model_request_start") {
      this.modelRequestStartedAt = timestamp;
      return;
    }
    if (type === "model_request_end") {
      if (this.modelRequestStartedAt !== undefined) {
        this.modelTimeMs += Math.max(0, timestamp - this.modelRequestStartedAt);
        this.modelRequestsMeasured += 1;
      }
      this.modelRequestStartedAt = undefined;
      return;
    }

    const nativeTurns = numberOf(event.num_turns) ?? numberOf(record(event.result)?.num_turns);
    if (nativeTurns !== undefined && Number.isInteger(nativeTurns)) this.turns = Math.max(this.turns, nativeTurns);
    if (type === "turn_end") {
      this.turns += 1;
      this.turnToolCallCounts.push(this.callsInTurn);
      this.callsInTurn = 0;
    }

    if (START_TYPES.has(type)) {
      const args = eventArgs(event);
      const name = eventToolName(event);
      const existing = id ? this.pending.get(id) : undefined;
      // A call registers once; Command Code repeats it at `tool_running` with no arguments.
      if (!existing) this.callsInTurn += 1;
      const pending: PendingCall | undefined = existing ?? (id && name ? { tool: name, args, startedMs: timestamp, lastSeenMs: timestamp } : undefined);
      if (pending) {
        if (!pending.args && args) pending.args = args;
        if (!pending.tool && name) pending.tool = name;
        if (!existing) this.pending.set(id, pending);
      }
      const tool = pending?.tool || name || UNKNOWN_TARGET;
      const kind = classifyToolKind(tool);
      const target = projectCallTarget(pending?.args, kind, this.options.workingDirectory);
      if (this.activity.kind !== "tool" || this.activity.callId !== id) {
        this.setActivity("tool", timestamp, { detail: `${tool} ${target}`, callId: id });
      }
      return;
    }

    if (type === "tool_hooks") {
      const outcome = record(event.outcome);
      if (event.phase === "pre" && id) this.hookCalls.add(id);
      if (event.phase === "pre" && id && outcome?.kind === "block" && typeof outcome.text === "string") {
        this.hookBlocks.set(id, outcome.text);
      }
      return;
    }

    if (!END_TYPES.has(type) && !DENY_TYPES.has(type)) return;
    const start = id ? this.pending.get(id) : undefined;
    if (!start) return;
    this.pending.delete(id);
    const tool = start.tool || eventToolName(event) || UNKNOWN_TARGET;
    const kind = classifyToolKind(tool);
    const info = callTargetInfo(start.args, kind, this.options.workingDirectory);
    const target = info.target;
    const durationMs = Math.max(0, Math.round(timestamp - start.startedMs));
    this.completedCalls += 1;
    this.toolTimeMs += durationMs;
    this.outputBytes[kind] += toolOutputBytes(event);
    if (kind === "read") {
      this.readCalls += 1;
      // A re-read repeats one `(path, line range)`; a different range of the same file is new.
      const key = `${target}\u0000${info.range}`;
      if (this.readKeys.has(key)) this.reReads += 1;
      else this.readKeys.add(key);
    }
    const denied = DENY_TYPES.has(type) || event.denied === true || event.is_denied === true || containsContract(event);
    const verdict = denied ? { status: "denied" as const, error_class: "denied" as const } : projectStatus(event);
    this.recent.push({
      tool,
      kind,
      target,
      status: verdict.status,
      error_class: verdict.error_class,
      started_at: new Date(start.startedMs).toISOString(),
      duration_ms: durationMs,
    });
    if (this.recent.length > RUN_DIGEST_RECENT_CALLS) this.recent.shift();
    if (this.pending.size === 0 && this.activity.kind === "tool") this.setActivity("idle", timestamp);
    if (denied) {
      // A native refusal is a runtime denial that never invoked the guard hook.
      if (type === "tool_denied" && !(id && this.hookCalls.has(id))) this.nativeRefusals += 1;
      if (this.denials.length < RUN_DIGEST_DENIALS_LIMIT) {
        const guardClass: RunDigestGuardClass =
          explicitGuardClass(event) ?? guardClassFromText(id ? this.hookBlocks.get(id) : undefined) ?? "denied";
        this.denials.push({ class: guardClass, tool, target });
      }
    } else if (kind === "write" && verdict.status === "ok" && !PLACEHOLDER_TARGETS.has(target)) {
      this.files.add(target);
    }
  }

  private usageTotals(): RunDigestUsage {
    const chosen = this.sawModelRequestEnd
      ? this.requestUsages
      : this.runtimeUsages.length > 0 ? this.runtimeUsages : this.turnEndUsages;
    const totals = new Map<string, number>();
    const incomplete = new Set<string>();
    let measured = false;
    for (const usage of chosen) {
      const counts = TOKEN_FIELDS.map((field) => [field.canonical, firstNumber(usage, field.aliases)] as const);
      if (!counts.some(([, value]) => value !== undefined)) continue;
      measured = true;
      for (const [canonical, value] of counts) {
        if (value === undefined) { incomplete.add(canonical); continue; }
        if (!incomplete.has(canonical)) totals.set(canonical, (totals.get(canonical) ?? 0) + value);
      }
    }
    const result: RunDigestUsage = {};
    if (!measured) return result;
    for (const field of TOKEN_FIELDS) {
      if (incomplete.has(field.canonical)) continue;
      const total = totals.get(field.canonical);
      if (total !== undefined) result[field.canonical] = total;
    }
    return result;
  }

  private currentActivity(): RunDigestCurrentActivity {
    const since = new Date(this.activity.sinceMs).toISOString();
    if (this.activity.kind === "tool" && this.activity.detail !== undefined) {
      return { kind: "tool", since, detail: this.activity.detail };
    }
    if (this.activity.kind === "reasoning" && this.activity.chars > 0) {
      return { kind: "reasoning", since, detail: this.activity.chars };
    }
    return { kind: this.activity.kind, since };
  }

  /**
   * Calls still in flight with no end event and no output for more than the
   * stall window. A hung child pipeline (a reader that never saw end of input)
   * is otherwise indistinguishable from a long-but-productive call.
   */
  private longRunningTools(now: number): RunDigestLongRunningTool[] {
    const stalled: RunDigestLongRunningTool[] = [];
    for (const call of this.pending.values()) {
      const silentMs = now - call.lastSeenMs;
      if (silentMs <= LONG_RUNNING_TOOL_MS) continue;
      const kind = classifyToolKind(call.tool);
      stalled.push({
        tool: call.tool,
        target: callTargetInfo(call.args, kind, this.options.workingDirectory).target,
        minutes: Math.floor(silentMs / 60_000),
      });
    }
    return stalled;
  }

  private loopSignals(now: number): RunDigest["loop_signals"] {
    const calls: ProjectedToolCall[] = this.recent.map((call) => ({
      tool: call.tool,
      kind: call.kind,
      target: call.target,
      ok: call.status === "ok",
      error_class: call.error_class as ErrorClass,
    }));
    const window: ActivityWindow = {
      source: activitySourceFor(this.options.runtime),
      window: calls.length,
      generated_at: new Date(this.options.startedAt ?? Date.now()).toISOString(),
      calls,
    };
    return { ...deterministicLoopSignals(window), long_running_tools: this.longRunningTools(now) };
  }

  /** The measured efficiency of the attempt so far; each field is omitted until it is measured. */
  private efficiency(): RunDigestEfficiency {
    const result: RunDigestEfficiency = {};
    if (this.requestContexts.length > 0) {
      result.context_tokens_first = this.requestContexts[0]!;
      if (this.requestContexts.length > CONTEXT_AFTER_FIVE) {
        result.context_tokens_after_five = this.requestContexts[CONTEXT_AFTER_FIVE]!;
      }
      result.context_tokens_last = this.requestContexts[this.requestContexts.length - 1]!;
    }
    if (this.turnToolCallCounts.length > 0) {
      const single = this.turnToolCallCounts.filter((count) => count === 1).length;
      result.single_tool_turn_share = single / this.turnToolCallCounts.length;
    }
    if (this.readCalls > 0) {
      result.read_calls = this.readCalls;
      result.re_read_calls = this.reReads;
    }
    if (this.completedCalls > 0) {
      result.tool_output_bytes = { ...this.outputBytes };
      result.tool_time_ms = this.toolTimeMs;
    }
    if (this.modelRequestsMeasured > 0) result.model_time_ms = this.modelTimeMs;
    return result;
  }

  /** Build the bounded, validated digest document as of `now`. */
  snapshot(now: number): RunDigest {
    const document: RunDigest = {
      schema_version: RUN_DIGEST_SCHEMA_VERSION,
      generated_at: new Date(now).toISOString(),
      runtime: this.options.runtime,
      turns: this.turns,
      current_activity: this.currentActivity(),
      recent_calls: [...this.recent],
      files_written: { files: [...this.files].slice(0, RUN_DIGEST_FILES_LIMIT), total: this.files.size },
      denials: [...this.denials],
      native_refusals: this.nativeRefusals,
      usage: this.usageTotals(),
      efficiency: this.efficiency(),
      loop_signals: this.loopSignals(now),
      ...(this.lastAssistantRaw !== undefined
        ? { last_assistant_text: sanitizeReportText(this.lastAssistantRaw).slice(0, LAST_ASSISTANT_TEXT_LIMIT) }
        : {}),
    };
    return RunDigestSchema.parse(document);
  }
}

/** Project a list of already-parsed native events into one digest snapshot. */
export function projectRunDigest(events: Iterable<unknown>, options: RunDigestOptions & { now?: number } = { runtime: "unknown" }): RunDigest {
  const now = options.now ?? Date.now();
  const builder = new RunDigestBuilder(options);
  for (const event of events) builder.observe(event, now);
  return builder.snapshot(now);
}

/** The digest path beside a run's `runtime-control.json`. */
export function runDigestPath(runDir: string): string {
  return path.join(runDir, RUN_DIGEST_FILE);
}

/** Read a run's digest; a missing or malformed artifact reads as `undefined`. */
export async function readRunDigest(runDir: string): Promise<RunDigest | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(runDigestPath(runDir), "utf8"));
    const result = RunDigestSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
