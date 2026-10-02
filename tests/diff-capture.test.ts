import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureDiffWithUntracked } from "../src/harness/diff-capture.js";

const execFileP = promisify(execFile);

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "uh-diff-capture-"));
  await execFileP("git", ["init", "-q", "-b", "main"], { cwd: repo });
  await execFileP("git", ["config", "user.email", "test@test"], { cwd: repo });
  await execFileP("git", ["config", "user.name", "test"], { cwd: repo });
  await writeFile(join(repo, "tracked.txt"), "original\n");
  await execFileP("git", ["add", "tracked.txt"], { cwd: repo });
  await execFileP("git", ["commit", "-q", "-m", "init"], { cwd: repo });
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("captureDiffWithUntracked", () => {
  test("captures modified tracked files in the diff", async () => {
    await writeFile(join(repo, "tracked.txt"), "modified content\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.errors).toBeUndefined();
    expect(result.patch).toContain("diff --git a/tracked.txt b/tracked.txt");
    expect(result.patch).toContain("-original");
    expect(result.patch).toContain("+modified content");
  });

  test("captures new untracked files in the diff (the UH-34 case)", async () => {
    await writeFile(join(repo, "new-output.txt"), "brand new content\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.errors).toBeUndefined();
    expect(result.patch).toContain("diff --git a/new-output.txt b/new-output.txt");
    expect(result.patch).toContain("new file mode");
    expect(result.patch).toContain("+brand new content");
  });

  test("captures both modified and untracked in one diff", async () => {
    await writeFile(join(repo, "tracked.txt"), "modified\n");
    await mkdir(join(repo, "docs"), { recursive: true });
    await writeFile(join(repo, "docs", "new.md"), "# new doc\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.patch).toContain("a/tracked.txt b/tracked.txt");
    expect(result.patch).toContain("a/docs/new.md b/docs/new.md");
  });

  test("respects .gitignore — ignored files do not appear in the diff", async () => {
    await writeFile(join(repo, ".gitignore"), "secret.txt\n");
    await execFileP("git", ["add", ".gitignore"], { cwd: repo });
    await execFileP("git", ["commit", "-q", "-m", "ignore"], { cwd: repo });
    await writeFile(join(repo, "secret.txt"), "do not capture\n");
    await writeFile(join(repo, "visible.txt"), "do capture\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.patch).not.toContain("secret.txt");
    expect(result.patch).toContain("visible.txt");
  });

  test("returns empty patch + errors when cwd is not a git checkout", async () => {
    const nonRepo = await mkdtemp(join(tmpdir(), "uh-not-a-repo-"));
    try {
      const result = await captureDiffWithUntracked(nonRepo);
      expect(result.patch).toBe("");
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain("Diff capture failed");
    } finally {
      await rm(nonRepo, { recursive: true, force: true });
    }
  });

  test("returns an empty patch (no errors) for a clean working tree", async () => {
    const result = await captureDiffWithUntracked(repo);
    expect(result.errors).toBeUndefined();
    expect(result.patch).toBe("");
  });
});
