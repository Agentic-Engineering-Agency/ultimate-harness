import { describe, expect, test } from "vitest";
import { buildUsageEvent, estimateUsage, usageFromOpenAI } from "../src/harness/usage.js";

describe("estimateUsage", () => {
  test("derives ~chars/4 token counts and tags source estimated", () => {
    const u = estimateUsage("a".repeat(40), "b".repeat(20));
    expect(u).toEqual({ input_tokens: 10, output_tokens: 5, total_tokens: 15, source: "estimated" });
  });

  test("rounds up partial tokens", () => {
    expect(estimateUsage("abcde", "").input_tokens).toBe(2); // ceil(5/4)
  });

  test("handles empty/undefined text", () => {
    expect(estimateUsage(undefined, undefined)).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      source: "estimated",
    });
  });
});

describe("usageFromOpenAI", () => {
  test("extracts prompt/completion/total tokens and tags source runtime", () => {
    const u = usageFromOpenAI({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, "model-x");
    expect(u).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      source: "runtime",
      model: "model-x",
    });
  });

  test("computes total when omitted", () => {
    expect(usageFromOpenAI({ prompt_tokens: 100, completion_tokens: 50 })?.total_tokens).toBe(150);
  });

  test("tolerates a partial object (only completion_tokens)", () => {
    const u = usageFromOpenAI({ completion_tokens: 7 });
    expect(u).toMatchObject({ input_tokens: 0, output_tokens: 7, total_tokens: 7, source: "runtime" });
  });

  test("returns null for absent / malformed usage", () => {
    expect(usageFromOpenAI(undefined)).toBeNull();
    expect(usageFromOpenAI(null)).toBeNull();
    expect(usageFromOpenAI("nope")).toBeNull();
    expect(usageFromOpenAI({})).toBeNull();
    expect(usageFromOpenAI({ prompt_tokens: "x" })).toBeNull();
  });
});

describe("buildUsageEvent", () => {
  test("shapes a runtime.usage NDJSON payload", () => {
    const event = buildUsageEvent(
      "hermes-proxy",
      "m1",
      { input_tokens: 3, output_tokens: 4, total_tokens: 7, source: "runtime", model: "m" },
      "2026-05-23T00:00:00.000Z",
    );
    expect(event).toEqual({
      event: "runtime.usage",
      timestamp: "2026-05-23T00:00:00.000Z",
      runtime: "hermes-proxy",
      mission_id: "m1",
      input_tokens: 3,
      output_tokens: 4,
      total_tokens: 7,
      source: "runtime",
      model: "m",
    });
  });

  test("omits model when absent", () => {
    const event = buildUsageEvent("codex", "m2", estimateUsage("hello", "hi"), "2026-05-23T00:00:00.000Z");
    expect(event).not.toHaveProperty("model");
    expect(event).toMatchObject({ event: "runtime.usage", runtime: "codex", source: "estimated" });
  });
});
