/**
 * UH-94 — live SSE event tail for an in-flight mission run.
 *
 * Mounted from MissionDrilldown when the pinned or latest run is `running`.
 * Historical finished runs continue to use the static EventsPane fetch.
 *
 * UH-95 — Stop button with confirm modal; POST `/runs/{runId}/cancel`.
 */
import { pluginFetch, UI } from "./sdk";
import { useMissionEventTail } from "./live-events-hooks";
import {
  severityRowClass,
  shouldAutoScrollTop,
  type LiveEventRow,
} from "./live-events-utils";
import { computeGauge, formatUsd, type CapabilitiesResponse } from "./cost-gauge";

function formatEventSummary(row: LiveEventRow): string {
  const label = row.raw ? (row.raw.event ?? row.raw.kind ?? row.raw.type) : undefined;
  if (typeof label === "string") return label;
  return row.line.length > 120 ? `${row.line.slice(0, 117)}…` : row.line;
}

export function LiveEventsPane({
  missionId,
  runId,
}: {
  missionId: string;
  runId: string;
}) {
  const { events, closed, status } = useMissionEventTail(missionId, runId);
  const [showUsage, setShowUsage] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);
  const scrollLockedRef = React.useRef(false);
  const [caps, setCaps] = React.useState<CapabilitiesResponse | null>(null);

  React.useEffect(() => {
    let live = true;
    pluginFetch<CapabilitiesResponse>("/adapters/capabilities")
      .then((c) => { if (live) setCaps(c); })
      .catch(() => { /* gauge degrades to tokens-only without rates */ });
    return () => { live = false; };
  }, []);

  const gauge = React.useMemo(() => computeGauge(events, caps), [events, caps]);

  const visibleEvents = React.useMemo(() => {
    const filtered = showUsage ? events : events.filter((e) => !e.isUsage);
    return filtered.slice().reverse();
  }, [events, showUsage]);

  React.useEffect(() => {
    const el = logRef.current;
    if (!el || scrollLockedRef.current) return;
    if (shouldAutoScrollTop(el)) {
      el.scrollTop = 0;
    }
  }, [visibleEvents.length]);

  const onScroll = React.useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    scrollLockedRef.current = !shouldAutoScrollTop(el);
  }, []);

  const requestCancel = React.useCallback(async () => {
    setCancelling(true);
    setError(null);
    try {
      await pluginFetch(`/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
      setShowConfirm(false);
    } catch (e: any) {
      const code = e?.payload?.code;
      if (code === "already_finished") {
        setError("Run already finished.");
        setShowConfirm(false);
      } else {
        setError(e?.message || String(e));
      }
    } finally {
      setCancelling(false);
    }
  }, [runId]);

  const statusLabel =
    status === "connecting" ? "connecting…"
      : status === "open" && !closed ? "live"
        : closed ? "closed"
          : status;

  const stopDisabled = closed || cancelling;

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <span className="uh-mono">run: {runId}</span>
        <div className="uh-row" style={{ gap: 8 }}>
          {gauge.totals.samples > 0 ? (
            <span className="uh-muted uh-mono" title="tokens in / out (estimated cost)">
              ↑{gauge.totals.input_tokens} ↓{gauge.totals.output_tokens}
              {gauge.costUsd !== undefined ? ` · ${formatUsd(gauge.costUsd)}` : ""}
            </span>
          ) : null}
          <label className="uh-muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={showUsage}
              onChange={(e: any) => setShowUsage(e.target.checked)}
            />
            show usage
          </label>
          <span className="uh-muted">{statusLabel}</span>
          <UI.Button
            variant="destructive"
            size="sm"
            disabled={stopDisabled}
            onClick={() => setShowConfirm(true)}
          >
            Stop
          </UI.Button>
        </div>
      </div>
      {error ? <div className="uh-error">{error}</div> : null}
      <div
        ref={logRef}
        className="uh-event-log"
        style={{ maxHeight: 480 }}
        onScroll={onScroll}
      >
        {visibleEvents.length === 0 ? (
          <div className="uh-muted">Waiting for events…</div>
        ) : visibleEvents.map((e) => (
          <div
            key={e.id}
            className={"uh-event-row" + severityRowClass(e.severity)}
            title={e.line}
          >
            <span className="uh-event-severity">{e.severity}</span>
            {formatEventSummary(e)}
          </div>
        ))}
      </div>
      {showConfirm ? (
        <div className="uh-modal-backdrop" onClick={() => { if (!cancelling) setShowConfirm(false); }}>
          <div className="uh-modal" style={{ maxWidth: 420 }} onClick={(e: any) => e.stopPropagation()}>
            <strong>Stop this run?</strong>
            <p className="uh-muted" style={{ margin: "8px 0" }}>
              Sends SIGTERM to the running process for{" "}
              <span className="uh-mono">{runId}</span>. This cannot be undone.
            </p>
            <div className="uh-row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <UI.Button variant="outline" disabled={cancelling} onClick={() => setShowConfirm(false)}>
                Keep running
              </UI.Button>
              <UI.Button variant="destructive" disabled={cancelling} onClick={requestCancel}>
                {cancelling ? "Stopping…" : "Stop run"}
              </UI.Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
