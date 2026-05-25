import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeHarness } from "../src/harness/init.js";
import { createMission } from "../src/harness/mission.js";
import { validateFile } from "../src/harness/validate.js";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-mission-design-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("UH-75 mission design companion", () => {
  test("scaffolds mission.yaml without design.md by default", async () => {
    const result = await createMission(TEST_ROOT, {
      id: "m-nodesign",
      title: "No design",
      workflow: "spec-first-feature",
      objective: "Plain mission",
    });
    expect(result.designPath).toBeUndefined();
    const yaml = await readFile(result.path, "utf-8");
    expect(yaml).not.toContain("design_path:");
    await expect(access(join(TEST_ROOT, ".harness", "missions", "m-nodesign", "design.md"))).rejects.toThrow();
  });

  test("scaffolds mission.yaml + design.md with --design", async () => {
    const result = await createMission(TEST_ROOT, {
      id: "m-design",
      title: "With design",
      workflow: "spec-first-feature",
      objective: "Investigate cross-runtime parity",
      withDesign: true,
    });
    expect(result.designPath).toBeDefined();
    const yaml = await readFile(result.path, "utf-8");
    expect(yaml).toMatch(/design_path: design\.md/);
    const design = await readFile(result.designPath!, "utf-8");
    expect(design).toContain("# Design: With design");
    expect(design).toContain("Investigate cross-runtime parity");
    expect(design).toContain("## Decisions");
    expect(design).toContain("## Alternatives considered");
  });

  test("validate warns when mission has acceptance_criteria but no design.md", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m-ac");
    await initializeHarness(TEST_ROOT);
    const yaml = [
      "schema_version: uh.mission.v0",
      "id: m-ac",
      "title: AC mission",
      "workflow_profile: spec-first-feature",
      "acceptance_criteria:",
      "  - id: ac-1",
      "    description: Implement the thing",
      "    severity: block",
      "",
    ].join("\n");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const missionPath = join(dir, "mission.yaml");
    await writeFile(missionPath, yaml, "utf-8");
    const result = await validateFile(missionPath);
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(
      "Mission declares acceptance criteria but no design.md exists at design.md",
    );
  });

  test("validate is warning-free when mission has acceptance_criteria and design.md exists", async () => {
    const result = await createMission(TEST_ROOT, {
      id: "m-clean",
      title: "Clean mission",
      workflow: "spec-first-feature",
      objective: "Has design",
      withDesign: true,
    });
    // Inject acceptance_criteria.
    const yaml = await readFile(result.path, "utf-8");
    const augmented = `${yaml}\nacceptance_criteria:\n  - id: ac-1\n    description: do the thing\n    severity: block\n`;
    await writeFile(result.path, augmented, "utf-8");
    const validation = await validateFile(result.path);
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toEqual([]);
  });
});

const CONSTRAINTS_ADVISORY_WARNING =
  "Mission declares constraints[] (advisory prompt directives only; not enforced by uh verify). "
  + "Encode enforceable rules as acceptance_criteria with check_command or verification.required_checks with command.";

describe("UH-130 constraints advisory warning", () => {
  test("validate warns when mission has constraints but no runnable checks", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m-constraints");
    const yaml = [
      "schema_version: uh.mission.v0",
      "id: m-constraints",
      "title: Constraints only",
      "workflow_profile: spec-first-feature",
      "constraints:",
      "  - Template MUST include placeholder comments",
      "",
    ].join("\n");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const missionPath = join(dir, "mission.yaml");
    await writeFile(missionPath, yaml, "utf-8");
    const result = await validateFile(missionPath);
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain(CONSTRAINTS_ADVISORY_WARNING);
  });

  test("validate is warning-free when constraints pair with check_command AC", async () => {
    const dir = join(TEST_ROOT, ".harness", "missions", "m-constraints-ac");
    const yaml = [
      "schema_version: uh.mission.v0",
      "id: m-constraints-ac",
      "title: Constraints with enforcement",
      "workflow_profile: spec-first-feature",
      "constraints:",
      "  - Prefer small diffs",
      "acceptance_criteria:",
      "  - id: ac-1",
      "    description: Placeholder comments exist",
      "    check_command: grep -q SLICE_ID",
      "    severity: block",
      "",
    ].join("\n");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const missionPath = join(dir, "mission.yaml");
    await writeFile(missionPath, yaml, "utf-8");
    const result = await validateFile(missionPath);
    expect(result.valid).toBe(true);
    expect(result.warnings).not.toContain(CONSTRAINTS_ADVISORY_WARNING);
  });
});
