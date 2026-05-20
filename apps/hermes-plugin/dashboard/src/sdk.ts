/**
 * Typed accessor for the Hermes Plugin SDK and the UH backend.
 *
 * The dashboard exposes a global SDK on `window.__HERMES_PLUGIN_SDK__` (React,
 * shadcn-style components, `fetchJSON`, `api`, `utils`). Plugins also register
 * themselves via `window.__HERMES_PLUGINS__.register(name, App)`.
 *
 * Every backend call goes through `pluginFetch()` which prepends
 * `/api/plugins/uh/` so callers describe the endpoint shape, not the path.
 *
 * Keep this file dependency-free — it's loaded by every other module and any
 * import here shows up in the IIFE bundle.
 */
export const SDK: HermesSdk = window.__HERMES_PLUGIN_SDK__;
export const PLUGINS: HermesPluginRegistry = window.__HERMES_PLUGINS__;
export const UI = SDK.components;
export const fmt = SDK.utils;

export const PLUGIN_NAME = "uh";
export const PLUGIN_BASE_PATH = "/uh";
export const PLUGIN_API_BASE = `/api/plugins/${PLUGIN_NAME}`;

/**
 * Backend error envelope as thrown from {@link pluginFetch}.
 *
 * The dashboard SDK's underlying ``fetchJSON`` only surfaces a stringified
 * message on its rejection. Callers (mission wizard, workflow editor) need
 * the typed `{error, code, fields}` payload to render per-field validation
 * inline, so we parse it once here and hang it off ``e.payload``.
 *
 * Consumers should ``catch (e)`` and narrow via ``e instanceof PluginFetchError``.
 */
export class PluginFetchError extends Error {
  readonly status?: number;
  readonly payload?: ErrorPayload;
  constructor(message: string, opts: { status?: number; payload?: ErrorPayload; cause?: unknown } = {}) {
    super(message);
    this.name = "PluginFetchError";
    this.status = opts.status;
    this.payload = opts.payload;
    if (opts.cause !== undefined) (this as any).cause = opts.cause;
  }
}

import { extractTrailingJsonPayload } from "./errorPayload";
export { extractTrailingJsonPayload } from "./errorPayload";

/**
 * Fetch a plugin-scoped JSON endpoint. Resolves with the parsed body on 2xx;
 * rejects with {@link PluginFetchError} on transport or backend errors. The
 * backend always returns ``{error, code, fields?}`` for non-2xx responses —
 * we surface that as the typed ``e.payload``.
 */
export async function pluginFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith("/")) path = `/${path}`;
  try {
    return await SDK.fetchJSON<T>(`${PLUGIN_API_BASE}${path}`, init);
  } catch (cause: unknown) {
    const rawMessage = (cause as { message?: string } | null)?.message ?? String(cause);
    let payload: ErrorPayload | undefined;
    const parsed = extractTrailingJsonPayload(rawMessage);
    if (
      parsed !== undefined
      && parsed !== null
      && typeof parsed === "object"
      && typeof (parsed as { error?: unknown }).error === "string"
      && typeof (parsed as { code?: unknown }).code === "string"
    ) {
      payload = parsed as ErrorPayload;
    }
    const status = (cause as { status?: number } | null)?.status;
    throw new PluginFetchError(payload?.error ?? rawMessage, { status, payload, cause });
  }
}

/** Build an SSE EventSource at a plugin-scoped path. */
export function pluginEventSource(path: string): EventSource {
  if (!path.startsWith("/")) path = `/${path}`;
  return new EventSource(`${PLUGIN_API_BASE}${path}`);
}

// ---- Backend payload shapes (mirror plugin_api.py) -------------------------

export interface AdapterEntry {
  id: string;
  runtime: string;
  status: string;
  check?: { ok: boolean; version?: string; error?: string } | null;
}

export interface StatusPayload {
  schema_version: string;
  project_name: string;
  adapters: AdapterEntry[];
  workflows: number;
  missions: { active: number; verified: number; promoted: number };
  sandboxes: { total: number; by_status: Record<string, number> };
  recent_audit_events: number;
}

export interface MissionSummary {
  id: string;
  name: string;
  workflow_profile: string;
  status: "draft" | "running" | "verified" | "promoted" | "failed" | "blocked" | "unknown";
  last_run?: { runId?: string; status?: string; startedAt?: string; durationMs?: number };
}

// MissionRunSummary lives in `recent-runs-utils.ts` so the JSX-free
// helper module (and the vitest test that imports it) has zero
// dependency on the SDK globals declared in `types.d.ts`. We re-export
// it here so existing consumers can continue to `import { MissionRunSummary } from "./sdk"`.
export type { MissionRunSummary } from "./recent-runs-utils";
import type { MissionRunSummary } from "./recent-runs-utils";

export interface MissionDetail extends MissionSummary {
  description: string;
  read_first: string[];
  expected_artifacts: Array<{ path: string; type?: string }>;
  acceptance_criteria: Array<{ id: string; description: string; severity?: string }>;
  capabilities: string[];
  raw: string;
  /** UH-82 — append-only run history, newest-first, cap 50. Empty array if no runs/index.json. */
  runs: MissionRunSummary[];
}

export interface RunRow {
  runId: string;
  missionId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  diffPaths?: string[];
}

export interface RunStartResponse {
  runId: string;
  startedAt: string;
}

export interface WorkflowSummary {
  name: string;
  description: string;
  phases: number;
}

export interface WorkflowDetail extends WorkflowSummary {
  phases_list: Array<{ name: string; agent_role: string; description: string; outputs?: string[] }>;
  raw: string;
}

export interface VerificationReport {
  status: string;
  checks_passed: number;
  checks_failed: number;
  checks_blocked: number;
  acceptance: Array<{ id: string; description: string; status: string; severity?: string }>;
  runtime_config?: Record<string, unknown>;
  raw: string;
}

export interface ErrorPayload {
  error: string;
  code: string;
  stderr?: string;
  /** Per-field validation messages from wizards/editors. */
  fields?: Record<string, string>;
}
