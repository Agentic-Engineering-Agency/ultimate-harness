import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { missionDir, missionLatestPointer, missionRunDir, missionRunsIndex } from "./paths.js";
import {
  LatestRunPointerSchema,
  RunsIndexSchema,
  type LatestRunPointer,
  type RunsIndex,
} from "../schema/runs.js";
import {
  RuntimeResultSchema,
  RuntimeSessionSchema,
  type RuntimeResultDocument,
  type RuntimeSessionDocument,
} from "../schema/artifacts.js";

export interface RuntimeCancelledEventInput {
  root: string;
  missionId: string;
  runtime: string;
  signal: string;
  /** When set, append to this run's events.ndjson instead of reading latest.json. */
  runId?: string;
  source?: string;
  timestamp?: string;
}

function readLatestPointer(root: string, missionId: string): LatestRunPointer | null {
  try {
    return LatestRunPointerSchema.parse(JSON.parse(readFileSync(missionLatestPointer(root, missionId), "utf-8")));
  } catch {
    return null;
  }
}

function resolveRunId(input: RuntimeCancelledEventInput): string | null {
  if (input.runId !== undefined) return input.runId;
  const pointer = readLatestPointer(input.root, input.missionId);
  if (pointer) return pointer.run_id;
  if (process.env.UH_QUIET_CANCEL !== "1") {
    process.stderr.write(
      `[uh] runtime.cancelled skipped: no latest.json for mission ${input.missionId} (no run has started)\n`,
    );
  }
  return null;
}

function readRunsIndex(root: string, missionId: string): RunsIndex | null {
  try {
    return RunsIndexSchema.parse(JSON.parse(readFileSync(missionRunsIndex(root, missionId), "utf-8")));
  } catch {
    return null;
  }
}

function readRuntimeSession(root: string, missionId: string, runId: string): RuntimeSessionDocument | null {
  try {
    const result = RuntimeSessionSchema.safeParse(parse(readFileSync(
      path.join(missionRunDir(root, missionId, runId), "runtime-session.yaml"),
      "utf-8",
    )));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readRuntimeResult(root: string, missionId: string, runId: string): RuntimeResultDocument | null {
  try {
    const result = RuntimeResultSchema.safeParse(parse(readFileSync(
      path.join(missionRunDir(root, missionId, runId), "runtime-result.yaml"),
      "utf-8",
    )));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * UH-82: append a `runtime.cancelled` event to the selected run's
 * `events.ndjson`. The run id is discovered from `latest.json` only when the
 * caller did not provide one. This helper intentionally remains synchronous:
 * it is called directly from signal handling before the process exits.
 */
export function appendRuntimeCancelledEvent(input: RuntimeCancelledEventInput): string | null {
  const runId = resolveRunId(input);
  if (!runId) return null;
  const runDir = missionRunDir(input.root, input.missionId, runId);
  const eventsPath = path.join(runDir, "events.ndjson");
  mkdirSync(runDir, { recursive: true });
  const payload: Record<string, string> = {
    event: "runtime.cancelled",
    timestamp: input.timestamp ?? new Date().toISOString(),
    runtime: input.runtime,
    mission_id: input.missionId,
    run_id: runId,
    signal: input.signal,
  };
  if (input.source !== undefined) payload.source = input.source;
  appendFileSync(eventsPath, JSON.stringify(payload) + "\n", "utf-8");
  return eventsPath;
}

function cancelledResult(
  input: RuntimeCancelledEventInput,
  runId: string,
  startedAt: string,
  finishedAt: string,
): RuntimeResultDocument {
  const existing = readRuntimeResult(input.root, input.missionId, runId);
  const errors = existing?.errors.includes("Run cancelled by signal")
    ? existing.errors
    : [...(existing?.errors ?? []), "Run cancelled by signal"];
  return RuntimeResultSchema.parse({
    ...(existing ?? {}),
    schema_version: "uh.runtime-result.v0",
    mission_id: input.missionId,
    runtime: input.runtime,
    status: "cancelled",
    started_at: startedAt,
    finished_at: finishedAt,
    exit_code: 143,
    prompt_path: existing?.prompt_path ?? path.relative(input.root, path.join(missionRunDir(input.root, input.missionId, runId), "prompt.md")),
    stdout_path: existing?.stdout_path ?? path.relative(input.root, path.join(missionRunDir(input.root, input.missionId, runId), "runtime.stdout.log")),
    stderr_path: existing?.stderr_path ?? path.relative(input.root, path.join(missionRunDir(input.root, input.missionId, runId), "runtime.stderr.log")),
    diff_path: existing?.diff_path ?? path.relative(input.root, path.join(missionRunDir(input.root, input.missionId, runId), "diff.patch")),
    errors,
  });
}

function cancelledSession(
  input: RuntimeCancelledEventInput,
  runId: string,
  startedAt: string,
  finishedAt: string,
): RuntimeSessionDocument {
  const existing = readRuntimeSession(input.root, input.missionId, runId);
  return RuntimeSessionSchema.parse({
    ...(existing ?? {}),
    schema_version: "uh.runtime-session.v0",
    mission_id: input.missionId,
    runtime: input.runtime,
    status: "failed",
    exit_code: 143,
    started_at: startedAt,
    finished_at: finishedAt,
  });
}

function writeRunTerminalArtifacts(
  input: RuntimeCancelledEventInput,
  runId: string,
  startedAt: string,
  finishedAt: string,
): void {
  const runDir = missionRunDir(input.root, input.missionId, runId);
  try {
    mkdirSync(runDir, { recursive: true });
  } catch {
    // Individual artifact writes below still get an independent attempt.
  }
  try {
    writeFileSync(path.join(runDir, "runtime-result.yaml"), stringify(cancelledResult(input, runId, startedAt, finishedAt)), "utf-8");
  } catch {
    // Result persistence is independent from the other terminal facts.
  }
  try {
    writeFileSync(path.join(runDir, "runtime-session.yaml"), stringify(cancelledSession(input, runId, startedAt, finishedAt)), "utf-8");
  } catch {
    // Session persistence is independent from the result/index writes.
  }
}

function updateRunIndex(
  input: RuntimeCancelledEventInput,
  runId: string,
  finishedAt: string,
): void {
  const index = readRunsIndex(input.root, input.missionId);
  if (!index) return;
  const runs = index.runs.map((run) => run.run_id === runId
    ? { ...run, finished_at: finishedAt, status: "cancelled" as const }
    : run);
  try {
    writeFileSync(missionRunsIndex(input.root, input.missionId), JSON.stringify({ ...index, runs }, null, 2), "utf-8");
  } catch {
    // The run-scoped result/session remain useful when the index is unwritable.
  }
}

function updateCanonicalMirrors(
  input: RuntimeCancelledEventInput,
  runId: string,
  startedAt: string,
  finishedAt: string,
): void {
  const pointer = readLatestPointer(input.root, input.missionId);
  if (!pointer || pointer.run_id !== runId) return;
  const updatedPointer = { ...pointer, finished_at: finishedAt, status: "cancelled" as const };
  try {
    writeFileSync(missionLatestPointer(input.root, input.missionId), JSON.stringify(updatedPointer), "utf-8");
  } catch {
    // Run-scoped terminal facts do not depend on the latest pointer write.
  }
  try {
    const result = cancelledResult(input, runId, startedAt, finishedAt);
    writeFileSync(path.join(missionDir(input.root, input.missionId), "runtime-result.yaml"), stringify(result), "utf-8");
  } catch {
    // Preserve independent result/session/index persistence.
  }
  try {
    const session = cancelledSession(input, runId, startedAt, finishedAt);
    writeFileSync(path.join(missionDir(input.root, input.missionId), "runtime-session.yaml"), stringify(session), "utf-8");
  } catch {
    // Preserve independent result/index persistence.
  }
}

export function finalizeRuntimeCancelledRun(input: RuntimeCancelledEventInput): string | null {
  const runId = resolveRunId(input);
  if (!runId) return null;
  const selectedInput = { ...input, runId };
  const finishedAt = input.timestamp ?? new Date().toISOString();
  const index = readRunsIndex(input.root, input.missionId);
  const selectedEntry = index?.runs.find((run) => run.run_id === runId);
  const existingSession = readRuntimeSession(input.root, input.missionId, runId);
  const startedAt = existingSession?.started_at ?? selectedEntry?.started_at ?? finishedAt;

  let eventPath: string | null = null;
  try {
    eventPath = appendRuntimeCancelledEvent(selectedInput);
  } catch {
    // Event append failure must not prevent terminal result/session/index writes.
  }
  try {
    const runDir = missionRunDir(input.root, input.missionId, runId);
    mkdirSync(runDir, { recursive: true });
    appendFileSync(path.join(runDir, "events.ndjson"), `${JSON.stringify({
      event: "runtime.finished",
      timestamp: finishedAt,
      runtime: input.runtime,
      mission_id: input.missionId,
      run_id: runId,
      status: "cancelled",
      exit_code: 143,
    })}\n`, "utf-8");
  } catch {
    // Terminal result/session/index writes below are independent of events.
  }
  writeRunTerminalArtifacts(selectedInput, runId, startedAt, finishedAt);
  updateRunIndex(selectedInput, runId, finishedAt);
  updateCanonicalMirrors(selectedInput, runId, startedAt, finishedAt);
  return eventPath;
}
