/**
 * UH-94 — pure helpers for live run event tails.
 *
 * JSX-free so vitest can import under `tsconfig.tests.json` without the
 * plugin's `window.__HERMES_PLUGIN_SDK__` shim.
 */

export type EventSeverity = "info" | "warn" | "error";

export interface LiveEventRow {
  id: number;
  ts: number;
  line: string;
  raw?: Record<string, unknown>;
  severity: EventSeverity;
  isUsage: boolean;
}

export const LIVE_EVENTS_CAP = 500;

export function runEventsStreamPath(missionId: string, runId: string): string {
  const mid = encodeURIComponent(missionId);
  const rid = encodeURIComponent(runId);
  return `/missions/${mid}/runs/${rid}/events?stream=1`;
}

export function parseEventData(data: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(data);
    return typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function eventLabel(obj: Record<string, unknown>): string | null {
  for (const key of ["event", "kind", "type"]) {
    const val = obj[key];
    if (typeof val === "string") return val;
  }
  return null;
}

export function classifyEventSeverity(
  obj: Record<string, unknown> | null,
  line: string,
): EventSeverity {
  if (obj) {
    const sev = obj.severity;
    if (sev === "error" || sev === "warn" || sev === "info") return sev;
    const label = eventLabel(obj) ?? "";
    if (/error|failed|timeout|cancelled/i.test(label)) return "error";
    if (/warn|blocked|needs-attention|needs-remediation/i.test(label)) return "warn";
    const status = obj.status;
    if (status === "failed" || status === "error") return "error";
  }
  if (/error|failed|timeout/i.test(line)) return "error";
  if (/warn|blocked/i.test(line)) return "warn";
  return "info";
}

export function isUsageEvent(obj: Record<string, unknown> | null): boolean {
  if (!obj) return false;
  const label = eventLabel(obj) ?? "";
  if (/usage|token|cost|billing/i.test(label)) return true;
  return (
    "usage" in obj
    || "tokens" in obj
    || "token_count" in obj
    || "input_tokens" in obj
    || "output_tokens" in obj
  );
}

export function appendLiveEvent(
  prev: LiveEventRow[],
  data: string,
  nextId: number,
): { events: LiveEventRow[]; nextId: number } {
  const raw = parseEventData(data);
  const row: LiveEventRow = {
    id: nextId,
    ts: Date.now(),
    line: data,
    raw: raw ?? undefined,
    severity: classifyEventSeverity(raw, data),
    isUsage: isUsageEvent(raw),
  };
  const next =
    prev.length >= LIVE_EVENTS_CAP
      ? prev.slice(prev.length - LIVE_EVENTS_CAP + 1)
      : prev.slice();
  next.push(row);
  return { events: next, nextId: nextId + 1 };
}

export function severityRowClass(severity: EventSeverity): string {
  if (severity === "error") return " is-error";
  if (severity === "warn") return " is-warn";
  return "";
}

/** Auto-scroll when the viewport is pinned to the newest edge (top in reverse-chron view). */
export function shouldAutoScrollTop(
  container: { scrollTop: number },
  threshold = 24,
): boolean {
  return container.scrollTop <= threshold;
}

/** Auto-scroll when the viewport is pinned to the bottom (chronological view). */
export function shouldAutoScrollBottom(
  container: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 24,
): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

export function isRunLiveStatus(status: string | undefined): boolean {
  return status === "running";
}
