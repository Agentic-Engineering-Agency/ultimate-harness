import { appendFile, readFile } from "node:fs/promises";
import { ToolGuardArtifactSchema, type ToolGuardArtifact } from "../../schema/runtime-control.js";
import { decideToolCall, toolTargetForLog } from "../../harness/tool-guard.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function deny(reason: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
}

async function main(): Promise<void> {
  const policyPath = process.env.UH_TOOL_GUARD_POLICY;
  const logPath = process.env.UH_TOOL_GUARD_LOG;
  if (!policyPath || !logPath) {
    deny("UH Claude Code guard policy is not configured; refusing the tool call");
    return;
  }

  let policy: ToolGuardArtifact;
  try {
    policy = ToolGuardArtifactSchema.parse(JSON.parse(await readFile(policyPath, "utf8")));
  } catch {
    deny("UH Claude Code guard policy could not be loaded; refusing the tool call");
    return;
  }

  const input = record(JSON.parse(await new Promise<string>((resolve, reject) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => { body += chunk; });
    process.stdin.on("end", () => resolve(body));
    process.stdin.on("error", reject);
  })));
  if (!input) {
    deny("UH Claude Code guard received invalid hook input; refusing the tool call");
    return;
  }

  const toolName = typeof input.tool_name === "string" ? input.tool_name : "unknown";
  const decision = decideToolCall(
    policy,
    toolName,
    input.tool_input,
    policy.worker_root,
    { allowControllerCommands: policy.controller_commands === true },
  );
  const logEntry = decision.deny
    ? { ts: new Date().toISOString(), tool: toolName, target: decision.deny.target ?? toolTargetForLog(toolName, input.tool_input), class: decision.deny.class, reason: decision.deny.reason }
    : { ts: new Date().toISOString(), tool: toolName, target: toolTargetForLog(toolName, input.tool_input), class: "allow" };
  try {
    await appendFile(logPath, JSON.stringify(logEntry) + "\n", "utf8");
  } catch {
    deny("UH Claude Code guard audit log could not be written; refusing the tool call");
    return;
  }
  if (decision.deny) deny(decision.deny.reason);

}

void main().catch((error) => {
  deny(`UH Claude Code guard failed closed: ${error instanceof Error ? error.message : String(error)}`);
});
