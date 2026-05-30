import type { Command } from "commander";
import { spawn } from "node:child_process";
import os from "node:os";
import { performance } from "node:perf_hooks";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

// Telemetry is strictly best-effort: it must never block, slow, or fail a CLI
// command. Every network path is bounded by this timeout and swallows errors.
const CAPTURE_TIMEOUT_MS = 2000;

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
    // Scoped key only — no generic POSTHOG_PROJECT_API_KEY fallback, so an
    // unrelated PostHog key already in the environment can never silently
    // activate UH telemetry against the wrong project.
    apiKey: env.UH_POSTHOG_API_KEY,
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

/**
 * Aggregate-only event body. Deliberately excludes anything identifying or
 * sensitive: no cwd, no project root, no prompt, no agent output, no argv.
 */
export function buildCapturePayload(config: TelemetryConfig, outcome: CommandOutcome) {
  return {
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
}

/**
 * In-process best-effort capture. Bounded by an abort timeout and never throws.
 * Used directly by tests and by callers that can await a normal async flush.
 * The CLI itself uses the exit-safe beacon below, because most commands
 * terminate via process.exit() before an awaited capture could resolve.
 */
export async function captureCommandOutcome(
  config: TelemetryConfig,
  outcome: CommandOutcome,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!config.enabled || !config.apiKey) return;

  try {
    // URL construction is inside the try: a malformed UH_POSTHOG_HOST throws
    // synchronously and must be swallowed like any other telemetry failure.
    const url = new URL("/capture/", config.host);
    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCapturePayload(config, outcome)),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      keepalive: true,
    });
  } catch {
    // best-effort: never surface telemetry failures to the user
  }
}

// Minimal POST run in a detached child so it outlives the parent CLI's exit.
// The URL + body are pre-serialized by the parent and passed via env.
const BEACON_SOURCE = `
const u = process.env.UH_BEACON_URL, b = process.env.UH_BEACON_BODY;
if (u && b) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ${CAPTURE_TIMEOUT_MS});
  fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: b, signal: c.signal })
    .catch(() => {})
    .finally(() => clearTimeout(t));
}
`;

/**
 * Exit-safe delivery: spawn a detached, unref'd subprocess that performs the
 * POST after the parent process has exited.
 *
 * Why a subprocess and not an awaited fetch: nearly every `uh` command ends in
 * `process.exit()`, which fires synchronously and aborts an in-flight fetch.
 * A `process.on("exit")` handler can only run synchronous work. So we initiate
 * the POST in a detached child (spawn returns synchronously; the child is
 * unref'd and survives the parent), which avoids both the dropped-event problem
 * and the process.exit() monkeypatch that would break its `never` return type.
 */
function sendBeacon(config: TelemetryConfig, outcome: CommandOutcome): void {
  if (!config.enabled || !config.apiKey) return;
  try {
    const url = new URL("/capture/", config.host).toString();
    const body = JSON.stringify(buildCapturePayload(config, outcome));
    const child = spawn(process.execPath, ["-e", BEACON_SOURCE], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, UH_BEACON_URL: url, UH_BEACON_BODY: body },
    });
    child.unref();
  } catch {
    // best-effort: a spawn failure must never affect the command result
  }
}

export function installTelemetryHooks(program: Command, version: string): void {
  const config = loadTelemetryConfig();
  if (!config.enabled || !config.apiKey) return;

  const startedAt = performance.now();
  let commandPath = program.name();

  // preAction fires before the action handler runs, so we always know which
  // command was invoked even when the handler later calls process.exit().
  program.hook("preAction", (_thisCommand, actionCommand) => {
    commandPath = sanitizeCommandPath(actionCommand);
  });

  // 'exit' fires synchronously with the real exit code for BOTH process.exit(n)
  // and natural completion. Capture the true status here and hand delivery to
  // the detached beacon (spawn initiates synchronously, so the child survives).
  let sent = false;
  process.on("exit", (code) => {
    if (sent) return;
    sent = true;
    sendBeacon(config, {
      command: commandPath,
      status: code === 0 ? "success" : "failed",
      exitCode: code,
      durationMs: performance.now() - startedAt,
      version,
    });
  });
}
