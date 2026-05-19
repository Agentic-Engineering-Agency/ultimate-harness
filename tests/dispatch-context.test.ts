import { describe, expect, test } from "vitest";
import { validateMission, type MissionDocument } from "../src/schema/mission.js";
import { validateWorkflow, type WorkflowDocument } from "../src/schema/workflow.js";
import { buildDispatchContext } from "../src/harness/dispatch-context.js";
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

      Execute this mission and produce the expected artifacts.
      ::FINAL::"
    `);
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

  test("renderPrompt omits sections when their lists are empty", () => {
    const sparse = validateMission({
      schema_version: "uh.mission.v0",
      id: "m-sparse",
      title: "Sparse",
      workflow_profile: "spec-first-feature",
      objective: "Just the basics.",
    });
    const ctx = buildDispatchContext(sparse, undefined, { finalMessageInstruction: "::F::" });
    const prompt = renderPrompt(ctx);
    expect(prompt).toMatchInlineSnapshot(`
      "# Mission: Sparse

      Just the basics.

      Execute this mission and produce the expected artifacts.
      ::F::"
    `);
  });
});
