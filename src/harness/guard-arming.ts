import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ToolGuardArtifactSchema } from "../schema/runtime-control.js";

/**
 * Pre-launch arming check for the tool guard.
 *
 * Once a run has written its policy and installed its hook, the adapter runs
 * the runtime's real hook against that same policy file with two synthetic
 * calls — a read inside the worker root and a write outside every write root —
 * logging to a dedicated arming log (`tool-guard.arm.log`) so the run's own
 * evidence stays untouched. A healthy guard allows and logs the read, and
 * denies and logs the write. Anything else stops the run before the runtime is
 * ever spawned, so a broken guard can never complete a call it did not judge.
 */

export type GuardArmingRuntime = "command-code" | "claude-code" | "oh-my-pi";

/** Name of the arming log, written beside the run's `tool-guard.log`. */
export const GUARD_ARM_LOG_NAME = "tool-guard.arm.log";
export const GUARD_ARMING_FAILURE_PREFIX = "guard arming failed";

export interface GuardArmingHookResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface GuardArmingInput {
  runtime: GuardArmingRuntime;
  /** Absolute path of the run's real policy file the hook is pointed at. */
  policyPath: string;
  /** Absolute path of the separate arming log. */
  logPath: string;
  /** Argv of the runtime's real hook command (command-code, claude-code). */
  hookCommand?: string[];
  /** Absolute path of the extension module to load (oh-my-pi). */
  hookModulePath?: string;
  /** Injectable spawn seam for the hook command. */
  runHookCommand?: (command: string[], stdin: string, env: NodeJS.ProcessEnv) => Promise<GuardArmingHookResult>;
  /** Injectable module loader seam for the oh-my-pi extension. */
  loadHookModule?: (modulePath: string) => Promise<unknown>;
}

export type GuardArmingResult = { ok: true } | { ok: false; expectation: string; reason: string };
export type GuardArmingFailure = Extract<GuardArmingResult, { ok: false }>;

interface ProbeCall {
  tool: string;
  input: Record<string, unknown>;
  callId: string;
}

type ProbeDecision = { decision: "allow" | "deny" | "error"; detail: string };

function defaultRunHookCommand(command: string[], stdin: string, env: NodeJS.ProcessEnv): Promise<GuardArmingHookResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: GuardArmingHookResult): void => { if (!settled) { settled = true; resolve(result); } };
    let child;
    try {
      child = spawn(command[0], command.slice(1), { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      finish({ stdout, stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`, code: null });
      return;
    }
    child.stdout?.on("data", chunk => { stdout += String(chunk); });
    child.stderr?.on("data", chunk => { stderr += String(chunk); });
    child.on("error", error => finish({ stdout, stderr: `${stderr}${error.message}`, code: null }));
    child.on("close", code => finish({ stdout, stderr, code }));
    child.stdin?.on("error", () => { /* the child going away is reported through close/error */ });
    child.stdin?.end(stdin);
  });
}

async function defaultLoadHookModule(modulePath: string): Promise<unknown> {
  return await import(pathToFileURL(modulePath).href);
}

function interpretSubprocessOutput(stdout: string): ProbeDecision {
  const trimmed = stdout.trim();
  if (!trimmed) return { decision: "allow", detail: "no decision output" };
  try {
    const parsed = JSON.parse(trimmed) as { hookSpecificOutput?: { permissionDecision?: unknown } };
    return parsed.hookSpecificOutput?.permissionDecision === "deny"
      ? { decision: "deny", detail: "hook returned a deny decision" }
      : { decision: "allow", detail: "hook returned a non-deny decision" };
  } catch {
    return { decision: "error", detail: `hook stdout was not a JSON decision: ${trimmed.slice(0, 200)}` };
  }
}

async function invokeSubprocessHook(
  input: GuardArmingInput,
  env: NodeJS.ProcessEnv,
  probe: ProbeCall,
): Promise<ProbeDecision> {
  const command = input.hookCommand;
  if (!command || command.length === 0 || !command[0]) {
    return { decision: "error", detail: "no hook command configured" };
  }
  const run = input.runHookCommand ?? defaultRunHookCommand;
  const stdin = JSON.stringify({ tool_name: probe.tool, tool_input: probe.input, tool_use_id: probe.callId });
  const result = await run(command, stdin, env);
  if (result.code !== 0) {
    return { decision: "error", detail: `hook exited ${result.code === null ? "without a status" : result.code}: ${result.stderr.trim().slice(0, 200)}` };
  }
  return interpretSubprocessOutput(result.stdout);
}

async function invokeExtensionHook(
  input: GuardArmingInput,
  env: NodeJS.ProcessEnv,
  probe: ProbeCall,
): Promise<ProbeDecision> {
  if (!input.hookModulePath) return { decision: "error", detail: "no extension module configured" };
  const load = input.loadHookModule ?? defaultLoadHookModule;
  let loaded: unknown;
  try {
    loaded = await load(input.hookModulePath);
  } catch (error) {
    return { decision: "error", detail: `extension module could not be loaded: ${error instanceof Error ? error.message : String(error)}` };
  }
  const factory = (loaded as { default?: unknown })?.default;
  if (typeof factory !== "function") return { decision: "error", detail: "extension module has no default export" };
  const handlers: Array<(event: unknown) => unknown> = [];
  const stub = { on: (event: string, callback: (event: unknown) => unknown) => { if (event === "tool_call") handlers.push(callback); } };
  // The extension reads its policy and log paths from the environment at call
  // time, so point those variables at the real policy and the arming log for the
  // duration of the probe, then restore them.
  const previousEnv = { UH_TOOL_GUARD_POLICY: process.env.UH_TOOL_GUARD_POLICY, UH_TOOL_GUARD_LOG: process.env.UH_TOOL_GUARD_LOG };
  process.env.UH_TOOL_GUARD_POLICY = env.UH_TOOL_GUARD_POLICY;
  process.env.UH_TOOL_GUARD_LOG = env.UH_TOOL_GUARD_LOG;
  try {
    await (factory as (pi: unknown) => unknown)(stub);
    const handler = handlers[0];
    if (!handler) return { decision: "error", detail: "extension did not register a tool_call handler" };
    const outcome = await handler({ type: "tool_call", toolName: probe.tool, toolCallId: probe.callId, input: probe.input });
    if (outcome && typeof outcome === "object" && (outcome as { block?: unknown }).block === true) {
      return { decision: "deny", detail: "extension returned a block decision" };
    }
    return { decision: "allow", detail: "extension returned no block decision" };
  } catch (error) {
    return { decision: "error", detail: `extension handler threw: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (previousEnv.UH_TOOL_GUARD_POLICY === undefined) delete process.env.UH_TOOL_GUARD_POLICY;
    else process.env.UH_TOOL_GUARD_POLICY = previousEnv.UH_TOOL_GUARD_POLICY;
    if (previousEnv.UH_TOOL_GUARD_LOG === undefined) delete process.env.UH_TOOL_GUARD_LOG;
    else process.env.UH_TOOL_GUARD_LOG = previousEnv.UH_TOOL_GUARD_LOG;
  }
}

async function readArmLog(logPath: string): Promise<Array<{ class?: unknown }>> {
  try {
    return (await readFile(logPath, "utf8")).split(/\r?\n/).filter(Boolean).map(line => {
      try {
        return JSON.parse(line) as { class?: unknown };
      } catch {
        return {};
      }
    });
  } catch {
    return [];
  }
}

function failure(expectation: string, detail: string): GuardArmingResult {
  return { ok: false, expectation, reason: `${GUARD_ARMING_FAILURE_PREFIX}: expected ${expectation}; ${detail}` };
}

/** Run the two synthetic probes against the run's real policy. Never throws. */
export async function armGuard(input: GuardArmingInput): Promise<GuardArmingResult> {
  let workerRoot: string;
  try {
    const artifact = ToolGuardArtifactSchema.parse(JSON.parse(await readFile(input.policyPath, "utf8")));
    workerRoot = artifact.worker_root;
  } catch {
    return failure("the guard policy to be readable and valid", `the policy at ${input.policyPath} could not be loaded`);
  }

  const env: NodeJS.ProcessEnv = { ...process.env, UH_TOOL_GUARD_POLICY: input.policyPath, UH_TOOL_GUARD_LOG: input.logPath };
  const invoke = input.runtime === "oh-my-pi" ? invokeExtensionHook : invokeSubprocessHook;
  const readProbe: ProbeCall = {
    tool: "read_file",
    input: { file_path: path.join(workerRoot, "tool-guard-arm-read.txt") },
    callId: "uh-guard-arm-read",
  };

  let writeDirectory: string;
  try {
    writeDirectory = await mkdtemp(path.join(tmpdir(), "uh-guard-arm-"));
  } catch (error) {
    return failure("the arming probe directory to be writable", error instanceof Error ? error.message : String(error));
  }
  const writeProbe: ProbeCall = {
    tool: "write_file",
    input: { file_path: path.join(writeDirectory, "probe.txt") },
    callId: "uh-guard-arm-write",
  };

  try {
    const read = await invoke(input, env, readProbe);
    const write = await invoke(input, env, writeProbe);
    const lines = await readArmLog(input.logPath);
    const loggedAllow = lines.some(line => line.class === "allow");
    const loggedDeny = lines.some(line => typeof line.class === "string" && line.class !== "allow");

    if (read.decision === "error") return failure("the guard hook to run for a read", read.detail);
    if (read.decision === "deny") return failure("the read probe to be allowed", "the guard denied a read inside the worker root");
    if (!loggedAllow) return failure("the read probe to be logged", "the arming log has no allow line for the read probe");
    if (write.decision === "error") return failure("the guard hook to run for a write", write.detail);
    if (write.decision === "allow") return failure("the write probe to be denied", "the guard allowed a write outside every write root");
    if (!loggedDeny) return failure("the write probe to be logged", "the arming log has no denial line for the write probe");
    return { ok: true };
  } catch (error) {
    return failure("the guard hook to run", error instanceof Error ? error.message : String(error));
  } finally {
    await rm(writeDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * A `runtime-control.json`-shaped receipt for a run that stopped before launch
 * because the guard could not be armed. `stop_code` is `policy` and the reason
 * names the failed expectation.
 */
export function guardArmStopReceipt(input: { missionId: string; runId: string; runtime: string; reason: string }): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    schema_version: "uh.runtime-control.v0",
    permission_mode: "guard",
    mission_id: input.missionId,
    run_id: input.runId,
    runtime: input.runtime,
    controller_pid: process.pid,
    started_at: now,
    heartbeat_at: now,
    status: "failed",
    stop_code: "policy",
    stop_reason: input.reason,
    guard_armed: false,
    turns: 0,
    denials: 0,
    inflight_tools: 0,
  };
}
