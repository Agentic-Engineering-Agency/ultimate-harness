// GitNexus rule exempt: new module, no existing symbols edited.
// Shadow-only loop probe. Nothing here decides, stops, promotes or gates work,
// and no code path consumes its answer. See docs/architecture/runtime-events.md
// for the native event shapes this projects.
import {
  evaluateSystemOne,
  type NoulQuestion,
  type Question,
  type SystemOneResult,
  type TypeSafeAnswer,
} from "./typesafe.js";

/** Completed tool calls retained by a projection. */
export const DEFAULT_ACTIVITY_WINDOW = 12;

/** Below this many completed calls there is no observable pattern to ask about. */
export const MIN_PROBE_CALLS = 4;

export type ActivitySource = "oh-my-pi" | "command-code";

export type ToolCallKind = "read" | "write" | "shell" | "other";

/** `denied` is a guard or permission refusal, which is not the same fact as an error. */
export type ErrorClass = "none" | "nonzero_exit" | "tool_error" | "denied";

/** One completed tool call, reduced to the fields the probe is allowed to name. */
export type ProjectedToolCall = {
  tool: string;
  kind: ToolCallKind;
  /** A path relative to the working directory, a shell executable name, or `<outside>`. */
  target: string;
  ok: boolean;
  error_class: ErrorClass;
};

/** The harness-authored projection of recent activity that the model is asked about. */
export type ActivityWindow = {
  source: ActivitySource;
  window: number;
  generated_at: string;
  calls: ProjectedToolCall[];
};

export type DeterministicLoopSignals = {
  /** Calls that repeat a completed call seen earlier in the same window. */
  identical_repeats: number;
  /** Transitions that step back to the state two calls earlier. */
  alternating_pairs: number;
  distinct_targets: number;
};

export type ProjectActivityOptions = {
  window?: number;
  workingDirectory?: string;
};

export type LoopProbeAnswerKey = "retrying" | "progressing" | "alternating";

export const LOOP_PROBE_QUESTIONS: Record<LoopProbeAnswerKey, LoopProbeAnswerKey> = {
  retrying: "retrying",
  progressing: "progressing",
  alternating: "alternating",
};

export type LoopProbeAnswers = {
  retrying?: TypeSafeAnswer;
  progressing?: TypeSafeAnswer;
  alternating?: TypeSafeAnswer;
};

/** No provider call is made for a window too small to contain a pattern. */
export type LoopProbeSkipped = {
  kind: "skipped";
  reason: "insufficient_activity";
  calls: number;
};

export type LoopProbeResult = (SystemOneResult | LoopProbeSkipped) & {
  signals: DeterministicLoopSignals;
  answers?: LoopProbeAnswers;
};

export type EvaluateLoopProbeOptions = {
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Explicitly switch the shadow probe off; a request is then never constructed. */
  configured?: boolean;
  fetch?: typeof globalThis.fetch;
  delay?: (ms: number) => Promise<void>;
};

const READ_TOOLS = new Set(["read_file", "read", "view", "cat", "head", "tail", "glob", "grep", "search", "list_dir", "read_directory", "ls"]);
const WRITE_TOOLS = new Set(["write_file", "edit_file", "write", "edit", "apply_patch", "patch", "create_file", "str_replace", "multi_edit", "notebook_edit", "search_replace"]);
const SHELL_TOOLS = new Set(["bash", "shell", "shell_command", "run_command", "terminal", "execute", "powershell", "zsh", "cmd"]);

const TOOL_START_TYPES: ReadonlySet<string> = new Set(["tool_queued", "tool_execution_start", "tool_running"]);
const TOOL_END_TYPES: ReadonlySet<string> = new Set(["tool_execution_end", "tool_completed"]);
const TOOL_BLOCK_TYPES: ReadonlySet<string> = new Set(["tool_hook_blocked", "tool_call_blocked", "tool_denied"]);
const CONTRACT_PREFIX = "CONTRACT:";
const DENIAL_STATES = new Set(["denied", "blocked", "permission_denied"]);

const IS_WINDOWS = process.platform === "win32";
const OUTSIDE = "<outside>";
const UNKNOWN_TARGET = "unknown";

type Event = Record<string, unknown>;

function record(value: unknown): Event | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Event : undefined;
}

/** Command Code wraps native events in an `event` envelope; oh-my-pi does not. */
function nativeEvent(value: unknown): Event | undefined {
  const outer = record(value);
  if (!outer) return undefined;
  return record(outer.event) ?? outer;
}

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

function classifyKind(toolName: string): ToolCallKind {
  const name = toolName.toLowerCase();
  if (READ_TOOLS.has(name) || name.startsWith("view_") || name.startsWith("list_")) return "read";
  if (WRITE_TOOLS.has(name) || name.startsWith("write_") || name.startsWith("edit_")) return "write";
  if (SHELL_TOOLS.has(name) || name.startsWith("run_")) return "shell";
  return "other";
}

function firstPathString(source: Event | undefined, keys: readonly string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
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
  // A leading dot is a hidden file or a relative segment, not an extension.
  return dot > 0 ? lowered.slice(0, dot) : lowered;
}

function withForwardSlashes(value: string): string {
  const slashes = value.replace(/\\/g, "/");
  const absoluteDrive = /^[A-Za-z]:\//.test(slashes);
  const rooted = absoluteDrive || slashes.startsWith("/");
  const segments: string[] = [];
  for (const segment of slashes.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        if (!rooted) segments.push("..");
        continue;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const joined = segments.join("/");
  if (rooted) return `/${joined}`;
  return joined || ".";
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function compareKey(value: string): string {
  const slashed = withForwardSlashes(value);
  return IS_WINDOWS ? slashed.toLowerCase() : slashed;
}

/**
 * A path the probe may name: relative to the working directory with forward
 * slashes, or `<outside>` when it lies beyond it. Absolute paths never survive,
 * so a projection cannot publish a home directory, a volume root or a sibling
 * checkout.
 */
export function relativeDisplayPath(value: string, workingDirectory?: string): string {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return UNKNOWN_TARGET;
  if (!isAbsolutePath(trimmed)) {
    const local = withForwardSlashes(trimmed);
    return local.startsWith("../") || local === ".." ? OUTSIDE : local;
  }
  if (!workingDirectory) return OUTSIDE;
  const absolute = withForwardSlashes(trimmed);
  const root = withForwardSlashes(workingDirectory);
  const candidate = compareKey(absolute);
  const rootKey = compareKey(root);
  if (candidate === rootKey) return ".";
  if (candidate.startsWith(`${rootKey.replace(/\/$/, "")}/`)) {
    return absolute.slice(root.replace(/\/+$/, "").length).replace(/^\/+/, "");
  }
  return OUTSIDE;
}

function projectTarget(args: Event | undefined, kind: ToolCallKind, workingDirectory?: string): string {
  if (kind === "shell") {
    const command = firstPathString(args, ["command", "cmd"]) ?? "";
    return executableName(shellExecutable(command));
  }
  // Only path-shaped arguments may name a target; a `command` never does here.
  const path = firstPathString(args, ["path", "file_path", "filePath", "file", "target_file", "notebook_path", "abs_path"]);
  if (path === undefined) return UNKNOWN_TARGET;
  return relativeDisplayPath(path, workingDirectory);
}

function containsDenialText(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof value === "string") return value.trimStart().startsWith(CONTRACT_PREFIX);
  if (Array.isArray(value)) return value.some(item => containsDenialText(item, depth + 1));
  const item = record(value);
  if (!item) return false;
  if (typeof item.text === "string" && item.text.trimStart().startsWith(CONTRACT_PREFIX)) return true;
  if (typeof item.reason === "string" && item.reason.trimStart().startsWith(CONTRACT_PREFIX)) return true;
  if (DENIAL_STATES.has(String(item.status ?? item.kind ?? "").toLowerCase())) return true;
  return Object.values(item).some(child => containsDenialText(child, depth + 1));
}

function exitCodeOf(source: Event | undefined): number | undefined {
  const value = source?.exitCode ?? source?.exit_code;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function projectStatus(end: Event): { ok: boolean; error_class: ErrorClass } {
  const result = record(end.result);
  const denied = containsDenialText(end) || end.denied === true || end.is_denied === true;
  if (denied) return { ok: false, error_class: "denied" };
  const exitCode = exitCodeOf(result) ?? exitCodeOf(end);
  const isError = end.isError === true || result?.isError === true || result?.is_error === true ||
    end.error === true || (typeof end.error === "object" && end.error !== null);
  if (exitCode !== undefined && exitCode !== 0) return { ok: false, error_class: "nonzero_exit" };
  if (isError) return { ok: false, error_class: "tool_error" };
  if (result?.ok === false || result?.success === false) return { ok: false, error_class: "tool_error" };
  return { ok: true, error_class: "none" };
}

/**
 * Reduce a native event stream to the last `window` completed tool calls.
 * Only the whitelist is retained: arguments, file contents, command lines,
 * output and message text are read to classify a call and then discarded.
 */
export function projectActivity(events: readonly unknown[], options: ProjectActivityOptions = {}): ActivityWindow {
  const requested = options.window ?? DEFAULT_ACTIVITY_WINDOW;
  const size = Number.isInteger(requested) && requested > 0 ? requested : DEFAULT_ACTIVITY_WINDOW;
  const workingDirectory = options.workingDirectory;

  const starts = new Map<string, Event & { source: ActivitySource }>();
  const calls: ProjectedToolCall[] = [];
  let commandCodeCalls = 0;
  let ohMyPiCalls = 0;

  for (const value of events) {
    const event = nativeEvent(value);
    if (!event) continue;
    const type = String(event.type ?? "");
    const id = eventCallId(event);
    const name = eventToolName(event);
    // Command Code keys its calls with a plain `id`; oh-my-pi names the field.
    const fromCommandCode = event.id !== undefined && event.toolCallId === undefined && event.tool_call_id === undefined;

    if (TOOL_START_TYPES.has(type)) {
      if (!id || !name) continue;
      starts.set(id, { toolName: name, args: eventArgs(event), source: fromCommandCode ? "command-code" : "oh-my-pi" });
      continue;
    }

    if (!TOOL_END_TYPES.has(type) && !TOOL_BLOCK_TYPES.has(type)) continue;
    const start = id ? starts.get(id) : undefined;
    if (!start) continue;
    starts.delete(id);

    const toolName = String(start.toolName ?? name);
    const kind = classifyKind(toolName);
    const status = TOOL_BLOCK_TYPES.has(type)
      ? { ok: false, error_class: "denied" as ErrorClass }
      : projectStatus(event);
    calls.push({
      tool: toolName || UNKNOWN_TARGET,
      kind,
      target: projectTarget(record(start.args), kind, workingDirectory),
      ok: status.ok,
      error_class: status.error_class,
    });
    if (start.source === "command-code") commandCodeCalls += 1;
    else ohMyPiCalls += 1;
  }

  return {
    source: commandCodeCalls > 0 && commandCodeCalls >= ohMyPiCalls ? "command-code" : "oh-my-pi",
    window: size,
    generated_at: new Date().toISOString(),
    calls: calls.slice(-size),
  };
}

/** Counts computed without a model: the probeable facts supervision can already see. */
export function deterministicLoopSignals(window: ActivityWindow): DeterministicLoopSignals {
  const calls = window.calls;
  const seen = new Set<string>();
  let identicalRepeats = 0;
  for (const call of calls) {
    const signature = `${call.tool}\u0000${call.kind}\u0000${call.target}\u0000${call.ok}\u0000${call.error_class}`;
    if (seen.has(signature)) identicalRepeats += 1;
    seen.add(signature);
  }

  let alternatingPairs = 0;
  for (let index = 2; index < calls.length; index += 1) {
    if (sameState(calls[index], calls[index - 2])) alternatingPairs += 1;
  }

  return {
    identical_repeats: identicalRepeats,
    alternating_pairs: alternatingPairs,
    distinct_targets: new Set(calls.map(call => call.target)).size,
  };
}

function sameState(left: ProjectedToolCall | undefined, right: ProjectedToolCall | undefined): boolean {
  if (!left || !right) return false;
  return left.kind === right.kind && left.target === right.target && left.ok === right.ok && left.error_class === right.error_class;
}

function noul(question: string, satisfied: string, unsatisfied: string): NoulQuestion {
  return {
    type: "noul",
    instructions: `Judge only from the \`activity.calls\` array in the supplied state, which lists the most recent completed tool calls in order with the fields \`tool\`, \`kind\`, \`target\`, \`ok\` and \`error_class\`: ${question} Do not infer unrecorded evidence, and do not assume a check passed because a call is absent.`,
    criteria: { true: satisfied, false: unsatisfied },
  };
}

/**
 * The fixed question set. Each Noul is atomic and names its evidence path, so
 * the model judges the projection rather than any transcript behind it.
 */
export function loopProbeQuestions(): Record<LoopProbeAnswerKey, NoulQuestion> {
  const retrying = noul(
    "the same failing action is being retried repeatedly with only cosmetic changes.",
    "`activity.calls` contains the same target, kind and error class failing more than once with no materially different attempt between them.",
    "Repeated failing actions in `activity.calls` differ materially, or no failing action is repeated.",
  );
  const progressing = noul(
    "the last calls produced a new file, a passing command or new information.",
    "At least one of the most recent `activity.calls` wrote a file, reported `ok` with `error_class` `none`, or touched a target absent from earlier calls.",
    "None of the most recent `activity.calls` produced a new file, a passing command or new information.",
  );
  const alternating = noul(
    "the agent alternates between two states without converging.",
    "`activity.calls` returns repeatedly to one earlier state after leaving it, without the sequence settling.",
    "The sequence does not return repeatedly to an earlier state.",
  );
  return { retrying, progressing, alternating };
}

/** The provider state: the projected window re-copied field by field, so a caller cannot widen it by mutating the input. */
export function serializeLoopProbeState(window: ActivityWindow): unknown {
  return {
    activity: {
      source: window.source,
      window: window.window,
      generated_at: window.generated_at,
      calls: window.calls.map(call => ({
        tool: call.tool,
        kind: call.kind,
        target: call.target,
        ok: call.ok,
        error_class: call.error_class,
      })),
    },
  };
}

/**
 * One shadow-only semantic check on a projected window. The provider answer is
 * returned alongside the deterministic signals and is not acted upon here: this
 * slice wires the probe into nothing.
 */
export async function evaluateLoopProbe(
  window: ActivityWindow,
  options: EvaluateLoopProbeOptions = {},
): Promise<LoopProbeResult> {
  const signals = deterministicLoopSignals(window);
  if (options.configured === false) return { kind: "disabled", signals };

  if (window.calls.length < MIN_PROBE_CALLS) {
    return { kind: "skipped", reason: "insufficient_activity", calls: window.calls.length, signals };
  }

  const questions = loopProbeQuestions() as Record<string, Question>;
  const response = await evaluateSystemOne({
    state: serializeLoopProbeState(window),
    questions,
    model: options.model,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
    delay: options.delay,
  });

  if (response.kind !== "ok") return { ...response, signals };

  const answers: LoopProbeAnswers = {};
  for (const key of Object.keys(LOOP_PROBE_QUESTIONS) as LoopProbeAnswerKey[]) {
    const answer = response.answers[LOOP_PROBE_QUESTIONS[key]];
    if (answer) answers[key] = answer;
  }
  return { ...response, answers, signals };
}
