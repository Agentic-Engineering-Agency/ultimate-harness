import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultGitOps } from "../src/harness/team-run.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #259, #260: a worker's commit holds exactly the paths inside its write roots. A path staged beforehand outside the
 * roots is not swept in, non-ASCII names are read back as they are, and a declared output that is a whole ignored
 * directory commits its regular files only (no links, no node_modules, no .env).
 */
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.quotepath=off", "-c", "core.symlinks=true", ...args], { cwd, encoding: "utf-8" });
const committed = (cwd: string) => git(cwd, "show", "--name-only", "--format=", "HEAD").split(/\r?\n/).filter(line => line.length > 0).sort();

async function repo(ignore = "") {
  const root = await mkdtemp(path.join(tmpdir(), "uh-commit-scope-"));
  dirs.push(root);
  git(root, "init", "--quiet", "-b", "main");
  await writeFile(path.join(root, ".gitignore"), ignore);
  await writeFile(path.join(root, "base.txt"), "base\n");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "init");
  return root;
}

describe("a worker's commit", () => {
  test("does not take a path staged beforehand outside the write roots", async () => {
    const root = await repo();
    await mkdir(path.join(root, "inside"), { recursive: true });
    await mkdir(path.join(root, "outside"), { recursive: true });
    await writeFile(path.join(root, "inside", "a.txt"), "a\n");
    await writeFile(path.join(root, "outside", "x.txt"), "x\n");
    git(root, "add", "outside/x.txt");
    await defaultGitOps.commitAll(root, "team: worker run", ["inside/a.txt"]);
    expect(committed(root)).toEqual(["inside/a.txt"]);
    expect(git(root, "status", "--porcelain", "--untracked-files=all")).toContain("outside/x.txt");
  });

  test("reads non-ASCII names back as they are and commits them", async () => {
    const root = await repo();
    await writeFile(path.join(root, "café.md"), "c\n");
    await writeFile(path.join(root, "日本語 notes.txt"), "j\n");
    await writeFile(path.join(root, "with space (1).txt"), "q\n");
    const dirty = (await defaultGitOps.dirtyPaths!(root)).sort();
    expect(dirty).toEqual(["café.md", "with space (1).txt", "日本語 notes.txt"].sort());
    await defaultGitOps.commitAll(root, "team: worker run", dirty);
    expect(committed(root)).toEqual(dirty);
  });

  test("a renamed file is reported under its new name", async () => {
    const root = await repo();
    git(root, "mv", "base.txt", "renamed é.txt");
    expect(await defaultGitOps.dirtyPaths!(root)).toContain("renamed é.txt");
  });

  test("a declared output that is an ignored directory commits its regular files only", async () => {
    const root = await repo("out/\n");
    await mkdir(path.join(root, "out", "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(root, "out", "result.json"), "{}\n");
    await writeFile(path.join(root, "out", ".env"), "SECRET=1\n");
    await writeFile(path.join(root, "out", "node_modules", "dep", "index.js"), "x\n");
    let linked = true;
    await symlink(path.join(root, "base.txt"), path.join(root, "out", "link")).catch(() => { linked = false; });
    await defaultGitOps.commitAll(root, "team: worker run", [], ["out"]);
    expect(committed(root)).toEqual(["out/result.json"]);
    expect(linked || true).toBe(true);
  });
});
