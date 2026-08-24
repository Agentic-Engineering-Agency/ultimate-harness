import { pluginFetch } from "./sdk";
import type { DeliveryObservatorySnapshot, ObservatoryOperation } from "./observatory-types";

const POLL_MS = 30_000;

export type ObservatoryView = "operate" | "review" | "observe";
export type ObservatoryFilters = {
  project: string;
  operation: ObservatoryOperation | "all";
  risk: "all" | "low" | "medium" | "high" | "critical" | "unknown";
};

export function useObservatoryStore() {
  const [snapshot, setSnapshot] = React.useState<DeliveryObservatorySnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [view, setView] = React.useState<ObservatoryView>("operate");
  const [selectedWorkId, setSelectedWorkId] = React.useState<string | null>(null);
  const [meeting, setMeeting] = React.useState(false);
  const [filters, setFilters] = React.useState<ObservatoryFilters>({ project: "all", operation: "all", risk: "all" });

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await pluginFetch<DeliveryObservatorySnapshot>("/observatory/snapshot");
      if (next.contract_version !== "delivery-observatory.v1") throw new Error("Unsupported Observatory contract.");
      setSnapshot(next);
      setError(null);
      setSelectedWorkId((current) => next.work_items.some((item) => item.work_item_id === current)
        ? current
        : next.work_items[0]?.work_item_id ?? null);
    } catch (cause: any) {
      setError(cause?.message || "The local source could not be refreshed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "hidden") await refresh();
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const workItems = React.useMemo(() => (snapshot?.work_items ?? []).filter((item) => (
    (filters.project === "all" || item.project_ref === filters.project)
    && (filters.operation === "all" || item.operation === filters.operation)
    && (filters.risk === "all" || item.risk === filters.risk)
  )), [snapshot, filters]);
  const selectedWork = workItems.find((item) => item.work_item_id === selectedWorkId) ?? workItems[0] ?? null;

  return {
    snapshot, error, loading, refreshing, refresh,
    view, setView, meeting, setMeeting,
    filters, setFilters, workItems, selectedWork, selectedWorkId, setSelectedWorkId,
  };
}
