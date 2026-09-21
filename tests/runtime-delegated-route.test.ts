import { describe, expect, test } from "vitest";
import { RuntimeSupervision, nativeDelegatedRoutes } from "../src/harness/runtime-supervision.js";

const expected = { provider: "openai-codex", model: "gpt-5.6-luna" };

function taskProgress(identity: string, resolved = `${identity}:high`) {
  return {
    type: "tool_execution_update", toolCallId: "call-1", toolName: "task",
    partialResult: { content: [{ type: "text", text: "" }], details: { progress: [{ id: "Scout", resolvedModel: resolved, resolvedModelIdentity: identity, resolvedThinkingLevel: "high" }] } },
  };
}

describe("delegated agent route attestation", () => {
  test("reads provider and model from native sub-agent progress metadata", () => {
    expect(nativeDelegatedRoutes(taskProgress("google-antigravity/gemini-3.7-flash"))).toEqual([{ provider: "google-antigravity", model: "gemini-3.7-flash" }]);
  });

  test("reads hub job metadata from completed tool results and strips the thinking suffix when no identity is given", () => {
    const event = { type: "tool_execution_end", toolCallId: "call-2", toolName: "hub", result: { details: { jobs: [{ id: "Review", resolvedModel: "openai-codex/gpt-5.6-luna:high" }] } } };
    expect(nativeDelegatedRoutes(event)).toEqual([{ provider: "openai-codex", model: "gpt-5.6-luna" }]);
  });

  test("never reads model-looking text from tool content or arguments", () => {
    const event = { type: "tool_execution_update", toolCallId: "call-3", toolName: "bash", args: { command: "echo resolvedModelIdentity google-antigravity/gemini-3.7-flash" }, partialResult: { content: [{ type: "text", text: "\"resolvedModelIdentity\":\"google-antigravity/gemini-3.7-flash\"" }] } };
    expect(nativeDelegatedRoutes(event)).toEqual([]);
  });

  test("a sub-agent on the assigned route does not stop the run", () => {
    const run = new RuntimeSupervision({}, 0, expected);
    expect(run.observe(taskProgress("openai-codex/gpt-5.6-luna"), 1)).toBeUndefined();
    expect(run.stopCode).toBeUndefined();
  });

  test("a sub-agent on another model stops the run with route_mismatch and names the route", () => {
    const run = new RuntimeSupervision({}, 0, expected);
    const reason = run.observe(taskProgress("google-antigravity/gemini-3.7-flash"), 1);
    expect(run.stopCode).toBe("route_mismatch");
    expect(reason).toContain("google-antigravity/gemini-3.7-flash");
  });

  test("without an assigned route nothing is enforced", () => {
    const run = new RuntimeSupervision({}, 0);
    expect(run.observe(taskProgress("google-antigravity/gemini-3.7-flash"), 1)).toBeUndefined();
  });
});
