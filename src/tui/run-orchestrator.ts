/**
 * UH-44 — mission run subprocess orchestrator.
 *
 * Spawns the existing CLI (`uh mission run`) as a child process so the TUI
 * never duplicates adapter dispatch logic. The child writes
 * `events.ndjson` in the usual way; the TUI tails it via `run-events.ts`.
 *
 * Test seam: pass `spawner` to inject a fake child. Production uses
 * `node:child_process.spawn`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RunRuntime = "hermes" | "codex" | "oh-my-pi" | "hermes-proxy";

export interface RunRequest {
  /** Mission file path (absolute). */
  missionPath: string;
  /** Project root (passed to CLI as --root). */
  root: string;
  /** Adapter id. */
  runtime: RunRuntime;
  /** When true, the CLI will not auto-route into the bound sandbox. */
  noSandbox?: boolean;
}

export interface RunSpawnResult {
  pid: number;
  exit: Promise<RunOutcome>;
  /** Signal SIGTERM to the child. No-op when already exited. */
  stop: () => void;
}

export type RunOutcome =
  | { status: "succeeded"; code: 0 }
  | { status: "failed"; code: number }
  | { status: "cancelled"; signal: string };

export type RunSpawner = (cmd: string, args: string[], cwd: string) => ChildProcess;

const DEFAULT_SPAWNER: RunSpawner = (cmd, args, cwd) =>
  spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "ignore"] });

export interface RunOrchestratorOptions {
  /** Path to the CLI entrypoint. Defaults to dist/cli.js shipped with this package. */
  cliEntry?: string;
  /** Runtime that should execute the CLI script. Default: process.execPath. */
  runtime?: string;
  /** Inject a spawner for tests. */
  spawner?: RunSpawner;
}

export function buildRunArgs(req: RunRequest, cliEntry: string): string[] {
  const args = [cliEntry, "mission", "run", req.missionPath, "--runtime", req.runtime, "--root", req.root];
  if (req.noSandbox) args.push("--no-sandbox");
  return args;
}

/**
 * Resolve the absolute path to the CLI entrypoint shipped alongside this
 * module. In production this resolves to `dist/cli.js`; in dev (Bun preload
 * of the TypeScript source) it resolves to `src/cli.ts`. Tested via the
 * filename extension so both paths work without environment sniffing.
 */
export function resolveDefaultCliEntry(): string {
  const moduleUrl = new URL(import.meta.url);
  const modulePath = fileURLToPath(moduleUrl);
  const dir = path.dirname(modulePath);
  const ext = path.extname(modulePath) === ".ts" ? ".ts" : ".js";
  return path.resolve(dir, "..", `cli${ext}`);
}

export function startRun(req: RunRequest, options: RunOrchestratorOptions = {}): RunSpawnResult {
  const cliEntry = options.cliEntry ?? resolveDefaultCliEntry();
  const runtime = options.runtime ?? process.execPath;
  const spawner = options.spawner ?? DEFAULT_SPAWNER;
  const args = buildRunArgs(req, cliEntry);
  const child = spawner(runtime, args, req.root);
  if (child.pid === undefined) {
    throw new Error(`uh mission run subprocess failed to spawn (runtime=${runtime}, args=${args.join(" ")})`);
  }
  let stopped = false;

  const exit = new Promise<RunOutcome>((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal && stopped) {
        resolve({ status: "cancelled", signal: String(signal) });
        return;
      }
      if (code === 0) {
        resolve({ status: "succeeded", code: 0 });
        return;
      }
      resolve({ status: "failed", code: code ?? 1 });
    });
  });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try { child.kill("SIGTERM"); } catch { /* already gone */ }
  };

  return { pid: child.pid, exit, stop };
}
