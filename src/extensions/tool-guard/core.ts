import { appendFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { decideToolCall, toolTargetForLog, type ToolGuardClass } from "../../harness/tool-guard.js";
import { ToolGuardArtifactSchema, policyFromArtifact } from "../../schema/runtime-control.js";

/**
 * The single fail-closed guard core every runtime wrapper shares.
 *
 * A wrapper normalizes its runtime's tool call to {@link ToolGuardCall} and
 * translates the returned verdict back to its own protocol. The core is the
 * only place that reads the policy and decides, and every failure path —
 * missing configuration, an unreadable or invalid policy, an invalid call, an
 * exception while deciding, or an unwritable audit log — returns a denial.
 *
 * Every decision, allow or deny, is appended to the audit log as one JSON line
 * with `ts`, `call_id` (when the runtime supplied one), `tool`, `class`,
 * `target`, and `reason` for denials.
 */

export type ToolGuardLogClass = ToolGuardClass | "allow" | "guard_unavailable" | "read_window";

export interface ToolGuardCall {
  /** Runtime tool name; an empty name is an invalid call and is denied. */
  tool: string;
  input: unknown;
  /** The runtime's own tool call/use id, when it supplies one. */
  callId?: string;
}

/**
 * Opt-in rule a wrapper may set to deny a whole-file read of a large file.
 * Only the Command Code `PreToolUse` wrapper sets it; every other wrapper
 * leaves it unset and keeps its current behavior.
 */
export interface ToolGuardReadWindow {
  /** A whole-file read of a file larger than this many bytes is denied. */
  maxBytes: number;
  /** A read bounded by a `limit` of at most this many lines is allowed. */
  maxLines: number;
}

export interface ToolGuardLogLine {
  ts: string;
  call_id?: string;
  tool: string;
  class: ToolGuardLogClass;
  target: string;
  reason?: string;
}

export interface ToolGuardVerdict {
  decision: "allow" | "deny";
  class: ToolGuardLogClass;
  target: string;
  /** Present on every denial. */
  reason?: string;
}

export interface ToolGuardRequest {
  policyPath: string | undefined;
  logPath: string | undefined;
  call: ToolGuardCall;
  /** Set only by the Command Code wrapper; absent for every other runtime. */
  readWindow?: ToolGuardReadWindow;
}

/** Administrative denials carry no path class; they are labelled as their own. */
export const GUARD_UNAVAILABLE_CLASS = "guard_unavailable" as const;

/** A whole-file read of a large file is denied under this class. */
export const READ_WINDOW_CLASS = "read_window" as const;

export const GUARD_MISSING_CONFIG_REASON = "UH tool guard policy is not configured; refusing the tool call";
export const GUARD_UNREADABLE_POLICY_REASON = "UH tool guard policy could not be loaded; refusing the tool call";
export const GUARD_INVALID_INPUT_REASON = "UH tool guard received an invalid tool call; refusing the tool call";
export const GUARD_DECISION_FAILED_REASON = "UH tool guard could not decide the tool call; refusing the tool call";
export const GUARD_LOG_UNWRITABLE_REASON = "UH tool guard audit log could not be written; refusing the tool call";

export function toolGuardFailClosedReason(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `UH tool guard failed closed: ${detail}`;
}

function unavailable(reason: string, tool: string, input: unknown): ToolGuardVerdict {
  return { decision: "deny", class: GUARD_UNAVAILABLE_CLASS, target: toolTargetForLog(tool, input), reason };
}

/** Command Code's whole-file read tool and the input fields a window is read with. */
const READ_WINDOW_TOOL = "read_file";
const READ_PATH_FIELD = "file_path";
const READ_LIMIT_FIELD = "limit";

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** The reason a whole-file read of a large file is denied: its size and the fix. */
export function readWindowReason(target: string, bytes: number, maxLines: number): string {
  return `CONTRACT: ${target} is ${bytes} bytes and too large to read whole. Read it in windows of at most ${maxLines} lines using offset and limit.`;
}

/**
 * The opt-in read-window rule. It covers Command Code's `read_file` tool for any
 * path, inside or outside the policy's `worker_root`, because a whole-file read
 * of a large file kills the run wherever the file lives; a relative path still
 * resolves against `worker_root`. It runs only after the path policy has allowed
 * the call, so an existing denial always stands. A read with no `limit`, or a
 * `limit` above `maxLines` (an `offset` alone does not bound a read), is a
 * whole-file read, and a file larger than `maxBytes` is denied. A stat failure
 * leaves the existing decision unchanged.
 */
async function readWindowVerdict(
  rule: ToolGuardReadWindow | undefined,
  workerRoot: string,
  tool: string,
  input: unknown,
): Promise<ToolGuardVerdict | undefined> {
  if (!rule || tool.toLowerCase() !== READ_WINDOW_TOOL) return undefined;
  const args = recordOf(input);
  const requested = args?.[READ_PATH_FIELD];
  if (typeof requested !== "string" || !requested) return undefined;
  const file = path.resolve(workerRoot, requested);
  let bytes: number;
  try {
    bytes = (await stat(file)).size;
  } catch {
    return undefined;
  }
  if (bytes <= rule.maxBytes) return undefined;
  const limit = args?.[READ_LIMIT_FIELD];
  if (typeof limit === "number" && limit >= 1 && limit <= rule.maxLines) return undefined;
  const target = toolTargetForLog(tool, input);
  return { decision: "deny", class: READ_WINDOW_CLASS, target, reason: readWindowReason(target, bytes, rule.maxLines) };
}

async function decide(request: ToolGuardRequest): Promise<ToolGuardVerdict> {
  const tool = typeof request.call?.tool === "string" ? request.call.tool : "";
  const input = request.call?.input;
  if (!tool) return unavailable(GUARD_INVALID_INPUT_REASON, tool, input);
  if (!request.policyPath) return unavailable(GUARD_MISSING_CONFIG_REASON, tool, input);
  let policy;
  try {
    policy = policyFromArtifact(ToolGuardArtifactSchema.parse(JSON.parse(await readFile(request.policyPath, "utf8"))));
  } catch {
    return unavailable(GUARD_UNREADABLE_POLICY_REASON, tool, input);
  }
  try {
    const decision = decideToolCall(policy, tool, input, policy.worker_root, {
      allowControllerCommands: policy.controller_commands === true,
    });
    if (decision.deny) {
      return {
        decision: "deny",
        class: decision.deny.class,
        target: decision.deny.target ?? toolTargetForLog(tool, input),
        reason: decision.deny.reason,
      };
    }
    const window = await readWindowVerdict(request.readWindow, policy.worker_root, tool, input);
    if (window) return window;
    return { decision: "allow", class: "allow", target: toolTargetForLog(tool, input) };
  } catch {
    return unavailable(GUARD_DECISION_FAILED_REASON, tool, input);
  }
}

async function appendVerdict(logPath: string | undefined, verdict: ToolGuardVerdict, call: ToolGuardCall): Promise<boolean> {
  if (!logPath) return false;
  const tool = typeof call?.tool === "string" ? call.tool : "";
  const callId = typeof call?.callId === "string" && call.callId ? call.callId : undefined;
  const line: ToolGuardLogLine = {
    ts: new Date().toISOString(),
    ...(callId ? { call_id: callId } : {}),
    tool,
    class: verdict.class,
    target: verdict.target,
    ...(verdict.decision === "deny" && verdict.reason ? { reason: verdict.reason } : {}),
  };
  try {
    await appendFile(logPath, `${JSON.stringify(line)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Decide one normalized tool call and record it. Never rejects. */
export async function runToolGuard(request: ToolGuardRequest): Promise<ToolGuardVerdict> {
  const verdict = await decide(request);
  const logged = await appendVerdict(request.logPath, verdict, request.call);
  if (!logged) {
    return {
      decision: "deny",
      class: GUARD_UNAVAILABLE_CLASS,
      target: verdict.target,
      reason: GUARD_LOG_UNWRITABLE_REASON,
    };
  }
  return verdict;
}
