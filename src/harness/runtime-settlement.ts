import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { relativeArtifactPath } from "./artifact-paths.js";
import { parse, stringify } from "yaml";
import { RuntimeControlSchema, type RuntimeControl, type RuntimeStopCode } from "../schema/runtime-control.js";
import { RuntimeResultSchema, type RuntimeResultDocument, type RuntimeResultStatus, RuntimeSessionSchema } from "../schema/artifacts.js";
import { assertWritableArtifact, getMissionArtifactContext } from "../adapters/_artifact-context.js";
import { assertSafeMissionId } from "./mission.js";
import { appendRunsIndexEntry, assertValidRunId, mirrorRuntimeResultToLatest, writeLatestPointer } from "./run-id.js";
import { withArtifactTransaction, writeAtomicArtifact } from "./artifact-transaction.js";
import { settleLiveRun } from "./live-runs.js";
import { elapsedMs, notifyRunSettled } from "./notifications.js";

/** Reconcile a guardian's confirmed owner-loss receipt; never infer termination from a stale heartbeat. */
export async function reconcileRuntimeSettlement(root: string, missionId: string, runId: string): Promise<boolean> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const controlPath = path.join(root, ".harness", "missions", missionId, "runs", runId, "runtime-control.json");
  try { await lstat(controlPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Settlement artifact context unavailable");
  await assertWritableArtifact(artifacts.missionDir, controlPath);
  const control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8")));
  if (control.mission_id !== missionId || control.run_id !== runId) throw new Error("Settlement receipt identity mismatch");
  if (control.status !== "failed" || control.stop_code !== "controller_lost" || control.settlement_confirmed !== true) return false;
  const settled = await withArtifactTransaction(path.join(artifacts.runDir, "runtime-settlement"), async () => {
    for (const file of [artifacts.runtimeSessionPath, artifacts.runtimeResultPath]) await assertWritableArtifact(artifacts.missionDir, file);
    let session;
    try { session = RuntimeSessionSchema.parse(parse(await readFile(artifacts.runtimeSessionPath, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    if (session.mission_id !== missionId || session.runtime !== control.runtime) throw new Error("Settlement session identity mismatch");
    if (session.status === "succeeded") throw new Error("Settlement conflicts with an already succeeded session");
    let result;
    try {
      result = RuntimeResultSchema.parse(parse(await readFile(artifacts.runtimeResultPath, "utf8")));
      if (result.mission_id !== missionId || result.runtime !== control.runtime || result.status !== "failed") throw new Error("Settlement conflicts with existing terminal evidence");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const finishedAt = result?.finished_at ?? control.heartbeat_at;
    result ??= RuntimeResultSchema.parse({
      schema_version: "uh.runtime-result.v0", mission_id: missionId, runtime: control.runtime,
      status: "failed", started_at: control.started_at, finished_at: finishedAt, exit_code: 125,
      prompt_path: relativeArtifactPath(root, artifacts.promptPath), stdout_path: relativeArtifactPath(root, artifacts.stdoutPath),
      stderr_path: relativeArtifactPath(root, artifacts.stderrPath), errors: ["Runtime controller exited before canonical settlement"],
      notes: "Owned process-tree termination was confirmed by the native guardian. Preserved transcripts may contain partial usage; missing usage is unknown, not zero.",
    });
    await writeAtomicArtifact(artifacts.runtimeResultPath, stringify(result));
    await writeAtomicArtifact(artifacts.runtimeSessionPath, stringify(RuntimeSessionSchema.parse({
      ...session, status: "failed", exit_code: result.exit_code ?? 125, finished_at: finishedAt,
    })));
    await appendRunsIndexEntry(root, missionId, { run_id: runId, runtime: control.runtime,
      started_at: control.started_at, finished_at: finishedAt, status: "failed" });
    await writeLatestPointer(root, missionId, { schema_version: "uh.latest-run.v0", run_id: runId,
      started_at: control.started_at, finished_at: finishedAt, status: "failed" });
    await mirrorRuntimeResultToLatest(root, missionId, runId);
    return true;
  });
  if (settled) {
    // Keep the project-root live-run registry in step with the canonical settlement.
    await settleLiveRun(root, runId, {
      status: "failed",
      stop_code: "controller_lost",
      settled_at: new Date().toISOString(),
    }).catch(() => undefined);
    notifyRunSettled(root, {
      run_id: runId,
      mission: missionId,
      runtime: control.runtime,
      status: "failed",
      stop_code: "controller_lost",
      duration_ms: elapsedMs(control.started_at, control.heartbeat_at),
      run_dir: path.dirname(controlPath),
    });
  }
  return settled;
}

/** Whether a runtime-result status contradicts the terminal control receipt. */
function resultStatusAgreesWithControl(controlStatus: RuntimeControl["status"], resultStatus: RuntimeResultStatus): boolean {
  if (controlStatus === resultStatus) return true;
  // `blocked` is an exit-0 refinement (the runtime produced no parseable
  // final block) that the control receipt cannot express, so a control
  // receipt of `passed` does not contradict a `blocked` result.
  return controlStatus === "passed" && resultStatus === "blocked";
}

/** Which native budget a terminal event exhausted. */
export type NativeBudgetCap = "turn" | "time";

export interface NativeCapSettlementInput {
  /** The native budget the terminal event exhausted. */
  cap: NativeBudgetCap;
  /** The raw native stop reason (`max_turns`, `max_time`, `timeout` …). */
  reason: string;
  /** The attempt is the single deadline grace delivery attempt. */
  grace: boolean;
  /** The attempt produced its deliverable (a non-empty final message). */
  deliverable: boolean;
  /** Turn count the terminal event named, when known. */
  turns?: number;
}

export interface NativeCapSettlement {
  status: RuntimeResultStatus;
  stopCode: RuntimeStopCode;
  /** Stop reason text; for a turn cap it names the cap and the turn count. */
  reason: string;
  /** True when the cap is the expected end of the deadline grace attempt. */
  graceExpectedEnd: boolean;
}

/**
 * Settle an attempt that ended on a native budget cap.
 *
 * A native cap is never a natural end. Outside deadline grace the attempt
 * settles `failed` even when the model emitted a final message or the
 * final-message sentinel, with the existing `turn_limit`/`timeout` stop code
 * and reason — completion requires a natural end, not a cap. The single
 * deadline grace attempt runs under a native cap of `grace_turns + 1`, so its
 * cap is the expected end: it settles by its deliverable (`passed` when one is
 * present, else `failed`) with stop code `deadline`, never `turn_limit`.
 */
export function settleNativeCap(input: NativeCapSettlementInput): NativeCapSettlement {
  const reason = input.cap === "turn"
    ? `Native turn cap (${input.reason}) reached${input.turns === undefined ? "" : ` after ${input.turns} turns`}`
    : `Native time cap (${input.reason}) reached`;
  if (input.grace) {
    return { status: input.deliverable ? "passed" : "failed", stopCode: "deadline", reason, graceExpectedEnd: true };
  }
  return { status: "failed", stopCode: input.cap === "turn" ? "turn_limit" : "timeout", reason, graceExpectedEnd: false };
}

/**
 * Rewrite a run's control receipt to a native-cap settlement.
 *
 * A settled control receipt is the run's authoritative terminal fact, so the
 * deadline grace attempt records `stop_code: deadline` with the status its
 * deliverable earned instead of the launcher exit code that ended it.
 * Best-effort: a missing receipt is left untouched.
 */
export async function reconcileNativeCapSettlement(root: string, missionId: string, runId: string, settlement: NativeCapSettlement): Promise<boolean> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const controlPath = path.join(root, ".harness", "missions", missionId, "runs", runId, "runtime-control.json");
  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) return false;
  let control: RuntimeControl;
  try { control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8"))); }
  catch { return false; }
  if (control.mission_id !== missionId || control.run_id !== runId) return false;
  const rewritten: RuntimeControl = {
    ...control,
    status: settlement.status,
    stop_code: settlement.stopCode,
    stop_reason: settlement.reason,
  };
  await withArtifactTransaction(path.join(artifacts.runDir, "runtime-settlement"), async () => {
    await assertWritableArtifact(artifacts.missionDir, controlPath);
    await writeAtomicArtifact(controlPath, JSON.stringify(rewritten));
  });
  return true;
}

/**
 * End-of-run consistency gate: runtime-result.yaml and the
 * runtime-control.json receipt must agree on the terminal status of a run.
 *
 * When they disagree, a `settlement_conflict` record carrying both values is
 * appended to the result's errors. A confirmed settlement
 * (`settlement_confirmed: true` on the control receipt) outranks the result:
 * the recorded status is rewritten to the control receipt's, a non-zero exit
 * on a confirmed `passed` settlement is annotated with
 * `exit_code_ignored_reason` instead of overturning the settlement, and a
 * non-zero exit is forced when the confirmed settlement failed or cancelled
 * the run with a zero exit recorded. Without a confirmed settlement the
 * result is never rewritten — a stale or unowned control receipt must not
 * invent a termination (mirroring `reconcileRuntimeSettlement`). The
 * mission-level `runtime-result.yaml` mirror is refreshed when the rewritten
 * run is the latest pointer's run.
 *
 * Returns true when a conflict was detected and handled; false when the
 * artifacts are missing/unreadable or already agree. Best-effort by design:
 * callers must not fail a run because reconciliation itself failed.
 */
export async function reconcileRuntimeResultControl(root: string, missionId: string, runId: string): Promise<boolean> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const runDirectory = path.join(root, ".harness", "missions", missionId, "runs", runId);
  const controlPath = path.join(runDirectory, "runtime-control.json");
  const resultPath = path.join(runDirectory, "runtime-result.yaml");
  // Missing or unreadable evidence agrees trivially; never create artifacts here.
  for (const file of [controlPath, resultPath]) {
    try { await lstat(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }
  let control: RuntimeControl;
  try { control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8"))); }
  catch { return false; }
  if (control.status === "running") return false;
  let result: RuntimeResultDocument;
  try { result = RuntimeResultSchema.parse(parse(await readFile(resultPath, "utf8"))); }
  catch { return false; }
  if (resultStatusAgreesWithControl(control.status, result.status)) return false;

  const conflict = `settlement_conflict: runtime-result status=${result.status} exit_code=${result.exit_code ?? "unknown"};`
    + ` runtime-control status=${control.status} stop_code=${control.stop_code ?? "none"}`
    + ` settlement_confirmed=${control.settlement_confirmed === true}`;
  const confirmedSettlement = control.settlement_confirmed === true;
  const rewritten: RuntimeResultDocument = confirmedSettlement ? {
    ...result,
    status: control.status,
    ...((control.status === "passed" && (result.exit_code ?? 0) !== 0)
      ? { exit_code_ignored_reason: "runtime exited non-zero after completed native terminal event" as const }
      : {}),
    ...((control.status === "failed" || control.status === "cancelled") && result.exit_code === 0
      ? { exit_code: 1 }
      : {}),
    errors: [...result.errors, conflict],
  } : { ...result, errors: [...result.errors, conflict] };

  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Settlement artifact context unavailable");
  await withArtifactTransaction(path.join(artifacts.runDir, "runtime-settlement"), async () => {
    await assertWritableArtifact(artifacts.missionDir, resultPath);
    await writeAtomicArtifact(resultPath, stringify(rewritten));
  });
  // Keep the mission-level mirror agreeable when this run is the latest pointer's run.
  await mirrorRuntimeResultToLatest(root, missionId, runId).catch(() => undefined);
  return true;
}
