import { runToolGuard, toolGuardFailClosedReason } from "./core.js";

/**
 * Claude Code `PreToolUse` wrapper around the shared guard core.
 *
 * Claude Code feeds one JSON request on stdin and reads a JSON decision on
 * stdout. An allowed call writes nothing (the tool runs); a denial carries the
 * `permissionDecision: "deny"` response. The top-level handler denies on any
 * error so a broken hook can never let a call through.
 */

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function deny(reason: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
}

function callIdOf(request: Record<string, unknown> | undefined): string | undefined {
  for (const key of ["tool_use_id", "tool_call_id", "toolCallId"]) {
    const value = request?.[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

async function readRequest(): Promise<Record<string, unknown> | undefined> {
  const body = await new Promise<string>((resolve, reject) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => { text += chunk; });
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", reject);
  });
  try {
    return record(JSON.parse(body));
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const request = await readRequest();
  const verdict = await runToolGuard({
    policyPath: process.env.UH_TOOL_GUARD_POLICY,
    logPath: process.env.UH_TOOL_GUARD_LOG,
    call: {
      tool: typeof request?.tool_name === "string" ? request.tool_name : "",
      input: request?.tool_input,
      callId: callIdOf(request),
    },
  });
  if (verdict.decision === "deny") deny(verdict.reason ?? "UH tool guard denied the tool call");
}

void main().catch((error) => {
  deny(toolGuardFailClosedReason(error));
});
