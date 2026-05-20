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
import { pluginFetch, UI, type MissionDetail, fmt } from "./sdk";
import { yamlStringify } from "./yaml-pretty";
import { VerificationViewer } from "./VerificationViewer";
import { RunModal } from "./RunModal";
import { RecentRunsPane } from "./RecentRunsPane";
import { LiveEventsPane } from "./LiveEventsPane";
import { runArtifactUrl, type MissionRunSummary } from "./recent-runs-utils";
import { isRunLiveStatus } from "./live-events-utils";
import { buildHash } from "./router";

type ArtifactPayload = { kind: "text"; content: string } | { kind: "missing"; reason?: string };

const TABS = [
  { key: "mission",  label: "Mission" },
  { key: "prompt",   label: "Prompt" },
  { key: "final",    label: "Final message" },
  { key: "diff",     label: "Diff" },
  { key: "result",   label: "Result" },
  { key: "events",   label: "Events" },
  { key: "verify",   label: "Verification" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/**
 * UH-90 — placeholder shown in artifact tabs when the pinned run was
 * pruned by the retention policy. The per-run dir is gone, but the
 * `runs/index.json` entry survives with `archived: true`. Rendered
 * before any fetch so we don't surface a generic 404.
 */
function ArchivedRunPane({ runId }: { runId: string }) {
  return (
    <div className="uh-empty">
      Artifacts for run <span className="uh-mono">{runId}</span> have been
      archived (UH-90 retention policy). The run still appears in the
      mission history; the per-run files are no longer on disk.
    </div>
  );
}

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

function resolveEventsTarget(
  pinnedRunId: string | undefined,
  runs: MissionRunSummary[],
): { runId: string; status: string | undefined } | null {
  if (pinnedRunId) {
    const pinned = runs.find((r) => r.run_id === pinnedRunId);
    return { runId: pinnedRunId, status: pinned?.status };
  }
  const latest = runs[0];
  return latest ? { runId: latest.run_id, status: latest.status } : null;
}

function EventsPane({ missionId, runId }: { missionId: string; runId?: string }) {
  const [data, setData] = React.useState<ArtifactPayload | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const url = runArtifactUrl(missionId, runId, "events");
    pluginFetch<ArtifactPayload>(url)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e: any) => { if (!cancelled) setData({ kind: "missing", reason: e?.message ?? String(e) }); });
    return () => { cancelled = true; };
  }, [missionId, runId]);
  if (!data) return <div className="uh-muted">Loading events…</div>;
  if (data.kind === "missing") return <div className="uh-empty">{data.reason ?? "No events yet."}</div>;
  const lines = data.content.split("\n").filter(Boolean);
  // Codex P1 round 4: backend payload may carry is_run_scoped:false when
  // the per-run URL was requested but adapters only wrote mission-level
  // artifacts. Surface that gap so operators don't misattribute evidence.
  const isRunScoped = (data as ArtifactPayload & { is_run_scoped?: boolean }).is_run_scoped;
  const showStaleBanner = runId !== undefined && isRunScoped === false;
  return (
    <div>
      {showStaleBanner ? (
        <div className="uh-warn" style={{ marginBottom: 6, fontSize: 11 }}>
          ⚠ Per-run artifacts are not yet emitted by adapters; showing
          mission-latest events. Older runs may be misattributed here.
        </div>
      ) : null}
      <div className="uh-event-log" style={{ maxHeight: 480 }}>
        {lines.length === 0 ? <div className="uh-muted">No events.</div> : lines.map((l, i) => <div key={i} className="uh-event-row">{l}</div>)}
      </div>
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
  /** UH-87 — when set, the next RunModal opens in replay mode pre-filled
   * with this run's runtime_config_overrides + replay_of breadcrumb. */
  const [replaySpec, setReplaySpec] = React.useState<{
    replay_of: string;
    pre_filled_overrides: Record<string, unknown>;
  } | null>(null);
  const [replayError, setReplayError] = React.useState<string | null>(null);

  const openReplay = React.useCallback(async (runId: string) => {
    setReplayError(null);
    try {
      const resp = await pluginFetch<{ runtime_config_overrides: Record<string, unknown> }>(
        `/missions/${encodeURIComponent(missionId)}/runs/${encodeURIComponent(runId)}/overrides`,
      );
      setReplaySpec({
        replay_of: runId,
        pre_filled_overrides: resp.runtime_config_overrides ?? {},
      });
      setShowRunModal(true);
    } catch (e: any) {
      setReplayError(e?.message || String(e));
    }
  }, [missionId]);

  const closeRunModal = React.useCallback(() => {
    setShowRunModal(false);
    setReplaySpec(null);
  }, []);


  // Codex P2 round 10: when the route flips from `mission` to `missionRun`
  // without unmounting (hash-driven nav), the initial useState above never
  // re-runs, so the events tab is not auto-selected. Watch pinnedRunId and
  // switch to events whenever it transitions from undefined to a real id.
  // We do NOT switch away from events when pinnedRunId clears — that
  // would yank the user off a tab they may still want to see.
  React.useEffect(() => {
    if (pinnedRunId) setTab("events");
  }, [pinnedRunId]);
  React.useEffect(() => {
    let cancelled = false;
    pluginFetch<MissionDetail>(`/missions/${encodeURIComponent(missionId)}`)
      .then((m) => { if (!cancelled) { setMission(m); setError(null); } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [missionId]);

  if (error) return <div className="uh-error">Failed to load mission {missionId}: {error}</div>;
  if (!mission) return <div className="uh-muted">Loading mission…</div>;

  // UH-90: short-circuit per-run artifact tabs when the pinned run is
  // archived. The per-run dir is gone so the fetch would 404 with code
  // `archived` — we'd rather show a tailored placeholder before any
  // network round-trip. The Mission/Verification tabs still render
  // (they're mission-scoped, not per-run).
  const pinnedRun = pinnedRunId
    ? mission.runs?.find((r) => r.run_id === pinnedRunId)
    : undefined;
  const pinnedRunArchived = pinnedRun?.archived === true;
  const isPerRunArtifactTab =
    tab === "prompt" || tab === "final" || tab === "diff" ||
    tab === "result" || tab === "events";
  const showArchivedPane = pinnedRunId !== undefined && pinnedRunArchived && isPerRunArtifactTab;
  const eventsTarget = resolveEventsTarget(pinnedRunId, mission.runs ?? []);
  const showLiveEvents =
    tab === "events"
    && eventsTarget !== null
    && isRunLiveStatus(eventsTarget.status)
    && !(pinnedRunId !== undefined && pinnedRunArchived);

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <UI.Button variant="ghost" size="sm" onClick={() => { window.location.hash = buildHash({ view: "overview" }); }}>← Back</UI.Button>
        <div className="uh-row" style={{ gap: 8 }}>
          {pinnedRunId ? (
            <UI.Button variant="outline" onClick={() => openReplay(pinnedRunId)}>Replay this run</UI.Button>
          ) : null}
          <UI.Button onClick={() => { setReplaySpec(null); setShowRunModal(true); }}>Run</UI.Button>
        </div>
      </div>
      {replayError ? <div className="uh-error">Failed to load replay overrides: {replayError}</div> : null}
      {!pinnedRunId ? (
        <RecentRunsPane
          missionId={missionId}
          runs={mission.runs ?? []}
          onReplay={openReplay}
        />
      ) : null}
      {pinnedRunId ? (
        <div className="uh-breadcrumb" style={{ fontSize: 12, marginBottom: 8 }}>
          <span className="uh-muted">{missionId}</span>
          <span className="uh-muted"> › </span>
          <span className="uh-mono">{pinnedRunId.slice(0, 16)}{pinnedRunId.length > 16 ? "…" : ""}</span>
          <UI.Button
            variant="ghost"
            size="sm"
            style={{ marginLeft: 12 }}
            onClick={() => { window.location.hash = buildHash({ view: "mission", missionId }); }}
          >
            Back to latest
          </UI.Button>
        </div>
      ) : null}
      <div className="uh-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={"uh-tab" + (tab === t.key ? " is-active" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "mission" ? <MissionMeta mission={mission} /> : null}
      {showArchivedPane ? <ArchivedRunPane runId={pinnedRunId!} /> : (
        <>
          {tab === "prompt" ? <ArtifactPane url={runArtifactUrl(missionId, pinnedRunId, "prompt")} /> : null}
          {tab === "final"  ? <ArtifactPane url={runArtifactUrl(missionId, pinnedRunId, "final-message")} /> : null}
          {tab === "diff"   ? <ArtifactPane url={runArtifactUrl(missionId, pinnedRunId, "diff")} /> : null}
          {tab === "result" ? <ArtifactPane url={runArtifactUrl(missionId, pinnedRunId, "result")} /> : null}
          {tab === "events" && showLiveEvents && eventsTarget ? (
            <LiveEventsPane missionId={missionId} runId={eventsTarget.runId} />
          ) : null}
          {tab === "events" && !showLiveEvents ? (
            <EventsPane missionId={missionId} runId={pinnedRunId} />
          ) : null}
        </>
      )}
      {tab === "verify" ? <VerificationViewer missionId={missionId} /> : null}
      {showRunModal ? (
        <RunModal
          mission={mission}
          onClose={closeRunModal}
          replay_of={replaySpec?.replay_of}
          pre_filled_overrides={replaySpec?.pre_filled_overrides}
        />
      ) : null}
    </div>
  );
}

// `yamlStringify` is imported to keep tree-shaking honest — the verification
// viewer needs it. Re-export so future drilldown panels that pretty-print
// runtime-result blocks can grab it without re-importing the file.
export { yamlStringify };
