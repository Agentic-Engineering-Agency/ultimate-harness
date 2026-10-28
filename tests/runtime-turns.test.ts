import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { countRuntimeTurns } from "../src/harness/runtime-turns.js";
import { RuntimeSupervision } from "../src/harness/runtime-supervision.js";
import {
  listLiveRuns,
  formatLiveRuns,
  registerLiveRun,
  type NativeProcess,
} from "../src/harness/live-runs.js";

function parseNdjson(content: string): unknown[] {
  return content
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
}

describe("runtime-turns", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), "uh-turns-test-"));
    await mkdir(path.join(projectRoot, ".harness"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".harness", "project.yaml"),
      stringifyYaml({ schema_version: "uh.project.v0", project_id: "test-proj" }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  // Note: acp.ndjson is protocol-shaped, not a recording.
  test("countRuntimeTurns gives 9 for Claude fixture and exact expected count for ACP fixture", () => {
    const claudeEvents = parseNdjson(
      readFileSync("tests/fixtures/runtime-turns/claude-code.ndjson", "utf8"),
    );
    const acpEvents = parseNdjson(
      readFileSync("tests/fixtures/runtime-turns/acp.ndjson", "utf8"),
    );

    const claudeTurns = countRuntimeTurns("claude-code", claudeEvents);
    const acpTurns = countRuntimeTurns("acp", acpEvents);

    expect(claudeTurns).toBe(9);
    expect(acpTurns).toBe(2);
  });

  test("feeding the Claude fixture through RuntimeSupervision.observe gives turns 9", () => {
    const claudeEvents = parseNdjson(
      readFileSync("tests/fixtures/runtime-turns/claude-code.ndjson", "utf8"),
    );
    const supervisor = new RuntimeSupervision({}, 1000);
    let t = 1000;
    for (const ev of claudeEvents) {
      supervisor.observe(ev, t);
      t += 10;
    }
    expect(supervisor.turns).toBe(9);
  });

  test("a temp project with a registry entry and a run dir holding runtime-control.json turns 0 plus a digest or events shows the right turns in listLiveRuns and formatLiveRuns", async () => {
    const runId = "20260923T000000Z-test01";
    const missionId = "m-test";
    const runDir = path.join(projectRoot, ".harness", "missions", missionId, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const claudeNdjson = readFileSync("tests/fixtures/runtime-turns/claude-code.ndjson", "utf8");
    await writeFile(path.join(runDir, "events.ndjson"), claudeNdjson, "utf8");

    await writeFile(
      path.join(runDir, "runtime-control.json"),
      JSON.stringify({
        schema_version: "uh.runtime-control.v0",
        mission_id: missionId,
        run_id: runId,
        runtime: "claude-code",
        controller_pid: 12345,
        started_at: "2026-09-23T00:00:00.000Z",
        heartbeat_at: "2026-09-23T00:00:01.000Z",
        status: "running",
        turns: 0,
        denials: 0,
        inflight_tools: 0,
      }),
      "utf8",
    );

    await registerLiveRun({
      projectRoot,
      artifactRoot: projectRoot,
      runId,
      missionId,
      runtime: "claude-code",
      controllerPid: 12345,
      startedAt: "2026-09-23T00:00:00.000Z",
    });

    const mockProcesses: NativeProcess[] = [
      { pid: 12345, ppid: 1, name: "node", command: "node runner.js" },
    ];

    const { records } = await listLiveRuns(projectRoot, {
      processes: mockProcesses,
      persist: false,
    });

    expect(records.length).toBe(1);
    expect(records[0].turns).toBe(9);

    const formatted = formatLiveRuns(records);
    expect(formatted).toContain("turns=9");
  });

  test("an ACP-shaped run dir with runtime-session.yaml runtime acp, events.ndjson and no runtime-control.json shows the ACP count", async () => {
    const runId = "20260923T000000Z-acp001";
    const missionId = "m-acp";
    const runDir = path.join(projectRoot, ".harness", "missions", missionId, "runs", runId);
    await mkdir(runDir, { recursive: true });

    await writeFile(
      path.join(runDir, "runtime-session.yaml"),
      stringifyYaml({
        schema_version: "uh.runtime-session.v0",
        mission_id: missionId,
        runtime: "acp",
        status: "running",
        started_at: "2026-09-23T00:00:00.000Z",
      }),
      "utf8",
    );

    const acpNdjson = readFileSync("tests/fixtures/runtime-turns/acp.ndjson", "utf8");
    await writeFile(path.join(runDir, "events.ndjson"), acpNdjson, "utf8");

    await registerLiveRun({
      projectRoot,
      artifactRoot: projectRoot,
      runId,
      missionId,
      runtime: "unknown",
      controllerPid: 23456,
      startedAt: "2026-09-23T00:00:00.000Z",
    });

    const mockProcesses: NativeProcess[] = [
      { pid: 23456, ppid: 1, name: "node", command: "node runner.js" },
    ];

    const { records } = await listLiveRuns(projectRoot, {
      processes: mockProcesses,
      persist: false,
    });

    expect(records.length).toBe(1);
    expect(records[0].turns).toBe(2);
  });

  test("a run of another runtime with control turns 5 keeps 5", async () => {
    const runId = "20260923T000000Z-other01";
    const missionId = "m-other";
    const runDir = path.join(projectRoot, ".harness", "missions", missionId, "runs", runId);
    await mkdir(runDir, { recursive: true });

    await writeFile(
      path.join(runDir, "runtime-control.json"),
      JSON.stringify({
        schema_version: "uh.runtime-control.v0",
        mission_id: missionId,
        run_id: runId,
        runtime: "codex",
        controller_pid: 34567,
        started_at: "2026-09-23T00:00:00.000Z",
        heartbeat_at: "2026-09-23T00:00:01.000Z",
        status: "running",
        turns: 5,
        denials: 0,
        inflight_tools: 0,
      }),
      "utf8",
    );

    await registerLiveRun({
      projectRoot,
      artifactRoot: projectRoot,
      runId,
      missionId,
      runtime: "codex",
      controllerPid: 34567,
      startedAt: "2026-09-23T00:00:00.000Z",
    });

    const mockProcesses: NativeProcess[] = [
      { pid: 34567, ppid: 1, name: "node", command: "node runner.js" },
    ];

    const { records } = await listLiveRuns(projectRoot, {
      processes: mockProcesses,
      persist: false,
    });

    expect(records.length).toBe(1);
    expect(records[0].turns).toBe(5);
  });
});
