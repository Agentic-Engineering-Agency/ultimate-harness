import { nativeRuntimeEvent } from "./runtime-supervision.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Count the turns in a sequence of parsed event records for supported runtimes.
 * Returns undefined for unsupported runtimes.
 */
export function countRuntimeTurns(runtime: string, events: unknown[]): number | undefined {
  if (runtime === "claude-code") {
    const messageIds = new Set<string>();
    for (const raw of events) {
      const event = nativeRuntimeEvent(raw);
      if (!event) continue;
      if (event.type === "assistant") {
        const message = record(event.message);
        if (typeof message?.id === "string" && message.id.length > 0) {
          messageIds.add(message.id);
        }
      }
    }
    return messageIds.size;
  }

  if (runtime === "acp") {
    let turns = 0;
    let turnOpen = false;
    for (const raw of events) {
      const entry = record(raw);
      if (!entry) continue;
      if (entry.event === "acp.session/update") {
        const update = record(entry.update);
        if (!update) continue;
        const sessionUpdate = update.sessionUpdate;
        if (
          sessionUpdate === "agent_message_chunk" ||
          sessionUpdate === "agent_thought_chunk" ||
          sessionUpdate === "tool_call"
        ) {
          if (!turnOpen) {
            turnOpen = true;
            turns++;
          }
        } else if (sessionUpdate === "tool_call_update") {
          const status = update.status;
          if (status === "completed" || status === "failed") {
            turnOpen = false;
          }
        }
      }
    }
    return turns;
  }

  return undefined;
}
