/**
 * Directory-backend materialization tests.
 *
 * `git clone --local` hard-links the object store to keep the clone cheap, which
 * only works when the sandbox shares a filesystem with the repository. For a
 * linked worktree whose common git directory lives on another drive, or a
 * network share, git fails with "failed to create link ... Improper link". The
 * backend must drop the partial target directory and retry EXACTLY ONCE with
 * `--no-hardlinks`; every other clone failure is surfaced as-is.
 *
 * The failure paths drive an injected git runner (the seam added to
 * `DirectoryBackend`); the happy path drives real `git` inside a throwaway
 * repository, never the repo under test.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DirectoryBackend, type GitRunner } from "../src/harness/sandbox-backends.js";

const execFileP = promisify(execFile);

let ROOT: string;

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function initGitRepo(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await execFileP("git", ["-C", root, "init", "-q", "-b", "main"]);
  await execFileP("git", ["-C", root, "config", "user.email", "test@example.com"]);
  await execFileP("git", ["-C", root, "config", "user.name", "Test"]);
  await execFileP("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  await execFileP("git", ["-C", root, "config", "core.autocrlf", "false"]);
  await writeFile(join(root, "README.md"), "# Test\n", "utf-8");
  await execFileP("git", ["-C", root, "add", "README.md"]);
  await execFileP("git", ["-C", root, "commit", "-q", "-m", "init"]);
}

function cloneCalls(calls: string[][]): string[][] {
  return calls.filter((args) => args[0] === "clone");
}

beforeEach(async () => {
  ROOT = await realpath(await mkdtemp(join(tmpdir(), "uh-sandbox-backends-")));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

describe("directory backend clone fallback", () => {
  test("a hardlink failure removes the partial target and retries exactly once with --no-hardlinks", async () => {
    const worktreePath = join(ROOT, "sandboxes", "alpha", "worktree");
    const calls: string[][] = [];
    let partialPresentAtRetry: boolean | undefined;

    const runner: GitRunner = async (_cwd, args) => {
      calls.push(args);
      if (args.includes("--local")) {
        // git leaves the half-created target directory behind on this failure.
        await mkdir(join(worktreePath, "objects"), { recursive: true });
        throw new Error(
          `git ${args.join(" ")} failed: fatal: failed to create link 'objects/pack/tmp_pack': Improper link`,
        );
      }
      partialPresentAtRetry = await exists(worktreePath);
      return { stdout: "", stderr: "" };
    };

    const result = await new DirectoryBackend(runner).materialize({
      root: ROOT,
      sandboxId: "alpha",
      worktreePath,
      baseRef: "HEAD",
    });

    expect(result).toEqual({ branch: "sandbox/alpha", base_ref: "HEAD" });
    expect(cloneCalls(calls)).toEqual([
      ["clone", "--local", "--quiet", "--", ROOT, worktreePath],
      ["clone", "--no-hardlinks", "--quiet", "--", ROOT, worktreePath],
    ]);
    // The retry starts from a clean slate, not on top of the partial clone.
    expect(partialPresentAtRetry).toBe(false);
  });

  test("a non-hardlink clone failure is not retried", async () => {
    const worktreePath = join(ROOT, "sandboxes", "beta", "worktree");
    const calls: string[][] = [];

    const runner: GitRunner = async (_cwd, args) => {
      calls.push(args);
      throw new Error(
        `git ${args.join(" ")} failed: fatal: repository '${ROOT}' does not exist`,
      );
    };

    await expect(
      new DirectoryBackend(runner).materialize({
        root: ROOT,
        sandboxId: "beta",
        worktreePath,
        baseRef: "HEAD",
      }),
    ).rejects.toThrow(/does not exist/);

    expect(cloneCalls(calls)).toHaveLength(1);
    expect(calls.some((args) => args.includes("--no-hardlinks"))).toBe(false);
  });

  test("the --no-hardlinks retry is not retried again", async () => {
    const worktreePath = join(ROOT, "sandboxes", "gamma", "worktree");
    const calls: string[][] = [];

    const runner: GitRunner = async (_cwd, args) => {
      calls.push(args);
      if (args.includes("--local")) {
        throw new Error(
          `git ${args.join(" ")} failed: fatal: failed to create link 'objects/pack': Improper link`,
        );
      }
      throw new Error(`git ${args.join(" ")} failed: fatal: could not create work tree dir`);
    };

    await expect(
      new DirectoryBackend(runner).materialize({
        root: ROOT,
        sandboxId: "gamma",
        worktreePath,
        baseRef: "HEAD",
      }),
    ).rejects.toThrow(/could not create work tree dir/);

    const clones = cloneCalls(calls);
    expect(clones).toHaveLength(2);
    expect(clones[1]).toContain("--no-hardlinks");
  });

  test("a real clone of a temporary repository still succeeds", async () => {
    const repo = join(ROOT, "repo");
    await initGitRepo(repo);
    const sandboxDir = join(ROOT, "sandboxes", "real");
    const worktreePath = join(sandboxDir, "worktree");
    await mkdir(sandboxDir, { recursive: true });

    const result = await new DirectoryBackend().materialize({
      root: repo,
      sandboxId: "real",
      worktreePath,
      baseRef: "HEAD",
    });

    expect(result).toEqual({ branch: "sandbox/real", base_ref: "HEAD" });
    // Self-contained clone: its own .git, the committed tree, its own branch.
    await expect(stat(join(worktreePath, ".git"))).resolves.toBeTruthy();
    expect(await readFile(join(worktreePath, "README.md"), "utf-8")).toMatch(/^# Test\r?\n$/);
    const { stdout } = await execFileP("git", ["-C", worktreePath, "branch", "--show-current"]);
    expect(stdout.trim()).toBe("sandbox/real");
  });
});
