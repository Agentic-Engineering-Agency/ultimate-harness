import { validateMission } from "../schema/mission.js";
import { runtimeRegistry } from "./registry.js";
import { mergeRuntimeConfigOverrides } from "./runtime-config-overrides.js";
import { lstat, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { RuntimeControlSchema, RuntimeRecoveryPolicySchema, RuntimeRecoveryRecordSchema, RuntimeSteerRequestSchema, type RuntimeControl, type RuntimeSteerRequest } from "../schema/runtime-control.js";
import { RuntimeSessionSchema, RuntimeResultSchema } from "../schema/artifacts.js";
import { assertSafeMissionId } from "./mission.js";
import { assertValidRunId, generateRunId } from "./run-id.js";
import { getMissionArtifactContext, assertWritableArtifact, writeArtifactFile, type MissionArtifactContext } from "../adapters/_artifact-context.js";
import { reconcileRuntimeSettlement } from "./runtime-settlement.js";

/** Who authorized a resume: an operator command, or the mission's automatic policy. */
export type ResumeOrigin = "operator" | "policy";

/**
 * Whether a resume consumes the policy's automatic `max_resumes` budget.
 * Operator-initiated resumes are authorized outside the loop and never do.
 */
export function resumeConsumesBudget(origin: ResumeOrigin): boolean {
  return origin !== "operator";
}

/** Automatic resume budget left after prior resumes, counting only budget-consuming ones. */
export function remainingResumeBudget(maxResumes: number, origins: readonly ResumeOrigin[]): number {
  return Math.max(0, maxResumes - origins.filter(resumeConsumesBudget).length);
}

/**
 * The fixed status-report request `uh steer --report` injects before the
 * operator's message, so a nudge always yields the same shape of answer.
 */
export const REPORT_REQUEST = `Before anything else, write a status report for the operator in exactly this shape:
1. Done so far
2. In progress
3. Blocked on
4. Next three actions
5. Files touched
Write the report first, then continue your work.`;

/** Default instruction for an operator resume that supplied no `--notes`. */
export const DEFAULT_OPERATOR_RESUME_NOTE =
  "Resume the saved session and continue the mission from where the previous attempt stopped.";

/** Compose the note injected into a resumed turn; `--report` prepends the fixed request. */
export function steerNotes(message: string, report: boolean): string {
  const trimmed = message.trim();
  if (!report) return trimmed;
  return trimmed.length === 0 ? REPORT_REQUEST : `${REPORT_REQUEST}\n\n${trimmed}`;
}

export interface RuntimeResume {
  sourceRunId: string;
  sessionId: string;
  notes: string;
  sourceStopCode?: RuntimeControl["stop_code"];
  sourceStopReason?: string;
  grace?: boolean;
  /** Who authorized this resume; operator resumes never spend the automatic budget. */
  origin?: ResumeOrigin;
}

/** A preserved transcript is not permission to overlap or replay an unsettled attempt. */
export async function prepareRuntimeResume(root: string, missionId: string, runId: string, runtime: string, notes: string, origin: ResumeOrigin = "policy"): Promise<RuntimeResume> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const suppliedNotes = notes.trim();
  if (!suppliedNotes) notes = "No additional deadline policy notes.";
  if (!notes.trim()) throw new Error("Resuming requires explicit recovery notes");
  const controlPath = path.join(root, ".harness", "missions", missionId, "runs", runId, "runtime-control.json");
  await lstat(controlPath);
  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) throw new Error("Recovery source artifact context unavailable");
  for (const file of [controlPath, artifacts.runtimeSessionPath, artifacts.runtimeResultPath]) await assertWritableArtifact(artifacts.missionDir, file);
  const control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8")));
  if (control.mission_id !== missionId || control.run_id !== runId || control.runtime !== runtime) throw new Error("Recovery source identity mismatch");
  if (control.stop_code === "controller_lost") await reconcileRuntimeSettlement(root, missionId, runId);
  const session = RuntimeSessionSchema.parse(parse(await readFile(artifacts.runtimeSessionPath, "utf8")));
  const result = RuntimeResultSchema.parse(parse(await readFile(artifacts.runtimeResultPath, "utf8")));
  if (session.mission_id !== missionId || session.runtime !== runtime || result.mission_id !== missionId || result.runtime !== runtime) {
    throw new Error("Recovery source identity mismatch");
  }
  if (control.status === "running" || session.status === "running" || session.status === "planned") throw new Error("Previous attempt must be fully settled before resuming");
  if (control.stop_code === "policy" || control.stop_code === "route_mismatch" || control.stop_code === "route_unverified") throw new Error("Policy-stopped attempts cannot be automatically resumed");
  if (!control.session_id) throw new Error("Previous attempt did not record a native session id; refusing to restart from scratch");
  const sourceStopReason = control.stop_reason ?? control.stop_code;
  const grace = control.stop_code === "deadline";
  const combinedNotes = grace
    ? `${notes}\nYour time budget is exhausted. Write your deliverable now with everything you have found so far. Mark it clearly as INCOMPLETE at the top, and end it with a section titled "Missing for the next step" listing what you did not get to and where you stopped. Do not start new investigation. Then stop.`
    : `${notes}\nYou were stopped: ${sourceStopReason}. Do not repeat that action. Inspect existing outputs before continuing.`;
  return { sourceRunId: runId, sessionId: control.session_id, notes: combinedNotes, sourceStopCode: control.stop_code, sourceStopReason, grace, origin };
}

/**
 * The `uh steer` request written next to a run's `runtime-control.json`, if one
 * is pending, deleted once read so a controller can never replay it.
 */
export async function consumeSteerRequest(root: string, missionId: string, runId: string): Promise<RuntimeSteerRequest | undefined> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const requestPath = path.join(root, ".harness", "missions", missionId, "runs", runId, "steer-request.json");
  let raw: string;
  try {
    raw = await readFile(requestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const request = RuntimeSteerRequestSchema.parse(JSON.parse(raw));
  if (request.mission_id !== missionId || request.run_id !== runId) throw new Error("Steer request identity mismatch");
  await rm(requestPath, { force: true });
  return request;
}

/**
 * Label a stopped attempt `steered`: its control receipt records the operator
 * identity rather than the transient stop that ended it. Idempotent and
 * best-effort — a missing or unreadable receipt is left untouched.
 */
export async function markAttemptSteered(root: string, missionId: string, runId: string, message: string): Promise<void> {
  assertSafeMissionId(missionId);
  assertValidRunId(runId);
  const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", missionId, "mission.yaml"), runId);
  if (!artifacts) return;
  const controlPath = path.join(artifacts.runDir, "runtime-control.json");
  let control: RuntimeControl;
  try {
    control = RuntimeControlSchema.parse(JSON.parse(await readFile(controlPath, "utf8")));
  } catch {
    return;
  }
  if (control.mission_id !== missionId || control.run_id !== runId) return;
  const firstLine = message.trim().split(/\r?\n/, 1)[0]?.slice(0, 200) ?? "";
  const rewritten: RuntimeControl = { ...control, stop_code: "steered", stop_reason: `Steered by the controller: ${firstLine}` };
  await writeArtifactFile(artifacts.missionDir, controlPath, JSON.stringify(rewritten));
}

export function recoveryPrompt(resume: RuntimeResume): string {
  return resume.grace
    ? `\n\n## Recovery of prior attempt ${resume.sourceRunId}\n${resume.notes}\n`
    : `\n\n## Recovery of prior attempt ${resume.sourceRunId}\nContinue the saved native session. Inspect existing outputs and prior tool results; do not repeat completed work.\n${resume.notes}\n`;
}

export interface RecoverableRuntimeResult {
  runId?: string;
  result?: { status?: string };
}
export interface RecoveryRunOptions {
  runId: string;
  extraRuntimeConfigOverrides?: Record<string, unknown>;
}

/** Own the bounded recovery loop within the invoking CLI, not a detached second controller. */
export async function runWithRuntimeRecovery<T extends RecoverableRuntimeResult>(input: {
  root: string;
  missionId: string;
  runtime: string;
  runId: string;
  recovery?: unknown;
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  cancellationSignal?: AbortSignal;
  onAttempt?: (runId: string) => Promise<void>;
  /**
   * Resumes that already produced the attempt this loop starts from. Operator
   * resumes are free: they never reduce the automatic `max_resumes` budget.
   */
  priorResumeOrigins?: readonly ResumeOrigin[];
  run: (options: RecoveryRunOptions) => Promise<T>;
}): Promise<T> {
  const policy = input.recovery === undefined ? undefined : RuntimeRecoveryPolicySchema.parse(input.recovery);
  if (policy && !["oh-my-pi", "command-code", "claude-code"].includes(input.runtime)) throw new Error("This runtime does not implement native bounded session recovery");
  let runId = input.runId;
  let overrides = input.extraRuntimeConfigOverrides;
  let graceAttempted = false;
  // Prior resumes already spent part of the budget; operator resumes spent none.
  for (let resumed = (input.priorResumeOrigins ?? []).filter(resumeConsumesBudget).length; ; resumed++) {
    await input.onAttempt?.(runId);
    let result = await input.run({ runId, extraRuntimeConfigOverrides: overrides });
    // A `uh steer` request is an operator message to a live attempt. The
    // controller stops the steered attempt and resumes its native session with
    // the message as the first instruction. It is free: it never spends the
    // automatic `max_resumes` budget and works without a recovery policy.
    for (;;) {
      if (input.cancellationSignal?.aborted) return result;
      const steer = await consumeSteerRequest(input.root, input.missionId, runId);
      if (!steer || result.result?.status === "passed") break;
      const notes = steerNotes(steer.message, steer.report);
      try {
        await prepareRuntimeResume(input.root, input.missionId, runId, input.runtime, notes, "operator");
      } catch {
        // The attempt cannot be resumed (for example a concurrent policy stop);
        // it is left settled rather than relabelled or restarted from scratch.
        break;
      }
      await markAttemptSteered(input.root, input.missionId, runId, steer.message);
      overrides = { ...input.extraRuntimeConfigOverrides, resume_session: undefined, resume_from_run: runId, recovery_notes: notes };
      runId = generateRunId();
      await input.onAttempt?.(runId);
      result = await input.run({ runId, extraRuntimeConfigOverrides: overrides });
    }
    if (!policy || input.cancellationSignal?.aborted || result.result?.status === "passed") return result;
    const control = RuntimeControlSchema.parse(JSON.parse(await readFile(path.join(input.root, ".harness", "missions", input.missionId, "runs", runId, "runtime-control.json"), "utf8")));
    if (graceAttempted) return result;
    if (policy.on_deadline && control.stop_code === "deadline" && control.session_id) {
      const notes = policy.on_deadline.notes ?? policy.notes;
      await prepareRuntimeResume(input.root, input.missionId, runId, input.runtime, notes);
      overrides = {
        ...input.extraRuntimeConfigOverrides,
        resume_session: undefined,
        resume_from_run: runId,
        recovery_notes: notes,
        recovery_grace: true,
      };
      runId = generateRunId();
      graceAttempted = true;
      continue;
    }
    if (resumed >= policy.max_resumes || !control.stop_code || !["startup", "stall", "timeout", "repeated_failure", "denial_budget"].includes(control.stop_code) || !control.session_id) return result;
    const resume = await prepareRuntimeResume(input.root, input.missionId, runId, input.runtime, policy.notes);
    overrides = { ...input.extraRuntimeConfigOverrides, resume_session: undefined, resume_from_run: runId, recovery_notes: policy.notes };
    runId = generateRunId();
  }
}

export async function persistRuntimeRecovery(artifacts: MissionArtifactContext, resume: RuntimeResume): Promise<void> {
  const record = RuntimeRecoveryRecordSchema.parse({
    schema_version: "uh.runtime-recovery.v0", source_run_id: resume.sourceRunId,
    session_id: resume.sessionId, notes: resume.notes,
    source_stop_code: resume.sourceStopCode, source_stop_reason: resume.sourceStopReason,
    grace: resume.grace ?? false,
  });
  await writeArtifactFile(artifacts.missionDir, path.join(artifacts.runDir, "runtime-recovery.json"), JSON.stringify(record, null, 2));
}

export async function resolveRuntimeRecoveryPolicy(root: string, missionPath: string, runtime: string, overrides?: Record<string, unknown>) {
  const mission = validateMission(parse(await readFile(missionPath, "utf8")));
  const adapter = (await runtimeRegistry.load(root, runtime)).document;
  const config = { ...adapter.config?.runtime_config, ...mergeRuntimeConfigOverrides(mission, overrides) };
  return { missionId: mission.id, recovery: config.recovery };
}
