import { runToolGuard, toolGuardFailClosedReason } from "./core.js";

/**
 * oh-my-pi extension wrapper around the shared guard core.
 *
 * oh-my-pi fires a `tool_call` event before a tool runs and blocks it by
 * returning `{ block: true, reason }`. The event carries the runtime's own
 * `toolCallId`, which is the same identifier the JSON event stream reports on
 * `tool_execution_start`/`tool_execution_end`, so the logged `call_id` matches
 * what supervision sees. The handler denies on any error.
 */

type ToolCallEvent = { toolName?: string; input?: unknown; toolCallId?: string };
type PiLike = { on(event: "tool_call", callback: (event: ToolCallEvent) => unknown): void };

export default function (pi: PiLike): void {
  pi.on("tool_call", async (event) => {
    try {
      const verdict = await runToolGuard({
        policyPath: process.env.UH_TOOL_GUARD_POLICY,
        logPath: process.env.UH_TOOL_GUARD_LOG,
        call: {
          tool: typeof event?.toolName === "string" ? event.toolName : "",
          input: event?.input,
          callId: typeof event?.toolCallId === "string" && event.toolCallId ? event.toolCallId : undefined,
        },
      });
      if (verdict.decision === "deny") {
        return { block: true, reason: verdict.reason ?? "UH tool guard denied the tool call" };
      }
      return undefined;
    } catch (error) {
      return { block: true, reason: toolGuardFailClosedReason(error) };
    }
  });
}
