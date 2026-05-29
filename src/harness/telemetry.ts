import type { Command } from "commander";
import os from "node:os";
import { performance } from "node:perf_hooks";

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

export async function captureCommandOutcome(
  config: TelemetryConfig,
  outcome: CommandOutcome,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!config.enabled || !config.apiKey) return;

  const url = new URL("/capture/", config.host);
  const payload = {
    api_key: config.apiKey,
    event: "uh_command_outcome",
    distinct_id: "uh-cli",
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEMETRY_FETCH_TIMEOUT_MS);
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Telemetry is best-effort and must never affect CLI behavior.
  } finally {
    clearTimeout(timeout);
  }
}

export function installTelemetryHooks(program: Command, version: string): void {
  const config = loadTelemetryConfig();
  let activeCommand: Command | null = null;
  let startedAt = 0;
  let flushPromise: Promise<void> | null = null;

  const flushOnce = async (exitCode: number): Promise<void> => {
    if (!activeCommand) return;
    if (flushPromise) {
      await flushPromise;
      return;
    }
    const command = activeCommand;
    flushPromise = captureCommandOutcome(config, {
      command: sanitizeCommandPath(command),
      status: exitCode === 0 ? "success" : "failed",
      exitCode,
      durationMs: performance.now() - startedAt,
      version,
    });
    await flushPromise;
  };

  program.hook("preAction", (_root, actionCommand) => {
    activeCommand = actionCommand;
    startedAt = performance.now();
    flushPromise = null;
  });

  program.hook("postAction", async () => {
    await flushOnce(0);
  });

  // Most uh handlers call process.exit() directly, which skips Commander postAction.
  const originalExit = process.exit.bind(process);
  process.exit = ((code?: number | string | null | undefined) => {
    const exitCode = typeof code === "number" ? code : 0;
    void flushOnce(exitCode).finally(() => originalExit(exitCode));
  }) as typeof process.exit;
}
