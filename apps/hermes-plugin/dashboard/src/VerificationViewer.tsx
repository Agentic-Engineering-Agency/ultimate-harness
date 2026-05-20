/**
 * UH-66 — verification report viewer.
 *
 * Shows the verification status, per-acceptance-criterion result rows, and the
 * runtime_config snapshot the harness recorded. Empty state when the mission
 * hasn't been verified yet (backend returns 404).
 */
import { pluginFetch, UI, type VerificationReport } from "./sdk";
import { yamlStringify } from "./yaml-pretty";

export function VerificationViewer({ missionId }: { missionId: string }) {
  const [data, setData] = React.useState<VerificationReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    pluginFetch<VerificationReport>(`/missions/${encodeURIComponent(missionId)}/verification`)
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [missionId]);

  if (loading) return <div className="uh-muted">Loading…</div>;
  if (error || !data) {
    return <div className="uh-empty">No verification report yet for {missionId}.</div>;
  }

  const config = data.runtime_config ?? {};
  return (
    <div className="uh-stack">
      <div className="uh-row">
        <UI.Badge variant={data.status === "passed" ? "default" : "destructive"}>{data.status}</UI.Badge>
        <span className="uh-muted">checks: {data.checks_passed} passed · {data.checks_failed} failed · {data.checks_blocked} blocked</span>
      </div>
      <UI.Card>
        <UI.CardHeader><UI.CardTitle>Acceptance criteria</UI.CardTitle></UI.CardHeader>
        <UI.CardContent>
          {data.acceptance.length === 0 ? (
            <div className="uh-muted">No structured acceptance criteria.</div>
          ) : (
            <div className="uh-list">
              {data.acceptance.map((ac) => (
                <div key={ac.id} className="uh-list-row">
                  <div>
                    <div className="uh-id">{ac.id}</div>
                    <div className="uh-muted">{ac.description}</div>
                  </div>
                  <UI.Badge variant={ac.status === "passed" ? "default" : "destructive"}>{ac.status}</UI.Badge>
                  <span className="uh-muted">{ac.severity ?? "warn"}</span>
                </div>
              ))}
            </div>
          )}
        </UI.CardContent>
      </UI.Card>
      <UI.Card>
        <UI.CardHeader><UI.CardTitle>runtime_config snapshot</UI.CardTitle></UI.CardHeader>
        <UI.CardContent>
          <pre className="uh-mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{yamlStringify(config)}</pre>
        </UI.CardContent>
      </UI.Card>
    </div>
  );
}
