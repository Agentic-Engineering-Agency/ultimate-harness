import { cp, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { relativeArtifactPath } from "./artifact-paths.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { parse, stringify } from "yaml";
import {
  SandboxesIndexSchema,
  type SandboxesIndexDocument,
  type SandboxStatus,
} from "../schema/artifacts.js";
import { sandboxesDir, sandboxesIndex } from "./paths.js";
import {
  assertSafeMissionId,
  fileExists,
  isPathWithin,
  rejectSymlinkIfExists,
} from "./mission.js";
import { getSandboxBackend } from "./sandbox-backends.js";

const SANDBOX_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * The sandboxes index is shared mutable state: every lifecycle command reads it,
 * edits it in memory, and writes the whole document back. Without a lock two
 * concurrent processes (e.g. three `uh sandbox create` started together) each
 * read the same document, so the last writer silently discards the others'
 * registrations. All index mutations therefore go through a single serialized
 * helper: an exclusive sibling lock, bounded acquisition, stale-owner breaking,
 * then a re-read/apply/write-inside-the-lock.
 */
const INDEX_LOCK_STALE_MS = 10_000;
const INDEX_LOCK_TIMEOUT_MS = 5_000;
const INDEX_LOCK_BACKOFF_MS = 25;

export type SandboxIndexLockBreak = {
  /** Absolute path of the broken lock file. */
  lock_file: string;
  /** Owner pid recorded in the lock, or null when it was unreadable. */
  owner_pid: number | null;
  /** Age of the lock when it was broken, in milliseconds. */
  age_ms: number;
  /** ISO timestamp of the break. */
  broken_at: string;
};

const sandboxIndexLockBreaks: SandboxIndexLockBreak[] = [];

/** Stale sandboxes-index locks broken by this process, in acquisition order. */
export function listSandboxIndexLockBreaks(): readonly SandboxIndexLockBreak[] {
  return [...sandboxIndexLockBreaks];
}

function isSafeSandboxId(id: string): boolean {
  return id !== "." && id !== ".." && SANDBOX_ID_PATTERN.test(id);
}

export function assertSafeSandboxId(id: string): void {
  if (!isSafeSandboxId(id)) {
    throw new Error(
      `Invalid sandbox id: ${id}. Use letters, numbers, dots, underscores, and hyphens; do not use path separators.`,
    );
  }
}

async function pathIsDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

/** `kill(pid, 0)` probes existence: ESRCH means gone, anything else means alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function readLockOwnerPid(contents: string): number | null {
  try {
    const parsed = JSON.parse(contents) as { pid?: unknown };
    return typeof parsed.pid === "number" && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

/**
 * Break a lock only when it is older than the stale threshold AND its recorded
 * owner is gone (or the lock carries no usable owner). Returns true when the
 * lock was removed so the caller can retry the exclusive create immediately.
 */
async function breakStaleIndexLock(lockPath: string): Promise<boolean> {
  let ageMs: number;
  try {
    ageMs = Date.now() - (await stat(lockPath)).mtimeMs;
  } catch {
    return true; // vanished between EEXIST and stat; retry acquisition
  }
  if (ageMs < INDEX_LOCK_STALE_MS) return false;

  let ownerPid: number | null = null;
  try {
    ownerPid = readLockOwnerPid(await readFile(lockPath, "utf-8"));
  } catch {
    return false; // unreadable but not provably abandoned; keep waiting
  }
  if (ownerPid !== null && isProcessAlive(ownerPid)) return false;

  try {
    await rm(lockPath, { force: true });
  } catch {
    return false;
  }
  sandboxIndexLockBreaks.push({
    lock_file: lockPath,
    owner_pid: ownerPid,
    age_ms: ageMs,
    broken_at: new Date().toISOString(),
  });
  console.warn(
    `[sandbox] broke stale index lock ${lockPath} (owner pid ${ownerPid ?? "unknown"}, age ${Math.round(ageMs / 1000)}s)`,
  );
  return true;
}

async function acquireSandboxesIndexLock(indexPath: string): Promise<() => Promise<void>> {
  const lockPath = `${indexPath}.lock`;
  const deadline = Date.now() + INDEX_LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }),
          "utf-8",
        );
      } catch (error) {
        await handle.close();
        await rm(lockPath, { force: true });
        throw error;
      }
      await handle.close();
      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await breakStaleIndexLock(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new Error(
          `Sandbox index lock is held by another process: ${lockPath} (gave up after ${INDEX_LOCK_TIMEOUT_MS}ms)`,
        );
      }
      await delay(INDEX_LOCK_BACKOFF_MS);
    }
  }
}

/**
 * The one serialized path for every sandboxes-index mutation (create, discard,
 * repair). The lock is a sibling file created with the exclusive flag; the wait
 * is bounded (short backoff, never forever) and a stale lock whose owner is gone
 * is broken and recorded. Inside the lock the index is re-read, `mutate` applies
 * exactly one change, and the whole document is written atomically. The lock is
 * always released in a finally block.
 */
export async function withSandboxesIndexMutation<T>(
  root: string,
  mutate: (index: SandboxesIndexDocument) => T | Promise<T>,
): Promise<T> {
  const indexPath = sandboxesIndex(root);
  await mkdir(path.dirname(indexPath), { recursive: true });
  const release = await acquireSandboxesIndexLock(indexPath);
  try {
    const index = await readIndex(root);
    const result = await mutate(index);
    await writeIndex(root, index);
    return result;
  } finally {
    await release();
  }
}

export type CreateSandboxOptions = {
  id: string;
  missionId: string;
  baseRef?: string;
  /** Sandbox backend id (default "git-worktree"). See sandbox-backends.ts. */
  backend?: string;
};

export type SandboxIndexEntry = SandboxesIndexDocument["sandboxes"][number];

export type SandboxRecord = Omit<SandboxIndexEntry, "path" | "created_at" | "updated_at"> & {
  path: string;
  created_at: string;
  updated_at: string;
  branch: string;
  base_ref: string;
};

export type SandboxStatusInfo = SandboxRecord & {
  worktree_path: string;
  dirty: boolean;
  changes: string[];
};

export type DiscardSandboxOptions = {
  force?: boolean;
  /** When true, leave the git branch in place when removing the worktree. */
  keepBranch?: boolean;
};

export type DiscardSandboxResult = {
  id: string;
  worktree_path: string;
  branch: string;
  branch_removed: boolean;
};

export async function createSandbox(
  root: string,
  opts: CreateSandboxOptions,
): Promise<SandboxRecord> {
  assertSafeSandboxId(opts.id);
  assertSafeMissionId(opts.missionId);

  const sandboxesRoot = path.resolve(sandboxesDir(root));
  await rejectSymlinkIfExists(sandboxesRoot, "Sandboxes directory");

  const sandboxDir = path.resolve(sandboxesRoot, opts.id);
  if (!isPathWithin(sandboxDir, sandboxesRoot)) {
    throw new Error(`Unsafe sandbox path for id: ${opts.id}`);
  }
  const worktreePath = path.resolve(sandboxDir, "worktree");
  if (!isPathWithin(worktreePath, sandboxesRoot)) {
    throw new Error(`Unsafe sandbox worktree path for id: ${opts.id}`);
  }
  await rejectSymlinkIfExists(sandboxDir, "Sandbox directory");

  const index = await readIndex(root);
  if (index.sandboxes.some((s) => s.id === opts.id)) {
    throw new Error(`Sandbox already exists: ${opts.id}. Refusing to overwrite.`);
  }

  const backend = getSandboxBackend(opts.backend ?? "git-worktree");
  const baseRef = opts.baseRef ?? "HEAD";

  await mkdir(sandboxDir, { recursive: true });

  let materialized: { branch: string; base_ref: string };
  try {
    materialized = await backend.materialize({
      root,
      sandboxId: opts.id,
      worktreePath,
      baseRef,
    });
  } catch (err) {
    await rm(sandboxDir, { recursive: true, force: true });
    throw err;
  }

  // UH-29: seed the bound mission directory into the new worktree.
  // The worktree forks from `baseRef` (HEAD by default), which usually
  // does not include freshly-created-but-uncommitted mission packets.
  // Without this seed, `mission run` auto-routes lookup into the sandbox
  // and fails with ENOENT on the mission directory. We copy only when
  // the host already has the mission directory; missing-on-host is left
  // to the caller (create-mission-inside-sandbox is a valid pattern too).
  const hostMissionDir = path.resolve(root, ".harness", "missions", opts.missionId);
  if (await fileExists(hostMissionDir)) {
    const sandboxMissionsRoot = path.resolve(worktreePath, ".harness", "missions");
    await mkdir(sandboxMissionsRoot, { recursive: true });
    const sandboxMissionDir = path.resolve(sandboxMissionsRoot, opts.missionId);
    if (!isPathWithin(sandboxMissionDir, worktreePath)) {
      throw new Error(`Unsafe mission seed target: ${sandboxMissionDir}`);
    }
    await cp(hostMissionDir, sandboxMissionDir, { recursive: true });
  }

  const now = new Date().toISOString();
  const record: SandboxRecord = {
    id: opts.id,
    mission_id: opts.missionId,
    backend: backend.name,
    branch: materialized.branch,
    path: relativeArtifactPath(root, worktreePath),
    base_ref: materialized.base_ref,
    status: "created",
    created_at: now,
    updated_at: now,
  };

  await writeMetadata(sandboxDir, record);
  await withSandboxesIndexMutation(root, (current) => {
    if (current.sandboxes.some((s) => s.id === opts.id)) {
      throw new Error(`Sandbox already exists: ${opts.id}. Refusing to overwrite.`);
    }
    current.sandboxes.push(toIndexEntry(record));
  });

  return record;
}

export async function listSandboxes(root: string): Promise<SandboxIndexEntry[]> {
  const index = await readIndex(root);
  return [...index.sandboxes];
}

export async function getSandboxStatus(
  root: string,
  id: string,
): Promise<SandboxStatusInfo> {
  assertSafeSandboxId(id);
  const index = await readIndex(root);
  const entry = index.sandboxes.find((s) => s.id === id);
  if (!entry) {
    throw new Error(`Sandbox not found: ${id}`);
  }

  const record = await readMetadata(root, id);
  const worktreePath = path.resolve(root, record.path);
  const sandboxesRoot = path.resolve(sandboxesDir(root));
  if (!isPathWithin(worktreePath, sandboxesRoot)) {
    throw new Error(`Unsafe sandbox worktree path: ${worktreePath}`);
  }
  const changes = await getSandboxBackend(record.backend).collectDirtyChanges(worktreePath);
  return {
    ...record,
    worktree_path: worktreePath,
    dirty: changes.length > 0,
    changes,
  };
}

export async function discardSandbox(
  root: string,
  id: string,
  opts: DiscardSandboxOptions = {},
): Promise<DiscardSandboxResult> {
  assertSafeSandboxId(id);
  const index = await readIndex(root);
  if (!index.sandboxes.some((s) => s.id === id)) {
    throw new Error(`Sandbox not found: ${id}`);
  }

  const record = await readMetadata(root, id);
  const sandboxesRoot = path.resolve(sandboxesDir(root));
  const sandboxDir = path.resolve(sandboxesRoot, id);
  const worktreePath = path.resolve(root, record.path);
  if (!isPathWithin(worktreePath, sandboxesRoot)) {
    throw new Error(`Unsafe sandbox worktree path: ${worktreePath}`);
  }

  const backend = getSandboxBackend(record.backend);

  if (!opts.force) {
    if (!(await fileExists(worktreePath))) {
      throw new Error(
        `Sandbox worktree missing: ${worktreePath}. Re-run with --force to discard the orphaned entry.`,
      );
    }
    const changes = await backend.collectDirtyChanges(worktreePath);
    if (changes.length > 0) {
      throw new Error(
        `Sandbox ${id} has ${changes.length} uncommitted change(s). Re-run with --force to discard.`,
      );
    }
  }

  const { branch_removed: branchRemoved } = await backend.teardown(
    { root, worktreePath, branch: record.branch },
    { force: opts.force ?? false, keepBranch: opts.keepBranch ?? false },
  );

  await rm(sandboxDir, { recursive: true, force: true });
  await withSandboxesIndexMutation(root, (current) => {
    const entryIndex = current.sandboxes.findIndex((s) => s.id === id);
    if (entryIndex !== -1) current.sandboxes.splice(entryIndex, 1);
  });

  return {
    id,
    worktree_path: worktreePath,
    branch: record.branch,
    branch_removed: branchRemoved,
  };
}

/**
 * Read the sandboxes index. A missing file is an empty registry: the index is
 * runtime state that every run rewrites, so a project may stop tracking it and a
 * fresh clone must still work — `create` writes a new valid index on demand. A
 * present-but-invalid index is never treated as empty: it fails loudly and is
 * never overwritten, so a corrupt registry cannot be silently discarded.
 */
async function readIndex(root: string): Promise<SandboxesIndexDocument> {
  const indexPath = sandboxesIndex(root);
  await rejectSymlinkIfExists(indexPath, "Sandboxes index");
  if (!(await fileExists(indexPath))) {
    return { schema_version: "uh.sandboxes-index.v0", sandboxes: [] };
  }
  const raw = await readFile(indexPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new Error(
      `Sandboxes index has invalid YAML at ${indexPath}: ${(err as Error).message}`,
    );
  }
  const result = SandboxesIndexSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Sandboxes index is invalid: ${result.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return result.data;
}

async function writeIndex(
  root: string,
  doc: SandboxesIndexDocument,
): Promise<void> {
  const indexPath = sandboxesIndex(root);
  await mkdir(path.dirname(indexPath), { recursive: true });
  // Write-then-rename: a reader never observes a half-written registry, and a
  // crash mid-write leaves the previous document intact.
  await writeAtomicArtifact(indexPath, stringify(doc));
}

async function writeMetadata(
  sandboxDir: string,
  record: SandboxRecord,
): Promise<void> {
  await writeFile(
    path.join(sandboxDir, "metadata.yaml"),
    stringify(record),
    "utf-8",
  );
}

async function readMetadata(root: string, id: string): Promise<SandboxRecord> {
  const filePath = path.join(sandboxesDir(root), id, "metadata.yaml");
  await rejectSymlinkIfExists(filePath, "Sandbox metadata");
  if (!(await fileExists(filePath))) {
    throw new Error(`Sandbox metadata missing: ${filePath}`);
  }
  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new Error(
      `Sandbox metadata has invalid YAML at ${filePath}: ${(err as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Sandbox metadata is not an object: ${filePath}`);
  }
  return parsed as SandboxRecord;
}

/** Tolerant metadata read for repair: a missing/invalid file is not fatal there. */
async function readMetadataIfPresent(root: string, id: string): Promise<SandboxRecord | null> {
  const filePath = path.join(sandboxesDir(root), id, "metadata.yaml");
  if (!(await fileExists(filePath))) return null;
  try {
    return await readMetadata(root, id);
  } catch {
    return null;
  }
}

/** Read a mission packet's `id`, tolerating a missing or malformed file. */
async function readMissionPacketId(missionYamlPath: string): Promise<string | null> {
  if (!(await fileExists(missionYamlPath))) return null;
  try {
    const parsed = parse(await readFile(missionYamlPath, "utf-8"));
    if (parsed && typeof parsed === "object") {
      const candidate = (parsed as { id?: unknown }).id;
      if (typeof candidate === "string" && candidate.length > 0) return candidate;
    }
  } catch {
    // Malformed packet: fall through to the next candidate.
  }
  return null;
}

/**
 * The mission bound to a sandbox is seeded into the worktree as
 * `.harness/missions/<mission_id>/mission.yaml` at create time. Prefer the
 * packet named by the sandbox's own metadata, then fall back to the first
 * valid packet so a sandbox whose metadata was lost is still recoverable.
 */
async function findBoundMissionId(worktreePath: string, preferredId?: string): Promise<string | null> {
  const missionsRoot = path.join(worktreePath, ".harness", "missions");
  if (preferredId) {
    const preferred = await readMissionPacketId(path.join(missionsRoot, preferredId, "mission.yaml"));
    if (preferred) return preferred;
  }
  if (!(await pathIsDirectory(missionsRoot))) return null;
  for (const entry of await readdir(missionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = await readMissionPacketId(path.join(missionsRoot, entry.name, "mission.yaml"));
    if (id) return id;
  }
  return null;
}

export type RepairedSandbox = {
  id: string;
  mission_id: string;
  backend: string;
  path: string;
  status: SandboxStatus;
  branch?: string;
};

/**
 * Re-register sandbox directories that exist on disk but are missing from the
 * index — the recovery path for a registration lost to the pre-lock
 * read/modify/write race. A directory qualifies when `.harness/sandboxes/<id>/worktree`
 * exists and its seeded mission packet yields a mission id; the recorded
 * lifetime fields come from metadata.yaml when present, otherwise sane defaults.
 * Each repaired entry is reported. Existing entries and malformed indexes are
 * never touched.
 */
export async function repairSandboxes(root: string): Promise<RepairedSandbox[]> {
  const sandboxesRoot = path.resolve(sandboxesDir(root));
  await rejectSymlinkIfExists(sandboxesRoot, "Sandboxes directory");
  if (!(await pathIsDirectory(sandboxesRoot))) return [];

  const candidates: Array<{ id: string; record: SandboxRecord }> = [];
  for (const entry of await readdir(sandboxesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSafeSandboxId(entry.name)) continue;
    const id = entry.name;
    const worktreePath = path.resolve(sandboxesRoot, id, "worktree");
    if (!isPathWithin(worktreePath, sandboxesRoot)) continue;
    if (!(await pathIsDirectory(worktreePath))) continue;

    const metadata = await readMetadataIfPresent(root, id);
    const missionId = await findBoundMissionId(worktreePath, metadata?.mission_id);
    if (!missionId) continue;

    const now = new Date().toISOString();
    candidates.push({
      id,
      record: {
        id,
        mission_id: missionId,
        backend: metadata?.backend ?? "git-worktree",
        branch: metadata?.branch ?? `sandbox/${id}`,
        path: relativeArtifactPath(root, worktreePath),
        base_ref: metadata?.base_ref ?? "HEAD",
        status: metadata?.status ?? "created",
        created_at: metadata?.created_at ?? now,
        updated_at: metadata?.updated_at ?? now,
      },
    });
  }
  if (candidates.length === 0) return [];

  return withSandboxesIndexMutation(root, (index) => {
    const repaired: RepairedSandbox[] = [];
    for (const candidate of candidates) {
      if (index.sandboxes.some((s) => s.id === candidate.id)) continue;
      index.sandboxes.push(toIndexEntry(candidate.record));
      repaired.push({
        id: candidate.record.id,
        mission_id: candidate.record.mission_id,
        backend: candidate.record.backend,
        path: candidate.record.path,
        status: candidate.record.status,
        branch: candidate.record.branch,
      });
    }
    return repaired;
  });
}

function toIndexEntry(record: SandboxRecord): SandboxIndexEntry {
  return {
    id: record.id,
    mission_id: record.mission_id,
    backend: record.backend,
    path: record.path,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export type SandboxMissionRoute = {
  effectiveRoot: string;
  missionPath: string;
  sandbox?: { id: string; path: string; backend: string };
  /**
   * Mission id read from the mission file while routing. Present whenever
   * routing was attempted (`--no-sandbox` skips the read), so callers can
   * name the mission in a refusal without parsing the file a second time.
   */
  missionId?: string;
  error?: string;
};


export async function findBoundSandbox(
  projectRoot: string,
  missionId: string,
): Promise<{ id: string; path: string; backend: string } | null> {
  const indexPath = sandboxesIndex(projectRoot);
  if (!(await fileExists(indexPath))) return null;
  const index = await readIndex(projectRoot);
  const sandboxesRoot = path.resolve(sandboxesDir(projectRoot));
  const candidates = index.sandboxes
    .filter((entry) => entry.mission_id === missionId && entry.status !== "discarded" && typeof entry.path === "string" && entry.path.length > 0)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  for (const candidate of candidates) {
    const resolved = path.resolve(projectRoot, candidate.path ?? "");
    if (!isPathWithin(resolved, sandboxesRoot)) continue;
    if (!(await fileExists(resolved))) continue;
    return { id: candidate.id, path: resolved, backend: candidate.backend };
  }
  return null;
}

export async function resolveSandboxMissionRoot(
  root: string,
  missionPath: string,
  useSandbox: boolean,
): Promise<SandboxMissionRoute> {
  if (!useSandbox) return { effectiveRoot: root, missionPath };
  let missionId: string;
  try {
    const parsed = parse(await readFile(missionPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string" || parsed.id.length === 0) {
      return { effectiveRoot: root, missionPath, error: "Cannot route mission without a valid mission id; refusing host-root execution." };
    }
    missionId = parsed.id;
  } catch {
    return { effectiveRoot: root, missionPath, error: "Cannot read mission for sandbox routing; refusing host-root execution." };
  }
  const sandbox = await findBoundSandbox(root, missionId);
  if (!sandbox) {
    const indexPath = sandboxesIndex(root);
    if (!(await fileExists(indexPath))) return { effectiveRoot: root, missionPath, missionId };
    let index: SandboxesIndexDocument;
    try {
      index = await readIndex(root);
    } catch {
      return { effectiveRoot: root, missionPath, missionId, error: "Sandbox registry is invalid; refusing host-root fallback." };
    }
    const hasInvalidBinding = index.sandboxes.some((entry) => entry.mission_id === missionId && entry.status !== "discarded");
    return hasInvalidBinding
      ? { effectiveRoot: root, missionPath, missionId, error: `Sandbox binding for mission ${missionId} is invalid; refusing host-root fallback.` }
      : { effectiveRoot: root, missionPath, missionId };
  }
  return {
    effectiveRoot: sandbox.path,
    missionPath: path.join(sandbox.path, ".harness", "missions", missionId, "mission.yaml"),
    sandbox,
    missionId,
  };
}


export type { SandboxStatus };
