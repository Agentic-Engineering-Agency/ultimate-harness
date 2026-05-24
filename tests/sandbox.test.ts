import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { getSandboxBackend, listSandboxBackends, runOpenSandboxCommand } from "../src/harness/sandbox-backends.js";
import {
  assertSafeSandboxId,
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
} from "../src/harness/sandbox.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);
const CLI = join(process.cwd(), "node_modules", ".bin", "tsx");

async function runUh(args: string[]) {
  return execFileP(CLI, ["src/cli.ts", ...args], { cwd: process.cwd() });
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
    .map((line) => line.slice("worktree ".length));
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
    await execFileP("mkdir", ["-p", missionDir]);
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
});
