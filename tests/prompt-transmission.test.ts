import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { dryRunOhMyPi } from "../src/adapters/oh-my-pi.js";
import { planClaudeCodeRun } from "../src/adapters/claude-code.js";
import { writeGuardHookFixture } from "./guard-hook-fixtures.js";

const TEST_ROOT = mkdtempSync(join(tmpdir(), "uh-test-prompt-transmission-"));
// The Claude Code planner snapshots the built guard hook; point it at a fixture
// so planning needs neither a real build nor the per-user cache.
const SNAPSHOT_ROOT = mkdtempSync(join(tmpdir(), "uh-test-prompt-transmission-snapshot-"));
const PREVIOUS_DIST = process.env.UH_HARNESS_DIST;
const PREVIOUS_CACHE = process.env.UH_RUNTIME_SNAPSHOT_CACHE;

async function cleanup() {
  await rm(TEST_ROOT, { recursive: true, force: true });
}

beforeAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await addAdapter(TEST_ROOT, "claude-code");
  const hook = join(SNAPSHOT_ROOT, "dist", "extensions", "tool-guard", "claude-code-hook.js");
  await mkdir(dirname(hook), { recursive: true });
  await writeGuardHookFixture(hook);
  process.env.UH_HARNESS_DIST = join(SNAPSHOT_ROOT, "dist");
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = join(SNAPSHOT_ROOT, "cache");
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "oh-my-pi.yaml"),
    `schema_version: uh.adapter.v0
id: oh-my-pi
name: oh-my-pi
runtime: oh-my-pi
capabilities:
  - cli-execution
status: experimental
config:
  cli_command: omp
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    mode: json
    thinking: ""
    allow_extensions: false
    allow_skills: false
`,
    "utf-8",
  );
});
afterEach(cleanup);

describe("planOhMyPiRun prompt transmission", () => {
  test("passes structured mission fields through the run's prompt file, not argv", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "structured-transmission");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: structured-transmission
name: Structured Transmission
objective: Preserve the complete mission packet.
workflow_profile: research-docs
constraints:
  - Do not drop this constraint.
  - Keep this second constraint after the first.
expected_outputs:
  files:
    - src/output.ts
verification:
  checks:
    - bun run test -- tests/output.test.ts
acceptance_criteria:
  - id: ac-output
    description: The output file is complete.
    check_command: bun run test -- tests/output.test.ts
    severity: block
  - id: ac-review
    description: A reviewer confirms the result.
    severity: warn
runtime_config_overrides:
  honcho_memory: false
`,
      "utf-8",
    );

    const result = await dryRunOhMyPi(TEST_ROOT, missionPath);
    const transmittedPrompt = result.args[result.args.length - 1];

    // The runtime reads the prompt from the run's prompt.md; argv carries only the path.
    expect(result.promptSource).toBe("file");
    expect(transmittedPrompt).toBe(`@${result.promptPath}`);
    expect(transmittedPrompt).not.toContain("Preserve the complete mission packet.");
    expect(result.args).not.toContain(result.prompt);
    const promptText = await readFile(result.promptPath!, "utf8");
    expect(promptText).toBe(result.prompt);
    expect(promptText).toContain("Preserve the complete mission packet.");
    expect(promptText).toContain(
      "## Constraints\n" +
      "- Do not drop this constraint.\n" +
      "- Keep this second constraint after the first.\n",
    );
    expect(promptText).toContain(
      "## Expected Artifacts\n- src/output.ts\n\n" +
      "## Verification Checks\n- bun run test -- tests/output.test.ts\n\n" +
      "## Constraints\n" +
      "- Do not drop this constraint.\n" +
      "- Keep this second constraint after the first.\n\n" +
      "## Acceptance Criteria\n" +
      "- ac-output [block] The output file is complete.\n" +
      "  - check_command: bun run test -- tests/output.test.ts\n" +
      "- ac-review [warn] A reviewer confirms the result.\n\n",
    );
  });

  test("renders empty mission lists explicitly as none, add nothing", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "sparse-transmission");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: sparse-transmission
name: Sparse Transmission
objective: Every mission list must render, even when empty.
workflow_profile: research-docs
`,
      "utf-8",
    );

    const result = await dryRunOhMyPi(TEST_ROOT, missionPath);
    const transmittedPrompt = result.args[result.args.length - 1];

    expect(transmittedPrompt).toBe(`@${result.promptPath}`);
    expect(result.args).not.toContain(result.prompt);
    const promptText = await readFile(result.promptPath!, "utf8");
    expect(promptText).toBe(result.prompt);
    expect(promptText).toContain(
      "## Read First\n- none, add nothing\n\n" +
      "## Expected Artifacts\n- none, add nothing\n\n" +
      "## Verification Checks\n- none, add nothing\n\n" +
      "## Constraints\n- none, add nothing\n\n" +
      "## Acceptance Criteria\n- none, add nothing\n\n" +
      "Execute this mission and produce the expected artifacts.\n",
    );
  });
});

describe("planClaudeCodeRun prompt transmission", () => {
  test("sends the prompt as a stream-json user message on stdin, never in argv", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "claude-stdin");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: claude-stdin
title: Claude Stdin Transmission
objective: Deliver the packet as the user's task, not piped context.
workflow_profile: research-docs
guard:
  write_roots:
    - out
`,
      "utf-8",
    );

    const plan = await planClaudeCodeRun(TEST_ROOT, missionPath);
    expect(plan.promptSource).toBe("stdin");
    expect(plan.args).toContain("-p");
    expect(plan.args[plan.args.indexOf("-p") + 1]).not.toBe(plan.prompt);
    expect(plan.args).not.toContain(plan.prompt);
    // The documented print-mode input format that makes stdin the user's task.
    expect(plan.args[plan.args.indexOf("--input-format") + 1]).toBe("stream-json");
    const message = JSON.parse(plan.stdin) as { type: string; message: { role: string; content: string } };
    expect(message.type).toBe("user");
    expect(message.message.role).toBe("user");
    expect(message.message.content).toBe(plan.prompt);
    expect(message.message.content).toContain("Deliver the packet as the user's task, not piped context.");
  });
});
afterAll(async () => {
  await cleanup();
  if (PREVIOUS_DIST === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = PREVIOUS_DIST;
  if (PREVIOUS_CACHE === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = PREVIOUS_CACHE;
  rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
});
