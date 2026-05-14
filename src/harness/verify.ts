import { access, appendFile, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { parse, stringify } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { validateVerificationResult, type VerificationResultDocument } from "../schema/artifacts.js";
import { harnessDir, missionsDir, projectYaml } from "./paths.js";
import { validateFile } from "./validate.js";

const SNIPPET_LIMIT = 800;
const TIMEOUT_KILL_GRACE_MS = 100;
export const DEFAULT_VERIFY_COMMAND_TIMEOUT_MS = 30_000;

export type VerifyMissionOptions = {
  commandTimeoutMs?: number;
};

export type VerifyMissionResult = {
  mission_id: string;
  status: VerificationResultDocument["status"];
  path: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_blocked: number;
};

export async function verifyMission(root: string, missionId: string, options: VerifyMissionOptions = {}): Promise<VerifyMissionResult> {
  assertSafeMissionId(missionId);
  const commandTimeoutMs = normalizeCommandTimeoutMs(options.commandTimeoutMs);
  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);

  const missionRoot = path.resolve(missionsDir(projectRoot));
  const missionDir = path.resolve(missionRoot, missionId);
  const missionPath = path.resolve(missionDir, "mission.yaml");
  const verificationPath = path.resolve(missionDir, "verification.yaml");
  const eventsPath = path.resolve(missionDir, "events.ndjson");

  if (!isPathWithin(missionDir, missionRoot) || !isPathWithin(missionPath, missionDir) || !isPathWithin(verificationPath, missionDir) || !isPathWithin(eventsPath, missionDir)) {
    throw new Error(`Unsafe mission path for id: ${missionId}`);
  }

  await rejectSymlinkIfExists(missionRoot, "Missions directory");
  await rejectSymlinkIfExists(missionDir, "Mission directory");
  await rejectSymlinkIfExists(missionPath, "Mission file");
  await rejectSymlinkIfExists(verificationPath, "Verification file");
  await rejectSymlinkIfExists(eventsPath, "Mission events file");
  await assertExistingPathWithinIfExists(missionDir, missionRoot, "Mission directory");
  await assertExistingPathWithinIfExists(missionPath, missionDir, "Mission file");
  await assertExistingPathWithinIfExists(verificationPath, missionDir, "Verification file");
  await assertExistingPathWithinIfExists(eventsPath, missionDir, "Mission events file");

  const mission = await readMissionAtLocation(missionPath);
  if (mission.id !== missionId) {
    throw new Error(`Mission id mismatch: expected ${missionId}, got ${mission.id}`);
  }

  await appendMissionEvent(eventsPath, {
    type: "verification.started",
    mission_id: missionId,
    timestamp: new Date().toISOString(),
  });

  const checks: VerificationResultDocument["checks"] = [];
  const findings: NonNullable<VerificationResultDocument["findings"]> = [];
  let executableChecks = 0;

  for (const check of mission.verification.required_checks) {
    if (!check.command) {
      checks.push({
        name: check.name,
        type: "manual",
        status: "blocked",
        notes: "no command configured",
      });
      continue;
    }

    executableChecks += 1;
    const executed = await runCheck(projectRoot, check.name, check.command, commandTimeoutMs);
    checks.push(executed.check);
    if (executed.finding) {
      findings.push(executed.finding);
    }
  }

  if (checks.length === 0) {
    findings.push({ severity: "error", message: "no verification checks configured" });
  }

  const status: VerificationResultDocument["status"] = checks.some((check) => check.status === "failed")
    ? "failed"
    : checks.length > 0 && checks.every((check) => check.status === "passed") && executableChecks > 0
      ? "passed"
      : "blocked";

  const artifact: VerificationResultDocument = validateVerificationResult({
    schema_version: "uh.verification-result.v0",
    mission_id: missionId,
    status,
    checks,
    ...(findings.length > 0 ? { findings } : {}),
  });

  await writeFile(verificationPath, stringify(artifact), "utf-8");
  const validation = await validateFile(verificationPath);
  if (!validation.valid || validation.schema_version !== "uh.verification-result.v0") {
    throw new Error(`Generated verification failed validation: ${validation.errors.join("; ")}`);
  }

  await appendMissionEvent(eventsPath, {
    type: "verification.finished",
    mission_id: missionId,
    timestamp: new Date().toISOString(),
    status,
    checks_total: checks.length,
  });

  return {
    mission_id: missionId,
    status,
    path: verificationPath,
    checks_total: checks.length,
    checks_passed: checks.filter((check) => check.status === "passed").length,
    checks_failed: checks.filter((check) => check.status === "failed").length,
    checks_blocked: checks.filter((check) => check.status === "blocked").length,
  };
}

async function readMissionAtLocation(missionPath: string): Promise<MissionDocument> {
  const validation = await validateFile(missionPath);
  if (!validation.valid) {
    throw new Error(`Mission is invalid: ${validation.errors.join("; ")}`);
  }
  if (validation.schema_version !== "uh.mission.v0") {
    throw new Error(`Mission has wrong schema_version: expected uh.mission.v0, got ${validation.schema_version}`);
  }
  return validateMission(parse(await readFile(missionPath, "utf-8")));
}

async function runCheck(root: string, name: string, command: string, commandTimeoutMs: number): Promise<{
  check: VerificationResultDocument["checks"][number];
  finding?: NonNullable<VerificationResultDocument["findings"]>[number];
}> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: root,
      detached: true,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const appendBounded = (current: string, chunk: unknown): string => {
      if (current.length >= SNIPPET_LIMIT) {
        return current;
      }
      const next = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
      return (current + next).slice(0, SNIPPET_LIMIT);
    };

    const clearTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = undefined;
      }
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
    };

    const killChild = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) {
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Best effort only: the promise is resolved by the hard watchdog below.
        }
      }
    };

    const resolveTimeout = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      resolve({
        check: {
          name,
          type: "command",
          status: "failed",
          command,
          notes: buildTimeoutNotes(commandTimeoutMs, stdout, stderr),
        },
        finding: {
          severity: "error",
          message: `verification check timed out: ${name} after ${commandTimeoutMs}ms`,
        },
      });
    };

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });

    child.on("error", (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      resolve({
        check: {
          name,
          type: "command",
          status: "failed",
          command,
          notes: buildNotes(1, stdout, stderr || err.message),
        },
        finding: {
          severity: "error",
          message: `verification check failed: ${name}`,
        },
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (timedOut) {
        resolveTimeout();
        return;
      }
      settled = true;
      clearTimers();
      const exitCode = code ?? 1;
      if (exitCode === 0) {
        resolve({
          check: {
            name,
            type: "command",
            status: "passed",
            command,
            notes: buildNotes(0, stdout, stderr),
          },
        });
        return;
      }
      resolve({
        check: {
          name,
          type: "command",
          status: "failed",
          command,
          notes: buildNotes(exitCode, stdout, stderr),
        },
        finding: {
          severity: "error",
          message: `verification check failed: ${name}`,
        },
      });
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      killTimer = setTimeout(() => {
        killChild("SIGKILL");
        resolveTimeout();
      }, TIMEOUT_KILL_GRACE_MS);
    }, commandTimeoutMs);
  });
}

function normalizeCommandTimeoutMs(commandTimeoutMs: number | undefined): number {
  if (commandTimeoutMs === undefined) {
    return DEFAULT_VERIFY_COMMAND_TIMEOUT_MS;
  }
  if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs <= 0) {
    throw new Error(`commandTimeoutMs must be a positive integer, got ${commandTimeoutMs}`);
  }
  return commandTimeoutMs;
}

function buildTimeoutNotes(timeoutMs: number, stdout: string, stderr: string): string {
  const notes = [`timed out after ${timeoutMs}ms`];
  const stdoutSnippet = snippet(stdout);
  const stderrSnippet = snippet(stderr);
  if (stdoutSnippet) {
    notes.push(`stdout: ${stdoutSnippet}`);
  }
  if (stderrSnippet) {
    notes.push(`stderr: ${stderrSnippet}`);
  }
  return notes.join("\n");
}

function buildNotes(exitCode: number, stdout: string, stderr: string): string {
  const notes = [`exit_code: ${exitCode}`];
  const stdoutSnippet = snippet(stdout);
  const stderrSnippet = snippet(stderr);
  if (stdoutSnippet) {
    notes.push(`stdout: ${stdoutSnippet}`);
  }
  if (stderrSnippet) {
    notes.push(`stderr: ${stderrSnippet}`);
  }
  return notes.join("\n");
}

function snippet(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > SNIPPET_LIMIT ? `${trimmed.slice(0, SNIPPET_LIMIT)}…` : trimmed;
}

function assertSafeMissionId(id: string): void {
  if (path.isAbsolute(id) || id === "." || id === ".." || id.includes("/") || id.includes("\\") || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error(`Invalid mission id: ${id}. Use a safe mission slug without path separators.`);
  }
}

async function requireInitializedProject(root: string): Promise<void> {
  const projectPath = projectYaml(root);
  if (!(await fileExists(projectPath))) {
    throw new Error(`Harness project is not initialized: missing ${projectPath}. Run 'uh init' first.`);
  }
  const validation = await validateFile(projectPath);
  if (!validation.valid) {
    throw new Error(`Harness project is invalid: ${validation.errors.join("; ")}`);
  }
  if (validation.schema_version !== "uh.project.v0") {
    throw new Error(`Harness project has wrong schema_version: expected uh.project.v0, got ${validation.schema_version}`);
  }
}

async function appendMissionEvent(eventsPath: string, event: Record<string, unknown>): Promise<void> {
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf-8");
}

async function rejectSymlinkIfExists(filePath: string, label: string): Promise<void> {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink: ${filePath}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

async function assertExistingPathWithinIfExists(candidate: string, parent: string, label: string): Promise<void> {
  if (!(await fileExists(candidate))) {
    return;
  }
  const [candidateReal, parentReal] = await Promise.all([realpath(candidate), realpath(parent)]);
  if (!isPathWithin(candidateReal, parentReal)) {
    throw new Error(`${label} resolves outside expected directory: ${candidate}`);
  }
}

function isPathWithin(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
