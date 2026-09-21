import type { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lookup as dnsLookup } from "node:dns/promises";
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
 * The capture host is environment-configured (UH_POSTHOG_HOST), so an opt-in
 * telemetry run must refuse endpoints that would land requests on loopback,
 * private, or reserved addresses instead of the configured collector.
 */
function isRefusedCaptureAddress(address: string): boolean {
  const h = address.toLowerCase();
  if (h === "::" || h === "::1") return true;
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isRefusedCaptureAddress(mapped[1]);
  if (h.includes(":")) {
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) ranges.
    return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  const c = Number(v4[3]);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 113) ||
    a >= 224;
}

function isRefusedCaptureHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  return isRefusedCaptureAddress(h);
}

/**
 * Resolve the capture endpoint, or null when the host is malformed, refused,
 * or resolves to a refused address. Only http(s) collector URLs are allowed.
 */
async function resolveCaptureEndpoint(
  config: TelemetryConfig,
  lookupImpl: typeof dnsLookup = dnsLookup,
): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL("/capture/", config.host);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (isRefusedCaptureHost(url.hostname)) return null;
  try {
    const records = await lookupImpl(url.hostname, { all: true });
    if (records.length === 0) return null;
    if (records.some((record) => isRefusedCaptureAddress(record.address))) return null;
  } catch {
    return null;
  }
  return url;
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
  lookupImpl: typeof dnsLookup = dnsLookup,
): Promise<void> {
  if (!config.enabled || !config.apiKey) return;

  // A malformed, refused, or unresolvable host must be swallowed like any
  // other telemetry failure.
  const url = await resolveCaptureEndpoint(config, lookupImpl);
  if (!url) return;
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildCapturePayload(config, outcome)),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      keepalive: true,
      redirect: "error",
    });
  } catch {
    // best-effort: never surface telemetry failures to the user
  }
}

/**
 * Exit-safe delivery: spawn the fixed telemetry-beacon script as a detached,
 * unref'd child that performs the POST after the parent process has exited.
 *
 * Why a subprocess and not an awaited fetch: nearly every `uh` command ends in
 * `process.exit()`, which fires synchronously and aborts an in-flight fetch.
 * A `process.on("exit")` handler can only run synchronous work. So we initiate
 * the POST in a detached child (spawn returns synchronously; the child is
 * unref'd and survives the parent), which avoids the dropped-event problem and
 * the process.exit() monkeypatch that would break its `never` return type.
 */
function sendBeacon(config: TelemetryConfig, outcome: CommandOutcome): void {
  if (!config.enabled || !config.apiKey) return;
  try {
    // Fixed script only: the parent never passes code to the child. The
    // beacon re-checks the endpoint (scheme, literal host, resolved
    // addresses) with real DNS before it sends.
    const beaconUrl = new URL("./telemetry-beacon.js", import.meta.url);
    if (!existsSync(beaconUrl)) return;
    const beaconPath = fileURLToPath(beaconUrl);
    // Synchronous static checks here too; the beacon repeats the endpoint
    // guard with real DNS resolution.
    const url = new URL("/capture/", config.host);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    if (isRefusedCaptureHost(url.hostname)) return;
    const body = JSON.stringify(buildCapturePayload(config, outcome));
    const child = spawn("node", [beaconPath], {
      detached: true,
      shell: false,
      stdio: "ignore",
      env: {
        ...process.env,
        UH_BEACON_URL: url.toString(),
        UH_BEACON_BODY: body,
        UH_BEACON_TIMEOUT_MS: String(CAPTURE_TIMEOUT_MS),
      },
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
