/**
 * UH-85 / UH-88 — pure helpers for the Recent runs pane.
 *
 * Extracted into a JSX-free module so vitest can import them under the
 * harness-side `tsconfig.tests.json` without dragging in the plugin's
 * `window.__HERMES_PLUGIN_SDK__` shim. The `RecentRunsPane.tsx` component
 * re-exports these so consumers can grab them from either entry point.
 */
/**
 * Mirror of the backend `runs[]` entry shape returned by
 * `GET /missions/{id}` (see `plugin_api.py::get_mission`). Defined here
 * (and re-exported from `sdk.ts`) so the pure helper module has zero
 * imports from the React/SDK-bound surface — vitest can pull it in
 * without a window/DOM shim.
 */
export interface MissionRunSummary {
  run_id: string;
  started_at: string;
  finished_at?: string | null;
  status:
    | "passed"
    | "failed"
    | "blocked"
    | "cancelled"
    | "timeout"
    | "running"
    | "needs-attention"
    | "needs-remediation";
  runtime?: string | null;
  /** UH-90 — true when this run's per-run dir has been pruned by the retention policy. The index entry persists for audit; artifacts are gone. */
  archived?: boolean;
}

/** Sort keys for the runs table. `duration` is computed at sort time. */
export type RunSortKey = "started_at" | "run_id" | "duration" | "status" | "runtime";
export type SortDir = "asc" | "desc";

/** Relative time formatter; second/minute/hour/day buckets, no date-fns. */
export function formatRelative(now: number, isoStarted: string): string {
  const t = Date.parse(isoStarted);
  if (!Number.isFinite(t)) return "—";
  const deltaMs = Math.max(0, now - t);
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Duration formatter: `running`, `Ns`, `Nm Ss`, or `Xh Ym`. */
export function formatDuration(startedAt: string, finishedAt?: string | null): string {
  if (!finishedAt) return "running";
  const s = Date.parse(startedAt);
  const f = Date.parse(finishedAt);
  if (!Number.isFinite(s) || !Number.isFinite(f) || f < s) return "—";
  const sec = Math.floor((f - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

/**
 * Apply status-chip + free-text filters. Empty status set means "no chip filter
 * active"; OR semantics across selected chips. Free-text is a case-insensitive
 * prefix match on `run_id`. Returns the input array reference when no filter is
 * active to avoid an allocation on every render.
 */
export function filterRuns(
  runs: MissionRunSummary[],
  statuses: Set<string>,
  search: string,
): MissionRunSummary[] {
  const q = search.trim().toLowerCase();
  if (statuses.size === 0 && q === "") return runs;
  return runs.filter((r) => {
    if (statuses.size > 0 && !statuses.has(r.status)) return false;
    if (q !== "" && !r.run_id.toLowerCase().startsWith(q)) return false;
    return true;
  });
}

function durationMs(r: MissionRunSummary): number {
  const s = Date.parse(r.started_at);
  if (!Number.isFinite(s)) return 0;
  if (!r.finished_at) {
    // Running rows sort as "longest so far" relative to other in-flight
    // runs, but we never want NaN/-Infinity in the comparator.
    return Number.MAX_SAFE_INTEGER;
  }
  const f = Date.parse(r.finished_at);
  if (!Number.isFinite(f)) return 0;
  return Math.max(0, f - s);
}

function cmp(a: number | string, b: number | string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Stable sort by the given key; returns a new array. */
export function sortRuns(
  runs: MissionRunSummary[],
  key: RunSortKey,
  dir: SortDir,
): MissionRunSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  // Decorate with original index for stability.
  const decorated = runs.map((r, i) => ({ r, i }));
  decorated.sort((a, b) => {
    let order: number;
    switch (key) {
      case "started_at":
        order = cmp(Date.parse(a.r.started_at) || 0, Date.parse(b.r.started_at) || 0);
        break;
      case "duration":
        order = cmp(durationMs(a.r), durationMs(b.r));
        break;
      case "run_id":
        order = cmp(a.r.run_id, b.r.run_id);
        break;
      case "status":
        order = cmp(a.r.status, b.r.status);
        break;
      case "runtime":
        order = cmp(a.r.runtime ?? "", b.r.runtime ?? "");
        break;
    }
    if (order !== 0) return order * sign;
    return a.i - b.i;
  });
  return decorated.map((d) => d.r);
}

/**
 * Per-tab artifact URL builder. When `runId` is set, route through the
 * per-run endpoint (`/missions/<id>/runs/<run_id>/<kind>`) the backend
 * started serving in UH-82; otherwise the mission-latest path.
 */
export function runArtifactUrl(
  missionId: string,
  runId: string | undefined,
  kind: "prompt" | "final-message" | "diff" | "result" | "events",
): string {
  const mid = encodeURIComponent(missionId);
  if (runId !== undefined) {
    return `/missions/${mid}/runs/${encodeURIComponent(runId)}/${kind}`;
  }
  return `/missions/${mid}/${kind}`;
}