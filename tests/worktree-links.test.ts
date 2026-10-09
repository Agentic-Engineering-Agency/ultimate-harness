import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeWorktreeLinks } from "../src/harness/worktree-links.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true }); });

/**
 * #258: sandbox teardown removed every link in the worktree, tracked ones too, so a link the project itself commits
 * made a clean worktree look changed and a non-forced discard fail. Only links git does not track are removed.
 */
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.symlinks=true", ...args], { cwd, encoding: "utf-8" });
const exists = (target: string) => lstat(target).then(() => true, () => false);

async function repoWithLinks(): Promise<{ root: string; skip: boolean }> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-links-"));
  dirs.push(root);
  git(root, "init", "--quiet", "-b", "main");
  await writeFile(path.join(root, "target.txt"), "x");
  await mkdir(path.join(root, "shared"), { recursive: true });
  await writeFile(path.join(root, "shared", "a.txt"), "a");
  try {
    await symlink("target.txt", path.join(root, "tracked-link"));
  } catch {
    return { root, skip: true };
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "init");
  await symlink("shared", path.join(root, "untracked-link"), "junction").catch(() => symlink(path.join(root, "shared"), path.join(root, "untracked-link")));
  return { root, skip: false };
}

describe("removeWorktreeLinks", () => {
  test("keeps a link git tracks and removes the ones it does not", async () => {
    const { root, skip } = await repoWithLinks();
    if (skip) return;
    expect(git(root, "ls-files", "-s", "tracked-link")).toMatch(/^120000 /);
    const removed = await removeWorktreeLinks(root);
    expect(removed).toBe(1);
    expect(await exists(path.join(root, "tracked-link"))).toBe(true);
    expect(await exists(path.join(root, "untracked-link"))).toBe(false);
    expect(await exists(path.join(root, "shared", "a.txt"))).toBe(true);
    expect(git(root, "status", "--porcelain").trim()).toBe("");
  });

  test("outside a git work tree every link is removed, as before", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-links-plain-"));
    dirs.push(root);
    await writeFile(path.join(root, "t.txt"), "x");
    try { await symlink("t.txt", path.join(root, "l")); } catch { return; }
    expect(await removeWorktreeLinks(root)).toBe(1);
    expect(await exists(path.join(root, "l"))).toBe(false);
  });
});
