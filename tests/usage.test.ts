import { describe, expect, test } from "vitest";
import { aggregateRuntimeUsage, estimateConfiguredCost, estimateUsage, usageFromOpenAI } from "../src/harness/usage.js";

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

  test("preserves unknown input and total when only completion usage is reported", () => {
    const u = usageFromOpenAI({ completion_tokens: 7 });
    expect(u?.output_tokens).toBe(7);
    expect(u?.input_tokens).toBeUndefined();
    expect(u?.total_tokens).toBeUndefined();
  });

  test("returns null for absent / malformed usage", () => {
    expect(usageFromOpenAI(undefined)).toBeNull();
    expect(usageFromOpenAI(null)).toBeNull();
    expect(usageFromOpenAI("nope")).toBeNull();
    expect(usageFromOpenAI({})).toBeNull();
    expect(usageFromOpenAI({ prompt_tokens: "x" })).toBeNull();
  });
});

describe("aggregateRuntimeUsage", () => {
  test("retains mixed-route spend without attributing it to one model or hiding estimated measurements", () => {
    const facts = aggregateRuntimeUsage([
      { provider: "one", model: "one/model", cost_usd: 0.25, cost_basis: "provider_reported", usage: { source: "runtime", total_tokens: 10 } },
      { provider: "two", model: "two/model", cost_usd: 0.75, cost_basis: "runtime_estimate", usage: { source: "estimated", total_tokens: 20 } },
    ]);
    expect(facts.cost_usd).toBe(1);
    expect(facts.cost_basis).toBe("mixed");
    expect(facts.usage).toMatchObject({ total_tokens: 30, source: "estimated" });
    expect(facts.model).toBeUndefined();
    expect(facts.provider).toBeUndefined();
  });

  test("does not present missing attempts or missing counters as complete totals", () => {
    const first = { cost_usd: 0.25, usage: { source: "runtime" as const, input_tokens: 10, output_tokens: 2, total_tokens: 12 } };
    const partial = aggregateRuntimeUsage([first, { usage: { source: "runtime", output_tokens: 3 } }]);
    expect(partial.cost_usd).toBeUndefined();
    expect(partial.usage?.output_tokens).toBe(5);
    expect(partial.usage?.input_tokens).toBeUndefined();
    expect(partial.usage?.total_tokens).toBeUndefined();
    expect(aggregateRuntimeUsage([first, undefined]).cost_usd).toBeUndefined();
  });
});


test("configured pricing subtracts only declared cache overlap and refuses incomplete or mismatched evidence", () => {
  const pricing = {
    model: "fixture/model", input_usd_per_million: 1, output_usd_per_million: 2,
    cache_read_usd_per_million: 0.1, cache_write_usd_per_million: 3,
    input_includes_cache_read: true, input_includes_cache_write: true,
  };
  const usage = { source: "runtime" as const, input_tokens: 100, output_tokens: 5, cache_read_tokens: 20, cache_write_tokens: 10 };
  expect(estimateConfiguredCost(usage, "fixture/model", pricing)).toBeCloseTo(0.000112, 10);
  expect(estimateConfiguredCost({ ...usage, cache_write_tokens: undefined }, "fixture/model", pricing)).toBeUndefined();
  expect(estimateConfiguredCost({ ...usage, input_tokens: 10 }, "fixture/model", pricing)).toBeUndefined();
  expect(estimateConfiguredCost(usage, "another/model", pricing)).toBeUndefined();
});
