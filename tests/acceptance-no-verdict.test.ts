import { describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runAcceptance, summarizeAcceptanceCampaign } from "../src/harness/acceptance.js";
import type { AcceptanceCommandRunner, AcceptanceEvidenceRecord } from "../src/harness/acceptance.js";

const fixtureMission = ["schema_version: uh.mission.v0", "id: fixture-acceptance", "title: Fixture", "workflow_profile: bugfix-contained", "objective: Create out/report.txt.", ""].join("\n");
const fakeRunner: AcceptanceCommandRunner = async () => ({ code: 0, stdout: "", stderr: "" });

/** A temp source root with an `acceptance/registry.yaml` and its mission files. */
async function writeSourceRoot(registry: string, missions: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "acceptance-nv-src-"));
  await mkdir(path.join(root, "acceptance"), { recursive: true });
  await writeFile(path.join(root, "acceptance", "registry.yaml"), registry, "utf8");
  for (const [relative, content] of Object.entries(missions)) {
    const file = path.join(root, "acceptance", relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
  return root;
}

/** A temp fake mission CLI: `node <script> mission run ...` exits without a real runtime. */
async function writeCliScript(body: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "acceptance-nv-cli-"));
  const file = path.join(directory, "cli.cjs");
  await writeFile(file, body, "utf8");
  return file;
}

function registryFor(entries: { capability: string; mission: string }[]): string {
  return [
    "schema_version: uh.acceptance-registry.v0",
    "entries:",
    ...entries.flatMap(({ capability, mission }) => [
      `  ${capability}:`,
      "    title: No verdict",
      `    capability: ${capability}`,
      `    mission: ${mission}`,
      "    shape: single",
      "    runtime: oh-my-pi",
      "    expected: { status: passed }",
    ]),
    "",
  ].join("\n");
}

describe("acceptance no-verdict", () => {
  test("a run that writes no record fails with no_verdict and a verdict mismatch", async () => {
    const sourceRoot = await writeSourceRoot(registryFor([{ capability: "C1", mission: "missions/C1/mission.yaml" }]), { "missions/C1/mission.yaml": fixtureMission });
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-nv-ws-"));
    const cliPath = await writeCliScript("process.exitCode = 0;\n");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { logs.push(String(line)); });
    let evidence: AcceptanceEvidenceRecord[];
    try {
      evidence = await runAcceptance(sourceRoot, { workspace, cliPath, commandRunner: fakeRunner });
    } finally {
      logSpy.mockRestore();
    }
    expect(evidence).toHaveLength(1);
    expect(evidence[0].outcome).toBe("failed");
    expect(evidence[0].observed.status).toBe("failed");
    expect(evidence[0].observed.reason).toBe("no_verdict");
    expect(evidence[0].run_ids).toEqual([]);
    const verdict = evidence[0].mismatches.find((mismatch) => mismatch.field === "verdict");
    expect(verdict?.expected).toBe("a settled run record");
    expect(verdict?.observed).toBe("mission CLI exited 0 with no run record");
    expect(logs.some((line) => line.startsWith("FAIL C1") && line.includes("no verdict: mission CLI exited 0 with no run record"))).toBe(true);
    expect(logs).toContain("SUMMARY passed 0 failed 1 not_applicable 0");
    const persisted = JSON.parse(await readFile(path.join(sourceRoot, "acceptance", "evidence", "C1", "latest.json"), "utf8")) as AcceptanceEvidenceRecord;
    expect(persisted.outcome).toBe("failed");
    expect(persisted.observed.status).toBe("failed");
    expect(persisted.observed.reason).toBe("no_verdict");
    expect(persisted.mismatches.some((mismatch) => mismatch.field === "verdict")).toBe(true);
  });

  test("the first stderr line becomes the no-verdict cause", async () => {
    const sourceRoot = await writeSourceRoot(registryFor([{ capability: "C1", mission: "missions/C1/mission.yaml" }]), { "missions/C1/mission.yaml": fixtureMission });
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-nv-ws-"));
    const cliPath = await writeCliScript("process.stderr.write(\"boom: no record\\n\");\nprocess.exitCode = 0;\n");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { logs.push(String(line)); });
    let evidence: AcceptanceEvidenceRecord[];
    try {
      evidence = await runAcceptance(sourceRoot, { workspace, cliPath, commandRunner: fakeRunner });
    } finally {
      logSpy.mockRestore();
    }
    expect(evidence).toHaveLength(1);
    expect(evidence[0].outcome).toBe("failed");
    expect(evidence[0].observed.reason).toBe("no_verdict");
    const verdict = evidence[0].mismatches.find((mismatch) => mismatch.field === "verdict");
    expect(verdict?.observed).toBe("boom: no record");
    expect(logs.some((line) => line.includes("no verdict: boom: no record"))).toBe(true);
  });

  test("summarizeAcceptanceCampaign counts outcomes and lists each failure reason", () => {
    const results: Parameters<typeof summarizeAcceptanceCampaign>[0] = [
      { capability: "A", outcome: "passed", observed: { status: "passed" }, mismatches: [] },
      { capability: "B", outcome: "failed", observed: { status: "failed", reason: "no_verdict" }, mismatches: [] },
      { capability: "C", outcome: "failed", observed: { status: "failed" }, mismatches: [{ field: "status", expected: "passed", observed: "failed" }] },
    ];
    expect(summarizeAcceptanceCampaign(results, ["F1", "F2"])).toEqual({
      passed: 1,
      failed: 2,
      not_applicable: 2,
      failures: [
        { capability: "B", reason: "no_verdict" },
        { capability: "C", reason: "status: expected \"passed\" observed \"failed\"" },
      ],
    });
  });

  test("a setup error fails one entry with runner_error and the next entry still runs", async () => {
    const sourceRoot = await writeSourceRoot(
      registryFor([
        { capability: "A-bad", mission: "missions/A-bad/mission.yaml" },
        { capability: "C1", mission: "missions/C1/mission.yaml" },
      ]),
      { "missions/C1/mission.yaml": fixtureMission },
    );
    const workspace = await mkdtemp(path.join(tmpdir(), "acceptance-nv-ws-"));
    const cliPath = await writeCliScript("process.exitCode = 0;\n");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((line?: unknown) => { logs.push(String(line)); });
    let evidence: AcceptanceEvidenceRecord[];
    try {
      evidence = await runAcceptance(sourceRoot, { workspace, cliPath, commandRunner: fakeRunner });
    } finally {
      logSpy.mockRestore();
    }
    expect(evidence).toHaveLength(2);
    expect(evidence[0].capability).toBe("A-bad");
    expect(evidence[0].outcome).toBe("failed");
    expect(evidence[0].observed.reason).toBe("runner_error");
    expect(evidence[0].mismatches[0]).toMatchObject({ field: "runner", expected: "entry ran" });
    expect(evidence[0].cli?.exit_code).toBeNull();
    expect(evidence[1].capability).toBe("C1");
    expect(evidence[1].observed.reason).toBe("no_verdict");
    expect(logs.some((line) => line.startsWith("FAIL A-bad — runner_error:"))).toBe(true);
    expect(logs).toContain("SUMMARY passed 0 failed 2 not_applicable 0");
    const persisted = JSON.parse(await readFile(path.join(sourceRoot, "acceptance", "evidence", "A-bad", "latest.json"), "utf8")) as AcceptanceEvidenceRecord;
    expect(persisted.observed.reason).toBe("runner_error");
    expect(persisted.cli?.exit_code).toBeNull();
  });
});
