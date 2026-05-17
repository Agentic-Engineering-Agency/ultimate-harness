import { test, expect, describe, beforeAll } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import {
  collectHermesSession,
  defaultHermesRunner,
  planHermesRun,
  runHermes,
  type HermesRunner,
  type HermesRunPlan,
  type DiffCollector,
} from "../src/adapters/hermes.js";
import { validateFile } from "../src/harness/validate.js";
import { validateRuntimeResult } from "../src/schema/artifacts.js";

const TEST_ROOT = "/tmp/uh-test-hermes";

async function cleanup() {
  try {
    await rm(TEST_ROOT, { recursive: true, force: true });
  } catch {}
}

async function writeHermesManifest(cliCommand: string): Promise<void> {
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", "hermes.yaml"),
    `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
runtime: hermes
config:
  cli_command: ${cliCommand}
  default_toolsets:
    - terminal
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: true
`,
    "utf-8"
  );
}

async function writeHarnessMission(id: string): Promise<{ missionDir: string; missionPath: string }> {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(
    missionPath,
    `schema_version: uh.mission.v0
id: ${id}
name: Artifact Mission
description: Persist Hermes runtime artifacts.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
`,
    "utf-8"
  );
  return { missionDir, missionPath };
}

// A predictable, injectable runner: returns the canned output without touching
// the filesystem or spawning a child. Tests that need a different shape build
// their own.
function staticRunner(output: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timedOut?: boolean;
  spawnError?: string;
}): HermesRunner {
  return async () => ({
    stdout: output.stdout ?? "",
    stderr: output.stderr ?? "",
    exitCode: output.exitCode ?? 0,
    timedOut: output.timedOut ?? false,
    spawnError: output.spawnError,
  });
}

// Stand-in for the git diff collector that produces a deterministic patch
// so test assertions don't need a real git repo.
const fakeDiffCollector: DiffCollector = async () => ({
  patch: "diff --git a/x b/x\n@@ -0,0 +1 @@\n+canned\n",
});

beforeAll(cleanup);
test.beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
  await writeHermesManifest("hermes");
});
test.afterEach(cleanup);

describe("planHermesRun", () => {
  test("emits the canonical hermes chat invocation for a harness mission", async () => {
    const { missionPath } = await writeHarnessMission("plan-mission");

    const plan: HermesRunPlan = await planHermesRun(TEST_ROOT, missionPath);

    expect(plan.command).toBe("hermes");
    expect(plan.args.slice(0, 2)).toEqual(["chat", "-q"]);
    // mission prompt is positional after -q.
    expect(plan.args[2]).toContain("# Mission: Artifact Mission");
    // toolsets join with `,` (manifest declares only `terminal`).
    const toolsetsIndex = plan.args.indexOf("--toolsets");
    expect(toolsetsIndex).toBeGreaterThan(-1);
    expect(plan.args[toolsetsIndex + 1]).toBe("terminal");
    // attribution and pass-session-id are tied to manifest defaults.
    const sourceIndex = plan.args.indexOf("--source");
    expect(sourceIndex).toBeGreaterThan(-1);
    expect(plan.args[sourceIndex + 1]).toBe("ultimate-harness");
    expect(plan.args).toContain("--pass-session-id");
    expect(plan.args).not.toContain("-w");
    expect(plan.errors).toEqual([]);
    expect(plan.session_id_passthrough).toBe(true);
    expect(plan.worktree).toBe(false);
    expect(plan.mission.id).toBe("plan-mission");
  });

  test("reports missing workflow profile as a recoverable error", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "missing-workflow");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0
id: missing-workflow
name: Missing Workflow
workflow_profile: not-a-real-workflow
`,
      "utf-8"
    );

    const plan = await planHermesRun(TEST_ROOT, missionPath);
    expect(plan.errors).toEqual(["Workflow profile not found: not-a-real-workflow"]);
    expect(plan.command).toBe("hermes");
  });
});

describe("runHermes with injected runner", () => {
  test("captures stdout, stderr, diff, and writes a passed runtime-result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("captures");
    const passedBlock = [
      "intermediate output",
      "",
      "```yaml",
      "schema_version: uh.runtime-result.v0",
      "mission_id: captures",
      "status: completed",
      "```",
      "",
    ].join("\n");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({ stdout: passedBlock, stderr: "boring warnings\n", exitCode: 0 }),
      collectDiff: fakeDiffCollector,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(passedBlock);
    expect(result.stderr).toBe("boring warnings\n");

    expect(await readFile(join(missionDir, "runtime.stdout.log"), "utf-8")).toBe(passedBlock);
    expect(await readFile(join(missionDir, "runtime.stderr.log"), "utf-8")).toBe("boring warnings\n");
    expect(await readFile(join(missionDir, "diff.patch"), "utf-8")).toBe(
      "diff --git a/x b/x\n@@ -0,0 +1 @@\n+canned\n",
    );

    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc).toMatchObject({
      schema_version: "uh.runtime-result.v0",
      mission_id: "captures",
      runtime: "hermes",
      status: "passed",
      exit_code: 0,
      prompt_path: ".harness/missions/captures/prompt.md",
      stdout_path: ".harness/missions/captures/runtime.stdout.log",
      stderr_path: ".harness/missions/captures/runtime.stderr.log",
      diff_path: ".harness/missions/captures/diff.patch",
      errors: [],
    });
    expect(resultDoc.started_at).toBeTypeOf("string");
    expect(resultDoc.finished_at).toBeTypeOf("string");

    // Result file validates against the schema dispatcher.
    expect(await validateFile(join(missionDir, "runtime-result.yaml"))).toMatchObject({
      valid: true,
      schema_version: "uh.runtime-result.v0",
    });
    // result returned by runHermes() matches the persisted document.
    expect(result.result).toMatchObject({ status: "passed", mission_id: "captures" });
  });

  test("non-zero exit yields a failed runtime-result with the exit code preserved", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("nonzero-exit");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({ stdout: "", stderr: "boom\n", exitCode: 42 }),
      collectDiff: fakeDiffCollector,
    });

    expect(result.exitCode).toBe(42);
    expect(result.stderr).toBe("boom\n");

    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc).toMatchObject({
      schema_version: "uh.runtime-result.v0",
      status: "failed",
      exit_code: 42,
    });
    expect(resultDoc.errors).toEqual([]);
    expect(result.result?.status).toBe("failed");
  });

  test("missing binary surfaces an explicit error and writes a failed runtime-result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("spawn-error");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({
        stdout: "",
        stderr: "",
        exitCode: 1,
        spawnError: "spawn hermes ENOENT",
      }),
      collectDiff: fakeDiffCollector,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Spawn error: spawn hermes ENOENT");

    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("failed");
    expect(resultDoc.errors).toEqual(["Spawn error: spawn hermes ENOENT"]);
    // The captured stderr.log carries the same error message so reviewers see it on disk.
    expect(await readFile(join(missionDir, "runtime.stderr.log"), "utf-8")).toContain(
      "Spawn error: spawn hermes ENOENT",
    );
  });

  test("default runner surfaces spawn ENOENT when the configured binary does not exist", async () => {
    // Drives the real defaultHermesRunner code path (no injected stub) so the
    // production spawn path stays exercised and never silently swallows errors.
    const missing = join(TEST_ROOT, "definitely-not-hermes");
    await writeHermesManifest(missing);
    const { missionDir, missionPath } = await writeHarnessMission("real-spawn-error");

    const result = await runHermes(TEST_ROOT, missionPath, { collectDiff: fakeDiffCollector });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Spawn error:");

    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("failed");
    expect(resultDoc.errors[0]).toContain("Spawn error:");
  });

  test("malformed final result block does not produce a passed artifact", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("malformed-block");
    const malformed = [
      "```yaml",
      "schema_version: uh.runtime-result.v0",
      "mission_id: malformed-block",
      "status: definitely-not-an-enum-value",
      "```",
      "",
    ].join("\n");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({ stdout: malformed, stderr: "", exitCode: 0 }),
      collectDiff: fakeDiffCollector,
    });

    expect(result.exitCode).toBe(0);

    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("blocked");
    expect(resultDoc.status).not.toBe("passed");
    expect(resultDoc.errors).toContain(
      "Runtime-result block has invalid status: definitely-not-an-enum-value",
    );
    expect(result.result?.status).toBe("blocked");
  });

  test("missing final result block also does not produce a passed artifact", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("missing-block");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({ stdout: "ran fine, forgot to summarize\n", stderr: "", exitCode: 0 }),
      collectDiff: fakeDiffCollector,
    });

    expect(result.exitCode).toBe(0);
    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("blocked");
    expect(resultDoc.errors).toContain("Hermes did not emit a uh.runtime-result.v0 block on stdout");
  });

  test("timeout surfaces as failed with an explicit error", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("timeout");

    const result = await runHermes(TEST_ROOT, missionPath, {
      runner: staticRunner({ stdout: "", stderr: "", exitCode: 137, timedOut: true }),
      collectDiff: fakeDiffCollector,
      timeoutMs: 1,
    });

    expect(result.exitCode).toBe(137);
    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("failed");
    expect(resultDoc.errors).toContain("Runtime timed out");
  });

  test("default runner honors timeoutMs and never silently swallows the kill", async () => {
    // Real spawn against a node shim that sleeps longer than the timeout.
    const sleepyHermes = join(TEST_ROOT, "sleepy-hermes.mjs");
    await writeFile(
      sleepyHermes,
      `#!/usr/bin/env node
setTimeout(() => process.exit(0), 5000);
`,
      "utf-8"
    );
    // chmod via node so the test stays pure-node.
    const { chmod } = await import("node:fs/promises");
    await chmod(sleepyHermes, 0o755);
    await writeHermesManifest(sleepyHermes);
    const { missionDir, missionPath } = await writeHarnessMission("real-timeout");

    const result = await runHermes(TEST_ROOT, missionPath, {
      collectDiff: fakeDiffCollector,
      timeoutMs: 50,
    });

    expect(result.exitCode).not.toBe(0);
    const resultDoc = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(resultDoc.status).toBe("failed");
    expect(resultDoc.errors).toContain("Runtime timed out");
  }, 10_000);
});

describe("collectHermesSession", () => {
  test("validates the runtime-result it persists", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("collect-direct");
    const plan = await planHermesRun(TEST_ROOT, missionPath);
    const startedAt = "2026-01-01T00:00:00.000Z";
    const finishedAt = "2026-01-01T00:00:01.000Z";

    const out = await collectHermesSession({
      root: TEST_ROOT,
      artifacts: null, // null path: no writes, just status calc + stderr passthrough
      plan,
      startedAt,
      finishedAt,
      runnerResult: { stdout: "", stderr: "x\n", exitCode: 0, timedOut: false },
      diff: { patch: "" },
    });

    expect(out.exitCode).toBe(0);
    expect(out.stderr).toBe("x\n");
    expect(out.result).toBeUndefined(); // null artifacts means no result document is written

    // Now with real artifacts — the doc must validate.
    const fakeArtifacts = {
      missionDir,
      promptPath: join(missionDir, "prompt.md"),
      runtimeSessionPath: join(missionDir, "runtime-session.yaml"),
      eventsPath: join(missionDir, "events.ndjson"),
      stdoutPath: join(missionDir, "runtime.stdout.log"),
      stderrPath: join(missionDir, "runtime.stderr.log"),
      diffPath: join(missionDir, "diff.patch"),
      runtimeResultPath: join(missionDir, "runtime-result.yaml"),
      finalMessagePath: join(missionDir, "runtime-final.txt"),
    };

    const passed = await collectHermesSession({
      root: TEST_ROOT,
      artifacts: fakeArtifacts,
      plan,
      startedAt,
      finishedAt,
      runnerResult: {
        stdout: "```yaml\nschema_version: uh.runtime-result.v0\nstatus: completed\n```\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      },
      diff: { patch: "" },
    });

    expect(passed.result).toBeDefined();
    expect(passed.result?.status).toBe("passed");
    // Re-validate from disk to confirm the persisted yaml round-trips through zod.
    validateRuntimeResult(parse(await readFile(fakeArtifacts.runtimeResultPath, "utf-8")));
  });

  test("writes runtime-final.txt from the UH-28 sentinel block on Hermes stdout", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "hermes-sentinel");
    await mkdir(missionDir, { recursive: true });
    const fakeArtifacts = {
      missionDir,
      promptPath: join(missionDir, "prompt.md"),
      runtimeSessionPath: join(missionDir, "runtime-session.yaml"),
      eventsPath: join(missionDir, "events.ndjson"),
      stdoutPath: join(missionDir, "runtime.stdout.log"),
      stderrPath: join(missionDir, "runtime.stderr.log"),
      diffPath: join(missionDir, "diff.patch"),
      runtimeResultPath: join(missionDir, "runtime-result.yaml"),
      finalMessagePath: join(missionDir, "runtime-final.txt"),
    };
    const plan: HermesRunPlan = {
      command: "hermes",
      args: [],
      prompt: "test",
      worktree: false,
      session_id_passthrough: false,
      errors: [],
      mission: { schema_version: "uh.mission.v0", id: "hermes-sentinel" } as unknown as HermesRunPlan["mission"],
    };

    const out = await collectHermesSession({
      root: TEST_ROOT,
      artifacts: fakeArtifacts,
      plan,
      startedAt: "2026-05-17T00:00:00Z",
      finishedAt: "2026-05-17T00:00:01Z",
      runnerResult: {
        stdout: [
          "Some Hermes reasoning preamble.",
          "",
          "```yaml",
          "schema_version: uh.runtime-result.v0",
          "status: completed",
          "```",
          "",
          "```uh-runtime-final-message",
          "Bounded Hermes summary.",
          "```",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      },
      diff: { patch: "" },
    });

    expect(out.result?.status).toBe("passed");
    expect(await readFile(fakeArtifacts.finalMessagePath, "utf-8")).toBe("Bounded Hermes summary.");
  });

  test("writes empty runtime-final.txt when Hermes stdout has no sentinel block", async () => {
    const missionDir = join(TEST_ROOT, ".harness", "missions", "hermes-no-sentinel");
    await mkdir(missionDir, { recursive: true });
    const fakeArtifacts = {
      missionDir,
      promptPath: join(missionDir, "prompt.md"),
      runtimeSessionPath: join(missionDir, "runtime-session.yaml"),
      eventsPath: join(missionDir, "events.ndjson"),
      stdoutPath: join(missionDir, "runtime.stdout.log"),
      stderrPath: join(missionDir, "runtime.stderr.log"),
      diffPath: join(missionDir, "diff.patch"),
      runtimeResultPath: join(missionDir, "runtime-result.yaml"),
      finalMessagePath: join(missionDir, "runtime-final.txt"),
    };
    const plan: HermesRunPlan = {
      command: "hermes",
      args: [],
      prompt: "test",
      worktree: false,
      session_id_passthrough: false,
      errors: [],
      mission: { schema_version: "uh.mission.v0", id: "hermes-no-sentinel" } as unknown as HermesRunPlan["mission"],
    };

    await collectHermesSession({
      root: TEST_ROOT,
      artifacts: fakeArtifacts,
      plan,
      startedAt: "2026-05-17T00:00:00Z",
      finishedAt: "2026-05-17T00:00:01Z",
      runnerResult: {
        stdout: "```yaml\nschema_version: uh.runtime-result.v0\nstatus: completed\n```\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      },
      diff: { patch: "" },
    });

    expect(await readFile(fakeArtifacts.finalMessagePath, "utf-8")).toBe("");
  });
});

// Smoke-check the default runner exports remain hooks tests can replace.
test("defaultHermesRunner is exported and callable", () => {
  expect(typeof defaultHermesRunner).toBe("function");
});
