import { beforeAll, beforeEach, afterEach, describe, expect, test } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { planOhMyPiRun } from "../src/adapters/oh-my-pi.js";

const TEST_ROOT = "/tmp/uh-test-prompt-transmission";

async function cleanup() {
  await rm(TEST_ROOT, { recursive: true, force: true });
}

beforeAll(cleanup);
beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
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
  test("passes structured mission fields through the real planner argv seam", async () => {
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

    const plan = await planOhMyPiRun(TEST_ROOT, missionPath);
    const transmittedPrompt = plan.args[plan.args.length - 1];

    expect(transmittedPrompt).toBe(plan.prompt);
    expect(transmittedPrompt).toContain("Preserve the complete mission packet.");
    expect(transmittedPrompt).toContain(
      "## Constraints\n" +
      "- Do not drop this constraint.\n" +
      "- Keep this second constraint after the first.\n",
    );
    expect(transmittedPrompt).toContain(
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
});
