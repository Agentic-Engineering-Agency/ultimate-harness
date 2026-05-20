/**
 * UH-94 — React hooks for live run event SSE tails.
 *
 * `useEventTail` keeps the run-scoped URL used by RunModal; drilldown live
 * pane uses `useMissionEventTail` via mission-scoped `?stream=1`.
 */
import { pluginEventSource, subscribeToRunEvents } from "./sdk";
import {
  appendLiveEvent,
  type LiveEventRow,
} from "./live-events-utils";

export type EventStreamStatus = "connecting" | "open" | "closed" | "error";

interface EventTailState {
  events: LiveEventRow[];
  closed: boolean;
  status: EventStreamStatus;
}

/** Run-scoped tail for RunModal (`GET /runs/{runId}/events`). */
export function useEventTail(runId: string | null): EventTailState {
  const [events, setEvents] = React.useState<LiveEventRow[]>([]);
  const [closed, setClosed] = React.useState(false);
  const [status, setStatus] = React.useState<EventStreamStatus>("connecting");
  const nextIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!runId) return;
    nextIdRef.current = 0;
    setEvents([]);
    setClosed(false);
    setStatus("connecting");
    const es = pluginEventSource(`/runs/${encodeURIComponent(runId)}/events`);
    const onOpen = () => setStatus("open");
    const onMessage = (msg: MessageEvent) => {
      setEvents((prev) => {
        const appended = appendLiveEvent(prev, String(msg.data), nextIdRef.current);
        nextIdRef.current = appended.nextId;
        return appended.events;
      });
    };
    const onDone = () => {
      setClosed(true);
      setStatus("closed");
      es.close();
    };
    es.addEventListener("open", onOpen);
    es.addEventListener("message", onMessage);
    es.addEventListener("done", onDone as EventListener);
    return () => {
      es.removeEventListener("open", onOpen);
      es.removeEventListener("message", onMessage);
      es.removeEventListener("done", onDone as EventListener);
      es.close();
    };
  }, [runId]);

  return { events, closed, status };
}

/** Mission-scoped tail for LiveEventsPane (`?stream=1`). */
export function useMissionEventTail(
  missionId: string,
  runId: string | null,
): EventTailState {
  const [events, setEvents] = React.useState<LiveEventRow[]>([]);
  const [closed, setClosed] = React.useState(false);
  const [status, setStatus] = React.useState<EventStreamStatus>("connecting");
  const nextIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!runId) return;
    nextIdRef.current = 0;
    setEvents([]);
    setClosed(false);
    setStatus("connecting");
    const unsub = subscribeToRunEvents(
      missionId,
      runId,
      (line) => {
        setEvents((prev) => {
          const appended = appendLiveEvent(prev, line, nextIdRef.current);
          nextIdRef.current = appended.nextId;
          return appended.events;
        });
      },
      (streamStatus) => {
        setStatus(streamStatus);
        if (streamStatus === "closed") setClosed(true);
      },
    );
    return unsub;
  }, [missionId, runId]);

  return { events, closed, status };
}
