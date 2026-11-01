import { lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertWritableArtifact, type MissionArtifactContext } from "../adapters/_artifact-context.js";
import { claimLiveRun } from "./live-runs.js";

/** Run ids are immutable attempt identities, including failed and interrupted attempts. */
export async function claimRuntimeAttempt(artifacts: MissionArtifactContext): Promise<void> {
  for (const file of [artifacts.runtimeSessionPath, artifacts.runtimeResultPath, artifacts.stdoutPath, artifacts.eventsPath]) {
    try {
      await lstat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Run already contains evidence: ${artifacts.runDir}. Resume using a new run id.`);
  }
  const claim = path.join(artifacts.runDir, ".attempt.claim");
  await assertWritableArtifact(artifacts.missionDir, claim);
  // Never remove this marker: even initialization failure consumes the attempt identity.
  await writeFile(claim, "", { flag: "wx" });
  // Make the attempt discoverable from the project root. A registry write
  // failure must never abort a run, so it is best-effort.
  try {
    await claimLiveRun(artifacts);
  } catch {
    // ignored: the run is still valid, it just will not appear in `uh ps`.
  }
}
