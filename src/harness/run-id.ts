import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
  // Codex P1 (PR #96): two concurrent writers must NOT race on the same
  // tmp path. A shared `index.json.tmp` would either ENOENT-fail one
  // rename or silently overwrite — both drop run history entries. Suffix
  // with random bytes so each writer has its own staging file. Rename is
  // still atomic on the same filesystem (POSIX rename(2) overwrites the
  // destination atomically), so the last-finishing writer wins the merge
  // — and since `current` is recomputed under each writer's read, the
  // race only loses the entry the slower writer added between read and
  // rename. That's the same exposure as `latest.json` writes (best-effort,
  // last-write-wins). Per-run dirs themselves are race-free.
  const tmp = `${indexPath}.${randomBytes(6).toString("hex")}.tmp`;
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
  let current: { schema_version: "uh.runs-index.v0"; runs: RunsIndexEntry[] };
  try {
    const raw = await readFile(indexPath, "utf-8");
    current = RunsIndexSchema.parse(JSON.parse(raw));
  } catch {
    // No index yet (mission has never run) or it's corrupt — either way
    // there's nothing for retention to prune.
    return 0;
  }
  const nonArchived = current.runs.filter((r) => r.archived !== true);
  if (nonArchived.length <= max) {
    return 0;
  }
  // Sort by started_at ASC so the oldest entries are at the front.
  // Tie-break on run_id to keep the order deterministic when two runs
  // share an ISO timestamp (the `_make_run_id()` minute granularity makes
  // collisions plausible under load).
  const oldestFirst = [...nonArchived].sort((a, b) => {
    if (a.started_at !== b.started_at) return a.started_at < b.started_at ? -1 : 1;
    return a.run_id < b.run_id ? -1 : 1;
  });
  const pruneCount = nonArchived.length - max;
  const toPrune = oldestFirst.slice(0, pruneCount);
  // Flip the archived flag on the in-memory entries (lookup by run_id —
  // we don't depend on indices because the sort reordered them).
  const archivedIds = new Set(toPrune.map((r) => r.run_id));
  for (const entry of current.runs) {
    if (archivedIds.has(entry.run_id)) {
      entry.archived = true;
    }
  }
  // Best-effort per-run dir removal. `force: true` already swallows
  // ENOENT, so re-running prune after a partial failure converges.
  for (const entry of toPrune) {
    await rm(missionRunDir(root, missionId, entry.run_id), { recursive: true, force: true });
  }
  // Atomic write via the same unique-tmp rename strategy as
  // appendRunsIndexEntry. Two writers (e.g. prune + a concurrent
  // appendRunsIndexEntry from a still-finishing terminal-status flip)
  // could still race on the read-modify-write window, but each rename
  // is atomic and per-writer staging files don't collide.
  const tmp = `${indexPath}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(current, null, 2), "utf-8");
  await rename(tmp, indexPath);
  return pruneCount;
}
