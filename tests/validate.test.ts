import { test, expect, describe } from "vitest";
import { writeFile, mkdir, rm, mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAllMissions, validateAllWorkflows, validateFile } from "../src/harness/validate.js";
import { initializeHarness } from "../src/harness/init.js";
import { validateMission } from "../src/schema/mission.js";
import { validateWorkflow } from "../src/schema/workflow.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);

async function cleanup() {
  if (!TEST_ROOT) return;
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-validate-"));
});
test.afterEach(cleanup);

describe("uh validate", () => {
  test("old minimal workflow validates without BMAD metadata", () => {
    const workflow = validateWorkflow({
      schema_version: "uh.workflow.v0",
      id: "legacy-workflow",
      name: "Legacy Workflow",
      phases: [
        {
          name: "do-work",
          agent_role: "developer",
          description: "Do the work",
        },
      ],
    });

    expect(workflow.bmad).toBeUndefined();
    expect(workflow.phases[0]?.bmad_role).toBeUndefined();
    expect(workflow.phases[0]?.outputs).toBeUndefined();
  });

  test("workflow validates with BMAD metadata and phase role traceability", () => {
    const workflow = validateWorkflow({
      schema_version: "uh.workflow.v0",
      id: "bmad-workflow",
      name: "BMAD Workflow",
      bmad: {
        inspiration: "BMAD-METHOD",
        dependency: false,
        roles: ["Analyst", "Developer", "QA / Test Architect"],
        guardrails: [
          "Roles are hats; a single agent may play multiple roles.",
          "Do not import BMAD as a dependency.",
        ],
      },
      phases: [
        {
          name: "research",
          agent_role: "researcher",
          bmad_role: "Analyst",
          description: "Research source systems",
          outputs: ["risk notes", "pattern comparison"],
        },
      ],
    });

    expect(workflow.bmad).toEqual({
      inspiration: "BMAD-METHOD",
      dependency: false,
      roles: ["Analyst", "Developer", "QA / Test Architect"],
      guardrails: [
        "Roles are hats; a single agent may play multiple roles.",
        "Do not import BMAD as a dependency.",
      ],
    });
    expect(workflow.phases[0]?.bmad_role).toBe("Analyst");
    expect(workflow.phases[0]?.outputs).toEqual(["risk notes", "pattern comparison"]);
  });

  test("initializeHarness writes default workflows with BMAD metadata and all workflows validate", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);

    const workflowPath = join(TEST_ROOT, ".harness", "workflows", "research-docs.yaml");
    const result = await validateFile(workflowPath);
    expect(result.valid, result.errors.join("\n")).toBe(true);

    const { parse } = await import("yaml");
    const { readFile } = await import("node:fs/promises");
    const workflow = validateWorkflow(parse(await readFile(workflowPath, "utf-8")));
    expect(workflow.bmad).toMatchObject({
      inspiration: "BMAD-METHOD",
      dependency: false,
    });
    expect(workflow.bmad?.roles).toContain("Analyst");
    expect(workflow.phases.every((phase) => phase.bmad_role && phase.outputs && phase.outputs.length > 0)).toBe(true);

    const results = await validateAllWorkflows(TEST_ROOT);
    expect(results).toHaveLength(5);
    expect(results.every((workflowResult) => workflowResult.valid)).toBe(true);
  });

  test("valid project YAML passes", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await initializeHarness(TEST_ROOT);
    const result = await validateFile(join(TEST_ROOT, ".harness", "project.yaml"));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("missing required project fields fails", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "bad-project.yaml"),
      "schema_version: uh.project.v0\n",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "bad-project.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("valid mission YAML passes", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "mission.yaml"),
      `schema_version: uh.mission.v0
id: test-mission
name: Test Mission
workflow_profile: research-docs
`,
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "mission.yaml"));
    expect(result.valid).toBe(true);
  });

  test("all missions validates .harness/missions/*/mission.yaml", async () => {
    await mkdir(join(TEST_ROOT, ".harness", "missions", "test"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "test", "mission.yaml"),
      `schema_version: uh.mission.v0
id: test-mission
name: Test Mission
workflow_profile: research-docs
`,
      "utf-8"
    );

    const results = await validateAllMissions(TEST_ROOT);

    expect(results).toHaveLength(1);
    expect(results[0]?.path).toBe(join(TEST_ROOT, ".harness", "missions", "test", "mission.yaml"));
    expect(results[0]?.valid).toBe(true);
  });

  test("all missions ignores example missions outside .harness", async () => {
    await mkdir(join(TEST_ROOT, "examples", "missions"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, "examples", "missions", "mission.yaml"),
      `schema_version: uh.mission.v0
id: example-mission
name: Example Mission
workflow_profile: research-docs
`,
      "utf-8"
    );

    const results = await validateAllMissions(TEST_ROOT);

    expect(results).toEqual([]);
  });

  test("CLI validate --all-missions prints passing validation results and exits 0 for valid missions", async () => {
    await mkdir(join(TEST_ROOT, ".harness", "missions", "good"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "good", "mission.yaml"),
      `schema_version: uh.mission.v0
id: good-mission
name: Good Mission
workflow_profile: research-docs
`,
      "utf-8"
    );

    const { stdout, stderr } = await execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      ["src/cli.ts", "validate", "--all-missions", "--root", TEST_ROOT],
      { cwd: process.cwd() }
    );

    expect(stdout).toContain(`[PASS] ${join(TEST_ROOT, ".harness", "missions", "good", "mission.yaml")}`);
    expect(stderr).toBe("");
  });

  test("CLI validate --all-missions prints validation results and fails for invalid missions", async () => {
    await mkdir(join(TEST_ROOT, ".harness", "missions", "bad"), { recursive: true });
    await writeFile(
      join(TEST_ROOT, ".harness", "missions", "bad", "mission.yaml"),
      `schema_version: uh.mission.v0
id: bad-mission
`,
      "utf-8"
    );

    try {
      await execFileP(
        join(process.cwd(), "node_modules", ".bin", "tsx"),
        ["src/cli.ts", "validate", "--all-missions", "--root", TEST_ROOT],
        { cwd: process.cwd() }
      );
      throw new Error("expected CLI to fail");
    } catch (err) {
      const output = `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`;
      expect(output).toContain(`[FAIL] ${join(TEST_ROOT, ".harness", "missions", "bad", "mission.yaml")}`);
      expect(output).toContain("schema: uh.mission.v0");
      expect(output).toContain("error:");
    }
  });

  test("documented mission packet shape validates", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "documented-mission.yaml"),
      `schema_version: uh.mission.v0
id: mission-2026-05-13-docs-spine
title: Create documentation spine for Ultimate Harness
issue_refs:
  - provider: github
    id: "21"
    url: https://github.com/Agentic-Engineering-Agency/ultimate-harness/issues/21
  - provider: linear
    id: UH-1
workflow_profile: research-docs
priority: high
objective: >
  Build the initial documentation foundation before implementation begins.
context:
  repo_root: /Users/eduardojaviergarcialopez/AgenticEngineering/ultimate-harness
  read_first:
    - README.md
    - docs/handoffs/2026-05-13-documentation-bmad-handoff.md
  source_links:
    - https://github.com/bmad-code-org/BMAD-METHOD
constraints:
  - Do not implement the CLI yet.
skills:
  required:
    - writing-plans
  suggested:
    - code-review
expected_outputs:
  files:
    - docs/README.md
    - docs/glossary.md
sandbox:
  backend: git-worktree
  promotion_policy: human-approved
verification:
  required_checks:
    - name: docs-tree-exists
      command: find docs -type f | sort
    - name: git-diff-review
  review_gates:
    - spec-compliance
completion_criteria:
  - Docs tree is navigable from docs/README.md.
`,
      "utf-8"
    );

    const result = await validateFile(join(TEST_ROOT, "documented-mission.yaml"));
    expect(result.valid, result.errors.join("\n")).toBe(true);
  });

  test("documented mission issue_refs normalize to legacy issues", () => {
    const mission = validateMission({
      schema_version: "uh.mission.v0",
      id: "mission-2026-05-13-docs-spine",
      title: "Create documentation spine for Ultimate Harness",
      issue_refs: [
        {
          provider: "github",
          id: "21",
          url: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/issues/21",
        },
      ],
      workflow_profile: "research-docs",
      objective: "Build the initial documentation foundation before implementation begins.",
      context: {
        read_first: ["README.md"],
      },
      expected_outputs: {
        files: ["docs/README.md"],
      },
      verification: {
        required_checks: [{ name: "docs-tree-exists", command: "find docs -type f | sort" }],
      },
    });

    expect(mission.issues).toEqual([
      {
        source: "github",
        reference: "21",
        url: "https://github.com/Agentic-Engineering-Agency/ultimate-harness/issues/21",
      },
    ]);
    expect(mission.name).toBe("Create documentation spine for Ultimate Harness");
    expect(mission.description).toBe("Build the initial documentation foundation before implementation begins.");
    expect(mission.read_first).toEqual(["README.md"]);
    expect(mission.expected_artifacts).toEqual([{ path: "docs/README.md" }]);
    expect(mission.verification.checks).toEqual(["find docs -type f | sort"]);
  });

  test("unknown schema version fails", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "unknown.yaml"),
      "schema_version: uh.nonexistent.v99\n",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "unknown.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown schema version");
  });

  test("invalid YAML returns useful error", async () => {
    await mkdir(TEST_ROOT, { recursive: true });
    await writeFile(
      join(TEST_ROOT, "broken.yaml"),
      "key: [unterminated",
      "utf-8"
    );
    const result = await validateFile(join(TEST_ROOT, "broken.yaml"));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("YAML parse error");
  });

  test("example mission packet validates", async () => {
    const result = await validateFile("examples/missions/documentation-spine.yaml");
    expect(result.valid).toBe(true);
  });
});
