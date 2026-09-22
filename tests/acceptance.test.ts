import { describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AcceptanceEvidenceSchema, AcceptanceRegistrySchema } from "../src/schema/acceptance.js";
import { classifyAcceptance, collectFacts, compareAcceptanceFacts, renderAcceptanceReport, runAcceptance } from "../src/harness/acceptance.js";

const expected = { status: "passed", required_records: { denials: 3 } } as const;

describe("acceptance evidence", () => {
  test("schemas round-trip registry and evidence", () => {
    const registry = AcceptanceRegistrySchema.parse({
      schema_version: "uh.acceptance-registry.v0",
      entries: { C1: { title: "Contracts", capability: "C1", mission: "missions/C1/mission.yaml", shape: "team", runtime: "oh-my-pi", expected: { status: "passed" }, notes: "" } },
    });
    expect(registry.entries.C1.freshness_days).toBe(30);
    const evidence = AcceptanceEvidenceSchema.parse({
    schema_version: "uh.acceptance-evidence.v0", capability: "C1", outcome: "passed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "abc", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: [], mission_id: "c1", expected: { status: "passed" }, observed: { status: "passed" }, fact_sources: {}, mismatches: [], artifact_root: "T:/tmp/run/.harness",
    });
    expect(evidence.cost_usd).toBe("unknown");
  });

  test("compares matching, mismatching, and missing records", () => {
    expect(compareAcceptanceFacts(expected, { status: "passed", denials: 3 })).toEqual([]);
    expect(compareAcceptanceFacts(expected, { status: "passed", denials: 0 })[0].field).toBe("required_records.denials");
    expect(compareAcceptanceFacts(expected, { status: "passed" })[0].observed).toBeUndefined();
  });
  test("normalizes canonical team worker and output facts", () => {
    const mismatches = compareAcceptanceFacts(
      { status: "passed", workers: { "worker-a": { status: "succeeded" } }, outputs: { "worker-a": "passed" } },
      { status: "passed", workers: [{ id: "worker-a", status: "succeeded", outputs: [{ path: "out.txt", status: "passed" }] }] },
    );
    expect(mismatches).toEqual([]);
  });

  test("compares guardian and path acceptance facts", () => {
    expect(compareAcceptanceFacts(
      { status: "passed", guardian_receipt: true, path_style: "forward_slashes" },
      { status: "passed", settlement_confirmed: true, guardian_receipt: true, guardian: { mode: "cache", path: "guardian.exe" }, path_style: "forward_slashes" },
    )).toEqual([]);
    expect(compareAcceptanceFacts(
      { status: "passed", guardian_receipt: true, path_style: "forward_slashes" },
      { status: "passed", path_style: "backslashes" },
    ).map((mismatch) => mismatch.field)).toEqual(["guardian_receipt", "path_style"]);
  });

  test("classifies freshness and commit coherence", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect(classifyAcceptance({ outcome: "passed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "abc" }, 30, now, "abc")).toBe("proven");
    expect(classifyAcceptance({ outcome: "passed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "old" }, 30, now, "abc")).toBe("stale");
    expect(classifyAcceptance({ outcome: "failed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "abc" }, 30, now, "abc")).toBe("failed");
    expect(classifyAcceptance(null, 30, now, "abc")).toBe("unproven");
  });
  test("renders evidence links relative to the generated report and omits absent evidence links", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-report-"));
    await mkdir(path.join(root, "acceptance", "evidence", "C1"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  C1:\n    title: Per-worker contracts\n    capability: C1\n    mission: missions/C1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n  S1:\n    title: Resource wave baseline\n    capability: S1\n    mission: missions/S1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "C1", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "C1", outcome: "passed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "unknown", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: [], mission_id: "c1", expected: { status: "passed" }, observed: { status: "passed" }, fact_sources: {}, mismatches: [], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"));
    expect(report).toContain("[latest](../../acceptance/evidence/C1/latest.json)");
    expect(report).toContain("| S1 | S1 | Resource wave baseline | unproven | — | oh-my-pi | — | — | — |");
  });

  test("renders generated report from a registry fixture", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-report-"));
    await mkdir(path.join(root, "acceptance", "evidence", "C1"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  C1:\n    title: Per-worker contracts\n    capability: C1\n    mission: missions/C1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "C1", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "C1", outcome: "passed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "unknown", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: [], mission_id: "c1", expected: { status: "passed" }, observed: { status: "passed" }, fact_sources: {}, mismatches: [], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"));
    expect(report).toContain("| C1 | Per-worker contracts |");
  });

  test("records fact source selection across attempts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-facts-"));
    const missionRoot = path.join(root, ".harness", "missions", "fixture", "runs");
    await mkdir(path.join(missionRoot, "001"), { recursive: true });
    await mkdir(path.join(missionRoot, "002"), { recursive: true });
    await writeFile(path.join(missionRoot, "001", "runtime-result.yaml"), "status: failed\nstop_code: stall\nturns: 1\n");
    await writeFile(path.join(missionRoot, "002", "runtime-result.yaml"), "status: passed\nturns: 2\n");
    const facts = await collectFacts(root, "fixture", { status: "passed", fact_sources: { status: "last", stop_code: "first" } });
    expect(facts.runIds).toEqual(["001", "002"]);
    expect(facts.observed.status).toBe("passed");
    expect(facts.observed.stop_code).toBe("stall");
    expect(facts.fact_sources.status).toBe("last");
    expect(facts.fact_sources.stop_code).toBe("first");
  });

  test("renders failed evidence for attempted fixture-only missions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-fixture-"));
    await mkdir(path.join(root, "acceptance", "evidence", "R10-stall"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  R10-stall:\n    title: Stall recovery\n    capability: R10\n    mission: missions/R10-stall/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    real_mission: not_applicable\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "R10-stall", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "R10-stall", outcome: "failed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "abc", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: ["001"], mission_id: "r10", expected: { status: "passed" }, observed: { status: "failed" }, fact_sources: {}, mismatches: [{ field: "status", expected: "passed", observed: "failed" }], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"));
    expect(report).toContain("| R10-stall | R10 | Stall recovery | failed |");
  });

  test("committed acceptance report is generated from current registry", async () => {
    const report = await renderAcceptanceReport(process.cwd());
    const committed = await readFile(path.join(process.cwd(), "docs", "acceptance", "README.md"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(report.replace(/\r\n/g, "\n"));
  });
  test("refuses acceptance run without workspace", async () => {
    await expect(runAcceptance(process.cwd())).rejects.toThrow(/--workspace/);
  });
});
