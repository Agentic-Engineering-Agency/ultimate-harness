/**
 * UH-94 — live SSE event tail for an in-flight mission run.
 *
 * Mounted from MissionDrilldown when the pinned or latest run is `running`.
 * Historical finished runs continue to use the static EventsPane fetch.
 */
import { useMissionEventTail } from "./live-events-hooks";
import {
  severityRowClass,
  shouldAutoScrollTop,
  type LiveEventRow,
} from "./live-events-utils";

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
  const logRef = React.useRef<HTMLDivElement | null>(null);
  const scrollLockedRef = React.useRef(false);

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

  const statusLabel =
    status === "connecting" ? "connecting…"
      : status === "open" && !closed ? "live"
        : closed ? "closed"
          : status;

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <span className="uh-mono">run: {runId}</span>
        <div className="uh-row" style={{ gap: 8 }}>
          <label className="uh-muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={showUsage}
              onChange={(e: any) => setShowUsage(e.target.checked)}
            />
            show usage
          </label>
          <span className="uh-muted">{statusLabel}</span>
        </div>
      </div>
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
    </div>
  );
}
