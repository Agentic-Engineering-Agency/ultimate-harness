import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { changedConfigKeys, executableConfigEntries } from "../src/harness/harness-git.js";
import { defaultLandGitRunner } from "../src/harness/land.js";
import { defaultGitOps } from "../src/harness/team-run.js";

const execFileP = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });

async function repoWithHooks(): Promise<{ root: string; marker: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-harness-git-"));
  roots.push(root);
  const git = (args: string[]) => execFileP("git", args, { cwd: root });
  await git(["init", "--quiet", "--initial-branch=main"]);
  await git(["config", "user.name", "uh test"]);
  await git(["config", "user.email", "uh-test@example.com"]);
  await writeFile(path.join(root, "README.md"), "seed\n", "utf-8");
  await git(["add", "-A"]);
  await git(["commit", "--quiet", "-m", "seed"]);
  const hooks = path.join(root, "custom-hooks");
  await mkdir(hooks);
  const marker = path.join(root, "hook-ran");
  for (const name of ["pre-commit", "commit-msg", "post-commit", "pre-merge-commit", "post-merge"]) {
    await writeFile(path.join(hooks, name), `#!/bin/sh\necho ${name} >> "${marker}"\n`, "utf-8");
    await chmod(path.join(hooks, name), 0o755);
  }
  await git(["config", "core.hooksPath", hooks]);
  return { root, marker };
}

describe.skipIf(process.platform === "win32")("harness git calls run no configured hook", () => {
  test("the configured hooks run for a plain commit, so the fixture is live", async () => {
    const { root, marker } = await repoWithHooks();
    await execFileP("git", ["commit", "--quiet", "--allow-empty", "-m", "plain"], { cwd: root });
    expect(existsSync(marker)).toBe(true);
  });

  test("uh land's git runner commits without running them", async () => {
    const { root, marker } = await repoWithHooks();
    const committed = await defaultLandGitRunner(["commit", "--no-verify", "--allow-empty", "-m", "land"], root);
    expect(committed.exitCode).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  test("the team runner's commit and merge run without them", async () => {
    const { root, marker } = await repoWithHooks();
    await execFileP("git", ["branch", "side"], { cwd: root });
    await writeFile(path.join(root, "a.txt"), "a\n", "utf-8");
    await defaultGitOps.commitAll(root, "worker run");
    await execFileP("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--quiet", "side"], { cwd: root });
    await writeFile(path.join(root, "b.txt"), "b\n", "utf-8");
    await defaultGitOps.commitAll(root, "side run");
    const merged = await defaultGitOps.merge(root, "main");
    expect(merged.conflicted).toBe(false);
    expect(merged.failed).toBeFalsy();
    expect(existsSync(marker)).toBe(false);
  });
});

describe("program-naming repository configuration", () => {
  test("only keys that name a program or more configuration are compared", () => {
    const listing = ["core.bare\nfalse", "core.hookspath\n.hooks", "user.name\nx", "includeif.gitdir:/x/.path\n../c", "alias.st\n!sh", "filter.lfs.clean\ngit-lfs clean"].join("\0");
    expect(executableConfigEntries(listing)).toEqual(["core.hookspath=.hooks", "includeif.gitdir:/x/.path=../c", "alias.st=!sh", "filter.lfs.clean=git-lfs clean"]);
  });

  test("changed keys are reported once each, sorted", () => {
    expect(changedConfigKeys(["core.hookspath=a", "alias.st=x"], ["alias.st=x"])).toEqual(["core.hookspath"]);
    expect(changedConfigKeys(["alias.st=x"], ["alias.st=x", "include.path=y", "include.path=z"])).toEqual(["include.path"]);
    expect(changedConfigKeys(["alias.st=x"], ["alias.st=x"])).toEqual([]);
  });

  test("the default git ops restore a changed entry and remove an added one", async () => {
    const { root } = await repoWithHooks();
    const before = await defaultGitOps.executableConfig!(root);
    await execFileP("git", ["config", "core.hooksPath", "elsewhere"], { cwd: root });
    await execFileP("git", ["config", "--add", "include.path", "../extra"], { cwd: root });
    expect(changedConfigKeys(before, await defaultGitOps.executableConfig!(root))).toEqual(["core.hookspath", "include.path"]);
    await defaultGitOps.restoreExecutableConfig!(root, before);
    expect(await defaultGitOps.executableConfig!(root)).toEqual(before);
  });
});
