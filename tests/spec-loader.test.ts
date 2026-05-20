import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import {
  linearRefsFromSpec,
  loadSpecFile,
  parseSpecContent,
} from "../src/harness/spec-loader.js";
import { initializeHarness } from "../src/harness/init.js";
import { proposeMissionFromSpec } from "../src/harness/propose.js";
import { validateFile } from "../src/harness/validate.js";

const execFileP = promisify(execFile);

const VALID_SPEC = `---
schema: uh.spec.v0
id: UH-107
title: uh mission propose from .spec.md
status: draft
owners: [LaloLalo1999]
linear: UH-107
---

## Goal

Generate mission packets from uh.spec.v0 markdown files.

## Non-goals

- Test scaffold generation (UH-108)
- Spec-stale drift detection (UH-109)

## Acceptance criteria

1. AC1: parses YAML front-matter from spec
2. AC2: rejects spec missing required sections
3. rejects malformed front-matter

## Risks

- Spec format drift from epic planning docs

## Open questions

- None
`;

describe("parseSpecContent", () => {
  test("parses valid uh.spec.v0 with required sections", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    expect(spec.frontMatter.schema).toBe("uh.spec.v0");
    expect(spec.frontMatter.id).toBe("UH-107");
    expect(spec.frontMatter.title).toBe("uh mission propose from .spec.md");
    expect(spec.frontMatter.status).toBe("draft");
    expect(spec.frontMatter.owners).toEqual(["LaloLalo1999"]);
    expect(spec.frontMatter.linear).toBe("UH-107");
    expect(spec.goal).toBe("Generate mission packets from uh.spec.v0 markdown files.");
    expect(spec.nonGoals).toEqual([
      "Test scaffold generation (UH-108)",
      "Spec-stale drift detection (UH-109)",
    ]);
    expect(spec.acceptanceCriteria).toEqual([
      { id: "AC1", description: "parses YAML front-matter from spec" },
      { id: "AC2", description: "rejects spec missing required sections" },
      { id: "AC3", description: "rejects malformed front-matter" },
    ]);
    expect(spec.risks).toEqual(["Spec format drift from epic planning docs"]);
    expect(spec.openQuestions).toEqual(["None"]);
  });

  test("rejects spec missing front-matter delimiters", () => {
    expect(() => parseSpecContent("# No front matter\n", "bad.spec.md")).toThrow(
      /missing YAML front-matter/,
    );
  });

  test("rejects malformed front-matter YAML", () => {
    const raw = `---
schema: uh.spec.v0
id: [broken
---
## Goal
x
## Non-goals
- a
## Acceptance criteria
1. one
## Risks
- r
## Open questions
- q
`;
    expect(() => parseSpecContent(raw, "bad-yaml.spec.md")).toThrow(/not valid YAML/);
  });

  test("rejects wrong schema version", () => {
    const raw = VALID_SPEC.replace("uh.spec.v0", "uh.spec.v1");
    expect(() => parseSpecContent(raw, "wrong-schema.spec.md")).toThrow();
  });

  test("rejects missing required H2 section", () => {
    const raw = VALID_SPEC.replace("## Risks\n\n- Spec format drift from epic planning docs\n\n", "");
    expect(() => parseSpecContent(raw, "missing-section.spec.md")).toThrow(
      /missing required section "## Risks"/,
    );
  });

  test("rejects empty Goal section", () => {
    const raw = VALID_SPEC.replace(
      "## Goal\n\nGenerate mission packets from uh.spec.v0 markdown files.\n",
      "## Goal\n\n\n",
    );
    expect(() => parseSpecContent(raw, "empty-goal.spec.md")).toThrow(/Goal.*must not be empty/);
  });

  test("rejects acceptance criteria section with no numbered items", () => {
    const raw = VALID_SPEC.replace(
      "## Acceptance criteria\n\n1. AC1: parses YAML front-matter from spec\n2. AC2: rejects spec missing required sections\n3. rejects malformed front-matter\n",
      "## Acceptance criteria\n\n- not a numbered list\n",
    );
    expect(() => parseSpecContent(raw, "empty-ac.spec.md")).toThrow(
      /at least one numbered item/,
    );
  });

  test("linearRefsFromSpec maps linear front-matter to issue refs", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    expect(linearRefsFromSpec(spec)).toEqual([{ provider: "linear", id: "UH-107" }]);
  });

  test("linearRefsFromSpec supports array linear ids", () => {
    const raw = VALID_SPEC.replace("linear: UH-107", "linear: [UH-107, UH-108]");
    const spec = parseSpecContent(raw, "multi-linear.spec.md");
    expect(linearRefsFromSpec(spec)).toEqual([
      { provider: "linear", id: "UH-107" },
      { provider: "linear", id: "UH-108" },
    ]);
  });
});

describe("loadSpecFile", () => {
  test("reads spec from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uh-spec-loader-"));
    const specPath = join(dir, "sample.spec.md");
    await writeFile(specPath, VALID_SPEC, "utf-8");
    const loaded = await loadSpecFile(specPath);
    expect(loaded.frontMatter.id).toBe("UH-107");
    await rm(dir, { recursive: true, force: true });
  });
});

describe("proposeMissionFromSpec", () => {
  let testRoot: string;

  test.beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "uh-propose-from-spec-"));
    await initializeHarness(testRoot);
    const specPath = join(testRoot, "feature.spec.md");
    await writeFile(specPath, VALID_SPEC, "utf-8");
  });

  test.afterEach(async () => {
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  });

  test("writes mission.yaml from spec fields", async () => {
    const result = await proposeMissionFromSpec(testRoot, {
      specPath: "feature.spec.md",
      workflow: "spec-first-feature",
    });

    expect(result.created).toBe(true);
    expect(result.path).toContain(join(".harness", "missions", "UH-107", "mission.yaml"));

    const written = parse(await readFile(result.path, "utf-8"));
    expect(written.id).toBe("UH-107");
    expect(written.title).toBe("uh mission propose from .spec.md");
    expect(written.objective).toBe("Generate mission packets from uh.spec.v0 markdown files.");
    expect(written.issue_refs).toEqual([{ provider: "linear", id: "UH-107" }]);
    expect(written.context.read_first).toContain("feature.spec.md");
    expect(written.acceptance_criteria).toEqual([
      { id: "AC1", description: "parses YAML front-matter from spec", severity: "block" },
      { id: "AC2", description: "rejects spec missing required sections", severity: "block" },
      { id: "AC3", description: "rejects malformed front-matter", severity: "block" },
    ]);

    expect((await validateFile(result.path)).valid).toBe(true);
  });

  test("allows overriding mission id from CLI positional", async () => {
    const result = await proposeMissionFromSpec(testRoot, {
      specPath: "feature.spec.md",
      workflow: "spec-first-feature",
      id: "uh-107-custom",
    });
    expect(result.path).toContain(join(".harness", "missions", "uh-107-custom", "mission.yaml"));
  });
});

describe("uh propose --from CLI", () => {
  let testRoot: string;

  test.beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "uh-propose-cli-from-"));
    await initializeHarness(testRoot);
    await writeFile(join(testRoot, "feature.spec.md"), VALID_SPEC, "utf-8");
  });

  test.afterEach(async () => {
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  });

  test("creates mission from spec via CLI", async () => {
    const missionPath = join(testRoot, ".harness", "missions", "UH-107", "mission.yaml");
    const { stdout, stderr } = await execFileP(
      join(process.cwd(), "node_modules", ".bin", "tsx"),
      [
        "src/cli.ts",
        "propose",
        "--from", "feature.spec.md",
        "--root", testRoot,
      ],
      { cwd: process.cwd() },
    );

    expect(stderr).toBe("");
    expect(stdout).toContain("Created mission: UH-107");
    expect(stdout).toContain(missionPath);

    const written = parse(await readFile(missionPath, "utf-8"));
    expect(written.workflow_profile).toBe("spec-first-feature");
    expect(written.acceptance_criteria).toHaveLength(3);
  });
});
