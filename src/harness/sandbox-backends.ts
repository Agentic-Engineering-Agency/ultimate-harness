import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "./mission.js";
import { runRuntimeProcess } from "./runtime-process.js";

const execFileP = promisify(execFile);
const OPENSANDBOX_METADATA = ".uh-opensandbox.json";
const COMMAND_OUTPUT_LIMIT = 4000;

/**
 * Sandbox backend abstraction (S3 #136).
 *
 * A sandbox is an isolated working copy of the repo where an agent runs a
 * mission; the harness then inspects/promotes the result. The orchestration
 * (index + metadata + path-safety) lives in `sandbox.ts`; the backend-specific
 * mechanics — how the working copy is materialized, torn down, and how
 * dirtiness is detected — live here behind a single interface so new backends
 * (directory, container, …) drop in without touching the orchestrator.
 */

export interface SandboxMaterializeContext {
  /** Project root (a git repository). */
  root: string;
  sandboxId: string;
  /** Absolute path where the working copy must be created. */
  worktreePath: string;
  /** Git ref to fork from (default "HEAD"). */
  baseRef: string;
}

export interface SandboxMaterializeResult {
  branch: string;
  base_ref: string;
}

export interface SandboxTeardownContext {
  root: string;
  worktreePath: string;
  branch: string;
}

export interface SandboxTeardownOptions {
  force: boolean;
  keepBranch: boolean;
}

export interface SandboxBackend {
  readonly name: string;
  /** Create the working copy at `ctx.worktreePath`. */
  materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult>;
  /** Tear down the working copy. The orchestrator removes the enclosing sandbox dir afterwards. */
  teardown(ctx: SandboxTeardownContext, opts: SandboxTeardownOptions): Promise<{ branch_removed: boolean }>;
  /** Porcelain list of dirty paths in the working copy. */
  collectDirtyChanges(worktreePath: string): Promise<string[]>;
}

/** Injectable git seam: every backend runs git through this signature. */
export type GitRunner = (cwd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const res = await execFileP("git", ["-C", cwd, ...args]);
    return { stdout: String(res.stdout), stderr: String(res.stderr) };
  } catch (err) {
    const e = err as { message: string; stderr?: string | Buffer; stdout?: string | Buffer };
    const stderr = e.stderr ? String(e.stderr).trim() : "";
    const stdout = e.stdout ? String(e.stdout).trim() : "";
    const detail = stderr || stdout || e.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

async function gitStatusPorcelain(worktreePath: string): Promise<string[]> {
  if (!(await fileExists(worktreePath))) {
    throw new Error(`Sandbox worktree missing: ${worktreePath}`);
  }
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  return stdout.split("\n").filter((line) => line.length > 0);
}

/**
 * `git worktree unlock <path>`, tolerating the "is not locked" no-op. A
 * worktree created before locking existed (or already unlocked) reports that
 * message, which must not abort teardown.
 */
async function unlockWorktree(root: string, worktreePath: string): Promise<void> {
  try {
    await runGit(root, ["worktree", "unlock", worktreePath]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/is not locked/i.test(message)) throw err;
  }
}

/**
 * `git worktree add` is not safe to run concurrently against one repository:
 * parallel adds race on `.git/worktrees/<name>/commondir` and one fails with
 * "failed to read .../commondir". Adds from this process are chained per
 * repository root; other git commands are unaffected.
 */
const worktreeAddQueues = new Map<string, Promise<unknown>>();

function serializedWorktreeAdd<T>(root: string, run: () => Promise<T>): Promise<T> {
  const key = path.resolve(root);
  const previous = worktreeAddQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  const settled = next.catch(() => undefined);
  worktreeAddQueues.set(key, settled);
  void settled.then(() => {
    if (worktreeAddQueues.get(key) === settled) worktreeAddQueues.delete(key);
  });
  return next;
}

/**
 * Default backend: a `git worktree` sharing the project's object store on a
 * dedicated `sandbox/<id>` branch. Cheap, but ties the sandbox to the parent
 * repo's worktree registry and branch namespace.
 */
export class GitWorktreeBackend implements SandboxBackend {
  readonly name = "git-worktree";

  async materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult> {
    const branch = `sandbox/${ctx.sandboxId}`;
    // Lock the registration so a `git worktree prune` run elsewhere (another
    // controller, or a removable/network volume that is briefly unmounted)
    // cannot delete this worktree's administrative entry behind our back.
    // No run id is in scope here, so the branch name is the lock identifier.
    await serializedWorktreeAdd(ctx.root, () => runGit(ctx.root, [
      "worktree", "add", "--lock", "--reason", `uh:${branch}`, "-b", branch, ctx.worktreePath, ctx.baseRef,
    ]));
    return { branch, base_ref: ctx.baseRef };
  }

  async teardown(ctx: SandboxTeardownContext, opts: SandboxTeardownOptions): Promise<{ branch_removed: boolean }> {
    if (await fileExists(ctx.worktreePath)) {
      await unlockWorktree(ctx.root, ctx.worktreePath);
      const removeArgs = ["worktree", "remove"];
      if (opts.force) removeArgs.push("--force");
      removeArgs.push(ctx.worktreePath);
      await runGit(ctx.root, removeArgs);
    } else {
      // The directory vanished out-of-band (deleted, or a removable/network
      // volume is unmounted). Drop only THIS registration: unlock, then a
      // forced remove. We never run a global `git worktree prune` — that would
      // also delete every other worktree whose directory is missing right now,
      // including ones owned by other controllers. If git still refuses, leave
      // the orphan in place; `git worktree list` surfaces it to the operator.
      try { await runGit(ctx.root, ["worktree", "unlock", ctx.worktreePath]); } catch { /* tolerated */ }
      try { await runGit(ctx.root, ["worktree", "remove", "--force", ctx.worktreePath]); } catch { /* tolerated */ }
    }

    let branchRemoved = false;
    if (ctx.branch && !opts.keepBranch) {
      try {
        await runGit(ctx.root, ["branch", "-D", ctx.branch]);
        branchRemoved = true;
      } catch {
        branchRemoved = false;
      }
    }
    return { branch_removed: branchRemoved };
  }

  collectDirtyChanges(worktreePath: string): Promise<string[]> {
    return gitStatusPorcelain(worktreePath);
  }
}

/**
 * Directory backend: a self-contained local clone of the repo (object store
 * hard-linked, so it's cheap) checked out on a `sandbox/<id>` branch. Unlike
 * the worktree backend it does not register with the parent repo or consume the
 * parent's branch namespace — discarding it is a plain directory removal, so it
 * survives parent-repo gc/branch churn. Useful when a sandbox must outlive or
 * stay isolated from the host worktree.
 */
export class DirectoryBackend implements SandboxBackend {
  readonly name = "directory";
  private readonly git: GitRunner;

  constructor(git: GitRunner = runGit) {
    this.git = git;
  }

  async materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult> {
    await this.clone(ctx);
    if (ctx.baseRef && ctx.baseRef !== "HEAD") {
      await this.git(ctx.worktreePath, ["checkout", "--quiet", ctx.baseRef]);
    }
    const branch = `sandbox/${ctx.sandboxId}`;
    await this.git(ctx.worktreePath, ["checkout", "--quiet", "-b", branch]);
    return { branch, base_ref: ctx.baseRef };
  }

  /**
   * `git clone --local` hard-links the object store to keep the clone cheap.
   * That only works when the sandbox shares a filesystem with the repository:
   * for a linked worktree whose common git directory lives on another drive, or
   * a network share, git fails with "failed to create link ... Improper link".
   * On that failure only, remove the partial target directory and retry once
   * without hardlinks. Any other clone failure is reported as-is.
   */
  private async clone(ctx: SandboxMaterializeContext): Promise<void> {
    const target = ["--quiet", "--", ctx.root, ctx.worktreePath];
    try {
      await this.git(ctx.root, ["clone", "--local", ...target]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/failed to create link/i.test(message)) throw err;
      await rm(ctx.worktreePath, { recursive: true, force: true });
      await this.git(ctx.root, ["clone", "--no-hardlinks", ...target]);
    }
  }

  async teardown(_ctx: SandboxTeardownContext, _opts: SandboxTeardownOptions): Promise<{ branch_removed: boolean }> {
    // The clone is self-contained: the branch lives inside the clone, which the
    // orchestrator removes wholesale. Nothing to unregister in the parent repo.
    return { branch_removed: false };
  }

  collectDirtyChanges(worktreePath: string): Promise<string[]> {
    return gitStatusPorcelain(worktreePath);
  }
}

const OPENSANDBOX_CONFIG_HELP =
  "Configure OpenSandbox with UH_OPENSANDBOX_MODE=mock for tests, or " +
  "UH_OPENSANDBOX_ENABLED=1 plus UH_OPENSANDBOX_EXEC_COMMAND for local smoke. " +
  "See docs/runbooks/container-sandbox.md.";

type OpenSandboxConfig = {
  mode: "mock" | "command";
  image: string;
  execCommandTemplate?: string;
  createCommandTemplate?: string;
  deleteCommandTemplate?: string;
  lifecycleTimeoutMs: number;
};

export interface SandboxCommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  spawnError?: Error;
}

function readOpenSandboxConfig(env: NodeJS.ProcessEnv = process.env): OpenSandboxConfig {
  const config = tryReadOpenSandboxConfig(env);
  if (!config) {
    throw new Error(`OpenSandbox container backend is not configured. ${OPENSANDBOX_CONFIG_HELP}`);
  }
  return config;
}

function tryReadOpenSandboxConfig(env: NodeJS.ProcessEnv = process.env): OpenSandboxConfig | undefined {
  const mode = env.UH_OPENSANDBOX_MODE === "mock" ? "mock" : "command";
  const enabled = env.UH_OPENSANDBOX_ENABLED === "1" || env.UH_OPENSANDBOX_ENABLED === "true" || mode === "mock";
  if (!enabled) return undefined;
  const image = env.UH_OPENSANDBOX_IMAGE ?? "python:3.12";
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$/.test(image)) {
    throw new Error(`Invalid UH_OPENSANDBOX_IMAGE: ${image}`);
  }
  const lifecycleTimeoutMs = parseLifecycleTimeoutMs(env.UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS);
  if (mode === "mock") return { mode, image, lifecycleTimeoutMs };

  const execCommandTemplate = env.UH_OPENSANDBOX_EXEC_COMMAND;
  if (!execCommandTemplate || !execCommandTemplate.includes("{command}")) {
    throw new Error(
      "UH_OPENSANDBOX_EXEC_COMMAND is required and must include {command}; " +
      "available placeholders: {command}, {cwd}, {image}, {timeout_ms}.",
    );
  }
  return {
    mode,
    image,
    execCommandTemplate,
    createCommandTemplate: env.UH_OPENSANDBOX_CREATE_COMMAND,
    deleteCommandTemplate: env.UH_OPENSANDBOX_DELETE_COMMAND,
    lifecycleTimeoutMs,
  };
}

function parseLifecycleTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 30_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid UH_OPENSANDBOX_LIFECYCLE_TIMEOUT_MS: ${raw}. Expected a positive integer (milliseconds).`,
    );
  }
  return parsed;
}

/**
 * OpenSandbox-backed execution backend (#155).
 *
 * The host working copy is still a self-contained directory clone so dirty
 * detection and promotion remain compatible. Execution isolation is represented
 * by the separate OpenSandbox command seam below; callers must use that seam for
 * mission/verification commands and must not treat the host clone alone as a
 * container sandbox.
 */
export class ContainerBackend implements SandboxBackend {
  readonly name = "container";
  private readonly directory = new DirectoryBackend();

  async materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult> {
    const config = readOpenSandboxConfig();
    const result = await this.directory.materialize(ctx);
    try {
      if (config.mode === "command" && config.createCommandTemplate) {
        const created = await runOpenSandboxTemplate(config.createCommandTemplate, { command: "", cwd: ctx.worktreePath, image: config.image, timeoutMs: config.lifecycleTimeoutMs });
        if (created.exitCode !== 0) throw new Error(`OpenSandbox create command failed: ${created.stderr || created.stdout || `exit ${created.exitCode}`}`);
      }
      const metadataPath = path.join(path.dirname(ctx.worktreePath), OPENSANDBOX_METADATA);
      await mkdir(path.dirname(metadataPath), { recursive: true });
      await writeFile(
        metadataPath,
        JSON.stringify({ provider: "opensandbox", mode: config.mode, image: config.image, created_at: new Date().toISOString() }, null, 2),
        "utf-8",
      );
      return result;
    } catch (err) {
      await this.directory.teardown({ root: ctx.root, worktreePath: ctx.worktreePath, branch: result.branch }, { force: true, keepBranch: false });
      throw err;
    }
  }

  async teardown(ctx: SandboxTeardownContext, _opts: SandboxTeardownOptions): Promise<{ branch_removed: boolean }> {
    const config = tryReadOpenSandboxConfig();
    if (config?.mode === "command" && config.deleteCommandTemplate) {
      // Force/orphan discards must still call the provider so external sandbox
      // resources don't leak when the local worktree has already been removed.
      const worktreeExists = await fileExists(ctx.worktreePath);
      const spawnCwd = worktreeExists ? ctx.worktreePath : ctx.root;
      const deleted = await runOpenSandboxTemplate(
        config.deleteCommandTemplate,
        { command: "", cwd: ctx.worktreePath, image: config.image, timeoutMs: config.lifecycleTimeoutMs, spawnCwd },
      );
      if (deleted.exitCode !== 0) throw new Error(`OpenSandbox teardown command failed: ${deleted.stderr || deleted.stdout || `exit ${deleted.exitCode}`}`);
    }
    return this.directory.teardown(ctx, { force: true, keepBranch: false });
  }

  collectDirtyChanges(worktreePath: string): Promise<string[]> {
    return gitStatusPorcelain(worktreePath);
  }
}

export async function runOpenSandboxCommand(worktreePath: string, command: string, commandTimeoutMs: number): Promise<SandboxCommandRunResult> {
  const config = readOpenSandboxConfig();
  if (config.mode === "mock") {
    return { exitCode: 0, stdout: `[opensandbox mock] ${command}\n`, stderr: "", durationMs: 0, timedOut: false };
  }
  return runOpenSandboxTemplate(config.execCommandTemplate!, { command, cwd: worktreePath, image: config.image, timeoutMs: commandTimeoutMs });
}

async function runOpenSandboxTemplate(
  template: string,
  values: { command: string; cwd: string; image: string; timeoutMs: number; spawnCwd?: string },
): Promise<SandboxCommandRunResult> {
  const replacements: Record<string, string> = {
    "{command}": shellQuote(values.command),
    "{cwd}": shellQuote(values.cwd),
    "{image}": shellQuote(values.image),
    "{timeout_ms}": String(values.timeoutMs),
  };
  const rendered = template.replace(/\{command\}|\{cwd\}|\{image\}|\{timeout_ms\}/g, (token) => replacements[token]);
  return runShell(rendered, values.spawnCwd ?? values.cwd, values.timeoutMs);
}

async function runShell(command: string, cwd: string, commandTimeoutMs: number): Promise<SandboxCommandRunResult> {
  const startedAt = Date.now();
  try {
    const shell = await resolveTemplateShell(commandTimeoutMs);
    const remainingMs = commandTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) return { exitCode: 124, stdout: "", stderr: "Command preparation exceeded its deadline",
      timedOut: true, durationMs: Date.now() - startedAt };
    const result = await runRuntimeProcess({ command: shell, args: ["-c", command], cwd, timeoutMs: remainingMs });
    return {
      exitCode: result.timedOut ? 124 : result.exitCode,
      stdout: result.stdout.slice(0, COMMAND_OUTPUT_LIMIT),
      stderr: (result.stderr || result.spawnError || "").slice(0, COMMAND_OUTPUT_LIMIT),
      timedOut: result.timedOut,
      spawnError: result.spawnError ? new Error(result.spawnError) : undefined,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    return { exitCode: 1, stdout: "", stderr: failure.message, timedOut: false,
      spawnError: failure, durationMs: Date.now() - startedAt };
  }
}

let discoveredWindowsShell: { searchPath: string; executable: string } | undefined;

async function resolveTemplateShell(timeoutMs: number): Promise<string> {
  if (process.env.UH_OPENSANDBOX_SHELL) return process.env.UH_OPENSANDBOX_SHELL;
  if (process.platform !== "win32") return "/bin/sh";
  const searchPath = process.env.PATH ?? "";
  if (discoveredWindowsShell?.searchPath === searchPath) return discoveredWindowsShell.executable;
  // Derive a native shell from the installed Git distribution, never a WSL launcher.
  const { stdout } = await execFileP("where.exe", ["git.exe"], { timeout: Math.max(1, Math.min(timeoutMs, 10_000)) });
  for (const git of stdout.trim().split(/\r?\n/)) {
    for (const relative of ["../bin/bash.exe", "../usr/bin/bash.exe", "../../usr/bin/bash.exe"]) {
      const executable = path.resolve(path.dirname(git), relative);
      if (await fileExists(executable)) {
        discoveredWindowsShell = { searchPath, executable };
        return executable;
      }
    }
  }
  throw new Error("POSIX command templates require a native shell; set UH_OPENSANDBOX_SHELL to its executable path");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const BACKENDS: Record<string, SandboxBackend> = {
  "git-worktree": new GitWorktreeBackend(),
  directory: new DirectoryBackend(),
  container: new ContainerBackend(),
};

/** Resolve a backend by name, fail-fast on an unknown id. */
export function getSandboxBackend(name: string): SandboxBackend {
  const backend = BACKENDS[name];
  if (!backend) {
    throw new Error(`Unknown sandbox backend: ${name}. Available: ${Object.keys(BACKENDS).join(", ")}`);
  }
  return backend;
}

export function listSandboxBackends(): string[] {
  return Object.keys(BACKENDS);
}
