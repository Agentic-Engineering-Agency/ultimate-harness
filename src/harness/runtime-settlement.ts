import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { relativeArtifactPath } from "./artifact-paths.js";
import { parse, stringify } from "yaml";
import { RuntimeControlSchema } from "../schema/runtime-control.js";
import { RuntimeResultSchema, RuntimeSessionSchema } from "../schema/artifacts.js";
import { assertWritableArtifact, getMissionArtifactContext } from "../adapters/_artifact-context.js";
import { assertSafeMissionId } from "./mission.js";
import { appendRunsIndexEntry, assertValidRunId, mirrorRuntimeResultToLatest, writeLatestPointer } from "./run-id.js";
import { withArtifactTransaction, writeAtomicArtifact } from "./artifact-transaction.js";
import { settleLiveRun } from "./live-runs.js";

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
  }
  return settled;
}
