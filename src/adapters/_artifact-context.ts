import { appendFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { ensureRunDir } from "../harness/run-id.js";
import type { RuntimeSessionDocument } from "../schema/artifacts.js";

/**
 * Shared mission-artifact context + write helpers for runtime adapters.
 *
 * Every adapter (hermes, codex, oh-my-pi, hermes-proxy) persists its run
 * artifacts into `.harness/missions/<id>/runs/<run-id>/` through the exact
 * same path-safety guards and write helpers. This module is the single copy;
 * adapters import it instead of duplicating the block. Behaviour is identical
 * to the prior per-adapter copies — this is a pure extraction.
 */

export type MissionArtifactContext = {
  missionDir: string;
  runDir: string;
  promptPath: string;
  runtimeSessionPath: string;
  eventsPath: string;
  stdoutPath: string;
  stderrPath: string;
  diffPath: string;
  runtimeResultPath: string;
  finalMessagePath: string;
};

/**
 * Resolve (and create) the per-run artifact directory for a mission, returning
 * the absolute paths every adapter writes to. Returns `null` when `missionPath`
 * does not point at a `.harness/missions/<id>/mission.yaml` packet (e.g. an
 * ad-hoc mission file outside the harness tree). Throws when any path component
 * is a symlink or a non-directory — artifacts must never be written through a
 * symlinked harness/mission directory.
 */
export async function getMissionArtifactContext(
  root: string,
  missionPath: string,
  runId: string,
): Promise<MissionArtifactContext | null> {
  const rootResolved = path.resolve(root);
  const missionsRoot = path.join(rootResolved, ".harness", "missions");
  const resolvedMissionPath = path.isAbsolute(missionPath)
    ? path.resolve(missionPath)
    : path.resolve(rootResolved, missionPath);
  const relative = path.relative(missionsRoot, resolvedMissionPath);
  const parts = relative.split(path.sep);

  if (relative.startsWith("..") || path.isAbsolute(relative) || parts.length !== 2 || parts[1] !== "mission.yaml" || !parts[0]) {
    return null;
  }

  const harnessDir = path.join(rootResolved, ".harness");
  const harnessStat = await lstat(harnessDir);
  if (harnessStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked .harness directory: ${harnessDir}`);
  }
  if (!harnessStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory .harness path: ${harnessDir}`);
  }

  const missionsRootStat = await lstat(missionsRoot);
  if (missionsRootStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts through symlinked missions directory: ${missionsRoot}`);
  }
  if (!missionsRootStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts through non-directory missions path: ${missionsRoot}`);
  }

  const missionDir = path.join(missionsRoot, parts[0]);
  const missionDirStat = await lstat(missionDir);
  if (missionDirStat.isSymbolicLink()) {
    throw new Error(`Refusing to persist artifacts into symlinked mission directory: ${missionDir}`);
  }
  if (!missionDirStat.isDirectory()) {
    throw new Error(`Refusing to persist artifacts into non-directory mission path: ${missionDir}`);
  }

  // UH-82: per-run artifact directory. Created here so the subsequent
  // write helpers can target an existing dir.
  const runDir = await ensureRunDir(rootResolved, parts[0], runId);

  const context: MissionArtifactContext = {
    missionDir,
    runDir,
    promptPath: path.join(runDir, "prompt.md"),
    runtimeSessionPath: path.join(runDir, "runtime-session.yaml"),
    eventsPath: path.join(runDir, "events.ndjson"),
    stdoutPath: path.join(runDir, "runtime.stdout.log"),
    stderrPath: path.join(runDir, "runtime.stderr.log"),
    diffPath: path.join(runDir, "diff.patch"),
    runtimeResultPath: path.join(runDir, "runtime-result.yaml"),
    finalMessagePath: path.join(runDir, "runtime-final.txt"),
  };

  for (const artifactPath of [
    context.promptPath,
    context.runtimeSessionPath,
    context.eventsPath,
    context.stdoutPath,
    context.stderrPath,
    context.diffPath,
    context.runtimeResultPath,
    context.finalMessagePath,
  ]) {
    assertPathInsideMissionDir(missionDir, artifactPath);
  }

  return context;
}

/**
 * Guard before writing/overwriting an artifact: the target must be inside the
 * mission directory and must not be a symlink (refuse to follow it).
 */
export async function assertWritableArtifact(missionDir: string, artifactPath: string): Promise<void> {
  assertPathInsideMissionDir(missionDir, artifactPath);
  try {
    const stat = await lstat(artifactPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlinked artifact: ${artifactPath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

/** Refuse any artifact path that escapes the mission directory. */
export function assertPathInsideMissionDir(missionDir: string, artifactPath: string): void {
  const relative = path.relative(missionDir, path.resolve(artifactPath));
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error(`Refusing to write artifact outside mission directory: ${artifactPath}`);
  }
}

/** Write a single artifact file after the writability guard passes. */
export async function writeArtifactFile(missionDir: string, artifactPath: string, content: string): Promise<void> {
  await assertWritableArtifact(missionDir, artifactPath);
  await writeFile(artifactPath, content, "utf-8");
}

/** Persist the rendered prompt + the runtime-session document for a run. */
export async function persistPromptAndSession(
  artifacts: MissionArtifactContext,
  prompt: string,
  session: RuntimeSessionDocument,
): Promise<void> {
  await writeArtifactFile(artifacts.missionDir, artifacts.promptPath, prompt);
  await writeArtifactFile(artifacts.missionDir, artifacts.runtimeSessionPath, stringify(session));
}

/** Append one NDJSON event to the run's events log. */
export async function appendMissionEvent(artifacts: MissionArtifactContext, event: Record<string, unknown>): Promise<void> {
  await assertWritableArtifact(artifacts.missionDir, artifacts.eventsPath);
  await appendFile(artifacts.eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}
