import { appendFile, readFile } from "node:fs/promises";
import { decideToolCall, toolTargetForLog } from "../../harness/tool-guard.js";
import { ToolGuardArtifactSchema, policyFromArtifact, type AppliedToolGuardPolicy } from "../../schema/runtime-control.js";

type ToolCallEvent = { toolName?: string; input?: unknown };
type PiLike = { on(event: "tool_call", callback: (event: ToolCallEvent) => unknown): void };

type AppliedPolicy = AppliedToolGuardPolicy;
let loadedPath = "";
let loaded: AppliedPolicy | undefined;

async function policy(): Promise<AppliedPolicy | undefined> {
  const policyPath = process.env.UH_TOOL_GUARD_POLICY;
  if (!policyPath) return undefined;
  if (!loaded || loadedPath !== policyPath) {
    const raw = JSON.parse(await readFile(policyPath, "utf8")) as unknown;
    const artifact = ToolGuardArtifactSchema.parse(raw);
    loaded = policyFromArtifact(artifact);
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
