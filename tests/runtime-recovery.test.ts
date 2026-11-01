import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode } from "../src/adapters/command-code.js";
import { runRuntimeProcess, type RuntimeProcessInput } from "../src/harness/runtime-process.js";
import { persistRuntimeRecovery, prepareRuntimeResume, runWithRuntimeRecovery } from "../src/harness/runtime-recovery.js";
import { getMissionArtifactContext } from "../src/adapters/_artifact-context.js";

/**
 * Real children and filesystem visibility cannot be driven by a fake clock, so
 * the tests wait for observable I/O state, but every supervision deadline is
 * fired by advancing this clock — never by waiting out wall time.
 */
function manualClock() {
  let current = Date.now();
  const polls: Array<() => void> = [];
  return {
    now: () => current,
    setInterval: (callback: () => void) => { polls.push(callback); return polls.length; },
    clearInterval: () => {},
    advance: (milliseconds: number) => { current += milliseconds; for (const poll of [...polls]) poll(); },
  };
}

async function waitForFile(file: string, predicate: (text: string) => boolean) {
  for (let i = 0; i < 100; i++) {
    try { const text = await readFile(file, "utf8"); if (predicate(text)) return text; } catch { /* Not persisted yet. */ }
    await delay(20);
  }
  throw new Error(`Expected persisted state at ${file}`);
}

function clockedRunner(clock: ReturnType<typeof manualClock>) {
  return (input: RuntimeProcessInput) => runRuntimeProcess({ ...input, clock });
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-native-recovery-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.config.cli_command = process.execPath;
  manifest.config.runtime_config = { model: "fixture/model", permission_mode: "yolo", cli_args: [path.join(root, "fixture.cjs")],
    limits: { startup_timeout_ms: 3000, stall_timeout_ms: 200, timeout_ms: 5000 } };
  await writeFile(manifestPath, stringify(manifest));
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "one", title: "Offline recovery", workflow_profile: "research-docs" }));
  await writeFile(path.join(root, "fixture.cjs"), `
    const fs = require('node:fs');
    console.log(JSON.stringify({type:'session',sessionId:'saved-session'}));
    console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'fixture/model'}}));
    const resume = process.argv.indexOf('--resume');
    if (resume >= 0) {
      if (process.argv[resume + 1] !== 'saved-session' || fs.readFileSync('kept-output.txt','utf8') !== 'preserved') process.exit(9);
      console.log(JSON.stringify({type:'event',event:{type:'model_request_start',model:'fixture/model'}}));
      console.log(JSON.stringify({type:'result',subtype:'success',sessionId:'saved-session',stopReason:'end_turn',finalText:'Continued existing work'}));
    } else {
      fs.writeFileSync('kept-output.txt','preserved');
      setInterval(() => {}, 1000);
    }
  `);
  return { root, missionPath };
}

test("a stalled attempt settles before a distinct attempt resumes its saved session and outputs", async () => {
  const { root, missionPath } = await fixture();
  const clock = manualClock();
  try {
    const runDirectory = path.join(root, ".harness", "missions", "one", "runs");
    const pending = runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "original",
      recovery: { max_resumes: 1, notes: "Continue from the saved output; do not redo the completed step." },
      run: options => runCommandCode(root, missionPath, { ...options, collectDiff: async () => ({ patch: "" }), runner: clockedRunner(clock) }),
    });
    // The fixture's session and model_request_start are observed before their
    // stdout is persisted, so once the log shows them the supervision clock is
    // frozen exactly at that progress mark; advancing across the 200ms stall
    // budget fires the stall deterministically, regardless of machine load.
    await waitForFile(path.join(runDirectory, "original", "runtime.stdout.log"), text => text.includes("model_request_start"));
    clock.advance(300);
    const result = await pending;
    expect(result.result.status).toBe("passed");
    expect(result.runId).not.toBe("original");
    const index = JSON.parse(await readFile(path.join(runDirectory, "index.json"), "utf8"));
    expect(index.runs.map((run: { run_id: string; status: string; replay_of?: string }) => [run.run_id, run.status, run.replay_of]))
      .toEqual([["original", "failed", undefined], [result.runId, "passed", "original"]]);
    expect(await readFile(path.join(root, "kept-output.txt"), "utf8")).toBe("preserved");
    const originalControlPath = path.join(runDirectory, "original", "runtime-control.json");
    const control = JSON.parse(await readFile(originalControlPath, "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "stall", session_id: "saved-session" });
    // An actual policy stop must never acquire automatic resume authorization.
    control.stop_code = "policy";
    await writeFile(originalControlPath, JSON.stringify(control));
    let admissions = 0;
    await runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "original",
      recovery: { max_resumes: 2, notes: "Synthetic policy gate check" },
      run: async () => { admissions++; return { runId: "original", result: { status: "failed" } }; },
    });
    expect(admissions).toBe(1);
    await expect(prepareRuntimeResume(root, "one", "original", "command-code", "Synthetic policy gate check")).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
test("a denial budget resumes with a source stop and combined recovery note", async () => {
  const { root, missionPath } = await fixture();
  try {
    const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
    const manifest = parse(await readFile(manifestPath, "utf8"));
    manifest.config.runtime_config.limits.max_denials = 3;
    const denialFixture = path.join(root, "denial-fixture.cjs");
    await writeFile(denialFixture, `
      const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
      out({type:'session', id:'saved-session'});
      out({type:'model_request_start', model:'fixture/model'});
      if (process.argv.includes('--resume')) {
        out({type:'model_request_start', model:'fixture/model'});
        out({type:'result', subtype:'success', sessionId:'saved-session', stopReason:'end_turn', finalText:'Continued'});
      } else {
        for (const target of ['out/a.txt', 'out/b.txt', 'out/c.txt']) {
          const id = target;
          out({type:'tool_queued', toolCallId:id, toolName:'write_file', input:{path:target}});
          out({type:'tool_hooks', toolCallId:id, phase:'pre', outcome:{kind:'block', text:'writes are locked'}});
          out({type:'tool_hook_blocked', toolCallId:id});
        }
        setInterval(() => {}, 1000);
      }
    `);
    manifest.config.runtime_config.cli_args = [denialFixture];
    await writeFile(manifestPath, stringify(manifest));
    // The denial budget fires from observed events, never from time, and the
    // frozen injected clock keeps both attempts immune to load-induced
    // spurious stalls while they settle.
    const clock = manualClock();
    const result = await runWithRuntimeRecovery({ root, missionId: "one", runtime: "command-code", runId: "denial",
      recovery: { max_resumes: 1, notes: "Continue from the saved output." },
      run: options => runCommandCode(root, missionPath, { ...options, collectDiff: async () => ({ patch: "" }), runner: clockedRunner(clock) }),
    });
    expect(result.result.status).toBe("passed");
    const recoveryPath = path.join(root, ".harness", "missions", "one", "runs", result.runId!, "runtime-recovery.json");
    const recovery = JSON.parse(await readFile(recoveryPath, "utf8"));
    expect(recovery).toMatchObject({
      source_stop_code: "denial_budget",
      source_stop_reason: expect.stringContaining("write_file out/c.txt"),
      notes: expect.stringContaining("You were stopped: 3 hook-denied calls; last: write_file out/c.txt"),
    });
    expect(recovery.notes.match(/You were stopped:/g)).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

/* -------------------------------------------------------------------------- */
/* Steer: the controller owns the steer, and it never spends max_resumes       */
/* -------------------------------------------------------------------------- */

async function steerFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-steer-recovery-"));
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "one", title: "Steer recovery", workflow_profile: "research-docs" }));
  return root;
}

/** Persist an attempt's control/session/result exactly as an adapter would. */
async function writeAttempt(
  root: string,
  runId: string,
  attempt: { status: "running" | "passed" | "failed"; stopCode?: string; sessionId?: string },
): Promise<string> {
  const runDir = path.join(root, ".harness", "missions", "one", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: "one", run_id: runId, runtime: "command-code",
    controller_pid: process.pid, started_at: now, heartbeat_at: now, status: attempt.status,
    turns: 1, denials: 0, inflight_tools: 0,
    ...(attempt.sessionId !== undefined ? { session_id: attempt.sessionId } : {}),
    ...(attempt.stopCode !== undefined ? { stop_code: attempt.stopCode } : {}),
  }));
  await writeFile(path.join(runDir, "runtime-session.yaml"), stringify({
    schema_version: "uh.runtime-session.v0", mission_id: "one", runtime: "command-code",
    status: attempt.status === "passed" ? "succeeded" : attempt.status === "running" ? "running" : "failed",
  }));
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0", mission_id: "one", runtime: "command-code",
    status: attempt.status === "passed" ? "passed" : "failed", started_at: now, finished_at: now,
    prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
  }));
  return runDir;
}

async function writeSteerRequest(runDir: string, runId: string, message: string, report = false): Promise<void> {
  await writeFile(path.join(runDir, "steer-request.json"), JSON.stringify({
    schema_version: "uh.runtime-steer-request.v0", mission_id: "one", run_id: runId,
    message, report, requested_at: new Date().toISOString(),
  }));
}

test("a steer request stops the attempt with steered and the next attempt resumes the same session with the message", async () => {
  const root = await steerFixture();
  try {
    const firstRun = "steer-source";
    const seen: Array<{ runId: string; overrides?: Record<string, unknown> }> = [];
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: firstRun,
      // A steer must work with no automatic resume budget left at all.
      recovery: { max_resumes: 0, notes: "Automatic policy notes." },
      run: async (options) => {
        seen.push({ runId: options.runId, ...(options.extraRuntimeConfigOverrides !== undefined ? { overrides: options.extraRuntimeConfigOverrides } : {}) });
        const resumeFrom = options.extraRuntimeConfigOverrides?.resume_from_run;
        if (typeof resumeFrom === "string") {
          // Mirror the adapter: record the resume lineage for the new attempt.
          const resume = await prepareRuntimeResume(root, "one", resumeFrom, "command-code", String(options.extraRuntimeConfigOverrides?.recovery_notes ?? ""), "operator");
          const artifacts = await getMissionArtifactContext(root, path.join(root, ".harness", "missions", "one", "mission.yaml"), options.runId);
          if (artifacts) await persistRuntimeRecovery(artifacts, resume);
          await writeAttempt(root, options.runId, { status: "passed", sessionId: "saved-session" });
          return { runId: options.runId, result: { status: "passed" } };
        }
        // The live attempt is stopped by the operator's steer: request written,
        // then the runtime settles the cancelled attempt.
        const runDir = await writeAttempt(root, firstRun, { status: "running", sessionId: "saved-session" });
        await writeSteerRequest(runDir, firstRun, "Switch to the auth path.");
        await writeAttempt(root, firstRun, { status: "failed", stopCode: "cancelled", sessionId: "saved-session" });
        return { runId: firstRun, result: { status: "failed" } };
      },
    });
    expect(result.result?.status).toBe("passed");
    expect(result.runId).not.toBe(firstRun);
    expect(seen).toHaveLength(2);
    // The next attempt resumes the same native session with the steer message.
    expect(seen[1]!.overrides).toMatchObject({ resume_from_run: firstRun });
    expect(String(seen[1]!.overrides?.recovery_notes)).toContain("Switch to the auth path.");
    // The stopped attempt is labelled `steered`, not left as a bare cancel.
    const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "runtime-control.json"), "utf8"));
    expect(control.stop_code).toBe("steered");
    // The request is consumed exactly once.
    await expect(readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "steer-request.json"), "utf8")).rejects.toThrow();
    // The steer is recorded in the attempt lineage.
    const lineage = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", result.runId!, "runtime-recovery.json"), "utf8"));
    expect(lineage).toMatchObject({ source_run_id: firstRun, source_stop_code: "steered", session_id: "saved-session", notes: expect.stringContaining("Switch to the auth path.") });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("a steered attempt does not consume max_resumes", async () => {
  const root = await steerFixture();
  try {
    let attempts = 0;
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: "steer-budget",
      // No automatic resumes are authorized, yet the steer still resumes once.
      recovery: { max_resumes: 0, notes: "Automatic policy notes." },
      run: async (options) => {
        attempts += 1;
        if (attempts === 1) {
          const runDir = await writeAttempt(root, options.runId, { status: "failed", stopCode: "cancelled", sessionId: "saved-session" });
          await writeSteerRequest(runDir, options.runId, "Go on.");
          return { runId: options.runId, result: { status: "failed" } };
        }
        await writeAttempt(root, options.runId, { status: "passed", sessionId: "saved-session" });
        return { runId: options.runId, result: { status: "passed" } };
      },
    });
    expect(attempts).toBe(2);
    expect(result.runId).not.toBe("steer-budget");
    expect(result.result?.status).toBe("passed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("the completed-before-steer race records not_applied and does not resume", async () => {
  const root = await steerFixture();
  try {
    const firstRun = "steer-race-source";
    const steerMessage = "Nudge that arrives right before completion.";
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: firstRun,
      recovery: { max_resumes: 1, notes: "Automatic policy notes." },
      run: async (options) => {
        // The live attempt is running, steer request is written, but before
        // the stop takes effect the attempt finishes passed.
        const runDir = await writeAttempt(root, options.runId, { status: "running", sessionId: "saved-session" });
        await writeSteerRequest(runDir, options.runId, steerMessage);
        await writeAttempt(root, options.runId, { status: "passed", sessionId: "saved-session" });
        return { runId: options.runId, result: { status: "passed" } };
      },
    });
    // The attempt completed passed and was not resumed.
    expect(result.result?.status).toBe("passed");
    expect(result.runId).toBe(firstRun);
    // The steer request file was consumed / cleaned up.
    await expect(readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "steer-request.json"), "utf8")).rejects.toThrow();
    // An explicit not_applied record was written next to runtime-control.
    const record = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "steer-record.json"), "utf8"));
    const expectedDigest = createHash("sha256").update(steerMessage).digest("hex");
    expect(record).toMatchObject({
      status: "not_applied",
      reason: "attempt completed before the steer took effect",
      message_digest: expectedDigest,
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

/* -------------------------------------------------------------------------- */
/* A steer whose resume cannot be prepared is recorded, not dropped            */
/* -------------------------------------------------------------------------- */

/** Read the steer record an attempt left behind, failing clearly when there is none. */
async function readRecord(root: string, runId: string): Promise<{ status: string; reason: string; message_digest: string }> {
  return JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", runId, "steer-record.json"), "utf8"));
}

/**
 * Drive one attempt that cannot be resumed: `seed` lays down whatever artifacts
 * the failing state has, and the steer request arrives afterwards. The loop must
 * finish on that attempt alone, with the steer recorded rather than dropped.
 */
async function steerAnUnresumableAttempt(
  root: string,
  runId: string,
  message: string,
  seed: (runDir: string) => Promise<void>,
): Promise<void> {
  const result = await runWithRuntimeRecovery({
    root, missionId: "one", runtime: "command-code", runId,
    // A steer needs no automatic recovery policy, and none may be spent here.
    run: async (options) => {
      const runDir = path.join(root, ".harness", "missions", "one", "runs", options.runId);
      await mkdir(runDir, { recursive: true });
      await seed(runDir);
      await writeSteerRequest(runDir, options.runId, message);
      return { runId: options.runId, result: { status: "failed" } };
    },
  });
  expect(result.runId).toBe(runId);
}

test("a steer blocked by a concurrent policy stop records not_applied with that reason and consumes the request", async () => {
  const root = await steerFixture();
  const firstRun = "steer-policy-stop";
  const steerMessage = "Switch to the parser.";
  try {
    let attempts = 0;
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: firstRun,
      recovery: { max_resumes: 1, notes: "Automatic policy notes." },
      run: async (options) => {
        attempts += 1;
        // The attempt was stopped by policy while the steer's stop was in
        // flight, so its saved session cannot be resumed.
        const runDir = await writeAttempt(root, options.runId, { status: "failed", stopCode: "policy", sessionId: "saved-session" });
        await writeSteerRequest(runDir, options.runId, steerMessage);
        return { runId: options.runId, result: { status: "failed" } };
      },
    });
    // Nothing was restarted: no second attempt, and the source run is returned.
    expect(attempts).toBe(1);
    expect(result.runId).toBe(firstRun);
    expect(result.result?.status).toBe("failed");
    // The request is consumed, so no later attempt can replay it.
    await expect(readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "steer-request.json"), "utf8")).rejects.toThrow();
    // The message is recorded as refused, with the reason it was refused.
    const record = await readRecord(root, firstRun);
    expect(record).toMatchObject({
      schema_version: "uh.steer-record.v0",
      mission_id: "one",
      run_id: firstRun,
      status: "not_applied",
      reason: "Policy-stopped attempts cannot be automatically resumed",
      message_digest: createHash("sha256").update(steerMessage).digest("hex"),
    });
    // The attempt keeps its own stop: never relabelled `steered`, never restarted.
    const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", firstRun, "runtime-control.json"), "utf8"));
    expect(control).toMatchObject({ status: "failed", stop_code: "policy", session_id: "saved-session" });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("a steer whose saved session is missing is recorded, with a reason carrying no artifact paths", async () => {
  const root = await steerFixture();
  const runId = "steer-missing-session";
  const steerMessage = "Where did the session go?";
  try {
    // The attempt recorded no control receipt at all, so preparing its resume
    // fails on the filesystem with the absolute path in the error message.
    await steerAnUnresumableAttempt(root, runId, steerMessage, async () => {});
    const record = await readRecord(root, runId);
    expect(record).toMatchObject({
      status: "not_applied",
      message_digest: createHash("sha256").update(steerMessage).digest("hex"),
    });
    expect(record.reason).toMatch(/ENOENT/);
    expect(record.reason).not.toContain(root);
    expect(record.reason).not.toContain(path.join(".harness", "missions"));
    expect(record.reason).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(record.reason).not.toMatch(/(^|\s)[\\/][^\s]*runtime-control\.json/);
    await expect(readFile(path.join(root, ".harness", "missions", "one", "runs", runId, "steer-request.json"), "utf8")).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("a reason taken from a validation failure is collapsed to one bounded line", async () => {
  const root = await steerFixture();
  const runId = "steer-corrupt-receipt";
  const steerMessage = "Keep going.";
  try {
    await steerAnUnresumableAttempt(root, runId, steerMessage, async (runDir) => {
      await writeAttempt(root, runId, { status: "failed", stopCode: "stall", sessionId: "saved-session" });
      await writeFile(path.join(runDir, "runtime-control.json"), "{}");
    });
    const record = await readRecord(root, runId);
    expect(record.status).toBe("not_applied");
    // A multi-issue validation failure is far longer than the budget, so the
    // record proves both the bound and the whitespace collapsing.
    expect(record.reason.length).toBeLessThanOrEqual(240);
    expect(record.reason.length).toBeGreaterThan(200);
    expect(record.reason).toMatch(/\.\.\.$/);
    expect(record.reason).not.toMatch(/[\r\n]/);
    expect(record.reason).not.toMatch(/\s\s/);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("a steer request left by an unresumable attempt is never replayed by the next attempt", async () => {
  const root = await steerFixture();
  const firstRun = "steer-then-resume";
  try {
    let attempts = 0;
    const seen: string[] = [];
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: firstRun,
      recovery: { max_resumes: 1, notes: "Automatic policy notes." },
      run: async (options) => {
        attempts += 1;
        seen.push(options.runId);
        if (attempts === 1) {
          // Refused steer: recorded, consumed, and the attempt stays as it was.
          const runDir = await writeAttempt(root, options.runId, { status: "failed", stopCode: "policy", sessionId: "saved-session" });
          await writeSteerRequest(runDir, options.runId, "Refused message.");
          return { runId: options.runId, result: { status: "failed" } };
        }
        await writeAttempt(root, options.runId, { status: "passed", sessionId: "saved-session" });
        return { runId: options.runId, result: { status: "passed" } };
      },
    });
    // The refused steer did not resume, so there is exactly one attempt.
    expect(attempts).toBe(1);
    expect(seen).toEqual([firstRun]);
    expect(result.runId).toBe(firstRun);
    const record = await readRecord(root, firstRun);
    expect(record.reason).toBe("Policy-stopped attempts cannot be automatically resumed");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);

test("a normal steer still resumes the same session after a refused steer was recorded", async () => {
  const root = await steerFixture();
  try {
    const refused = "resumable-after-refusal";
    // First attempt: a steer that cannot be prepared and is recorded as such.
    await steerAnUnresumableAttempt(root, refused, "Refused message.", async () => {
      await writeAttempt(root, refused, { status: "failed", stopCode: "policy", sessionId: "saved-session" });
    });
    expect((await readRecord(root, refused)).status).toBe("not_applied");

    // Second attempt, on a resumable stop: the steer is applied as usual.
    const resumable = "resumable-target";
    const seen: Array<Record<string, unknown> | undefined> = [];
    const result = await runWithRuntimeRecovery({
      root, missionId: "one", runtime: "command-code", runId: resumable,
      recovery: { max_resumes: 0, notes: "Automatic policy notes." },
      run: async (options) => {
        seen.push(options.extraRuntimeConfigOverrides);
        const runDir = await writeAttempt(root, options.runId, { status: "failed", stopCode: "cancelled", sessionId: "saved-session" });
        if (options.runId === resumable) {
          await writeSteerRequest(runDir, options.runId, "Switch to the auth path.");
          return { runId: options.runId, result: { status: "failed" } };
        }
        await writeAttempt(root, options.runId, { status: "passed", sessionId: "saved-session" });
        return { runId: options.runId, result: { status: "passed" } };
      },
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ resume_from_run: resumable });
    expect(String(seen[1]?.recovery_notes)).toContain("Switch to the auth path.");
    expect(result.runId).not.toBe(resumable);
    expect(result.result?.status).toBe("passed");
    const control = JSON.parse(await readFile(path.join(root, ".harness", "missions", "one", "runs", resumable, "runtime-control.json"), "utf8"));
    expect(control.stop_code).toBe("steered");
    // The applied steer left no refusal record for its message.
    await expect(readFile(path.join(root, ".harness", "missions", "one", "runs", resumable, "steer-record.json"), "utf8")).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
}, 15000);
