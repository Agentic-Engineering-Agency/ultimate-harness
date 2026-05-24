import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileExists } from "./mission.js";

const execFileP = promisify(execFile);

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

const BACKENDS: Record<string, SandboxBackend> = {
  "git-worktree": new GitWorktreeBackend(),
  directory: new DirectoryBackend(),
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
