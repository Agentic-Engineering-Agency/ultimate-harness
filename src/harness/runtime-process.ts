import { createHash, randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, appendFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { RuntimeCancelRequestSchema, RuntimeControlSchema, RuntimeLimitsSchema, RuntimeRouteSchema, WindowsJobResultSchema, type RuntimeLimits, type RuntimeRoute, type RuntimeStopCode } from "../schema/runtime-control.js";
import { RuntimeSupervision } from "./runtime-supervision.js";
import { resolveRuntimeCommand } from "./runtime-command.js";
import type { RuntimeUsage } from "./usage.js";

const execFileAsync = promisify(execFile);

const GUARDIAN_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <startup>
    <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8" />
  </startup>
  <runtime>
    <AppContextSwitchOverrides value="Switch.System.IO.UseLegacyPathHandling=false;Switch.System.IO.BlockLongPaths=false" />
  </runtime>
</configuration>
`;


type GuardianInfo = { mode: "cache" | "per_run"; path: string };

function isPermissionError(error: unknown): boolean {
  let code = "";
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") code = error.code;
  return code === "EACCES" || code === "EPERM" || /access is denied|permission denied/i.test(String(error));
}

async function pathExists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function writeGuardianConfig(output: string): Promise<void> {
  const destination = `${output}.config`;
  const temporary = `${destination}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, GUARDIAN_CONFIG, { flag: "wx" });
    try { await rename(temporary, destination); }
    catch (error) { if (!await pathExists(destination)) throw error; }
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function compileGuardian(source: string, output: string, timeout: number): Promise<void> {
  await execFileAsync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File",
    fileURLToPath(new URL("../../src/harness/windows-job.ps1", import.meta.url)),
    "-Source", source, "-Output", output,
  ], { windowsHide: true, timeout, maxBuffer: 64 * 1024 });
}

async function prepareWindowsGuardian(jobDirectory: string, limits: RuntimeLimits): Promise<{ guardian: string; info: GuardianInfo }> {
  const source = fileURLToPath(new URL("../../src/harness/windows-job.cs", import.meta.url));
  const sourceHash = createHash("sha256").update(await readFile(source)).update(GUARDIAN_CONFIG).digest("hex").slice(0, 16);
  const cacheDirectory = path.join(process.env.LOCALAPPDATA || tmpdir(), "ultimate-harness", "guardian", sourceHash);
  const cachedGuardian = path.join(cacheDirectory, "windows-job.exe");
  const cachedConfig = `${cachedGuardian}.config`;
  const timeout = Math.min(limits.startup_timeout_ms ?? 30_000, limits.timeout_ms ?? 30_000);
  const compilePerRun = async (): Promise<{ guardian: string; info: GuardianInfo }> => {
    const guardian = path.join(jobDirectory, "windows-job.exe");
    await writeGuardianConfig(guardian);
    await compileGuardian(source, guardian, timeout);
    return { guardian, info: { mode: "per_run", path: guardian } };
  };

  try {
    await mkdir(cacheDirectory, { recursive: true });
    await access(cacheDirectory, fsConstants.W_OK);
  } catch (error) {
    if (isPermissionError(error)) return compilePerRun();
    throw error;
  }
  if (await pathExists(cachedGuardian)) {
    if (!await pathExists(cachedConfig)) await writeGuardianConfig(cachedGuardian);
    return { guardian: cachedGuardian, info: { mode: "cache", path: cachedGuardian } };
  }

  const temporary = path.join(cacheDirectory, `windows-job-${process.pid}-${randomUUID()}.tmp.exe`);
  try {
    try {
      await writeGuardianConfig(cachedGuardian);
      await compileGuardian(source, temporary, timeout);
      try { await rename(temporary, cachedGuardian); }
      catch (error) { if (!await pathExists(cachedGuardian)) throw error; }
      return { guardian: cachedGuardian, info: { mode: "cache", path: cachedGuardian } };
    } catch (error) {
      if (isPermissionError(error)) return compilePerRun();
      throw error;
    }
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export interface RuntimeProcessInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  limits?: RuntimeLimits;
  onDeadline?: { grace_turns: number; grace_timeout_ms: number };
  permissionMode?: "guard" | "yolo" | "prompt";
  guardLogPath?: string;
  expectedRoute?: RuntimeRoute;
  reviewRequestSha256?: string;
  env?: NodeJS.ProcessEnv;
  onStdoutChunk?: (chunk: string) => void | Promise<void>;
  getUsage?: () => RuntimeUsage | undefined;
  cancellationSignal?: AbortSignal;
  artifacts?: { directory: string; missionId: string; runId: string; runtime: string };
}
export interface RuntimeProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  cancelled?: boolean;
  spawnError?: string;
  sessionId?: string;
  peakMemoryBytes?: number;
  settlementConfirmed?: boolean;
  outputTruncated?: boolean;
  nativeTerminal?: boolean;
  nativeTerminalFailure?: string;
  supervisionStopCode?: RuntimeStopCode;
}

/** Only accepts the ChildProcess handle allocated by this runner; never searches by title/PID. */
function terminate(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); return; } catch { /* Already exited. */ }
  }
  child.kill("SIGKILL");
}

/** Owns launch, live capture, supervision, cancellation and settlement in one invocation. */
export async function runRuntimeProcess(input: RuntimeProcessInput): Promise<RuntimeProcessOutput> {
  const limits = RuntimeLimitsSchema.parse({ ...input.limits,
    ...(input.timeoutMs === undefined ? {} : { timeout_ms: input.timeoutMs }) });
  const started = Date.now();
  const expectedRoute = input.expectedRoute === undefined ? undefined : RuntimeRouteSchema.parse(input.expectedRoute);
  const supervisor = new RuntimeSupervision(limits, started, expectedRoute, input.cwd, input.permissionMode, input.guardLogPath, input.onDeadline);
  const scope = input.artifacts;
  let stdout = "", stderr = "", partial = "";
  const maxOutputBytes = limits.max_output_bytes ?? 64 * 1024 * 1024;
  let capturedBytes = 0;
  let outputLimitReached = false;
  let timedOut = false, cancelled = false, stopReason: string | undefined;
  let stopCode: RuntimeStopCode | undefined;
  let peakMemoryBytes: number | undefined, settlementConfirmed: boolean | undefined;
  let writes = Promise.resolve();
  let streamError: string | undefined;
  let lastHeartbeat = 0;
  let finished = false;
  let polling = false;
  let activePoll: Promise<void> = Promise.resolve();
  let guardianInfo: GuardianInfo | undefined;
  const persist = async (status: "running" | "passed" | "failed" | "cancelled"): Promise<void> => {
    if (!scope) return;
    await writeAtomicArtifact(path.join(scope.directory, "runtime-control.json"), JSON.stringify(RuntimeControlSchema.parse({
      schema_version: "uh.runtime-control.v0", mission_id: scope.missionId, run_id: scope.runId,
      runtime: scope.runtime, controller_pid: process.pid, started_at: new Date(started).toISOString(),
      heartbeat_at: new Date().toISOString(), status, permission_mode: input.permissionMode,
      guard_armed: supervisor.guardArmed, stop_reason: stopReason,
      stop_code: stopCode ?? supervisor.stopCode ?? (cancelled ? "cancelled" : supervisor.terminalFailure ? "runtime_error" : undefined),
      ready_at: supervisor.readyAt === undefined ? undefined : new Date(supervisor.readyAt).toISOString(),
      session_id: supervisor.sessionId, turns: supervisor.turns, denials: supervisor.denials,
      expected_route: expectedRoute,
      review_request_sha256: input.reviewRequestSha256,
      guardian: guardianInfo,
      inflight_tools: supervisor.inflight.size,
      usage: input.getUsage?.(),
      peak_memory_bytes: peakMemoryBytes, settlement_confirmed: settlementConfirmed,
    })));
  };
  if (scope) {
    await mkdir(scope.directory, { recursive: true });
    // Existing attempts must not have their evidence truncated by an accidental retry.
    await writeFile(path.join(scope.directory, "runtime.stdout.log"), "", { flag: "wx" });
    await writeFile(path.join(scope.directory, "runtime.stderr.log"), "", { flag: "wx" });
    await persist("running");
  }
  if (input.cancellationSignal?.aborted) {
    cancelled = true;
    stopReason = "Cancelled before launch";
    await persist("cancelled");
    return { stdout, stderr, exitCode: 130, timedOut, cancelled };
  }
  if (limits.memory_mb && process.platform !== "win32") {
    throw new Error("A committed process-tree memory cap requires the Windows Job backend; no unenforced fallback is permitted");
  }
  const executable = await resolveRuntimeCommand(input.command, input.args, input.env);
  const temporaryJobDirectory = process.platform === "win32" && !scope ? await mkdtemp(path.join(tmpdir(), "uh-job-")) : undefined;
  const jobDirectory = scope?.directory ?? temporaryJobDirectory;
  let stopWrite: Promise<void> | undefined;
  let guardian: string | undefined;
  if (process.platform === "win32") {
    try {
      const prepared = await prepareWindowsGuardian(jobDirectory!, limits);
      guardian = prepared.guardian;
      guardianInfo = prepared.info;
      await persist("running");
    } catch (error) {
      stopReason = supervisor.check(Date.now()) ?? `Windows guardian compilation failed: ${String(error)}`;
      stopCode = supervisor.stopCode ?? "controller_error";
      timedOut = stopCode === "startup" || stopCode === "timeout";
      await persist("failed");
      if (temporaryJobDirectory) await rm(temporaryJobDirectory, { recursive: true, force: true }).catch(() => {});
      return { stdout, stderr, exitCode: 1, timedOut, spawnError: stopReason };
    }
  }
  const launch = process.platform === "win32" ? {
    command: guardian!,
    args: [],
    env: input.env,
    specification: JSON.stringify({
      command: executable.command, args: executable.args, cwd: input.cwd, parentPid: process.pid,
      memoryBytes: (limits.memory_mb ?? 0) * 1024 * 1024,
      resultPath: path.join(jobDirectory!, "windows-job-result.json"),
      stopPath: path.join(jobDirectory!, ".windows-job-stop"),
      controlPath: scope ? path.join(scope.directory, "runtime-control.json") : undefined,
    }),
  } : { ...executable, env: input.env };
  return new Promise<RuntimeProcessOutput>((resolve) => {
    const child = spawn(launch.command, launch.args, {
      // The Windows guardian must outlive libuv's kill-on-parent-exit job to settle its own job.
      cwd: input.cwd, env: launch.env, detached: true,
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.on("error", () => { /* Spawn errors and early process exits are handled below. */ });
    child.stdin?.end("specification" in launch ? launch.specification : undefined);
    const stop = (reason: string, code: RuntimeStopCode = "controller_error"): void => {
      if (!stopReason || code === "policy") { stopReason = reason; stopCode = code; }
      timedOut ||= code === "timeout" || code === "startup" || code === "stall";
      if (!finished) {
        if (process.platform === "win32") {
          stopWrite ??= writeFile(path.join(jobDirectory!, ".windows-job-stop"), "", { flag: "wx" })
            .catch(error => { if (error.code !== "EEXIST") terminate(child); });
        } else terminate(child);
      }
    };
    const admitOutput = (chunk: string): boolean => {
      if (outputLimitReached) return false;
      const bytes = Buffer.byteLength(chunk, "utf8");
      if (bytes > maxOutputBytes - capturedBytes) {
        outputLimitReached = true;
        stop(`Combined runtime output exceeded ${maxOutputBytes} bytes; capture stopped`, "output_limit");
        return false;
      }
      capturedBytes += bytes;
      return true;
    };
    const cancel = (): void => { cancelled = true; stop("Run cancelled", "cancelled"); };
    input.cancellationSignal?.addEventListener("abort", cancel, { once: true });
    const enqueue = (operation: () => Promise<void>): Promise<void> => {
      writes = writes.then(operation).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        streamError ??= detail.trim().slice(0, 512) || "unknown failure";
        stop(`Runtime artifact or stream callback failed: ${streamError}`);
      });
      return writes;
    };
    const observe = (line: string): void => {
      try {
        const reason = supervisor.observe(JSON.parse(line), Date.now());
        if (reason) stop(reason, supervisor.stopCode);
      } catch { /* Preserve malformed and partial bytes; the adapter classifies them. */ }
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (!admitOutput(chunk)) return;
      child.stdout!.pause();
      stdout += chunk;
      let start = 0;
      for (let end = chunk.indexOf("\n"); end !== -1; end = chunk.indexOf("\n", start)) {
        observe(partial + chunk.slice(start, end));
        partial = "";
        start = end + 1;
      }
      partial += chunk.slice(start);
      enqueue(async () => {
        if (scope) await appendFile(path.join(scope.directory, "runtime.stdout.log"), chunk);
        await input.onStdoutChunk?.(chunk);
        await persist("running");
      }).finally(() => child.stdout?.resume());
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (!admitOutput(chunk)) return;
      child.stderr!.pause();
      stderr += chunk;
      const session = /session:\s*([0-9a-fA-F-]{8,})/.exec(stderr.slice(-1024));
      if (session) supervisor.sessionId = session[1];
      enqueue(async () => {
        if (scope) await appendFile(path.join(scope.directory, "runtime.stderr.log"), chunk);
      }).finally(() => child.stderr?.resume());
    });
    const timer = setInterval(() => {
      if (finished || polling) return;
      polling = true;
      activePoll = (async () => {
        const reason = supervisor.check(Date.now());
        if (reason) stop(reason, supervisor.stopCode);
        if (scope) {
          try {
            const request = RuntimeCancelRequestSchema.parse(JSON.parse(await readFile(path.join(scope.directory, "cancel-request.json"), "utf8")));
            if (request.mission_id === scope.missionId && request.run_id === scope.runId) cancel();
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") stop("Malformed or unreadable cancellation request");
          }
        }
        if (!finished && Date.now() - lastHeartbeat >= 1000) {
          lastHeartbeat = Date.now();
          enqueue(() => persist("running"));
        }
      })().catch(() => stop("Runtime supervision failed")).finally(() => { polling = false; });
    }, 100);
    let spawnError: string | undefined;
    child.on("error", (error: Error) => { spawnError = error.message; });
    child.on("close", (code: number | null) => {
      finished = true;
      clearInterval(timer);
      input.cancellationSignal?.removeEventListener("abort", cancel);
      if (partial.trim()) observe(partial);
      void (async () => {
        await activePoll;
        await writes;
        await stopWrite;
        if (process.platform === "win32") {
          try {
            const job = WindowsJobResultSchema.parse(JSON.parse((await readFile(path.join(jobDirectory!, "windows-job-result.json"), "utf8")).replace(/^\uFEFF/, "")));
            peakMemoryBytes = job.peak_memory_bytes;
            settlementConfirmed = job.settled;
          } catch { settlementConfirmed = false; }
          if (!settlementConfirmed) {
            stopReason = "Owned process-tree settlement was not confirmed";
            stopCode = "controller_error";
          }
        }
        const supervisionFailure = supervisor.settle();
        if (!stopReason && supervisionFailure) { stopReason = supervisionFailure; stopCode = supervisor.stopCode; }
        const nativeCompleted = supervisor.terminal && !supervisor.terminalFailure && !supervisor.stopCode &&
          !cancelled && !timedOut && !spawnError;
        const exitCode = cancelled ? 130 : stopReason || spawnError || supervisor.terminalFailure ? 1 : code ?? 1;
        const settledStatus = cancelled ? "cancelled" : nativeCompleted || exitCode === 0 ? "passed" : "failed";
        try { await persist(settledStatus); }
        catch { spawnError ??= "Runtime final state persistence failed"; }
        if (temporaryJobDirectory) await rm(temporaryJobDirectory, { recursive: true, force: true }).catch(() => {});
        const reportedStreamFailure = streamError
          ? `Runtime artifact or stream callback failed: ${streamError}`
          : undefined;
        resolve({ stdout, stderr, exitCode: spawnError && exitCode === 0 ? 1 : exitCode, timedOut,
          cancelled, spawnError: spawnError ?? (stopCode === "policy" ? stopReason : reportedStreamFailure ?? stopReason), sessionId: supervisor.sessionId, peakMemoryBytes, settlementConfirmed,
          outputTruncated: outputLimitReached, nativeTerminal: supervisor.terminal, nativeTerminalFailure: supervisor.terminalFailure,
          supervisionStopCode: supervisor.stopCode });
      })();
    });
  });
}
