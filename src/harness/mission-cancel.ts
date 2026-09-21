import { readFile, writeFile, lstat } from "node:fs/promises";
import path from "node:path";
import { RuntimeControlSchema, RuntimeCancelRequestSchema, type RuntimeControl } from "../schema/runtime-control.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId } from "./run-id.js";
import { getMissionArtifactContext, assertWritableArtifact } from "../adapters/_artifact-context.js";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "yaml";
import { RuntimeSessionSchema } from "../schema/artifacts.js";
import { reconcileRuntimeSettlement } from "./runtime-settlement.js";

/** UH-95 — cancel an in-flight mission run via the Hermes plugin API. */

export interface MissionCancelResult {
  ok: boolean;
  status: string;
}

export interface MissionCancelErrorPayload {
  error?: string;
  code?: string;
}

export class MissionCancelError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, opts: { status: number; code?: string }) {
    super(message);
    this.name = "MissionCancelError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

export function defaultPluginApiBase(): string {
  const fromEnv = process.env.UH_PLUGIN_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:9119/api/plugins/uh";
}

export async function cancelMissionRunViaPlugin(
  pluginApiBase: string,
  runId: string,
): Promise<MissionCancelResult> {
  const base = pluginApiBase.replace(/\/$/, "");
  const url = `${base}/runs/${encodeURIComponent(runId)}/cancel`;
  let resp: Response;
  try {
    resp = await fetch(url, { method: "POST" });
  } catch (err) {
    throw new MissionCancelError(
      `plugin cancel request failed: ${(err as Error).message}`,
      { status: 0 },
    );
  }
  let body: MissionCancelResult & MissionCancelErrorPayload = { ok: false, status: "unknown" };
  try {
    body = (await resp.json()) as MissionCancelResult & MissionCancelErrorPayload;
  } catch {}
  if (!resp.ok) {
    throw new MissionCancelError(body.error ?? `cancel failed (${resp.status})`, {
      status: resp.status,
      code: body.code,
    });
  }
  return { ok: body.ok === true, status: body.status ?? "cancelled" };
}

/** Request cancellation from the owning CLI; no plugin, PID guessing or unrelated resource sweep. */
export async function cancelLocalMissionRun(root: string, missionId: string, runId: string): Promise<MissionCancelResult> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const directory = path.join(root, ".harness", "missions", missionId, "runs", runId);
  const controlPath = path.join(directory, "runtime-control.json");
  // Unknown targets must not allocate a new attempt merely because cancellation was requested.
  await lstat(controlPath);
  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Mission artifact context unavailable");
  const readControl = async (): Promise<RuntimeControl | undefined> => {
    await assertWritableArtifact(artifacts.missionDir, controlPath);
    let control: RuntimeControl;
    try {
      control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8")));
    } catch {
      return undefined;
    }
    if (control.mission_id !== missionId || control.run_id !== runId) throw new Error("Runtime control identity mismatch");
    return control;
  };
  const canonicalSettled = async (): Promise<boolean> => {
    await assertWritableArtifact(artifacts.missionDir, artifacts.runtimeSessionPath);
    try {
      const session = RuntimeSessionSchema.parse(parse(await readFile(artifacts.runtimeSessionPath, "utf8")));
      if (session.mission_id !== missionId) throw new Error("Runtime session identity mismatch");
      return session.status === "succeeded" || session.status === "failed";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
      throw error;
    }
  };
  const deadline = Date.now() + 10_000;
  const requestPath = path.join(directory, "cancel-request.json");
  let requestWritten = false;
  while (Date.now() < deadline) {
    const control = await readControl();
    if (!control) {
      await delay(100);
      continue;
    }
    if (control.stop_code === "controller_lost") await reconcileRuntimeSettlement(root, missionId, runId);
    if (control.settlement_confirmed === false) throw new Error("Owned process-tree settlement is not confirmed");
    if (control.status !== "running" && await canonicalSettled()) return { ok: true, status: control.status };
    if (control.status === "running" && !requestWritten) {
      await assertWritableArtifact(artifacts.missionDir, requestPath);
      try {
        await writeFile(requestPath, JSON.stringify(RuntimeCancelRequestSchema.parse({
          schema_version: "uh.runtime-cancel-request.v0", mission_id: missionId, run_id: runId,
          requested_at: new Date().toISOString(),
        })), { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const request = RuntimeCancelRequestSchema.parse(JSON.parse(await readFile(requestPath, "utf8")));
        if (request.mission_id !== missionId || request.run_id !== runId) throw new Error("Cancellation request identity mismatch");
      }
      requestWritten = true;
    }
    if (Date.now() - Date.parse(control.heartbeat_at) > 10_000) throw new Error("Runtime controller heartbeat is stale; cancellation is not confirmed");
    await delay(100);
  }
  throw new Error("Cancellation requested but runtime settlement was not observed");
}
