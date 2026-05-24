import { access, appendFile, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { parse, stringify } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { validateVerificationResult, type VerificationResultDocument } from "../schema/artifacts.js";
import { promoteMission } from "./promote.js";
import { harnessDir, missionsDir, projectYaml, sandboxesDir, sandboxesIndex } from "./paths.js";
import { validateFile } from "./validate.js";
import { SandboxesIndexSchema } from "../schema/artifacts.js";
import { classifyDiff } from "./diff-classifier.js";

const SNIPPET_LIMIT = 800;
const TIMEOUT_KILL_GRACE_MS = 100;
export const DEFAULT_VERIFY_COMMAND_TIMEOUT_MS = 30_000;

export type VerifyMissionOptions = {
  commandTimeoutMs?: number;
  /**
   * When true (default), `verifyMission` resolves the sandbox bound to the
   * mission via `.harness/sandboxes/index.yaml` and runs checks (and writes
   * artifacts) inside that worktree. Pass `false` to force checks to run in
   * the harness root regardless of bound sandboxes.
   */
  useSandbox?: boolean;
};

export type VerifyMissionResult = {
  mission_id: string;
  status: VerificationResultDocument["status"];
  path: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_blocked: number;
  acceptance_total: number;
  acceptance_passed: number;
  acceptance_failed_block: number;
  acceptance_warn_failed: number;
  acceptance_blocked: number;
  /**
   * Populated when verify auto-routed into a bound sandbox worktree. Undefined
   * when checks ran in the harness root.
   */
  sandbox?: { id: string; path: string };
  /**
   * S6 (#139): populated when a passed verification auto-triggered promotion
   * because the mission's `sandbox.promotion_policy` is "auto-on-verify".
   */
  promotion?: { decision: string; path: string };
  /** Set when an auto-promote was attempted but failed (verification still passed). */
  promotion_error?: string;
};

export async function verifyMission(root: string, missionId: string, options: VerifyMissionOptions = {}): Promise<VerifyMissionResult> {
  assertSafeMissionId(missionId);
  const commandTimeoutMs = normalizeCommandTimeoutMs(options.commandTimeoutMs);
  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);

  const useSandbox = options.useSandbox !== false;
  const boundSandbox = useSandbox ? await findBoundSandbox(projectRoot, missionId) : null;
  const effectiveRoot = boundSandbox ? boundSandbox.path : projectRoot;
  if (boundSandbox) {
    await rejectSymlinkIfExists(path.resolve(harnessDir(effectiveRoot)), "Harness directory");
    await requireInitializedProject(effectiveRoot);
  }

  const missionRoot = path.resolve(missionsDir(effectiveRoot));
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
    ...(boundSandbox ? { sandbox_id: boundSandbox.id } : {}),
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
    const executed = await runCheck(effectiveRoot, check.name, check.command, commandTimeoutMs);
    checks.push(executed.check);
    if (executed.finding) {
      findings.push(executed.finding);
    }
  }

  const acceptanceResults: NonNullable<VerificationResultDocument["acceptance_criteria"]> = [];
  for (const ac of mission.acceptance_criteria) {
    if (!ac.check_command) {
      acceptanceResults.push({
        id: ac.id,
        description: ac.description,
        status: "blocked",
        severity: ac.severity,
      });
      if (ac.severity === "block") {
        findings.push({
          severity: "error",
          message: `acceptance criterion ${ac.id} is severity=block but has no check_command; cannot verify`,
        });
      }
      await appendMissionEvent(eventsPath, {
        type: "acceptance.checked",
        mission_id: missionId,
        timestamp: new Date().toISOString(),
        ac_id: ac.id,
        status: "blocked",
        severity: ac.severity,
        reason: "no check_command configured",
      });
      continue;
    }
    const metrics = await runCommand(effectiveRoot, ac.check_command, commandTimeoutMs);
    const acStatus: VerificationResultDocument["status"] = metrics.timedOut || metrics.spawnError || metrics.exitCode !== 0 ? "failed" : "passed";
    acceptanceResults.push({
      id: ac.id,
      description: ac.description,
      status: acStatus,
      severity: ac.severity,
      check_command: ac.check_command,
      exit_code: metrics.exitCode,
      duration_ms: metrics.durationMs,
      stdout_snippet: snippet(metrics.stdout),
      stderr_snippet: snippet(metrics.stderr),
    });
    if (acStatus === "failed") {
      findings.push({
        severity: ac.severity === "block" ? "error" : "warning",
        message: `acceptance criterion ${ac.id} failed (${ac.severity}): ${ac.description}`,
      });
    }
    await appendMissionEvent(eventsPath, {
      type: "acceptance.checked",
      mission_id: missionId,
      timestamp: new Date().toISOString(),
      ac_id: ac.id,
      status: acStatus,
      severity: ac.severity,
      exit_code: metrics.exitCode,
      duration_ms: metrics.durationMs,
      timed_out: metrics.timedOut,
    });
  }

  // UH-55 TDD gate. When the mission opts in, classify the captured diff
  // and add a synthetic acceptance_criteria entry that blocks the run on
  // a tests-absent change. Treated as a regular AC for status escalation
  // and audit-trail purposes so consumers don't need a separate code path.
  if (mission.tdd?.enforce_tests_first) {
    const diffPath = path.resolve(missionDir, "diff.patch");
    let diffText = "";
    try {
      diffText = await readFile(diffPath, "utf-8");
    } catch {
      // No captured diff yet — the adapter didn't write one. Surface as a
      // blocked AC so verification cannot quietly pass without evidence.
    }
    const synthetic: { id: string; description: string; status: VerificationResultDocument["status"]; severity: "block"; check_command: string; exit_code: number; duration_ms: number; stdout_snippet?: string; stderr_snippet?: string } = {
      id: "ac-tdd-tests-precede-code",
      description: "TDD: every diff that touches source files must also touch tests",
      status: "passed",
      severity: "block",
      check_command: "(internal: tdd-test-first classifier)",
      exit_code: 0,
      duration_ms: 0,
    };
    if (diffText.length === 0) {
      synthetic.status = "blocked";
      synthetic.exit_code = 0;
      synthetic.stderr_snippet = `no diff.patch captured at ${diffPath}; adapter must write one before verify can gate TDD`;
      findings.push({ severity: "error", message: `TDD gate cannot run: no diff.patch at ${diffPath}` });
    } else {
      const classified = classifyDiff(diffText, {
        test_paths: mission.tdd.test_paths,
        source_paths: mission.tdd.source_paths,
      });
      if (classified.source.length > 0 && classified.tests.length === 0) {
        synthetic.status = "failed";
        synthetic.exit_code = 1;
        synthetic.stderr_snippet = snippet(
          `source files changed without tests:\n${classified.source.map((p) => `  - ${p}`).join("\n")}`,
        );
      } else {
        synthetic.status = "passed";
        synthetic.stdout_snippet = snippet(
          `tests=${classified.tests.length} source=${classified.source.length} other=${classified.other.length}`,
        );
      }
    }
    acceptanceResults.push(synthetic);
    if (synthetic.status === "failed") {
      findings.push({
        severity: "error",
        message: `TDD gate failed: source files changed without tests`,
      });
    }
    await appendMissionEvent(eventsPath, {
      type: "acceptance.checked",
      mission_id: missionId,
      timestamp: new Date().toISOString(),
      ac_id: synthetic.id,
      status: synthetic.status,
      severity: "block",
      synthetic: true,
      kind: "tdd-tests-precede-code",
    });
  }

  if (checks.length === 0) {
    findings.push({ severity: "error", message: "no verification checks configured" });
  }

  const anyBlockingAcFailed = acceptanceResults.some((r) => r.severity === "block" && r.status === "failed");
  const anyBlockingAcUnverified = acceptanceResults.some((r) => r.severity === "block" && r.status === "blocked");
  const status: VerificationResultDocument["status"] = anyBlockingAcFailed || checks.some((check) => check.status === "failed")
    ? "failed"
    : anyBlockingAcUnverified
      ? "blocked"
      : checks.length > 0 && checks.every((check) => check.status === "passed") && executableChecks > 0
        ? "passed"
        : "blocked";

  const artifact: VerificationResultDocument = validateVerificationResult({
    schema_version: "uh.verification-result.v0",
    mission_id: missionId,
    status,
    checks,
    ...(findings.length > 0 ? { findings } : {}),
    ...(acceptanceResults.length > 0 ? { acceptance_criteria: acceptanceResults } : {}),
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
    acceptance_total: acceptanceResults.length,
    acceptance_failed_block: acceptanceResults.filter((r) => r.severity === "block" && r.status === "failed").length,
    ...(boundSandbox ? { sandbox_id: boundSandbox.id } : {}),
  });

  // S6 (#139): verify-then-promote auto-trigger. Opt-in via the mission's
  // sandbox.promotion_policy = "auto-on-verify". Fires only on a passed
  // verification; any other policy (incl. the default "human-approved") still
  // requires a manual `uh mission promote`. Promote against effectiveRoot so
  // the promotion.yaml lands beside the verification.yaml just written.
  let promotion: { decision: string; path: string } | undefined;
  let promotionError: string | undefined;
  if (status === "passed" && mission.sandbox?.promotion_policy === "auto-on-verify") {
    try {
      const promoted = await promoteMission(effectiveRoot, missionId, {
        approvedBy: "auto-on-verify",
        decision: "promoted",
        ...(boundSandbox ? { sandboxId: boundSandbox.id } : {}),
      });
      promotion = { decision: promoted.decision, path: promoted.path };
      await appendMissionEvent(eventsPath, {
        type: "promotion.auto-triggered",
        mission_id: missionId,
        timestamp: new Date().toISOString(),
        decision: promoted.decision,
        ...(boundSandbox ? { sandbox_id: boundSandbox.id } : {}),
      });
    } catch (err) {
      promotionError = (err as Error).message;
      await appendMissionEvent(eventsPath, {
        type: "promotion.auto-failed",
        mission_id: missionId,
        timestamp: new Date().toISOString(),
        error: promotionError,
        ...(boundSandbox ? { sandbox_id: boundSandbox.id } : {}),
      });
    }
  }

  return {
    mission_id: missionId,
    status,
    path: verificationPath,
    checks_total: checks.length,
    checks_passed: checks.filter((check) => check.status === "passed").length,
    checks_failed: checks.filter((check) => check.status === "failed").length,
    checks_blocked: checks.filter((check) => check.status === "blocked").length,
    acceptance_total: acceptanceResults.length,
    acceptance_passed: acceptanceResults.filter((r) => r.status === "passed").length,
    acceptance_failed_block: acceptanceResults.filter((r) => r.severity === "block" && r.status === "failed").length,
    acceptance_warn_failed: acceptanceResults.filter((r) => r.severity === "warn" && r.status === "failed").length,
    acceptance_blocked: acceptanceResults.filter((r) => r.status === "blocked").length,
    ...(boundSandbox ? { sandbox: boundSandbox } : {}),
    ...(promotion ? { promotion } : {}),
    ...(promotionError ? { promotion_error: promotionError } : {}),
  };
}

export async function findBoundSandbox(
  projectRoot: string,
  missionId: string,
): Promise<{ id: string; path: string } | null> {
  const indexPath = sandboxesIndex(projectRoot);
  if (!(await fileExists(indexPath))) {
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    return null;
  }
  const result = SandboxesIndexSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  const sandboxesRoot = path.resolve(sandboxesDir(projectRoot));
  const candidates = result.data.sandboxes
    .filter((entry) => entry.mission_id === missionId && entry.status !== "discarded" && typeof entry.path === "string" && entry.path.length > 0)
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  for (const candidate of candidates) {
    if (!candidate.path) continue;
    const abs = path.resolve(projectRoot, candidate.path);
    if (!isPathWithin(abs, sandboxesRoot)) continue;
    if (!(await fileExists(abs))) continue;
    return { id: candidate.id, path: abs };
  }
  return null;
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

interface CommandRunMetrics {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  spawnError?: Error;
}

async function runCommand(root: string, command: string, commandTimeoutMs: number): Promise<CommandRunMetrics> {
  return new Promise<CommandRunMetrics>((resolve) => {
    const startedAt = Date.now();
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
      if (current.length >= SNIPPET_LIMIT) return current;
      const next = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk);
      return (current + next).slice(0, SNIPPET_LIMIT);
    };
    const clearTimers = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = undefined; }
      if (killTimer) { clearTimeout(killTimer); killTimer = undefined; }
    };
    const killChild = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, signal); } catch {
        try { child.kill(signal); } catch { /* best effort */ }
      }
    };
    const finish = (metrics: Omit<CommandRunMetrics, "durationMs"> & { durationMs?: number }) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ ...metrics, durationMs: metrics.durationMs ?? (Date.now() - startedAt) });
    };

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });

    child.on("error", (err) => {
      finish({ exitCode: 1, stdout, stderr: stderr || err.message, timedOut: false, spawnError: err });
    });
    child.on("close", (code) => {
      if (timedOut) {
        finish({ exitCode: code ?? 1, stdout, stderr, timedOut: true });
        return;
      }
      finish({ exitCode: code ?? 1, stdout, stderr, timedOut: false });
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      killTimer = setTimeout(() => {
        killChild("SIGKILL");
        finish({ exitCode: 124, stdout, stderr, timedOut: true });
      }, TIMEOUT_KILL_GRACE_MS);
    }, commandTimeoutMs);
  });
}

async function runCheck(root: string, name: string, command: string, commandTimeoutMs: number): Promise<{
  check: VerificationResultDocument["checks"][number];
  finding?: NonNullable<VerificationResultDocument["findings"]>[number];
}> {
  const metrics = await runCommand(root, command, commandTimeoutMs);
  if (metrics.spawnError) {
    return {
      check: { name, type: "command", status: "failed", command, notes: buildNotes(1, metrics.stdout, metrics.stderr) },
      finding: { severity: "error", message: `verification check failed: ${name}` },
    };
  }
  if (metrics.timedOut) {
    return {
      check: { name, type: "command", status: "failed", command, notes: buildTimeoutNotes(commandTimeoutMs, metrics.stdout, metrics.stderr) },
      finding: { severity: "error", message: `verification check timed out: ${name} after ${commandTimeoutMs}ms` },
    };
  }
  if (metrics.exitCode === 0) {
    return {
      check: { name, type: "command", status: "passed", command, notes: buildNotes(0, metrics.stdout, metrics.stderr) },
    };
  }
  return {
    check: { name, type: "command", status: "failed", command, notes: buildNotes(metrics.exitCode, metrics.stdout, metrics.stderr) },
    finding: { severity: "error", message: `verification check failed: ${name}` },
  };
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
