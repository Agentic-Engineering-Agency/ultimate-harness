import { describe, expect, test, vi, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cancelLocalMissionRun,
  cancelMissionRunViaPlugin,
  defaultPluginApiBase,
  resolveRunRoot,
  MissionCancelError,
} from "../src/harness/mission-cancel.js";
import { registerLiveRun } from "../src/harness/live-runs.js";

describe("mission cancel via plugin API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("defaultPluginApiBase prefers UH_PLUGIN_URL", () => {
    const prev = process.env.UH_PLUGIN_URL;
    process.env.UH_PLUGIN_URL = "http://example.test/api/plugins/uh/";
    expect(defaultPluginApiBase()).toBe("http://example.test/api/plugins/uh");
    if (prev === undefined) delete process.env.UH_PLUGIN_URL;
    else process.env.UH_PLUGIN_URL = prev;
  });

  test("cancelMissionRunViaPlugin posts to /runs/{id}/cancel", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "cancelled" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await cancelMissionRunViaPlugin("http://127.0.0.1:9119/api/plugins/uh", "run-abc");
    expect(result).toEqual({ ok: true, status: "cancelled" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9119/api/plugins/uh/runs/run-abc/cancel",
      { method: "POST" },
    );
  });

  test("surfaces already_finished as MissionCancelError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({ error: "run run-x already finished", code: "already_finished" }),
        { status: 409 },
      )),
    );
    await expect(cancelMissionRunViaPlugin("http://localhost/api/plugins/uh", "run-x"))
      .rejects
      .toMatchObject({ code: "already_finished", status: 409 });
    try {
      await cancelMissionRunViaPlugin("http://localhost/api/plugins/uh", "run-x");
    } catch (err) {
      expect(err).toBeInstanceOf(MissionCancelError);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Team-worker root resolution — the 2026-09-22 ENOENT incident               */
/* -------------------------------------------------------------------------- */

const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

/** A project root holding one team worker whose control file sits in the worker tree. */
async function teamWorkerFixture(status = "cancelled"): Promise<{ projectRoot: string; workerRoot: string; runId: string }> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "uh-cancel-team-"));
  await mkdir(path.join(projectRoot, ".harness"), { recursive: true });
  await writeFile(path.join(projectRoot, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: cancel fixture\n");
  const team = "wave-audit-0";
  const runId = "20260922T100100Z-bbbbbb";
  const workerRoot = path.join(projectRoot, ".harness", "missions", team, "team", "artifacts", "20260922T100000Z-parent", "workers", "runbook");
  const runDir = path.join(workerRoot, ".harness", "missions", team, "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: team, run_id: runId, runtime: "command-code",
    controller_pid: 4242, started_at: iso(-60_000), heartbeat_at: iso(-2_000),
    status, turns: 2, denials: 0, inflight_tools: 0,
  }));
  await registerLiveRun({
    projectRoot, artifactRoot: workerRoot, runId, missionId: team,
    runtime: "command-code", controllerPid: 4242, team: { mission_id: team, role: "runbook" },
  });
  return { projectRoot, workerRoot, runId };
}

describe("mission cancel resolves the owning artifact root", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("from the project root a team worker run is found through the registry", async () => {
    const { projectRoot, workerRoot, runId } = await teamWorkerFixture();
    try {
      await expect(resolveRunRoot(projectRoot, "wave-audit-0", runId)).resolves.toBe(workerRoot);
      await expect(cancelLocalMissionRun(projectRoot, "wave-audit-0", runId))
        .resolves.toEqual({ ok: true, status: "cancelled" });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("a run found only by the harness scan still resolves", async () => {
    const { projectRoot, workerRoot, runId } = await teamWorkerFixture();
    try {
      await rm(path.join(projectRoot, ".harness", "live-runs"), { recursive: true, force: true });
      await expect(resolveRunRoot(projectRoot, "wave-audit-0", runId)).resolves.toBe(workerRoot);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("an undiscoverable run is refused by code, not with a bare ENOENT", async () => {
    const { projectRoot } = await teamWorkerFixture();
    try {
      await expect(resolveRunRoot(projectRoot, "wave-audit-0", "20260922T100200Z-cccccc"))
        .rejects
        .toMatchObject({ name: "MissionCancelError", code: "unknown_run" });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("a run directly under the given root keeps using that root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-cancel-plain-"));
    const runId = "20260922T100300Z-dddddd";
    const runDir = path.join(root, ".harness", "missions", "solo", "runs", runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
      schema_version: "uh.runtime-control.v0", mission_id: "solo", run_id: runId, runtime: "codex",
      controller_pid: 4242, started_at: iso(-60_000), heartbeat_at: iso(-2_000),
      status: "cancelled", turns: 1, denials: 0, inflight_tools: 0,
    }));
    try {
      await expect(resolveRunRoot(root, "solo", runId)).resolves.toBe(path.resolve(root));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
