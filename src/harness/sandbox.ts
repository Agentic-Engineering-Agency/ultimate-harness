import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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

const execFileP = promisify(execFile);

const SANDBOX_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function assertSafeSandboxId(id: string): void {
  if (id === "." || id === ".." || !SANDBOX_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid sandbox id: ${id}. Use letters, numbers, dots, underscores, and hyphens; do not use path separators.`,
    );
  }
}

export type CreateSandboxOptions = {
  id: string;
  missionId: string;
  baseRef?: string;
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
  await requireSandboxesIndex(root);

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

  const baseRef = opts.baseRef ?? "HEAD";
  const branch = `sandbox/${opts.id}`;

  await mkdir(sandboxDir, { recursive: true });

  try {
    await runGit(root, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
  } catch (err) {
    await rm(sandboxDir, { recursive: true, force: true });
    throw err;
  }

  const now = new Date().toISOString();
  const record: SandboxRecord = {
    id: opts.id,
    mission_id: opts.missionId,
    backend: "git-worktree",
    branch,
    path: toForwardSlash(path.relative(root, worktreePath)),
    base_ref: baseRef,
    status: "created",
    created_at: now,
    updated_at: now,
  };

  await writeMetadata(sandboxDir, record);
  index.sandboxes.push(toIndexEntry(record));
  await writeIndex(root, index);

  return record;
}

export async function listSandboxes(root: string): Promise<SandboxIndexEntry[]> {
  await requireSandboxesIndex(root);
  const index = await readIndex(root);
  return [...index.sandboxes];
}

export async function getSandboxStatus(
  root: string,
  id: string,
): Promise<SandboxStatusInfo> {
  assertSafeSandboxId(id);
  await requireSandboxesIndex(root);
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
  const changes = await collectDirtyChanges(worktreePath);
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
  await requireSandboxesIndex(root);
  const index = await readIndex(root);
  const entryIndex = index.sandboxes.findIndex((s) => s.id === id);
  if (entryIndex === -1) {
    throw new Error(`Sandbox not found: ${id}`);
  }

  const record = await readMetadata(root, id);
  const sandboxesRoot = path.resolve(sandboxesDir(root));
  const sandboxDir = path.resolve(sandboxesRoot, id);
  const worktreePath = path.resolve(root, record.path);
  if (!isPathWithin(worktreePath, sandboxesRoot)) {
    throw new Error(`Unsafe sandbox worktree path: ${worktreePath}`);
  }

  if (!opts.force) {
    if (!(await fileExists(worktreePath))) {
      throw new Error(
        `Sandbox worktree missing: ${worktreePath}. Re-run with --force to discard the orphaned entry.`,
      );
    }
    const changes = await collectDirtyChanges(worktreePath);
    if (changes.length > 0) {
      throw new Error(
        `Sandbox ${id} has ${changes.length} uncommitted change(s). Re-run with --force to discard.`,
      );
    }
  }

  if (await fileExists(worktreePath)) {
    const removeArgs = ["worktree", "remove"];
    if (opts.force) {
      removeArgs.push("--force");
    }
    removeArgs.push(worktreePath);
    await runGit(root, removeArgs);
  } else {
    // Worktree directory was deleted out-of-band; prune the registration.
    await runGit(root, ["worktree", "prune"]);
  }

  let branchRemoved = false;
  if (record.branch && !opts.keepBranch) {
    try {
      await runGit(root, ["branch", "-D", record.branch]);
      branchRemoved = true;
    } catch {
      branchRemoved = false;
    }
  }

  await rm(sandboxDir, { recursive: true, force: true });
  index.sandboxes.splice(entryIndex, 1);
  await writeIndex(root, index);

  return {
    id,
    worktree_path: worktreePath,
    branch: record.branch,
    branch_removed: branchRemoved,
  };
}

async function requireSandboxesIndex(root: string): Promise<void> {
  const indexPath = sandboxesIndex(root);
  await rejectSymlinkIfExists(indexPath, "Sandboxes index");
  if (!(await fileExists(indexPath))) {
    throw new Error(
      `Sandboxes index missing: ${indexPath}. Run 'uh init' first.`,
    );
  }
}

async function readIndex(root: string): Promise<SandboxesIndexDocument> {
  const indexPath = sandboxesIndex(root);
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
  await writeFile(indexPath, stringify(doc), "utf-8");
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

async function collectDirtyChanges(worktreePath: string): Promise<string[]> {
  if (!(await fileExists(worktreePath))) {
    throw new Error(`Sandbox worktree missing: ${worktreePath}`);
  }
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  return stdout.split("\n").filter((line) => line.length > 0);
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const res = await execFileP("git", ["-C", cwd, ...args]);
    return {
      stdout: String(res.stdout),
      stderr: String(res.stderr),
    };
  } catch (err) {
    const e = err as { message: string; stderr?: string | Buffer; stdout?: string | Buffer };
    const stderr = e.stderr ? String(e.stderr).trim() : "";
    const stdout = e.stdout ? String(e.stdout).trim() : "";
    const detail = stderr || stdout || e.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
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

function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/");
}

export type { SandboxStatus };
