import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface RuntimeCancelledEventInput {
  root: string;
  missionId: string;
  runtime: string;
  signal: string;
  timestamp?: string;
}

export function appendRuntimeCancelledEvent(input: RuntimeCancelledEventInput): string {
  const missionDir = path.join(input.root, ".harness", "missions", input.missionId);
  const eventsPath = path.join(missionDir, "events.ndjson");
  mkdirSync(missionDir, { recursive: true });
  appendFileSync(eventsPath, JSON.stringify({
    event: "runtime.cancelled",
    timestamp: input.timestamp ?? new Date().toISOString(),
    runtime: input.runtime,
    mission_id: input.missionId,
    signal: input.signal,
  }) + "\n", "utf-8");
  return eventsPath;
}
