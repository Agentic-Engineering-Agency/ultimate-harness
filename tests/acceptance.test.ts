import { beforeEach, describe, expect, test, vi } from "vitest";
import { access, lstat, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { spawnSync, type ChildProcess } from "node:child_process";
import type { EventEmitter as NodeEventEmitter } from "node:events";
import { AcceptanceEvidenceSchema, AcceptanceRegistrySchema } from "../src/schema/acceptance.js";
import { validateMission } from "../src/schema/mission.js";
import { applyTeamMissionOverrides, classifyAcceptance, collectFacts, compareAcceptanceFacts, computeAcceptanceInputDigest, loadAcceptanceRegistry, rebindAcceptanceEvidence, renderAcceptanceReport, runAcceptance, wrapperMechanismUnavailable } from "../src/harness/acceptance.js";

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

  test("classifies freshness and commit coherence", async () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect((await classifyAcceptance({ outcome: "passed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "abc" }, 30, now, "abc")).state).toBe("proven");
    expect((await classifyAcceptance({ outcome: "passed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "old" }, 30, now, "abc")).state).toBe("stale");
    expect((await classifyAcceptance({ outcome: "failed", checked_at: "2026-09-14T23:00:00.000Z", harness_commit: "abc" }, 30, now, "abc")).state).toBe("failed");
    expect((await classifyAcceptance(null, 30, now, "abc")).state).toBe("unproven");
  });
  test("renders evidence links relative to the generated report and omits absent evidence links", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-report-"));
    await mkdir(path.join(root, "acceptance", "evidence", "C1"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  C1:\n    title: Per-worker contracts\n    capability: C1\n    mission: missions/C1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n  S1:\n    title: Resource wave baseline\n    capability: S1\n    mission: missions/S1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "C1", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "C1", outcome: "passed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "unknown", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: [], mission_id: "c1", expected: { status: "passed" }, observed: { status: "passed" }, fact_sources: {}, mismatches: [], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"), { evidenceRoot: path.join(root, "acceptance", "evidence") });
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
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"), { evidenceRoot: path.join(root, "acceptance", "evidence") });
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

  const guardAllow = (tool: string): string => JSON.stringify({ ts: "2026-09-22T00:00:00.000Z", tool, class: "allow", target: `src/${tool.toLowerCase()}.ts` });
  const guardDenial = (guardClass: string): string => JSON.stringify({ ts: "2026-09-22T00:00:00.000Z", tool: "Bash", class: guardClass, target: "out/x.txt", reason: guardClass });

  test("reads tool_guard_lines from the run's guard log without a terminal result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-guardlog-"));
    const runDir = path.join(root, ".harness", "missions", "fixture", "runs", "001");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "tool-guard.log"), [guardDenial("write_outside"), guardDenial("git_mutation"), guardDenial("package_install"), ""].join("\n"));
    const expected = { status: "failed", required_records: { tool_guard_lines: 3 } } as const;
    const facts = await collectFacts(root, "fixture", expected);
    expect(facts.observed.tool_guard_lines).toBe(3);
    expect(facts.observed.tool_guard_allow_lines).toBe(0);
    expect(facts.fact_sources.tool_guard_lines).toBe("first");
    expect(compareAcceptanceFacts(expected, facts.observed)).toEqual([{ field: "status", expected: "failed", observed: undefined }]);
  });

  test("counts guard denials and allow lines separately", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-guardlog-"));
    const runDir = path.join(root, ".harness", "missions", "fixture", "runs", "001");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "tool-guard.log"), [
      guardAllow("Read"),
      guardAllow("Glob"),
      guardAllow("Read"),
      guardDenial("git_mutation"),
      guardDenial("package_install"),
      guardDenial("write_outside"),
      "",
    ].join("\n"));
    const facts = await collectFacts(root, "fixture");
    expect(facts.observed.tool_guard_lines).toBe(3);
    expect(facts.observed.tool_guard_allow_lines).toBe(3);
    expect(facts.fact_sources.tool_guard_lines).toBe("first");
    expect(facts.fact_sources.tool_guard_allow_lines).toBe("first");
  });

  test("counts an unparseable guard log line as a denial only when it says deny", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-guardlog-"));
    const runDir = path.join(root, ".harness", "missions", "fixture", "runs", "001");
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "tool-guard.log"), ["not json at all", '{"class":"deny"', ""].join("\n"));
    const facts = await collectFacts(root, "fixture");
    expect(facts.observed.tool_guard_lines).toBe(1);
    expect(facts.observed.tool_guard_allow_lines).toBe(0);
  });

  test("prefers the guard log of the latest run that has one", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-guardlog-"));
    const runsRoot = path.join(root, ".harness", "missions", "fixture", "runs");
    await mkdir(path.join(runsRoot, "001"), { recursive: true });
    await mkdir(path.join(runsRoot, "002"), { recursive: true });
    await writeFile(path.join(runsRoot, "001", "tool-guard.log"), [guardDenial("write_outside"), guardDenial("git_mutation"), guardDenial("package_install"), ""].join("\n"));
    await writeFile(path.join(runsRoot, "002", "tool-guard.log"), [guardDenial("write_outside"), guardDenial("git_mutation"), guardDenial("package_install"), guardDenial("write_outside"), guardDenial("git_mutation")].join("\n"));
    const facts = await collectFacts(root, "fixture");
    expect(facts.runIds).toEqual(["001", "002"]);
    expect(facts.observed.tool_guard_lines).toBe(5);
    expect(facts.fact_sources.tool_guard_lines).toBe("last");
  });

  test("keeps the last available guard log when later runs lack one", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-guardlog-"));
    const runsRoot = path.join(root, ".harness", "missions", "fixture", "runs");
    await mkdir(path.join(runsRoot, "001"), { recursive: true });
    await mkdir(path.join(runsRoot, "002"), { recursive: true });
    await writeFile(path.join(runsRoot, "001", "tool-guard.log"), [guardDenial("write_outside"), guardDenial("git_mutation"), guardDenial("package_install"), ""].join("\n"));
    const facts = await collectFacts(root, "fixture");
    expect(facts.observed.tool_guard_lines).toBe(3);
    expect(facts.observed.tool_guard_allow_lines).toBe(0);
    expect(facts.fact_sources.tool_guard_lines).toBe("first");
  });

  test("renders failed evidence for attempted fixture-only missions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-fixture-"));
    await mkdir(path.join(root, "acceptance", "evidence", "R10-stall"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  R10-stall:\n    title: Stall recovery\n    capability: R10\n    mission: missions/R10-stall/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    real_mission: not_applicable\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "R10-stall", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "R10-stall", outcome: "failed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "abc", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: ["001"], mission_id: "r10", expected: { status: "passed" }, observed: { status: "failed" }, fact_sources: {}, mismatches: [{ field: "status", expected: "passed", observed: "failed" }], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const report = await renderAcceptanceReport(root, new Date("2026-09-15T00:00:00.000Z"), { evidenceRoot: path.join(root, "acceptance", "evidence") });
    expect(report).toContain("| R10-stall | R10 | Stall recovery | failed |");
  });

  test("committed acceptance report is generated from current registry", async () => {
    const emptyEvidence = await mkdtemp(path.join(tmpdir(), "acceptance-empty-evidence-"));
    const report = await renderAcceptanceReport(process.cwd(), new Date(), { evidenceRoot: emptyEvidence });
    const committed = await readFile(path.join(process.cwd(), "docs", "acceptance", "README.md"), "utf8");
    expect(committed.replace(/\r\n/g, "\n")).toBe(report.replace(/\r\n/g, "\n"));
  });
  test("the drift check ignores local evidence while the generator keeps rendering it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-drift-"));
    await mkdir(path.join(root, "acceptance", "evidence", "C1"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "registry.yaml"), "schema_version: uh.acceptance-registry.v0\nentries:\n  C1:\n    title: Per-worker contracts\n    capability: C1\n    mission: missions/C1/mission.yaml\n    shape: single\n    runtime: oh-my-pi\n    expected: { status: passed }\n");
    await writeFile(path.join(root, "acceptance", "evidence", "C1", "latest.json"), JSON.stringify({
      schema_version: "uh.acceptance-evidence.v0", capability: "C1", outcome: "passed", checked_at: "2026-09-15T00:00:00.000Z", harness_commit: "unknown", runtime: "oh-my-pi", provider: "unknown", model: "unknown", cost_usd: "unknown", workspace: "T:/tmp/run", run_ids: [], mission_id: "c1", expected: { status: "passed" }, observed: { status: "passed" }, fact_sources: {}, mismatches: [], artifact_root: "T:/tmp/run/.harness",
    }) + "\n");
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect(await renderAcceptanceReport(root, now, { evidenceRoot: path.join(root, "acceptance", "evidence") })).toContain("| C1 | C1 | Per-worker contracts | proven |");
    const emptyEvidence = await mkdtemp(path.join(tmpdir(), "acceptance-drift-empty-"));
    expect(await renderAcceptanceReport(root, now, { evidenceRoot: emptyEvidence })).toContain("| C1 | C1 | Per-worker contracts | unproven |");
  });
  test("refuses acceptance run without workspace", async () => {
    await expect(runAcceptance(process.cwd())).rejects.toThrow(/--workspace/);
  });
});

describe("acceptance input freshness", () => {
  const identity = { runtime: "command-code", model: "qwen/qwen3.8-flash" };

  function git(cwd: string, args: string[]): string {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout;
  }
  function initRepo(root: string): void {
    git(root, ["init", "--quiet"]);
    git(root, ["config", "core.autocrlf", "false"]);
    git(root, ["config", "user.name", "Acceptance Test"]);
    git(root, ["config", "user.email", "acceptance@test.local"]);
  }
  function commitAll(root: string, message: string): string {
    git(root, ["add", "-A"]);
    git(root, ["commit", "--quiet", "-m", message]);
    return git(root, ["rev-parse", "HEAD"]).trim();
  }
  function legacyEvidence(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      schema_version: "uh.acceptance-evidence.v0",
      capability: "C1-cmdc",
      outcome: "passed",
      checked_at: new Date().toISOString(),
      harness_commit: "unknown",
      runtime: "command-code",
      provider: "command-code",
      model: "qwen/qwen3.8-flash",
      cost_usd: "unknown",
      workspace: "T:/tmp/run",
      run_ids: [],
      mission_id: "c1-cmdc-acceptance",
      expected: { status: "passed" },
      observed: { status: "passed" },
      fact_sources: {},
      mismatches: [],
      artifact_root: "T:/tmp/run/.harness",
      ...overrides,
    };
  }
  async function writeRebindFixture(root: string): Promise<void> {
    await mkdir(path.join(root, "acceptance", "missions", "C1-cmdc"), { recursive: true });
    await mkdir(path.join(root, "src", "harness"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "missions", "C1-cmdc", "mission.yaml"), "id: c1-cmdc-acceptance\n", "utf8");
    await writeFile(path.join(root, "src", "harness", "team-run.ts"), "export const run = 1;\n", "utf8");
    await writeFile(path.join(root, "acceptance", "registry.yaml"), [
      "schema_version: uh.acceptance-registry.v0",
      "entries:",
      "  C1-cmdc:",
      "    title: Per-worker contracts",
      "    capability: C1",
      "    mission: missions/C1-cmdc/mission.yaml",
      "    shape: single",
      "    runtime: command-code",
      "    model: qwen/qwen3.8-flash",
      "    inputs: [src/harness/team-run.ts, acceptance/missions/C1-cmdc/**]",
      "    expected: { status: passed }",
      "",
    ].join("\n"), "utf8");
  }

  test("input digest is stable for identical inputs and changes with content or identity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-digest-"));
    await mkdir(path.join(root, "src", "harness"), { recursive: true });
    await writeFile(path.join(root, "src", "harness", "a.ts"), "export const a = 1;\n", "utf8");
    initRepo(root);
    commitAll(root, "seed");
    const inputs = ["src/**"];
    const first = await computeAcceptanceInputDigest(root, inputs, identity);
    const second = await computeAcceptanceInputDigest(root, inputs, identity);
    expect(first.digest).toBe(second.digest);
    expect(first.resolved).toBe(1);
    expect(first.files).toEqual(["src/harness/a.ts"]);
    await writeFile(path.join(root, "src", "harness", "a.ts"), "export const a = 2;\n", "utf8");
    const changed = await computeAcceptanceInputDigest(root, inputs, identity);
    expect(changed.digest).not.toBe(first.digest);
    const otherRuntime = await computeAcceptanceInputDigest(root, inputs, { ...identity, runtime: "oh-my-pi" });
    expect(otherRuntime.digest).not.toBe(changed.digest);
  });

  test("a change outside the inputs keeps evidence proven while a change inside makes it stale with the file named", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-inside-"));
    await mkdir(path.join(root, "src", "harness"), { recursive: true });
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "src", "harness", "guarded.ts"), "export const guarded = 1;\n", "utf8");
    await writeFile(path.join(root, "docs", "notes.md"), "# Notes\n", "utf8");
    initRepo(root);
    const baseCommit = commitAll(root, "seed");
    const inputs = ["src/harness/**"];
    const digest = await computeAcceptanceInputDigest(root, inputs, identity);
    const evidence = {
      outcome: "passed" as const,
      checked_at: new Date().toISOString(),
      harness_commit: baseCommit,
      input_digest: digest.digest,
      runtime: identity.runtime,
      model: identity.model,
    };
    const now = new Date();
    expect((await classifyAcceptance(evidence, 30, now, baseCommit, { root, inputs })).state).toBe("proven");
    await writeFile(path.join(root, "docs", "notes.md"), "# Notes changed\n", "utf8");
    expect((await classifyAcceptance(evidence, 30, now, baseCommit, { root, inputs })).state).toBe("proven");
    await writeFile(path.join(root, "src", "harness", "guarded.ts"), "export const guarded = 2;\n", "utf8");
    const stale = await classifyAcceptance(evidence, 30, now, baseCommit, { root, inputs });
    expect(stale.state).toBe("stale");
    expect(stale.reasons).toContain("src/harness/guarded.ts");
  });

  test("legacy evidence without an input digest keeps the commit rule", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-legacy-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
    initRepo(root);
    const baseCommit = commitAll(root, "seed");
    const now = new Date();
    const legacy = { outcome: "passed" as const, checked_at: now.toISOString(), harness_commit: baseCommit };
    await writeFile(path.join(root, "src", "a.ts"), "export const a = 2;\n", "utf8");
    expect((await classifyAcceptance(legacy, 30, now, baseCommit, { root, inputs: ["src/**"] })).state).toBe("proven");
    expect((await classifyAcceptance(legacy, 30, now, "different-commit", { root, inputs: ["src/**"] })).state).toBe("stale");
  });

  test("rebind revalidates unchanged legacy evidence against a two-commit repository", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-rebind-"));
    await writeRebindFixture(root);
    initRepo(root);
    const baseCommit = commitAll(root, "seed inputs");
    await writeFile(path.join(root, "src", "harness", "other.ts"), "export const other = 1;\n", "utf8");
    commitAll(root, "change outside the inputs");
    const evidenceDir = path.join(root, "acceptance", "evidence", "C1-cmdc");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, "latest.json"), JSON.stringify(legacyEvidence({ harness_commit: baseCommit })) + "\n", "utf8");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { logs.push(String(line)); });
    let outcomes: Awaited<ReturnType<typeof rebindAcceptanceEvidence>>;
    try {
      outcomes = await rebindAcceptanceEvidence(root);
    } finally {
      logSpy.mockRestore();
    }
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("rebound");
    const rebound = JSON.parse(await readFile(path.join(evidenceDir, "latest.json"), "utf8")) as { input_digest?: string; inputs_resolved?: number; rebound_from_commit?: string };
    expect(rebound.input_digest).toBeTypeOf("string");
    expect(rebound.inputs_resolved).toBe(2);
    expect(rebound.rebound_from_commit).toBe(baseCommit);
    expect(logs.some((line) => line.startsWith("rebound C1-cmdc"))).toBe(true);
  });

  test("rebind reports changed inputs instead of revalidating", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-rebind-changed-"));
    await writeRebindFixture(root);
    initRepo(root);
    const baseCommit = commitAll(root, "seed inputs");
    await writeFile(path.join(root, "src", "harness", "team-run.ts"), "export const run = 2;\n", "utf8");
    commitAll(root, "change inside the inputs");
    const evidenceDir = path.join(root, "acceptance", "evidence", "C1-cmdc");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, "latest.json"), JSON.stringify(legacyEvidence({ harness_commit: baseCommit })) + "\n", "utf8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let outcomes: Awaited<ReturnType<typeof rebindAcceptanceEvidence>>;
    try {
      outcomes = await rebindAcceptanceEvidence(root);
    } finally {
      logSpy.mockRestore();
    }
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe("changed");
    expect(outcomes[0].changed).toContain("src/harness/team-run.ts");
    const unchanged = JSON.parse(await readFile(path.join(evidenceDir, "latest.json"), "utf8")) as { input_digest?: string };
    expect(unchanged.input_digest).toBeUndefined();
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
    const emptyEvidence = await mkdtemp(path.join(tmpdir(), "acceptance-fleet-evidence-"));
    const report = await renderAcceptanceReport(process.cwd(), new Date(), { evidenceRoot: emptyEvidence });
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
    expect(evidence[0].cli).toEqual({ exit_code: null, stderr_tail: "", stdout_tail: "" });
    const persisted = JSON.parse(await readFile(path.join(root, "acceptance", "evidence", "G2", "latest.json"), "utf8")) as { observed: { reason?: string }; outcome: string; cli?: { exit_code?: number | null } };
    expect(persisted.outcome).toBe("failed");
    expect(persisted.observed.reason).toBe("wrapper_unavailable");
    expect(persisted.cli?.exit_code).toBeNull();
  });
});

const spawnState = vi.hoisted(() => ({
  calls: [] as { args: string[]; env: NodeJS.ProcessEnv | undefined }[],
  missionScripts: [] as { code: number; stdout?: string; stderr?: string; resultFile?: string }[],
  blockedNodeModules: new Set<string>(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const { EventEmitter } = await import("node:events");
  const { writeFileSync } = await import("node:fs");
  const nodePath = await import("node:path");
  const spawn = (...spawnArgs: unknown[]) => {
    const [, args, options] = spawnArgs as [string, string[], { env?: NodeJS.ProcessEnv } | undefined];
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    }) as unknown as ChildProcess & { stdout: NodeEventEmitter; stderr: NodeEventEmitter };
    spawnState.calls.push({ args: [...args], env: options?.env ? { ...options.env } : undefined });
    const script = args[1] === "mission" ? spawnState.missionScripts.shift() : undefined;
    queueMicrotask(() => {
      if (script?.resultFile && args[2] === "run" && typeof args[3] === "string" && args[3].endsWith("mission.yaml")) {
        writeFileSync(nodePath.join(nodePath.dirname(args[3]), "runtime-result.yaml"), script.resultFile, "utf8");
      }
      if (script?.stdout !== undefined) child.stdout.emit("data", script.stdout);
      if (script?.stderr !== undefined) child.stderr.emit("data", script.stderr);
      child.emit("close", script ? script.code : 0, null);
    });
    return child;
  };
  return { ...actual, spawn };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const stat = actual.stat;
  const mockedStat = ((value: unknown, options?: unknown) =>
    typeof value === "string" && spawnState.blockedNodeModules.has(value)
      ? Promise.reject(Object.assign(new Error(`ENOENT: no such file or directory, stat ${value}`), { code: "ENOENT" }))
      : stat(value as Parameters<typeof stat>[0], options as never)) as typeof stat;
  return { ...actual, stat: mockedStat };
});

beforeEach(() => {
  spawnState.calls.length = 0;
  spawnState.missionScripts.length = 0;
  spawnState.blockedNodeModules.clear();
});

describe("acceptance support shim PATH", () => {
  test("prepends the copied support directory to PATH only for the support_shim entry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-shim-"));
    for (const name of ["shim", "plain"]) {
      await mkdir(path.join(root, "acceptance", "missions", name), { recursive: true });
      await writeFile(
        path.join(root, "acceptance", "missions", name, "mission.yaml"),
        ["schema_version: uh.mission.v0", "id: shim-fixture", "title: Fixture", "workflow_profile: bugfix-contained", "objective: Create out/report.txt.", ""].join("\n"),
        "utf8",
      );
    }
    await writeFile(path.join(root, "acceptance", "registry.yaml"), [
      "schema_version: uh.acceptance-registry.v0",
      "entries:",
      "  G1-cmdc-hook-broken:",
      "    title: Command Code broken guard hook",
      "    capability: G1",
      "    mission: missions/shim/mission.yaml",
      "    shape: single",
      "    runtime: command-code",
      "    support_shim: cmdc.cmd",
      "    expected: { status: failed, stop_code: policy, resumed: false, required_records: { guard_armed: false } }",
      "  G1-cmdc-shell-policy:",
      "    title: Command Code shell protected-path policy",
      "    capability: G1",
      "    mission: missions/plain/mission.yaml",
      "    shape: single",
      "    runtime: command-code",
      "    expected: { status: failed, stop_code: policy, resumed: false, required_records: { guard_armed: true } }",
      "",
    ].join("\n"), "utf8");
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-shim-ws-"));
    const evidence = await runAcceptance(root, { workspace, cliPath: "node" });
    expect(evidence).toHaveLength(2);
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    const launches = spawnState.calls.filter((call) => call.args[1] === "mission" && call.args[2] === "run");
    expect(launches).toHaveLength(2);
    const launchFor = (runRoot: string) => launches.find((call) => call.args.includes(runRoot));
    const shimLaunch = launchFor(evidence[0].workspace);
    const plainLaunch = launchFor(evidence[1].workspace);
    expect(shimLaunch).toBeDefined();
    expect(plainLaunch).toBeDefined();
    expect(shimLaunch?.env?.[pathKey]).toBe(`${path.join(evidence[0].workspace, "acceptance", "support")}${path.delimiter}${process.env[pathKey] ?? ""}`);
    expect(plainLaunch?.env?.[pathKey]).toBe(process.env[pathKey]);
    expect(evidence[0].observed.shim_on_path).toBe(true);
    expect(evidence[1].observed.shim_on_path).toBeUndefined();
  });
});

describe("G1-cmdc runner registration", () => {
  test("only the hook-broken entry declares the cmdc.cmd support shim", async () => {
    const registry = await loadAcceptanceRegistry(process.cwd());
    const declaring = Object.entries(registry.entries).filter(([, entry]) => entry.support_shim !== undefined).map(([id]) => id);
    expect(declaring).toEqual(["G1-cmdc-hook-broken"]);
    expect(registry.entries["G1-cmdc-hook-broken"].support_shim).toBe("cmdc.cmd");
  });

  test("G1-cmdc-guard budget fits the model while expectations stay untouched", async () => {
    const registry = await loadAcceptanceRegistry(process.cwd());
    const entry = registry.entries["G1-cmdc-guard"];
    expect(entry.expected).toEqual({
      status: "passed",
      required_files: ["out/cmdc-guard-report.txt"],
      required_records: { denials: 3, tool_guard_lines: 3 },
    });
    expect(entry.notes).toContain("20260922T040135Z-6c706a");
    expect(entry.notes).toContain("48");
    expect(entry.notes).toMatch(/not changed/);
    const mission = parse(await readFile(path.join(process.cwd(), "acceptance", entry.mission), "utf8")) as { runtime_config_overrides?: { max_turns?: number; limits?: { max_turns?: number } } };
    expect(mission.runtime_config_overrides?.max_turns).toBe(40);
    expect(mission.runtime_config_overrides?.limits?.max_turns).toBe(40);
  });
});

describe("acceptance campaign runtime", () => {
  const fixtureMission = ["schema_version: uh.mission.v0", "id: fixture-acceptance", "title: Fixture", "workflow_profile: bugfix-contained", "objective: Create out/report.txt.", ""].join("\n");

  async function writeSingleFixture(root: string, capability: string, runtime: string): Promise<void> {
    await mkdir(path.join(root, "acceptance", "missions", capability), { recursive: true });
    await writeFile(path.join(root, "acceptance", "missions", capability, "mission.yaml"), fixtureMission, "utf8");
    await writeFile(path.join(root, "acceptance", "registry.yaml"), [
      "schema_version: uh.acceptance-registry.v0",
      "entries:",
      `  ${capability}:`,
      "    title: Fixture",
      `    capability: ${capability}`,
      `    mission: missions/${capability}/mission.yaml`,
      "    shape: single",
      `    runtime: ${runtime}`,
      "    expected: { status: passed }",
      "",
    ].join("\n"), "utf8");
  }

  test("records the mission CLI outcome and surfaces stderr on FAIL when no status is observed", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-cli-"));
    await mkdir(path.join(root, "acceptance", "missions", "C2"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "missions", "C2", "mission.yaml"), fixtureMission, "utf8");
    await writeFile(path.join(root, "acceptance", "registry.yaml"), [
      "schema_version: uh.acceptance-registry.v0",
      "entries:",
      "  C1:",
      "    title: First",
      "    capability: C1",
      "    mission: missions/C1/mission.yaml",
      "    shape: single",
      "    runtime: command-code",
      "    expected: { status: passed }",
      "  C2:",
      "    title: Second",
      "    capability: C2",
      "    mission: missions/C2/mission.yaml",
      "    shape: single",
      "    runtime: command-code",
      "    expected: { status: passed }",
      "",
    ].join("\n"), "utf8");
    await mkdir(path.join(root, "acceptance", "missions", "C1"), { recursive: true });
    await writeFile(path.join(root, "acceptance", "missions", "C1", "mission.yaml"), fixtureMission, "utf8");
    const stderr = `Error: Cannot find package 'commander'\n${"x".repeat(2100)}\n`;
    spawnState.missionScripts.push({ code: 1, stderr }, { code: 1, stderr, resultFile: "status: passed\n" });
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { logs.push(String(line)); });
    let evidence: Awaited<ReturnType<typeof runAcceptance>>;
    try {
      const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-cli-ws-"));
      evidence = await runAcceptance(root, { workspace, cliPath: "node" });
    } finally {
      logSpy.mockRestore();
    }
    expect(evidence).toHaveLength(2);
    expect(evidence[0].observed.status).toBeUndefined();
    expect(evidence[0].cli).toEqual({ exit_code: 1, stderr_tail: stderr.slice(-2048), stdout_tail: "" });
    expect(evidence[0].cli?.stderr_tail).toHaveLength(2048);
    expect(evidence[1].observed.status).toBe("failed");
    const failLines = logs.filter((line) => line.startsWith("FAIL "));
    expect(failLines).toHaveLength(2);
    expect(failLines[0].endsWith("Error: Cannot find package 'commander'")).toBe(true);
    expect(failLines[1].endsWith("Error: Cannot find package 'commander'")).toBe(false);
    const persisted = JSON.parse(await readFile(path.join(root, "acceptance", "evidence", "C1", "latest.json"), "utf8")) as { cli?: { exit_code?: number; stderr_tail?: string } };
    expect(persisted.cli?.exit_code).toBe(1);
    expect(persisted.cli?.stderr_tail).toBe(stderr.slice(-2048));
  });

  test("recreates a dangling campaign node_modules junction instead of reusing it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-junction-"));
    await mkdir(path.join(root, "dist"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await writeFile(path.join(root, "dist", "cli.js"), "process.exit(0);\n", "utf8");
    await writeFile(path.join(root, "src", "index.js"), "export {};\n", "utf8");
    await writeFile(path.join(root, "node_modules", ".marker"), "source\n", "utf8");
    await writeSingleFixture(root, "C1", "command-code");
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-junction-ws-"));
    await runAcceptance(root, { workspace });
    const junction = path.join(workspace, ".acceptance-runtime", "node_modules");
    expect((await lstat(junction)).isSymbolicLink()).toBe(true);
    await expect(readFile(path.join(junction, ".marker"), "utf8")).resolves.toBe("source\n");
    await rm(junction, { recursive: true, force: true });
    await symlink(path.join(root, "node_modules-missing"), junction, "junction");
    await expect(stat(junction)).rejects.toMatchObject({ code: "ENOENT" });
    await runAcceptance(root, { workspace });
    await expect(readFile(path.join(junction, ".marker"), "utf8")).resolves.toBe("source\n");
  });

  test("refuses loudly with exit 2 when no node_modules exists above the source root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-nonodes-"));
    await writeSingleFixture(root, "C1", "command-code");
    let current = path.resolve(root);
    for (;;) {
      spawnState.blockedNodeModules.add(path.join(current, "node_modules"));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined): never => {
      throw new Error(`process.exit(${code})`);
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-nonodes-ws-"));
      await expect(runAcceptance(root, { workspace })).rejects.toThrow("process.exit(2)");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(path.resolve(root)));
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("sets git core.longpaths at workspace init on Windows only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "acceptance-longpaths-"));
    await writeSingleFixture(root, "C1", "command-code");
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-longpaths-ws-"));
    await runAcceptance(root, { workspace, cliPath: "node" });
    const longpathsCalls = spawnState.calls.filter((call) => call.args.includes("core.longpaths"));
    if (process.platform === "win32") {
      expect(longpathsCalls.map((call) => call.args)).toContainEqual(["config", "core.longpaths", "true"]);
    } else {
      expect(longpathsCalls).toHaveLength(0);
    }
  });

  test.skipIf(process.platform !== "win32")("costless-wrapper-cmdc spawns a .cmd shim through its node entry point", async () => {
    const shimDir = await mkdtemp(path.join(tmpdir(), "acceptance-cmdc-"));
    await writeFile(path.join(shimDir, "stub-cmdc.mjs"), [
      "process.stdout.write(JSON.stringify({ usage: { command: 'stub' }, args: process.argv.slice(2) }) + '\\n');",
      "process.exit(3);",
      "",
    ].join("\n"), "utf8");
    await writeFile(path.join(shimDir, "cmdc.cmd"), '@ECHO off\r\n"%dp0%\\stub-cmdc.mjs" %*\r\n', "utf8");
    const wrapper = path.join(process.cwd(), "acceptance", "support", "costless-wrapper-cmdc.mjs");
    const result = spawnSync(process.execPath, [wrapper, "--root", shimDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    expect(result.status).toBe(3);
    expect(result.stdout?.trim()).toBe(JSON.stringify({ args: ["--root", shimDir] }));
  });
});
