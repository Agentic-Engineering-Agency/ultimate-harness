import type { Command } from "commander";
import os from "node:os";
import { performance } from "node:perf_hooks";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

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

  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Telemetry is best-effort and must never affect CLI behavior.
  }
}

export function installTelemetryHooks(program: Command, version: string): void {
  const config = loadTelemetryConfig();
  const startedAt = new WeakMap<Command, number>();

  program.hook("preAction", (_root, actionCommand) => {
    startedAt.set(actionCommand, performance.now());
  });

  program.hook("postAction", async (_root, actionCommand) => {
    const start = startedAt.get(actionCommand) ?? performance.now();
    await captureCommandOutcome(config, {
      command: sanitizeCommandPath(actionCommand),
      status: "success",
      exitCode: 0,
      durationMs: performance.now() - start,
      version,
    });
  });
}
