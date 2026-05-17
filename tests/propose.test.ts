import { describe, expect, test } from "vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import {
  parseIssueRef,
  parseRequiredCheck,
  proposeMission,
} from "../src/harness/propose.js";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-propose-"));
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("parseIssueRef", () => {
  test("parses provider:id without url", () => {
    expect(parseIssueRef("github:7")).toEqual({ provider: "github", id: "7" });
  });

  test("parses provider:id:url with colon-bearing url", () => {
    expect(parseIssueRef("github:7:https://github.com/owner/repo/issues/7")).toEqual({
      provider: "github",
      id: "7",
      url: "https://github.com/owner/repo/issues/7",
    });
  });

  test("trims surrounding whitespace in segments", () => {
    expect(parseIssueRef(" linear : UH-15 : https://linear.app/UH-15 ")).toEqual({
      provider: "linear",
      id: "UH-15",
      url: "https://linear.app/UH-15",
    });
  });

  test("rejects spec with no colon", () => {
    expect(() => parseIssueRef("github")).toThrow(/provider:id/);
  });

  test("rejects empty provider", () => {
    expect(() => parseIssueRef(":7")).toThrow(/empty provider/);
  });

  test("rejects empty id", () => {
    expect(() => parseIssueRef("github:")).toThrow(/empty id/);
  });

  test("rejects empty input", () => {
    expect(() => parseIssueRef("")).toThrow();
  });
});

describe("parseRequiredCheck", () => {
  test("parses name without command", () => {
    expect(parseRequiredCheck("docs-tree-exists")).toEqual({ name: "docs-tree-exists" });
  });

  test("parses name=command and preserves equals in command", () => {
    expect(parseRequiredCheck("env-set=FOO=bar baz")).toEqual({
      name: "env-set",
      command: "FOO=bar baz",
    });
  });

  test("trims name but preserves command verbatim after first equals", () => {
    expect(parseRequiredCheck("  cli-help = node dist/cli.js --help  ")).toEqual({
      name: "cli-help",
      command: " node dist/cli.js --help  ",
    });
  });

  test("rejects empty name", () => {
    expect(() => parseRequiredCheck("=foo")).toThrow(/empty name/);
  });

  test("rejects empty input", () => {
    expect(() => parseRequiredCheck("")).toThrow();
  });
});

describe("proposeMission", () => {
  test("writes a fully-populated mission packet that validates", async () => {
    const result = await proposeMission(TEST_ROOT, {
      id: "uh-15-propose",
      title: "Implement uh propose",
      workflow: "spec-first-feature",
      objective: "Add a CLI bridge from requests/issues to mission packets.",
      priority: "high",
      issueRefs: [
        { provider: "github", id: "7", url: "https://github.com/owner/repo/issues/7" },
        { provider: "linear", id: "UH-15" },
      ],
      readFirst: ["README.md", "docs/architecture/mission-packet-schema.md"],
      sourceLinks: ["https://linear.app/agentic-eng/issue/UH-15"],
      repoRoot: TEST_ROOT,
      constraints: ["Do not edit the main checkout."],
      requiredSkills: ["writing-plans"],
      suggestedSkills: ["code-review"],
      expectedOutputs: [
        "src/harness/propose.ts",
        "tests/propose.test.ts",
      ],
      completionCriteria: ["uh propose produces a validated mission packet."],
      sandboxBackend: "git-worktree",
      promotionPolicy: "human-approved",
      requiredChecks: [
        { name: "typecheck", command: "npx tsc -p tsconfig.tests.json --noEmit" },
        { name: "manual-review" },
      ],
      reviewGates: ["spec-compliance", "implementation-quality", "cli-docs"],
    });

    const missionPath = join(TEST_ROOT, ".harness", "missions", "uh-15-propose", "mission.yaml");
    expect(result.path).toBe(missionPath);
    expect(result.created).toBe(true);

    const written = parse(await readFile(missionPath, "utf-8"));
    expect(written).toEqual({
      schema_version: "uh.mission.v0",
      id: "uh-15-propose",
      title: "Implement uh propose",
      workflow_profile: "spec-first-feature",
      priority: "high",
      objective: "Add a CLI bridge from requests/issues to mission packets.",
      issue_refs: [
        { provider: "github", id: "7", url: "https://github.com/owner/repo/issues/7" },
        { provider: "linear", id: "UH-15" },
      ],
      context: {
        read_first: ["README.md", "docs/architecture/mission-packet-schema.md"],
        source_links: ["https://linear.app/agentic-eng/issue/UH-15"],
        repo_root: TEST_ROOT,
      },
      constraints: ["Do not edit the main checkout."],
      skills: {
        required: ["writing-plans"],
        suggested: ["code-review"],
      },
      expected_outputs: {
        files: ["src/harness/propose.ts", "tests/propose.test.ts"],
      },
      sandbox: {
        backend: "git-worktree",
        promotion_policy: "human-approved",
      },
      verification: {
        required_checks: [
          { name: "typecheck", command: "npx tsc -p tsconfig.tests.json --noEmit" },
          { name: "manual-review" },
        ],
        review_gates: ["spec-compliance", "implementation-quality", "cli-docs"],
      },
      completion_criteria: ["uh propose produces a validated mission packet."],
    });

    const validation = await validateFile(missionPath);
    expect(validation.valid, validation.errors.join("\n")).toBe(true);
    expect(validation.schema_version).toBe("uh.mission.v0");
  });

  test("applies sensible defaults when optional fields are omitted", async () => {
    await proposeMission(TEST_ROOT, {
      id: "minimal",
      title: "Minimal mission",
      workflow: "research-docs",
      objective: "Capture the bare minimum.",
    });

    const missionPath = join(TEST_ROOT, ".harness", "missions", "minimal", "mission.yaml");
    const written = parse(await readFile(missionPath, "utf-8"));

    expect(written.priority).toBe("medium");
    expect(written.issue_refs).toEqual([]);
    expect(written.context).toEqual({ read_first: [], source_links: [] });
    expect(written.context.repo_root).toBeUndefined();
    expect(written.constraints).toEqual([]);
    expect(written.skills).toEqual({ required: [], suggested: [] });
    expect(written.expected_outputs).toEqual({ files: [] });
    expect(written.sandbox).toEqual({
      backend: "git-worktree",
      promotion_policy: "human-approved",
    });
    expect(written.verification.required_checks).toEqual([]);
    expect(written.verification.review_gates).toEqual([
      "spec-compliance",
      "implementation-quality",
    ]);
    expect(written.completion_criteria).toEqual([]);
    expect((await validateFile(missionPath)).valid).toBe(true);
  });

  test("honors explicit outputPath inside the project root", async () => {
    const explicit = join(TEST_ROOT, ".harness", "proposals", "draft.yaml");
    const result = await proposeMission(TEST_ROOT, {
      id: "drafted",
      title: "Drafted mission",
      workflow: "research-docs",
      objective: "Stash the proposal in a non-default location.",
      outputPath: explicit,
    });

    expect(result.path).toBe(explicit);
    const written = parse(await readFile(explicit, "utf-8"));
    expect(written.id).toBe("drafted");
    expect((await validateFile(explicit)).valid).toBe(true);

    // Default location must not be created when --output overrides it.
    await expect(
      access(join(TEST_ROOT, ".harness", "missions", "drafted", "mission.yaml")),
    ).rejects.toThrow();
  });

  test("rejects outputPath escaping the project root and writes no file", async () => {
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-propose-outside-"));
    try {
      const escaping = join(outsideRoot, "evil.yaml");
      await expect(proposeMission(TEST_ROOT, {
        id: "escape",
        title: "Escape",
        workflow: "research-docs",
        objective: "Try to write outside the project root.",
        outputPath: escaping,
      })).rejects.toThrow(/unsafe output path|outside project root/i);

      await expect(access(escaping)).rejects.toThrow();
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("rejects path-traversal mission id and writes nothing", async () => {
    await expect(proposeMission(TEST_ROOT, {
      id: "../evil",
      title: "Evil",
      workflow: "research-docs",
      objective: "Escape the missions directory.",
    })).rejects.toThrow(/invalid mission id/i);

    await expect(access(join(TEST_ROOT, ".harness", "evil", "mission.yaml"))).rejects.toThrow();
  });

  test("rejects empty title", async () => {
    await expect(proposeMission(TEST_ROOT, {
      id: "blank-title",
      title: "",
      workflow: "research-docs",
      objective: "Title is required.",
    })).rejects.toThrow(/title.*empty/i);

    await expect(
      access(join(TEST_ROOT, ".harness", "missions", "blank-title", "mission.yaml")),
    ).rejects.toThrow();
  });

  test("rejects unknown workflow and writes nothing", async () => {
    await expect(proposeMission(TEST_ROOT, {
      id: "unknown-wf",
      title: "Unknown workflow",
      workflow: "does-not-exist",
      objective: "Workflow must exist.",
    })).rejects.toThrow(/workflow.*does-not-exist.*not found/i);

    await expect(
      access(join(TEST_ROOT, ".harness", "missions", "unknown-wf", "mission.yaml")),
    ).rejects.toThrow();
  });

  test("rejects existing mission without force; force overwrites", async () => {
    const first = await proposeMission(TEST_ROOT, {
      id: "twice",
      title: "Original",
      workflow: "research-docs",
      objective: "First write.",
    });
    const original = await readFile(first.path, "utf-8");

    await expect(proposeMission(TEST_ROOT, {
      id: "twice",
      title: "Updated",
      workflow: "research-docs",
      objective: "Second write attempt.",
    })).rejects.toThrow(/already exists/i);
    await expect(readFile(first.path, "utf-8")).resolves.toBe(original);

    const forced = await proposeMission(TEST_ROOT, {
      id: "twice",
      title: "Updated",
      workflow: "research-docs",
      objective: "Second write attempt.",
      force: true,
    });
    expect(forced.created).toBe(false);
    const updated = parse(await readFile(forced.path, "utf-8"));
    expect(updated.title).toBe("Updated");
    expect(updated.objective).toBe("Second write attempt.");
  });

  test("does not write when in-memory validation would fail", async () => {
    // Corrupt project.yaml to force requireInitializedProject to reject the
    // attempt, proving the abort happens before any mission file is written.
    const projectPath = join(TEST_ROOT, ".harness", "project.yaml");
    await writeFile(projectPath, "schema_version: uh.project.v0\nid: invalid-project\n", "utf-8");

    await expect(proposeMission(TEST_ROOT, {
      id: "no-write",
      title: "Should not be written",
      workflow: "research-docs",
      objective: "Project is broken.",
    })).rejects.toThrow();

    await expect(
      access(join(TEST_ROOT, ".harness", "missions", "no-write", "mission.yaml")),
    ).rejects.toThrow();
  });

  test("returns the in-memory mission alongside the path", async () => {
    const result = await proposeMission(TEST_ROOT, {
      id: "echo",
      title: "Echo",
      workflow: "research-docs",
      objective: "Round-trip the in-memory object.",
      issueRefs: [{ provider: "github", id: "1" }],
    });

    expect(result.mission.id).toBe("echo");
    expect(result.mission.title).toBe("Echo");
    expect(result.mission.workflow_profile).toBe("research-docs");
    expect(result.mission.issue_refs).toEqual([{ provider: "github", id: "1" }]);
  });
});

describe("uh propose CLI", () => {
  test("creates a fully-populated mission and prints the path", async () => {
    const missionPath = join(TEST_ROOT, ".harness", "missions", "cli-propose", "mission.yaml");
    const { stdout, stderr } = await execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "src/cli.ts",
        "propose",
        "cli-propose",
        "--title", "CLI propose",
        "--workflow", "spec-first-feature",
        "--objective", "Bridge metadata to a mission packet via the CLI.",
        "--priority", "high",
        "--issue", "github:7:https://github.com/owner/repo/issues/7",
        "--issue", "linear:UH-15",
        "--read-first", "README.md",
        "--read-first", "docs/architecture/mission-packet-schema.md",
        "--expected-output", "src/harness/propose.ts",
        "--expected-output", "tests/propose.test.ts",
        "--required-check", "cli-help=node dist/cli.js --help",
        "--required-check", "manual-review",
        "--review-gate", "spec-compliance",
        "--constraint", "Do not edit the main checkout.",
        "--required-skill", "writing-plans",
        "--source-link", "https://linear.app/agentic-eng/issue/UH-15",
        "--completion", "uh propose ships.",
        "--root", TEST_ROOT,
      ],
      { cwd: process.cwd() },
    );

    expect(stderr).toBe("");
    expect(stdout).toContain("Created mission: cli-propose");
    expect(stdout).toContain(missionPath);

    const written = parse(await readFile(missionPath, "utf-8"));
    expect(written.priority).toBe("high");
    expect(written.issue_refs).toEqual([
      { provider: "github", id: "7", url: "https://github.com/owner/repo/issues/7" },
      { provider: "linear", id: "UH-15" },
    ]);
    expect(written.context.read_first).toEqual([
      "README.md",
      "docs/architecture/mission-packet-schema.md",
    ]);
    expect(written.expected_outputs.files).toEqual([
      "src/harness/propose.ts",
      "tests/propose.test.ts",
    ]);
    expect(written.verification.required_checks).toEqual([
      { name: "cli-help", command: "node dist/cli.js --help" },
      { name: "manual-review" },
    ]);
    expect(written.verification.review_gates).toEqual(["spec-compliance"]);
    expect(written.constraints).toEqual(["Do not edit the main checkout."]);
    expect(written.skills.required).toEqual(["writing-plans"]);
    expect(written.context.source_links).toEqual([
      "https://linear.app/agentic-eng/issue/UH-15",
    ]);
    expect(written.completion_criteria).toEqual(["uh propose ships."]);

    expect((await validateFile(missionPath)).valid).toBe(true);
  });

  test("honors --output to write the mission to an alternative path", async () => {
    const out = join(TEST_ROOT, ".harness", "proposals", "alt.yaml");
    const { stdout, stderr } = await execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "src/cli.ts",
        "propose",
        "alt-mission",
        "--title", "Alternative path",
        "--workflow", "research-docs",
        "--objective", "Write to a non-default path.",
        "--output", out,
        "--root", TEST_ROOT,
      ],
      { cwd: process.cwd() },
    );

    expect(stderr).toBe("");
    expect(stdout).toContain(out);

    const written = parse(await readFile(out, "utf-8"));
    expect(written.id).toBe("alt-mission");
    expect((await validateFile(out)).valid).toBe(true);
  });

  test("exits non-zero with a clear error when workflow is unknown", async () => {
    await expect(execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "src/cli.ts",
        "propose",
        "bad-wf",
        "--title", "Bad workflow",
        "--workflow", "does-not-exist",
        "--objective", "Workflow does not exist.",
        "--root", TEST_ROOT,
      ],
      { cwd: process.cwd() },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/\[FAIL\] propose error/),
    });

    await expect(
      access(join(TEST_ROOT, ".harness", "missions", "bad-wf", "mission.yaml")),
    ).rejects.toThrow();
  });
});
