import { describe, expect, test } from "vitest";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { AcceptanceEvidenceSchema, AcceptanceRegistrySchema } from "../src/schema/acceptance.js";
import { validateMission } from "../src/schema/mission.js";
import { applyTeamMissionOverrides, classifyAcceptance, collectFacts, compareAcceptanceFacts, loadAcceptanceRegistry, renderAcceptanceReport, runAcceptance, wrapperMechanismUnavailable } from "../src/harness/acceptance.js";

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

describe("command-code fleet registry entries", () => {
  test("every oh-my-pi entry has a -cmdc command-code sibling with identical capability and expectations", async () => {
    const registry = await loadAcceptanceRegistry(process.cwd());
    const ohMyPiIds = Object.keys(registry.entries).filter((id) => registry.entries[id].runtime === "oh-my-pi");
    expect(ohMyPiIds.length).toBe(17);
    for (const id of ohMyPiIds) {
      const sibling = registry.entries[`${id}-cmdc`];
      expect(sibling, `${id}-cmdc must be registered`).toBeDefined();
      expect(sibling.runtime).toBe("command-code");
      expect(sibling.model).toBe("qwen/qwen3.8-flash");
      expect(sibling.capability).toBe(registry.entries[id].capability);
      expect(sibling.expected).toEqual(registry.entries[id].expected);
      expect(sibling.real_mission).toBe(registry.entries[id].real_mission);
    }
    for (const [id, entry] of Object.entries(registry.entries)) {
      if (!id.endsWith("-cmdc")) continue;
      expect(registry.entries[id.slice(0, -"-cmdc".length)], `${id} must mirror a registry entry`).toBeDefined();
      if (id === "R10-stall-cmdc") {
        expect(entry.real_mission).toBe("not_applicable");
        expect(entry.reason).toMatch(/print mode/);
      } else {
        expect(entry.real_mission).toBe("real");
        await expect(access(path.join(process.cwd(), "acceptance", entry.mission))).resolves.toBeUndefined();
      }
    }
  });

  test("every real -cmdc mission file validates and uses only command-code adapters", async () => {
    const registry = await loadAcceptanceRegistry(process.cwd());
    for (const [id, entry] of Object.entries(registry.entries)) {
      if (!id.endsWith("-cmdc") || entry.real_mission !== "real") continue;
      const missionPath = path.join(process.cwd(), "acceptance", entry.mission);
      const mission = validateMission(parse(await readFile(missionPath, "utf8")));
      expect(mission.id).toBe(`${id.toLowerCase()}-acceptance`);
      if (mission.shape !== "team" || !mission.team) continue;
      expect(mission.team.leader.adapter).toBe("command-code");
      for (const worker of mission.team.workers) expect(worker.adapter).toBe("command-code");
    }
  });

  test("renders the command-code fleet entries in the generated report", async () => {
    const report = await renderAcceptanceReport(process.cwd());
    expect(report).toContain("| C1-cmdc | C1 | Per-worker contracts | unproven | — | command-code | qwen/qwen3.8-flash | — | — |");
    expect(report).toContain("| S3-unknown-cost-cmdc | S3 | Unknown cost admission | unproven | — | command-code | qwen/qwen3.8-flash | — | — |");
    expect(report).toContain("| R10-stall-cmdc | R10 | Stall recovery | fixture_only | — | command-code | qwen/qwen3.8-flash | — | — |");
  });
});

describe("acceptance runtime override honesty", () => {
  test("rewrites every worker and leader adapter and injects the model in the copied team mission", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-override-"));
    const missionPath = path.join(root, "mission.yaml");
    await writeFile(missionPath, [
      "schema_version: uh.mission.v0",
      "id: c1-acceptance",
      "title: Per-worker contracts",
      "workflow_profile: bugfix-contained",
      "objective: Create the declared worker outputs under out/.",
      "shape: team",
      "team:",
      "  resources: { max_parallel: 2 }",
      "  workers:",
      "    - adapter: oh-my-pi",
      "      role: worker-a",
      "      objective: Create out/worker-a.txt containing exactly the single line worker-a, then stop.",
      "      runtime_config_overrides: { thinking: low }",
      "      limits: { max_turns: 12 }",
      "    - adapter: oh-my-pi",
      "      role: worker-b",
      "      objective: Create out/worker-b.txt containing exactly the single line worker-b, then stop.",
      "      runtime_config_overrides: { thinking: low }",
      "      limits: { max_turns: 12 }",
      "  leader: { adapter: oh-my-pi }",
      "",
    ].join("\n"), "utf8");
    await applyTeamMissionOverrides(missionPath, { runtime: "command-code", model: "qwen/qwen3.8-flash" });
    const mission = parse(await readFile(missionPath, "utf8")) as {
      team: {
        leader: { adapter: string };
        workers: { adapter: string; runtime_config_overrides: Record<string, unknown>; limits?: Record<string, unknown> }[];
      };
    };
    expect(mission.team.leader.adapter).toBe("command-code");
    expect(mission.team.workers.map((worker) => worker.adapter)).toEqual(["command-code", "command-code"]);
    for (const worker of mission.team.workers) {
      expect(worker.runtime_config_overrides.model).toBe("qwen/qwen3.8-flash");
      expect(worker.runtime_config_overrides.thinking).toBe("low");
      expect(worker.limits).toEqual({ max_turns: 12 });
    }
  });

  test("wrapper mechanism support follows the effective runtime", () => {
    expect(wrapperMechanismUnavailable("G2", "oh-my-pi")).toBe(false);
    expect(wrapperMechanismUnavailable("G2", "command-code")).toBe(true);
    expect(wrapperMechanismUnavailable("G2-cmdc", "command-code")).toBe(false);
    expect(wrapperMechanismUnavailable("G2-cmdc", "oh-my-pi")).toBe(true);
    expect(wrapperMechanismUnavailable("S3-unknown-cost", "oh-my-pi")).toBe(false);
    expect(wrapperMechanismUnavailable("S3-unknown-cost", "command-code")).toBe(true);
    expect(wrapperMechanismUnavailable("S3-unknown-cost-cmdc", "command-code")).toBe(false);
    expect(wrapperMechanismUnavailable("S3-unknown-cost-cmdc", "oh-my-pi")).toBe(true);
    expect(wrapperMechanismUnavailable("R10-controller-loss", "command-code")).toBe(false);
    expect(wrapperMechanismUnavailable("R10-controller-loss-cmdc", "oh-my-pi")).toBe(false);
    expect(wrapperMechanismUnavailable("C1", "command-code")).toBe(false);
  });

  test("wrapper-dependent capabilities fail with wrapper_unavailable evidence instead of launching", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-wrapper-"));
    await mkdir(path.join(root, "acceptance"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  G2:\n    title: Denial budget\n    capability: G2\n    mission: missions/G2/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed, stop_code: denial_budget, resumed: true, required_records: { denials: 3 } }\n");
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-wrapper-ws-"));
    const evidence = await runAcceptance(root, { workspace, runtime: "command-code", cliPath: "node" });
    expect(evidence).toHaveLength(1);
    expect(evidence[0].outcome).toBe("failed");
    expect(evidence[0].runtime).toBe("command-code");
    expect(evidence[0].observed.reason).toBe("wrapper_unavailable");
    expect(evidence[0].mismatches.map((mismatch) => mismatch.observed)).toContain("wrapper_unavailable");
    expect(evidence[0].run_ids).toEqual([]);
    const persisted = JSON.parse(await readFile(path.join(root, "acceptance", "evidence", "G2", "latest.json"), "utf8")) as { observed: { reason?: string }; outcome: string };
    expect(persisted.outcome).toBe("failed");
    expect(persisted.observed.reason).toBe("wrapper_unavailable");
  });
});
