import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { markProtectedPathsSkipWorktree } from "../src/harness/team-run.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #260: every tracked file under a protected root was marked skip-worktree, so a worker that edited a protected file
 * the harness never touched stayed invisible to `git status` and to the acceptance diffs. Only files the harness
 * itself rewrote (their work-tree content differs from the index when the worker starts) are hidden.
 */
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf-8" });

describe("skip-worktree on protected paths", () => {
  test("hides the files the harness rewrote and nothing else", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-skip-worktree-"));
    dirs.push(root);
    git(root, "init", "--quiet", "-b", "main");
    await mkdir(path.join(root, ".commandcode"), { recursive: true });
    await mkdir(path.join(root, ".omp"), { recursive: true });
    await writeFile(path.join(root, ".commandcode", "settings.json"), "{}\n");
    await writeFile(path.join(root, ".omp", "keep.json"), "{\"a\":1}\n");
    await writeFile(path.join(root, "src.txt"), "x\n");
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", "init");

    // The harness rewrites one protected file when it sets the worker up.
    await writeFile(path.join(root, ".commandcode", "settings.json"), "{\"hooks\":\"local paths\"}\n");
    await markProtectedPathsSkipWorktree(root);
    expect(git(root, "status", "--porcelain").trim()).toBe("");

    const flagged = git(root, "ls-files", "-v").split(/\r?\n/).filter(line => line.startsWith("S ")).map(line => line.slice(2));
    expect(flagged).toEqual([".commandcode/settings.json"]);

    // A worker edit to a protected file the harness did not touch is visible.
    await writeFile(path.join(root, ".omp", "keep.json"), "{\"a\":2}\n");
    expect(git(root, "status", "--porcelain")).toContain(".omp/keep.json");
  });
});
