import { execFileSync, spawn } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parse, stringify } from "yaml";
import { RuntimeResultSchema, type PostCheckResult } from "../schema/artifacts.js";
import { RunsIndexSchema, type RunsIndex } from "../schema/runs.js";
import { exitCodeForRun } from "./exit-codes.js";
import { missionDir, missionLatestPointer, missionRunsIndex } from "./paths.js";
import { appendRunsIndexEntry, mirrorRuntimeResultToLatest, readLatestPointer, writeLatestPointer } from "./run-id.js";

/**
 * Operator post-checks: gates a `uh mission run` on checks the agent never sees.
 *
 * The checks live in a YAML/JSON file outside the mission directory. Neither
 * the checks-file path nor any command is persisted under the project root or
 * handed to the runtime: the artifact records names and outcomes only, and the
 * per-check output is written next to the checks file (outside the repository
 * in normal use).
 */

export const POST_CHECK_DEFAULT_TIMEOUT_MS = 900_000;
const TIMEOUT_KILL_GRACE_MS = 100;

/** Safe, log-friendly check name: no separators, no leading punctuation. */
export const POST_CHECK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const PostCheckEntrySchema = z.object({
  name: z.string().regex(POST_CHECK_NAME_PATTERN, "post-check name must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/"),
  command: z.string().min(1),
  timeout_ms: z.number().int().positive().default(POST_CHECK_DEFAULT_TIMEOUT_MS),
}).strict();

export const PostCheckFileSchema = z.array(PostCheckEntrySchema).superRefine((checks, ctx) => {
  const seen = new Set<string>();
  checks.forEach((check, index) => {
    if (seen.has(check.name)) {
      ctx.addIssue({ code: "custom", message: `duplicate post-check name: ${check.name}`, path: [index, "name"] });
    }
    seen.add(check.name);
  });
});

export type PostCheckEntry = z.infer<typeof PostCheckEntrySchema>;
export type { PostCheckResult };

export type PostChecksOutcome = {
  /** One entry per check, in execution order. Names and outcomes only. */
  results: PostCheckResult[];
  /** `post-check <name> failed` for each failed, timed-out or unrunnable check. */
  errors: string[];
};

export type RunPostChecksOptions = {
  checks: PostCheckEntry[];
  /** Absolute or cwd-relative path to the checks file; its directory owns the logs. */
  checksFile: string;
  missionId: string;
  runId: string;
  /** Absolute run artifact directory; `runtime-result.yaml` is rewritten in place. */
  runDir: string;
  /** Absolute project root, exported to checks as UH_ROOT. */
  root: string;
  /** Working root the checks run in (the bound sandbox worktree when routed). */
  cwd: string;
};

/**
 * Process exit code for a settled run, accounting for operator post-checks.
 *
 * A failed, timed-out or unrunnable post-check settles the run as `failed`, so
 * the exit code is always `exitCodeForRun("failed")` — never the runtime's own
 * stop code, which stays only as a record in `UH_RESULT`. Without a post-check
 * failure this is exactly `exitCodeForRun(status, stopCode)`, so an un-gated
 * run (or one whose checks all passed) is unchanged.
 */
export function postCheckExitCode(
  status?: string | null,
  stopCode?: string | null,
  postChecksFailed = false,
): number {
  if (postChecksFailed) return exitCodeForRun("failed");
  return exitCodeForRun(status, stopCode);
}

/**
 * Read and validate a post-checks file. The path resolves against the process
 * cwd, and the file may be YAML or JSON (the `yaml` package parses both).
 * A missing or malformed file throws; the caller is expected to treat that as
 * a blocked launch before any run directory exists.
 */
export async function loadPostChecks(filePath: string): Promise<PostCheckEntry[]> {
  const absolute = path.resolve(filePath);
  const raw = await readFile(absolute, "utf-8");
  return PostCheckFileSchema.parse(parse(raw));
}

type SingleCheckOutcome = {
  result: PostCheckResult;
  stdout: string;
  stderr: string;
};

/**
 * Run every check in order against the working root, then rewrite
 * `runtime-result.yaml` with the recorded outcomes and propagate them to the
 * mission-level mirror, `latest.json` and `runs/index.json`. A failed check
 * flips the recorded status to `failed` and appends `post-check <name> failed`
 * to errors; the same failure is reflected in every mission record that still
 * refers to this run. With no checks this is a no-op so an un-gated run stays
 * byte-identical.
 */
export async function runPostChecks(options: RunPostChecksOptions): Promise<PostChecksOutcome> {
  if (options.checks.length === 0) {
    return { results: [], errors: [] };
  }

  const runDir = path.resolve(options.runDir);
  const logsDir = path.join(path.dirname(path.resolve(options.checksFile)), "logs");
  await mkdir(logsDir, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    UH_MISSION_ID: options.missionId,
    UH_RUN_ID: options.runId,
    UH_RUN_DIR: runDir,
    UH_ROOT: path.resolve(options.root),
  };

  const results: PostCheckResult[] = [];
  const errors: string[] = [];
  for (const check of options.checks) {
    const outcome = await runSingleCheck(check, options.cwd, env);
    results.push(outcome.result);
    const logPath = path.join(logsDir, `${options.missionId}-${options.runId}-${check.name}.log`);
    await writeFile(logPath, `${outcome.stdout}${outcome.stderr}`, "utf-8");
    if (!outcome.result.passed) {
      errors.push(`post-check ${check.name} failed`);
    }
  }

  await recordPostChecks(path.join(runDir, "runtime-result.yaml"), results, errors);
  await recordMissionMirrors({
    root: options.root,
    missionId: options.missionId,
    runId: options.runId,
    failed: errors.length > 0,
  });
  return { results, errors };
}

/**
 * Propagate the post-check outcome to the mission-level records the runtime
 * wrote before the checks ran: the `runtime-result.yaml` mirror, `latest.json`
 * and `runs/index.json`. Each file is touched only when it already exists and
 * still refers to this run — a newer run's records are left alone.
 *
 * The mirror is refreshed whenever checks executed, so it carries the same
 * `post_checks` (and `errors`) as the run's own result. `latest.json` and the
 * index flip to `failed` only when a check failed; a fully passing run leaves
 * their status as the runtime recorded it. Reuses the run-artifact helpers so
 * the mission records stay schema-valid and transactionally written.
 */
async function recordMissionMirrors(options: {
  root: string;
  missionId: string;
  runId: string;
  failed: boolean;
}): Promise<void> {
  const { root, missionId, runId, failed } = options;

  const mirrorPath = path.join(missionDir(root, missionId), "runtime-result.yaml");
  if (await pathExists(mirrorPath)) {
    // The helper copies the run's (already rewritten) result verbatim and
    // no-ops when latest.json points at a different run.
    await mirrorRuntimeResultToLatest(root, missionId, runId);
  }

  if (!failed) return;

  const pointerPath = missionLatestPointer(root, missionId);
  if (await pathExists(pointerPath)) {
    const pointer = await readLatestPointer(root, missionId);
    if (pointer && pointer.run_id === runId && pointer.status !== "failed") {
      await writeLatestPointer(root, missionId, { ...pointer, status: "failed" });
    }
  }

  const indexPath = missionRunsIndex(root, missionId);
  if (!await pathExists(indexPath)) return;
  let index: RunsIndex;
  try {
    index = RunsIndexSchema.parse(JSON.parse(await readFile(indexPath, "utf-8")));
  } catch {
    return;
  }
  const entry = index.runs.find((run) => run.run_id === runId);
  if (!entry || entry.status === "failed") return;
  await appendRunsIndexEntry(root, missionId, { run_id: runId, started_at: entry.started_at, status: "failed" });
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Rewrite the run's `runtime-result.yaml` with the post-check outcomes. Only
 * names and outcomes are added; commands, paths and output never reach the
 * artifact. A missing or unreadable result is left untouched — the caller
 * still gates status and exit code on the returned errors.
 */
async function recordPostChecks(resultPath: string, results: PostCheckResult[], errors: string[]): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(resultPath, "utf-8");
  } catch {
    return;
  }
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return;
  }
  const document = parsed as Record<string, unknown>;
  document.post_checks = results;
  if (errors.length > 0) {
    document.status = "failed";
    const existing = Array.isArray(document.errors)
      ? document.errors.filter((entry): entry is string => typeof entry === "string")
      : [];
    document.errors = [...existing, ...errors];
  }
  const validated = RuntimeResultSchema.safeParse(document);
  if (!validated.success) {
    return;
  }
  await writeFile(resultPath, stringify(validated.data), "utf-8");
}

function runSingleCheck(check: PostCheckEntry, cwd: string, env: NodeJS.ProcessEnv): Promise<SingleCheckOutcome> {
  return new Promise<SingleCheckOutcome>((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let spawnError = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const child = spawn(check.command, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const clearTimers = () => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = undefined; }
      if (killTimer) { clearTimeout(killTimer); killTimer = undefined; }
    };
    const killTree = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          return;
        } catch {
          try { child.kill(signal); } catch { /* child already exited */ }
          return;
        }
      }
      try { process.kill(-child.pid, signal); } catch {
        try { child.kill(signal); } catch { /* best effort */ }
      }
    };
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({
        result: {
          name: check.name,
          passed: !timedOut && !spawnError && exitCode === 0,
          exit_code: timedOut || spawnError ? null : exitCode,
          duration_ms: Date.now() - startedAt,
        },
        stdout,
        stderr,
      });
    };

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

    child.on("error", (err) => {
      spawnError = true;
      stderr = stderr || err.message;
      finish(null);
    });
    child.on("close", (code) => {
      finish(timedOut ? null : (code ?? 1));
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      killTimer = setTimeout(() => {
        killTree("SIGKILL");
        finish(null);
      }, TIMEOUT_KILL_GRACE_MS);
    }, check.timeout_ms);
  });
}
