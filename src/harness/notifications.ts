import { spawn, type ChildProcess } from "node:child_process";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  NotificationsSchema,
  NOTIFICATION_PRESETS,
  type NotificationFilter,
  type NotificationPreset,
  type NotificationPresetSink,
  type NotificationSink,
} from "../schema/project.js";
import { projectYaml } from "./paths.js";

/**
 * UH settlement notifications.
 *
 * A settled run, team, or supervision stop is announced through whichever
 * channels the operator configured. There is NO default sink: with no
 * configuration nothing is sent. Delivery is asynchronous and best effort — it
 * never delays or fails a settlement, every sink gets a 15 s timeout, each
 * `(event, run id, sink)` is attempted at most once, and every attempt is
 * appended to `.harness/notifications/deliveries.ndjson`.
 *
 * Two sink kinds exist in code: `command` (argv spawned directly, never through
 * a shell) and `webhook`. Named presets are DATA that expand to one of those
 * two. UH never reads or stores platform credentials; hermes and apprise keep
 * their own.
 */

/** Hard cap on a single sink's delivery attempt. */
export const NOTIFICATION_TIMEOUT_MS = 15_000;
/** Append-only delivery ledger, under `.harness/notifications/`. */
export const NOTIFICATION_DELIVERIES_FILE = "deliveries.ndjson";
/** Default environment variable that carries the event JSON to a command sink. */
export const DEFAULT_EVENT_ENV = "UH_NOTIFICATION_EVENT";
/** The events UH emits at its settlement points. */
export const NOTIFICATION_EVENTS = ["run.settled", "team.settled", "run.orphaned", "alert"] as const;
export type NotificationEventName = (typeof NOTIFICATION_EVENTS)[number];
/** Stop codes that raise a generic supervision `alert` in addition to the settlement. */
export const SUPERVISION_STOP_CODES = ["policy", "stall", "repeated_failure", "denial_budget", "controller_lost"] as const;
export type SupervisionStopCode = (typeof SUPERVISION_STOP_CODES)[number];

/** One notification event, and the JSON a webhook or `{event}` placeholder receives. */
export interface NotificationEvent {
  event: string;
  at: string;
  subject: string;
  summary: string;
  run_id?: string;
  mission?: string;
  runtime?: string;
  model?: string;
  status?: string;
  stop_code?: string;
  duration_ms?: number;
  files_written?: number;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Resolved sinks                                                             */
/* -------------------------------------------------------------------------- */

export interface ResolvedCommandSink {
  id: string;
  kind: "command";
  transport: "command";
  argv: string[];
  envVar: string;
  events: string[];
  filter?: NotificationFilter;
}

export interface ResolvedWebhookHeader {
  name: string;
  /** When set, the header value is read from this environment variable at delivery time. */
  env?: string;
  /** When set, the header value is rendered from `{subject}` / `{event}` templates. */
  value?: string;
}

export interface ResolvedWebhookSink {
  id: string;
  kind: "webhook";
  transport: "webhook";
  url: string;
  method: string;
  headers: ResolvedWebhookHeader[];
  body: "json" | "text";
  events: string[];
  filter?: NotificationFilter;
}

export type ResolvedSink = ResolvedCommandSink | ResolvedWebhookSink;

/* -------------------------------------------------------------------------- */
/* User data directory                                                        */
/* -------------------------------------------------------------------------- */

/**
 * UH's per-user data directory, mirroring where the Windows guardian cache
 * lives (`<local app data>/ultimate-harness`). `UH_USER_DATA_DIR` overrides it;
 * under vitest the base is a temp dir so a developer's real user file is never
 * read.
 */
export function userDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UH_USER_DATA_DIR) return path.resolve(env.UH_USER_DATA_DIR);
  const base = env.VITEST
    ? os.tmpdir()
    : (env.LOCALAPPDATA ?? env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"));
  return path.join(base, "ultimate-harness");
}

/** The optional user-level notifications file (`<user data>/notifications.yaml`). */
export function userNotificationsFile(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UH_NOTIFICATIONS_FILE) return path.resolve(env.UH_NOTIFICATIONS_FILE);
  return path.join(userDataDir(env), "notifications.yaml");
}

/* -------------------------------------------------------------------------- */
/* Preset expansion                                                           */
/* -------------------------------------------------------------------------- */

const EVENT_PLACEHOLDER = "{event}";
const SUBJECT_PLACEHOLDER = "{subject}";

/** PowerShell that raises a toast through built-in Windows APIs only, reading the message from stdin. */
export const WINDOWS_TOAST_SCRIPT: string = [
  "$ErrorActionPreference='Stop'",
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null",
  "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null",
  "$message = [Console]::In.ReadToEnd()",
  "if ([string]::IsNullOrWhiteSpace($message)) { $message = 'Ultimate Harness notification' }",
  "$escaped = [System.Security.SecurityElement]::Escape($message)",
  "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
  "$xml.LoadXml(\"<toast><visual><binding template='ToastGeneric'><text>Ultimate Harness</text><text>$escaped</text></binding></visual></toast>\")",
  "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Ultimate Harness').Show($toast)",
].join("\n");

function eventsOf(sink: NotificationSink): string[] {
  return sink.events && sink.events.length > 0 ? [...sink.events] : ["*"];
}

function normalizeUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}

/**
 * Expand a preset sink into a concrete command or webhook sink. Presets are a
 * small data table, not code paths: hermes/apprise are command sinks, ntfy is a
 * webhook, windows-toast is a PowerShell command.
 */
export function expandPreset(sink: NotificationPresetSink): ResolvedSink {
  const events = eventsOf(sink);
  const common = { id: sink.id, events, ...(sink.filter !== undefined ? { filter: sink.filter } : {}) };
  switch (sink.preset) {
    case "hermes": {
      if (!sink.to) throw new Error(`notification sink "${sink.id}": preset hermes requires "to"`);
      return {
        ...common,
        kind: "command",
        transport: "command",
        argv: ["hermes", "send", "--to", sink.to, "--subject", SUBJECT_PLACEHOLDER, "--quiet", "--file", "-"],
        envVar: DEFAULT_EVENT_ENV,
      };
    }
    case "apprise": {
      // `apprise -t TITLE -b - <urls>...` reads the body from stdin. Not verified
      // locally (apprise was not installed); this follows its documented CLI.
      if (!sink.urls || sink.urls.length === 0) throw new Error(`notification sink "${sink.id}": preset apprise requires "urls"`);
      return {
        ...common,
        kind: "command",
        transport: "command",
        argv: ["apprise", "-t", SUBJECT_PLACEHOLDER, "-b", "-", ...sink.urls],
        envVar: DEFAULT_EVENT_ENV,
      };
    }
    case "ntfy": {
      if (!sink.server || !sink.topic) throw new Error(`notification sink "${sink.id}": preset ntfy requires "server" and "topic"`);
      return {
        ...common,
        kind: "webhook",
        transport: "webhook",
        url: normalizeUrl(sink.server, sink.topic),
        method: "POST",
        headers: [{ name: "Title", value: SUBJECT_PLACEHOLDER }],
        body: "text",
      };
    }
    case "windows-toast": {
      return {
        ...common,
        kind: "command",
        transport: "command",
        argv: ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WINDOWS_TOAST_SCRIPT],
        envVar: DEFAULT_EVENT_ENV,
      };
    }
  }
}

/** Normalize a configured sink (kind or preset) into a resolved, deliverable sink. */
export function resolveSink(sink: NotificationSink): ResolvedSink {
  if ("kind" in sink) {
    const events = eventsOf(sink);
    const common = { id: sink.id, events, ...(sink.filter !== undefined ? { filter: sink.filter } : {}) };
    if (sink.kind === "command") {
      return {
        ...common,
        kind: "command",
        transport: "command",
        argv: [...sink.argv],
        envVar: sink.env ?? DEFAULT_EVENT_ENV,
      };
    }
    return {
      ...common,
      kind: "webhook",
      transport: "webhook",
      url: sink.url,
      method: sink.method ?? "POST",
      headers: Object.entries(sink.headers ?? {}).map(([name, env]) => ({ name, env })),
      body: sink.body ?? "json",
    };
  }
  return expandPreset(sink as NotificationPresetSink);
}

/* -------------------------------------------------------------------------- */
/* Config loading + precedence                                                */
/* -------------------------------------------------------------------------- */

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readSinksFile(file: string): Promise<NotificationSink[]> {
  if (!(await fileExists(file))) return [];
  return NotificationsSchema.parse(parseYaml(await readFile(file, "utf8"))).sinks;
}

/**
 * Every configured sink, user entries first and project entries overriding user
 * entries with the same id. A missing project or user file contributes nothing,
 * and there is no built-in default sink.
 */
export async function loadNotificationConfig(root: string, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedSink[]> {
  const merged = new Map<string, NotificationSink>();
  for (const sink of await readSinksFile(userNotificationsFile(env))) merged.set(sink.id, sink);
  const projectFile = projectYaml(root);
  if (await fileExists(projectFile)) {
    const doc = parseYaml(await readFile(projectFile, "utf8")) as Record<string, unknown> | null;
    const notifications = doc && typeof doc === "object" ? (doc as Record<string, unknown>).notifications : undefined;
    if (notifications !== undefined) {
      for (const sink of NotificationsSchema.parse(notifications).sinks) merged.set(sink.id, sink);
    }
  }
  return [...merged.values()].map(resolveSink);
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** Match a mission/event value against a glob; `*` matches everything. */
export function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  return globToRegExp(pattern).test(value);
}

function matchesAny(patterns: readonly string[], value: string): boolean {
  return patterns.some((pattern) => matchesGlob(pattern, value));
}

/** Whether a sink subscribes to an event under its `events` list and its filter. */
export function sinkMatches(sink: ResolvedSink, event: NotificationEvent): boolean {
  if (!matchesAny(sink.events, event.event)) return false;
  const filter = sink.filter;
  if (filter?.statuses && filter.statuses.length > 0) {
    if (event.status === undefined || !filter.statuses.includes(event.status)) return false;
  }
  if (filter?.missions && filter.missions.length > 0) {
    if (event.mission === undefined || !matchesAny(filter.missions, event.mission)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Event builders                                                             */
/* -------------------------------------------------------------------------- */

export interface RunSettlementInput {
  run_id: string;
  mission: string;
  runtime: string;
  model?: string;
  status: string;
  stop_code?: string;
  duration_ms?: number;
  files_written?: number;
  /** A run directory whose `run-digest.json` supplies the files-written count when not given directly. */
  run_dir?: string;
  summary?: string;
  at?: string;
}

/** Whether a stop code is one of the supervision stops that raise an `alert`. */
export function isSupervisionStopCode(code: string | undefined): code is SupervisionStopCode {
  return code !== undefined && (SUPERVISION_STOP_CODES as readonly string[]).includes(code);
}

/** Elapsed milliseconds between two ISO timestamps, when both parse. */
export function elapsedMs(start: string | undefined, end: string | undefined): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return Math.max(0, to - from);
}

function defaultRunSummary(input: RunSettlementInput, orphaned: boolean): string {
  const outcome = orphaned ? "orphaned" : input.status;
  const code = input.stop_code !== undefined ? ` (${input.stop_code})` : "";
  return `run ${input.run_id} of ${input.mission} ${outcome}${code}`;
}

/**
 * The events a run settlement raises: `run.settled` (or `run.orphaned`), and an
 * additional generic `alert` when the stop code is a supervision stop.
 */
export function buildSettlementEvents(input: RunSettlementInput, options: { orphaned?: boolean } = {}): NotificationEvent[] {
  const orphaned = options.orphaned === true;
  const eventName: NotificationEventName = orphaned ? "run.orphaned" : "run.settled";
  const summary = input.summary ?? defaultRunSummary(input, orphaned);
  const primary: NotificationEvent = {
    event: eventName,
    at: input.at ?? new Date().toISOString(),
    subject: `UH ${eventName}: ${input.mission} ${orphaned ? "orphaned" : input.status}`,
    summary,
    run_id: input.run_id,
    mission: input.mission,
    runtime: input.runtime,
    status: input.status,
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.stop_code !== undefined ? { stop_code: input.stop_code } : {}),
    ...(input.duration_ms !== undefined ? { duration_ms: input.duration_ms } : {}),
    ...(input.files_written !== undefined ? { files_written: input.files_written } : {}),
  };
  if (!isSupervisionStopCode(input.stop_code)) return [primary];
  return [
    primary,
    {
      ...primary,
      event: "alert",
      subject: `UH alert: ${input.mission} ${input.stop_code}`,
      summary: `supervision alert (${input.stop_code}) on run ${input.run_id} of ${input.mission}: ${summary}`,
    },
  ];
}

export interface TeamSettlementInput {
  run_id: string;
  mission: string;
  status: string;
  duration_ms?: number;
  files_written?: number;
  summary?: string;
  at?: string;
}

/** The `team.settled` event for a finished team run. */
export function buildTeamSettledEvent(input: TeamSettlementInput): NotificationEvent {
  return {
    event: "team.settled",
    at: input.at ?? new Date().toISOString(),
    subject: `UH team.settled: ${input.mission} ${input.status}`,
    summary: input.summary ?? `team ${input.mission} ${input.status} (run ${input.run_id})`,
    run_id: input.run_id,
    mission: input.mission,
    status: input.status,
    ...(input.duration_ms !== undefined ? { duration_ms: input.duration_ms } : {}),
    ...(input.files_written !== undefined ? { files_written: input.files_written } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                   */
/* -------------------------------------------------------------------------- */

export type DeliveryOutcome = "ok" | "error" | "timeout";

export interface DeliveryAttempt {
  at: string;
  event: string;
  run_id?: string;
  sink: string;
  transport: "command" | "webhook";
  outcome: DeliveryOutcome;
  exit_code?: number;
  status?: number;
  detail?: string;
}

export interface DeliveryDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyTemplate(template: string, event: NotificationEvent): string {
  return template
    .split(SUBJECT_PLACEHOLDER).join(event.subject)
    .split(EVENT_PLACEHOLDER).join(JSON.stringify(event));
}

/** The text written to a command's stdin, or a webhook's text body. */
export function messageText(event: NotificationEvent): string {
  return `${event.summary}\n`;
}

interface CommandResult {
  code: number | null;
  timedOut: boolean;
  stderr: string;
  error?: string;
}

function runCommand(argv: string[], input: string, env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(argv[0], argv.slice(1), {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "ignore", "pipe"],
        env,
      });
    } catch (error) {
      resolve({ code: null, timedOut: false, stderr: "", error: describeError(error) });
      return;
    }
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* the child is already gone */ }
      finish({ code: null, timedOut: true, stderr });
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => finish({ code: null, timedOut: false, stderr, error: describeError(error) }));
    child.on("close", (code) => finish({ code, timedOut: false, stderr }));
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(input);
  });
}

async function deliverCommand(
  sink: ResolvedCommandSink,
  event: NotificationEvent,
  deps: DeliveryDeps,
  timeoutMs: number,
): Promise<Omit<DeliveryAttempt, "at" | "event" | "run_id" | "sink" | "transport">> {
  const argv = sink.argv.map((item) => applyTemplate(item, event));
  const env = { ...(deps.env ?? process.env), [sink.envVar]: JSON.stringify(event) };
  const result = await runCommand(argv, messageText(event), env, timeoutMs);
  if (result.error !== undefined) return { outcome: "error", detail: `spawn failed: ${result.error}` };
  if (result.timedOut) return { outcome: "timeout", detail: `timed out after ${timeoutMs} ms` };
  if (result.code === 0) return { outcome: "ok" };
  return {
    outcome: "error",
    ...(result.code !== null ? { exit_code: result.code } : {}),
    detail: result.stderr.trim() || `exit code ${result.code}`,
  };
}

async function deliverWebhook(
  sink: ResolvedWebhookSink,
  event: NotificationEvent,
  deps: DeliveryDeps,
  timeoutMs: number,
): Promise<Omit<DeliveryAttempt, "at" | "event" | "run_id" | "sink" | "transport">> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const env = deps.env ?? process.env;
  const headers: Record<string, string> = {};
  for (const header of sink.headers) {
    headers[header.name] = header.env !== undefined
      ? env[header.env] ?? ""
      : applyTemplate(header.value ?? "", event);
  }
  const body = sink.body === "text" ? messageText(event) : JSON.stringify(event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(applyTemplate(sink.url, event), {
      method: sink.method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok
      ? { outcome: "ok", status: response.status }
      : { outcome: "error", status: response.status, detail: `HTTP ${response.status}` };
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) return { outcome: "timeout", detail: `timed out after ${timeoutMs} ms` };
    return { outcome: "error", detail: describeError(error) };
  }
}

/** Deliver one event to one sink; never throws, always returns an attempt record. */
export async function deliverToSink(sink: ResolvedSink, event: NotificationEvent, deps: DeliveryDeps = {}): Promise<DeliveryAttempt> {
  const timeoutMs = deps.timeoutMs ?? NOTIFICATION_TIMEOUT_MS;
  const base = {
    at: new Date(deps.now?.() ?? Date.now()).toISOString(),
    event: event.event,
    ...(event.run_id !== undefined ? { run_id: event.run_id } : {}),
    sink: sink.id,
    transport: sink.transport,
  } as const;
  try {
    const result = sink.transport === "command"
      ? await deliverCommand(sink, event, deps, timeoutMs)
      : await deliverWebhook(sink, event, deps, timeoutMs);
    return { ...base, ...result };
  } catch (error) {
    return { ...base, outcome: "error", detail: describeError(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Ledger + dispatch                                                          */
/* -------------------------------------------------------------------------- */

export function notificationsDir(root: string): string {
  return path.join(root, ".harness", "notifications");
}

export function deliveriesPath(root: string): string {
  return path.join(notificationsDir(root), NOTIFICATION_DELIVERIES_FILE);
}

function deliveryKey(event: string, runId: string | undefined, sink: string): string {
  return `${event}\u0000${runId ?? ""}\u0000${sink}`;
}

async function readDeliveredKeys(file: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return keys;
  }
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const record = JSON.parse(line) as { event?: unknown; run_id?: unknown; sink?: unknown };
      if (typeof record.event === "string" && typeof record.sink === "string") {
        keys.add(deliveryKey(record.event, typeof record.run_id === "string" ? record.run_id : undefined, record.sink));
      }
    } catch {
      // A truncated tail line is ignored; the ledger is best effort.
    }
  }
  return keys;
}

async function appendDelivery(root: string, attempt: DeliveryAttempt): Promise<void> {
  await mkdir(notificationsDir(root), { recursive: true });
  await appendFile(deliveriesPath(root), `${JSON.stringify(attempt)}\n`, "utf8");
}

export interface DispatchOptions {
  deps?: DeliveryDeps;
  /** Deliver only to this sink id. */
  only?: string;
  /** Pre-loaded sinks; bypasses config loading (used by tests and `uh notify test`). */
  sinks?: ResolvedSink[];
  /** Ignore the at-most-once ledger and the sink filters (used by `uh notify test`). */
  ignoreDedupe?: boolean;
}

/**
 * Deliver one event to every matching sink. Best effort: a failure to load the
 * config or to deliver never throws, and each `(event, run id, sink)` is
 * attempted at most once unless `ignoreDedupe` is set.
 */
export async function dispatchEvent(root: string, event: NotificationEvent, options: DispatchOptions = {}): Promise<DeliveryAttempt[]> {
  const deps = options.deps ?? {};
  let sinks: ResolvedSink[];
  if (options.sinks !== undefined) {
    sinks = options.sinks;
  } else {
    try {
      sinks = await loadNotificationConfig(root, deps.env);
    } catch {
      return [];
    }
  }
  const matched = sinks.filter((sink) =>
    (options.only === undefined || sink.id === options.only)
    && (options.ignoreDedupe === true || sinkMatches(sink, event)));
  if (matched.length === 0) return [];
  const delivered = options.ignoreDedupe === true ? new Set<string>() : await readDeliveredKeys(deliveriesPath(root));
  const attempts: DeliveryAttempt[] = [];
  for (const sink of matched) {
    const key = deliveryKey(event.event, event.run_id, sink.id);
    if (options.ignoreDedupe !== true && delivered.has(key)) continue;
    delivered.add(key);
    const attempt = await deliverToSink(sink, event, deps);
    attempts.push(attempt);
    try { await appendDelivery(root, attempt); } catch { /* ledger write is best effort */ }
  }
  return attempts;
}

/* -------------------------------------------------------------------------- */
/* Fire-and-forget settlement hooks                                           */
/* -------------------------------------------------------------------------- */

/** The run digest artifact name; read only to source the files-written count. */
export const RUN_DIGEST_FILE = "run-digest.json";

/**
 * Promises of the settlement announcements that are still in flight. Tracked so
 * a host (tests, or a process about to exit) can wait for the delivery and
 * ledger writes to finish without making settlement itself block on them.
 */
const inFlightDeliveries = new Set<Promise<unknown>>();

function trackDelivery(promise: Promise<unknown>): void {
  let entry: Promise<unknown>;
  entry = promise.catch(() => undefined).finally(() => {
    inFlightDeliveries.delete(entry);
  });
  inFlightDeliveries.add(entry);
}

/**
 * Await every fire-and-forget delivery started by {@link notifyRunSettled},
 * {@link notifyRunOrphaned}, or {@link notifyTeamSettled} that has not settled
 * yet. Tests call this before removing a temporary project directory so an
 * in-flight ledger append cannot race the cleanup; a host can call it before
 * exit. Settlement never awaits this — delivery stays non-blocking.
 */
export async function drainNotifications(): Promise<void> {
  while (inFlightDeliveries.size > 0) {
    await Promise.all([...inFlightDeliveries]);
  }
}

async function filesWrittenIn(runDir: string): Promise<number | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path.join(runDir, RUN_DIGEST_FILE), "utf8")) as { files_written?: { total?: unknown } };
    const total = parsed.files_written?.total;
    return typeof total === "number" && Number.isFinite(total) ? total : undefined;
  } catch {
    return undefined;
  }
}

async function announceRun(root: string, input: RunSettlementInput, orphaned: boolean): Promise<void> {
  const events = buildSettlementEvents(input, { orphaned });
  const filesWritten = input.files_written ?? (input.run_dir !== undefined ? await filesWrittenIn(input.run_dir) : undefined);
  const enriched = filesWritten === undefined ? events : events.map((event) => ({ ...event, files_written: filesWritten }));
  for (const event of enriched) {
    try {
      await dispatchEvent(root, event);
    } catch {
      // A notification must never fail or delay a settlement.
    }
  }
}

/** Announce a run settlement (and a supervision alert when the stop code warrants one). */
export function notifyRunSettled(root: string, input: RunSettlementInput): void {
  trackDelivery(announceRun(root, input, false));
}

/** Announce a discovered orphaned run (and a supervision alert when the stop code warrants one). */
export function notifyRunOrphaned(root: string, input: RunSettlementInput): void {
  trackDelivery(announceRun(root, input, true));
}

/** Announce a finished team run. */
export function notifyTeamSettled(root: string, input: TeamSettlementInput): void {
  trackDelivery(dispatchEvent(root, buildTeamSettledEvent(input)));
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

async function findExecutable(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const pathValue = env.PATH ?? env.Path ?? "";
  const dirs = pathValue.split(path.delimiter).filter((dir) => dir.length > 0);
  const pathext = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((ext) => ext.length > 0);
  // keep the extensionless form first so a bare `hermes` file is found on every platform
  const extensions = process.platform === "win32" ? ["", ...pathext] : [""];
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      if (await fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}

export interface PresetDetection {
  preset: NotificationPreset;
  available: boolean;
  detail: string;
  /** A ready-to-paste `notifications.sinks` entry, present when the preset is available. */
  config?: string;
}

/** Which preset tools this machine can use, with a ready-to-paste config for each found one. */
export async function detectPresets(env: NodeJS.ProcessEnv = process.env): Promise<PresetDetection[]> {
  const detections: PresetDetection[] = [];
  const hermes = await findExecutable("hermes", env);
  detections.push({
    preset: "hermes",
    available: hermes !== undefined,
    detail: hermes !== undefined ? `found at ${hermes}` : "hermes is not on PATH",
    ...(hermes !== undefined
      ? { config: "- id: hermes\n  preset: hermes\n  to: <target>\n  events: [\"*\"]" }
      : {}),
  });
  const apprise = await findExecutable("apprise", env);
  detections.push({
    preset: "apprise",
    available: apprise !== undefined,
    detail: apprise !== undefined ? `found at ${apprise}` : "apprise is not on PATH",
    ...(apprise !== undefined
      ? { config: "- id: apprise\n  preset: apprise\n  urls:\n    - <apprise-url>\n  events: [\"*\"]" }
      : {}),
  });
  detections.push({
    preset: "ntfy",
    available: true,
    detail: "needs only a server URL and topic (no tool to install)",
    config: "- id: ntfy\n  preset: ntfy\n  server: https://ntfy.sh\n  topic: <topic>\n  events: [\"*\"]",
  });
  const toast = process.platform === "win32";
  detections.push({
    preset: "windows-toast",
    available: toast,
    detail: toast ? "Windows PowerShell toast is available" : `not available on ${process.platform}`,
    ...(toast ? { config: "- id: windows-toast\n  preset: windows-toast\n  events: [\"*\"]" } : {}),
  });
  return detections;
}

/** The preset names UH ships, for help text and docs. */
export function listPresets(): readonly NotificationPreset[] {
  return NOTIFICATION_PRESETS;
}

/** One-line human description of a resolved sink, for `uh notify list`. */
export function describeSink(sink: ResolvedSink): string {
  const events = sink.events.length > 0 ? sink.events.join(", ") : "*";
  const filterParts: string[] = [];
  if (sink.filter?.statuses?.length) filterParts.push(`statuses=${sink.filter.statuses.join("|")}`);
  if (sink.filter?.missions?.length) filterParts.push(`missions=${sink.filter.missions.join("|")}`);
  const filter = filterParts.length > 0 ? ` filter(${filterParts.join(",")})` : "";
  if (sink.transport === "command") {
    return `${sink.id} [command] ${sink.argv.join(" ")} events(${events})${filter}`;
  }
  return `${sink.id} [webhook] ${sink.method} ${sink.url} events(${events})${filter}`;
}

/** A generic test event for `uh notify test`. */
export function buildTestEvent(at?: string): NotificationEvent {
  const timestamp = at ?? new Date().toISOString();
  return {
    event: "notify.test",
    at: timestamp,
    subject: "UH notify test: Ultimate Harness",
    summary: "Ultimate Harness test notification",
    status: "test",
  };
}
