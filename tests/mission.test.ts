import { describe, expect, test } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { createMission } from "../src/harness/mission.js";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-mission-"));
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("createMission", () => {
  test("creates .harness/missions/<id>/mission.yaml with documented fields and validates", async () => {
    const result = await createMission(TEST_ROOT, {
      id: "docs-spine",
      title: "Create docs spine",
      workflow: "research-docs",
      objective: "Build the docs foundation.",
    });

    const missionPath = join(TEST_ROOT, ".harness", "missions", "docs-spine", "mission.yaml");
    expect(result.path).toBe(missionPath);
    expect(result.created).toBe(true);

    const content = await readFile(missionPath, "utf-8");
    const mission = parse(content);

    expect(mission).toEqual({
      schema_version: "uh.mission.v0",
      id: "docs-spine",
      title: "Create docs spine",
      workflow_profile: "research-docs",
      priority: "medium",
      objective: "Build the docs foundation.",
      issue_refs: [],
      context: {
        read_first: [],
        source_links: [],
      },
      constraints: [],
      skills: {
        required: [],
        suggested: [],
      },
      expected_outputs: {
        files: [],
      },
      sandbox: {
        backend: "git-worktree",
        promotion_policy: "human-approved",
      },
      verification: {
        required_checks: [],
        review_gates: ["spec-compliance", "implementation-quality"],
      },
      completion_criteria: [],
    });

    const validation = await validateFile(missionPath);
    expect(validation.valid, validation.errors.join("\n")).toBe(true);
  });

  test("rejects path traversal mission id and does not create outside missions dir", async () => {
    await expect(createMission(TEST_ROOT, {
      id: "../evil",
      title: "Evil",
      workflow: "research-docs",
      objective: "Escape the missions directory.",
    })).rejects.toThrow(/invalid mission id|unsafe mission path/i);

    await expect(access(join(TEST_ROOT, ".harness", "evil", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects if root is not initialized", async () => {
    const uninitializedRoot = await mkdtemp(join(tmpdir(), "uh-test-mission-uninit-"));
    try {
      await expect(createMission(uninitializedRoot, {
        id: "not-initialized",
        title: "Not initialized",
        workflow: "research-docs",
        objective: "Should require project.yaml.",
      })).rejects.toThrow(/not initialized|project\.yaml/i);
    } finally {
      await rm(uninitializedRoot, { recursive: true, force: true });
    }
  });

  test("rejects unknown workflow", async () => {
    await expect(createMission(TEST_ROOT, {
      id: "unknown-workflow",
      title: "Unknown workflow",
      workflow: "does-not-exist",
      objective: "Should require an existing workflow profile.",
    })).rejects.toThrow(/workflow.*does-not-exist.*not found|unknown workflow/i);

    await expect(access(join(TEST_ROOT, ".harness", "missions", "unknown-workflow", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects invalid existing workflow YAML", async () => {
    const workflowPath = join(TEST_ROOT, ".harness", "workflows", "research-docs.yaml");
    await writeFile(workflowPath, "schema_version: uh.workflow.v0\nid: research-docs\n", "utf-8");

    await expect(createMission(TEST_ROOT, {
      id: "invalid-workflow",
      title: "Invalid workflow",
      workflow: "research-docs",
      objective: "Should require a valid workflow profile.",
    })).rejects.toThrow(/workflow.*invalid|validation|name|required/i);

    await expect(access(join(TEST_ROOT, ".harness", "missions", "invalid-workflow", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects invalid existing project.yaml", async () => {
    const projectPath = join(TEST_ROOT, ".harness", "project.yaml");
    await writeFile(projectPath, "schema_version: uh.project.v0\nid: invalid-project\n", "utf-8");

    await expect(createMission(TEST_ROOT, {
      id: "invalid-project",
      title: "Invalid project",
      workflow: "research-docs",
      objective: "Should require a valid project file.",
    })).rejects.toThrow(/project.*invalid|validation|name|required/i);

    await expect(access(join(TEST_ROOT, ".harness", "missions", "invalid-project", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects project.yaml with wrong valid schema_version", async () => {
    const projectPath = join(TEST_ROOT, ".harness", "project.yaml");
    await writeFile(projectPath, [
      "schema_version: uh.workflow.v0",
      "id: research-docs",
      "name: Research & Documentation",
      "description: Valid workflow in the wrong location.",
      "phases:",
      "  - name: research",
      "    agent_role: researcher",
      "    description: Research and gather information",
      "",
    ].join("\n"), "utf-8");

    await expect(createMission(TEST_ROOT, {
      id: "wrong-project-schema",
      title: "Wrong project schema",
      workflow: "research-docs",
      objective: "Should require project schema_version.",
    })).rejects.toThrow(/project.*schema_version|expected.*uh\.project\.v0|wrong schema/i);

    await expect(access(join(TEST_ROOT, ".harness", "missions", "wrong-project-schema", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects workflow file with wrong valid schema_version", async () => {
    const workflowPath = join(TEST_ROOT, ".harness", "workflows", "research-docs.yaml");
    await writeFile(workflowPath, [
      "schema_version: uh.project.v0",
      "id: swapped-project",
      "name: Swapped Project",
      "root_path: .",
      "created_at: 2026-05-13T00:00:00.000Z",
      "issue_sources: []",
      "default_workflow_profiles: []",
      "artifact_schema_version: uh.project.v0",
      "",
    ].join("\n"), "utf-8");

    await expect(createMission(TEST_ROOT, {
      id: "wrong-workflow-schema",
      title: "Wrong workflow schema",
      workflow: "research-docs",
      objective: "Should require workflow schema_version.",
    })).rejects.toThrow(/workflow.*schema_version|expected.*uh\.workflow\.v0|wrong schema/i);

    await expect(access(join(TEST_ROOT, ".harness", "missions", "wrong-workflow-schema", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects symlinked .harness directory and does not write outside selected root", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-mission-harness-outside-"));
    try {
      await initializeHarness(outsideRoot);
      await rm(join(TEST_ROOT, ".harness"), { recursive: true, force: true });
      try {
        await symlink(join(outsideRoot, ".harness"), join(TEST_ROOT, ".harness"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      await expect(createMission(TEST_ROOT, {
        id: "linked-harness",
        title: "Linked harness",
        workflow: "research-docs",
        objective: "Should not follow symlinked harness directory.",
      })).rejects.toThrow(/symlink|harness directory/i);

      await expect(access(join(outsideRoot, ".harness", "missions", "linked-harness", "mission.yaml"))).rejects.toThrow();
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("rejects symlinked mission directory and does not write outside missions dir", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-mission-outside-"));
    try {
      await mkdir(join(outsideRoot, "linked-mission"));
      try {
        await symlink(join(outsideRoot, "linked-mission"), join(TEST_ROOT, ".harness", "missions", "linked-mission"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      await expect(createMission(TEST_ROOT, {
        id: "linked-mission",
        title: "Linked mission",
        workflow: "research-docs",
        objective: "Should not follow symlinked mission directory.",
        force: true,
      })).rejects.toThrow(/symlink|unsafe mission path|missions directory/i);

      await expect(access(join(outsideRoot, "linked-mission", "mission.yaml"))).rejects.toThrow();
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("rejects mission.yaml symlink on force and does not overwrite outside target", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-mission-file-outside-"));
    try {
      const missionDir = join(TEST_ROOT, ".harness", "missions", "linked-file");
      const missionPath = join(missionDir, "mission.yaml");
      const outsideTarget = join(outsideRoot, "outside-mission.yaml");
      const outsideOriginal = "outside target must remain unchanged\n";
      await mkdir(missionDir, { recursive: true });
      await writeFile(outsideTarget, outsideOriginal, "utf-8");
      try {
        await symlink(outsideTarget, missionPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      await expect(createMission(TEST_ROOT, {
        id: "linked-file",
        title: "Linked file",
        workflow: "research-docs",
        objective: "Should not follow symlinked mission file.",
        force: true,
      })).rejects.toThrow(/symlink|mission\.yaml|unsafe mission path/i);

      await expect(readFile(outsideTarget, "utf-8")).resolves.toBe(outsideOriginal);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("does not overwrite existing mission without force", async () => {
    await createMission(TEST_ROOT, {
      id: "existing",
      title: "Original title",
      workflow: "research-docs",
      objective: "Original objective.",
    });
    const missionPath = join(TEST_ROOT, ".harness", "missions", "existing", "mission.yaml");
    const original = await readFile(missionPath, "utf-8");

    await expect(createMission(TEST_ROOT, {
      id: "existing",
      title: "New title",
      workflow: "bugfix-contained",
      objective: "New objective.",
    })).rejects.toThrow(/already exists/i);

    await expect(readFile(missionPath, "utf-8")).resolves.toBe(original);
  });

  test("overwrites with force", async () => {
    const missionPath = join(TEST_ROOT, ".harness", "missions", "force-me", "mission.yaml");
    await createMission(TEST_ROOT, {
      id: "force-me",
      title: "Original title",
      workflow: "research-docs",
      objective: "Original objective.",
    });
    await writeFile(missionPath, "schema_version: uh.mission.v0\nid: stale\ntitle: Stale\nworkflow_profile: stale\n", "utf-8");

    const result = await createMission(TEST_ROOT, {
      id: "force-me",
      title: "Forced title",
      workflow: "bugfix-contained",
      objective: "Forced objective.",
      force: true,
    });

    expect(result.path).toBe(missionPath);
    expect(result.created).toBe(false);
    const mission = parse(await readFile(missionPath, "utf-8"));
    expect(mission.id).toBe("force-me");
    expect(mission.title).toBe("Forced title");
    expect(mission.workflow_profile).toBe("bugfix-contained");
    expect(mission.objective).toBe("Forced objective.");
    expect((await validateFile(missionPath)).valid).toBe(true);
  });
});

describe("uh mission create", () => {
  test("CLI creates a mission and prints the path", async () => {
    const missionPath = join(TEST_ROOT, ".harness", "missions", "cli-mission", "mission.yaml");

    const { stdout, stderr } = await execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "src/cli.ts",
        "mission",
        "create",
        "cli-mission",
        "--title",
        "CLI Mission",
        "--workflow",
        "spec-first-feature",
        "--objective",
        "Create via CLI.",
        "--root",
        TEST_ROOT,
      ],
      { cwd: process.cwd() }
    );

    expect(stderr).toBe("");
    expect(stdout).toContain("Created mission: cli-mission");
    expect(stdout).toContain(missionPath);
    expect((await validateFile(missionPath)).valid).toBe(true);
  });
});
