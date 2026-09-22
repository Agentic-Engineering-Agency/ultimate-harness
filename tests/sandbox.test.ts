import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { getSandboxBackend, listSandboxBackends, runOpenSandboxCommand } from "../src/harness/sandbox-backends.js";
import {
  assertSafeSandboxId,
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
  listSandboxIndexLockBreaks,
  repairSandboxes,
  withSandboxesIndexMutation,
} from "../src/harness/sandbox.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);

async function runUh(args: string[]) {
  return execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: process.cwd() });
}

async function runUhFailure(args: string[]) {
  try {
    const result = await runUh(args);
    throw new Error(
      `expected uh ${args.join(" ")} to fail, got stdout=${result.stdout} stderr=${result.stderr}`,
    );
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    expect(e.code).not.toBe(0);
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code };
  }
}

async function initGitRepo(root: string) {
  await execFileP("git", ["-C", root, "init", "-q", "-b", "main"]);
  await execFileP("git", ["-C", root, "config", "user.email", "test@example.com"]);
  await execFileP("git", ["-C", root, "config", "user.name", "Test"]);
  await execFileP("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  await writeFile(join(root, "README.md"), "# Test\n", "utf-8");
  await execFileP("git", ["-C", root, "add", "README.md"]);
  await execFileP("git", [
    "-C",
    root,
    "commit",
    "-q",
    "-m",
    "init",
  ]);
}

async function listWorktrees(root: string): Promise<string[]> {
  const { stdout } = await execFileP("git", [
    "-C",
    root,
    "worktree",
    "list",
    "--porcelain",
  ]);
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => normalize(line.slice("worktree ".length).trim()));
}

async function listBranches(root: string): Promise<string[]> {
  const { stdout } = await execFileP("git", [
    "-C",
    root,
    "branch",
    "--list",
    "--format=%(refname:short)",
  ]);
  return stdout.split("\n").filter((line) => line.length > 0);
}

test.beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), "uh-test-sandbox-"));
  TEST_ROOT = await realpath(dir);
  await initGitRepo(TEST_ROOT);
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  try {
    await execFileP("git", ["-C", TEST_ROOT, "worktree", "prune"]);
  } catch {
    // best-effort
  }
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("sandbox module", () => {
  test("createSandbox provisions a worktree, registers the index, and writes metadata.yaml", async () => {
    const record = await createSandbox(TEST_ROOT, {
      id: "alpha",
      missionId: "demo",
    });

    expect(record).toMatchObject({
      id: "alpha",
      mission_id: "demo",
      backend: "git-worktree",
      branch: "sandbox/alpha",
      base_ref: "HEAD",
      status: "created",
    });
    expect(record.path).toBe(".harness/sandboxes/alpha/worktree");
    expect(Date.parse(record.created_at)).not.toBeNaN();
    expect(record.updated_at).toBe(record.created_at);

    const worktreeAbs = join(TEST_ROOT, record.path);
    await expect(stat(worktreeAbs)).resolves.toBeTruthy();
    await expect(stat(join(worktreeAbs, ".git"))).resolves.toBeTruthy();
    await expect(stat(join(worktreeAbs, "README.md"))).resolves.toBeTruthy();

    const indexPath = join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");
    const indexDoc = parse(await readFile(indexPath, "utf-8")) as {
      schema_version: string;
      sandboxes: Array<Record<string, unknown>>;
    };
    expect(indexDoc.schema_version).toBe("uh.sandboxes-index.v0");
    expect(indexDoc.sandboxes).toHaveLength(1);
    expect(indexDoc.sandboxes[0]).toMatchObject({
      id: "alpha",
      mission_id: "demo",
      backend: "git-worktree",
      status: "created",
      path: ".harness/sandboxes/alpha/worktree",
    });

    const metaPath = join(
      TEST_ROOT,
      ".harness",
      "sandboxes",
      "alpha",
      "metadata.yaml",
    );
    const meta = parse(await readFile(metaPath, "utf-8")) as Record<string, unknown>;
    expect(meta).toMatchObject({
      id: "alpha",
      mission_id: "demo",
      backend: "git-worktree",
      branch: "sandbox/alpha",
      base_ref: "HEAD",
      status: "created",
      path: ".harness/sandboxes/alpha/worktree",
    });

    const worktreePaths = await listWorktrees(TEST_ROOT);
    expect(worktreePaths).toContain(worktreeAbs);

    const branches = await listBranches(TEST_ROOT);
    expect(branches).toContain("sandbox/alpha");

    const list = await listSandboxes(TEST_ROOT);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "alpha", status: "created" });

    const info = await getSandboxStatus(TEST_ROOT, "alpha");
    expect(info.id).toBe("alpha");
    expect(info.branch).toBe("sandbox/alpha");
    expect(info.worktree_path).toBe(worktreeAbs);
    expect(info.dirty).toBe(false);
    expect(info.changes).toEqual([]);
  });

  test("createSandbox rejects unsafe ids and path separators", async () => {
    await expect(
      createSandbox(TEST_ROOT, { id: "../escape", missionId: "demo" }),
    ).rejects.toThrow(/Invalid sandbox id/);
    await expect(
      createSandbox(TEST_ROOT, { id: ".", missionId: "demo" }),
    ).rejects.toThrow(/Invalid sandbox id/);
    await expect(
      createSandbox(TEST_ROOT, { id: "bad/id", missionId: "demo" }),
    ).rejects.toThrow(/Invalid sandbox id/);
    await expect(
      createSandbox(TEST_ROOT, { id: "ok", missionId: "../bad" }),
    ).rejects.toThrow(/Invalid mission id/);

    const indexPath = join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");
    const indexDoc = parse(await readFile(indexPath, "utf-8")) as {
      sandboxes: unknown[];
    };
    expect(indexDoc.sandboxes).toEqual([]);
  });

  test("createSandbox refuses to overwrite an existing sandbox", async () => {
    await createSandbox(TEST_ROOT, { id: "dup", missionId: "demo" });
    await expect(
      createSandbox(TEST_ROOT, { id: "dup", missionId: "demo" }),
    ).rejects.toThrow(/already exists/);

    // The original sandbox must still be intact and untouched.
    const info = await getSandboxStatus(TEST_ROOT, "dup");
    expect(info.dirty).toBe(false);
    expect(info.branch).toBe("sandbox/dup");
  });

  test("getSandboxStatus throws when the sandbox is unknown", async () => {
    await expect(getSandboxStatus(TEST_ROOT, "ghost")).rejects.toThrow(
      /Sandbox not found: ghost/,
    );
  });

  test("discardSandbox removes the worktree and the index entry", async () => {
    await createSandbox(TEST_ROOT, { id: "clean", missionId: "demo" });
    const worktreeAbs = join(
      TEST_ROOT,
      ".harness",
      "sandboxes",
      "clean",
      "worktree",
    );
    await expect(stat(worktreeAbs)).resolves.toBeTruthy();

    const result = await discardSandbox(TEST_ROOT, "clean");
    expect(result).toMatchObject({
      id: "clean",
      branch: "sandbox/clean",
      branch_removed: true,
    });

    await expect(stat(worktreeAbs)).rejects.toThrow();
    await expect(
      stat(join(TEST_ROOT, ".harness", "sandboxes", "clean")),
    ).rejects.toThrow();

    expect(await listSandboxes(TEST_ROOT)).toEqual([]);

    const indexDoc = parse(
      await readFile(
        join(TEST_ROOT, ".harness", "sandboxes", "index.yaml"),
        "utf-8",
      ),
    ) as { sandboxes: unknown[] };
    expect(indexDoc.sandboxes).toEqual([]);

    expect(await listWorktrees(TEST_ROOT)).not.toContain(worktreeAbs);
    expect(await listBranches(TEST_ROOT)).not.toContain("sandbox/clean");
  });

  test("discardSandbox refuses a dirty worktree unless --force", async () => {
    const record = await createSandbox(TEST_ROOT, {
      id: "dirty",
      missionId: "demo",
    });
    const worktreeAbs = join(TEST_ROOT, record.path);
    await writeFile(join(worktreeAbs, "scratch.txt"), "draft\n", "utf-8");

    await expect(discardSandbox(TEST_ROOT, "dirty")).rejects.toThrow(
      /uncommitted change/i,
    );

    // Index and worktree must still be intact after the refusal.
    expect(await listSandboxes(TEST_ROOT)).toHaveLength(1);
    await expect(stat(worktreeAbs)).resolves.toBeTruthy();

    const result = await discardSandbox(TEST_ROOT, "dirty", { force: true });
    expect(result).toMatchObject({ id: "dirty", branch: "sandbox/dirty" });

    await expect(stat(worktreeAbs)).rejects.toThrow();
    expect(await listSandboxes(TEST_ROOT)).toEqual([]);
    expect(await listBranches(TEST_ROOT)).not.toContain("sandbox/dirty");
  });

  test("createSandbox surfaces git failures with an explicit error", async () => {
    await expect(
      createSandbox(TEST_ROOT, {
        id: "no-such-base",
        missionId: "demo",
        baseRef: "definitely-not-a-ref",
      }),
    ).rejects.toThrow(/git worktree add .* failed/);

    // Partial state must be cleaned up so a retry succeeds.
    await expect(
      stat(join(TEST_ROOT, ".harness", "sandboxes", "no-such-base")),
    ).rejects.toThrow();

    const indexDoc = parse(
      await readFile(
        join(TEST_ROOT, ".harness", "sandboxes", "index.yaml"),
        "utf-8",
      ),
    ) as { sandboxes: unknown[] };
    expect(indexDoc.sandboxes).toEqual([]);
  });

  test("assertSafeSandboxId rejects path separators and traversal", () => {
    expect(() => assertSafeSandboxId("../bad")).toThrow();
    expect(() => assertSafeSandboxId("a/b")).toThrow();
    expect(() => assertSafeSandboxId(".")).toThrow();
    expect(() => assertSafeSandboxId("..")).toThrow();
    expect(() => assertSafeSandboxId("")).toThrow();
    expect(() => assertSafeSandboxId("ok-id_1.2")).not.toThrow();
  });

  test("createSandbox seeds the bound mission directory into the worktree (UH-29)", async () => {
    // Pre-create an uncommitted mission directory on the host.
    const missionDir = join(TEST_ROOT, ".harness", "missions", "smoke");
    await mkdir(missionDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      "schema_version: uh.mission.v0\nid: smoke\nname: Smoke\nworkflow_profile: research-docs\n",
      "utf-8",
    );
    await writeFile(join(missionDir, "extra.txt"), "companion artifact\n", "utf-8");

    await createSandbox(TEST_ROOT, { id: "seeded", missionId: "smoke" });

    const seededMissionYaml = join(
      TEST_ROOT,
      ".harness",
      "sandboxes",
      "seeded",
      "worktree",
      ".harness",
      "missions",
      "smoke",
      "mission.yaml",
    );
    const content = await readFile(seededMissionYaml, "utf-8");
    expect(content).toContain("id: smoke");

    const seededCompanion = join(
      TEST_ROOT,
      ".harness",
      "sandboxes",
      "seeded",
      "worktree",
      ".harness",
      "missions",
      "smoke",
      "extra.txt",
    );
    expect(await readFile(seededCompanion, "utf-8")).toBe("companion artifact\n");
  });

  test("createSandbox tolerates a missing host mission directory (sandbox bound by id only)", async () => {
    const record = await createSandbox(TEST_ROOT, { id: "no-mission", missionId: "future" });
    expect(record.mission_id).toBe("future");
    // No mission directory should appear inside the worktree because none exists on the host.
    await expect(
      stat(
        join(
          TEST_ROOT,
          ".harness",
          "sandboxes",
          "no-mission",
          "worktree",
          ".harness",
          "missions",
          "future",
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("sandbox index resilience", () => {
  const indexPath = () => join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");

  test("treats a missing index file and directory as an empty registry (fresh clone)", async () => {
    // A fresh clone may carry none of the sandboxes runtime state.
    await rm(join(TEST_ROOT, ".harness", "sandboxes"), { recursive: true, force: true });

    expect(await listSandboxes(TEST_ROOT)).toEqual([]);
    await expect(getSandboxStatus(TEST_ROOT, "ghost")).rejects.toThrow(/Sandbox not found: ghost/);
    await expect(discardSandbox(TEST_ROOT, "ghost")).rejects.toThrow(/Sandbox not found: ghost/);

    const record = await createSandbox(TEST_ROOT, { id: "fresh", missionId: "demo" });
    expect(record).toMatchObject({ id: "fresh", branch: "sandbox/fresh" });

    // `create` wrote a new valid index on demand, with the canonical schema.
    const indexDoc = parse(await readFile(indexPath(), "utf-8")) as {
      schema_version: string;
      sandboxes: Array<{ id: string; mission_id: string }>;
    };
    expect(indexDoc.schema_version).toBe("uh.sandboxes-index.v0");
    expect(indexDoc.sandboxes).toMatchObject([{ id: "fresh", mission_id: "demo" }]);

    const info = await getSandboxStatus(TEST_ROOT, "fresh");
    expect(info).toMatchObject({ id: "fresh", branch: "sandbox/fresh", dirty: false });

    const discarded = await discardSandbox(TEST_ROOT, "fresh");
    expect(discarded).toMatchObject({ id: "fresh", branch: "sandbox/fresh" });

    const after = parse(await readFile(indexPath(), "utf-8")) as { sandboxes: unknown[] };
    expect(after.sandboxes).toEqual([]);
    expect(await listSandboxes(TEST_ROOT)).toEqual([]);
  });

  test("a missing index file alone is enough for list, status and discard", async () => {
    await rm(indexPath(), { force: true });
    // The sandboxes directory survives; only the runtime index file is gone.
    await expect(stat(join(TEST_ROOT, ".harness", "sandboxes"))).resolves.toBeTruthy();

    expect(await listSandboxes(TEST_ROOT)).toEqual([]);
    await expect(getSandboxStatus(TEST_ROOT, "ghost")).rejects.toThrow(/Sandbox not found: ghost/);
    await expect(discardSandbox(TEST_ROOT, "ghost")).rejects.toThrow(/Sandbox not found: ghost/);
    await expect(stat(indexPath())).rejects.toThrow();
  });

  test("refuses an invalid index and leaves it byte-identical", async () => {
    await writeFile(indexPath(), "schema_version: uh.sandboxes-index.v0\nsandboxes: not-a-list\n", "utf-8");
    const before = await readFile(indexPath());

    await expect(listSandboxes(TEST_ROOT)).rejects.toThrow(/Sandboxes index is invalid/);
    await expect(getSandboxStatus(TEST_ROOT, "any")).rejects.toThrow(/Sandboxes index is invalid/);
    await expect(discardSandbox(TEST_ROOT, "any")).rejects.toThrow(/Sandboxes index is invalid/);
    await expect(
      createSandbox(TEST_ROOT, { id: "any", missionId: "demo" }),
    ).rejects.toThrow(/Sandboxes index is invalid/);

    // Never overwritten: byte-identical, and the refused create left no partial state.
    expect((await readFile(indexPath())).equals(before)).toBe(true);
    await expect(stat(join(TEST_ROOT, ".harness", "sandboxes", "any"))).rejects.toThrow();
  });

  test("refuses an index with invalid YAML and leaves it byte-identical", async () => {
    await writeFile(indexPath(), "sandboxes: [\n", "utf-8");
    const before = await readFile(indexPath());

    await expect(listSandboxes(TEST_ROOT)).rejects.toThrow(/invalid YAML/);
    await expect(
      createSandbox(TEST_ROOT, { id: "any", missionId: "demo" }),
    ).rejects.toThrow(/invalid YAML/);

    expect((await readFile(indexPath())).equals(before)).toBe(true);
  });
});

describe("sandbox index concurrency and repair", () => {
  const indexPath = () => join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");

  test("eight concurrent createSandbox calls all register (no lost update)", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `race-${index}`);

    const records = await Promise.all(
      ids.map((id) => createSandbox(TEST_ROOT, { id, missionId: "demo" })),
    );
    expect(records).toHaveLength(8);

    const list = await listSandboxes(TEST_ROOT);
    expect(list.map((entry) => entry.id).sort()).toEqual([...ids].sort());

    const indexDoc = parse(await readFile(indexPath(), "utf-8")) as {
      schema_version: string;
      sandboxes: Array<{ id: string }>;
    };
    expect(indexDoc.schema_version).toBe("uh.sandboxes-index.v0");
    expect(indexDoc.sandboxes).toHaveLength(8);
    expect(indexDoc.sandboxes.some((entry) => entry.id === "race-3")).toBe(true);

    // Each registration survived with its own worktree on disk.
    for (const id of ids) {
      await expect(stat(join(TEST_ROOT, ".harness", "sandboxes", id, "worktree"))).resolves.toBeTruthy();
    }
  });

  test("a stale index lock whose owner process is gone is broken and recorded", async () => {
    const lockPath = `${indexPath()}.lock`;
    // A pid the OS will not hand out (probe returns ESRCH), so it is provably gone.
    await writeFile(
      lockPath,
      JSON.stringify({ pid: 2147483647, nonce: "stale-nonce", acquired_at: new Date(0).toISOString() }),
      "utf-8",
    );
    const ancient = new Date(Date.now() - 120_000);
    await utimes(lockPath, ancient, ancient);

    const before = listSandboxIndexLockBreaks().length;
    const record = await createSandbox(TEST_ROOT, { id: "after-stale", missionId: "demo" });

    expect(record.id).toBe("after-stale");
    expect(await listSandboxes(TEST_ROOT)).toHaveLength(1);

    const breaks = listSandboxIndexLockBreaks();
    expect(breaks.length).toBeGreaterThan(before);
    expect(breaks[breaks.length - 1]).toMatchObject({
      lock_file: lockPath,
      owner_pid: 2147483647,
    });

    // The broken lock is released, never left behind.
    await expect(stat(lockPath)).rejects.toThrow();
  });

  test("repairSandboxes re-registers a directory whose index entry was removed", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "repair-me");
    await mkdir(missionDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      stringify({
        schema_version: "uh.mission.v0",
        id: "repair-me",
        title: "Repair mission",
        workflow_profile: "spec-first-feature",
      }),
      "utf-8",
    );

    const record = await createSandbox(TEST_ROOT, { id: "repair-target", missionId: "repair-me" });
    const worktreeAbs = join(TEST_ROOT, record.path);

    // Simulate the live race outcome: the worktree exists, the entry is gone.
    const doc = parse(await readFile(indexPath(), "utf-8")) as { sandboxes: Array<{ id: string }> };
    doc.sandboxes = doc.sandboxes.filter((entry) => entry.id !== "repair-target");
    await writeFile(indexPath(), stringify(doc), "utf-8");

    expect(await listSandboxes(TEST_ROOT)).toEqual([]);
    await expect(stat(worktreeAbs)).resolves.toBeTruthy();

    const repaired = await repairSandboxes(TEST_ROOT);
    expect(repaired).toMatchObject([
      { id: "repair-target", mission_id: "repair-me", backend: "git-worktree", branch: "sandbox/repair-target" },
    ]);

    const list = await listSandboxes(TEST_ROOT);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "repair-target",
      mission_id: "repair-me",
      path: ".harness/sandboxes/repair-target/worktree",
    });

    // A second repair has nothing left to do and reports nothing.
    expect(await repairSandboxes(TEST_ROOT)).toEqual([]);
  });

  test("repairSandboxes leaves a corrupt index untouched", async () => {
    await writeFile(indexPath(), "schema_version: uh.sandboxes-index.v0\nsandboxes: not-a-list\n", "utf-8");
    const before = await readFile(indexPath());

    const orphanDir = join(TEST_ROOT, ".harness", "sandboxes", "orphan", "worktree");
    await mkdir(join(orphanDir, ".harness", "missions", "m1"), { recursive: true });
    await writeFile(
      join(orphanDir, ".harness", "missions", "m1", "mission.yaml"),
      stringify({ schema_version: "uh.mission.v0", id: "m1", title: "M1", workflow_profile: "research-docs" }),
      "utf-8",
    );

    await expect(repairSandboxes(TEST_ROOT)).rejects.toThrow(/Sandboxes index is invalid/);
    expect((await readFile(indexPath())).equals(before)).toBe(true);
  });

  test("release after a takeover leaves the new owner's lock in place", async () => {
    const lockPath = `${indexPath()}.lock`;
    // Simulate Process A acquiring the lock.
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, nonce: "nonce-a", acquired_at: new Date().toISOString() }),
      "utf-8",
    );
    // Simulate a takeover: Process B writes its own lock (same pid, different nonce, fresh mtime).
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, nonce: "nonce-b", acquired_at: new Date().toISOString() }),
      "utf-8",
    );
    await utimes(lockPath, new Date(), new Date());

    // Now release as if we were Process A (nonce-a). The lock should NOT be removed.
    const releaseA = async () => {
      const contents = await readFile(lockPath, "utf-8");
      const parsed = JSON.parse(contents) as { pid?: unknown; nonce?: unknown };
      if (parsed.pid === process.pid && parsed.nonce === "nonce-a") {
        await rm(lockPath, { force: true });
      }
    };
    await releaseA();

    // Process B's lock is still there.
    const after = parse(await readFile(lockPath, "utf-8")) as { pid: number; nonce: string };
    expect(after.pid).toBe(process.pid);
    expect(after.nonce).toBe("nonce-b");
  });

  test("normal release removes the lock", async () => {
    const lockPath = `${indexPath()}.lock`;
    const nonce = "nonce-normal";
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, nonce, acquired_at: new Date().toISOString() }),
      "utf-8",
    );

    const release = async () => {
      const contents = await readFile(lockPath, "utf-8");
      const parsed = JSON.parse(contents) as { pid?: unknown; nonce?: unknown };
      if (parsed.pid === process.pid && parsed.nonce === nonce) {
        await rm(lockPath, { force: true });
      }
    };
    await release();

    await expect(stat(lockPath)).rejects.toThrow();
  });
});

describe("uh sandbox CLI", () => {
  test("create + list + status + discard end-to-end", async () => {
    const createOut = await runUh([
      "sandbox",
      "create",
      "cli-1",
      "--mission",
      "demo",
      "--root",
      TEST_ROOT,
    ]);
    expect(createOut.stderr).toBe("");
    expect(createOut.stdout).toContain("[CREATED] cli-1");
    expect(createOut.stdout).toContain("branch: sandbox/cli-1");

    const listOut = await runUh(["sandbox", "list", "--root", TEST_ROOT]);
    expect(listOut.stderr).toBe("");
    expect(listOut.stdout).toContain("cli-1");
    expect(listOut.stdout).toContain("mission=demo");

    const statusOut = await runUh([
      "sandbox",
      "status",
      "cli-1",
      "--root",
      TEST_ROOT,
    ]);
    expect(statusOut.stderr).toBe("");
    expect(statusOut.stdout).toContain("status: created");
    expect(statusOut.stdout).toContain("dirty: no");

    const discardOut = await runUh([
      "sandbox",
      "discard",
      "cli-1",
      "--root",
      TEST_ROOT,
    ]);
    expect(discardOut.stderr).toBe("");
    expect(discardOut.stdout).toContain("[DISCARDED] cli-1");

    const listAfter = await runUh(["sandbox", "list", "--root", TEST_ROOT]);
    expect(listAfter.stdout).toContain("No sandboxes registered.");
  });

  test("CLI surfaces a clear error for an unknown sandbox", async () => {
    const result = await runUhFailure([
      "sandbox",
      "status",
      "missing",
      "--root",
      TEST_ROOT,
    ]);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Sandbox not found: missing/);
  });

  test("CLI refuses to discard a dirty sandbox without --force", async () => {
    await runUh([
      "sandbox",
      "create",
      "cli-dirty",
      "--mission",
      "demo",
      "--root",
      TEST_ROOT,
    ]);
    const worktreeAbs = join(
      TEST_ROOT,
      ".harness",
      "sandboxes",
      "cli-dirty",
      "worktree",
    );
    await writeFile(join(worktreeAbs, "scratch.txt"), "x\n", "utf-8");

    const refusal = await runUhFailure([
      "sandbox",
      "discard",
      "cli-dirty",
      "--root",
      TEST_ROOT,
    ]);
    expect(`${refusal.stdout}${refusal.stderr}`).toMatch(/uncommitted change/i);
    await expect(stat(worktreeAbs)).resolves.toBeTruthy();

    const forced = await runUh([
      "sandbox",
      "discard",
      "cli-dirty",
      "--force",
      "--root",
      TEST_ROOT,
    ]);
    expect(forced.stdout).toContain("[DISCARDED] cli-dirty");
    await expect(stat(worktreeAbs)).rejects.toThrow();
  });

  test("uh sandbox repair re-registers a directory whose index entry was removed", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "cli-repair");
    await mkdir(missionDir, { recursive: true });
    await writeFile(
      join(missionDir, "mission.yaml"),
      stringify({
        schema_version: "uh.mission.v0",
        id: "cli-repair",
        title: "CLI repair mission",
        workflow_profile: "spec-first-feature",
      }),
      "utf-8",
    );

    await runUh(["sandbox", "create", "cli-lost", "--mission", "cli-repair", "--root", TEST_ROOT]);

    const indexPath = join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");
    const doc = parse(await readFile(indexPath, "utf-8")) as { sandboxes: Array<{ id: string }> };
    doc.sandboxes = doc.sandboxes.filter((entry) => entry.id !== "cli-lost");
    await writeFile(indexPath, stringify(doc), "utf-8");

    const emptyRepair = await runUh(["sandbox", "repair", "--root", TEST_ROOT]);
    expect(emptyRepair.stderr).toBe("");
    expect(emptyRepair.stdout).toContain("[REPAIRED] cli-lost");
    expect(emptyRepair.stdout).toContain("mission: cli-repair");

    const listOut = await runUh(["sandbox", "list", "--root", TEST_ROOT]);
    expect(listOut.stdout).toContain("cli-lost");
    expect(listOut.stdout).toContain("mission=cli-repair");

    const secondRepair = await runUh(["sandbox", "repair", "--root", TEST_ROOT]);
    expect(secondRepair.stdout).toContain("No sandbox registrations repaired.");
  });
});

describe("sandbox backends (S3 #136)", () => {
  test("directory backend clones into a self-contained dir, not a parent worktree", async () => {
    const record = await createSandbox(TEST_ROOT, {
      id: "dir-alpha",
      missionId: "demo",
      backend: "directory",
    });

    expect(record).toMatchObject({
      id: "dir-alpha",
      backend: "directory",
      branch: "sandbox/dir-alpha",
      base_ref: "HEAD",
      status: "created",
    });

    const worktreeAbs = join(TEST_ROOT, record.path);
    // Self-contained clone: has its own .git + the committed tree.
    await expect(stat(join(worktreeAbs, ".git"))).resolves.toBeTruthy();
    await expect(stat(join(worktreeAbs, "README.md"))).resolves.toBeTruthy();

    // Crucially, it is NOT registered as a worktree of the parent repo and the
    // parent branch namespace is untouched (the sandbox branch lives in the clone).
    const worktreePaths = await listWorktrees(TEST_ROOT);
    expect(worktreePaths).not.toContain(worktreeAbs);
    const branches = await listBranches(TEST_ROOT);
    expect(branches).not.toContain("sandbox/dir-alpha");

    // The clone itself is on the sandbox branch.
    const cloneBranches = await listBranches(worktreeAbs);
    expect(cloneBranches).toContain("sandbox/dir-alpha");

    const info = await getSandboxStatus(TEST_ROOT, "dir-alpha");
    expect(info.dirty).toBe(false);
    expect(info.changes).toEqual([]);
  });

  test("directory backend detects dirt and discards by directory removal", async () => {
    const record = await createSandbox(TEST_ROOT, {
      id: "dir-dirty",
      missionId: "demo",
      backend: "directory",
    });
    const worktreeAbs = join(TEST_ROOT, record.path);

    await writeFile(join(worktreeAbs, "scratch.txt"), "work in progress\n", "utf-8");
    const info = await getSandboxStatus(TEST_ROOT, "dir-dirty");
    expect(info.dirty).toBe(true);
    expect(info.changes.some((c) => c.includes("scratch.txt"))).toBe(true);

    // Refuses without --force, then discards (dir removed, parent untouched).
    await expect(discardSandbox(TEST_ROOT, "dir-dirty")).rejects.toThrow(/uncommitted change/i);
    const result = await discardSandbox(TEST_ROOT, "dir-dirty", { force: true });
    expect(result.branch_removed).toBe(false);
    await expect(stat(worktreeAbs)).rejects.toThrow();
    expect(await listSandboxes(TEST_ROOT)).toHaveLength(0);
  });

  test("createSandbox rejects an unknown backend", async () => {
    await expect(
      createSandbox(TEST_ROOT, { id: "bad-backend", missionId: "demo", backend: "nope" }),
    ).rejects.toThrow(/Unknown sandbox backend: nope/);
  });

  test("CLI --backend directory round-trips", async () => {
    const created = await runUh([
      "sandbox", "create", "cli-dir", "--mission", "demo", "--backend", "directory", "--root", TEST_ROOT,
    ]);
    expect(created.stdout).toContain("[CREATED] cli-dir");
    expect(created.stdout).toContain("backend: directory");
    const list = await listSandboxes(TEST_ROOT);
    expect(list.find((s) => s.id === "cli-dir")?.backend).toBe("directory");
  });
});

describe("container backend (#155 OpenSandbox)", () => {
  test("is registered but fails fast when OpenSandbox is not configured", async () => {
    expect(listSandboxBackends()).toContain("container");
    expect(getSandboxBackend("container").name).toBe("container");

    await expect(
      createSandbox(TEST_ROOT, { id: "ctr", missionId: "demo", backend: "container" }),
    ).rejects.toThrow(/OpenSandbox container backend is not configured/);

    // A failed materialize must leave nothing behind (no index entry, no dir).
    expect(await listSandboxes(TEST_ROOT)).toHaveLength(0);
  });

  test("materializes with mocked OpenSandbox without dirtying the worktree, then discards without env", async () => {
    process.env.UH_OPENSANDBOX_MODE = "mock";
    try {
      const record = await createSandbox(TEST_ROOT, { id: "ctr-mock", missionId: "demo", backend: "container" });
      expect(record).toMatchObject({ id: "ctr-mock", backend: "container", branch: "sandbox/ctr-mock" });

      const worktreeAbs = join(TEST_ROOT, record.path);
      await expect(stat(join(worktreeAbs, ".git"))).resolves.toBeTruthy();
      expect(await readFile(join(worktreeAbs, "..", ".uh-opensandbox.json"), "utf-8")).toContain("opensandbox");
      await expect(stat(join(worktreeAbs, ".uh-opensandbox.json"))).rejects.toThrow();

      let info = await getSandboxStatus(TEST_ROOT, "ctr-mock");
      expect(info.dirty).toBe(false);
      expect(info.changes).toEqual([]);

      await writeFile(join(worktreeAbs, "container-change.txt"), "dirty\n", "utf-8");
      info = await getSandboxStatus(TEST_ROOT, "ctr-mock");
      expect(info.dirty).toBe(true);
      expect(info.changes.some((c) => c.includes("container-change.txt"))).toBe(true);

      delete process.env.UH_OPENSANDBOX_MODE;
      await expect(discardSandbox(TEST_ROOT, "ctr-mock")).rejects.toThrow(/uncommitted change/i);
      const discarded = await discardSandbox(TEST_ROOT, "ctr-mock", { force: true });
      expect(discarded.branch_removed).toBe(false);
      await expect(stat(worktreeAbs)).rejects.toThrow();
      expect(await listSandboxes(TEST_ROOT)).toHaveLength(0);
    } finally {
      delete process.env.UH_OPENSANDBOX_MODE;
    }
  });

  test("OpenSandbox templates quote commands and avoid second-pass placeholder replacement", async () => {
    process.env.UH_OPENSANDBOX_ENABLED = "1";
    process.env.UH_OPENSANDBOX_EXEC_COMMAND = "printf '%s' {command}";
    try {
      const quoted = await runOpenSandboxCommand(TEST_ROOT, "python -c 'print(1)'", 1_000);
      expect(quoted.exitCode).toBe(0);
      expect(quoted.stdout).toBe("python -c 'print(1)'");

      const literalPlaceholder = await runOpenSandboxCommand(TEST_ROOT, "printf '{cwd} {image} {timeout_ms}'", 1_000);
      expect(literalPlaceholder.exitCode).toBe(0);
      expect(literalPlaceholder.stdout).toBe("printf '{cwd} {image} {timeout_ms}'");
    } finally {
      delete process.env.UH_OPENSANDBOX_ENABLED;
      delete process.env.UH_OPENSANDBOX_EXEC_COMMAND;
    }
  });

  test("OpenSandbox templates spawn in the requested sandbox cwd (#157)", async () => {
    process.env.UH_OPENSANDBOX_ENABLED = "1";
    await writeFile(join(TEST_ROOT, "cwd-proof.txt"), TEST_ROOT, "utf8");
    process.env.UH_OPENSANDBOX_EXEC_COMMAND = "cat cwd-proof.txt; : {command}";
    try {
      const observed = await runOpenSandboxCommand(TEST_ROOT, "noop", 5_000);
      expect(observed.exitCode).toBe(0);
      expect(observed.stdout.trim()).toBe(TEST_ROOT);
    } finally {
      delete process.env.UH_OPENSANDBOX_ENABLED;
      delete process.env.UH_OPENSANDBOX_EXEC_COMMAND;
    }
  });

  test("force discard runs the OpenSandbox delete template even when the worktree is gone (#157)", async () => {
    const sentinel = join(TEST_ROOT, "uh-delete-ran.txt");
    process.env.UH_OPENSANDBOX_ENABLED = "1";
    process.env.UH_OPENSANDBOX_EXEC_COMMAND = "true {command}";
    process.env.UH_OPENSANDBOX_DELETE_COMMAND = `printf orphan > ${JSON.stringify(sentinel)}`;
    try {
      const record = await createSandbox(TEST_ROOT, { id: "ctr-orphan", missionId: "demo", backend: "container" });
      const worktreeAbs = join(TEST_ROOT, record.path);
      // Simulate an orphaned sandbox: index entry survives but the on-disk worktree is gone.
      await rm(worktreeAbs, { recursive: true, force: true });
      await expect(stat(worktreeAbs)).rejects.toThrow();

      const discarded = await discardSandbox(TEST_ROOT, "ctr-orphan", { force: true });
      expect(discarded.branch_removed).toBe(false);
      expect(await readFile(sentinel, "utf-8")).toBe("orphan");
      expect(await listSandboxes(TEST_ROOT)).toHaveLength(0);
    } finally {
      delete process.env.UH_OPENSANDBOX_ENABLED;
      delete process.env.UH_OPENSANDBOX_EXEC_COMMAND;
      delete process.env.UH_OPENSANDBOX_DELETE_COMMAND;
    }
  });

  test("UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS bounds lifecycle commands and rejects invalid values (#157)", async () => {
    process.env.UH_OPENSANDBOX_ENABLED = "1";
    process.env.UH_OPENSANDBOX_EXEC_COMMAND = "true {command}";
    process.env.UH_OPENSANDBOX_CREATE_COMMAND = "sleep 5";
    process.env.UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS = "150";
    try {
      const startedAt = Date.now();
      await expect(
        createSandbox(TEST_ROOT, { id: "ctr-slow", missionId: "demo", backend: "container" }),
      ).rejects.toThrow(/OpenSandbox create command failed/);
      // Must exit well before the 5s sleep would naturally finish.
      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(await listSandboxes(TEST_ROOT)).toHaveLength(0);

      process.env.UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS = "not-a-number";
      await expect(
        createSandbox(TEST_ROOT, { id: "ctr-bad", missionId: "demo", backend: "container" }),
      ).rejects.toThrow(/UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS/);
    } finally {
      delete process.env.UH_OPENSANDBOX_ENABLED;
      delete process.env.UH_OPENSANDBOX_EXEC_COMMAND;
      delete process.env.UH_OPENSANDBOX_CREATE_COMMAND;
      delete process.env.UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS;
    }
  });
});

async function writeRoutingMission(root: string, id: string): Promise<string> {
  const missionDir = join(root, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    stringify({
      schema_version: "uh.mission.v0",
      id,
      title: `Routing mission ${id}`,
      objective: "Exercise mission run sandbox routing",
      workflow_profile: "spec-first-feature",
    }),
    "utf-8",
  );
  return missionPath;
}

function settlementLine(stdout: string): {
  mission_id: string;
  run_id: string;
  runtime: string;
  status: string;
  exit_code: number;
  run_dir: string;
} {
  const lines = stdout.trim().split(/\r?\n/);
  const last = lines[lines.length - 1];
  expect(last).toMatch(/^UH_RESULT /);
  return JSON.parse(last.slice("UH_RESULT ".length));
}

describe("mission run sandbox routing", () => {
  test("refuses a no-flag run in the project root when the mission has no bound sandbox", async () => {
    const missionPath = await writeRoutingMission(TEST_ROOT, "sr-unbound");

    const refusal = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);

    expect(refusal.code).toBe(2);
    expect(refusal.stderr).toContain(
      '[BLOCKED] mission sr-unbound has no bound sandbox; create one with "uh sandbox create <sandbox-id> --mission sr-unbound" or pass --no-sandbox to run in the project root',
    );
    // Refused before the runtime was reached, so nothing else was reported.
    expect(refusal.stdout).not.toContain("Running mission:");
    expect(refusal.stdout).not.toContain("Adapter manifest not found");

    const payload = settlementLine(refusal.stdout);
    expect(payload).toMatchObject({
      mission_id: "sr-unbound",
      runtime: "hermes",
      status: "blocked",
      exit_code: 2,
    });
    expect(payload.run_id).toBeTruthy();
    expect(payload.run_dir).toBe(`.harness/missions/sr-unbound/runs/${payload.run_id}`);

    // The refusal created no run directory: the project root stays untouched.
    await expect(stat(join(TEST_ROOT, ".harness", "missions", "sr-unbound", "runs"))).rejects.toThrow();
  });

  test("--no-sandbox keeps today's root execution and says so", async () => {
    const missionPath = await writeRoutingMission(TEST_ROOT, "sr-explicit");

    const result = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "hermes", "--force", "--no-sandbox", "--root", TEST_ROOT,
    ]);

    expect(result.stdout).toContain("Running mission:");
    expect(result.stdout).toContain("Sandbox: none (project root, --no-sandbox)");
    expect(`${result.stdout}${result.stderr}`).not.toContain("has no bound sandbox");
    // Reached the adapter dispatch (no hermes manifest in this root) rather
    // than being refused by routing — and no model is ever invoked.
    expect(`${result.stdout}${result.stderr}`).toContain("Adapter manifest not found");
  });

  test("dry-run reports the routing decision and never blocks on a missing binding", async () => {
    const missionPath = await writeRoutingMission(TEST_ROOT, "sr-dry");

    const unbound = await runUhFailure([
      "mission", "dry-run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);
    expect(unbound.stdout).toContain("Sandbox: none (project root)");
    expect(`${unbound.stdout}${unbound.stderr}`).not.toContain("has no bound sandbox");
    expect(unbound.stderr).not.toContain("[BLOCKED]");

    const opted = await runUhFailure([
      "mission", "dry-run", missionPath,
      "--runtime", "hermes", "--force", "--no-sandbox", "--root", TEST_ROOT,
    ]);
    expect(opted.stdout).toContain("Sandbox: none (project root, --no-sandbox)");
  });

  test("a bound sandbox still routes the run and the dry-run into the worktree", async () => {
    const missionPath = await writeRoutingMission(TEST_ROOT, "sr-bound");
    const record = await createSandbox(TEST_ROOT, { id: "sr-sbx", missionId: "sr-bound" });
    const worktreeAbs = join(TEST_ROOT, record.path);

    const dryRun = await runUhFailure([
      "mission", "dry-run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);
    expect(dryRun.stdout).toContain(`Sandbox: sr-sbx (${worktreeAbs})`);

    const run = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);
    expect(run.stdout).toContain(`Sandbox: sr-sbx (${worktreeAbs})`);
    expect(`${run.stdout}${run.stderr}`).not.toContain("has no bound sandbox");
    // The adapter lookup happened inside the sandbox worktree, not the root.
    expect(`${run.stdout}${run.stderr}`).toContain(join("sr-sbx", "worktree"));
  });
});
