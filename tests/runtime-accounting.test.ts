import { describe, test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  nativeCostFactsFromEvents,
  readNativeCostFacts,
  readRuntimeAccounting,
  resolveRunCost,
} from "../src/harness/runtime-accounting.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/runtime-events", import.meta.url));

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-accounting-"));
  const runs = path.join(root, ".harness", "missions", "one", "runs");
  for (const [runId, status, cost] of [["first", "failed", 0.25], ["second", "passed", 0.75]] as const) {
    await mkdir(path.join(runs, runId), { recursive: true });
    await writeFile(path.join(runs, runId, "runtime-result.yaml"), JSON.stringify({
      schema_version: "uh.runtime-result.v0", mission_id: "one", runtime: "oh-my-pi", status,
      started_at: "2026-09-15T00:00:00Z", finished_at: "2026-09-15T00:01:00Z",
      prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
      cost_usd: cost, cost_basis: "runtime_estimate", usage: { source: "runtime", total_tokens: 100 },
    }));
  }
  await writeFile(path.join(runs, "second", "runtime-recovery.json"), JSON.stringify({
    schema_version: "uh.runtime-recovery.v0", source_run_id: "first", session_id: "saved", notes: "Continue existing work",
  }));
  return { root, runs };
}

test("recovery accounting includes failed attempts once and cannot hide an unmeasured attempt", async () => {
  const { root, runs } = await fixture();
  try {
    const complete = await readRuntimeAccounting(root, "one", ["second", "first"]);
    expect(complete.facts.cost_usd).toBe(1);
    expect(complete.facts.cost_basis).toBe("runtime_estimate");
    expect(complete.facts.usage?.total_tokens).toBe(200);
    await rm(path.join(runs, "first", "runtime-result.yaml"));
    const incomplete = await readRuntimeAccounting(root, "one", ["second"]);
    expect(incomplete.facts.cost_usd).toBeUndefined();
    expect(incomplete.facts.usage?.total_tokens).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cyclic recovery evidence is rejected rather than silently treated as a complete ledger", async () => {
  const { root, runs } = await fixture();
  try {
    await writeFile(path.join(runs, "first", "runtime-recovery.json"), JSON.stringify({
      schema_version: "uh.runtime-recovery.v0", source_run_id: "second", session_id: "saved", notes: "Invalid cycle",
    }));
    await expect(readRuntimeAccounting(root, "one", ["second"])).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

describe("Command Code cost provenance from the real native fixtures", () => {
  test("the reduced Command Code streams carry neither token counts nor a price", async () => {
    for (const name of ["command-code-healthy.ndjson", "command-code-denied-retries.ndjson"]) {
      const lines = (await readFile(path.join(FIXTURE_DIR, name), "utf8")).split(/\r?\n/);
      const facts = nativeCostFactsFromEvents(lines);
      expect(facts.usage, name).toBeUndefined();
      expect(facts.reported_cost_usd, name).toBeUndefined();
      expect(facts.token_counts, name).toBeFalsy();
    }
  });

  test("a Command Code run with a costless native stream stays unknown with a reason", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-accounting-cmdc-"));
    try {
      const runDir = path.join(root, ".harness", "missions", "w1", "runs", "run-cmdc");
      await mkdir(runDir, { recursive: true });
      await writeFile(path.join(runDir, "runtime-result.yaml"), JSON.stringify({
        schema_version: "uh.runtime-result.v0", mission_id: "w1", runtime: "command-code", status: "passed",
        started_at: "2026-09-22T00:00:00.000Z", finished_at: "2026-09-22T00:01:00.000Z",
        prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
      }));
      // The real fixture is the run's captured native stream.
      await writeFile(path.join(runDir, "events.ndjson"), await readFile(path.join(FIXTURE_DIR, "command-code-healthy.ndjson"), "utf8"));

      const native = await readNativeCostFacts(runDir);
      const cost = resolveRunCost({ runtime: "command-code", native });
      expect(cost.cost_usd).toBeUndefined();
      expect(cost.cost_source).toBeUndefined();
      expect(cost.cost_unknown_reason).toMatch(/command-code/i);

      // The accounting ledger never invents a cost from an unpriced stream.
      const accounting = await readRuntimeAccounting(root, "w1", ["run-cmdc"]);
      expect(accounting.facts.cost_usd).toBeUndefined();
      expect(accounting.facts.usage).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("a price the native stream reports is recorded as reported, never estimated", () => {
    const facts = nativeCostFactsFromEvents([
      JSON.stringify({ type: "model_request_end", model: "provider/model", usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
      JSON.stringify({ type: "result", usage: { cost_usd: 0.25 } }),
    ]);
    expect(facts.model).toBe("provider/model");
    expect(facts.usage).toMatchObject({ input_tokens: 100, output_tokens: 20 });
    expect(facts.reported_cost_usd).toBe(0.25);
    expect(resolveRunCost({ runtime: "command-code", native: facts })).toEqual({ cost_usd: 0.25, cost_source: "reported" });
  });

  test("token counts with no price stay unknown instead of being priced from a guess", () => {
    const facts = nativeCostFactsFromEvents([
      JSON.stringify({ type: "model_request_end", model: "provider/model", usage: { inputTokens: 100, outputTokens: 20 } }),
    ]);
    const cost = resolveRunCost({ runtime: "command-code", native: facts });
    expect(cost.cost_usd).toBeUndefined();
    expect(cost.cost_source).toBeUndefined();
    expect(cost.cost_unknown_reason).toMatch(/no price/i);
  });

  test("a runtime-computed amount is labelled estimated, a reported one is not", () => {
    expect(resolveRunCost({ runtime: "command-code", resultCostUsd: 1, resultCostBasis: "runtime_estimate" }))
      .toEqual({ cost_usd: 1, cost_source: "estimated" });
    expect(resolveRunCost({ resultCostUsd: 1, resultCostBasis: "provider_reported" }))
      .toEqual({ cost_usd: 1, cost_source: "reported" });
    expect(resolveRunCost({ runtime: "hermes", resultCostUsd: undefined }))
      .toEqual({ cost_unknown_reason: "runtime reported no cost" });
  });
});
