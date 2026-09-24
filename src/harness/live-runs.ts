import { execFile } from "node:child_process";
import { access, mkdir, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { RuntimeControlSchema, type RuntimeControl } from "../schema/runtime-control.js";
import type { RunDigestLongRunningTool } from "../schema/run-digest.js";
import { relativeArtifactPath } from "./artifact-paths.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { assertValidRunId } from "./run-id.js";
import { readRunDigest } from "./run-digest.js";
import { elapsedMs, notifyRunSettled } from "./notifications.js";
import type { MissionArtifactContext } from "../adapters/_artifact-context.js";

/**
 * UH live-runs — a project-root registry of in-flight runtime attempts.
 *
 * A runtime attempt claims its identity in `runtime-attempt.ts`; that claim
 * records a small JSON entry under `.harness/live-runs/<run_id>.json` at the
 * PROJECT root (the nearest ancestor of the artifact root holding
 * `.harness/project.yaml`). `uh ps` reads the registry, merges whatever
 * `runtime-control.json` currently says, and scans the harness tree for
 * pre-registry runtime-control files so every live run is discoverable from
 * the project root. Liveness is decided against an injectable process lister;
 * the default lists native processes only.
 */

const execFileAsync = promisify(execFile);

export const LIVE_RUN_SCHEMA_VERSION = "uh.live-run.v0" as const;
/** A heartbeat older than this (times two) marks a run stale. */
export const DEFAULT_STALL_WINDOW_MS = 60_000;
export const STALE_HEARTBEAT_MULTIPLIER = 2;
/** Settled runs stay visible to `uh ps --all` for one day. */
export const SETTLED_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Never read more than the tail of an append-only events log. */
export const EVENTS_TAIL_BYTES = 64 * 1024;
export const SCAN_MAX_DEPTH = 16;
export const SCAN_DIRECTORY_LIMIT = 20_000;
export const PROCESS_COMMAND_PREVIEW_CHARS = 200;
export const PROCESS_TREE_COMMAND_CHARS = 80;

const TERMINAL_STATUSES = new Set(["passed", "failed", "blocked", "cancelled"]);

export type LiveRunTeam = { mission_id: string; role: string };
export type LivenessVerdict = "live" | "orphaned" | "stale" | "settled" | "unknown";
export type LiveRunSource = "registry" | "scan";

/** Persisted registry contract for a live run. */
export const LiveRunTeamSchema = z
  .object({ mission_id: z.string().min(1), role: z.string().min(1) })
  .strict();

export const LiveRunEntrySchema = z
  .object({
    schema_version: z.literal(LIVE_RUN_SCHEMA_VERSION),
    run_id: z.string().min(1),
    mission_id: z.string().min(1),
    runtime: z.string().min(1),
    model: z.string().min(1).optional(),
    team: LiveRunTeamSchema.optional(),
    /** Artifact root, relative to the project root, forward slashes. */
    artifact_root: z.string(),
    /** runtime-control.json path, relative to the project root, forward slashes. */
    control_path: z.string(),
    controller_pid: z.number().int().nonnegative(),
    started_at: z.string(),
    status: z.string().optional(),
    stop_code: z.string().optional(),
    settled_at: z.string().optional(),
  })
  .strict();
export type LiveRunEntry = z.infer<typeof LiveRunEntrySchema>;

export type NativeProcess = { pid: number; ppid: number; name: string; command: string };
export type ProcessLister = () => Promise<NativeProcess[]>;

/**
 * A discovered live run. The registry fields are overlaid with whatever the
 * run's `runtime-control.json` currently says, so the record always reflects
 * the controller's own view even when the registry entry predates it.
 */
export interface LiveRunRecord {
  source: LiveRunSource;
  run_id: string;
  mission_id: string;
  runtime: string;
  model?: string;
  team?: LiveRunTeam;
  artifact_root: string;
  control_path: string;
  controller_pid: number;
  started_at: string;
  status?: string;
  stop_code?: string;
  settled_at?: string;
  heartbeat_at?: string;
  ready_at?: string;
  session_id?: string;
  turns?: number;
  denials?: number;
  inflight_tools?: number;
  peak_memory_bytes?: number;
  last_event_at?: string;
  last_tool?: string;
  /**
   * Tool calls the run's digest reports as stalled: in flight with no end
   * event and no output beyond the digest's stall window. Absent, like the
   * signal itself, whenever the digest carries none.
   */
  stalled_tools?: RunDigestLongRunningTool[];
}

export interface LiveRunView extends LiveRunRecord {
  liveness: LivenessVerdict;
  children: NativeProcess[];
  heartbeat_age_ms?: number;
}

export interface LivenessOptions {
  now?: number;
  stallWindowMs?: number;
}

export interface DiscoverRunsOptions {
  includeSettled?: boolean;
  now?: number;
  /** Reconcile terminal control facts back into the registry (default true). */
  persist?: boolean;
}

export interface ListLiveRunsOptions {
  includeSettled?: boolean;
  processes?: NativeProcess[];
  now?: number;
  stallWindowMs?: number;
  persist?: boolean;
}

export interface ListLiveRunsResult {
  records: LiveRunView[];
  orphaned: number;
}

export function liveRunsDir(projectRoot: string): string {
  return path.join(projectRoot, ".harness", "live-runs");
}

/** Forward-slashed relative path, with the project root itself rendered as ".". */
function relativeOrDot(from: string, to: string): string {
  const relative = relativeArtifactPath(from, to);
  return relative.length === 0 ? "." : relative;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** The nearest ancestor of `startDir` (inclusive) holding `.harness/project.yaml`. */
export async function findProjectRoot(startDir: string): Promise<string | undefined> {
  let dir = path.resolve(startDir);
  for (;;) {
    if (await pathExists(path.join(dir, ".harness", "project.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Team identity encoded by a worker artifact root under a team directory. */
export function teamFromArtifactRoot(projectRoot: string, artifactRoot: string): LiveRunTeam | undefined {
  const relative = relativeArtifactPath(projectRoot, artifactRoot);
  const match = /^\.harness\/missions\/([^/]+)\/team\/artifacts\/[^/]+\/workers\/([^/]+)$/.exec(relative);
  return match ? { mission_id: match[1], role: match[2] } : undefined;
}

export function isSettled(record: { status?: string; settled_at?: string }): boolean {
  if (record.settled_at !== undefined) return true;
  return record.status !== undefined && TERMINAL_STATUSES.has(record.status);
}

function settledTime(record: { settled_at?: string; heartbeat_at?: string }): number | undefined {
  const raw = record.settled_at ?? record.heartbeat_at;
  if (raw === undefined) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function heartbeatAgeMs(record: { heartbeat_at?: string }, now: number): number | undefined {
  if (record.heartbeat_at === undefined) return undefined;
  const parsed = Date.parse(record.heartbeat_at);
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : undefined;
}

export interface RegisterLiveRunInput {
  projectRoot: string;
  artifactRoot: string;
  runId: string;
  missionId: string;
  runtime: string;
  model?: string;
  team?: LiveRunTeam;
  controlPath?: string;
  controllerPid?: number;
  startedAt?: string;
  status?: string;
  stopCode?: string;
  settledAt?: string;
}

/** Write `.harness/live-runs/<run_id>.json` under the project root. */
export async function registerLiveRun(input: RegisterLiveRunInput): Promise<string> {
  assertValidRunId(input.runId);
  const projectRoot = path.resolve(input.projectRoot);
  const artifactRoot = path.resolve(input.artifactRoot);
  const controlPath = input.controlPath !== undefined
    ? path.resolve(input.controlPath)
    : path.join(artifactRoot, ".harness", "missions", input.missionId, "runs", input.runId, "runtime-control.json");
  const entry: LiveRunEntry = LiveRunEntrySchema.parse({
    schema_version: LIVE_RUN_SCHEMA_VERSION,
    run_id: input.runId,
    mission_id: input.missionId,
    runtime: input.runtime,
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.team !== undefined ? { team: input.team } : {}),
    artifact_root: relativeOrDot(projectRoot, artifactRoot),
    control_path: relativeOrDot(projectRoot, controlPath),
    controller_pid: input.controllerPid ?? process.pid,
    started_at: input.startedAt ?? new Date().toISOString(),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.stopCode !== undefined ? { stop_code: input.stopCode } : {}),
    ...(input.settledAt !== undefined ? { settled_at: input.settledAt } : {}),
  });
  const directory = liveRunsDir(projectRoot);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${input.runId}.json`);
  await writeAtomicArtifact(file, JSON.stringify(entry, null, 2));
  return file;
}

/** Update the registry entry with a terminal status. No-op without an entry. */
export async function settleLiveRun(
  projectRoot: string,
  runId: string,
  patch: { status?: string; stop_code?: string; settled_at?: string; controller_pid?: number },
): Promise<void> {
  assertValidRunId(runId);
  const file = path.join(liveRunsDir(projectRoot), `${runId}.json`);
  let entry: LiveRunEntry;
  try {
    entry = LiveRunEntrySchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return;
  }
  const updated: LiveRunEntry = LiveRunEntrySchema.parse({
    ...entry,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.stop_code !== undefined ? { stop_code: patch.stop_code } : {}),
    ...(patch.controller_pid !== undefined ? { controller_pid: patch.controller_pid } : {}),
    settled_at: patch.settled_at ?? entry.settled_at ?? new Date().toISOString(),
  });
  await writeAtomicArtifact(file, JSON.stringify(updated, null, 2));
}

export interface ClaimLiveRunHint {
  projectRoot?: string;
  team?: LiveRunTeam;
  runtime?: string;
  model?: string;
  artifactRoot?: string;
  controllerPid?: number;
}

/**
 * Register the attempt described by an adapter's mission artifact context.
 * The project root is the nearest ancestor of the artifact root holding
 * `.harness/project.yaml`; team identity is read from a worker artifact root
 * under `.harness/missions/<team>/team/artifacts/<run>/workers/<role>`.
 */
export async function claimLiveRun(
  artifacts: MissionArtifactContext,
  hint: ClaimLiveRunHint = {},
): Promise<void> {
  const runId = path.basename(artifacts.runDir);
  const missionId = path.basename(artifacts.missionDir);
  const artifactRoot = hint.artifactRoot !== undefined
    ? path.resolve(hint.artifactRoot)
    : path.resolve(artifacts.missionDir, "..", "..", "..");
  const projectRoot = hint.projectRoot !== undefined
    ? path.resolve(hint.projectRoot)
    : await findProjectRoot(artifactRoot);
  if (projectRoot === undefined) return;
  const team = hint.team ?? teamFromArtifactRoot(projectRoot, artifactRoot);
  await registerLiveRun({
    projectRoot,
    artifactRoot,
    runId,
    missionId,
    runtime: hint.runtime ?? "unknown",
    ...(hint.model !== undefined ? { model: hint.model } : {}),
    ...(team !== undefined ? { team } : {}),
    controlPath: path.join(artifacts.runDir, "runtime-control.json"),
    ...(hint.controllerPid !== undefined ? { controllerPid: hint.controllerPid } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

async function readRegistry(projectRoot: string): Promise<LiveRunEntry[]> {
  const directory = liveRunsDir(projectRoot);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const entries: LiveRunEntry[] = [];
  for (const name of names.filter((name) => name.endsWith(".json"))) {
    try {
      const parsed = LiveRunEntrySchema.safeParse(JSON.parse(await readFile(path.join(directory, name), "utf8")));
      if (parsed.success) entries.push(parsed.data);
    } catch {
      // A malformed registry entry must not hide the rest of the directory.
    }
  }
  return entries;
}

async function readControlFile(projectRoot: string, controlPathRel: string): Promise<RuntimeControl | undefined> {
  try {
    const parsed = RuntimeControlSchema.safeParse(JSON.parse(await readFile(path.resolve(projectRoot, controlPathRel), "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Read only the tail of events.ndjson for the last event time and tool name. */
async function readEventsTail(
  projectRoot: string,
  controlPathRel: string,
): Promise<{ lastEventAt?: string; lastTool?: string }> {
  const eventsPath = path.join(path.dirname(path.resolve(projectRoot, controlPathRel)), "events.ndjson");
  let handle;
  try {
    handle = await open(eventsPath, "r");
  } catch {
    return {};
  }
  try {
    const { size } = await handle.stat();
    if (size === 0) return {};
    const length = Math.min(size, EVENTS_TAIL_BYTES);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    if (size > length) {
      const newline = text.indexOf("\n");
      text = newline >= 0 ? text.slice(newline + 1) : "";
    }
    let lastEventAt: string | undefined;
    let lastTool: string | undefined;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let event: Record<string, unknown>;
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed === null || typeof parsed !== "object") continue;
        event = parsed as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof event.timestamp === "string") lastEventAt = event.timestamp;
      const tool = event.toolName ?? event.tool_name ?? event.tool;
      if (typeof tool === "string" && tool.length > 0) lastTool = tool;
    }
    return {
      ...(lastEventAt !== undefined ? { lastEventAt } : {}),
      ...(lastTool !== undefined ? { lastTool } : {}),
    };
  } finally {
    await handle.close();
  }
}

/**
 * Stalled tool calls from the run's `run-digest.json`, which lives beside its
 * `runtime-control.json`. A missing or malformed digest carries no signal.
 */
async function readStalledTools(
  projectRoot: string,
  controlPathRel: string,
): Promise<RunDigestLongRunningTool[]> {
  const digest = await readRunDigest(path.dirname(path.resolve(projectRoot, controlPathRel)));
  return digest?.loop_signals.long_running_tools ?? [];
}

interface ScannedControl {
  runId: string;
  controlPathRel: string;
  artifactRootAbs: string;
  artifactRootRel: string;
}

/** Depth-limited walk of `.harness/` for runtime-control.json files. */
async function scanForRuntimeControls(projectRoot: string): Promise<ScannedControl[]> {
  const found: ScannedControl[] = [];
  let visited = 0;
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > SCAN_MAX_DEPTH || visited >= SCAN_DIRECTORY_LIMIT) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    visited += 1;
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "live-runs") continue;
      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (entry.name !== "runtime-control.json") continue;
      const runDir = directory;
      const runId = path.basename(runDir);
      try {
        assertValidRunId(runId);
      } catch {
        continue;
      }
      const artifactRootAbs = path.resolve(runDir, "..", "..", "..", "..", "..");
      found.push({
        runId,
        controlPathRel: relativeArtifactPath(projectRoot, path.join(runDir, entry.name)),
        artifactRootAbs,
        artifactRootRel: relativeArtifactPath(projectRoot, artifactRootAbs),
      });
    }
  };
  await walk(path.join(projectRoot, ".harness"), 0);
  return found;
}

async function hydrateRegistryRecord(projectRoot: string, entry: LiveRunEntry): Promise<LiveRunRecord> {
  const control = await readControlFile(projectRoot, entry.control_path);
  const events = await readEventsTail(projectRoot, entry.control_path);
  const stalledTools = await readStalledTools(projectRoot, entry.control_path);
  return {
    source: "registry",
    run_id: entry.run_id,
    mission_id: entry.mission_id,
    runtime: control?.runtime ?? entry.runtime,
    ...(entry.model !== undefined ? { model: entry.model } : {}),
    ...(entry.team !== undefined ? { team: entry.team } : {}),
    artifact_root: entry.artifact_root,
    control_path: entry.control_path,
    controller_pid: control?.controller_pid ?? entry.controller_pid,
    started_at: entry.started_at,
    ...(control !== undefined
      ? { status: control.status, heartbeat_at: control.heartbeat_at }
      : (entry.status !== undefined ? { status: entry.status } : {})),
    ...(control?.stop_code !== undefined
      ? { stop_code: control.stop_code }
      : (entry.stop_code !== undefined ? { stop_code: entry.stop_code } : {})),
    ...(control?.ready_at !== undefined ? { ready_at: control.ready_at } : {}),
    ...(control?.session_id !== undefined ? { session_id: control.session_id } : {}),
    ...(control?.turns !== undefined ? { turns: control.turns } : {}),
    ...(control?.denials !== undefined ? { denials: control.denials } : {}),
    ...(control?.inflight_tools !== undefined ? { inflight_tools: control.inflight_tools } : {}),
    ...(control?.peak_memory_bytes !== undefined ? { peak_memory_bytes: control.peak_memory_bytes } : {}),
    ...(entry.settled_at !== undefined ? { settled_at: entry.settled_at } : {}),
    ...(events.lastEventAt !== undefined ? { last_event_at: events.lastEventAt } : {}),
    ...(events.lastTool !== undefined ? { last_tool: events.lastTool } : {}),
    ...(stalledTools.length > 0 ? { stalled_tools: stalledTools } : {}),
  };
}

async function hydrateScannedRecord(projectRoot: string, found: ScannedControl): Promise<LiveRunRecord | undefined> {
  const control = await readControlFile(projectRoot, found.controlPathRel);
  if (control === undefined) return undefined;
  const events = await readEventsTail(projectRoot, found.controlPathRel);
  const stalledTools = await readStalledTools(projectRoot, found.controlPathRel);
  const team = teamFromArtifactRoot(projectRoot, found.artifactRootAbs);
  return {
    source: "scan",
    run_id: found.runId,
    mission_id: control.mission_id,
    runtime: control.runtime,
    artifact_root: found.artifactRootRel,
    control_path: found.controlPathRel,
    controller_pid: control.controller_pid,
    started_at: control.started_at,
    status: control.status,
    ...(control.stop_code !== undefined ? { stop_code: control.stop_code } : {}),
    heartbeat_at: control.heartbeat_at,
    ...(control.ready_at !== undefined ? { ready_at: control.ready_at } : {}),
    ...(control.session_id !== undefined ? { session_id: control.session_id } : {}),
    turns: control.turns,
    denials: control.denials,
    inflight_tools: control.inflight_tools,
    ...(control.peak_memory_bytes !== undefined ? { peak_memory_bytes: control.peak_memory_bytes } : {}),
    ...(team !== undefined ? { team } : {}),
    ...(events.lastEventAt !== undefined ? { last_event_at: events.lastEventAt } : {}),
    ...(events.lastTool !== undefined ? { last_tool: events.lastTool } : {}),
    ...(stalledTools.length > 0 ? { stalled_tools: stalledTools } : {}),
  };
}

/**
 * Every run discoverable from the project root: the registry unioned with a
 * bounded scan for pre-registry runtime-control.json files. Settled runs are
 * dropped unless `includeSettled`, and then only within the 24h retention
 * window. Terminal control facts are reconciled back into the registry.
 */
export async function discoverRuns(
  projectRoot: string,
  options: DiscoverRunsOptions = {},
): Promise<LiveRunRecord[]> {
  const includeSettled = options.includeSettled === true;
  const now = options.now ?? Date.now();
  const persist = options.persist !== false;
  const records: LiveRunRecord[] = [];
  const seen = new Set<string>();
  for (const entry of await readRegistry(projectRoot)) {
    const record = await hydrateRegistryRecord(projectRoot, entry);
    if (persist && isSettled(record) && entry.settled_at === undefined) {
      await settleLiveRun(projectRoot, entry.run_id, {
        status: record.status,
        stop_code: record.stop_code,
        settled_at: record.heartbeat_at,
        controller_pid: record.controller_pid,
      }).catch(() => undefined);
      notifyRunSettled(projectRoot, {
        run_id: record.run_id,
        mission: record.mission_id,
        runtime: record.runtime,
        ...(record.model !== undefined ? { model: record.model } : {}),
        status: record.status ?? "unknown",
        ...(record.stop_code !== undefined ? { stop_code: record.stop_code } : {}),
        duration_ms: elapsedMs(record.started_at, record.heartbeat_at ?? record.settled_at),
        run_dir: path.dirname(path.resolve(projectRoot, record.control_path)),
      });
    }
    seen.add(record.run_id);
    records.push(record);
  }
  for (const found of await scanForRuntimeControls(projectRoot)) {
    if (seen.has(found.runId)) continue;
    const record = await hydrateScannedRecord(projectRoot, found);
    if (record === undefined) continue;
    seen.add(record.run_id);
    records.push(record);
  }
  return records.filter((record) => {
    if (!isSettled(record)) return true;
    if (!includeSettled) return false;
    const at = settledTime(record);
    return at === undefined || now - at <= SETTLED_RETENTION_MS;
  });
}

/* -------------------------------------------------------------------------- */
/* Liveness                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Verdict for a discovered run.
 *
 * - `settled`: terminal status (or an explicit settled_at).
 * - `orphaned`: the controller reports `running` but its pid is gone. This is
 *   the incident case and must be surfaced loudly.
 * - `stale`: the controller is alive but its heartbeat is older than twice the
 *   stall window.
 * - `live`: controller alive and running with a fresh heartbeat.
 */
export function liveness(
  record: LiveRunRecord,
  processes: readonly NativeProcess[],
  options: LivenessOptions = {},
): LivenessVerdict {
  const now = options.now ?? Date.now();
  const stallWindowMs = options.stallWindowMs ?? DEFAULT_STALL_WINDOW_MS;
  if (isSettled(record)) return "settled";
  const running = record.status === undefined || record.status === "running";
  if (!running) return "unknown";
  if (!processes.some((process) => process.pid === record.controller_pid)) return "orphaned";
  const age = heartbeatAgeMs(record, now);
  if (age !== undefined && age > stallWindowMs * STALE_HEARTBEAT_MULTIPLIER) return "stale";
  return "live";
}

/** Native processes whose parent chain leads back to `controllerPid`. */
export function processChildren(controllerPid: number, processes: readonly NativeProcess[]): NativeProcess[] {
  const byParent = new Map<number, NativeProcess[]>();
  for (const process of processes) {
    const siblings = byParent.get(process.ppid) ?? [];
    siblings.push(process);
    byParent.set(process.ppid, siblings);
  }
  const children: NativeProcess[] = [];
  const seen = new Set<number>([controllerPid]);
  const stack = [controllerPid];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    for (const child of byParent.get(pid) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      // The tree keeps only the first 80 characters of each command line.
      children.push({ ...child, command: child.command.slice(0, PROCESS_TREE_COMMAND_CHARS) });
      stack.push(child.pid);
    }
  }
  return children;
}

/** Default process lister: Windows CIM, else POSIX `ps`. Never throws. */
export async function defaultProcessLister(): Promise<NativeProcess[]> {
  try {
    return process.platform === "win32" ? await listWindowsProcesses() : await listPosixProcesses();
  } catch {
    return [];
  }
}

async function listWindowsProcesses(): Promise<NativeProcess[]> {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 2",
  ], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const processes: NativeProcess[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const pid = Number(record.ProcessId);
    const ppid = Number(record.ParentProcessId);
    if (!Number.isFinite(pid)) continue;
    processes.push({
      pid,
      ppid: Number.isFinite(ppid) ? ppid : 0,
      name: typeof record.Name === "string" ? record.Name : "",
      command: (typeof record.CommandLine === "string" ? record.CommandLine : "").slice(0, PROCESS_COMMAND_PREVIEW_CHARS),
    });
  }
  return processes;
}

async function listPosixProcesses(): Promise<NativeProcess[]> {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid,ppid,comm,args"], { maxBuffer: 64 * 1024 * 1024 });
  const processes: NativeProcess[] = [];
  for (const line of stdout.split("\n").slice(1)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) continue;
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      name: match[3],
      command: match[4].slice(0, PROCESS_COMMAND_PREVIEW_CHARS),
    });
  }
  return processes;
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** Discover runs, attach liveness verdicts, and list the controller's tree. */
export async function listLiveRuns(
  projectRoot: string,
  options: ListLiveRunsOptions = {},
): Promise<ListLiveRunsResult> {
  const now = options.now ?? Date.now();
  const records = await discoverRuns(projectRoot, {
    includeSettled: options.includeSettled,
    now,
    persist: options.persist,
  });
  let processes = options.processes;
  if (processes === undefined) {
    processes = records.some((record) => !isSettled(record)) ? await defaultProcessLister() : [];
  }
  const records_ = records.map((record): LiveRunView => {
    const age = heartbeatAgeMs(record, now);
    return {
      ...record,
      liveness: liveness(record, processes, { now, stallWindowMs: options.stallWindowMs }),
      children: processChildren(record.controller_pid, processes),
      ...(age !== undefined ? { heartbeat_age_ms: age } : {}),
    };
  });
  return { records: records_, orphaned: records_.filter((record) => record.liveness === "orphaned").length };
}

/** Counts for `uh status` / `uh status --json`; never throws. */
export async function liveRunCounts(
  projectRoot: string,
  options: ListLiveRunsOptions = {},
): Promise<{ total: number; orphaned: number }> {
  try {
    const { records, orphaned } = await listLiveRuns(projectRoot, { ...options, persist: options.persist ?? false });
    return { total: records.length, orphaned };
  } catch {
    return { total: 0, orphaned: 0 };
  }
}

/** Exit code for `uh ps`: 3 when at least one run is orphaned, else 0. */
export function liveRunsExitCode(records: readonly LiveRunView[]): number {
  return records.some((record) => record.liveness === "orphaned") ? 3 : 0;
}

function formatAge(milliseconds: number | undefined): string {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return "-";
  const clamped = Math.max(0, Math.round(milliseconds));
  return clamped < 1000 ? `${clamped}ms` : `${Math.floor(clamped / 1000)}s`;
}

/** One line per run: id, mission, team role, route, verdict, counters, ages, pids. */
export function formatLiveRuns(records: readonly LiveRunView[], options: { now?: number } = {}): string {
  if (records.length === 0) return "No live runs.";
  const now = options.now ?? Date.now();
  return records
    .map((record) => {
      const team = record.team !== undefined ? `team=${record.team.role}` : "team=-";
      const route = record.model !== undefined ? `${record.runtime}/${record.model}` : record.runtime;
      const heartbeat = formatAge(record.heartbeat_age_ms ?? heartbeatAgeMs(record, now));
      const lastAge = record.last_event_at !== undefined
        ? formatAge(now - Date.parse(record.last_event_at))
        : "-";
      const pids = [record.controller_pid, ...record.children.map((child) => child.pid)].join(",");
      return [
        record.run_id,
        record.mission_id,
        team,
        route,
        record.liveness,
        `turns=${record.turns ?? 0}`,
        `denials=${record.denials ?? 0}`,
        `hb=${heartbeat}`,
        `last=${record.last_tool ?? "-"} (${lastAge})`,
        ...formatStalledTools(record.stalled_tools),
        `pids=${pids}`,
      ].join("  ");
    })
    .join("\n");
}

/** The stalled-call segment of a row: empty unless the run's digest reports one. */
function formatStalledTools(stalled: readonly RunDigestLongRunningTool[] | undefined): string[] {
  if (stalled === undefined || stalled.length === 0) return [];
  const calls = stalled.map((call) => `tool=${call.tool} ${call.minutes}m`).join(",");
  return [`STALLED ${calls}`];
}
