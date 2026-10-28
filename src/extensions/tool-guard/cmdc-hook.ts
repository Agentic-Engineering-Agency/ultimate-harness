import { runToolGuard, toolGuardFailClosedReason } from "./core.js";

/**
 * Command Code `PreToolUse` wrapper around the shared guard core.
 *
 * Command Code feeds one JSON request on stdin and reads a JSON decision on
 * stdout. A denial is always the same shape; an allowed call writes nothing.
 * The top-level handler denies on any error so an uncaught throw can never be
 * mistaken for a non-blocking hook failure.
 */

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function deny(reason: string): void {
  process.stdout.write(JSON.stringify({
    continue: true,
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
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  try {
    return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
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

await main().catch((error) => {
  deny(toolGuardFailClosedReason(error));
});
