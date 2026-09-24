import { test, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify, parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { IndependentReviewBindingSchema } from "../src/schema/independent-review.js";
import {
  DEFAULT_CLAUDE_CODE_MODEL,
  dryRunClaudeCode,
  parseClaudeCodeResult,
  planClaudeCodeRun,
  runClaudeCode,
} from "../src/adapters/claude-code.js";

const MODEL = DEFAULT_CLAUDE_CODE_MODEL;

async function fixture(runtimeOverrides: Record<string, unknown> = {}, missionOverrides: (mission: Record<string, unknown>) => void = () => {}) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-claude-code-"));
  await initializeHarness(root);
  await addAdapter(root, "claude-code");
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  const mission: Record<string, unknown> = {
    schema_version: "uh.mission.v0", id: "one", title: "Synthetic Claude Code check",
    objective: "Preserve outputs", workflow_profile: "research-docs",
    guard: { write_roots: ["out"] },
    runtime_config_overrides: runtimeOverrides,
  };
  missionOverrides(mission);
  await writeFile(missionPath, stringify(mission));
  return { root, missionPath };
}

function flag(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0) throw new Error(`Missing ${name} flag`);
  return args[index + 1];
}

// The guard hook is published into a content-addressed cache from the build
// output. Point both at a temporary fixture so the suite neither needs a real
// build nor writes to the per-user cache.
let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-claude-code-snapshot-"));
  const hook = path.join(snapshotRoot, "dist", "extensions", "tool-guard", "claude-code-hook.js");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, "export default function () {}\n");
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = path.join(snapshotRoot, "dist");
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = path.join(snapshotRoot, "cache");
});

afterEach(async () => {
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(snapshotRoot, { recursive: true, force: true });
});

function successStream(): string {
  return [
    { type: "system", subtype: "init", session_id: "sess-1", model: MODEL },
    { type: "assistant", message: { role: "assistant", model: MODEL, content: [{ type: "text", text: "Working" }] } },
    { type: "result", subtype: "success", is_error: false, duration_ms: 10, num_turns: 2, session_id: "sess-1",
      result: "All done",
      modelUsage: { [MODEL]: { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 10, cacheCreationInputTokens: 4, costUSD: 0.42 } },
      total_cost_usd: 0.42, permission_denials: [] },
  ].map(value => JSON.stringify(value)).join("\n");
}

const noopDiff = async () => ({ patch: "" });
const okRunner = async () => ({ stdout: successStream(), stderr: "", exitCode: 0, timedOut: false });

test("worker plan embeds guard settings, exact model route, and stream flags", async () => {
  const { root, missionPath } = await fixture();
  try {
    const plan = await planClaudeCodeRun(root, missionPath);
    expect(plan.config.model).toBe(MODEL);
    expect(plan.permission_mode).toBe("guard");
    expect(plan.expectedRoute).toEqual({ model: MODEL });
    expect(flag(plan.args, "--model")).toBe(MODEL);
    expect(flag(plan.args, "--output-format")).toBe("stream-json");
    expect(flag(plan.args, "--permission-mode")).toBe("default");
    expect(plan.args).toContain("--verbose");
    expect(plan.guard).toMatchObject({ write_roots: ["out"] });
    expect((plan.guard as Record<string, unknown>).controller_commands).toBeUndefined();
    const settings = JSON.parse(flag(plan.args, "--settings"));
    expect(settings.hooks.PreToolUse[0].matcher).toBe("*");
    expect(settings.permissions).toBeUndefined();
    const hookCommand = settings.hooks.PreToolUse[0].hooks[0].command as string;
    const snapshotHook = hookCommand.match(/"([^"]*tool-guard[\\/]+claude-code-hook\.js)"/i)?.[1]?.replace(/\\\\/g, "\\");
    expect(snapshotHook).toBeDefined();
    expect(snapshotHook!.startsWith(process.env.UH_RUNTIME_SNAPSHOT_CACHE!)).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker runs refuse guard-less missions, non-default permission modes, and reserved flags", async () => {
  const { root, missionPath } = await fixture({ permission_mode: "dontAsk" });
  try {
    await expect(planClaudeCodeRun(root, missionPath)).rejects.toThrow(/permission/);
  } finally { await rm(root, { recursive: true, force: true }); }
  const guardless = await fixture();
  try {
    const mission = parse(await readFile(guardless.missionPath, "utf8")) as Record<string, unknown>;
    delete mission.guard;
    await writeFile(guardless.missionPath, stringify(mission));
    await expect(planClaudeCodeRun(guardless.root, guardless.missionPath)).rejects.toThrow(/guard policy/);
  } finally { await rm(guardless.root, { recursive: true, force: true }); }
  const reserved = await fixture({ cli_args: ["--model", "sneaky"] });
  try {
    await expect(planClaudeCodeRun(reserved.root, reserved.missionPath)).rejects.toThrow(/controlled by UH/);
  } finally { await rm(reserved.root, { recursive: true, force: true }); }
});

test("orchestrator role arms controller commands while keeping worker protections", async () => {
  const { root, missionPath } = await fixture({ role: "orchestrator" }, mission => { delete mission.guard; });
  try {
    const plan = await planClaudeCodeRun(root, missionPath);
    expect(plan.guard).toMatchObject({
      write_roots: ["."], deny_git_mutations: true, deny_package_installs: true, controller_commands: true,
    });
    expect(plan.permission_mode).toBe("guard");
    const settings = JSON.parse(flag(plan.args, "--settings"));
    expect(settings.permissions.allow).toContain("Bash(uh *)");
    let seenEnv: NodeJS.ProcessEnv | undefined;
    await runClaudeCode(root, missionPath, {
      runId: "controller-guard",
      runner: async input => { seenEnv = input.env; return okRunner(); },
      collectDiff: noopDiff,
    });
    const runDir = path.join(path.dirname(missionPath), "runs", "controller-guard");
    const artifact = parse(await readFile(path.join(runDir, "tool-guard.json"), "utf8")) as Record<string, unknown>;
    expect(artifact.controller_commands).toBe(true);
    expect(artifact.deny_git_mutations).toBe(true);
    expect(seenEnv?.UH_TOOL_GUARD_POLICY).toContain("tool-guard.json");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("orchestrator role preserves a mission-provided guard and its write roots", async () => {
  const { root, missionPath } = await fixture({ role: "orchestrator" });
  try {
    const plan = await planClaudeCodeRun(root, missionPath);
    expect(plan.guard).toMatchObject({ write_roots: ["out"], controller_commands: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker run persists controller_commands false and a planned dry-run session", async () => {
  const { root, missionPath } = await fixture();
  try {
    let seenEnv: NodeJS.ProcessEnv | undefined;
    await runClaudeCode(root, missionPath, {
      runId: "worker-guard",
      runner: async input => { seenEnv = input.env; return okRunner(); },
      collectDiff: noopDiff,
    });
    const runDir = path.join(path.dirname(missionPath), "runs", "worker-guard");
    const artifact = parse(await readFile(path.join(runDir, "tool-guard.json"), "utf8")) as Record<string, unknown>;
    expect(artifact.controller_commands).toBe(false);
    expect(seenEnv?.UH_TOOL_GUARD_POLICY).toContain("tool-guard.json");
  } finally { await rm(root, { recursive: true, force: true }); }
  const dry = await fixture();
  try {
    await dryRunClaudeCode(dry.root, dry.missionPath);
    const runsDir = path.join(path.dirname(dry.missionPath), "runs");
    const runIds = await readdir(runsDir);
    expect(runIds).toHaveLength(1);
    const session = parse(await readFile(path.join(runsDir, runIds[0], "runtime-session.yaml"), "utf8")) as Record<string, unknown>;
    expect(session).toMatchObject({ status: "planned", runtime: "claude-code" });
  } finally { await rm(dry.root, { recursive: true, force: true }); }
});

test("native stream result, route attestation, usage, and cost become canonical facts", async () => {
  const { root, missionPath } = await fixture();
  try {
    const result = await runClaudeCode(root, missionPath, {
      runId: "stream-ok", runner: okRunner, collectDiff: noopDiff,
    });
    expect(result.result).toMatchObject({
      status: "passed", model: MODEL,
      usage: { source: "runtime", input_tokens: 100, output_tokens: 20, cache_read_tokens: 10, cache_write_tokens: 4, model: MODEL },
      cost_usd: 0.42, cost_basis: "runtime_estimate",
    });
    expect(result.exitCode).toBe(0);
    const runDir = path.join(path.dirname(missionPath), "runs", "stream-ok");
    const saved = parse(await readFile(path.join(runDir, "runtime-result.yaml"), "utf8"));
    expect(saved).toEqual(result.result);
    expect((await readFile(path.join(runDir, "runtime-final.txt"), "utf8")).trim()).toBe("All done");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("interrupted streams retain known input usage without claiming unfinished output totals", async () => {
  const { root, missionPath } = await fixture();
  try {
    const events = [
      { type: "system", subtype: "init", session_id: "interrupted", model: MODEL },
      { type: "stream_event", event: { type: "message_start", message: {
        id: "first", usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 3 },
      } } },
      { type: "stream_event", event: { type: "message_delta", usage: { output_tokens: 12 } } },
      { type: "stream_event", event: { type: "message_stop" } },
      { type: "stream_event", event: { type: "message_start", message: {
        id: "second", usage: { input_tokens: 4, output_tokens: 1, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 },
      } } },
    ];
    const result = await runClaudeCode(root, missionPath, {
      runId: "interrupted-usage",
      runner: async () => ({ stdout: events.map(event => JSON.stringify(event)).join("\n"), stderr: "", exitCode: 1, timedOut: true }),
      collectDiff: noopDiff,
    });
    expect(result.result.status).toBe("failed");
    expect(result.result.usage).toMatchObject({ source: "runtime", input_tokens: 6, cache_read_tokens: 30, cache_write_tokens: 8 });
    expect(result.result.usage?.output_tokens).toBeUndefined();
    expect(result.result.usage?.total_tokens).toBeUndefined();
    expect(result.result.cost_usd).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a stream routed to a different model fails route attestation", async () => {
  const { root, missionPath } = await fixture({ model: "claude-other-9" });
  try {
    const result = await runClaudeCode(root, missionPath, {
      runId: "wrong-model", runner: okRunner, collectDiff: noopDiff,
    });
    expect(result.result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
    expect(result.result.errors.join("\n")).toMatch(/route outside the configured assignment/);
    expect(result.result.model).toBe(MODEL);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("error subtypes and permission denials fail the run", async () => {
  const { root, missionPath } = await fixture();
  try {
    const stdout = JSON.stringify({
      type: "result", subtype: "error_max_turns", is_error: true, num_turns: 5, result: "stopped",
      permission_denials: [{ tool_name: "Bash", tool_use_id: "t1" }],
    });
    const result = await runClaudeCode(root, missionPath, {
      runId: "denied", runner: async () => ({ stdout, stderr: "", exitCode: 1, timedOut: false }), collectDiff: noopDiff,
    });
    expect(result.result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
    expect(result.result.errors.join("\n")).toMatch(/Runtime reported failure/);
    expect(result.result.errors.join("\n")).toMatch(/Claude Code permission denials: Bash/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a stream without a terminal result is never passed", async () => {
  const { root, missionPath } = await fixture();
  try {
    const stdout = [
      { type: "system", subtype: "init", session_id: "sess-1", model: MODEL },
      { type: "assistant", message: { role: "assistant", model: MODEL, content: [{ type: "text", text: "Halfway" }] } },
    ].map(value => JSON.stringify(value)).join("\n");
    const result = await runClaudeCode(root, missionPath, {
      runId: "no-terminal", runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }), collectDiff: noopDiff,
    });
    expect(result.result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
    expect(result.result.errors).toContain("Claude Code did not emit a terminal result");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("parseClaudeCodeResult accepts flat and nested result shapes", () => {
  const flat = parseClaudeCodeResult({ result: "done", total_cost_usd: 0.1, permission_denials: [{ tool_name: "Bash" }] }, MODEL);
  expect(flat.finalText).toBe("done");
  expect(flat.costUsd).toBe(0.1);
  expect(flat.permissionDenials).toEqual(["Bash"]);
  const nested = parseClaudeCodeResult({
    result: { result: "inner" },
    modelUsage: { [MODEL]: { input_tokens: 5, output_tokens: 2 } },
  }, MODEL);
  expect(nested.finalText).toBe("inner");
  expect(nested.usage).toMatchObject({ source: "runtime", input_tokens: 5, output_tokens: 2, model: MODEL });
});

async function writePriorAttempt(root: string, missionPath: string, runId: string, control: Record<string, unknown> = {}): Promise<string> {
  const runDir = path.join(path.dirname(missionPath), "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: "one", run_id: runId, runtime: "claude-code",
    controller_pid: process.pid, started_at: "2026-01-01T00:00:00.000Z", heartbeat_at: "2026-01-01T00:00:01.000Z",
    status: "failed", stop_code: "timeout", stop_reason: "Runtime wall-time limit reached", session_id: "sess-prev",
    turns: 2, denials: 0, inflight_tools: 0, ...control,
  }));
  await writeFile(path.join(runDir, "runtime-session.yaml"), stringify({
    schema_version: "uh.runtime-session.v0", mission_id: "one", runtime: "claude-code", status: "failed",
    command: "claude", started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:00:01.000Z", exit_code: 1,
  }));
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0", mission_id: "one", runtime: "claude-code", status: "failed",
    started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:00:01.000Z", exit_code: 1,
    prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
    errors: ["Runtime wall-time limit reached"],
  }));
  return runDir;
}

const RESUME_OVERRIDES = { resume_from_run: "20260101T000000Z-prior1", recovery_notes: "Continue after timeout." };

test("resume_from_run attaches to the saved native session and records recovery provenance", async () => {
  const { root, missionPath } = await fixture();
  try {
    await writePriorAttempt(root, missionPath, "20260101T000000Z-prior1");
    const plan = await planClaudeCodeRun(root, missionPath, { extraRuntimeConfigOverrides: RESUME_OVERRIDES });
    expect(plan.resume).toMatchObject({ sourceRunId: "20260101T000000Z-prior1", sessionId: "sess-prev" });
    expect(flag(plan.args, "--resume")).toBe("sess-prev");
    expect(plan.prompt).toContain("Recovery of prior attempt 20260101T000000Z-prior1");
    await runClaudeCode(root, missionPath, {
      runId: "resume-run", extraRuntimeConfigOverrides: RESUME_OVERRIDES, runner: okRunner, collectDiff: noopDiff,
    });
    const record = JSON.parse(await readFile(path.join(path.dirname(missionPath), "runs", "resume-run", "runtime-recovery.json"), "utf8"));
    expect(record).toMatchObject({
      schema_version: "uh.runtime-recovery.v0", source_run_id: "20260101T000000Z-prior1", session_id: "sess-prev",
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("resume_from_run refuses missing and unsettled prior attempts", async () => {
  const { root, missionPath } = await fixture();
  try {
    await expect(planClaudeCodeRun(root, missionPath, { extraRuntimeConfigOverrides: RESUME_OVERRIDES })).rejects.toThrow();
    await writePriorAttempt(root, missionPath, "20260101T000000Z-prior1", { status: "running" });
    await expect(planClaudeCodeRun(root, missionPath, { extraRuntimeConfigOverrides: RESUME_OVERRIDES })).rejects.toThrow(/settled/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("independent review bindings admit the claude-code runtime", () => {
  const binding = IndependentReviewBindingSchema.parse({
    request_path: "request.json", request_sha256: "a".repeat(64), report_path: "report.md",
    runtime: "claude-code", model: MODEL,
  });
  expect(binding.runtime).toBe("claude-code");
});

function runHook(input: unknown, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const hook = fileURLToPath(new URL("../src/extensions/tool-guard/claude-code-hook.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", hook], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test("the PreToolUse hook fails closed without a policy and denies protected writes", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-claude-hook-"));
  try {
    const missing = await runHook(
      { tool_name: "Bash", tool_input: { command: "echo hi" } },
      { ...process.env, UH_TOOL_GUARD_POLICY: "", UH_TOOL_GUARD_LOG: "" },
    );
    expect(JSON.parse(missing.stdout)).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
    });
    const policyPath = path.join(root, "tool-guard.json");
    const logPath = path.join(root, "tool-guard.log");
    await writeFile(policyPath, JSON.stringify({
      schema_version: "uh.tool-guard.v0", write_roots: ["."], deny_git_mutations: true,
      deny_package_installs: true, deny_network_clients: true, agent_clients: ["omp", "cmdc"],
      worker_root: root, protected_paths: [".harness", ".git"], controller_commands: false,
    }));
    const hookEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };
    const denied = await runHook(
      { tool_name: "Write", tool_input: { file_path: path.join(root, ".harness", "steal.md") } },
      hookEnv,
    );
    expect(JSON.parse(denied.stdout)).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
    });
    const allowed = await runHook(
      { tool_name: "Write", tool_input: { file_path: path.join(root, "out", "notes.md") } },
      hookEnv,
    );
    expect(allowed.stdout).toBe("");
    expect(allowed.code).toBe(0);
    const log = (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    expect(log.map(entry => entry.class)).toEqual(["protected_root", "allow"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
