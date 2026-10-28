import { appendFile, readFile } from "node:fs/promises";
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

export type ToolGuardLogClass = ToolGuardClass | "allow" | "guard_unavailable";

export interface ToolGuardCall {
  /** Runtime tool name; an empty name is an invalid call and is denied. */
  tool: string;
  input: unknown;
  /** The runtime's own tool call/use id, when it supplies one. */
  callId?: string;
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
}

/** Administrative denials carry no path class; they are labelled as their own. */
export const GUARD_UNAVAILABLE_CLASS = "guard_unavailable" as const;

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
