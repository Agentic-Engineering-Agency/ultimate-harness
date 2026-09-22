import path from "node:path";
import { z } from "zod";
import {
  defaultProcessLister,
  discoverRuns,
  findProjectRoot,
  liveness,
  type LivenessVerdict,
  type NativeProcess,
} from "./live-runs.js";
import { runRootForRecord } from "./mission-cancel.js";
import { getMissionArtifactContext, writeArtifactFile } from "../adapters/_artifact-context.js";
import { assertValidRunId, generateRunId } from "./run-id.js";
import type { ResumeOrigin } from "./runtime-recovery.js";

/**
 * UH steer / resume — message a running worker across a stop and a restart.
 *
 * A worker can be stopped but, until now, could not be nudged: its only mid-run
 * control was `uh kill`. Command Code (and oh-my-pi and Claude Code) accept
 * `--resume <session-id>`, and the adapters already implement `resume_from_run`
 * with recovery notes. Steering is therefore: stop the run cleanly, then resume
 * its native session with the operator's message injected as the first
 * instruction of the resumed turn.
 *
 * `uh steer` costs a stop and a restart of the native session — it is not a
 * live channel — but the transcript and the prior work are preserved through
 * the native resume.
 *
 * This module is deliberately free of CLI and adapter wiring: it resolves a run
 * through the same discovery `uh ps` uses, refuses the cases it cannot honor,
 * and delegates the actual re-execution to an injected runner.
 */

/** Runtimes with a native session resume path. */
export const RESUMABLE_RUNTIMES = ["oh-my-pi", "command-code", "claude-code"] as const;

export function runtimeSupportsResume(runtime: string): boolean {
  return (RESUMABLE_RUNTIMES as readonly string[]).includes(runtime);
}

export class UnsupportedResumeError extends Error {
  readonly runtime: string;

  constructor(runtime: string) {
    super(`unsupported: ${runtime} has no session resume`);
    this.name = "UnsupportedResumeError";
    this.runtime = runtime;
  }
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

/**
 * The operator-authored lineage of a resume, written in both directions:
 * `resumed_from` on the new run, `resumed_by` on the source run.
 */
export const ResumeLinkSchema = z
  .object({
    schema_version: z.literal("uh.resume-link.v0"),
    mission_id: z.string().min(1),
    run_id: z.string().min(1),
    runtime: z.string().min(1),
    resume_origin: z.literal("operator"),
    resumed_from: z.string().min(1).optional(),
    resumed_by: z.string().min(1).optional(),
    report: z.boolean().default(false),
    created_at: z.string().min(1),
  })
  .strict();
export type ResumeLink = z.infer<typeof ResumeLinkSchema>;

/** A discovered run resolved to everything a resume needs. */
export interface ResumableRun {
  runId: string;
  missionId: string;
  runtime: string;
  /** Absolute artifact root that owns the source run; the new run lands here. */
  artifactRoot: string;
  missionPath: string;
  sessionId?: string;
  stopCode?: string;
  status?: string;
  liveness: LivenessVerdict;
}

/** What the injected runner is asked to execute for one resumed attempt. */
export interface ResumeRequest {
  artifactRoot: string;
  missionId: string;
  missionPath: string;
  runtime: string;
  sourceRunId: string;
  /** The new attempt's run id. */
  runId: string;
  /** Notes injected as the first instruction of the resumed turn. */
  recoveryNotes: string;
  report: boolean;
}

export interface ResumeResult {
  runId: string;
  sourceRunId: string;
  missionId: string;
  runtime: string;
  report: boolean;
  cancelled: boolean;
  origin: ResumeOrigin;
}

export interface ResolveRunDeps {
  processes?: NativeProcess[];
  now?: number;
}

export interface SteerDeps {
  run: (request: ResumeRequest) => Promise<{ runId?: string }>;
  cancel: (root: string, missionId: string, runId: string) => Promise<{ ok: boolean; status: string }>;
  processes?: NativeProcess[];
  now?: number;
  newRunId?: () => string;
}

/**
 * Resolve a run id (exact or a unique prefix) through the live-run registry and
 * the bounded harness scan, so a team worker's artifact root is never something
 * the operator has to type.
 */
export async function resolveResumableRun(
  root: string,
  runRef: string,
  deps: ResolveRunDeps = {},
): Promise<ResumableRun> {
  assertValidRunId(runRef);
  const projectRoot = (await findProjectRoot(root)) ?? path.resolve(root);
  const runs = await discoverRuns(projectRoot, { includeSettled: true, persist: false });
  const exact = runs.find((record) => record.run_id === runRef);
  const matches = exact ? [exact] : runs.filter((record) => record.run_id.startsWith(runRef));
  if (matches.length === 0) throw new Error(`run ${runRef} was not found from ${projectRoot}`);
  if (matches.length > 1) {
    throw new Error(`run reference ${runRef} is ambiguous: ${matches.map((record) => record.run_id).join(", ")}`);
  }
  const record = matches[0]!;
  const artifactRoot = runRootForRecord(projectRoot, record);
  const processes = deps.processes ?? (await defaultProcessLister());
  const now = deps.now ?? Date.now();
  return {
    runId: record.run_id,
    missionId: record.mission_id,
    runtime: record.runtime,
    artifactRoot,
    missionPath: path.join(artifactRoot, ".harness", "missions", record.mission_id, "mission.yaml"),
    ...(record.session_id !== undefined ? { sessionId: record.session_id } : {}),
    ...(record.stop_code !== undefined ? { stopCode: record.stop_code } : {}),
    ...(record.status !== undefined ? { status: record.status } : {}),
    liveness: liveness(record, processes, { now }),
  };
}

export function assertResumableRuntime(runtime: string): void {
  if (!runtimeSupportsResume(runtime)) throw new UnsupportedResumeError(runtime);
}

/** A resume only ever overlays a settled attempt. A live one is steered instead. */
function assertSettledForResume(target: ResumableRun): void {
  if (target.liveness === "settled") return;
  if (target.liveness === "live") {
    throw new Error(
      `run ${target.runId} is still live; use "uh steer ${target.runId} \\"<message>\\"" to message it, or wait for it to settle`,
    );
  }
  throw new Error(`run ${target.runId} is ${target.liveness}; settle it before resuming (uh kill ${target.runId})`);
}

/**
 * Start a new run for the same mission, in the same artifact root and sandbox,
 * bound to `resume_from_run`. Records the operator lineage in both directions.
 */
async function performResume(
  target: ResumableRun,
  options: { notes: string; report: boolean; cancelled: boolean },
  deps: SteerDeps,
): Promise<ResumeResult> {
  const runId = (deps.newRunId ?? generateRunId)();
  assertValidRunId(runId);
  const outcome = await deps.run({
    artifactRoot: target.artifactRoot,
    missionId: target.missionId,
    missionPath: target.missionPath,
    runtime: target.runtime,
    sourceRunId: target.runId,
    runId,
    recoveryNotes: options.notes,
    report: options.report,
  });
  const finalRunId = outcome?.runId ?? runId;
  await recordResumeLinks(target, finalRunId, options.report);
  return {
    runId: finalRunId,
    sourceRunId: target.runId,
    missionId: target.missionId,
    runtime: target.runtime,
    report: options.report,
    cancelled: options.cancelled,
    origin: "operator",
  };
}

async function recordResumeLinks(target: ResumableRun, newRunId: string, report: boolean): Promise<void> {
  const newArtifacts = await getMissionArtifactContext(target.artifactRoot, target.missionPath, newRunId);
  const sourceArtifacts = await getMissionArtifactContext(target.artifactRoot, target.missionPath, target.runId);
  if (!newArtifacts || !sourceArtifacts) {
    throw new Error(`mission ${target.missionId} is not a canonical UH artifact directory; cannot record the resume link`);
  }
  const createdAt = new Date().toISOString();
  const forward = ResumeLinkSchema.parse({
    schema_version: "uh.resume-link.v0",
    mission_id: target.missionId,
    run_id: newRunId,
    runtime: target.runtime,
    resume_origin: "operator",
    resumed_from: target.runId,
    report,
    created_at: createdAt,
  });
  const backward = ResumeLinkSchema.parse({
    schema_version: "uh.resume-link.v0",
    mission_id: target.missionId,
    run_id: target.runId,
    runtime: target.runtime,
    resume_origin: "operator",
    resumed_by: newRunId,
    report,
    created_at: createdAt,
  });
  await writeArtifactFile(newArtifacts.missionDir, path.join(newArtifacts.runDir, "resume-link.json"), JSON.stringify(forward, null, 2));
  await writeArtifactFile(sourceArtifacts.missionDir, path.join(sourceArtifacts.runDir, "resume-link.json"), JSON.stringify(backward, null, 2));
}

export interface ResumeOptions {
  notes?: string;
}

/**
 * `uh resume` — continue a settled run's native session as a new attempt.
 * Refuses a live run (steer it), an ambiguous reference, and a runtime with no
 * session resume.
 */
export async function resumeRun(
  root: string,
  runRef: string,
  options: ResumeOptions,
  deps: SteerDeps,
): Promise<ResumeResult> {
  const target = await resolveResumableRun(root, runRef, resolveDeps(deps));
  assertResumableRuntime(target.runtime);
  assertSettledForResume(target);
  const notes = (options.notes ?? "").trim() || DEFAULT_OPERATOR_RESUME_NOTE;
  return performResume(target, { notes, report: false, cancelled: false }, deps);
}

export interface SteerOptions {
  report?: boolean;
}

/**
 * `uh steer` — cancel a run through the standard cancel path, then resume its
 * native session with `message` as the recovery notes. Costs a stop and a
 * restart of the native session.
 */
export async function steerRun(
  root: string,
  runRef: string,
  message: string,
  options: SteerOptions,
  deps: SteerDeps,
): Promise<ResumeResult> {
  const target = await resolveResumableRun(root, runRef, resolveDeps(deps));
  assertResumableRuntime(target.runtime);
  if (message.trim().length === 0) throw new Error("steer requires a non-empty message");
  const report = options.report === true;
  let cancelled = false;
  if (target.liveness !== "settled") {
    await deps.cancel(root, target.missionId, target.runId);
    cancelled = true;
  }
  return performResume(target, { notes: steerNotes(message, report), report, cancelled }, deps);
}

function resolveDeps(deps: SteerDeps): ResolveRunDeps {
  return {
    ...(deps.processes !== undefined ? { processes: deps.processes } : {}),
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  };
}
