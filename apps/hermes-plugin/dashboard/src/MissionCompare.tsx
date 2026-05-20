/**
 * UH-89 — side-by-side compare of two runs of the same mission.
 *
 * Three panels: runtime-result field diff, prompt.md line diff (LCS),
 * events.ndjson side-by-side stream. No semantic diff on events —
 * just visual alignment.
 *
 * Backend: `GET /missions/{id}/compare?a=<runA>&b=<runB>`.
 */
import { pluginFetch, UI } from "./sdk";
import { buildHash } from "./router";
import {
  lineDiff,
  runtimeResultDiff,
  type LineDiffOp,
  type RuntimeResultDiffRow,
} from "./mission-compare-helpers";

interface CompareSide {
  run_id: string;
  prompt: string | null;
  final_message: string | null;
  diff: string | null;
  runtime_result: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  truncated_to?: number;
}

interface CompareResponse {
  mission_id: string;
  a: CompareSide;
  b: CompareSide;
}

function formatValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function RuntimeResultDiffPane({ rows }: { rows: RuntimeResultDiffRow[] }) {
  if (rows.length === 0) {
    return <div className="uh-empty">runtime-result.yaml missing on both sides.</div>;
  }
  return (
    <table className="uh-compare-table">
      <thead>
        <tr>
          <th>key</th>
          <th>A</th>
          <th>B</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={r.differs ? "uh-compare-differs" : ""}>
            <td className="uh-mono">{r.key}</td>
            <td className={"uh-mono " + (r.differs ? "uh-compare-a" : "")}>{formatValue(r.aValue)}</td>
            <td className={"uh-mono " + (r.differs ? "uh-compare-b" : "")}>{formatValue(r.bValue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PromptDiffPane({ ops }: { ops: LineDiffOp[] }) {
  if (ops.length === 0) {
    return <div className="uh-empty">No prompt.md on either side.</div>;
  }
  return (
    <pre className="uh-compare-diff">
      {ops.map((o, i) => {
        const prefix = o.kind === "add" ? "+ " : o.kind === "del" ? "- " : "  ";
        return (
          <div key={i} className={`uh-diff-line uh-diff-${o.kind}`}>
            {prefix}
            {o.text}
          </div>
        );
      })}
    </pre>
  );
}

function EventsColumn({ side, events, truncatedTo }: { side: "A" | "B"; events: Array<Record<string, unknown>>; truncatedTo?: number }) {
  return (
    <div className="uh-compare-events">
      <div className="uh-compare-events-head">
        Events {side}
        {truncatedTo !== undefined ? (
          <span className="uh-muted" style={{ marginLeft: 8 }}>truncated to {truncatedTo} most recent</span>
        ) : null}
      </div>
      {events.length === 0 ? (
        <div className="uh-empty">No events on side {side}.</div>
      ) : (
        <div className="uh-event-log">
          {events.map((e, i) => {
            const ts = typeof e["ts"] === "string" ? e["ts"] : typeof e["timestamp"] === "string" ? e["timestamp"] : "";
            const evt = typeof e["event"] === "string" ? e["event"] : typeof e["type"] === "string" ? e["type"] : "event";
            const rest: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(e)) {
              if (k === "ts" || k === "timestamp" || k === "event" || k === "type") continue;
              rest[k] = v;
            }
            const data = truncate(formatValue(rest), 120);
            return (
              <div key={i} className="uh-event-row">
                <span className="uh-muted">{ts}</span> {evt}: {data}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MissionCompare({ missionId, runA, runB }: { missionId: string; runA: string; runB: string }) {
  const [data, setData] = React.useState<CompareResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const url = `/missions/${encodeURIComponent(missionId)}/compare?a=${encodeURIComponent(runA)}&b=${encodeURIComponent(runB)}`;
    pluginFetch<CompareResponse>(url)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [missionId, runA, runB]);

  function swap() {
    window.location.hash = buildHash({ view: "missionCompare", missionId, runA: runB, runB: runA });
  }
  function exit() {
    window.location.hash = buildHash({ view: "mission", missionId });
  }

  if (error) {
    return (
      <div className="uh-stack">
        <div className="uh-row-between">
          <strong>Compare runs</strong>
          <UI.Button variant="ghost" size="sm" onClick={exit}>Exit compare</UI.Button>
        </div>
        <div className="uh-error">Failed to load comparison: {error}</div>
      </div>
    );
  }
  if (!data) {
    return <div className="uh-muted">Loading comparison…</div>;
  }

  const rrRows = runtimeResultDiff(data.a.runtime_result, data.b.runtime_result);
  const promptOps = lineDiff(data.a.prompt ?? "", data.b.prompt ?? "");

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <div>
          <strong>Compare runs</strong>
          <div className="uh-muted">
            <span className="uh-mono">A: {truncate(data.a.run_id, 24)}</span>
            {" · "}
            <span className="uh-mono">B: {truncate(data.b.run_id, 24)}</span>
          </div>
        </div>
        <div className="uh-row" style={{ gap: 8 }}>
          <UI.Button variant="outline" size="sm" onClick={swap}>Swap A/B</UI.Button>
          <UI.Button variant="ghost" size="sm" onClick={exit}>Exit compare</UI.Button>
        </div>
      </div>

      <UI.Card>
        <UI.CardHeader>
          <UI.CardTitle>runtime-result.yaml</UI.CardTitle>
        </UI.CardHeader>
        <UI.CardContent>
          <RuntimeResultDiffPane rows={rrRows} />
        </UI.CardContent>
      </UI.Card>

      <UI.Card>
        <UI.CardHeader>
          <UI.CardTitle>prompt.md diff</UI.CardTitle>
        </UI.CardHeader>
        <UI.CardContent>
          <PromptDiffPane ops={promptOps} />
        </UI.CardContent>
      </UI.Card>

      <UI.Card>
        <UI.CardHeader>
          <UI.CardTitle>events.ndjson</UI.CardTitle>
        </UI.CardHeader>
        <UI.CardContent>
          <div className="uh-compare-events-grid">
            <EventsColumn side="A" events={data.a.events} truncatedTo={data.a.truncated_to} />
            <EventsColumn side="B" events={data.b.events} truncatedTo={data.b.truncated_to} />
          </div>
        </UI.CardContent>
      </UI.Card>
    </div>
  );
}