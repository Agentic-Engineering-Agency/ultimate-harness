import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { withArtifactTransaction, writeAtomicArtifact } from "./artifact-transaction.js";
import {
  missionDir,
  missionLatestPointer,
  missionRunDir,
  missionRunsDir,
  missionRunsIndex,
} from "./paths.js";
import {
  LatestRunPointerSchema,
  RunsIndexSchema,
  type LatestRunPointer,
  type RunsIndexEntry,
} from "../schema/runs.js";

/**
 * UH-82 — per-run artifact directory plumbing.
 *
 * Run IDs are `YYYYMMDDTHHMMSSZ-<6 lowercase hex>`. The Hermes plugin's
 * `_make_run_id()` produces the same shape; the CLI's `--run-id` flag
 * accepts plugin-generated ids verbatim so both sides agree on a single
 * artifact directory per run.
 */

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Format: `YYYYMMDDTHHMMSSZ-<6 lowercase hex>`. */
export function generateRunId(now: Date = new Date()): string {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const hex = randomBytes(3).toString("hex");
  return `${iso}-${hex}`;
}

/**
 * Strict shape check. Mirrors the plugin's `_SAFE_ID_RE` so any id that
 * survives `assertValidRunId` is also acceptable as a URL segment in the
 * dashboard's per-run artifact route.
 */
export function assertValidRunId(runId: string): void {
  if (typeof runId !== "string" || !RUN_ID_RE.test(runId)) {
    throw new Error(`Invalid runId: ${runId}`);
  }
}

export async function ensureRunDir(root: string, missionId: string, runId: string): Promise<string> {
  assertValidRunId(runId);
  const dir = missionRunDir(root, missionId, runId);
  for (const directory of [missionRunsDir(root, missionId), dir]) {
    try {
      const existing = await lstat(directory);
      if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error(`Unsafe run directory: ${directory}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeLatestPointer(
  root: string,
  missionId: string,
  pointer: LatestRunPointer,
): Promise<void> {
  await mkdir(missionRunsDir(root, missionId), { recursive: true });
  const validated = LatestRunPointerSchema.parse(pointer);
  const dst = missionLatestPointer(root, missionId);
  await withArtifactTransaction(missionRunsIndex(root, missionId), async () => {
    let previous: LatestRunPointer | undefined;
    try { previous = LatestRunPointerSchema.parse(JSON.parse(await readFile(dst, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (previous && previous.run_id !== validated.run_id &&
        (previous.started_at > validated.started_at ||
         (previous.started_at === validated.started_at && previous.run_id > validated.run_id))) return;
    if (previous?.run_id === validated.run_id && previous.status !== "running" && validated.status === "running") {
      throw new Error(`Cannot restart settled attempt ${validated.run_id}; allocate a new run id`);
    }
    await writeAtomicArtifact(dst, JSON.stringify(validated, null, 2));
  });
}

export async function readLatestPointer(
  root: string,
  missionId: string,
): Promise<LatestRunPointer | null> {
  try {
    const raw = await readFile(missionLatestPointer(root, missionId), "utf-8");
    return LatestRunPointerSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Append (or replace, by run_id) an entry in `runs/index.json`. The
 * replace-in-place semantics let a `running` row flip to a terminal status
 * without duplicating the row when `runX` finishes.
 */
export async function appendRunsIndexEntry(
  root: string,
  missionId: string,
  entry: RunsIndexEntry,
): Promise<void> {
  const indexPath = missionRunsIndex(root, missionId);
  await mkdir(missionRunsDir(root, missionId), { recursive: true });
  await withArtifactTransaction(indexPath, async () => {
    let current: { schema_version: "uh.runs-index.v0"; runs: RunsIndexEntry[] };
    try {
      current = RunsIndexSchema.parse(JSON.parse(await readFile(indexPath, "utf-8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      current = { schema_version: "uh.runs-index.v0", runs: [] };
    }
    const validated = RunsIndexSchema.parse({ schema_version: "uh.runs-index.v0", runs: [entry] }).runs[0];
    const index = current.runs.findIndex((run) => run.run_id === validated.run_id);
    if (index < 0) {
      current.runs.push(validated);
    } else {
      const previous = current.runs[index];
      current.runs[index] = {
        ...previous,
        ...validated,
        ...(validated.replay_of === undefined && previous.replay_of !== undefined ? { replay_of: previous.replay_of } : {}),
      };
    }
    await writeAtomicArtifact(indexPath, JSON.stringify(current, null, 2));
  });
}

/**
 * Atomically mirror `runs/<run_id>/runtime-result.yaml` up to the mission
 * directory. This is the ONLY mirrored artifact — readers that still ask
 * "what was the latest result" keep working without learning per-run paths.
 */
export async function mirrorRuntimeResultToLatest(
  root: string,
  missionId: string,
  runId: string,
): Promise<void> {
  const src = path.join(missionRunDir(root, missionId, runId), "runtime-result.yaml");
  await mkdir(missionRunsDir(root, missionId), { recursive: true });
  await withArtifactTransaction(missionRunsIndex(root, missionId), async () => {
    let latest: LatestRunPointer | undefined;
    try { latest = LatestRunPointerSchema.parse(JSON.parse(await readFile(missionLatestPointer(root, missionId), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (latest && latest.run_id !== runId) return;
    let content: string;
    try { content = await readFile(src, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    await writeAtomicArtifact(path.join(missionDir(root, missionId), "runtime-result.yaml"), content);
  });
}

/**
 * UH-90 — retention. Mark the N oldest non-archived entries as archived
 * and remove their per-run dirs. `max` is the cap; if entries.length <= max,
 * no-op. Returns the count of pruned runs.
 *
 * Idempotent: re-running on the same on-disk state is a no-op because
 * already-archived entries are excluded from the cap calculation.
 *
 * `max` must be a positive integer. The plugin's caller checks for `null`
 * (= "no cap, do not invoke") before calling — we throw rather than
 * silently no-op so misconfigured callers fail fast.
 */
export async function pruneOldRuns(
  root: string,
  missionId: string,
  max: number,
): Promise<number> {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error("max_runs_per_mission must be a positive integer or null");
  }
  const indexPath = missionRunsIndex(root, missionId);
  await mkdir(missionRunsDir(root, missionId), { recursive: true });
  return withArtifactTransaction(indexPath, async () => {
    let current: { schema_version: "uh.runs-index.v0"; runs: RunsIndexEntry[] };
    try {
      current = RunsIndexSchema.parse(JSON.parse(await readFile(indexPath, "utf-8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
    // Active attempts retain their evidence regardless of the completed-run cap.
    const settled = current.runs.filter((entry) => !entry.archived && entry.status !== "running");
    if (settled.length <= max) return 0;
    settled.sort((a, b) => a.started_at.localeCompare(b.started_at) || a.run_id.localeCompare(b.run_id));
    const toPrune = settled.slice(0, settled.length - max);
    for (const entry of toPrune) assertValidRunId(entry.run_id);
    for (const entry of toPrune) {
      await rm(missionRunDir(root, missionId, entry.run_id), { recursive: true, force: true });
      entry.archived = true;
    }
    await writeAtomicArtifact(indexPath, JSON.stringify(current, null, 2));
    return toPrune.length;
  });
}
