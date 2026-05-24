import { test, expect, describe, beforeAll } from "vitest";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";
import {
  checkCodex,
  detectCodexQuotaError,
  dryRunCodex,
  parseCodexJsonlStream,
  planCodexRun,
  runCodex,
  type CodexRunner,
  type DiffCollector,
} from "../src/adapters/codex.js";

const TEST_ROOT = "/tmp/uh-test-codex-adapter";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

async function writeCodexManifest(overrides = "") {
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "codex.yaml"),
    `schema_version: uh.adapter.v0
id: codex
name: OpenAI Codex
description: Runtime adapter for OpenAI Codex
runtime: codex
capabilities:
  - cli-execution
status: experimental
config:
  cli_command: codex
  default_toolsets: []
  default_provider: ""
  default_model: ""
  worktree_mode: true
  pass_session_id: false
  runtime_config:
    sandbox_mode: workspace-write
    approval_policy: never
    full_auto_compat: false
${overrides}`,
    "utf-8",
  );
}

async function writeHarnessMission(id = "mission-one") {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: ${id}
name: Codex Artifact Mission
description: Persist Codex runtime artifacts.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
`,
    "utf-8",
  );
  return { missionDir, missionPath };
}

beforeAll(cleanup);
test.beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeCodexManifest();
});
test.afterEach(cleanup);

describe("uh adapter check codex", () => {
  test("returns valid check result when codex is installed", async () => {
    const result = await checkCodex();
    expect(result.runtime).toBe("codex");
    if (result.found) {
      expect(result.version.length).toBeGreaterThan(0);
    } else {
      expect(result.errors.join("\n")).toContain("codex CLI not found in PATH");
    }
  });

  test("validates the selected root adapter manifest", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "codex.yaml"));
    const result = await checkCodex(TEST_ROOT);
    expect(result.found).toBe(false);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });
});

describe("uh mission dry-run --runtime codex", () => {
  test("persists prompt and planned runtime session for harness mission", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("dry-run-codex");

    const result = await dryRunCodex(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    // UH-82: dry-run writes into the per-run dir.
    const runsDir = join(missionDir, "runs");
    const runDirs = await (await import("node:fs/promises")).readdir(runsDir);
    expect(runDirs).toHaveLength(1);
    const runDir = join(runsDir, runDirs[0]);
    expect(await readFile(join(runDir, "prompt.md"), "utf-8")).toBe(result.prompt);
    expect(result.args).toEqual(expect.arrayContaining([
      "exec",
      "--cd",
      TEST_ROOT,
      "--sandbox",
      "workspace-write",
      "--json",
      "--output-last-message",
      join(runDir, "runtime-final.txt"),
      "--skip-git-repo-check",
    ]));
    const sessionPath = join(runDir, "runtime-session.yaml");
    const sessionValidation = await validateFile(sessionPath);
    expect(sessionValidation).toMatchObject({ valid: true, schema_version: "uh.runtime-session.v0" });
    const session = parse(await readFile(sessionPath, "utf-8"));
    expect(session).toMatchObject({
      schema_version: "uh.runtime-session.v0",
      mission_id: "dry-run-codex",
      runtime: "codex",
      status: "planned",
      command: "codex",
    });
    expect(session.args).toEqual(result.args);
  });

  test("surfaces manifest pass_session_id errors in the run plan", async () => {
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "codex.yaml"),
      `schema_version: uh.adapter.v0
id: codex
name: OpenAI Codex
runtime: codex
config:
  cli_command: codex
  worktree_mode: true
  pass_session_id: true
  runtime_config:
    sandbox_mode: workspace-write
    approval_policy: never
`,
      "utf-8",
    );
    const { missionPath } = await writeHarnessMission("bad-session-id");

    const result = await planCodexRun(TEST_ROOT, missionPath);

    expect(result.session_id_passthrough).toBe(false);
    expect(result.errors).toContain("Codex assigns its own thread id; set pass_session_id: false");
  });

  test("merges mission runtime_config_overrides on top of adapter defaults (UH-33)", async () => {
    const { missionPath } = await writeHarnessMission("override-sandbox-mode");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: override-sandbox-mode
name: Override Sandbox Mode
description: Promote sandbox mode via mission override.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  sandbox_mode: read-only
`, "utf-8");

    const result = await planCodexRun(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    const sandboxIdx = result.args.indexOf("--sandbox");
    expect(sandboxIdx).toBeGreaterThanOrEqual(0);
    expect(result.args[sandboxIdx + 1]).toBe("read-only");
  });

  test("rejects typos in mission runtime_config_overrides (UH-33)", async () => {
    const { missionPath } = await writeHarnessMission("typo-codex");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: typo-codex
name: Typo Codex
description: Bad key in override.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  sandbox_modd: read-only
`, "utf-8");

    await expect(planCodexRun(TEST_ROOT, missionPath)).rejects.toThrow(/runtime_config_overrides validation failed.*sandbox_modd/s);
  });
});

describe("codex stream parsing", () => {
  test("tolerates malformed JSONL lines", () => {
    const result = parseCodexJsonlStream('{"type":"a"}\nNOT_JSON\n{"type":"b"}\n');

    expect(result.events).toEqual([{ type: "a" }, { type: "b" }]);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain("line 2");
  });

  test("detects quota and auth failures", () => {
    expect(detectCodexQuotaError("usage limit", "")).toContain("Codex usage quota exhausted");
    expect(detectCodexQuotaError("purchase more credits", "")).toContain("Codex usage quota exhausted");
    expect(detectCodexQuotaError("normal output", "normal error")).toBeNull();
  });
});

describe("uh mission run --runtime codex", () => {
  test("persists success artifacts with codex events and runtime result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("run-success");
    const runId = "test-run-success";
    const runDir = join(missionDir, "runs", runId);
    await (await import("node:fs/promises")).mkdir(runDir, { recursive: true });
    // The --output-last-message arg now points at runDir; codex would have
    // written the raw message there.
    await writeFile(join(runDir, "runtime-final.txt"), "Codex completed the mission.", "utf-8");
    const runner: CodexRunner = async () => ({
      stdout: '{"type":"thread.started","thread_id":"abc"}\n{"type":"turn.completed"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "diff --git a/x b/x\n" });

    const result = await runCodex(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    const events = (await readFile(join(runDir, "events.ndjson"), "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.event)).toEqual([
      "runtime.started",
      "codex.thread.started",
      "codex.turn.completed",
      "runtime.finished",
      "runtime.usage",
    ]);
    // runtime-result.yaml is mirrored from runDir up to missionDir.
    const runtimeResultPath = join(missionDir, "runtime-result.yaml");
    expect(await validateFile(runtimeResultPath)).toMatchObject({ valid: true, schema_version: "uh.runtime-result.v0" });
    const runtimeResult = parse(await readFile(runtimeResultPath, "utf-8"));
    expect(runtimeResult).toMatchObject({
      status: "passed",
      runtime: "codex",
      diff_path: `.harness/missions/run-success/runs/${runId}/diff.patch`,
      stdout_path: `.harness/missions/run-success/runs/${runId}/runtime.stdout.log`,
      stderr_path: `.harness/missions/run-success/runs/${runId}/runtime.stderr.log`,
    });
  });

  test("classifies quota failures as blocked", async () => {
    const { missionPath } = await writeHarnessMission("quota-blocked");
    const runner: CodexRunner = async () => ({
      stdout: "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits.\n",
      stderr: "",
      exitCode: 2,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runCodex(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors.some((error) => /usage|quota/i.test(error))).toBe(true);
  });

  test("blocks when Codex exits zero without a final message", async () => {
    const { missionPath } = await writeHarnessMission("missing-final");
    const runner: CodexRunner = async () => ({
      stdout: '{"type":"turn.completed"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runCodex(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors).toContain("Codex did not write --output-last-message");
  });

  test("prefers UH-28 sentinel block over raw --output-last-message content", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("sentinel-prefer");
    const runId = "test-sentinel-prefer";
    const runDir = join(missionDir, "runs", runId);
    await (await import("node:fs/promises")).mkdir(runDir, { recursive: true });
    // Codex writes its raw last-message to runDir/runtime-final.txt; the
    // file contains preamble plus the sentinel fenced block at the tail.
    await writeFile(join(runDir, "runtime-final.txt"), [
      "Some preamble Codex emitted as its raw final message.",
      "",
      "```uh-runtime-final-message",
      "Bounded sentinel summary.",
      "```",
      "",
    ].join("\n"), "utf-8");
    const runner: CodexRunner = async () => ({
      stdout: '{"type":"turn.completed"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runCodex(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    expect(await readFile(join(runDir, "runtime-final.txt"), "utf-8")).toBe("Bounded sentinel summary.");
  });
});
