import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_PROTECTED_PATHS, type RuntimeLimits, type RuntimeRoute, type RuntimeStopCode } from "../schema/runtime-control.js";
import { SHELL_TOOLS, WRITE_TOOLS } from "./tool-guard.js";
type Event = Record<string, unknown>;
const record = (value: unknown): Event | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Event : undefined;
const THINKING_WINDOW_SIZE = 64;
const THINKING_MIN_SAMPLE_LENGTH = 4_096;
const THINKING_SAMPLE_LIMIT = 16_384;
const THINKING_WINDOW_LIMIT = THINKING_SAMPLE_LIMIT - THINKING_WINDOW_SIZE + 1;

function thinkingEventType(event: Event): string | undefined {
  if (event.type === "thinking_delta" || event.type === "thinking_start" || event.type === "thinking_end") {
    return event.type;
  }
  if (event.type !== "message_update") return undefined;
  const assistantMessageEvent = record(event.assistantMessageEvent);
  return typeof assistantMessageEvent?.type === "string" && assistantMessageEvent.type.startsWith("thinking")
    ? assistantMessageEvent.type
    : undefined;
}

function thinkingText(event: Event): string | undefined {
  const source = event.type === "message_update" ? record(event.assistantMessageEvent) : event;
  for (const key of ["delta", "text", "content"]) {
    if (typeof source?.[key] === "string") return source[key] as string;
  }
  return undefined;
}

function thinkingWindowHash(text: string, start: number): number {
  let hash = 2166136261;
  for (let index = start; index < start + THINKING_WINDOW_SIZE; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function maxThinkingMs(limits: RuntimeLimits): number | undefined {
  return limits.max_thinking_ms ?? (limits.stall_timeout_ms === undefined ? undefined : limits.stall_timeout_ms * 4);
}


/** Normalize runtime envelopes without interpreting tool payloads as policy decisions. */
export function nativeRuntimeEvent(value: unknown): Event | undefined {
  const outer = record(value);
  return outer ? record(outer.event) ?? outer : undefined;
}

export function runtimeTerminalFailure(event: Event): string | undefined {
  const records = [event, record(event.result), record(event.message),
    ...(Array.isArray(event.messages) ? event.messages.map(record).filter(item => item?.role !== "toolResult") : [])];
  for (const item of records) {
    if (!item) continue;
    const reason = item.stopReason ?? item.stop_reason;
    const status = item.status;
    if (item.is_error === true || item.isError === true || item.error ||
        (typeof item.subtype === "string" && item.subtype.startsWith("error")) ||
        ["error", "aborted", "max_turns", "max_time", "timeout"].includes(String(reason)) ||
        ["failed", "error", "cancelled"].includes(String(status))) {
      return `Runtime reported failure (${String(reason ?? status ?? item.subtype ?? "error")})`;
    }
  }
  return undefined;
}

/** Native terminal stop reasons that are budget caps, mapped to UH stop codes. */
const NATIVE_BUDGET_STOP_REASONS: Record<string, RuntimeStopCode> = {
  max_turns: "turn_limit",
  max_time: "timeout",
  timeout: "timeout",
};

/** The native stopReason of a terminal event, scanning the same records as `runtimeTerminalFailure`. */
export function nativeTerminalStopReason(event: Event): string | undefined {
  const records = [event, record(event.result), record(event.message),
    ...(Array.isArray(event.messages) ? event.messages.map(record).filter(item => item?.role !== "toolResult") : [])];
  for (const item of records) {
    if (!item) continue;
    const reason = item.stopReason ?? item.stop_reason;
    if (typeof reason === "string" && reason) return reason;
  }
  return undefined;
}

/** Read native route metadata, never model-looking text inside tool payloads. */
export function nativeRuntimeRoute(value: unknown): RuntimeRoute | undefined {
  const event = nativeRuntimeEvent(value);
  if (!event) return undefined;
  const message = record(event.message) ?? event;
  const type = String(event.type);
  const claudeInit = type === "system" && event.subtype === "init";
  const claudeAssistant = type === "assistant" && message.role === "assistant";
  const requestRoute = type === "model_request_start" || type === "model_request_end";
  const messageRoute = ["message", "message_start", "message_end"].includes(type) &&
    message.role === "assistant";
  const codexRoute = ["thread.started", "turn.started", "turn.completed"].includes(type);
  if (!claudeInit && !claudeAssistant && !requestRoute && !messageRoute && !codexRoute) return undefined;
  const provider = message.provider ?? event.provider;
  const model = message.model ?? event.model;
  const providerId = typeof provider === "string" && provider ? provider : undefined;
  const modelId = typeof model === "string" && model ? model : undefined;
  return providerId || modelId ? { provider: providerId, model: modelId } : undefined;
}

/**
 * Routes of agents a runtime delegated to, read only from the structured
 * `details.progress[]` / `details.jobs[]` metadata of native tool events.
 * Tool arguments and tool text content are never read.
 */
export function nativeDelegatedRoutes(value: unknown): RuntimeRoute[] {
  const event = nativeRuntimeEvent(value);
  if (!event || !["tool_execution_update", "tool_execution_end"].includes(String(event.type))) return [];
  const details = record(record(event.partialResult)?.details) ?? record(record(event.result)?.details);
  if (!details) return [];
  const routes: RuntimeRoute[] = [];
  for (const entry of [details.progress, details.jobs].flatMap(list => Array.isArray(list) ? list : [])) {
    const job = record(entry);
    const resolved = typeof job?.resolvedModel === "string" ? job.resolvedModel.replace(/:[^:/]*$/, "") : undefined;
    const identity = typeof job?.resolvedModelIdentity === "string" && job.resolvedModelIdentity ? job.resolvedModelIdentity : resolved;
    if (!identity) continue;
    const slash = identity.indexOf("/");
    routes.push(slash > 0 ? { provider: identity.slice(0, slash), model: identity.slice(slash + 1) } : { model: identity });
  }
  return routes;
}

/** The first delegated route outside the assignment, rendered as `provider/model`. */
export function delegatedRouteMismatch(value: unknown, expected: RuntimeRoute | undefined): string | undefined {
  const route = nativeDelegatedRoutes(value).find(candidate => runtimeRouteMismatch(candidate, expected));
  return route ? [route.provider, route.model].filter(Boolean).join("/") : undefined;
}

/**
 * Whether two provider or model identifiers name the same route. Comparison
 * trims and lowercases (locale-independent), and reconciles an optional
 * `provider/model` prefix: when exactly one side is prefixed, only the part
 * after its last "/" is compared. Nothing else is normalized; there is no
 * alias table and no partial or substring matching.
 */
export function sameRouteIdentifier(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) return true;
  const leftSlash = left.lastIndexOf("/");
  const rightSlash = right.lastIndexOf("/");
  if ((leftSlash >= 0) === (rightSlash >= 0)) return false;
  return leftSlash >= 0 ? left.slice(leftSlash + 1) === right : right.slice(rightSlash + 1) === left;
}

export function runtimeRouteMismatch(observed: RuntimeRoute | undefined, expected: RuntimeRoute | undefined): boolean {
  if (!expected) return false;
  return !!observed && ((observed.provider !== undefined && expected.provider !== undefined && !sameRouteIdentifier(observed.provider, expected.provider)) ||
    (observed.model !== undefined && expected.model !== undefined && !sameRouteIdentifier(observed.model, expected.model)));
}
export interface NativeCompletionFacts {
  nativeTerminal: boolean;
  nativeTerminalFailure?: string;
  supervisionStopCode?: RuntimeStopCode;
  finalMessage: string;
  cancelled?: boolean;
  timedOut?: boolean;
  spawnError?: string;
  errors?: readonly string[];
}

/** A completed native terminal event outranks a launcher exit code only when all facts are clean. */
export function nativeRuntimeCompleted(facts: NativeCompletionFacts): boolean {
  return facts.nativeTerminal &&
    facts.nativeTerminalFailure === undefined &&
    facts.supervisionStopCode === undefined &&
    !facts.cancelled && !facts.timedOut && facts.spawnError === undefined &&
    facts.finalMessage.length > 0 &&
    (facts.errors?.length ?? 0) === 0;
}

const MUTATION_VERBS: Record<string, true> = {
  rm: true, del: true, rmdir: true, mv: true, move: true, cp: true, copy: true, tee: true, sed: true,
  "set-content": true, "out-file": true, "add-content": true, "remove-item": true, "move-item": true,
  "copy-item": true, "new-item": true,
};

const WINDOWS_PATHS = process.platform === "win32";
const PATH = WINDOWS_PATHS ? path.win32 : path.posix;

function normalizedPath(value: string): string {
  const normalized = PATH.normalize(value.trim().replace(/^['"]|['"]$/g, "")).replaceAll("\\", "/").replace(/^\.\/+/, "");
  return WINDOWS_PATHS ? normalized.toLowerCase() : normalized;
}

function relativeCandidate(value: string, workingDirectory?: string): string | undefined {
  if (!PATH.isAbsolute(value)) return value;
  if (!workingDirectory) return undefined;
  const relative = PATH.relative(PATH.resolve(workingDirectory), PATH.resolve(value));
  if (relative === "" || (!relative.startsWith("..") && !PATH.isAbsolute(relative))) return relative;
  return undefined;
}

function pathUnderProtectedRoot(value: string, roots: readonly string[], workingDirectory?: string): boolean {
  const candidate = relativeCandidate(value, workingDirectory);
  if (candidate === undefined) return false;
  const normalizedCandidate = normalizedPath(candidate);
  if (!normalizedCandidate) return false;
  return roots.some(root => {
    const normalizedRoot = normalizedPath(root);
    return normalizedRoot && (normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`));
  });
}

function shellTokens(command: string): string[] {
  return command.match(/"[^"]*"|'[^']*'|&&|\|\||[;|]|[^\s]+/g)?.map(token =>
    token.replace(/^(['"])|(['"])$/g, ""),
  ) ?? [];
}

function shellMutationTargets(command: string): string[] {
  const tokens = shellTokens(command);
  const targets: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === ">" || token === ">>") {
      if (tokens[index + 1]) targets.push(tokens[index + 1]);
      index++;
      continue;
    }
    if (token.startsWith(">")) {
      targets.push(token.slice(token.startsWith(">>") ? 2 : 1));
      continue;
    }
    const verb = token.toLowerCase();
    if (!MUTATION_VERBS[verb]) continue;
    const args: string[] = [];
    for (let next = index + 1; next < tokens.length && ![";", "|", "&&", "||"].includes(tokens[next]); next++) {
      const argument = tokens[next];
      if (argument.startsWith("-")) {
        if (tokens[next + 1] && !tokens[next + 1].startsWith("-")) args.push(tokens[++next]);
        continue;
      }
      args.push(argument);
    }
    if (verb === "sed") targets.push(args.at(-1) ?? "");
    else if (["cp", "copy", "mv", "move", "tee", "copy-item", "move-item"].includes(verb)) targets.push(args.at(-1) ?? "");
    else targets.push(...args);
  }
  return targets.filter(Boolean);
}

function toolArgs(event: Event): Event | undefined {
  const args = record(event.input) ?? record(event.args);
  if (args) return args;
  return typeof event.command === "string" ? event : undefined;
}

function toolName(event: Event): string {
  return String(event.toolName ?? event.tool_name ?? event.tool ?? "");
}

function toolTarget(event: Event, args: Event | undefined): string | undefined {
  const pathValue = args?.path ?? args?.file_path ?? args?.filePath;
  if (typeof pathValue === "string" && pathValue) return pathValue;
  if (typeof args?.command === "string") return args.command.slice(0, 120);
  return typeof event.command === "string" ? event.command.slice(0, 120) : undefined;
}
function guardDenialReason(event: Event): string | undefined {
  const find = (value: unknown, depth: number): string | undefined => {
    if (depth > 4) return undefined;
    if (typeof value === "string" && value.trim().startsWith("CONTRACT:")) return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = find(item, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const item = record(value);
    if (!item) return undefined;
    for (const child of Object.values(item)) {
      const found = find(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return find(event.result, 0) ?? find(event.text, 0) ?? find(event.content, 0);
}


function guardTamperRecord(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (Array.isArray(value)) return value.some(item => guardTamperRecord(item, depth + 1));
  const item = record(value);
  if (!item) return false;
  if (item.class === "guard_tamper") return true;
  return Object.values(item).some(child => guardTamperRecord(child, depth + 1));
}

function guardTamperEvent(event: Event): boolean {
  if (!["tool_denied", "tool_hook_blocked", "tool_call_blocked"].includes(String(event.type))) return false;
  return guardTamperRecord(event);
}

function guardLogEntries(logPath: string): { lines: number; tamper: boolean } {
  if (!existsSync(logPath)) return { lines: 0, tamper: false };
  try {
    const entries = readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
    return {
      lines: entries.length,
      tamper: entries.some(line => {
        try { return guardTamperRecord(JSON.parse(line), 0); } catch { return false; }
      }),
    };
  } catch {
    return { lines: 0, tamper: false };
  }
}


function claudeNativeEvents(event: Event): Event[] {
  const derived: Event[] = [];
  const message = record(event.message);
  const content = message?.content;
  if ((event.type === "assistant" || event.type === "user") && Array.isArray(content)) {
    for (const block of content.map(record).filter((item): item is Event => Boolean(item))) {
      if (event.type === "assistant" && block.type === "tool_use") {
        derived.push({ type: "tool_execution_start", toolCallId: block.id, toolName: block.name, input: block.input });
      } else if (event.type === "user" && block.type === "tool_result") {
        derived.push({
          type: "tool_execution_end",
          toolCallId: block.tool_use_id,
          result: { content: block.content, is_error: block.is_error },
          isError: block.is_error === true,
        });
      }
    }
  }
  if (event.type === "system" && event.subtype === "permission_denied") {
    derived.push({
      type: "tool_denied",
      toolCallId: event.tool_use_id ?? event.tool_call_id ?? event.id,
      toolName: event.tool_name ?? event.toolName,
      result: { reason: event.reason ?? event.message },
    });
  }
  if (event.type === "result" && Array.isArray(event.permission_denials)) {
    for (const denial of event.permission_denials.map(record).filter((item): item is Event => Boolean(item))) {
      derived.push({
        type: "tool_denied",
        toolCallId: denial.tool_use_id ?? denial.tool_call_id ?? denial.id,
        toolName: denial.tool_name ?? denial.toolName,
        result: { reason: denial.reason ?? denial.message },
      });
    }
  }
  return derived;
}

/** One attempt's observed progress. Time is injected for deterministic failure probes. */
export class RuntimeSupervision {
  readonly inflight = new Set<string>();
  readonly commands = new Map<string, string>();
  readonly failures = new Map<string, number>();
  private readonly toolNames = new Map<string, string>();
  private readonly toolTargets = new Map<string, string>();
  private readonly hookBlocks = new Map<string, string>();
  private readonly hookCalls = new Set<string>();
  private readonly guardCompletedCalls = new Set<string>();
  private readonly countedDenials = new Set<string>();
  private readonly protectedChecks = new Set<string>();
  guardArmed?: boolean;
  turns = 0;
  denials = 0;
  readyAt?: number;
  sessionId?: string;
  terminal = false;
  failure?: string;
  terminalFailure?: string;
  private thinkingStartedAt?: number;
  private thinkingSampleLength = 0;
  private thinkingWindowCount = 0;
  private thinkingWindowCursor = 0;
  private readonly thinkingWindowHashes: number[] = [];
  private readonly thinkingWindowCounts = new Map<number, number>();
  private thinkingMostFrequentWindows = 0;
  private thinkingNonLive = false;

  private resetThinking(): void {
    this.thinkingStartedAt = undefined;
    this.thinkingSampleLength = 0;
    this.thinkingWindowCount = 0;
    this.thinkingWindowCursor = 0;
    this.thinkingWindowHashes.length = 0;
    this.thinkingWindowCounts.clear();
    this.thinkingMostFrequentWindows = 0;
    this.thinkingNonLive = false;
  }

  private recordThinkingText(text: string): void {
    this.thinkingSampleLength = Math.min(THINKING_SAMPLE_LIMIT, this.thinkingSampleLength + text.length);
    const firstWindow = Math.max(0, text.length - THINKING_WINDOW_LIMIT - THINKING_WINDOW_SIZE + 1);
    for (let start = firstWindow; start + THINKING_WINDOW_SIZE <= text.length; start++) {
      const hash = thinkingWindowHash(text, start);
      if (this.thinkingWindowCount === THINKING_WINDOW_LIMIT) {
        const evicted = this.thinkingWindowHashes[this.thinkingWindowCursor];
        const evictedCount = this.thinkingWindowCounts.get(evicted) ?? 0;
        if (evictedCount <= 1) this.thinkingWindowCounts.delete(evicted);
        else this.thinkingWindowCounts.set(evicted, evictedCount - 1);
        this.thinkingWindowHashes[this.thinkingWindowCursor] = hash;
        this.thinkingWindowCursor = (this.thinkingWindowCursor + 1) % THINKING_WINDOW_LIMIT;
        if (evictedCount === this.thinkingMostFrequentWindows) {
          this.thinkingMostFrequentWindows = 0;
          for (const count of this.thinkingWindowCounts.values()) {
            this.thinkingMostFrequentWindows = Math.max(this.thinkingMostFrequentWindows, count);
          }
        }
      } else {
        this.thinkingWindowHashes.push(hash);
        this.thinkingWindowCount++;
      }
      const count = (this.thinkingWindowCounts.get(hash) ?? 0) + 1;
      this.thinkingWindowCounts.set(hash, count);
      this.thinkingMostFrequentWindows = Math.max(this.thinkingMostFrequentWindows, count);
    }
  }

  private observeThinking(event: Event, now: number): boolean {
    if (thinkingEventType(event) === undefined) return false;
    this.thinkingStartedAt ??= now;
    this.readyAt ??= now;
    const text = thinkingText(event);
    if (text) this.recordThinkingText(text);
    if (!this.thinkingNonLive && this.thinkingSampleLength >= THINKING_MIN_SAMPLE_LENGTH &&
      this.thinkingWindowCount > 0 &&
      this.thinkingMostFrequentWindows * 100 > this.thinkingWindowCount * 30) {
      this.thinkingNonLive = true;
    }
    if (!this.thinkingNonLive) this.lastProgressAt = now;
    return true;
  }

  private markProgress(now: number): void {
    this.resetThinking();
    this.lastProgressAt = now;
  }

  stopCode?: RuntimeStopCode;
  lastProgressAt: number;
  private observedRoute: RuntimeRoute = {};

  constructor(
    readonly limits: RuntimeLimits,
    readonly startedAt: number,
    readonly expectedRoute?: RuntimeRoute,
    readonly workingDirectory?: string,
    readonly permissionMode?: "guard" | "yolo" | "prompt",
    readonly guardLogPath?: string,
    readonly onDeadline?: { grace_turns: number; grace_timeout_ms: number },
  ) {
    this.lastProgressAt = startedAt;
  }

  private deadlineReason(now: number): string | undefined {
    if (!this.onDeadline) return undefined;
    if (this.limits.timeout_ms !== undefined) {
      const remaining = Math.max(0, this.limits.timeout_ms - (now - this.startedAt));
      if (now - this.startedAt >= Math.max(0, this.limits.timeout_ms - this.onDeadline.grace_timeout_ms)) {
        return this.stop(`Runtime deadline reached; ${remaining}ms remaining for grace`, "deadline");
      }
    }
    if (this.limits.max_turns !== undefined) {
      const remaining = Math.max(0, this.limits.max_turns - this.turns);
      if (this.turns >= Math.max(0, this.limits.max_turns - this.onDeadline.grace_turns)) {
        return this.stop(`Runtime deadline reached; ${remaining} turns remaining for grace`, "deadline");
      }
    }
    return undefined;
  }

  settle(): string | undefined {
    if (!this.failure && ((this.expectedRoute?.provider !== undefined && this.observedRoute.provider === undefined) ||
        (this.expectedRoute?.model !== undefined && this.observedRoute.model === undefined))) {
      return this.stop("Runtime did not attest the configured route", "route_unverified");
    }
    return this.failure;
  }

  private countDenial(id: string, reason: string | undefined, now: number): void {
    if (id && this.countedDenials.has(id)) return;
    if (id) this.countedDenials.add(id);
    this.denials++;
    if (id && reason) this.hookBlocks.set(id, reason);
    this.markProgress(now);
    if (this.limits.max_denials && this.denials >= this.limits.max_denials) {
      const name = id ? this.toolNames.get(id) : undefined;
      const target = id ? this.toolTargets.get(id) : undefined;
      const block = id ? this.hookBlocks.get(id) : undefined;
      const details = [name, target].filter(Boolean).join(" ");
      const suffix = block ? `${details ? `${details}: ` : ""}${block}` : details;
      this.stop(`${this.denials} hook-denied calls; last: ${suffix || "unknown action"}`, "denial_budget");
    }
  }

  private verifyGuardInvocation(id: string): void {
    if (this.permissionMode !== "guard" || !id || this.guardCompletedCalls.has(id)) return;
    this.guardCompletedCalls.add(id);
    const evidence = this.guardLogPath ? guardLogEntries(this.guardLogPath) : { lines: 0, tamper: false };
    if (evidence.tamper) {
      this.stop("Guard tamper attempted", "policy");
      return;
    }
    if (evidence.lines < this.guardCompletedCalls.size) {
      this.guardArmed = false;
      const reason = this.hookCalls.has(id) ? "Guard hook ran but could not log" : "Guard hook did not run";
      this.stop(`${reason}; refusing to continue with permissions enabled`, "policy");
    } else {
      this.guardArmed = true;
    }
  }
  private stop(reason: string, code: RuntimeStopCode): string {
    if (!this.failure || code === "policy" || code === "route_mismatch") {
      this.failure = reason;
      this.stopCode = code;
    }
    return this.failure;
  }

  /**
   * Map a native terminal stop onto a UH stop code before generic failure
   * classification: budget caps settle as their own stop code (so salvage
   * sees them), every other native failure settles as `runtime_error` with
   * the native reason copied into the stop reason, never empty.
   */
  private stopFromNativeTerminal(event: Event): void {
    if (this.failure) return;
    const reason = nativeTerminalStopReason(event);
    const budgetCode = reason ? NATIVE_BUDGET_STOP_REASONS[reason] : undefined;
    if (budgetCode) {
      if (budgetCode === "turn_limit") {
        const nativeTurns = event.num_turns ?? record(event.result)?.num_turns;
        const count = typeof nativeTurns === "number" && Number.isInteger(nativeTurns) && nativeTurns > 0
          ? nativeTurns
          : this.turns > 0 ? this.turns : undefined;
        this.stop(`Native turn cap (${reason}) reached${count === undefined ? "" : ` after ${count} turns`}`, "turn_limit");
      } else {
        this.stop(`Native time cap (${reason}) reached`, budgetCode);
      }
      return;
    }
    const failure = runtimeTerminalFailure(event);
    if (failure) this.stop(failure, "runtime_error");
  }

  get stopReason(): RuntimeStopCode | undefined {
    return this.stopCode;
  }

  observe(value: unknown, now: number): string | undefined {
    const event = nativeRuntimeEvent(value);
    if (!event) return undefined;
    if (guardTamperEvent(event)) return this.stop("Guard tamper attempted", "policy");
    const type = event.type;
    const route = nativeRuntimeRoute(event);
    if (runtimeRouteMismatch(route, this.expectedRoute)) return this.stop("Runtime reported a route outside the configured assignment", "route_mismatch");
    const delegated = delegatedRouteMismatch(event, this.expectedRoute);
    if (delegated) return this.stop(`Delegated agent ran on a route outside the configured assignment: ${delegated}`, "route_mismatch");
    if (route?.provider) this.observedRoute.provider = route.provider;
    if (route?.model) this.observedRoute.model = route.model;
    const session = event.sessionId ?? event.session_id ?? (type === "session" ? event.id : undefined);
    if (typeof session === "string" && session) this.sessionId = session;
    const id = String(event.toolCallId ?? event.tool_call_id ?? event.id ?? "");
    for (const derived of claudeNativeEvents(event)) {
      const derivedFailure = this.observe(derived, now);
      if (derivedFailure) return derivedFailure;
    }
    const nativeTurns = event.num_turns ?? record(event.result)?.num_turns;
    if (typeof nativeTurns === "number" && Number.isInteger(nativeTurns) && nativeTurns >= 0) {
      this.turns = Math.max(this.turns, nativeTurns);
      if (this.limits.max_turns && this.turns > this.limits.max_turns) this.stop("Turn limit exceeded", "turn_limit");
    }
    if (this.failure) {
      if (type === "run_end" || type === "result" || type === "agent_end") {
        this.terminal = true;
        this.terminalFailure ??= runtimeTerminalFailure(event);
        this.markProgress(now);
      }
      return this.failure;
    }
    if (this.observeThinking(event, now)) return this.failure;
    if (type === "tool_queued" || type === "tool_execution_start" || type === "tool_running") {
      if (id) this.inflight.add(id);
      const args = toolArgs(event);
      const name = toolName(event);
      const target = toolTarget(event, args);
      if (id && name) this.toolNames.set(id, name);
      if (id && target) this.toolTargets.set(id, target);
      if (id && args && typeof args.command === "string") this.commands.set(id, args.command);
      const firstProtectedCheck = !id || !this.protectedChecks.has(id);
      if (firstProtectedCheck) {
        if (id) this.protectedChecks.add(id);
        if (name && WRITE_TOOLS.has(name.toLowerCase())) {
          const pathValue = args?.path ?? args?.file_path ?? args?.filePath;
          if (typeof pathValue === "string" && pathUnderProtectedRoot(pathValue, this.limits.protected_paths ?? DEFAULT_PROTECTED_PATHS, this.workingDirectory)) {
            this.stop(`Protected path write attempted: ${pathValue}`, "policy");
          }
        } else if (name && SHELL_TOOLS.has(name.toLowerCase()) && typeof args?.command === "string") {
          const protectedPath = shellMutationTargets(args.command).find(target =>
            pathUnderProtectedRoot(target, this.limits.protected_paths ?? DEFAULT_PROTECTED_PATHS, this.workingDirectory));
          if (protectedPath) this.stop(`Protected path write attempted: ${protectedPath}`, "policy");
        }
      }
      this.readyAt ??= now;
      this.markProgress(now);
    } else if (type === "tool_hooks") {
      const outcome = record(event.outcome);
      if (event.phase === "pre" && id) this.hookCalls.add(id);
      if (event.phase === "pre" && outcome?.kind === "block" && typeof outcome.text === "string" && id) {
        this.hookBlocks.set(id, outcome.text);
      }
    } else if (type === "tool_completed" || type === "tool_execution_end") {
      this.inflight.delete(id);
      const command = this.commands.get(id);
      this.commands.delete(id);
      const result = record(event.result);
      const failed = event.isError === true || result?.isError === true || result?.is_error === true ||
        (typeof result?.exitCode === "number" && result.exitCode !== 0) ||
        (typeof result?.exit_code === "number" && result.exit_code !== 0);
      this.verifyGuardInvocation(id);
      const denial = guardDenialReason(event);
      if (denial) this.countDenial(id, denial, now);
      if (command && failed && !denial) {
        const count = (this.failures.get(command) ?? 0) + 1;
        this.failures.set(command, count);
        if (this.limits.max_repeated_failures && count >= this.limits.max_repeated_failures) {
          this.stop(`The same command failed ${count} times: ${command.slice(0, 120)}`, "repeated_failure");
        }
      }
      this.markProgress(now);
    } else if (type === "tool_hook_blocked" || type === "tool_call_blocked" || type === "tool_denied") {
      this.inflight.delete(id);
      this.commands.delete(id);
      this.verifyGuardInvocation(id);
      this.countDenial(id, id ? this.hookBlocks.get(id) : undefined, now);
    } else if (type === "turn_start") {
      this.markProgress(now);
      const deadline = this.deadlineReason(now);
      if (deadline) return deadline;
      if (this.limits.max_turns && this.turns >= this.limits.max_turns) this.stop("Turn limit reached", "turn_limit");
    } else if (type === "turn_end") {
      this.turns++;
      this.markProgress(now);
      if (this.limits.max_turns && this.turns > this.limits.max_turns) this.stop("Turn limit exceeded", "turn_limit");
    } else if (type === "assistant" || (type === "system" && event.subtype === "init")) {
      this.readyAt ??= now;
      this.markProgress(now);
    } else if (type === "model_request_start" || type === "model_request_end" ||
      ((type === "message_start" || type === "message_end") && record(event.message)?.role === "assistant")) {
      this.readyAt ??= now;
      this.markProgress(now);
    } else if (type === "message_end") {
      this.markProgress(now);
    }
    if (type === "run_end" || type === "result" || type === "agent_end") {
      this.terminal = true;
      this.stopFromNativeTerminal(event);
      this.terminalFailure ??= runtimeTerminalFailure(event);
      this.markProgress(now);
    }
    // Text deltas are not progress: malformed repetitive output must not defeat a stall budget.
    return this.failure;
  }

  check(now: number): string | undefined {
    if (this.failure) return this.failure;
    const deadline = this.deadlineReason(now);
    if (deadline) return deadline;
    if (this.limits.timeout_ms && now - this.startedAt >= this.limits.timeout_ms) return this.stop("Runtime wall-time limit reached", "timeout");
    if (!this.terminal && this.readyAt === undefined && this.limits.startup_timeout_ms && now - this.startedAt >= this.limits.startup_timeout_ms) return this.stop("Runtime readiness deadline exceeded", "startup");
    if (!this.terminal && (this.readyAt !== undefined || !this.limits.startup_timeout_ms) && this.inflight.size === 0) {
      const thinkingLimit = maxThinkingMs(this.limits);
      if (this.thinkingStartedAt !== undefined && thinkingLimit !== undefined &&
        now - this.thinkingStartedAt >= thinkingLimit) {
        return this.stop("Reasoning exceeded max_thinking_ms without a tool call or message", "stall");
      }
      if (this.limits.stall_timeout_ms && now - this.lastProgressAt >= this.limits.stall_timeout_ms) {
        return this.stop("Runtime stalled without an in-flight tool", "stall");
      }
    }
    return undefined;
  }
}
