/**
 * UH-64 — mission run trigger + live event-stream tail.
 *
 * Flow:
 *   1. Operator picks a mission from the overview list -> we open this modal.
 *   2. Modal shows a mission summary + optional `runtime_config_overrides` JSON.
 *   3. Cancel / Run.
 *      - Cancel: close modal, no side effect.
 *      - Run: POST `/missions/{id}/run` (with overrides), receive `{runId}`,
 *        switch body to live SSE tail of `/runs/{runId}/events`.
 *   4. Operator may close the modal mid-run — server-side run keeps going.
 *      Reopen via the recent-runs list to restore the tail.
 *   5. Stop button POSTs `/runs/{runId}/cancel` (SIGTERM on the backend).
 *
 * Virtualization: we keep only the last 500 events in state; the SSE source
 * still drains continuously so we never block the backend.
 */
import { pluginEventSource, pluginFetch, UI, type MissionSummary, type RunStartResponse } from "./sdk";

const MAX_EVENTS = 500;

interface EventRow { ts: number; line: string; error?: boolean }

function useEventTail(runId: string | null): { events: EventRow[]; closed: boolean } {
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [closed, setClosed] = React.useState(false);
  React.useEffect(() => {
    if (!runId) return;
    setEvents([]);
    setClosed(false);
    const es = pluginEventSource(`/runs/${encodeURIComponent(runId)}/events`);
    const onMessage = (msg: MessageEvent) => {
      setEvents((prev) => {
        const next = prev.length >= MAX_EVENTS ? prev.slice(prev.length - MAX_EVENTS + 1) : prev.slice();
        next.push({ ts: Date.now(), line: msg.data });
        return next;
      });
    };
    const onError = () => {
      // Browser auto-reconnects on EventSource errors; we surface the state
      // only when the server explicitly closes via a `done` event below.
    };
    const onDone = () => {
      setClosed(true);
      es.close();
    };
    es.addEventListener("message", onMessage);
    es.addEventListener("error", onError);
    es.addEventListener("done", onDone as EventListener);
    return () => {
      es.removeEventListener("message", onMessage);
      es.removeEventListener("error", onError);
      es.removeEventListener("done", onDone as EventListener);
      es.close();
    };
  }, [runId]);
  return { events, closed };
}

export function RunModal({
  mission,
  onClose,
  initialRunId,
}: {
  mission: MissionSummary;
  onClose: () => void;
  initialRunId?: string;
}) {
  const [overrides, setOverrides] = React.useState<string>("{}");
  const [runId, setRunId] = React.useState<string | null>(initialRunId ?? null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { events, closed } = useEventTail(runId);
  const logRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const submit = React.useCallback(async () => {
    setSubmitting(true);
    setError(null);
    let parsed: unknown = {};
    if (overrides.trim()) {
      try { parsed = JSON.parse(overrides); } catch (e: any) {
        setError(`runtime_config_overrides is not valid JSON: ${e.message}`);
        setSubmitting(false);
        return;
      }
    }
    try {
      const resp = await pluginFetch<RunStartResponse>(`/missions/${encodeURIComponent(mission.id)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runtime_config_overrides: parsed }),
      });
      setRunId(resp.runId);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }, [overrides, mission.id]);

  const stop = React.useCallback(async () => {
    if (!runId) return;
    try { await pluginFetch(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }); }
    catch (e: any) { setError(e?.message || String(e)); }
  }, [runId]);

  return (
    <div className="uh-modal-backdrop" onClick={onClose}>
      <div className="uh-modal" onClick={(e: any) => e.stopPropagation()}>
        <div className="uh-row-between">
          <strong>Run {mission.id}</strong>
          <UI.Button variant="ghost" size="sm" onClick={onClose}>Close</UI.Button>
        </div>
        <div className="uh-muted">{mission.name} · workflow: {mission.workflow_profile}</div>
        {!runId ? (
          <div className="uh-stack">
            <UI.Label>runtime_config_overrides (JSON)</UI.Label>
            <textarea
              className="uh-textarea"
              value={overrides}
              onChange={(e: any) => setOverrides(e.target.value)}
              spellCheck={false}
            />
            {error ? <div className="uh-error">{error}</div> : null}
            <div className="uh-row" style={{ justifyContent: "flex-end" }}>
              <UI.Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</UI.Button>
              <UI.Button onClick={submit} disabled={submitting}>{submitting ? "Starting…" : "Run"}</UI.Button>
            </div>
          </div>
        ) : (
          <div className="uh-stack">
            <div className="uh-row-between">
              <span className="uh-mono">run: {runId}</span>
              <span className="uh-muted">{closed ? "closed" : "live"}</span>
            </div>
            <div ref={logRef} className="uh-event-log">
              {events.length === 0 ? (
                <div className="uh-muted">Waiting for events…</div>
              ) : events.map((e, i) => (
                <div key={i} className={"uh-event-row" + (e.error ? " is-error" : "")}>{e.line}</div>
              ))}
            </div>
            {error ? <div className="uh-error">{error}</div> : null}
            <div className="uh-row" style={{ justifyContent: "flex-end" }}>
              <UI.Button variant="destructive" onClick={stop} disabled={closed}>Stop</UI.Button>
              <UI.Button variant="outline" onClick={onClose}>Close</UI.Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
