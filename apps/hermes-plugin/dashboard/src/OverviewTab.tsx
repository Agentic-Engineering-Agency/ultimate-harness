/**
 * UH-65 — overview tab.
 *
 * Three panels: Adapters / Missions / Recent runs.
 *
 * Polls the backend every 30s; pauses when the document is hidden so we don't
 * hammer the server for a tab the operator isn't looking at. The first error
 * surfaces inline in the affected panel — we never silently swap to stale data.
 */
import { pluginFetch, UI, type AdapterEntry, type MissionSummary, type RunRow, type StatusPayload, fmt } from "./sdk";
import { buildHash } from "./router";
import { RunModal } from "./RunModal";

const POLL_MS = 30_000;

function useVisibilityPolling<T>(fetcher: () => Promise<T>): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = React.useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "hidden") await run();
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [run]);

  return { data, error, loading, refetch: run };
}

function statusBadge(status: string): string {
  switch (status) {
    case "passed":
    case "succeeded":
    case "verified":
    case "promoted":
    case "active":
      return "default";
    case "running":
    case "draft":
      return "secondary";
    case "failed":
    case "error":
    case "blocked":
      return "destructive";
    default:
      return "outline";
  }
}

function AdaptersPanel() {
  const { data, error, loading } = useVisibilityPolling<StatusPayload>(
    React.useCallback(() => pluginFetch<StatusPayload>("/status"), []),
  );
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Adapters</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>
        {error ? <div className="uh-error">{error}</div> : null}
        {loading && !data ? <div className="uh-muted">Loading…</div> : null}
        {data && data.adapters.length === 0 ? <div className="uh-empty">No adapters configured.</div> : null}
        <div className="uh-list">
          {data?.adapters.map((a: AdapterEntry) => {
            const ok = a.check?.ok !== false;
            return (
              <div key={a.id} className="uh-list-row">
                <div>
                  <div className="uh-id">{a.id}</div>
                  <div className="uh-muted">runtime: {a.runtime}{a.check?.version ? ` · ${a.check.version}` : ""}</div>
                  {a.check?.error ? <div className="uh-error">{a.check.error}</div> : null}
                </div>
                <UI.Badge variant={statusBadge(a.status)}>{a.status}</UI.Badge>
                <UI.Badge variant={ok ? "default" : "destructive"}>{ok ? "OK" : "fail"}</UI.Badge>
              </div>
            );
          })}
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}

function MissionsPanel({ onRun }: { onRun: (m: MissionSummary) => void }) {
  const { data, error, loading } = useVisibilityPolling<{ missions: MissionSummary[] }>(
    React.useCallback(() => pluginFetch<{ missions: MissionSummary[] }>("/missions"), []),
  );
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Missions</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>
        {error ? <div className="uh-error">{error}</div> : null}
        {loading && !data ? <div className="uh-muted">Loading…</div> : null}
        {data && data.missions.length === 0 ? (
          <div className="uh-empty">No missions yet. Use the CLI or wizard to create one.</div>
        ) : null}
        <div className="uh-list">
          {data?.missions.map((m) => (
            <div key={m.id} className="uh-list-row uh-clickable" onClick={() => { window.location.hash = buildHash({ view: "mission", missionId: m.id }); }}>
              <div>
                <div className="uh-id">{m.id}</div>
                <div className="uh-muted">{m.name} · workflow: {m.workflow_profile}</div>
              </div>
              <UI.Badge variant={statusBadge(m.status)}>{m.status}</UI.Badge>
              <UI.Button
                variant="outline"
                size="sm"
                onClick={(e: any) => { e.stopPropagation(); onRun(m); }}
              >
                Run
              </UI.Button>
            </div>
          ))}
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}

function RecentRunsPanel() {
  const { data, error, loading } = useVisibilityPolling<{ runs: RunRow[] }>(
    React.useCallback(() => pluginFetch<{ runs: RunRow[] }>("/runs?limit=20"), []),
  );
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Recent runs</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>
        {error ? <div className="uh-error">{error}</div> : null}
        {loading && !data ? <div className="uh-muted">Loading…</div> : null}
        {data && data.runs.length === 0 ? <div className="uh-empty">No runs recorded yet.</div> : null}
        <div className="uh-list">
          {data?.runs.map((r) => (
            <div
              key={r.runId}
              className="uh-list-row uh-clickable"
              onClick={() => { window.location.hash = buildHash({ view: "missionRun", missionId: r.missionId, runId: r.runId }); }}
            >
              <div>
                <div className="uh-id">{r.missionId}</div>
                <div className="uh-muted">{fmt.isoTimeAgo(r.startedAt)} · run {r.runId.slice(0, 12)}</div>
              </div>
              <UI.Badge variant={statusBadge(r.status)}>{r.status}</UI.Badge>
              <div className="uh-muted">{r.durationMs != null ? `${Math.round(r.durationMs / 1000)}s` : "—"}</div>
            </div>
          ))}
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}

export function OverviewTab() {
  const [runMission, setRunMission] = React.useState<MissionSummary | null>(null);
  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <h2 style={{ margin: 0, fontSize: 18 }}>Ultimate Harness</h2>
        <UI.Button
          variant="outline"
          size="sm"
          onClick={() => { window.location.hash = buildHash({ view: "missionNew" }); }}
        >
          + New mission
        </UI.Button>
      </div>
      <div className="uh-grid-3">
        <AdaptersPanel />
        <MissionsPanel onRun={setRunMission} />
        <RecentRunsPanel />
      </div>
      {runMission ? (
        <RunModal mission={runMission} onClose={() => setRunMission(null)} />
      ) : null}
    </div>
  );
}
