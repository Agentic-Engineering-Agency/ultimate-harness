import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  claimLiveRun,
  discoverRuns,
  formatLiveRuns,
  isSettled,
  liveRunCounts,
  liveRunsDir,
  liveRunsExitCode,
  liveness,
  listLiveRuns,
  processChildren,
  registerLiveRun,
  settleLiveRun,
  teamFromArtifactRoot,
  type LiveRunRecord,
  type NativeProcess,
} from "../src/harness/live-runs.js";
import { claimRuntimeAttempt } from "../src/harness/runtime-attempt.js";
import type { MissionArtifactContext } from "../src/adapters/_artifact-context.js";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const iso = (milliseconds: number): string => new Date(milliseconds).toISOString();

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(path.join(tmpdir(), "uh-live-runs-"));
  await mkdir(path.join(ROOT, ".harness"), { recursive: true });
  await writeFile(
    path.join(ROOT, ".harness", "project.yaml"),
    "schema_version: uh.project.v0\nname: live-runs fixture\n",
    "utf-8",
  );
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ helpers */

function artifactsFor(artifactRoot: string, missionId: string, runId: string): MissionArtifactContext {
  const missionDir = path.join(artifactRoot, ".harness", "missions", missionId);
  const runDir = path.join(missionDir, "runs", runId);
  return {
    missionDir,
    runDir,
    promptPath: path.join(runDir, "prompt.md"),
    runtimeSessionPath: path.join(runDir, "runtime-session.yaml"),
    eventsPath: path.join(runDir, "events.ndjson"),
    stdoutPath: path.join(runDir, "runtime.stdout.log"),
    stderrPath: path.join(runDir, "runtime.stderr.log"),
    diffPath: path.join(runDir, "diff.patch"),
    runtimeResultPath: path.join(runDir, "runtime-result.yaml"),
    finalMessagePath: path.join(runDir, "runtime-final.txt"),
  };
}

function controlPayload(
  missionId: string,
  runId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: "uh.runtime-control.v0",
    mission_id: missionId,
    run_id: runId,
    runtime: "oh-my-pi",
    controller_pid: 4242,
    started_at: iso(NOW - 60_000),
    heartbeat_at: iso(NOW - 2_000),
    status: "running",
    turns: 3,
    denials: 1,
    inflight_tools: 1,
    ...overrides,
  };
}

async function seedControl(
  artifactRoot: string,
  missionId: string,
  runId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const runDir = path.join(artifactRoot, ".harness", "missions", missionId, "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(
    path.join(runDir, "runtime-control.json"),
    JSON.stringify(controlPayload(missionId, runId, overrides)),
    "utf-8",
  );
  return runDir;
}

function processes(list: Array<Partial<NativeProcess> & { pid: number; ppid: number }>): NativeProcess[] {
  return list.map((entry) => ({
    pid: entry.pid,
    ppid: entry.ppid,
    name: entry.name ?? "node.exe",
    command: entry.command ?? "node",
  }));
}

async function readEntry(runId: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(liveRunsDir(ROOT), `${runId}.json`), "utf-8")) as Record<string, unknown>;
}

function record(overrides: Partial<LiveRunRecord> = {}): LiveRunRecord {
  return {
    source: "registry",
    run_id: "run",
    mission_id: "mission",
    runtime: "oh-my-pi",
    artifact_root: ".",
    control_path: ".harness/missions/mission/runs/run/runtime-control.json",
    controller_pid: 4242,
    started_at: iso(NOW - 60_000),
    status: "running",
    heartbeat_at: iso(NOW - 1_000),
    ...overrides,
  };
}

/* ----------------------------------------------------------------- registry */

describe("live-run registry", () => {
  test("claimRuntimeAttempt registers a plain run under the project root", async () => {
    const runId = "20260922T100000Z-aaaaaa";
    const artifacts = artifactsFor(ROOT, "plain", runId);
    await mkdir(artifacts.runDir, { recursive: true });

    await claimRuntimeAttempt(artifacts);

    const entry = await readEntry(runId);
    expect(entry).toMatchObject({
      schema_version: "uh.live-run.v0",
      run_id: runId,
      mission_id: "plain",
      runtime: "unknown",
      artifact_root: ".",
      control_path: `.harness/missions/plain/runs/${runId}/runtime-control.json`,
    });
    expect(entry.controller_pid).toBe(process.pid);
    expect(entry.team).toBeUndefined();
    expect(typeof entry.started_at).toBe("string");
  });

  test("a worker under a team artifact root registers with its team and role", async () => {
    const runId = "20260922T100100Z-bbbbbb";
    const artifactRoot = path.join(
      ROOT, ".harness", "missions", "wave", "team", "artifacts", "parent-run", "workers", "backend",
    );
    const artifacts = artifactsFor(artifactRoot, "wave", runId);
    await mkdir(artifacts.runDir, { recursive: true });

    await claimRuntimeAttempt(artifacts);

    const entry = await readEntry(runId);
    expect(entry.team).toEqual({ mission_id: "wave", role: "backend" });
    expect(entry.artifact_root).toBe(".harness/missions/wave/team/artifacts/parent-run/workers/backend");
  });

  test("claimLiveRun honours an explicit project root and derives team from the path", async () => {
    const runId = "20260922T100150Z-bbbbb1";
    const artifactRoot = path.join(ROOT, ".harness", "missions", "wave", "team", "artifacts", "p", "workers", "frontend");
    const artifacts = artifactsFor(artifactRoot, "wave", runId);
    await mkdir(artifacts.runDir, { recursive: true });
    await claimLiveRun(artifacts, { projectRoot: ROOT, runtime: "codex", model: "gpt-5" });
    const entry = await readEntry(runId);
    expect(entry).toMatchObject({ runtime: "codex", model: "gpt-5", team: { mission_id: "wave", role: "frontend" } });
  });

  test("claimLiveRun is a no-op when no ancestor holds .harness/project.yaml", async () => {
    const isolated = await mkdtemp(path.join(tmpdir(), "uh-live-runs-noroot-"));
    try {
      const runId = "20260922T100151Z-cccccc";
      const artifacts = artifactsFor(isolated, "plain", runId);
      await mkdir(artifacts.runDir, { recursive: true });
      await claimLiveRun(artifacts);
      await expect(readFile(path.join(isolated, ".harness", "live-runs", `${runId}.json`)))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });

  test("settleLiveRun stamps status, stop code, and settled_at", async () => {
    const runId = "20260922T100200Z-dddddd";
    await seedControl(ROOT, "plain", runId, { status: "running" });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "plain", runtime: "oh-my-pi" });

    await settleLiveRun(ROOT, runId, { status: "failed", stop_code: "stall", settled_at: iso(NOW) });

    const entry = await readEntry(runId);
    expect(entry).toMatchObject({ status: "failed", stop_code: "stall", settled_at: iso(NOW) });
  });

  test("settleLiveRun is a no-op without a registry entry", async () => {
    await expect(settleLiveRun(ROOT, "20260922T100201Z-eeeeee", { status: "failed" })).resolves.toBeUndefined();
  });
});

/* ---------------------------------------------------------------- discovery */

describe("discoverRuns", () => {
  test("merges runtime-control facts and the events tail over the registry", async () => {
    const runId = "20260922T100300Z-aaaaa1";
    const runDir = await seedControl(ROOT, "plain", runId, {
      runtime: "command-code",
      controller_pid: 7777,
      turns: 7,
      denials: 2,
      inflight_tools: 1,
      session_id: "s-1",
      peak_memory_bytes: 1234,
      ready_at: iso(NOW - 30_000),
      heartbeat_at: iso(NOW - 2_000),
    });
    await writeFile(path.join(runDir, "events.ndjson"), [
      JSON.stringify({ type: "turn_start", timestamp: iso(NOW - 5_000) }),
      JSON.stringify({ type: "tool_queued", toolName: "edit_file", timestamp: iso(NOW - 1_000) }),
    ].join("\n") + "\n", "utf-8");
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "plain", runtime: "unknown" });

    const records = await discoverRuns(ROOT, { now: NOW, persist: false });
    const found = records.find((entry) => entry.run_id === runId)!;
    expect(found.source).toBe("registry");
    expect(found.runtime).toBe("command-code");
    expect(found.controller_pid).toBe(7777);
    expect(found.status).toBe("running");
    expect(found.turns).toBe(7);
    expect(found.denials).toBe(2);
    expect(found.session_id).toBe("s-1");
    expect(found.peak_memory_bytes).toBe(1234);
    expect(found.last_tool).toBe("edit_file");
    expect(found.last_event_at).toBe(iso(NOW - 1_000));
  });

  test("finds a pre-registry run only by the bounded scan", async () => {
    const runId = "20260922T100400Z-aaaaa2";
    await seedControl(ROOT, "legacy", runId, {});

    const records = await discoverRuns(ROOT, { now: NOW, persist: false });
    const found = records.find((entry) => entry.run_id === runId);
    expect(found?.source).toBe("scan");
    expect(found?.mission_id).toBe("legacy");
    // Discovery alone must not allocate a registry entry.
    await expect(readFile(path.join(liveRunsDir(ROOT), `${runId}.json`))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("hides settled runs unless includeSettled, and drops runs past the 24h window", async () => {
    const recent = "20260922T100500Z-aaaaa3";
    const ancient = "20260922T100501Z-aaaaa4";
    await seedControl(ROOT, "plain", recent, { status: "passed", heartbeat_at: iso(NOW - 1_000) });
    await seedControl(ROOT, "plain", ancient, { status: "failed", heartbeat_at: iso(NOW - 3 * 24 * 60 * 60 * 1000) });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId: recent, missionId: "plain", runtime: "oh-my-pi" });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId: ancient, missionId: "plain", runtime: "oh-my-pi" });

    const liveOnly = await discoverRuns(ROOT, { now: NOW, persist: false });
    expect(liveOnly.map((entry) => entry.run_id)).not.toContain(recent);
    expect(liveOnly.map((entry) => entry.run_id)).not.toContain(ancient);

    const all = await discoverRuns(ROOT, { now: NOW, includeSettled: true, persist: false });
    const ids = all.map((entry) => entry.run_id);
    expect(ids).toContain(recent);
    expect(ids).not.toContain(ancient);
  });

  test("reconciles a terminal control fact back into the registry", async () => {
    const runId = "20260922T100600Z-aaaaa5";
    await seedControl(ROOT, "plain", runId, { status: "failed", stop_code: "timeout", heartbeat_at: iso(NOW - 1_000) });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "plain", runtime: "oh-my-pi" });

    await discoverRuns(ROOT, { now: NOW });

    const entry = await readEntry(runId);
    expect(entry.status).toBe("failed");
    expect(entry.stop_code).toBe("timeout");
    expect(entry.settled_at).toBe(iso(NOW - 1_000));
  });

  test("reads only the last 64 KB of the events log", async () => {
    const runId = "20260922T100700Z-aaaaa6";
    const runDir = await seedControl(ROOT, "plain", runId, {});
    const head = JSON.stringify({ type: "tool_queued", toolName: "ancient_tool", timestamp: iso(NOW - 600_000) });
    const filler = ("\n" + JSON.stringify({ type: "message_delta", text: "x".repeat(64) })).repeat(3000);
    await writeFile(path.join(runDir, "events.ndjson"), head + filler + "\n", "utf-8");
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "plain", runtime: "oh-my-pi" });

    const records = await discoverRuns(ROOT, { now: NOW, persist: false });
    const found = records.find((entry) => entry.run_id === runId)!;
    expect(found.last_tool).toBeUndefined();
    expect(found.last_event_at).toBeUndefined();
  });

  test("answers in under one second with 50 registry entries", async () => {
    const runIds: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const runId = `20260922T10${String(index).padStart(2, "0")}00Z-${index.toString(16).padStart(6, "0")}`;
      runIds.push(runId);
      await seedControl(ROOT, "plain", runId, { controller_pid: 4242 });
      await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "plain", runtime: "oh-my-pi" });
    }

    const started = Date.now();
    const { records } = await listLiveRuns(ROOT, { processes: [], now: NOW, persist: false });
    const elapsed = Date.now() - started;

    expect(records).toHaveLength(50);
    expect(elapsed).toBeLessThan(1000);
  });
});

/* ----------------------------------------------------------------- liveness */

describe("liveness", () => {
  test("a running run with a live controller and fresh heartbeat is live", () => {
    const alive = processes([{ pid: 4242, ppid: 1 }]);
    expect(liveness(record(), alive, { now: NOW })).toBe("live");
  });

  test("a running run whose controller is gone is orphaned (the incident case)", () => {
    expect(liveness(record(), [], { now: NOW })).toBe("orphaned");
  });

  test("a live controller with a heartbeat older than 2x the stall window is stale", () => {
    const alive = processes([{ pid: 4242, ppid: 1 }]);
    const stale = record({ heartbeat_at: iso(NOW - 200_000) });
    expect(liveness(stale, alive, { now: NOW, stallWindowMs: 60_000 })).toBe("stale");
    const fresh = record({ heartbeat_at: iso(NOW - 30_000) });
    expect(liveness(fresh, alive, { now: NOW, stallWindowMs: 60_000 })).toBe("live");
  });

  test("a terminal run is settled regardless of its pid", () => {
    const settled = record({ status: "passed", settled_at: iso(NOW - 1_000) });
    expect(isSettled(settled)).toBe(true);
    expect(liveness(settled, processes([{ pid: 4242, ppid: 1 }]), { now: NOW })).toBe("settled");
  });

  test("lists the native process tree under the controller", () => {
    const list = processes([
      { pid: 1, ppid: 0, name: "uh.exe", command: "uh mission run" },
      { pid: 2, ppid: 1, name: "node.exe", command: "runtime --json" },
      { pid: 3, ppid: 2, name: "cmd.exe", command: "shell" },
      { pid: 4, ppid: 99, name: "other.exe", command: "unrelated" },
    ]);
    expect(processChildren(1, list).map((child) => child.pid).sort()).toEqual([2, 3]);
    expect(processChildren(99, list).map((child) => child.pid)).toEqual([4]);
  });

  test("teamFromArtifactRoot reads team mission and role from the path", () => {
    const artifactRoot = path.join(ROOT, ".harness", "missions", "wave", "team", "artifacts", "p", "workers", "qa");
    expect(teamFromArtifactRoot(ROOT, artifactRoot)).toEqual({ mission_id: "wave", role: "qa" });
    expect(teamFromArtifactRoot(ROOT, ROOT)).toBeUndefined();
  });
});

/* --------------------------------------------------------- ps exit + format */

describe("uh ps presentation", () => {
  test("a dead controller makes the run orphaned, forces exit 3, and shows in counts", async () => {
    const runId = "20260922T100800Z-bbbbb1";
    await seedControl(ROOT, "incident", runId, { controller_pid: 999_999 });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "incident", runtime: "oh-my-pi" });

    const { records, orphaned } = await listLiveRuns(ROOT, { processes: [], now: NOW, persist: false });
    const found = records.find((entry) => entry.run_id === runId)!;
    expect(found.liveness).toBe("orphaned");
    expect(orphaned).toBe(1);
    expect(liveRunsExitCode(records)).toBe(3);
    expect(await liveRunCounts(ROOT, { processes: [], now: NOW })).toEqual({ total: 1, orphaned: 1 });
    expect(formatLiveRuns(records, { now: NOW })).toContain("orphaned");
  });

  test("no orphaned runs means exit 0 and a stable formatted line", async () => {
    const runId = "20260922T100900Z-bbbbb2";
    await seedControl(ROOT, "wave", runId, { controller_pid: 4242, turns: 5, denials: 0 });
    await registerLiveRun({
      projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "wave", runtime: "oh-my-pi",
      model: "gpt-5", team: { mission_id: "wave", role: "backend" },
    });

    const { records, orphaned } = await listLiveRuns(ROOT, {
      processes: processes([{ pid: 4242, ppid: 1 }]), now: NOW, persist: false,
    });
    expect(orphaned).toBe(0);
    expect(liveRunsExitCode(records)).toBe(0);
    const line = formatLiveRuns(records, { now: NOW });
    expect(line).toContain(runId);
    expect(line).toContain("team=backend");
    expect(line).toContain("oh-my-pi/gpt-5");
    expect(line).toContain("live");
    expect(line).toContain("pids=4242");
    expect(await liveRunCounts(ROOT, { processes: processes([{ pid: 4242, ppid: 1 }]), now: NOW }))
      .toEqual({ total: 1, orphaned: 0 });
  });

  test("empty registry formats as no live runs", async () => {
    expect(formatLiveRuns([], { now: NOW })).toBe("No live runs.");
  });
});

/* ------------------------------------------------------------- CLI contract */

function runPs(args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync("bun", ["x", "tsx", CLI, ...args], {
    encoding: "utf-8",
    timeout: 60_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  }) as { status: number | null; stdout: string; stderr: string };
}

describe("uh ps CLI", () => {
  test("exits 3 with an orphaned run and 0 with none", async () => {
    const runId = "20260922T101000Z-ccccc1";
    await seedControl(ROOT, "incident", runId, { controller_pid: 2_147_483_646 });
    await registerLiveRun({ projectRoot: ROOT, artifactRoot: ROOT, runId, missionId: "incident", runtime: "oh-my-pi" });

    const orphaned = runPs(["ps", "--root", ROOT, "--json"]);
    expect(orphaned.status).toBe(3);
    const parsed = JSON.parse(orphaned.stdout) as { orphaned: number; runs: Array<{ run_id: string; liveness: string }> };
    expect(parsed.orphaned).toBe(1);
    expect(parsed.runs.find((entry) => entry.run_id === runId)?.liveness).toBe("orphaned");

    const cleanRoot = await mkdtemp(path.join(tmpdir(), "uh-live-runs-clean-"));
    try {
      const clean = runPs(["ps", "--root", cleanRoot]);
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain("No live runs.");
    } finally {
      await rm(cleanRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

/* --------------------------------------------------------- default lister */

describe("default process lister", () => {
  test("returns native processes without throwing", async () => {
    const { defaultProcessLister } = await import("../src/harness/live-runs.js");
    const list = await defaultProcessLister();
    expect(Array.isArray(list)).toBe(true);
    expect(list.every((entry) => typeof entry.pid === "number" && typeof entry.ppid === "number")).toBe(true);
  }, 30_000);
});
