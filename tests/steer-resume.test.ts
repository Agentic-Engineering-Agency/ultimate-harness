import { test, expect } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { planCommandCodeRun } from "../src/adapters/command-code.js";
import {
  prepareRuntimeResume,
  remainingResumeBudget,
  resumeConsumesBudget,
  runWithRuntimeRecovery,
} from "../src/harness/runtime-recovery.js";
import { generateRunId } from "../src/harness/run-id.js";
import { REPORT_REQUEST, resumeRun, steerRun } from "../src/harness/steer.js";

/** A project root with the harness and a Command Code adapter. */
async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-steer-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8")) as { config: Record<string, unknown> };
  manifest.config.cli_command = "cmdc";
  manifest.config.runtime_config = { model: "fixture/model", permission_mode: "yolo" };
  await writeFile(manifestPath, stringify(manifest));
  return root;
}

async function missionPacket(root: string, missionId: string): Promise<string> {
  const missionPath = path.join(root, ".harness", "missions", missionId, "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0", id: missionId, title: "Steer fixture", workflow_profile: "research-docs",
  }));
  return missionPath;
}

interface SeedOptions {
  runtime?: string;
  status?: string;
  stopCode?: string;
  sessionId?: string;
  controllerPid?: number;
}

/** Seed a discovered run's control/session/result without starting any runtime. */
async function seedRun(root: string, missionId: string, runId: string, options: SeedOptions = {}): Promise<string> {
  const runDir = path.join(root, ".harness", "missions", missionId, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const runtime = options.runtime ?? "command-code";
  const status = options.status ?? "passed";
  const now = new Date().toISOString();
  await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0", mission_id: missionId, run_id: runId, runtime,
    controller_pid: options.controllerPid ?? process.pid, started_at: now, heartbeat_at: now,
    status, turns: 1, denials: 0, inflight_tools: 0,
    ...(options.sessionId !== undefined ? { session_id: options.sessionId } : {}),
    ...(options.stopCode !== undefined ? { stop_code: options.stopCode } : {}),
  }));
  await writeFile(path.join(runDir, "runtime-session.yaml"), stringify({
    schema_version: "uh.runtime-session.v0", mission_id: missionId, runtime,
    status: status === "running" ? "running" : status === "passed" ? "succeeded" : "failed",
  }));
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0", mission_id: missionId, runtime,
    status: status === "passed" ? "passed" : "failed", started_at: now, finished_at: now,
    prompt_path: "prompt.md", stdout_path: "runtime.stdout.log", stderr_path: "runtime.stderr.log",
  }));
  return runDir;
}

function alive(pid: number) {
  return [{ pid, ppid: 1, name: "node.exe", command: "node" }];
}

const unusedCancel = async () => ({ ok: true, status: "cancelled" });

test("resume refuses a run that is still live and points at steer", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "live-run", { status: "running", sessionId: "s1", controllerPid: 4242 });
    let ran = false;
    let message = "";
    await resumeRun(root, "live-run", {}, {
      run: async () => { ran = true; return {}; },
      cancel: unusedCancel,
      processes: alive(4242),
    }).catch((error: Error) => { message = error.message; });
    expect(message).toMatch(/still live/);
    expect(message).toMatch(/steer/);
    expect(ran).toBe(false);
    const runs = await readdir(path.join(root, ".harness", "missions", "one", "runs"));
    expect(runs).toEqual(["live-run"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume of a settled Command Code run plans --resume <session_id> with the notes and records both links", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "source-run", { status: "passed", sessionId: "saved-session" });
    const newRunId = "20260922T101500Z-aaaaaa";
    let plannedArgs: string[] = [];
    let plannedPrompt = "";
    const result = await resumeRun(root, "source-run", { notes: "Focus on the parser next." }, {
      run: async (request) => {
        const plan = await planCommandCodeRun(request.artifactRoot, request.missionPath, {
          extraRuntimeConfigOverrides: { resume_from_run: request.sourceRunId, recovery_notes: request.recoveryNotes },
        });
        plannedArgs = plan.args;
        plannedPrompt = plan.prompt;
        return { runId: request.runId };
      },
      cancel: unusedCancel,
      processes: [],
      newRunId: () => newRunId,
    });
    expect(result).toMatchObject({ runId: newRunId, sourceRunId: "source-run", origin: "operator", report: false });
    const index = plannedArgs.indexOf("--resume");
    expect(index).toBeGreaterThan(-1);
    expect(plannedArgs[index + 1]).toBe("saved-session");
    expect(plannedPrompt).toContain("Focus on the parser next.");

    const runsDir = path.join(root, ".harness", "missions", "one", "runs");
    const forward = JSON.parse(await readFile(path.join(runsDir, newRunId, "resume-link.json"), "utf8"));
    expect(forward).toMatchObject({ schema_version: "uh.resume-link.v0", run_id: newRunId, resume_origin: "operator", resumed_from: "source-run" });
    const backward = JSON.parse(await readFile(path.join(runsDir, "source-run", "resume-link.json"), "utf8"));
    expect(backward).toMatchObject({ schema_version: "uh.resume-link.v0", run_id: "source-run", resume_origin: "operator", resumed_by: newRunId });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("steer cancels through the cancel path and then resumes with the message", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "active-run", { status: "running", sessionId: "s1", controllerPid: 4242 });
    const calls: string[] = [];
    let notes = "";
    const newRunId = "20260922T101600Z-bbbbbb";
    const result = await steerRun(root, "active-run", "Switch to the auth path.", {}, {
      run: async (request) => { calls.push("resume"); notes = request.recoveryNotes; return { runId: request.runId }; },
      cancel: async (cancelRoot, missionId, runId) => { calls.push(`cancel:${cancelRoot === root}:${missionId}:${runId}`); return { ok: true, status: "cancelled" }; },
      processes: alive(4242),
      newRunId: () => newRunId,
    });
    expect(calls).toEqual([`cancel:true:one:active-run`, "resume"]);
    expect(result).toMatchObject({ runId: newRunId, sourceRunId: "active-run", cancelled: true, origin: "operator" });
    expect(notes).toContain("Switch to the auth path.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("steer --report injects the fixed report request before the message", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "active-run", { status: "running", sessionId: "s1", controllerPid: 4242 });
    let notes = "";
    await steerRun(root, "active-run", "Keep going.", { report: true }, {
      run: async (request) => { notes = request.recoveryNotes; return { runId: request.runId }; },
      cancel: unusedCancel,
      processes: alive(4242),
      newRunId: () => "20260922T101700Z-cccccc",
    });
    expect(notes.startsWith(REPORT_REQUEST)).toBe(true);
    for (const heading of ["Done so far", "In progress", "Blocked on", "Next three actions", "Files touched"]) {
      expect(notes).toContain(heading);
    }
    expect(notes).toContain("Keep going.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a runtime with no session resume is refused and nothing changes", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "hermes-run", { runtime: "hermes", status: "passed", sessionId: "s1" });
    let ran = false;
    await expect(resumeRun(root, "hermes-run", {}, {
      run: async () => { ran = true; return {}; },
      cancel: unusedCancel,
      processes: [],
    })).rejects.toThrow("unsupported: hermes has no session resume");
    expect(ran).toBe(false);
    const runs = await readdir(path.join(root, ".harness", "missions", "one", "runs"));
    expect(runs).toEqual(["hermes-run"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator resumes do not consume the automatic max_resumes budget", async () => {
  expect(resumeConsumesBudget("operator")).toBe(false);
  expect(resumeConsumesBudget("policy")).toBe(true);
  expect(remainingResumeBudget(2, ["operator", "operator"])).toBe(2);
  expect(remainingResumeBudget(2, ["policy", "operator"])).toBe(1);
  expect(remainingResumeBudget(1, ["policy", "policy"])).toBe(0);

  const root = await project();
  try {
    await missionPacket(root, "one");
    const countAttempts = async (priorResumeOrigins: Array<"operator" | "policy">): Promise<number> => {
      let attempts = 0;
      await runWithRuntimeRecovery({
        root,
        missionId: "one",
        runtime: "command-code",
        runId: generateRunId(),
        recovery: { max_resumes: 1, notes: "Continue." },
        priorResumeOrigins,
        run: async (options) => {
          attempts += 1;
          await seedRun(root, "one", options.runId, { status: "failed", stopCode: "stall", sessionId: "saved-session" });
          return { runId: options.runId, result: { status: "failed" } };
        },
      });
      return attempts;
    };
    // An operator resume spends nothing, so the full budget still applies.
    expect(await countAttempts(["operator"])).toBe(2);
    // A policy resume already spent the single allowed resume.
    expect(await countAttempts(["policy"])).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prepareRuntimeResume tags the operator origin and leaves policy resumes as policy", async () => {
  const root = await project();
  try {
    await missionPacket(root, "one");
    await seedRun(root, "one", "origin-run", { status: "passed", sessionId: "saved-session" });
    const operator = await prepareRuntimeResume(root, "one", "origin-run", "command-code", "Note", "operator");
    expect(operator).toMatchObject({ origin: "operator", sessionId: "saved-session", sourceRunId: "origin-run" });
    const policy = await prepareRuntimeResume(root, "one", "origin-run", "command-code", "Note");
    expect(policy.origin).toBe("policy");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
