import type { Command } from "commander";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const TELEMETRY_FETCH_TIMEOUT_MS = 2_000;

export interface TelemetryConfig {
  enabled: boolean;
  apiKey?: string;
  host: string;
}

export interface CommandOutcome {
  command: string;
  status: "success" | "failed";
  exitCode: number;
  durationMs: number;
  version: string;
}

export interface CaptureRequest {
  url: string;
  body: string;
}

let cachedDistinctId: string | undefined;

export function loadTelemetryConfig(env: NodeJS.ProcessEnv = process.env): TelemetryConfig {
  const mode = (env.UH_TELEMETRY ?? env.UH_TELEMETRY_ENABLED ?? "").trim().toLowerCase();
  const enabled = mode === "posthog" || mode === "1" || mode === "true";
  return {
    enabled,
    apiKey: env.UH_POSTHOG_API_KEY ?? env.POSTHOG_PROJECT_API_KEY,
    host: env.UH_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
  };
}

export function sanitizeCommandPath(command: Command): string {
  const parts: Command[] = [];
  let cursor: Command | null = command;
  while (cursor) {
    parts.unshift(cursor);
    cursor = cursor.parent;
  }
  return parts
    .map((part) => part.name())
    .filter(Boolean)
    .join(" ");
}

function telemetryInstallIdPath(): string {
  return path.join(os.homedir(), ".ultimate-harness", "telemetry-install-id");
}

export function getTelemetryDistinctId(): string {
  if (cachedDistinctId) return cachedDistinctId;

  const filePath = telemetryInstallIdPath();
  try {
    const existing = readFileSync(filePath, "utf8").trim();
    if (existing) {
      cachedDistinctId = existing;
      return existing;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      cachedDistinctId = randomUUID();
      return cachedDistinctId;
    }
  }

  const id = randomUUID();
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${id}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Best-effort persistence; still use the generated id this run.
  }
  cachedDistinctId = id;
  return id;
}

export function buildCaptureRequest(
  config: TelemetryConfig,
  outcome: CommandOutcome,
): CaptureRequest | null {
  if (!config.enabled || !config.apiKey) return null;

  const url = new URL("/capture/", config.host).toString();
  const payload = {
    api_key: config.apiKey,
    event: "uh_command_outcome",
    distinct_id: getTelemetryDistinctId(),
    properties: {
      command: outcome.command,
      status: outcome.status,
      exit_code: outcome.exitCode,
      duration_ms: Math.round(outcome.durationMs),
      version: outcome.version,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      os_release: os.release(),
    },
  };

  return { url, body: JSON.stringify(payload) };
}

export async function captureCommandOutcome(
  config: TelemetryConfig,
  outcome: CommandOutcome,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const request = buildCaptureRequest(config, outcome);
  if (!request) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEMETRY_FETCH_TIMEOUT_MS);
  try {
    await fetchImpl(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: request.body,
      signal: controller.signal,
    });
  } catch {
    // Telemetry is best-effort and must never affect CLI behavior.
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveTelemetryBeaconScript(): string {
  const jsPath = fileURLToPath(new URL("./telemetry-beacon.js", import.meta.url));
  if (existsSync(jsPath)) return jsPath;
  return fileURLToPath(new URL("./telemetry-beacon.ts", import.meta.url));
}

export type TelemetryBeaconSpawner = (scriptPath: string, env: NodeJS.ProcessEnv) => ChildProcess;

export const defaultTelemetryBeaconSpawner: TelemetryBeaconSpawner = (scriptPath, env) => {
  const command = scriptPath.endsWith(".ts") ? "bun" : process.execPath;
  const args = scriptPath.endsWith(".ts") ? [scriptPath] : [scriptPath];
  return spawn(command, args, {
    env,
    detached: true,
    stdio: "ignore",
  });
};

export function spawnTelemetryBeacon(
  request: CaptureRequest,
  spawnBeacon: TelemetryBeaconSpawner = defaultTelemetryBeaconSpawner,
): void {
  const scriptPath = resolveTelemetryBeaconScript();
  const child = spawnBeacon(scriptPath, {
    ...process.env,
    UH_TELEMETRY_CAPTURE_URL: request.url,
    UH_TELEMETRY_CAPTURE_BODY: request.body,
  });
  child.unref();
}

export function installTelemetryHooks(
  program: Command,
  version: string,
  options: { spawnBeacon?: TelemetryBeaconSpawner } = {},
): void {
  const config = loadTelemetryConfig();
  if (!config.enabled || !config.apiKey) return;

  const spawnBeacon = options.spawnBeacon ?? defaultTelemetryBeaconSpawner;
  let activeCommand: Command | null = null;
  let startedAt = 0;
  let capturedOnExit = false;

  program.hook("preAction", (_root, actionCommand) => {
    activeCommand = actionCommand;
    startedAt = performance.now();
    capturedOnExit = false;
  });

  process.on("exit", (code) => {
    if (capturedOnExit || !activeCommand) return;
    capturedOnExit = true;

    const exitCode = typeof code === "number" ? code : 0;
    const request = buildCaptureRequest(config, {
      command: sanitizeCommandPath(activeCommand),
      status: exitCode === 0 ? "success" : "failed",
      exitCode,
      durationMs: performance.now() - startedAt,
      version,
    });
    if (!request) return;
    spawnTelemetryBeacon(request, spawnBeacon);
  });
}
