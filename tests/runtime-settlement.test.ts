import { test, expect } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { cancelLocalMissionRun } from "../src/harness/mission-cancel.js";
import { prepareRuntimeResume } from "../src/harness/runtime-recovery.js";
import { reconcileRuntimeResultControl, reconcileRuntimeSettlement } from "../src/harness/runtime-settlement.js";

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

/* ------------------------- runtime-result / runtime-control consistency ------------------------- */

const STARTED = "2026-09-22T00:00:00.000Z";

/** A run directory holding a terminal control receipt and a written runtime result. */
async function resultControlFixture(control: Record<string, unknown>, result: Record<string, unknown>) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-settle-consistency-"));
  const directory = path.join(root, ".harness", "missions", "one", "runs", "lost");
  await mkdir(path.join(directory, "..", ".."), { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "runtime-control.json"), JSON.stringify(control));
  await writeFile(path.join(directory, "runtime-result.yaml"), stringify(result));
  return { root, directory };
}

function confirmedControl(status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "uh.runtime-control.v0", mission_id: "one", run_id: "lost", runtime: "command-code",
    controller_pid: 12345, started_at: STARTED, heartbeat_at: STARTED,
    status, turns: 3, denials: 0, inflight_tools: 0, ...extra,
  };
}

function resultDocument(status: string, exitCode: number, errors: string[]): Record<string, unknown> {
  return {
    schema_version: "uh.runtime-result.v0", mission_id: "one", runtime: "command-code",
    status, started_at: STARTED, finished_at: STARTED, exit_code: exitCode,
    prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
    errors,
  };
}

test("a confirmed passed settlement is preferred over a failed result and a settlement_conflict record is written", async () => {
  const { root, directory } = await resultControlFixture(
    confirmedControl("passed", { settlement_confirmed: true }),
    resultDocument("failed", 1, ["Diff capture failed: Command failed: git rev-parse --verify HEAD"]),
  );
  try {
    expect(await reconcileRuntimeResultControl(root, "one", "lost")).toBe(true);
    const result = parse(await readFile(path.join(directory, "runtime-result.yaml"), "utf8")) as {
      status: string; exit_code: number; exit_code_ignored_reason?: string; errors: string[];
    };
    expect(result.status).toBe("passed");
    expect(result.exit_code).toBe(1);
    expect(result.exit_code_ignored_reason).toBe("runtime exited non-zero after completed native terminal event");
    const conflict = result.errors.at(-1)!;
    expect(conflict).toContain("settlement_conflict");
    expect(conflict).toContain("runtime-result status=failed");
    expect(conflict).toContain("runtime-control status=passed");
    expect(conflict).toContain("settlement_confirmed=true");
    // The mission-level mirror is refreshed alongside the per-run rewrite.
    const mirror = parse(await readFile(path.join(root, ".harness", "missions", "one", "runtime-result.yaml"), "utf8")) as { status: string };
    expect(mirror.status).toBe("passed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an unconfirmed control receipt records the conflict but never rewrites the result", async () => {
  const { root, directory } = await resultControlFixture(
    confirmedControl("failed"),
    resultDocument("passed", 0, []),
  );
  try {
    expect(await reconcileRuntimeResultControl(root, "one", "lost")).toBe(true);
    const result = parse(await readFile(path.join(directory, "runtime-result.yaml"), "utf8")) as { status: string; errors: string[] };
    expect(result.status).toBe("passed");
    const conflict = result.errors.at(-1)!;
    expect(conflict).toContain("settlement_conflict");
    expect(conflict).toContain("runtime-result status=passed");
    expect(conflict).toContain("runtime-control status=failed");
    expect(conflict).toContain("settlement_confirmed=false");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("agreeing artifacts are left untouched and a blocked result agrees with a confirmed passed receipt", async () => {
  const agreement = await resultControlFixture(
    confirmedControl("passed", { settlement_confirmed: true }),
    resultDocument("passed", 0, []),
  );
  try {
    const before = await readFile(path.join(agreement.directory, "runtime-result.yaml"), "utf8");
    expect(await reconcileRuntimeResultControl(agreement.root, "one", "lost")).toBe(false);
    expect(await readFile(path.join(agreement.directory, "runtime-result.yaml"), "utf8")).toBe(before);
  } finally { await rm(agreement.root, { recursive: true, force: true }); }

  const blockedRefinement = await resultControlFixture(
    confirmedControl("passed", { settlement_confirmed: true }),
    resultDocument("blocked", 0, ["Hermes did not emit a uh.runtime-result.v0 block on stdout"]),
  );
  try {
    expect(await reconcileRuntimeResultControl(blockedRefinement.root, "one", "lost")).toBe(false);
  } finally { await rm(blockedRefinement.root, { recursive: true, force: true }); }
});

test("missing control or result evidence needs no reconciliation", async () => {
  const missingResult = await resultControlFixture(
    confirmedControl("passed", { settlement_confirmed: true }),
    resultDocument("failed", 1, []),
  );
  try {
    await rm(path.join(missingResult.directory, "runtime-result.yaml"));
    expect(await reconcileRuntimeResultControl(missingResult.root, "one", "lost")).toBe(false);
  } finally { await rm(missingResult.root, { recursive: true, force: true }); }

  const missingControl = await resultControlFixture(
    confirmedControl("passed", { settlement_confirmed: true }),
    resultDocument("failed", 1, []),
  );
  try {
    await rm(path.join(missingControl.directory, "runtime-control.json"));
    expect(await reconcileRuntimeResultControl(missingControl.root, "one", "lost")).toBe(false);
  } finally { await rm(missingControl.root, { recursive: true, force: true }); }
});
