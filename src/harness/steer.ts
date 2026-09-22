import { lstat } from "node:fs/promises";
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
import { runtimeRegistry } from "./registry.js";
import { RuntimeSteerRequestSchema } from "../schema/runtime-control.js";
import {
  DEFAULT_OPERATOR_RESUME_NOTE,
  REPORT_REQUEST,
  steerNotes,
  type ResumeOrigin,
} from "./runtime-recovery.js";

export { DEFAULT_OPERATOR_RESUME_NOTE, REPORT_REQUEST, steerNotes };

/**
 * UH steer / resume — message a running worker across a stop and a restart.
 *
 * A worker can be stopped but, until now, could not be nudged: its only mid-run
 * control was `uh kill`. Command Code (and oh-my-pi and Claude Code) accept
 * `--resume <session-id>`, and the adapters already implement `resume_from_run`
 * with recovery notes. Steering is therefore: stop the run, then resume its
 * native session with the operator's message injected as the first instruction
 * of the resumed turn.
 *
 * A live run is steered by the controller that owns it: `uh steer` validates
 * everything first, writes a steer request next to the run's
 * `runtime-control.json`, and signals the attempt to stop. The controller's
 * recovery loop (`runWithRuntimeRecovery`) consumes that request, labels the
 * attempt `steered`, and resumes the same native session with the message — so
 * a team worker keeps running inside its team controller and is integrated
 * normally. Only when no live controller owns the run does steer fall back to
 * cancelling and resuming the session itself.
 *
 * `uh steer` still costs a stop and a restart of the native session — it is not
 * a live channel — but the transcript and the prior work are preserved through
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
  /**
   * The project root that owns `.harness/adapters`: the nearest ancestor of the
   * run's artifact scope holding an `.harness/adapters` directory. A team
   * worker's scope is nested far below it, so the adapter manifest is resolved
   * here, never from the scope.
   */
  adapterRoot: string;
  missionPath: string;
  sessionId?: string;
  stopCode?: string;
  status?: string;
  liveness: LivenessVerdict;
}

/** What the injected runner is asked to execute for one resumed attempt. */
export interface ResumeRequest {
  artifactRoot: string;
  /** Project root that owns `.harness/adapters` (and workflows). */
  adapterRoot: string;
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

/** Outcome of `uh steer`: the controller owns a live run, or the operator resumed it. */
export interface SteerResult {
  ok: boolean;
  mode: "controller" | "fallback";
  sourceRunId: string;
  missionId: string;
  runtime: string;
  report: boolean;
  /** The operator-started new run; present only for the fallback path. */
  runId?: string;
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
 * The nearest ancestor of `scope` that holds an `.harness/adapters` directory —
 * the project root that owns the adapter manifest. Team worker artifact scopes
 * live under `.harness/missions/<team>/team/artifacts/...`, so resolving from
 * the scope itself is how the manifest went missing.
 */
export async function resolveAdapterRoot(scope: string): Promise<string> {
  const start = path.resolve(scope);
  for (let dir = start; ; ) {
    try {
      const stat = await lstat(path.join(dir, ".harness", "adapters"));
      if (stat.isDirectory()) return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `no .harness/adapters directory found above ${start}; the adapter manifest cannot be resolved from the project root`,
  );
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
  const adapterRoot = await resolveAdapterRoot(artifactRoot);
  const processes = deps.processes ?? (await defaultProcessLister());
  const now = deps.now ?? Date.now();
  return {
    runId: record.run_id,
    missionId: record.mission_id,
    runtime: record.runtime,
    artifactRoot,
    adapterRoot,
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

/**
 * Validate everything a steer needs before anything is written: a non-empty
 * message, a runtime with a native resume path, a recorded native session id,
 * and an adapter manifest that resolves from the project root. Any failure
 * refuses and leaves the run untouched.
 */
export async function assertSteerable(target: ResumableRun, message: string): Promise<void> {
  if (message.trim().length === 0) throw new Error("steer requires a non-empty message");
  assertResumableRuntime(target.runtime);
  if (!target.sessionId) {
    throw new Error(`run ${target.runId} has no recorded native session id and cannot be steered; it would restart from scratch`);
  }
  try {
    await runtimeRegistry.load(target.adapterRoot, target.runtime);
  } catch (error) {
    throw new Error(
      `the ${target.runtime} adapter manifest does not resolve from the project root ${target.adapterRoot}: ${(error as Error).message}`,
    );
  }
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

/** Write the steer request next to the run's control file for its controller to consume. */
async function writeSteerRequest(target: ResumableRun, message: string, report: boolean): Promise<void> {
  const artifacts = await getMissionArtifactContext(target.artifactRoot, target.missionPath, target.runId);
  if (!artifacts) {
    throw new Error(`mission ${target.missionId} is not a canonical UH artifact directory; cannot write a steer request`);
  }
  const request = RuntimeSteerRequestSchema.parse({
    schema_version: "uh.runtime-steer-request.v0",
    mission_id: target.missionId,
    run_id: target.runId,
    message,
    report,
    requested_at: new Date().toISOString(),
  });
  await writeArtifactFile(artifacts.missionDir, path.join(artifacts.runDir, "steer-request.json"), JSON.stringify(request, null, 2));
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
    adapterRoot: target.adapterRoot,
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
 * `uh steer` — message a run. A live run is steered by its owning controller:
 * the request is written for the controller's recovery loop, which stops the
 * attempt (`steered`) and resumes the same native session. A run with no live
 * controller falls back to cancelling it here and resuming the session
 * directly. Everything is validated before the run is touched.
 */
export async function steerRun(
  root: string,
  runRef: string,
  message: string,
  options: SteerOptions,
  deps: SteerDeps,
): Promise<SteerResult> {
  const target = await resolveResumableRun(root, runRef, resolveDeps(deps));
  await assertSteerable(target, message);
  const report = options.report === true;
  if (target.liveness === "live") {
    await writeSteerRequest(target, message.trim(), report);
    // Signal the attempt to stop; the owning controller consumes the request
    // and resumes the session, so no new run is started here.
    await deps.cancel(root, target.missionId, target.runId);
    return { ok: true, mode: "controller", sourceRunId: target.runId, missionId: target.missionId, runtime: target.runtime, report };
  }
  const cancelled = target.liveness !== "settled";
  if (cancelled) await deps.cancel(root, target.missionId, target.runId);
  const resume = await performResume(target, { notes: steerNotes(message, report), report, cancelled }, deps);
  return {
    ok: true,
    mode: "fallback",
    sourceRunId: resume.sourceRunId,
    missionId: resume.missionId,
    runtime: resume.runtime,
    report,
    runId: resume.runId,
  };
}

function resolveDeps(deps: SteerDeps): ResolveRunDeps {
  return {
    ...(deps.processes !== undefined ? { processes: deps.processes } : {}),
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  };
}
