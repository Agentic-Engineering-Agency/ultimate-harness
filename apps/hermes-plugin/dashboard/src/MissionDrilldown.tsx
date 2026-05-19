/**
 * UH-63 — mission drilldown viewers.
 *
 * Tabs: Mission · Prompt · Final message · Diff · Result · Events · Verification.
 *
 * Artifact endpoints return either text (`{kind: "text", content}`) or `{kind: "missing"}`
 * — we render the missing state inline rather than crashing the whole tab.
 *
 * Events tab tails the on-disk `events.ndjson` for a pinned `runId` if one was
 * supplied via the route, otherwise the latest run for the mission.
 */
import { pluginFetch, UI, type MissionDetail } from "./sdk";
import { yamlStringify } from "./yaml-pretty";
import { RunModal } from "./RunModal";
import { buildHash } from "./router";

type ArtifactPayload = { kind: "text"; content: string } | { kind: "missing"; reason?: string };

const TABS = [
  { key: "mission",  label: "Mission" },
  { key: "prompt",   label: "Prompt" },
  { key: "final",    label: "Final message" },
  { key: "diff",     label: "Diff" },
  { key: "result",   label: "Result" },
  { key: "events",   label: "Events" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function ArtifactPane({ url, language }: { url: string; language?: string }) {
  const [data, setData] = React.useState<ArtifactPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    pluginFetch<ArtifactPayload>(url)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [url]);
  if (error) return <div className="uh-error">{error}</div>;
  if (!data) return <div className="uh-muted">Loading…</div>;
  if (data.kind === "missing") return <div className="uh-empty">{data.reason ?? "Artifact not yet produced."}</div>;
  return (
    <pre className="uh-mono" style={{ whiteSpace: "pre-wrap", margin: 0, padding: 8, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 6 }}>
      {data.content}
    </pre>
  );
}

function EventsPane({ missionId, runId }: { missionId: string; runId?: string }) {
  const [data, setData] = React.useState<ArtifactPayload | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const url = runId
      ? `/missions/${encodeURIComponent(missionId)}/runs/${encodeURIComponent(runId)}/events`
      : `/missions/${encodeURIComponent(missionId)}/events`;
    pluginFetch<ArtifactPayload>(url)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: any) => { if (!cancelled) setData({ kind: "missing", reason: e?.message ?? String(e) }); });
    return () => { cancelled = true; };
  }, [missionId, runId]);
  if (!data) return <div className="uh-muted">Loading events…</div>;
  if (data.kind === "missing") return <div className="uh-empty">{data.reason ?? "No events yet."}</div>;
  const lines = data.content.split("\n").filter(Boolean);
  return (
    <div className="uh-event-log" style={{ maxHeight: 480 }}>
      {lines.length === 0 ? <div className="uh-muted">No events.</div> : lines.map((l, i) => <div key={i} className="uh-event-row">{l}</div>)}
    </div>
  );
}

function MissionMeta({ mission }: { mission: MissionDetail }) {
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>{mission.name}</UI.CardTitle>
        <div className="uh-muted">id: {mission.id} · workflow: {mission.workflow_profile}</div>
      </UI.CardHeader>
      <UI.CardContent>
        <div className="uh-stack">
          {mission.description ? <div>{mission.description}</div> : null}
          {mission.acceptance_criteria.length ? (
            <div>
              <strong>Acceptance criteria</strong>
              <ul style={{ marginTop: 4 }}>
                {mission.acceptance_criteria.map((ac) => (
                  <li key={ac.id}><span className="uh-id">{ac.id}</span>: {ac.description}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {mission.expected_artifacts.length ? (
            <div>
              <strong>Expected artifacts</strong>
              <ul style={{ marginTop: 4 }}>
                {mission.expected_artifacts.map((a, i) => <li key={i} className="uh-mono">{a.path}</li>)}
              </ul>
            </div>
          ) : null}
          {mission.capabilities.length ? (
            <div className="uh-muted">capabilities: {mission.capabilities.join(", ")}</div>
          ) : null}
          <details>
            <summary>Raw mission.yaml</summary>
            <pre className="uh-mono" style={{ whiteSpace: "pre-wrap" }}>{mission.raw}</pre>
          </details>
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}

export function MissionDrilldown({ missionId, pinnedRunId }: { missionId: string; pinnedRunId?: string }) {
  const [tab, setTab] = React.useState<TabKey>(pinnedRunId ? "events" : "mission");
  const [mission, setMission] = React.useState<MissionDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showRunModal, setShowRunModal] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    pluginFetch<MissionDetail>(`/missions/${encodeURIComponent(missionId)}`)
      .then((m) => { if (!cancelled) { setMission(m); setError(null); } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [missionId]);

  if (error) return <div className="uh-error">Failed to load mission {missionId}: {error}</div>;
  if (!mission) return <div className="uh-muted">Loading mission…</div>;

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <UI.Button variant="ghost" size="sm" onClick={() => { window.location.hash = buildHash({ view: "overview" }); }}>← Back</UI.Button>
        <UI.Button onClick={() => setShowRunModal(true)}>Run</UI.Button>
      </div>
      <div className="uh-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={"uh-tab" + (tab === t.key ? " is-active" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "mission" ? <MissionMeta mission={mission} /> : null}
      {tab === "prompt" ? <ArtifactPane url={`/missions/${encodeURIComponent(missionId)}/prompt`} /> : null}
      {tab === "final"  ? <ArtifactPane url={`/missions/${encodeURIComponent(missionId)}/final-message`} /> : null}
      {tab === "diff"   ? <ArtifactPane url={`/missions/${encodeURIComponent(missionId)}/diff`} /> : null}
      {tab === "result" ? <ArtifactPane url={`/missions/${encodeURIComponent(missionId)}/result`} /> : null}
      {tab === "events" ? <EventsPane missionId={missionId} runId={pinnedRunId} /> : null}
      {showRunModal ? (
        <RunModal mission={mission} onClose={() => setShowRunModal(false)} />
      ) : null}
    </div>
  );
}

// `yamlStringify` is imported to keep tree-shaking honest — the verification
// viewer needs it. Re-export so future drilldown panels that pretty-print
// runtime-result blocks can grab it without re-importing the file.
export { yamlStringify };
