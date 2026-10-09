import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { changedGitPaths } from "../src/harness/independent-review.js";
import { createSandbox } from "../src/harness/sandbox.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #258: independent review found a worker's changes from `branch.<name>.base`, which nothing set, and from committed
 * changes only. A sandbox now records its fork point, and the review also sees staged, unstaged and new files.
 */
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf-8" }).trim();

async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-review-paths-"));
  dirs.push(root);
  git(root, "init", "--quiet", "-b", "trunk");
  await writeFile(path.join(root, "kept.txt"), "kept\n");
  await writeFile(path.join(root, "edited.txt"), "v1\n");
  await initializeHarness(root);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "init");
  return root;
}

describe("independent review finds what a sandbox worker changed", () => {
  test("a sandbox records the commit it forked from", async () => {
    const root = await project();
    const record = await createSandbox(root, { id: "s1", missionId: "m1" });
    expect(git(root, "config", "--get", `branch.${record.branch}.base`)).toBe(git(root, "rev-parse", "HEAD"));
  });

  test("committed, staged, unstaged and new files are all listed, on a repository whose default branch is not main or master", async () => {
    const root = await project();
    const record = await createSandbox(root, { id: "s2", missionId: "m1" });
    const worktree = path.join(root, record.path);
    await writeFile(path.join(worktree, "committed.txt"), "c\n");
    git(worktree, "add", "committed.txt");
    git(worktree, "commit", "--quiet", "-m", "work");
    await writeFile(path.join(worktree, "edited.txt"), "v2\n");
    await writeFile(path.join(worktree, "staged.txt"), "s\n");
    git(worktree, "add", "staged.txt");
    await writeFile(path.join(worktree, "untracked.txt"), "u\n");
    const paths = (await changedGitPaths(worktree)).sort();
    expect(paths).toEqual(["committed.txt", "edited.txt", "staged.txt", "untracked.txt"]);
  });
});
