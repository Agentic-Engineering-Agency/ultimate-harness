import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readRuntimeAccounting } from "../src/harness/runtime-accounting.js";

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
