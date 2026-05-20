import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { missionLatestPointer, missionRunDir } from "./paths.js";
import { LatestRunPointerSchema } from "../schema/runs.js";

export interface RuntimeCancelledEventInput {
  root: string;
  missionId: string;
  runtime: string;
  signal: string;
  timestamp?: string;
}

/**
 * UH-82: append a `runtime.cancelled` event to the active run's
 * `events.ndjson`. The active run id is discovered by reading
 * `latest.json` synchronously. When no pointer exists (no run was ever
 * started for this mission) we silently skip — there is nowhere to
 * meaningfully attribute the event.
 */
export function appendRuntimeCancelledEvent(input: RuntimeCancelledEventInput): string | null {
  const pointerPath = missionLatestPointer(input.root, input.missionId);
  let runId: string;
  try {
    const raw = readFileSync(pointerPath, "utf-8");
    const pointer = LatestRunPointerSchema.parse(JSON.parse(raw));
    runId = pointer.run_id;
  } catch {
    return null;
  }
  const runDir = missionRunDir(input.root, input.missionId, runId);
  const eventsPath = path.join(runDir, "events.ndjson");
  mkdirSync(runDir, { recursive: true });
  appendFileSync(eventsPath, JSON.stringify({
    event: "runtime.cancelled",
    timestamp: input.timestamp ?? new Date().toISOString(),
    runtime: input.runtime,
    mission_id: input.missionId,
    run_id: runId,
    signal: input.signal,
  }) + "\n", "utf-8");
  return eventsPath;
}
