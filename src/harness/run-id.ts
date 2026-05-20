import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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
  const dir = missionRunDir(root, missionId, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeLatestPointer(
  root: string,
  missionId: string,
  pointer: LatestRunPointer,
): Promise<void> {
  await mkdir(missionDir(root, missionId), { recursive: true });
  const validated = LatestRunPointerSchema.parse(pointer);
  const dst = missionLatestPointer(root, missionId);
  const tmp = `${dst}.tmp`;
  await writeFile(tmp, JSON.stringify(validated, null, 2), "utf-8");
  await rename(tmp, dst);
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
  let current: { schema_version: "uh.runs-index.v0"; runs: RunsIndexEntry[] };
  try {
    const raw = await readFile(indexPath, "utf-8");
    current = RunsIndexSchema.parse(JSON.parse(raw));
  } catch {
    current = { schema_version: "uh.runs-index.v0", runs: [] };
  }
  const idx = current.runs.findIndex((r) => r.run_id === entry.run_id);
  if (idx >= 0) {
    current.runs[idx] = entry;
  } else {
    current.runs.push(entry);
  }
  const tmp = `${indexPath}.tmp`;
  await writeFile(tmp, JSON.stringify(current, null, 2), "utf-8");
  await rename(tmp, indexPath);
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
  try {
    await stat(src);
  } catch {
    return;
  }
  const dst = path.join(missionDir(root, missionId), "runtime-result.yaml");
  const tmp = `${dst}.tmp`;
  await copyFile(src, tmp);
  await rename(tmp, dst);
}
