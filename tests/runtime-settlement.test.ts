import { test, expect } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { cancelLocalMissionRun } from "../src/harness/mission-cancel.js";
import { prepareRuntimeResume } from "../src/harness/runtime-recovery.js";
import { reconcileRuntimeSettlement } from "../src/harness/runtime-settlement.js";

async function fixture(confirmed: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-reconcile-"));
  const directory = path.join(root, ".harness", "missions", "one", "runs", "lost");
  await mkdir(directory, { recursive: true });
  const started = "2026-09-15T00:00:00.000Z";
  await writeFile(path.join(directory, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: "one", run_id: "lost", runtime: "command-code",
    controller_pid: 12345, started_at: started, heartbeat_at: started, session_id: "saved-session",
    status: "failed", stop_code: "controller_lost", settlement_confirmed: confirmed, turns: 1, denials: 0, inflight_tools: 0,
  }));
  await writeFile(path.join(directory, "runtime-session.yaml"), stringify({ schema_version: "uh.runtime-session.v0", mission_id: "one", runtime: "command-code", status: "running" }));
  await writeFile(path.join(directory, "runtime.stdout.log"), "preserved partial transcript\n");
  await writeFile(path.join(directory, "runtime.stderr.log"), "");
  await writeFile(path.join(directory, "prompt.md"), "Offline fixture contract");
  await writeFile(path.join(directory, "..", "index.json"), JSON.stringify({ schema_version: "uh.runs-index.v0", runs: [{ run_id: "lost", runtime: "command-code", started_at: started, status: "running" }] }));
  return { root, directory };
}

test("confirmed controller loss reconciles cancellation and permits saved-session recovery without inventing usage", async () => {
  const { root, directory } = await fixture(true);
  try {
    expect(await cancelLocalMissionRun(root, "one", "lost")).toEqual({ ok: true, status: "failed" });
    expect((await prepareRuntimeResume(root, "one", "lost", "command-code", "Continue preserved work")).sessionId).toBe("saved-session");
    expect(JSON.parse(await readFile(path.join(directory, "..", "index.json"), "utf8")).runs[0].status).toBe("failed");
    const result = parse(await readFile(path.join(directory, "runtime-result.yaml"), "utf8"));
    expect(result.status).toBe("failed");
    expect(result.usage).toBeUndefined();
    expect(result.cost_usd).toBeUndefined();
    expect(await readFile(path.join(directory, "runtime.stdout.log"), "utf8")).toBe("preserved partial transcript\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unconfirmed process-tree termination cannot settle canonical running work", async () => {
  const { root, directory } = await fixture(false);
  try {
    expect(await reconcileRuntimeSettlement(root, "one", "lost")).toBe(false);
    await expect(cancelLocalMissionRun(root, "one", "lost")).rejects.toThrow();
    expect(parse(await readFile(path.join(directory, "runtime-session.yaml"), "utf8")).status).toBe("running");
    await expect(readFile(path.join(directory, "runtime-result.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
