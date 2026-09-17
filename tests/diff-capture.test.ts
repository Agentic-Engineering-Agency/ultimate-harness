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

  test("captures new untracked files without mutating the index", async () => {
    await writeFile(join(repo, "new-output.txt"), "brand new content\n");
    const before = (await execFileP("git", ["write-tree"], { cwd: repo })).stdout.trim();
    const result = await captureDiffWithUntracked(repo);
    const after = (await execFileP("git", ["write-tree"], { cwd: repo })).stdout.trim();
    expect(result.errors).toBeUndefined();
    expect(result.patch).toContain("diff --git a/new-output.txt b/new-output.txt");
    expect(before).toBe(after);
  });

  test("captures both modified and untracked in one diff", async () => {
    await writeFile(join(repo, "tracked.txt"), "modified\n");
    await mkdir(join(repo, "docs"), { recursive: true });
    await writeFile(join(repo, "docs", "new.md"), "# new doc\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.patch).toContain("a/tracked.txt b/tracked.txt");
    expect(result.patch).toContain("a/docs/new.md b/docs/new.md");
  });
  test("captures staged and unstaged text plus tracked and untracked binary hunks", async () => {
    await writeFile(join(repo, "tracked.bin"), Buffer.from([0, 1, 2, 3]));
    await execFileP("git", ["add", "tracked.bin"], { cwd: repo });
    await execFileP("git", ["commit", "-q", "-m", "binary baseline"], { cwd: repo });

    await writeFile(join(repo, "tracked.txt"), "staged then unstaged\n");
    await execFileP("git", ["add", "tracked.txt"], { cwd: repo });
    await writeFile(join(repo, "tracked.txt"), "staged and unstaged final\n");
    await writeFile(join(repo, "tracked.bin"), Buffer.from([0, 9, 8, 7]));
    await execFileP("git", ["add", "tracked.bin"], { cwd: repo });
    await writeFile(join(repo, "new.txt"), "new text\n");
    await writeFile(join(repo, "new.bin"), Buffer.from([9, 8, 7, 0]));

    const before = (await execFileP("git", ["write-tree"], { cwd: repo })).stdout.trim();
    const result = await captureDiffWithUntracked(repo);
    const after = (await execFileP("git", ["write-tree"], { cwd: repo })).stdout.trim();
    expect(result.errors).toBeUndefined();
    expect(result.patch).toContain("+staged and unstaged final");
    expect(result.patch).toContain("tracked.bin");
    expect(result.patch).toContain("new.txt");
    expect(result.patch).toContain("new.bin");
    expect(result.patch).toContain("GIT binary patch");
    expect(after).toBe(before);

    const cleanBase = await mkdtemp(join(tmpdir(), "uh-diff-apply-"));
    try {
      await execFileP("git", ["clone", "-q", repo, cleanBase]);
      const patchPath = join(cleanBase, "captured.patch");
      await writeFile(patchPath, result.patch);
      await execFileP("git", ["apply", "--check", "captured.patch"], { cwd: cleanBase });
    } finally {
      await rm(cleanBase, { recursive: true, force: true });
    }
  });

  test("retains harness configuration while excluding generated bookkeeping", async () => {
    await mkdir(join(repo, ".harness", "adapters"), { recursive: true });
    await writeFile(join(repo, ".harness", "adapters", "config.yaml"), "model: test\n");
    await execFileP("git", ["add", ".harness/adapters/config.yaml"], { cwd: repo });
    await execFileP("git", ["commit", "-q", "-m", "harness config"], { cwd: repo });
    await writeFile(join(repo, ".harness", "adapters", "config.yaml"), "model: changed\n");
    await mkdir(join(repo, ".harness", "missions", "m1", "runs", "old"), { recursive: true });
    await writeFile(join(repo, ".harness", "missions", "m1", "runs", "old", "events.ndjson"), "{\"event\":\"private\"}\n");
    await writeFile(join(repo, ".harness", "missions", "m1", "latest.json"), "{\"run_id\":\"old\"}\n");
    const result = await captureDiffWithUntracked(repo);
    expect(result.patch).toContain(".harness/adapters/config.yaml");
    expect(result.patch).not.toContain("events.ndjson");
    expect(result.patch).not.toContain("latest.json");
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

  test("reports an error for a repository without HEAD instead of dropping staged content", async () => {
    const noHead = await mkdtemp(join(tmpdir(), "uh-no-head-"));
    try {
      await execFileP("git", ["init", "-q"], { cwd: noHead });
      await writeFile(join(noHead, "staged.txt"), "staged\n");
      await execFileP("git", ["add", "staged.txt"], { cwd: noHead });
      const result = await captureDiffWithUntracked(noHead);
      expect(result.patch).toBe("");
      expect(result.errors?.[0]).toContain("Diff capture failed");
    } finally {
      await rm(noHead, { recursive: true, force: true });
    }
  });

  test("returns an empty patch (no errors) for a clean working tree", async () => {
    const result = await captureDiffWithUntracked(repo);
    expect(result.errors).toBeUndefined();
    expect(result.patch).toBe("");
  });
});
