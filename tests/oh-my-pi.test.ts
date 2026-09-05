import { test, expect, describe, beforeAll } from "vitest";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path, { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { validateFile } from "../src/harness/validate.js";
import {
  checkOhMyPi,
  defaultOhMyPiRunner,
  detectOhMyPiQuotaError,
  dryRunOhMyPi,
  parseOhMyPiOutput,
  planOhMyPiRun,
  runOhMyPi,
  type DiffCollector,
  type OhMyPiRunner,
} from "../src/adapters/oh-my-pi.js";

const TEST_ROOT = "/tmp/uh-test-oh-my-pi-adapter";

async function cleanup() {
  try { await rm(TEST_ROOT, { recursive: true, force: true }); } catch {}
}

async function writeOhMyPiManifest(overrides = "", mode = "json") {
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
    mode: ${mode}
    thinking: ""
    allow_extensions: false
    allow_skills: false
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
name: OhMyPi Artifact Mission
description: Persist oh-my-pi runtime artifacts.
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
  await writeOhMyPiManifest();
});
test.afterEach(cleanup);

describe("uh adapter check oh-my-pi", () => {
  test("returns valid check result when omp is installed", async () => {
    const result = await checkOhMyPi();
    expect(result.runtime).toBe("oh-my-pi");
    if (result.found) {
      expect(result.version.length).toBeGreaterThan(0);
    } else {
      expect(result.errors.join("\n")).toContain("omp CLI not found in PATH");
    }
  });

  test("validates the selected root adapter manifest", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters", "oh-my-pi.yaml"));
    const result = await checkOhMyPi(TEST_ROOT);
    expect(result.found).toBe(false);
    expect(result.errors[0]).toContain("Adapter manifest not found");
  });
});

describe("uh mission dry-run --runtime oh-my-pi", () => {
  test("persists prompt and planned runtime session for harness mission", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("dry-run-oh-my-pi");

    const result = await dryRunOhMyPi(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    const runsDir = join(missionDir, "runs");
    const runDirs = await (await import("node:fs/promises")).readdir(runsDir);
    expect(runDirs).toHaveLength(1);
    const runDir = join(runsDir, runDirs[0]);
    expect(await readFile(join(runDir, "prompt.md"), "utf-8")).toBe(result.prompt);
    expect(result.command).toBe("omp");
    expect(result.args).toEqual([
      "--print",
      "--mode",
      "json",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-title",
      result.prompt,
    ]);
    const sessionPath = join(runDir, "runtime-session.yaml");
    const sessionValidation = await validateFile(sessionPath);
    expect(sessionValidation).toMatchObject({ valid: true, schema_version: "uh.runtime-session.v0" });
    const session = parse(await readFile(sessionPath, "utf-8"));
    expect(session).toMatchObject({
      schema_version: "uh.runtime-session.v0",
      mission_id: "dry-run-oh-my-pi",
      runtime: "oh-my-pi",
      status: "planned",
      command: "omp",
    });
    expect(session.args).toEqual(result.args);
  });

  test("surfaces rpc-ui mode errors in the run plan", async () => {
    await writeOhMyPiManifest("", "rpc-ui");
    const { missionPath } = await writeHarnessMission("bad-rpc-ui");

    const result = await planOhMyPiRun(TEST_ROOT, missionPath);

    expect(result.errors).toContain("oh-my-pi mode rpc-ui expects a TUI parent; use mode: json, text, or rpc for headless runs");
  });

  test("merges mission runtime_config_overrides on top of adapter defaults", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("override-model");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: override-model
name: Override Model
description: Use Anthropic via OMP for this mission.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  model: anthropic/claude-opus-4-7
  thinking: high
`, "utf-8");

    const result = await planOhMyPiRun(TEST_ROOT, missionPath);

    expect(result.errors).toEqual([]);
    expect(result.args).toEqual([
      "--print",
      "--model",
      "anthropic/claude-opus-4-7",
      "--thinking",
      "high",
      "--mode",
      "json",
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-title",
      result.prompt,
    ]);
    expect(missionDir).toContain("override-model");
  });

  test("rejects typos in mission runtime_config_overrides via strict schema", async () => {
    const { missionPath } = await writeHarnessMission("typo-override");
    await writeFile(missionPath, `schema_version: uh.mission.v0
id: typo-override
name: Typo Override
description: Mistyped override key.
workflow_profile: research-docs
issues: []
read_first: []
expected_artifacts: []
verification:
  checks: []
runtime_config_overrides:
  modell: anthropic/claude-opus-4-7
`, "utf-8");

    await expect(planOhMyPiRun(TEST_ROOT, missionPath)).rejects.toThrow(/runtime_config_overrides validation failed.*modell/s);
  });

  test("prefers UH-28 sentinel block over heuristic finalMessage", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("sentinel-omp");
    const stdout = [
      '{"type":"message","role":"assistant","content":"first reasoning chunk"}',
      '{"type":"message","role":"assistant","content":"```uh-runtime-final-message\\nBounded oh-my-pi summary.\\n```"}',
      '',
    ].join("\n");
    const runner: OhMyPiRunner = async () => ({
      stdout,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const runId = "test-sentinel-omp";
    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    expect(await readFile(join(missionDir, "runs", runId, "runtime-final.txt"), "utf-8")).toBe("Bounded oh-my-pi summary.");
  });
});

describe("oh-my-pi output parsing", () => {
  test("handles NDJSON and extracts final message from the last assistant-like event", () => {
    const result = parseOhMyPiOutput('{"type":"message","role":"assistant","content":"first"}\n{"type":"result","text":"last"}\n');

    expect(result.events).toEqual([
      { type: "message", role: "assistant", content: "first" },
      { type: "result", text: "last" },
    ]);
    expect(result.parseErrors).toEqual([]);
    expect(result.finalMessage).toBe("last");
  });

  test("handles single-dump JSON and extracts the final assistant message", () => {
    const result = parseOhMyPiOutput(JSON.stringify({
      messages: [
        { role: "assistant", content: "first" },
        { role: "user", content: "ignore" },
        { role: "assistant", content: "final" },
      ],
    }));

    expect(result.events).toEqual([{ messages: [
      { role: "assistant", content: "first" },
      { role: "user", content: "ignore" },
      { role: "assistant", content: "final" },
    ] }]);
    expect(result.parseErrors).toEqual([]);
    expect(result.finalMessage).toBe("final");
  });

  test("tolerates malformed JSON lines without persisting snippets", () => {
    const result = parseOhMyPiOutput('{"type":"message","role":"assistant","content":"ok"}\n{"secret":"PRIVATE_PAYLOAD"} trailing\n{"type":"result","text":"done"}\n');
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toBe("OhMyPi JSON parse error on line 2");
    expect(result.parseErrors[0]).not.toContain("PRIVATE_PAYLOAD");
    expect(result.finalMessage).toBe("done");
  });
  test("extracts typed content arrays from nested native message events", () => {
    const result = parseOhMyPiOutput(JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "native final" }],
      },
    }));
    expect(result.finalMessage).toBe("native final");
  });

  test("does not classify response ids or assistant text as auth failures", () => {
    const stdout = [
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: "response 401 and 403 are ordinary ids" }, responseId: "resp_401" }),
      JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", content: "done" }] }),
    ].join("\n");
    expect(detectOhMyPiQuotaError(stdout, "")).toBeNull();
  });

  test("detects quota and auth failures", () => {
    expect(detectOhMyPiQuotaError("", "401 Unauthorized")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("rate limit exceeded", "")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("", "API key missing")).toContain("oh-my-pi auth or quota error");
    expect(detectOhMyPiQuotaError("all good", "")).toBeNull();
  });
  test("classifies structured native message diagnostics without nested payloads", () => {
    expect(detectOhMyPiQuotaError(JSON.stringify({
      type: "message_end",
      message: { role: "assistant", errorMessage: "authentication required" },
    }), "")).toContain("auth or quota");
    expect(detectOhMyPiQuotaError(JSON.stringify({
      type: "message_end",
      message: { role: "assistant", status: 401, responseId: "resp_401" },
    }), "")).toContain("auth or quota");
    expect(detectOhMyPiQuotaError(JSON.stringify({
      type: "message_end",
      message: { role: "assistant", error: { responseId: "resp_401" } },
    }), "")).toBeNull();
  });
  test("streams UTF-8 child output before close and reports callback rejection", async () => {
    const script = [
      "const first = JSON.stringify({type:'tool_execution_start',cwd:process.cwd()});",
      "process.stdout.write(first + '\\n');",
      "setTimeout(() => {",
      "  const final = Buffer.from(JSON.stringify({type:'message',role:'assistant',content:[{type:'text',text:'é'}]}));",
      "  process.stdout.write(final.subarray(0, final.length - 1));",
      "  setImmediate(() => process.stdout.write(final.subarray(final.length - 1)));",
      "}, 20);",
    ].join("");
    let sawProgressBeforeClose = false;
    const result = await defaultOhMyPiRunner({
      command: process.execPath,
      args: ["-e", script],
      cwd: TEST_ROOT,
      onStdoutChunk: async (chunk) => {
        if (chunk.includes("tool_execution_start")) sawProgressBeforeClose = true;
      },
    });
    expect(result.spawnError).toBeUndefined();
    expect(result.stdout).toContain("é");
    expect(sawProgressBeforeClose).toBe(true);

    const rejected = await defaultOhMyPiRunner({
      command: process.execPath,
      args: ["-e", "process.stdout.write('{}')"],
      cwd: TEST_ROOT,
      onStdoutChunk: () => Promise.reject(new Error("callback boom")),
    });
    expect(rejected.spawnError).toContain("Stream callback failed: callback boom");
  });
  test("cancellation signal terminates the owned runtime process tree", async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000000)'], { stdio: 'ignore' });",
      "process.stdout.write(String(child.pid) + '\\n');",
      "setInterval(() => {}, 1000000);",
    ].join("");
    const controller = new AbortController();
    let resolveChildPid!: (pid: number) => void;
    const childReady = new Promise<number>((resolve) => {
      resolveChildPid = resolve;
    });
    const resultPromise = defaultOhMyPiRunner({
      command: process.execPath,
      args: ["-e", script],
      cwd: TEST_ROOT,
      cancellationSignal: controller.signal,
      onStdoutChunk: (chunk) => {
        const pid = Number.parseInt(chunk.trim(), 10);
        if (Number.isInteger(pid) && pid > 0) resolveChildPid(pid);
      },
    });
    const childPid = await childReady;
    controller.abort();
    const result = await resultPromise;

    expect(result.exitCode).not.toBe(0);
    expect(() => process.kill(childPid, 0)).toThrow();
  });
});

describe("uh mission run --runtime oh-my-pi", () => {
  test("persists success artifacts with oh-my-pi events and runtime result", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("run-success");
    const runner: OhMyPiRunner = async () => ({
      stdout: '{"type":"message","role":"assistant","content":"oh-my-pi completed the mission.","provider":"openai-codex","model":"gpt-5.6-luna","usage":{"input":11,"output":7,"totalTokens":18}}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "diff --git a/x b/x\n" });

    const runId = "test-omp-run-success";
    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("passed");
    const runDir = join(missionDir, "runs", runId);
    expect(await readFile(join(runDir, "runtime-final.txt"), "utf-8")).toBe("oh-my-pi completed the mission.");
    const events = (await readFile(join(runDir, "events.ndjson"), "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => event.event)).toEqual([
      "runtime.started",
      "oh-my-pi.message",
      "runtime.finished",
    ]);
    const runtimeResultPath = join(missionDir, "runtime-result.yaml");
    expect(await validateFile(runtimeResultPath)).toMatchObject({ valid: true, schema_version: "uh.runtime-result.v0" });
    const runtimeResult = parse(await readFile(runtimeResultPath, "utf-8"));
    expect(runtimeResult).toMatchObject({
      status: "passed",
      runtime: "oh-my-pi",
      diff_path: `.harness/missions/run-success/runs/${runId}/diff.patch`.replaceAll("/", path.sep),
      stdout_path: `.harness/missions/run-success/runs/${runId}/runtime.stdout.log`.replaceAll("/", path.sep),
      stderr_path: `.harness/missions/run-success/runs/${runId}/runtime.stderr.log`.replaceAll("/", path.sep),
    });
    expect(runtimeResult).toMatchObject({
      provider: "openai-codex",
      model: "gpt-5.6-luna",
    });
  });
  test("aggregates assistant message_end usage once across turns", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("multi-turn-usage");
    const events = [
      { type: "message_update", assistantMessageEvent: { usage: { input: 999, output: 999 } } },
      { type: "message_end", message: { role: "assistant", provider: "openai-codex", model: "gpt-5.6-luna", usage: { input: 10, output: 2, cacheRead: 4, totalTokens: 16, cost: { total: 0.1 } } } },
      { type: "agent_end", messages: [{ role: "assistant", usage: { input: 10, output: 2, cacheRead: 4, totalTokens: 16 } }] },
      { type: "message_end", message: { role: "assistant", content: "done", usage: { input: 20, output: 3, cacheRead: 6, totalTokens: 29, cost: { total: 0.2 } } } },
    ];
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner: async () => ({ stdout: events.map((event) => JSON.stringify(event)).join("\n"), stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("passed");
    const persisted = parse(await readFile(join(missionDir, "runtime-result.yaml"), "utf-8"));
    expect(persisted.usage).toMatchObject({
      input_tokens: 30,
      output_tokens: 5,
      total_tokens: 45,
      cache_read_tokens: 10,
      source: "runtime",
    });
    expect(persisted.cost_usd).toBeCloseTo(0.3);
  });
  test("normalizes generic native error envelopes after assistant text", async () => {
    const { missionPath } = await writeHarnessMission("native-generic-error");
    const stdout = [
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: "earlier success" } }),
      JSON.stringify({ type: "error", error: { status: 500, message: "private internal payload" } }),
    ].join("\n");
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.result?.status).toBe("failed");
    expect(result.result?.errors).toContain("oh-my-pi runtime reported terminal failure");
    expect(result.result?.errors.join("\n")).not.toContain("private internal payload");
  });
  test("counts distinct explicit native usage identities with identical bodies once each", async () => {
    const { missionPath } = await writeHarnessMission("usage-identities");
    const usage = { input: 4, output: 2, totalTokens: 6, cost: { total: 0.05 } };
    const stdout = [
      JSON.stringify({ type: "message_end", id: "event-a", message: { role: "assistant", content: "turn", usage } }),
      JSON.stringify({ type: "message_end", id: "event-b", message: { role: "assistant", content: "turn", usage } }),
      JSON.stringify({ type: "message_end", id: "event-b", message: { role: "assistant", content: "turn", usage } }),
    ].join("\n");
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("passed");
    const persisted = parse(await readFile(join(TEST_ROOT, ".harness", "missions", "usage-identities", "runtime-result.yaml"), "utf-8"));
    expect(persisted.usage).toMatchObject({
      input_tokens: 8,
      output_tokens: 4,
      total_tokens: 12,
      source: "runtime",
    });
    expect(persisted.cost_usd).toBeCloseTo(0.1);
  });



  test("native terminal error overrides an earlier assistant success", async () => {
    const { missionPath } = await writeHarnessMission("native-terminal-error");
    const stdout = [
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: "earlier success" } }),
      JSON.stringify({ type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "private provider payload" } }),
    ].join("\n");
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result?.status).toBe("failed");
    expect(result.result?.errors).toContain("oh-my-pi runtime reported terminal failure: error");
    expect(result.result?.errors.join("\n")).not.toContain("private provider payload");
  });

  test("classifies quota failures as blocked", async () => {
    const { missionPath } = await writeHarnessMission("quota-blocked");
    const runner: OhMyPiRunner = async () => ({
      stdout: "",
      stderr: "API key not configured",
      exitCode: 2,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff });

    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors.some((error) => /api key/i.test(error))).toBe(true);
  });

  test("native terminal error in agent_end messages overrides earlier assistant success", async () => {
    const { missionPath } = await writeHarnessMission("native-terminal-aborted");
    const stdout = [
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: "earlier success" } }),
      JSON.stringify({ type: "agent_end", messages: [{ role: "assistant", stopReason: "aborted", errorMessage: "private provider payload" }] }),
    ].join("\n");
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.result?.status).toBe("failed");
    expect(result.result?.errors).toContain("oh-my-pi runtime reported terminal failure: aborted");
    expect(result.result?.errors.join("\n")).not.toContain("private provider payload");
  });
  test("persists stream events before the runner returns", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("live-events");
    const runId = "test-omp-live-events";
    const toolStart = JSON.stringify({ type: "tool_execution_start", toolName: "read" });
    const toolEnd = JSON.stringify({ type: "tool_execution_end", toolName: "read" });
    const final = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "live final" }],
        provider: "openai-codex",
        model: "gpt-5.6-luna",
        usage: { input: 3, output: 2, totalTokens: 5 },
      },
    });
    const runner: OhMyPiRunner = async (input) => {
      await input.onStdoutChunk?.(`${toolStart}\n`);
      const liveEvents = await readFile(join(missionDir, "runs", runId, "events.ndjson"), "utf-8");
      expect(liveEvents).toContain('"event":"oh-my-pi.tool_execution_start"');
      await input.onStdoutChunk?.(`${toolEnd}\n${final}\n`);
      return { stdout: `${toolStart}\n${toolEnd}\n${final}\n`, stderr: "", exitCode: 0, timedOut: false };
    };
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runner,
      collectDiff: async () => ({ patch: "" }),
      runId,
    });
    expect(result.result?.status).toBe("passed");
    const events = (await readFile(join(missionDir, "runs", runId, "events.ndjson"), "utf-8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((event) => event.event)).toContain("oh-my-pi.tool_execution_end");
  });
  test("writes canonical host artifacts while a real child stays in sandbox cwd", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("canonical-live");
    const sandboxRoot = join(TEST_ROOT, "sandbox-worktree");
    await cp(join(TEST_ROOT, ".harness"), join(sandboxRoot, ".harness"), { recursive: true });
    const sandboxMissionPath = join(sandboxRoot, ".harness", "missions", "canonical-live", "mission.yaml");
    const runId = "test-omp-canonical-live";
    const script = [
      "process.stdout.write(JSON.stringify({type:'tool_execution_start',cwd:process.cwd()})+'\\n');",
      "setTimeout(() => process.stdout.write(JSON.stringify({type:'message',role:'assistant',content:'canonical done'})), 20);",
    ].join("");
    let sawCanonicalProgress = false;
    const runner: OhMyPiRunner = async (input) => defaultOhMyPiRunner({
      ...input,
      command: process.execPath,
      args: ["-e", script],
      onStdoutChunk: async (chunk) => {
        await input.onStdoutChunk?.(chunk);
        if (chunk.includes("tool_execution_start")) {
          const startLine = chunk.split(/\r?\n/).find((line) => line.includes("tool_execution_start"));
          expect(startLine).toBeDefined();
          const events = await readFile(join(missionDir, "runs", runId, "events.ndjson"), "utf-8");
          sawCanonicalProgress = events.includes('"event":"oh-my-pi.tool_execution_start"');
          expect(JSON.parse(startLine!).cwd).toBe(path.resolve(sandboxRoot));
        }
      },
    });
    const result = await runOhMyPi(sandboxRoot, sandboxMissionPath, {
      runner,
      artifactRoot: TEST_ROOT,
      collectDiff: async (cwd) => {
        expect(cwd).toBe(sandboxRoot);
        return { patch: "" };
      },
      runId,
    });
    expect(result.result?.status).toBe("passed");
    expect(sawCanonicalProgress).toBe(true);
    expect(await readFile(join(missionDir, "runs", runId, "runtime-result.yaml"), "utf-8")).toContain("status: passed");
    expect(await readFile(join(TEST_ROOT, ".harness", "missions", "canonical-live", "latest.json"), "utf-8")).toContain(runId);
  });

  test("terminalizes the canonical run when a live event append fails", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("stream-write-failure");
    const runId = "test-omp-stream-write-failure";
    const eventPath = join(missionDir, "runs", runId, "events.ndjson");
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runId,
      collectDiff: async () => ({ patch: "" }),
      runner: async (input) => {
        await rm(eventPath, { force: true });
        await mkdir(eventPath);
        const stdout = `${JSON.stringify({ type: "tool_execution_start", toolName: "synthetic" })}\n`;
        await input.onStdoutChunk?.(stdout);
        return { stdout, stderr: "", exitCode: 0, timedOut: false };
      },
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.result?.status).toBe("failed");
    const latest = JSON.parse(await readFile(join(missionDir, "latest.json"), "utf8"));
    const index = JSON.parse(await readFile(join(missionDir, "runs", "index.json"), "utf8"));
    expect(latest).toMatchObject({ run_id: runId, status: "failed" });
    expect(index.runs.find((run: { run_id: string }) => run.run_id === runId)?.status).toBe("failed");
    expect(parse(await readFile(join(missionDir, "runs", runId, "runtime-result.yaml"), "utf8")).status).toBe("failed");
  });
  test("finalizes a failed run when initial runtime.started persistence fails", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("initial-write-failure");
    const runId = "test-omp-initial-write-failure";
    const eventPath = join(missionDir, "runs", runId, "events.ndjson");
    await mkdir(join(missionDir, "runs", runId), { recursive: true });
    await mkdir(eventPath);
    let childStarted = false;
    const result = await runOhMyPi(TEST_ROOT, missionPath, {
      runId,
      runner: async () => {
        childStarted = true;
        return { stdout: "", stderr: "", exitCode: 0, timedOut: false };
      },
      collectDiff: async () => ({ patch: "" }),
    });
    expect(childStarted).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.result?.status).toBe("failed");
    expect(JSON.parse(await readFile(join(missionDir, "latest.json"), "utf8"))).toMatchObject({
      run_id: runId,
      status: "failed",
    });
    expect(JSON.parse(await readFile(join(missionDir, "runs", "index.json"), "utf8")).runs
      .find((run: { run_id: string }) => run.run_id === runId)?.status).toBe("failed");
    expect(parse(await readFile(join(missionDir, "runs", runId, "runtime-result.yaml"), "utf8")).status).toBe("failed");
    expect(parse(await readFile(join(missionDir, "runs", runId, "runtime-session.yaml"), "utf8")).status).toBe("failed");
  });


  test("blocks when oh-my-pi exits zero without a final assistant message", async () => {
    const { missionDir, missionPath } = await writeHarnessMission("missing-final");
    const runner: OhMyPiRunner = async () => ({
      stdout: '{"type":"metadata","text":"not final"}\n',
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const collectDiff: DiffCollector = async () => ({ patch: "" });

    const runId = "test-omp-missing-final";
    const result = await runOhMyPi(TEST_ROOT, missionPath, { runner, collectDiff, runId });

    expect(result.exitCode).toBe(0);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors).toContain("oh-my-pi did not emit a final assistant message");
    expect(await readFile(join(missionDir, "runs", runId, "runtime-final.txt"), "utf-8")).toBe("");
  });
});
