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

export function pluginFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith("/")) path = `/${path}`;
  return SDK.fetchJSON<T>(`${PLUGIN_API_BASE}${path}`, init);
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

export interface MissionDetail extends MissionSummary {
  description: string;
  read_first: string[];
  expected_artifacts: Array<{ path: string; type?: string }>;
  acceptance_criteria: Array<{ id: string; description: string; severity?: string }>;
  capabilities: string[];
  raw: string;
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
}
