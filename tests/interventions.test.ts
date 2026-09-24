import { test, expect } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { steerRun } from "../src/harness/steer.js";
import { runRuntimeProcess } from "../src/harness/runtime-process.js";
import {
  INTERVENTION_SCHEMA_VERSION,
  InterventionRecordSchema,
  InterventionSchema,
  InterventionStatusChangeSchema,
} from "../src/schema/intervention.js";
import {
  buildIntervention,
  captureKill,
  captureReview,
  captureSettlement,
  captureSteer,
  confirmIntervention,
  importPredecessorLedger,
  interventionsPath,
  landIntervention,
  readLedger,
  recordIntervention,
  summarizeLedger,
  tryRecordIntervention,
} from "../src/harness/interventions.js";

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

const baseEntry = () => ({
  schema_version: INTERVENTION_SCHEMA_VERSION,
  id: "iv_test",
  ts: new Date().toISOString(),
  source: "owner" as const,
  trigger: "note" as const,
  refs: {},
  cause: "unknown" as const,
  qualifier: "unknown" as const,
  what: "a correction",
  detection: "recorded by hand",
  status: "open" as const,
});

test("an intervention round trips through the schema", () => {
  const entry = buildIntervention({ source: "orchestrator", trigger: "steer", what: "nudge", refs: { mission_id: "m", run_id: "r" } });
  expect(entry.status).toBe("open");
  expect(entry.cause).toBe("unknown");
  expect(entry.qualifier).toBe("unknown");
  expect(parseJson(entry, InterventionSchema)).toEqual(entry);
});

function parseJson(value: unknown, schema: typeof InterventionSchema) {
  return schema.parse(JSON.parse(JSON.stringify(value)));
}

test("a status change parses as its own append-only record", () => {
  const change = InterventionStatusChangeSchema.parse({
    schema_version: INTERVENTION_SCHEMA_VERSION, id: "iv_test", ts: new Date().toISOString(),
    status: "landed", evidence: "the fix", countermeasure: "gate-1",
  });
  expect(InterventionRecordSchema.parse(change)).toEqual(change);
  const full = InterventionRecordSchema.parse(baseEntry());
  expect("trigger" in full ? full.trigger : undefined).toBe("note");
});

test("a landed intervention without evidence is refused", async () => {
  expect(() => InterventionSchema.parse({ ...baseEntry(), status: "landed" })).toThrow(/evidence/i);
  const root = await tempRoot("uh-interventions-");
  try {
    const entry = await recordIntervention(root, { source: "owner", trigger: "note", what: "needs a fix" });
    await expect(landIntervention(root, entry.id, { evidence: "   " })).rejects.toThrow(/evidence/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an agent cannot record a verified intervention with verified_by owner, but confirm can", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    await expect(recordIntervention(root, {
      source: "owner", trigger: "note", what: "claim", status: "verified", verified_by: "owner",
    })).rejects.toThrow(/owner/i);
    const entry = await recordIntervention(root, { source: "orchestrator", trigger: "note", what: "open" });
    const confirmed = await confirmIntervention(root, entry.id);
    expect(confirmed.status).toBe("verified");
    expect(confirmed.verified_by).toBe("owner");
    expect((await readLedger(root)).entries.find((item) => item.id === entry.id)?.status).toBe("verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic capture: a steer appends one entry", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    const entry = await captureSteer(root, { missionId: "m", runId: "r", what: "switch paths" });
    expect(entry?.trigger).toBe("steer");
    expect(entry?.source).toBe("orchestrator");
    expect((await readLedger(root)).entries).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic capture: each killed run appends one entry", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    const recorded = await captureKill(root, [
      { run_id: "r1", mission_id: "m", outcome: "force_killed" },
      { run_id: "r2", mission_id: "m", outcome: "still_alive" },
      { run_id: "r3", mission_id: "m", outcome: "cancelled_gracefully" },
    ]);
    expect(recorded).toHaveLength(2);
    expect(recorded.every((entry) => entry.trigger === "kill")).toBe(true);
    expect((await readLedger(root)).entries).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic capture: a non-passing review appends one entry per non-pass source", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    const recorded = await captureReview(root, {
      reviewMissionId: "review", runId: "run-1",
      sources: [{ mission_id: "a", verdict: "needs-remediation" }, { mission_id: "b", verdict: "pass" }],
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0].source).toBe("review");
    expect(recorded[0].refs.mission_id).toBe("a");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic capture: only supervision stop codes settle as interventions", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    expect(await captureSettlement(root, { missionId: "m", runId: "r", stopCode: "timeout" })).toBeUndefined();
    const entry = await captureSettlement(root, { missionId: "m", runId: "r", stopCode: "policy", stopReason: "protected path" });
    expect(entry?.source).toBe("supervisor");
    expect(entry?.cause).toBe("permission");
    expect((await readLedger(root)).entries).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automatic capture: a supervised settlement appends one entry", async () => {
  const root = await tempRoot("uh-interventions-settle-");
  try {
    const directory = path.join(root, ".harness", "missions", "one", "runs", "run-1");
    const worker = "console.log(JSON.stringify({type:'model_request_start'}));"
      + "console.log(JSON.stringify({type:'tool_execution_start',toolCallId:'a',toolName:'write_file',input:{path:'.harness/x'}}));"
      + "setInterval(()=>{},1000)";
    const result = await runRuntimeProcess({
      command: process.execPath,
      args: ["-e", worker],
      cwd: root,
      limits: { startup_timeout_ms: 5000 },
      artifacts: { directory, missionId: "one", runId: "run-1", runtime: "fixture" },
    });
    expect(result.supervisionStopCode).toBe("policy");
    const ledger = await readLedger(root);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      source: "supervisor", trigger: "stop", cause: "permission", refs: { mission_id: "one", run_id: "run-1" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("summary counts same-cause recurrence after a countermeasure lands", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    await recordIntervention(root, { source: "owner", trigger: "note", cause: "tool", qualifier: "missing", what: "before the fix", refs: { mission_id: "m" } });
    await recordIntervention(root, {
      source: "owner", trigger: "note", cause: "tool", qualifier: "missing",
      what: "fixed by a gate", status: "landed", evidence: "gate added", countermeasure: "check-1", refs: { mission_id: "m" },
    });
    await recordIntervention(root, { source: "owner", trigger: "note", cause: "tool", qualifier: "missing", what: "recurred once", refs: { mission_id: "m" } });
    await recordIntervention(root, { source: "owner", trigger: "note", cause: "tool", qualifier: "missing", what: "recurred twice", refs: { mission_id: "m" } });
    await recordIntervention(root, { source: "owner", trigger: "note", cause: "info", qualifier: "unknown", what: "unrelated", refs: { mission_id: "m" } });
    const summary = summarizeLedger(await readLedger(root));
    expect(summary.total).toBe(5);
    expect(summary.by_mission).toEqual({ m: 5 });
    expect(summary.by_cause).toEqual({ tool: 4, info: 1 });
    const recurrence = summary.countermeasures.find((item) => item.countermeasure === "check-1");
    expect(recurrence).toMatchObject({ cause: "tool", qualifier: "missing", recurrences: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("import maps the predecessor corrections format and never verifies", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    const content = [
      JSON.stringify({ correction: "use bun not npm", status: "open", evidence: "", confirmed_by_owner: false }),
      JSON.stringify({ correction: "pin zod", status: "partial", evidence: "wip", confirmed_by_owner: false }),
      JSON.stringify({ correction: "add a gate", status: "landed", evidence: "gate added", confirmed_by_owner: true }),
      JSON.stringify({ correction: "landed with no evidence", status: "landed" }),
    ].join("\n");
    const created = await importPredecessorLedger(root, content);
    expect(created.map((entry) => entry.status)).toEqual(["open", "open", "landed", "open"]);
    expect(created[2].evidence).toBe("gate added");
    expect(created.every((entry) => entry.source === "owner")).toBe(true);
    expect(created.some((entry) => entry.status === "verified" || entry.verified_by !== undefined)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a ledger write failure is swallowed by the capture helpers", async () => {
  const root = await tempRoot("uh-interventions-");
  try {
    await mkdir(path.join(root, ".harness"), { recursive: true });
    await writeFile(path.join(root, ".harness", "ledger"), "not a directory");
    expect(await tryRecordIntervention(root, { source: "owner", trigger: "note", what: "x" })).toBeUndefined();
    expect(await captureSteer(root, { missionId: "m", runId: "r", what: "x" })).toBeUndefined();
    expect(await captureKill(root, [{ run_id: "r", mission_id: "m", outcome: "force_killed" }])).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Steer integration                                                          */
/* -------------------------------------------------------------------------- */

/** A project root with the harness and a resumable Command Code adapter. */
async function steerProject(): Promise<string> {
  const root = await tempRoot("uh-interventions-steer-");
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8")) as { config: Record<string, unknown> };
  manifest.config.cli_command = "cmdc";
  manifest.config.runtime_config = { model: "fixture/model", permission_mode: "yolo" };
  await writeFile(manifestPath, stringify(manifest));
  return root;
}

async function missionPacket(root: string, missionId: string): Promise<void> {
  const missionPath = path.join(root, ".harness", "missions", missionId, "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: missionId, title: "Ledger fixture", workflow_profile: "research-docs" }));
}

async function seedLiveRun(root: string, missionId: string, runId: string): Promise<void> {
  const runDir = path.join(root, ".harness", "missions", missionId, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: missionId, run_id: runId, runtime: "command-code",
    controller_pid: 4242, started_at: now, heartbeat_at: now, status: "running", turns: 1, denials: 0,
    inflight_tools: 0, session_id: "s1",
  }));
  await writeFile(path.join(runDir, "runtime-session.yaml"), stringify({ schema_version: "uh.runtime-session.v0", mission_id: missionId, runtime: "command-code", status: "running" }));
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0", mission_id: missionId, runtime: "command-code", status: "failed",
    started_at: now, finished_at: now, prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
  }));
}

const alive = (pid: number) => [{ pid, ppid: 1, name: "node.exe", command: "node" }];

test("a steered run is captured, and a failed ledger write does not fail the steer", async () => {
  const root = await steerProject();
  try {
    await missionPacket(root, "one");
    await seedLiveRun(root, "one", "active-run");
    const result = await steerRun(root, "active-run", "Switch to the auth path.", { report: true }, {
      run: async () => ({ runId: undefined }),
      cancel: async () => ({ ok: true, status: "cancelled" }),
      processes: alive(4242),
    });
    expect(result).toMatchObject({ ok: true, mode: "controller" });
    const ledger = await readLedger(root);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ trigger: "steer", source: "orchestrator", refs: { mission_id: "one", run_id: "active-run" } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a sabotaged ledger does not fail a real steer", async () => {
  const root = await steerProject();
  try {
    await missionPacket(root, "one");
    await seedLiveRun(root, "one", "active-run");
    // Occupy the ledger path with a file so appending must fail.
    await writeFile(path.join(root, ".harness", "ledger"), "not a directory");
    const result = await steerRun(root, "active-run", "Keep going.", {}, {
      run: async () => ({ runId: undefined }),
      cancel: async () => ({ ok: true, status: "cancelled" }),
      processes: alive(4242),
    });
    expect(result).toMatchObject({ ok: true, mode: "controller" });
    expect(await readFile(path.join(root, ".harness", "missions", "one", "runs", "active-run", "steer-request.json"), "utf8")).toContain("Keep going.");
    expect((await readLedger(root)).entries).toHaveLength(0);
    // The sabotaged path is untouched: the failure was swallowed, not repaired by deleting the file.
    expect(await readFile(path.join(root, ".harness", "ledger"), "utf8")).toBe("not a directory");
    expect(interventionsPath(root)).toContain("interventions.ndjson");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
