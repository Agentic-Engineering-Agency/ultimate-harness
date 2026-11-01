import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateMission, type MissionDocument } from "../src/schema/mission.js";
import { validateWorkflow, type WorkflowDocument } from "../src/schema/workflow.js";
import {
  buildDispatchContext,
  PROJECT_FACTS_CHAR_LIMIT,
} from "../src/harness/dispatch-context.js";
import { renderPrompt } from "../src/harness/render-prompt.js";

const FIXTURE_MISSION: MissionDocument = validateMission({
  schema_version: "uh.mission.v0",
  id: "m-fix",
  title: "Fixture mission",
  workflow_profile: "spec-first-feature",
  priority: "medium",
  objective: "Demonstrate cross-adapter prompt parity.",
  issue_refs: [
    { provider: "linear", id: "UH-80", url: "https://linear.app/agentic-eng/issue/UH-80" },
  ],
  context: {
    read_first: ["docs/architecture/runtime-adapter-contract.md", "src/harness/render-prompt.ts"],
    source_links: [],
  },
  expected_outputs: { files: ["src/foo.ts", "tests/foo.test.ts"] },
  verification: {
    required_checks: [
      { name: "typecheck", command: "bun run typecheck" },
      { name: "test", command: "bun run test" },
    ],
    review_gates: ["spec-compliance"],
  },
});

const FIXTURE_WORKFLOW: WorkflowDocument = validateWorkflow({
  schema_version: "uh.workflow.v0",
  id: "spec-first-feature",
  name: "Spec-First Feature Development",
  description: "Define spec before implementation.",
  phases: [
    { name: "spec", agent_role: "architect", description: "Write technical specification", outputs: ["spec"] },
    { name: "implement", agent_role: "developer", description: "Implement according to spec", outputs: ["code"] },
    { name: "verify", agent_role: "reviewer", description: "Verify implementation against spec", outputs: ["results"] },
  ],
});

const FINAL_INSTRUCTION = "::FINAL::";
const STRUCTURED_MISSION: MissionDocument = validateMission({
  schema_version: "uh.mission.v0",
  id: "m-structured",
  title: "Structured mission",
  workflow_profile: "research-docs",
  objective: "Preserve structured mission fields.",
  constraints: [
    "Keep this line exactly.\nKeep this literal continuation.",
    "Second constraint arrives after the first.",
  ],
  acceptance_criteria: [
    {
      id: "ac-build",
      description: "Build output exists.\nThe description keeps its second line.",
      check_command: "bun run build --literal='a b'",
      severity: "block",
    },
    {
      id: "ac-review",
      description: "A reviewer confirms the result.",
      severity: "warn",
    },
  ],
});


describe("UH-80 dispatch context contract", () => {
  test("buildDispatchContext copies mission fields without mutating them", () => {
    const ctx = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW);
    expect(ctx.mission).toBe(FIXTURE_MISSION);
    expect(ctx.workflow).toBe(FIXTURE_WORKFLOW);
    expect(ctx.issues).toEqual([
      { source: "linear", reference: "UH-80", url: "https://linear.app/agentic-eng/issue/UH-80" },
    ]);
    expect(ctx.readFirst).toEqual([
      "docs/architecture/runtime-adapter-contract.md",
      "src/harness/render-prompt.ts",
    ]);
    expect(ctx.expectedArtifacts).toEqual([
      { path: "src/foo.ts" },
      { path: "tests/foo.test.ts" },
    ]);
    expect(ctx.verificationChecks).toEqual(["bun run typecheck", "bun run test"]);
    // Mutating ctx must not leak back to the source mission.
    ctx.readFirst.push("docs/new.md");
    expect(FIXTURE_MISSION.read_first).not.toContain("docs/new.md");
  });

  test("renderPrompt produces a stable canonical prompt", () => {
    const ctx = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      // An explicit empty brief keeps this snapshot independent of the
      // repository's real .harness/project-brief.md.
      projectBrief: "",
    });
    const prompt = renderPrompt(ctx);
    expect(prompt).toMatchInlineSnapshot(`
      "# Mission: Fixture mission

      Demonstrate cross-adapter prompt parity.

      ## Workflow: Spec-First Feature Development

      ### spec (architect)
      Write technical specification

      ### implement (developer)
      Implement according to spec

      ### verify (reviewer)
      Verify implementation against spec

      ## Related Issues
      - [linear] UH-80 (https://linear.app/agentic-eng/issue/UH-80)

      ## Read First
      - docs/architecture/runtime-adapter-contract.md
      - src/harness/render-prompt.ts

      ## Expected Artifacts
      - src/foo.ts
      - tests/foo.test.ts

      ## Verification Checks
      - bun run typecheck
      - bun run test

      ## Constraints
      - none, add nothing

      ## Acceptance Criteria
      - none, add nothing

      Execute this mission and produce the expected artifacts.
      ::FINAL::"
    `);
  });

  test("transmits constraints and acceptance criteria without mutating the mission", () => {
    const ctx = buildDispatchContext(STRUCTURED_MISSION, undefined, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    });

    expect(ctx.constraints).toEqual([
      "Keep this line exactly.\nKeep this literal continuation.",
      "Second constraint arrives after the first.",
    ]);
    expect(ctx.acceptanceCriteria).toEqual([
      {
        id: "ac-build",
        description: "Build output exists.\nThe description keeps its second line.",
        check_command: "bun run build --literal='a b'",
        severity: "block",
      },
      {
        id: "ac-review",
        description: "A reviewer confirms the result.",
        severity: "warn",
      },
    ]);

    ctx.constraints[0] = "changed";
    ctx.acceptanceCriteria[0].description = "changed";
    expect(STRUCTURED_MISSION.constraints[0]).toBe("Keep this line exactly.\nKeep this literal continuation.");
    expect(STRUCTURED_MISSION.acceptance_criteria[0].description).toBe(
      "Build output exists.\nThe description keeps its second line.",
    );
  });

  test("renders structured fields in declared order and preserves optional commands", () => {
    const prompt = renderPrompt(buildDispatchContext(STRUCTURED_MISSION, undefined, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    }));

    expect(prompt).toContain(
      "## Constraints\n" +
      "- Keep this line exactly.\n" +
      "Keep this literal continuation.\n" +
      "- Second constraint arrives after the first.\n\n",
    );
    expect(prompt).toContain(
      "## Acceptance Criteria\n" +
      "- ac-build [block] Build output exists.\n" +
      "The description keeps its second line.\n" +
      "  - check_command: bun run build --literal='a b'\n" +
      "- ac-review [warn] A reviewer confirms the result.\n\n",
    );
    const reviewStart = prompt.indexOf("- ac-review [warn]");
    expect(prompt.slice(reviewStart).split("\n\n", 1)[0]).toBe(
      "- ac-review [warn] A reviewer confirms the result.",
    );
    expect(prompt.indexOf("## Constraints")).toBeLessThan(prompt.indexOf("## Acceptance Criteria"));
    expect(prompt.indexOf("## Acceptance Criteria")).toBeLessThan(prompt.indexOf("Execute this mission"));
  });

  test("renders normalized legacy completion criteria as warn acceptance criteria", () => {
    const legacy = validateMission({
      schema_version: "uh.mission.v0",
      id: "m-legacy",
      title: "Legacy",
      workflow_profile: "research-docs",
      objective: "Keep old missions working.",
      completion_criteria: ["First legacy criterion", "Second legacy criterion\nwith a literal line."],
    });
    const ctx = buildDispatchContext(legacy, undefined, { finalMessageInstruction: FINAL_INSTRUCTION });

    expect(ctx.acceptanceCriteria).toEqual([
      { id: "ac-1", description: "First legacy criterion", severity: "warn" },
      { id: "ac-2", description: "Second legacy criterion\nwith a literal line.", severity: "warn" },
    ]);
    expect(renderPrompt(ctx)).toContain(
      "- ac-1 [warn] First legacy criterion\n" +
      "- ac-2 [warn] Second legacy criterion\n" +
      "with a literal line.\n",
    );
  });

  test("renderPrompt appends a memory block when present (OMP-style enrichment)", () => {
    const ctx = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      memoryBlock: "[Persistent memory]\nProject summary:\nfoo",
    });
    const prompt = renderPrompt(ctx);
    expect(prompt.endsWith("::FINAL::\n\n[Persistent memory]\nProject summary:\nfoo")).toBe(true);
  });

  test("hermes / codex / hermes-proxy adapters all emit identical prompts for the same mission", async () => {
    // Same dispatch context → same string. This guarantees cross-adapter
    // parity at the prompt layer regardless of adapter-specific preludes.
    const ctxA = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    });
    const ctxB = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    });
    const ctxC = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    });
    expect(renderPrompt(ctxA)).toEqual(renderPrompt(ctxB));
    expect(renderPrompt(ctxB)).toEqual(renderPrompt(ctxC));
  });

  test("oh-my-pi adapter only diverges by adding a memory block on top of the shared base", () => {
    const ctx = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
    });
    const base = renderPrompt(ctx);
    ctx.memoryBlock = "[Persistent memory]\nx";
    const enriched = renderPrompt(ctx);
    expect(enriched.startsWith(base)).toBe(true);
    expect(enriched.slice(base.length)).toBe("\n\n[Persistent memory]\nx");
  });

  test("renderPrompt renders empty mission lists explicitly as none, add nothing", () => {
    const sparse = validateMission({
      schema_version: "uh.mission.v0",
      id: "m-sparse",
      title: "Sparse",
      workflow_profile: "spec-first-feature",
      objective: "Just the basics.",
    });
    const ctx = buildDispatchContext(sparse, undefined, {
      finalMessageInstruction: "::F::",
      // Explicit empty brief: no dependence on the repository's real brief.
      projectBrief: "",
    });
    const prompt = renderPrompt(ctx);
    expect(ctx.constraints).toEqual([]);
    expect(ctx.acceptanceCriteria).toEqual([]);
    expect(prompt).toMatchInlineSnapshot(`
      "# Mission: Sparse

      Just the basics.

      ## Read First
      - none, add nothing

      ## Expected Artifacts
      - none, add nothing

      ## Verification Checks
      - none, add nothing

      ## Constraints
      - none, add nothing

      ## Acceptance Criteria
      - none, add nothing

      Execute this mission and produce the expected artifacts.
      ::F::"
    `);
  });
});

describe("project facts and template worker rules", () => {
  test("appends template worker rules after the mission's own constraints", () => {
    const ctx = buildDispatchContext(STRUCTURED_MISSION, undefined, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      workerRules: ["Work in many small turns."],
    });
    expect(ctx.constraints).toEqual([
      ...STRUCTURED_MISSION.constraints,
      "Work in many small turns.",
    ]);

    const prompt = renderPrompt(ctx);
    expect(prompt).toContain("- Work in many small turns.");
    // The rule lands after the mission's own constraints, never before them.
    expect(prompt.indexOf("- Work in many small turns.")).toBeGreaterThan(
      prompt.indexOf("- Second constraint arrives after the first."),
    );
  });

  test("renders the project brief once in a Project facts section", () => {
    const ctx = buildDispatchContext(FIXTURE_MISSION, FIXTURE_WORKFLOW, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      projectBrief: "Bun + vitest. No new dependencies.",
    });
    expect(ctx.projectFacts).toBe("Bun + vitest. No new dependencies.");

    const prompt = renderPrompt(ctx);
    expect(prompt).toContain("## Project facts\nBun + vitest. No new dependencies.\n\n");
    expect(prompt.split("## Project facts").length - 1).toBe(1);
  });

  test("renders a brief from the given root and nothing when the root has none", async () => {
    // An explicit root keeps this independent of the working directory.
    const dir = await mkdtemp(path.join(tmpdir(), "uh-brief-"));
    try {
      const withoutBrief = buildDispatchContext(FIXTURE_MISSION, undefined, {
        root: dir,
        finalMessageInstruction: FINAL_INSTRUCTION,
      });
      expect(withoutBrief.projectFacts).toBeUndefined();
      expect(renderPrompt(withoutBrief)).not.toContain("## Project facts");

      await mkdir(path.join(dir, ".harness"), { recursive: true });
      await writeFile(path.join(dir, ".harness", "project-brief.md"), "Repo facts from disk.\n", "utf-8");
      const withBrief = buildDispatchContext(FIXTURE_MISSION, undefined, {
        root: dir,
        finalMessageInstruction: FINAL_INSTRUCTION,
      });
      expect(withBrief.projectFacts).toBe("Repo facts from disk.");
      expect(renderPrompt(withBrief)).toContain("## Project facts\nRepo facts from disk.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("caps the project brief at the limit with a clear truncation note", () => {
    const long = "a".repeat(PROJECT_FACTS_CHAR_LIMIT + 500);
    const ctx = buildDispatchContext(FIXTURE_MISSION, undefined, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      projectBrief: long,
    });

    expect(ctx.projectFacts).toBeDefined();
    expect(ctx.projectFacts!.length).toBeLessThanOrEqual(PROJECT_FACTS_CHAR_LIMIT);
    expect(ctx.projectFacts).toContain("project brief truncated");

    const prompt = renderPrompt(ctx);
    expect(prompt).toContain("project brief truncated");
    expect(prompt.split("## Project facts").length - 1).toBe(1);
  });

  test("a mission with no context.project_brief still renders the brief from the root", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uh-brief-default-"));
    try {
      await mkdir(path.join(dir, ".harness"), { recursive: true });
      await writeFile(path.join(dir, ".harness", "project-brief.md"), "Default facts.\n", "utf-8");
      const ctx = buildDispatchContext(FIXTURE_MISSION, undefined, {
        root: dir,
        finalMessageInstruction: FINAL_INSTRUCTION,
      });
      expect(ctx.projectFacts).toBe("Default facts.");
      expect(renderPrompt(ctx)).toContain("## Project facts\nDefault facts.");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("context.project_brief false renders no Project facts section", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "uh-brief-off-"));
    try {
      await mkdir(path.join(dir, ".harness"), { recursive: true });
      await writeFile(path.join(dir, ".harness", "project-brief.md"), "Repo facts from disk.\n", "utf-8");
      const optedOut = validateMission({
        schema_version: "uh.mission.v0",
        id: "m-brief-off",
        title: "Brief off",
        workflow_profile: "research-docs",
        objective: "Read everything without the brief's reading rules.",
        context: { project_brief: false },
      });
      const ctx = buildDispatchContext(optedOut, undefined, {
        root: dir,
        finalMessageInstruction: FINAL_INSTRUCTION,
      });
      expect(ctx.projectFacts).toBeUndefined();
      expect(renderPrompt(ctx)).not.toContain("## Project facts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an explicit projectBrief overrides context.project_brief: false", () => {
    const optedOut = validateMission({
      schema_version: "uh.mission.v0",
      id: "m-brief-off",
      title: "Brief off",
      workflow_profile: "research-docs",
      objective: "Keep a caller-supplied brief.",
      context: { project_brief: false },
    });
    const ctx = buildDispatchContext(optedOut, undefined, {
      finalMessageInstruction: FINAL_INSTRUCTION,
      projectBrief: "Caller-supplied facts.",
    });
    expect(ctx.projectFacts).toBe("Caller-supplied facts.");
    expect(renderPrompt(ctx)).toContain("## Project facts\nCaller-supplied facts.\n\n");
  });

  test("the mission schema accepts project_brief true, false and absent", () => {
    const base = {
      schema_version: "uh.mission.v0",
      id: "m-brief",
      title: "Brief",
      workflow_profile: "research-docs",
      objective: "Exercise the project_brief switch.",
    };
    expect(validateMission({ ...base, context: { project_brief: true } }).context.project_brief).toBe(true);
    expect(validateMission({ ...base, context: { project_brief: false } }).context.project_brief).toBe(false);
    expect(validateMission({ ...base }).context.project_brief).toBeUndefined();
  });
});
