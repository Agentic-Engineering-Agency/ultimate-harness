import { appendFile, readFile } from "node:fs/promises";
import { decideToolCall, toolTargetForLog } from "../../harness/tool-guard.js";
import { ToolGuardPolicySchema } from "../../schema/runtime-control.js";

type AppliedPolicy = ReturnType<typeof ToolGuardPolicySchema.parse> & { worker_root: string; protected_paths?: string[] };

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  let request: Record<string, unknown> = {};
  try { request = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>; } catch { return; }
  const policyPath = process.env.UH_TOOL_GUARD_POLICY;
  if (!policyPath) return;
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>; } catch { return; }
  const { schema_version: _schema, worker_root, protected_paths, controller_commands: _controllerCommands, ...fields } = raw;
  const policy = {
    ...ToolGuardPolicySchema.parse(fields),
    worker_root: String(worker_root ?? process.cwd()),
    protected_paths: Array.isArray(protected_paths) ? protected_paths.map(String) : undefined,
  } as AppliedPolicy;
  const tool = typeof request.tool_name === "string" ? request.tool_name : "";
  const input = request.tool_input;
  const logPath = process.env.UH_TOOL_GUARD_LOG;
  const callId = typeof request.tool_call_id === "string" ? request.tool_call_id : typeof request.toolCallId === "string" ? request.toolCallId : undefined;
  const decision = decideToolCall(policy, tool, input, policy.worker_root);
  const logEntry = decision.deny
    ? { ts: new Date().toISOString(), call_id: callId, tool, class: decision.deny.class, target: decision.deny.target ?? toolTargetForLog(tool, input), reason: decision.deny.reason }
    : { ts: new Date().toISOString(), call_id: callId, tool, class: "allow", target: toolTargetForLog(tool, input) };
  let logged = false;
  if (logPath) {
    try { await appendFile(logPath, `${JSON.stringify(logEntry)}\n`, "utf8"); logged = true; } catch { logged = false; }
  }
  if (!logged) {
    process.stdout.write(JSON.stringify({ continue: true, hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "CONTRACT: guard log could not be written; refusing to continue with permissions enabled." } }));
    return;
  }
  if (!decision.deny) return;
  process.stdout.write(JSON.stringify({ continue: true, hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: decision.deny.reason } }));
}

await main();
