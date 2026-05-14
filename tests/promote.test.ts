import { describe, expect, test } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { getStatus } from "../src/harness/status.js";
import { validateFile } from "../src/harness/validate.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);
const CLI = join(process.cwd(), "node_modules", ".bin", "tsx");

async function runUh(args: string[]) {
  return execFileP(CLI, ["src/cli.ts", ...args], { cwd: process.cwd() });
}

async function runUhFailure(args: string[]) {
  try {
    const result = await runUh(args);
    throw new Error(`expected uh ${args.join(" ")} to fail, got stdout=${result.stdout} stderr=${result.stderr}`);
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    expect(e.code).not.toBe(0);
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code };
  }
}

async function writeMission(id: string) {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  await writeFile(join(missionDir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "research-docs",
    objective: "Promote this mission.",
    verification: {
      required_checks: [{ name: "already checked", command: "node -e \"process.exit(0)\"" }],
      review_gates: [],
    },
  }), "utf-8");
  return missionDir;
}

async function writeVerification(id: string, status: "passed" | "failed" | "blocked" = "passed") {
  await writeFile(join(TEST_ROOT, ".harness", "missions", id, "verification.yaml"), stringify({
    schema_version: "uh.verification-result.v0",
    mission_id: id,
    status,
    checks: [{ name: "already checked", type: "command", status }],
  }), "utf-8");
}

async function readPromotion(id: string) {
  const filePath = join(TEST_ROOT, ".harness", "missions", id, "promotion.yaml");
  const parsed = parse(await readFile(filePath, "utf-8"));
  const validation = await validateFile(filePath);
  expect(validation.valid, validation.errors.join("\n")).toBe(true);
  expect(validation.schema_version).toBe("uh.promotion.v0");
  return parsed;
}

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-promote-"));
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("uh promote", () => {
  test("promoted decision requires passed verification, writes promotion.yaml, and status counts promoted", async () => {
    await writeMission("promote-pass");
    await writeVerification("promote-pass", "passed");

    const { stdout, stderr } = await runUh(["promote", "promote-pass", "--root", TEST_ROOT, "--approved-by", "Ada"]);

    expect(stderr).toBe("");
    expect(stdout).toContain("[PROMOTED] promote-pass");
    const promotion = await readPromotion("promote-pass");
    expect(promotion).toMatchObject({
      schema_version: "uh.promotion.v0",
      mission_id: "promote-pass",
      decision: "promoted",
      approved_by: "Ada",
    });
    expect(Date.parse(promotion.promoted_at)).not.toBeNaN();
    const events = (await readFile(join(TEST_ROOT, ".harness", "missions", "promote-pass", "events.ndjson"), "utf-8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((e) => e.type)).toEqual(["promotion.recorded"]);
    expect(events[0]).toMatchObject({ mission_id: "promote-pass", decision: "promoted" });
    const status = await getStatus(TEST_ROOT);
    expect(status.promoted_missions_count).toBe(1);
  });

  test("promoted decision with failed or missing verification refuses and does not write promoted promotion.yaml", async () => {
    await writeMission("failed-verification");
    await writeVerification("failed-verification", "failed");
    await writeMission("missing-verification");

    const failed = await runUhFailure(["promote", "failed-verification", "--root", TEST_ROOT, "--approved-by", "Ada"]);
    expect(`${failed.stdout}${failed.stderr}`).toMatch(/passed verification/i);
    await expect(access(join(TEST_ROOT, ".harness", "missions", "failed-verification", "promotion.yaml"))).rejects.toThrow();

    const missing = await runUhFailure(["promote", "missing-verification", "--root", TEST_ROOT, "--approved-by", "Ada"]);
    expect(`${missing.stdout}${missing.stderr}`).toMatch(/verification\.yaml|passed verification/i);
    await expect(access(join(TEST_ROOT, ".harness", "missions", "missing-verification", "promotion.yaml"))).rejects.toThrow();
  });

  test("rejected decision can write without verification and is not counted by status", async () => {
    await writeMission("reject-no-verify");

    const { stdout, stderr } = await runUh(["promote", "reject-no-verify", "--root", TEST_ROOT, "--approved-by", "Ada", "--decision", "rejected"]);

    expect(stderr).toBe("");
    expect(stdout).toContain("[REJECTED] reject-no-verify");
    const promotion = await readPromotion("reject-no-verify");
    expect(promotion).toMatchObject({ mission_id: "reject-no-verify", decision: "rejected", approved_by: "Ada" });
    const status = await getStatus(TEST_ROOT);
    expect(status.promoted_missions_count).toBe(0);
  });

  test("invalid mission id rejects path traversal", async () => {
    await expect(runUhFailure(["promote", "../evil", "--root", TEST_ROOT, "--approved-by", "Ada"])).resolves.toBeTruthy();
    await expect(access(join(TEST_ROOT, ".harness", "evil", "promotion.yaml"))).rejects.toThrow();
  });

  test("symlinked promotion.yaml is refused and does not overwrite outside target", async () => {
    const missionDir = await writeMission("linked-promotion");
    await writeVerification("linked-promotion", "passed");
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-promote-outside-"));
    try {
      const outsideTarget = join(outsideRoot, "outside-promotion.yaml");
      const outsideOriginal = "outside target must remain unchanged\n";
      await writeFile(outsideTarget, outsideOriginal, "utf-8");
      try {
        await symlink(outsideTarget, join(missionDir, "promotion.yaml"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      const { stdout, stderr } = await runUhFailure(["promote", "linked-promotion", "--root", TEST_ROOT, "--approved-by", "Ada"]);
      expect(`${stdout}${stderr}`).toMatch(/symlink|promotion\.yaml/i);
      await expect(readFile(outsideTarget, "utf-8")).resolves.toBe(outsideOriginal);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("symlinked project.yaml is refused and does not write promotion.yaml", async () => {
    await writeMission("linked-project-file");
    await writeVerification("linked-project-file", "passed");
    const projectPath = join(TEST_ROOT, ".harness", "project.yaml");
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-promote-outside-project-"));
    try {
      const outsideProject = join(outsideRoot, "project.yaml");
      await writeFile(outsideProject, stringify({
        schema_version: "uh.project.v0",
        id: "outside-project",
        name: "outside-project",
        root_path: outsideRoot,
        created_at: new Date().toISOString(),
      }), "utf-8");
      await rm(projectPath, { force: true });
      try {
        await symlink(outsideProject, projectPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      const { stdout, stderr } = await runUhFailure(["promote", "linked-project-file", "--root", TEST_ROOT, "--approved-by", "Ada"]);
      expect(`${stdout}${stderr}`).toMatch(/symlink|project\.yaml|project file/i);
      await expect(access(join(TEST_ROOT, ".harness", "missions", "linked-project-file", "promotion.yaml"))).rejects.toThrow();
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("CLI supports repeated --change values and sandbox-id/approved-by fields", async () => {
    await writeMission("promote-fields");
    await writeVerification("promote-fields", "passed");

    await runUh([
      "promote",
      "promote-fields",
      "--root",
      TEST_ROOT,
      "--approved-by",
      "Grace Hopper",
      "--sandbox-id",
      "sandbox-123",
      "--change",
      "src/a.ts",
      "--change",
      "docs/b.md",
    ]);

    const promotion = await readPromotion("promote-fields");
    expect(promotion).toMatchObject({
      mission_id: "promote-fields",
      decision: "promoted",
      approved_by: "Grace Hopper",
      sandbox_id: "sandbox-123",
      changes: ["src/a.ts", "docs/b.md"],
    });
  });
});
