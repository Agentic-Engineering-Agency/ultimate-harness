/**
 * UH-85 — Recent runs table on the Mission detail tab.
 * UH-88 — Status-chip filter + run_id prefix search above the table.
 *
 * Hidden when the user has already drilled into a specific run
 * (`pinnedRunId` set) to reduce visual clutter — the breadcrumb in
 * MissionDrilldown.tsx provides the back-to-latest affordance instead.
 *
 * Pure helpers (formatRelative / formatDuration / filterRuns / sortRuns) live
 * in `recent-runs-utils.ts` so vitest can unit-test them without React.
 */
import { type MissionRunSummary, UI } from "./sdk";
import { buildHash } from "./router";
import {
  filterRuns,
  formatDuration,
  formatRelative,
  sortRuns,
  type RunSortKey,
  type SortDir,
} from "./recent-runs-utils";

// Re-export pure helpers so consumers can grab them from this module.
export {
  filterRuns,
  formatDuration,
  formatRelative,
  runArtifactUrl,
  sortRuns,
} from "./recent-runs-utils";
export type { RunSortKey, SortDir } from "./recent-runs-utils";

const STATUS_CHIPS: ReadonlyArray<MissionRunSummary["status"]> = [
  "passed",
  "needs-attention",
  "needs-remediation",
  "failed",
  "cancelled",
  "timeout",
  "running",
];

const COLUMNS: ReadonlyArray<{ key: RunSortKey; label: string }> = [
  { key: "run_id", label: "Run ID" },
  { key: "started_at", label: "Started" },
  { key: "duration", label: "Duration" },
  { key: "status", label: "Status" },
  { key: "runtime", label: "Runtime" },
];

function StatusBadge({ status }: { status: MissionRunSummary["status"] }) {
  return <span className={`uh-status-badge uh-status-${status}`}>{status}</span>;
}

export function RecentRunsPane({
  missionId,
  runs,
  onReplay,
}: {
  missionId: string;
  runs: MissionRunSummary[];
  /** UH-87 — invoked when a Replay button is clicked on a row; the
   * drilldown opens its Run modal in replay mode in response. */
  onReplay?: (runId: string) => void;
}) {
  const [sortKey, setSortKey] = React.useState<RunSortKey>("started_at");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");
  const [statuses, setStatuses] = React.useState<Set<string>>(() => new Set());
  const [search, setSearch] = React.useState<string>("");
  // UH-89: compare mode. When `compareMode` is true, row clicks select
  // A then B and navigate to the compare view instead of drilling in.
  const [compareMode, setCompareMode] = React.useState<boolean>(false);
  const [compareA, setCompareA] = React.useState<string | null>(null);
  // Anchor relative-time renders so unit tests can mock `Date.now`. We pin
  // `now` on every render — the runs prop only changes on backend refresh,
  // so the small drift (sub-second) is acceptable for table cell display.
  const now = Date.now();

  const visible = React.useMemo(() => {
    const filtered = filterRuns(runs, statuses, search);
    return sortRuns(filtered, sortKey, sortDir);
  }, [runs, statuses, search, sortKey, sortDir]);

  const total = runs.length;
  const shown = visible.length;
  const filterActive = statuses.size > 0 || search.trim() !== "";

  function toggleStatus(s: string) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleSort(key: RunSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // First click on a new column: descending for time-ish columns,
      // ascending for textual columns. Matches "newest/longest first"
      // expectations on started_at / duration.
      setSortDir(key === "started_at" || key === "duration" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setStatuses(new Set());
    setSearch("");
  }

  function pickForCompare(runId: string) {
    if (compareA === null) {
      setCompareA(runId);
      return;
    }
    if (runId === compareA) {
      // Clicking the same row twice clears the selection — easier to
      // recover from a misclick than forcing a Cancel-then-toggle.
      setCompareA(null);
      return;
    }
    // Both sides picked: navigate. Reset local state so the pane is
    // ready for the next comparison after the operator returns.
    const a = compareA;
    setCompareA(null);
    setCompareMode(false);
    window.location.hash = buildHash({ view: "missionCompare", missionId, runA: a, runB: runId });
  }

  function openRun(runId: string) {
    window.location.hash = buildHash({ view: "missionRun", missionId, runId });
  }

  function handleRowClick(runId: string) {
    if (compareMode) pickForCompare(runId);
    else openRun(runId);
  }

  function toggleCompareMode() {
    setCompareMode((m) => !m);
    setCompareA(null);
  }

  if (total === 0) {
    return <div className="uh-empty">No runs yet for this mission.</div>;
  }

  return (
    <div className="uh-stack" style={{ gap: 8 }}>
      <div className="uh-row" style={{ flexWrap: "wrap", gap: 6 }}>
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            className={"uh-chip" + (statuses.has(s) ? " is-active" : "")}
            onClick={() => toggleStatus(s)}
            aria-pressed={statuses.has(s)}
          >
            {s}
          </button>
        ))}
        <UI.Input
          type="text"
          value={search}
          onChange={(e: any) => setSearch(e?.target?.value ?? "")}
          placeholder="Filter by run_id prefix…"
          style={{ marginLeft: 8, minWidth: 200, fontSize: 12 }}
        />
        {filterActive ? (
          <UI.Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</UI.Button>
        ) : null}
        <UI.Button
          variant={compareMode ? "default" : "outline"}
          size="sm"
          onClick={toggleCompareMode}
          style={{ marginLeft: "auto" }}
          title={compareMode ? "Exit compare mode" : "Select two runs to compare"}
        >
          {compareMode ? "Cancel compare" : "Compare"}
        </UI.Button>
      </div>
      <div className="uh-muted">
        {compareMode
          ? (compareA === null
              ? "Compare mode: click a row to mark it as A."
              : `Compare mode: A = ${compareA.length > 16 ? compareA.slice(0, 16) + "…" : compareA}. Click another row for B.`)
          : (filterActive ? `Showing ${shown} of ${total} runs` : `${total} runs`)}
      </div>
      <table className="uh-runs-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                className={sortKey === c.key ? "is-sorted" : ""}
                onClick={() => toggleSort(c.key)}
                title={`Sort by ${c.label}`}
              >
                {c.label}
                {sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
            <th aria-label="row actions" />
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const truncated = r.run_id.length > 16 ? r.run_id.slice(0, 16) + "…" : r.run_id;
            const isA = compareMode && compareA === r.run_id;
            const rowClass =
              "uh-runs-row"
              + (compareMode ? " is-compare-mode" : "")
              + (isA ? " is-compare-a" : "");
            return (
              <tr
                key={r.run_id}
                className={rowClass}
                onClick={() => handleRowClick(r.run_id)}
              >
                <td className="uh-mono" title={r.run_id}>
                  {isA ? <span className="uh-compare-tag">A</span> : null}
                  {truncated}
                </td>
                <td className="uh-muted" title={r.started_at}>{formatRelative(now, r.started_at)}</td>
                <td className="uh-mono">{formatDuration(r.started_at, r.finished_at)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="uh-mono">{r.runtime ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {onReplay && !compareMode ? (
                    <UI.Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: any) => { e.stopPropagation(); onReplay(r.run_id); }}
                      title="Open Run modal pre-filled with this run's overrides"
                    >
                      Replay
                    </UI.Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="uh-muted" style={{ textAlign: "center", padding: 12 }}>
                No runs match the current filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
