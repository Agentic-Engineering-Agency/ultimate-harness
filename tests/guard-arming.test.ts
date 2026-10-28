import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode } from "../src/adapters/command-code.js";
import { runClaudeCode } from "../src/adapters/claude-code.js";
import { runOhMyPi, type OhMyPiRunnerInput } from "../src/adapters/oh-my-pi.js";
import { RuntimeSupervision } from "../src/harness/runtime-supervision.js";
import { armGuard, GUARD_ARM_LOG_NAME, type GuardArmingInput, type GuardArmingResult } from "../src/harness/guard-arming.js";
import { runToolGuard } from "../src/extensions/tool-guard/core.js";
import registerOhMyPiGuard from "../src/extensions/tool-guard/omp.js";
import { writeGuardHookFixture } from "./guard-hook-fixtures.js";

type Runtime = "command-code" | "claude-code" | "oh-my-pi";
const RUNTIMES: Runtime[] = ["command-code", "claude-code", "oh-my-pi"];

function hookSource(name: string): string {
  return fileURLToPath(new URL(`../src/extensions/tool-guard/${name}`, import.meta.url));
}

/** A real policy artifact a run would write. */
async function writePolicy(directory: string, overrides: Record<string, unknown> = {}): Promise<{ policyPath: string; workerRoot: string }> {
  const workerRoot = path.join(directory, "worker");
  await mkdir(workerRoot, { recursive: true });
  const policyPath = path.join(directory, "tool-guard.json");
  await writeFile(policyPath, JSON.stringify({
    schema_version: "uh.tool-guard.v0",
    write_roots: ["out"],
    deny_git_mutations: true,
    deny_package_installs: true,
    deny_network_clients: true,
    agent_clients: ["omp", "cmdc"],
    allow_native_subagents: false,
    worker_root: workerRoot,
    protected_paths: [".harness", ".git"],
    controller_commands: false,
    ...overrides,
  }));
  return { policyPath, workerRoot };
}

function parseLog(raw: string): Array<Record<string, unknown>> {
  return raw.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>);
}

function armingInput(runtime: Runtime, policyPath: string, logPath: string): GuardArmingInput {
  if (runtime === "oh-my-pi") {
    return { runtime, policyPath, logPath, hookModulePath: hookSource("omp.ts"), loadHookModule: async () => await import("../src/extensions/tool-guard/omp.js") };
  }
  const hook = runtime === "command-code" ? "cmdc-hook.ts" : "claude-code-hook.ts";
  return { runtime, policyPath, logPath, hookCommand: [process.execPath, "--import=tsx", hookSource(hook)] };
}

describe("tool guard core", () => {
  test("logs allowed and denied calls with their call ids", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uh-core-log-"));
    try {
      const { policyPath, workerRoot } = await writePolicy(directory);
      const logPath = path.join(directory, "tool-guard.log");

      const allowed = await runToolGuard({
        policyPath, logPath,
        call: { tool: "read_file", input: { file_path: path.join(workerRoot, "out", "allowed.txt") }, callId: "call-read" },
      });
      expect(allowed.decision).toBe("allow");

      const denied = await runToolGuard({
        policyPath, logPath,
        call: { tool: "write_file", input: { file_path: path.join(workerRoot, "outside", "blocked.txt") }, callId: "call-write" },
      });
      expect(denied.decision).toBe("deny");
      expect(denied.reason).toContain("CONTRACT: write only under out");

      const entries = parseLog(await readFile(logPath, "utf8"));
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ call_id: "call-read", tool: "read_file", class: "allow" });
      expect(entries[1]).toMatchObject({ call_id: "call-write", tool: "write_file", class: "write_outside" });
      expect(typeof entries[1].target).toBe("string");
      expect(typeof entries[1].ts).toBe("string");
      expect(typeof entries[1].reason).toBe("string");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("denies a missing configuration, an unreadable policy and an invalid call", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uh-core-deny-"));
    try {
      const { policyPath, workerRoot } = await writePolicy(directory);
      const logPath = path.join(directory, "tool-guard.log");
      const read = { tool: "read_file", input: { file_path: path.join(workerRoot, "out", "a.txt") }, callId: "call" };

      const missing = await runToolGuard({ policyPath: undefined, logPath, call: read });
      expect(missing.decision).toBe("deny");
      expect(missing.class).toBe("guard_unavailable");

      const corrupted = path.join(directory, "corrupted.json");
      await writeFile(corrupted, "{ not json");
      const unreadable = await runToolGuard({ policyPath: corrupted, logPath, call: read });
      expect(unreadable.decision).toBe("deny");
      expect(unreadable.reason).toContain("could not be loaded");

      const invalid = await runToolGuard({ policyPath, logPath, call: { tool: "", input: {}, callId: "call" } });
      expect(invalid.decision).toBe("deny");
      expect(invalid.reason).toContain("invalid tool call");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("denies when the audit log cannot be written", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uh-core-logfail-"));
    try {
      const { policyPath, workerRoot } = await writePolicy(directory);
      const logDirectory = path.join(directory, "log-directory");
      await mkdir(logDirectory);
      const verdict = await runToolGuard({
        policyPath, logPath: logDirectory,
        call: { tool: "read_file", input: { file_path: path.join(workerRoot, "out", "a.txt") }, callId: "call" },
      });
      expect(verdict.decision).toBe("deny");
      expect(verdict.reason).toContain("audit log could not be written");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function runHookWithStdin(hookFile: string, stdin: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const hook = hookSource(hookFile);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", hook], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

function decisionFromStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "allow";
  const parsed = JSON.parse(trimmed) as { hookSpecificOutput?: { permissionDecision?: string } };
  return parsed.hookSpecificOutput?.permissionDecision ?? "allow";
}

function hookDecision(hookFile: string, input: unknown, env: NodeJS.ProcessEnv): Promise<string> {
  return runHookWithStdin(hookFile, JSON.stringify(input), env).then(result => decisionFromStdout(result.stdout));
}

type ToolCallEvent = { toolName?: string; input?: unknown; toolCallId?: string };
type ToolCallHandler = (event: ToolCallEvent) => unknown;

function ompHandler(): ToolCallHandler {
  const handlers: ToolCallHandler[] = [];
  registerOhMyPiGuard({ on: (_event, callback) => { handlers.push(callback); } });
  const handler = handlers[0];
  if (!handler) throw new Error("the oh-my-pi extension did not register a tool_call handler");
  return handler;
}

describe("runtime wrappers fail closed", () => {
  for (const hook of ["cmdc-hook.ts", "claude-code-hook.ts"]) {
    test(`${hook} denies on invalid input, missing configuration, unreadable policy and an unwritable log`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "uh-wrapper-"));
      try {
        const call = { tool_name: "read_file", tool_input: { file_path: "x" } };

        const invalid = await runHookWithStdin(hook, "{ not json", { ...process.env });
        expect(decisionFromStdout(invalid.stdout)).toBe("deny");

        expect(await hookDecision(hook, call, { ...process.env, UH_TOOL_GUARD_POLICY: "", UH_TOOL_GUARD_LOG: "" })).toBe("deny");

        const corrupted = path.join(directory, "corrupted.json");
        await writeFile(corrupted, "{ not json");
        expect(await hookDecision(hook, call, { ...process.env, UH_TOOL_GUARD_POLICY: corrupted, UH_TOOL_GUARD_LOG: path.join(directory, "log.ndjson") })).toBe("deny");

        const { policyPath } = await writePolicy(directory);
        const logDirectory = path.join(directory, "log-directory");
        await mkdir(logDirectory);
        expect(await hookDecision(hook, call, { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logDirectory })).toBe("deny");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }

  test("omp.ts denies on invalid input, missing configuration, unreadable policy and an injected exception", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uh-omp-wrapper-"));
    const previousPolicy = process.env.UH_TOOL_GUARD_POLICY;
    const previousLog = process.env.UH_TOOL_GUARD_LOG;
    try {
      const { policyPath, workerRoot } = await writePolicy(directory);
      const handler = ompHandler();

      // Invalid input: an empty tool name.
      expect((await handler({ toolName: "", input: {} }) as { block?: boolean })?.block).toBe(true);

      // Missing configuration.
      delete process.env.UH_TOOL_GUARD_POLICY;
      delete process.env.UH_TOOL_GUARD_LOG;
      expect((await handler({ toolName: "read_file", input: {} }) as { block?: boolean })?.block).toBe(true);

      // Unreadable policy.
      const corrupted = path.join(directory, "corrupted.json");
      await writeFile(corrupted, "{ not json");
      process.env.UH_TOOL_GUARD_POLICY = corrupted;
      process.env.UH_TOOL_GUARD_LOG = path.join(directory, "log.ndjson");
      expect((await handler({ toolName: "read_file", input: {} }) as { block?: boolean })?.block).toBe(true);

      // Healthy: a read inside the root is allowed.
      process.env.UH_TOOL_GUARD_POLICY = policyPath;
      expect(await handler({ toolName: "read_file", input: { file_path: path.join(workerRoot, "out", "a.txt") } })).toBeUndefined();

      // An injected exception in the handler denies rather than allowing.
      const throwing = { toolName: "read_file", get input(): unknown { throw new Error("injected"); } };
      expect((await handler(throwing as ToolCallEvent) as { block?: boolean })?.block).toBe(true);
    } finally {
      if (previousPolicy === undefined) delete process.env.UH_TOOL_GUARD_POLICY; else process.env.UH_TOOL_GUARD_POLICY = previousPolicy;
      if (previousLog === undefined) delete process.env.UH_TOOL_GUARD_LOG; else process.env.UH_TOOL_GUARD_LOG = previousLog;
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("guard arming", () => {
  test("passes on a healthy setup for every runtime", async () => {
    for (const runtime of RUNTIMES) {
      const directory = await mkdtemp(path.join(tmpdir(), `uh-arm-ok-${runtime}-`));
      try {
        const { policyPath } = await writePolicy(directory);
        const armLogPath = path.join(directory, GUARD_ARM_LOG_NAME);
        const result = await armGuard(armingInput(runtime, policyPath, armLogPath));
        expect(result.ok, `${runtime}: ${result.ok ? "" : result.reason}`).toBe(true);
        const classes = parseLog(await readFile(armLogPath, "utf8")).map(entry => entry.class);
        expect(classes).toContain("allow");
        expect(classes).toContain("write_outside");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });

  test("refuses a corrupted policy for every runtime", async () => {
    for (const runtime of RUNTIMES) {
      const directory = await mkdtemp(path.join(tmpdir(), `uh-arm-bad-${runtime}-`));
      try {
        const policyPath = path.join(directory, "tool-guard.json");
        await writeFile(policyPath, "{ not json");
        const result = await armGuard(armingInput(runtime, policyPath, path.join(directory, GUARD_ARM_LOG_NAME)));
        expect(result.ok, runtime).toBe(false);
        if (!result.ok) {
          expect(result.expectation).toContain("policy");
          expect(result.reason).toContain("guard arming failed");
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
});

async function runtimeFixture(runtime: Runtime): Promise<{ root: string; missionPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), `uh-arm-adapter-${runtime}-`));
  await initializeHarness(root);
  await addAdapter(root, runtime);
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0",
    id: "one",
    name: "Guard arming gate",
    description: "Refuse to launch when the guard cannot be armed.",
    workflow_profile: "research-docs",
    guard: { write_roots: ["out"] },
    ...(runtime === "oh-my-pi" ? {} : { runtime_config_overrides: { model: "qwen/qwen3.8-flash" } }),
  }));
  return { root, missionPath };
}

let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-arm-snapshot-"));
  for (const name of ["cmdc-hook.js", "claude-code-hook.js", "omp.js"]) {
    const hook = path.join(snapshotRoot, "dist", "extensions", "tool-guard", name);
    await mkdir(path.dirname(hook), { recursive: true });
    await writeGuardHookFixture(hook);
  }
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

/** Corrupt the real policy file between the adapter's write and the arming check. */
const corruptPolicy = async (input: GuardArmingInput): Promise<GuardArmingResult> => {
  await writeFile(input.policyPath, "{ not json", "utf8");
  return await armGuard(input);
};

describe("adapters refuse the launch when the guard cannot be armed", () => {
  test("command-code spawns nothing and settles with a policy stop", async () => {
    const { root, missionPath } = await runtimeFixture("command-code");
    try {
      let spawns = 0;
      const result = await runCommandCode(root, missionPath, {
        runId: "unarmed",
        armGuard: corruptPolicy,
        runner: async () => { spawns += 1; return { stdout: "", stderr: "", exitCode: 0, timedOut: false }; },
        collectDiff: async () => ({ patch: "" }),
      });
      expect(spawns).toBe(0);
      expect(result.result?.status).toBe("failed");
      const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", "unarmed", "runtime-control.json"), "utf8")) as { stop_code?: string; stop_reason?: string };
      expect(control.stop_code).toBe("policy");
      expect(control.stop_reason).toContain("guard arming failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("claude-code spawns nothing and settles with a policy stop", async () => {
    const { root, missionPath } = await runtimeFixture("claude-code");
    try {
      let spawns = 0;
      const result = await runClaudeCode(root, missionPath, {
        runId: "unarmed",
        armGuard: corruptPolicy,
        runner: async () => { spawns += 1; return { stdout: "", stderr: "", exitCode: 0, timedOut: false }; },
        collectDiff: async () => ({ patch: "" }),
      });
      expect(spawns).toBe(0);
      expect(result.result?.status).toBe("failed");
      const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", "unarmed", "runtime-control.json"), "utf8")) as { stop_code?: string; stop_reason?: string };
      expect(control.stop_code).toBe("policy");
      expect(control.stop_reason).toContain("guard arming failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("oh-my-pi spawns nothing and settles with a policy stop", async () => {
    const { root, missionPath } = await runtimeFixture("oh-my-pi");
    try {
      let spawns = 0;
      const result = await runOhMyPi(root, missionPath, {
        runId: "unarmed",
        armGuard: corruptPolicy,
        runner: async () => { spawns += 1; return { stdout: "", stderr: "", exitCode: 0, timedOut: false }; },
        collectDiff: async () => ({ patch: "" }),
      });
      expect(spawns).toBe(0);
      expect(result.result?.status).toBe("failed");
      const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", "unarmed", "runtime-control.json"), "utf8")) as { stop_code?: string; stop_reason?: string };
      expect(control.stop_code).toBe("policy");
      expect(control.stop_reason).toContain("guard arming failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("oh-my-pi guard supervision", () => {
  test("the adapter passes permissionMode and guardLogPath to the runner", async () => {
    const { root, missionPath } = await runtimeFixture("oh-my-pi");
    try {
      let seen: OhMyPiRunnerInput | undefined;
      await runOhMyPi(root, missionPath, {
        runId: "guarded-evidence",
        runner: async (input) => {
          seen = input;
          return { stdout: JSON.stringify({ type: "run_end", result: { finalText: "Complete", stopReason: "end_turn" } }), stderr: "", exitCode: 0, timedOut: false };
        },
        collectDiff: async () => ({ patch: "" }),
      });
      expect(seen?.permissionMode).toBe("guard");
      expect(seen?.guardLogPath).toBe(path.join(root, ".harness", "missions", "one", "runs", "guarded-evidence", "tool-guard.log"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a completed oh-my-pi tool call without guard-log evidence stops the run", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "uh-omp-evidence-"));
    try {
      const guardLogPath = path.join(directory, "tool-guard.log");
      const run = new RuntimeSupervision({}, 0, undefined, directory, "guard", guardLogPath);
      run.observe({ type: "tool_execution_start", toolCallId: "omp-call-1", toolName: "read_file", args: { file_path: path.join(directory, "x") } }, 1);
      run.observe({ type: "tool_execution_end", toolCallId: "omp-call-1", toolName: "read_file", result: {} }, 2);
      expect(run.stopCode).toBe("policy");
      expect(run.failure).toBe("Guard hook did not run; refusing to continue with permissions enabled");
      expect(run.guardArmed).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
