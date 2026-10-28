/**
 * Worktree lock regression tests.
 *
 * `git worktree prune` can be run from ANY linked worktree and deletes the
 * administrative registration of every worktree whose directory is missing at
 * that moment — including worktrees owned by another controller or parked on a
 * removable/network volume. In either case the surviving directory becomes "not
 * a git repository" even once it comes back. UH must therefore:
 *
 *   (a) create its worktrees locked (`git worktree add --lock --reason …`),
 *   (b) unlock + remove on teardown, and
 *   (c) never prune globally — when a worktree directory vanishes out of band
 *       it drops only that one registration and tolerates a refusal, and
 *   (e) never delete through a link — Git for Windows' `git worktree remove`
 *       recurses into directory junctions and deletes their targets' contents
 *       (a `node_modules` junction empties the main checkout's `node_modules`).
 *
 * These tests drive real `git` inside a throwaway repository (never the repo
 * under test) and assert the lock/registration guarantees end to end.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { defaultGitOps } from "../src/harness/team-run.js";
import { GitWorktreeBackend } from "../src/harness/sandbox-backends.js";
import { removeWorktreeLinks } from "../src/harness/worktree-links.js";

const execFileP = promisify(execFile);

let ROOT: string;

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", root, ...args]);
  return stdout;
}

async function initGitRepo(root: string): Promise<void> {
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Test"]);
  await git(root, ["config", "commit.gpgsign", "false"]);
  await git(root, ["config", "core.autocrlf", "false"]);
  await writeFile(join(root, "README.md"), "# Test\n", "utf-8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-q", "-m", "init"]);
}

interface WorktreeEntry {
  path: string;
  locked: boolean;
  lockReason?: string;
}

/** Parse `git worktree list --porcelain` blocks, keeping only what we assert on. */
async function listWorktrees(root: string): Promise<WorktreeEntry[]> {
  const stdout = await git(root, ["worktree", "list", "--porcelain"]);
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      current = { path: normalize(line.slice("worktree ".length).trim()), locked: false };
      entries.push(current);
    } else if (current && line === "locked") {
      current.locked = true;
    } else if (current && line.startsWith("locked ")) {
      current.locked = true;
      current.lockReason = line.slice("locked ".length).trim();
    }
  }
  return entries;
}

function findWorktree(entries: WorktreeEntry[], worktreePath: string): WorktreeEntry | undefined {
  const target = normalize(worktreePath);
  return entries.find((entry) => entry.path === target);
}

/** Create only the PARENT of a worktree path; `git worktree add` makes the leaf. */
async function makeParentDir(worktreePath: string): Promise<void> {
  await mkdir(dirname(worktreePath), { recursive: true });
}

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "uh-worktree-lock-"));
  ROOT = await realpath(dir);
  await initGitRepo(ROOT);
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

describe("worktree locking (a): creation registers a locked worktree", () => {
  test("GitWorktreeBackend.materialize locks the worktree", async () => {
    const worktreePath = join(ROOT, ".harness", "sandboxes", "alpha", "worktree");
    await makeParentDir(worktreePath);
    const backend = new GitWorktreeBackend();

    const result = await backend.materialize({ root: ROOT, sandboxId: "alpha", worktreePath, baseRef: "HEAD" });
    expect(result.branch).toBe("sandbox/alpha");

    const entry = findWorktree(await listWorktrees(ROOT), worktreePath);
    expect(entry).toBeDefined();
    expect(entry!.locked).toBe(true);
    // No run id is available to this code path; the branch is the identifier.
    expect(entry!.lockReason ?? "").toContain("sandbox/alpha");
  });

  test("defaultGitOps.addWorktree locks the worktree", async () => {
    const worktreePath = join(ROOT, "wt-team");
    await makeParentDir(worktreePath);

    await defaultGitOps.addWorktree(ROOT, "uh/team/m/backend", worktreePath, "HEAD");

    const entry = findWorktree(await listWorktrees(ROOT), worktreePath);
    expect(entry).toBeDefined();
    expect(entry!.locked).toBe(true);
    expect(entry!.lockReason ?? "").toContain("uh/team/m/backend");
  });
});

describe("worktree locking (b): teardown of a locked worktree succeeds", () => {
  test("GitWorktreeBackend.teardown removes the locked registration", async () => {
    const worktreePath = join(ROOT, ".harness", "sandboxes", "beta", "worktree");
    await makeParentDir(worktreePath);
    const backend = new GitWorktreeBackend();
    await backend.materialize({ root: ROOT, sandboxId: "beta", worktreePath, baseRef: "HEAD" });
    expect(findWorktree(await listWorktrees(ROOT), worktreePath)?.locked).toBe(true);

    const result = await backend.teardown(
      { root: ROOT, worktreePath, branch: "sandbox/beta" },
      { force: true, keepBranch: false },
    );

    expect(result.branch_removed).toBe(true);
    expect(findWorktree(await listWorktrees(ROOT), worktreePath)).toBeUndefined();
    await expect(stat(worktreePath)).rejects.toThrow();
  });

  test("defaultGitOps.removeWorktree removes the locked registration", async () => {
    const worktreePath = join(ROOT, "wt-team-remove");
    await makeParentDir(worktreePath);
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/worker", worktreePath, "HEAD");
    expect(findWorktree(await listWorktrees(ROOT), worktreePath)?.locked).toBe(true);

    await defaultGitOps.removeWorktree(ROOT, worktreePath);

    expect(findWorktree(await listWorktrees(ROOT), worktreePath)).toBeUndefined();
    await expect(stat(worktreePath)).rejects.toThrow();
  });
});

describe("worktree locking (c): tearing one down never prunes a hidden sibling", () => {
  test("a hidden UH worktree stays registered and works again once renamed back", async () => {
    const hiddenFrom = join(ROOT, "wt-c-a");
    const teardownPath = join(ROOT, "wt-c-b");
    await makeParentDir(hiddenFrom);
    await makeParentDir(teardownPath);
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/a", hiddenFrom, "HEAD");
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/b", teardownPath, "HEAD");

    // Hide A: its directory is gone from git's perspective, but its
    // registration (and lock) must remain untouched by B's teardown.
    const parked = `${hiddenFrom}-parked`;
    await rename(hiddenFrom, parked);

    await defaultGitOps.removeWorktree(ROOT, teardownPath);

    let entries = await listWorktrees(ROOT);
    expect(findWorktree(entries, hiddenFrom)).toBeDefined();
    expect(findWorktree(entries, teardownPath)).toBeUndefined();

    // Bring the volume back: the hidden worktree is usable again.
    await rename(parked, hiddenFrom);
    expect((await git(hiddenFrom, ["status", "--porcelain"])).trim()).toBe("");

    entries = await listWorktrees(ROOT);
    const restored = findWorktree(entries, hiddenFrom);
    expect(restored).toBeDefined();
    expect(restored!.locked).toBe(true);
  });
});

describe("worktree locking (d): teardown of a deleted worktree is safe and isolated", () => {
  test("defaultGitOps.removeWorktree does not throw and leaves other registrations alone", async () => {
    const deleted = join(ROOT, "wt-d-deleted");
    const sibling = join(ROOT, "wt-d-sibling");
    await makeParentDir(deleted);
    await makeParentDir(sibling);
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/deleted", deleted, "HEAD");
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/sibling", sibling, "HEAD");

    // This worktree's directory was deleted out of band...
    await rm(deleted, { recursive: true, force: true });
    // ...and a sibling is parked on a removable volume (directory missing too).
    const parked = `${sibling}-offline`;
    await rename(sibling, parked);

    await expect(defaultGitOps.removeWorktree(ROOT, deleted)).resolves.toBeUndefined();

    // A global `git worktree prune` would have dropped the sibling too.
    expect(findWorktree(await listWorktrees(ROOT), sibling)).toBeDefined();

    await rename(parked, sibling);
    expect((await git(sibling, ["status", "--porcelain"])).trim()).toBe("");
  });

  test("GitWorktreeBackend.teardown of a deleted worktree is safe and isolated", async () => {
    const backend = new GitWorktreeBackend();
    const deleted = join(ROOT, ".harness", "sandboxes", "gone", "worktree");
    const sibling = join(ROOT, ".harness", "sandboxes", "kept", "worktree");
    await makeParentDir(deleted);
    await makeParentDir(sibling);
    await backend.materialize({ root: ROOT, sandboxId: "gone", worktreePath: deleted, baseRef: "HEAD" });
    await backend.materialize({ root: ROOT, sandboxId: "kept", worktreePath: sibling, baseRef: "HEAD" });

    await rm(deleted, { recursive: true, force: true });
    const parked = `${sibling}-offline`;
    await rename(sibling, parked);

    await expect(
      backend.teardown(
        { root: ROOT, worktreePath: deleted, branch: "sandbox/gone" },
        { force: true, keepBranch: false },
      ),
    ).resolves.toBeDefined();

    expect(findWorktree(await listWorktrees(ROOT), sibling)).toBeDefined();

    await rename(parked, sibling);
    expect((await git(sibling, ["status", "--porcelain"])).trim()).toBe("");
  });
});

/** A directory link: a junction on Windows (no privilege needed), a symlink elsewhere. */
async function linkDirectory(target: string, linkPath: string): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true });
  await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

/** A directory outside the worktree, standing in for the main checkout's node_modules. */
async function makeSharedModules(): Promise<string> {
  const shared = join(ROOT, "shared_modules");
  await mkdir(join(shared, "pkg"), { recursive: true });
  await writeFile(join(shared, "pkg", "index.js"), "keep\n", "utf-8");
  return shared;
}

describe("worktree locking (e): teardown never deletes through a link", () => {
  test("removeWorktreeLinks removes only links, at any depth, and counts them", async () => {
    const tree = join(ROOT, "tree");
    await mkdir(join(tree, "src"), { recursive: true });
    await writeFile(join(tree, "src", "own.ts"), "own\n", "utf-8");
    const shared = await makeSharedModules();
    await linkDirectory(shared, join(tree, "node_modules"));
    await linkDirectory(shared, join(tree, "src", "deep", "node_modules"));

    expect(await removeWorktreeLinks(tree)).toBe(2);

    await expect(stat(join(tree, "node_modules"))).rejects.toThrow();
    await expect(stat(join(tree, "src", "deep", "node_modules"))).rejects.toThrow();
    expect(await readFile(join(tree, "src", "own.ts"), "utf-8")).toBe("own\n");
    expect(await readFile(join(shared, "pkg", "index.js"), "utf-8")).toBe("keep\n");
  });

  test("GitWorktreeBackend.teardown leaves a linked directory's contents in place", async () => {
    const worktreePath = join(ROOT, ".harness", "sandboxes", "linked", "worktree");
    await makeParentDir(worktreePath);
    const backend = new GitWorktreeBackend();
    await backend.materialize({ root: ROOT, sandboxId: "linked", worktreePath, baseRef: "HEAD" });
    const shared = await makeSharedModules();
    await linkDirectory(shared, join(worktreePath, "node_modules"));
    await linkDirectory(shared, join(worktreePath, "packages", "app", "node_modules"));

    await backend.teardown(
      { root: ROOT, worktreePath, branch: "sandbox/linked" },
      { force: true, keepBranch: false },
    );

    expect(await readFile(join(shared, "pkg", "index.js"), "utf-8")).toBe("keep\n");
    expect(findWorktree(await listWorktrees(ROOT), worktreePath)).toBeUndefined();
    await expect(stat(worktreePath)).rejects.toThrow();
  });

  test("defaultGitOps.removeWorktree leaves a linked directory's contents in place", async () => {
    const worktreePath = join(ROOT, "wt-team-linked");
    await makeParentDir(worktreePath);
    await defaultGitOps.addWorktree(ROOT, "uh/team/m/linked", worktreePath, "HEAD");
    const shared = await makeSharedModules();
    await linkDirectory(shared, join(worktreePath, "node_modules"));

    await defaultGitOps.removeWorktree(ROOT, worktreePath);

    expect(await readFile(join(shared, "pkg", "index.js"), "utf-8")).toBe("keep\n");
    expect(findWorktree(await listWorktrees(ROOT), worktreePath)).toBeUndefined();
    await expect(stat(worktreePath)).rejects.toThrow();
  });
});
