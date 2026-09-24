import { appendFile, readFile } from "node:fs/promises";
import { decideToolCall, toolTargetForLog } from "../../harness/tool-guard.js";
import { ToolGuardPolicySchema } from "../../schema/runtime-control.js";

type ToolCallEvent = { toolName?: string; input?: unknown };
type PiLike = { on(event: "tool_call", callback: (event: ToolCallEvent) => unknown): void };

type AppliedPolicy = ReturnType<typeof ToolGuardPolicySchema.parse> & { worker_root: string; protected_paths?: string[] };
let loadedPath = "";
let loaded: AppliedPolicy | undefined;

async function policy(): Promise<AppliedPolicy | undefined> {
  const policyPath = process.env.UH_TOOL_GUARD_POLICY;
  if (!policyPath) return undefined;
  if (!loaded || loadedPath !== policyPath) {
    const raw = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>;
    const { schema_version: _schema, worker_root, protected_paths, controller_commands: _controllerCommands, ...fields } = raw;
    loaded = { ...ToolGuardPolicySchema.parse(fields), worker_root: String(worker_root ?? process.cwd()), protected_paths: Array.isArray(protected_paths) ? protected_paths.map(String) : undefined };
    loadedPath = policyPath;
  }
  return loaded;
}

async function record(tool: string, input: unknown, denial: NonNullable<ReturnType<typeof decideToolCall>["deny"]>): Promise<void> {
  const logPath = process.env.UH_TOOL_GUARD_LOG;
  if (!logPath) return;
  await appendFile(logPath, `${JSON.stringify({ ts: new Date().toISOString(), tool, class: denial.class, target: denial.target ?? toolTargetForLog(tool, input), reason: denial.reason })}\n`, "utf8").catch(() => {});
}

export default function (pi: PiLike): void {
  pi.on("tool_call", async (event) => {
    const applied = await policy();
    if (!applied) return undefined;
    const decision = decideToolCall(applied, event.toolName ?? "", event.input, applied.worker_root);
    if (!decision.deny) return undefined;
    await record(event.toolName ?? "", event.input, decision.deny);
    return { block: true, reason: decision.deny.reason };
  });
}
