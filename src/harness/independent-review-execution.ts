import path from "node:path";
import { realpath } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import type { MissionDocument } from "../schema/mission.js";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { loadMissionFile } from "./capabilities.js";

/** Assignment/session guard, not an OS filesystem or network isolation boundary. */
export async function assertIndependentReviewExecution(root: string, missionPath: string, mission: MissionDocument, options: {
  canonicalRoot: string; runtime: string; model?: string; resumeSession?: string; resumeFromRun?: string;
  extraArgs?: string[]; memoryEnabled?: boolean; extensionsEnabled?: boolean; skillsEnabled?: boolean;
}): Promise<string | undefined> {
  const executionRoot = await realpath(root);
  const canonicalRoot = await realpath(options.canonicalRoot);
  let canonical = mission;
  if (executionRoot !== canonicalRoot) {
    const canonicalPath = path.resolve(canonicalRoot, path.relative(root, missionPath));
    await assertWritableArtifact(path.join(canonicalRoot, ".harness", "missions", mission.id), canonicalPath);
    canonical = await loadMissionFile(canonicalPath);
  }
  const binding = canonical.independent_review;
  if (!binding && !mission.independent_review) return undefined;
  if (!binding || !isDeepStrictEqual(canonical, mission)) throw new Error("Independent review contract differs from its canonical mission");
  if (executionRoot === canonicalRoot) throw new Error("Independent review requires a separate UH workspace");
  if (options.runtime !== binding.runtime || options.model !== binding.model) throw new Error("Independent reviewer runtime/model assignment mismatch");
  if (options.resumeSession || options.resumeFromRun) throw new Error("Independent review requires a fresh session, not a resume");
  if (options.extraArgs?.length) throw new Error("Independent review does not accept free-form runtime arguments");
  if (options.memoryEnabled || options.extensionsEnabled || options.skillsEnabled) throw new Error("Independent review requires shared memory, extensions, and skills disabled");
  if (canonical.sandbox?.promotion_policy !== "human-approved") throw new Error("Independent review requires human acceptance");
  return binding.request_sha256;
}
