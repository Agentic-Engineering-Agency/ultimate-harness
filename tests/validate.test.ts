import { test, expect, describe } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { validateFile } from "../src/harness/validate.js";
import { initializeHarness } from "../src/harness/init.js";
import { validateMission } from "../src/schema/mission.js";

const TEST_ROOT = "/tmp/uh-test-validate";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

describe("uh validate", () => {
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
