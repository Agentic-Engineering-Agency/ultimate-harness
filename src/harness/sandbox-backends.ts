import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "./mission.js";

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
 * Default backend: a `git worktree` sharing the project's object store on a
 * dedicated `sandbox/<id>` branch. Cheap, but ties the sandbox to the parent
 * repo's worktree registry and branch namespace.
 */
export class GitWorktreeBackend implements SandboxBackend {
  readonly name = "git-worktree";

  async materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult> {
    const branch = `sandbox/${ctx.sandboxId}`;
    await runGit(ctx.root, ["worktree", "add", "-b", branch, ctx.worktreePath, ctx.baseRef]);
    return { branch, base_ref: ctx.baseRef };
  }

  async teardown(ctx: SandboxTeardownContext, opts: SandboxTeardownOptions): Promise<{ branch_removed: boolean }> {
    if (await fileExists(ctx.worktreePath)) {
      const removeArgs = ["worktree", "remove"];
      if (opts.force) removeArgs.push("--force");
      removeArgs.push(ctx.worktreePath);
      await runGit(ctx.root, removeArgs);
    } else {
      // Worktree directory was deleted out-of-band; prune the registration.
      await runGit(ctx.root, ["worktree", "prune"]);
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

  async materialize(ctx: SandboxMaterializeContext): Promise<SandboxMaterializeResult> {
    // Local clone (hard-linked objects) of the project into the sandbox dir.
    await runGit(ctx.root, ["clone", "--local", "--quiet", "--", ctx.root, ctx.worktreePath]);
    if (ctx.baseRef && ctx.baseRef !== "HEAD") {
      await runGit(ctx.worktreePath, ["checkout", "--quiet", ctx.baseRef]);
    }
    const branch = `sandbox/${ctx.sandboxId}`;
    await runGit(ctx.worktreePath, ["checkout", "--quiet", "-b", branch]);
    return { branch, base_ref: ctx.baseRef };
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
  const mode = env.UH_OPENSANDBOX_MODE === "mock" ? "mock" : "command";
  const enabled = env.UH_OPENSANDBOX_ENABLED === "1" || env.UH_OPENSANDBOX_ENABLED === "true" || mode === "mock";
  if (!enabled) {
    throw new Error(`OpenSandbox container backend is not configured. ${OPENSANDBOX_CONFIG_HELP}`);
  }
  const image = env.UH_OPENSANDBOX_IMAGE ?? "python:3.12";
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$/.test(image)) {
    throw new Error(`Invalid UH_OPENSANDBOX_IMAGE: ${image}`);
  }
  if (mode === "mock") return { mode, image };

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
  };
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
        const created = await runOpenSandboxTemplate(config.createCommandTemplate, { command: "", cwd: ctx.worktreePath, image: config.image, timeoutMs: 30_000 });
        if (created.exitCode !== 0) throw new Error(`OpenSandbox create command failed: ${created.stderr || created.stdout || `exit ${created.exitCode}`}`);
      }
      await writeFile(
        path.join(ctx.worktreePath, OPENSANDBOX_METADATA),
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
    const config = readOpenSandboxConfig();
    if (config.mode === "command" && config.deleteCommandTemplate && await fileExists(ctx.worktreePath)) {
      const deleted = await runOpenSandboxTemplate(config.deleteCommandTemplate, { command: "", cwd: ctx.worktreePath, image: config.image, timeoutMs: 30_000 });
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

async function runOpenSandboxTemplate(template: string, values: { command: string; cwd: string; image: string; timeoutMs: number }): Promise<SandboxCommandRunResult> {
  const rendered = template
    .replaceAll("{command}", shellQuote(values.command))
    .replaceAll("{cwd}", shellQuote(values.cwd))
    .replaceAll("{image}", shellQuote(values.image))
    .replaceAll("{timeout_ms}", String(values.timeoutMs));
  return runShell(rendered, process.cwd(), values.timeoutMs);
}

function runShell(command: string, cwd: string, commandTimeoutMs: number): Promise<SandboxCommandRunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, { cwd, detached: true, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const append = (current: string, chunk: unknown) => (current + (typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf-8") : String(chunk))).slice(0, COMMAND_OUTPUT_LIMIT);
    const finish = (metrics: Omit<SandboxCommandRunResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ ...metrics, durationMs: Date.now() - startedAt });
    };
    const killChild = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* best effort */ } }
    };
    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (err) => finish({ exitCode: 1, stdout, stderr: stderr || err.message, timedOut: false, spawnError: err }));
    child.on("close", (code) => finish({ exitCode: code ?? 1, stdout, stderr, timedOut }));
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      killChild("SIGTERM");
      killTimer = setTimeout(() => { killChild("SIGKILL"); finish({ exitCode: 124, stdout, stderr, timedOut: true }); }, 100);
    }, commandTimeoutMs);
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\''`)}'`;
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
