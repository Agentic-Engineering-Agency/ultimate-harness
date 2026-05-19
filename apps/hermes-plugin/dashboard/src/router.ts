/**
 * Tiny hash-based router for the plugin shell.
 *
 * The dashboard already owns the browser router. To keep this plugin's bundle
 * tiny we route inside the `/uh` tab via `location.hash`:
 *
 *   #/                            -> overview
 *   #/missions/<id>               -> mission drilldown
 *   #/missions/<id>/runs/<runId>  -> mission drilldown, "Events" tab pinned to runId
 *   #/missions/new                -> mission wizard
 *   #/workflows/<name>            -> workflow viewer
 *   #/workflows/<name>/edit       -> workflow editor
 *
 * That way deep-links survive reloads, the back button works, and we don't
 * have to add `react-router-dom` to the bundle.
 */
export interface ParsedRoute {
  view:
    | "overview"
    | "mission"
    | "missionRun"
    | "missionNew"
    | "workflow"
    | "workflowEdit";
  missionId?: string;
  runId?: string;
  workflowName?: string;
}

export function parseRoute(hash: string): ParsedRoute {
  const h = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (h === "" || h === "/") return { view: "overview" };
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "missions") {
    if (parts[1] === "new") return { view: "missionNew" };
    const id = decodeURIComponent(parts[1] ?? "");
    if (!id) return { view: "overview" };
    if (parts[2] === "runs" && parts[3]) {
      return { view: "missionRun", missionId: id, runId: decodeURIComponent(parts[3]) };
    }
    return { view: "mission", missionId: id };
  }
  if (parts[0] === "workflows" && parts[1]) {
    const name = decodeURIComponent(parts[1]);
    if (parts[2] === "edit") return { view: "workflowEdit", workflowName: name };
    return { view: "workflow", workflowName: name };
  }
  return { view: "overview" };
}

export function buildHash(route: ParsedRoute): string {
  switch (route.view) {
    case "overview":
      return "#/";
    case "missionNew":
      return "#/missions/new";
    case "mission":
      return `#/missions/${encodeURIComponent(route.missionId ?? "")}`;
    case "missionRun":
      return `#/missions/${encodeURIComponent(route.missionId ?? "")}/runs/${encodeURIComponent(route.runId ?? "")}`;
    case "workflow":
      return `#/workflows/${encodeURIComponent(route.workflowName ?? "")}`;
    case "workflowEdit":
      return `#/workflows/${encodeURIComponent(route.workflowName ?? "")}/edit`;
  }
}

export function useHashRoute(): [ParsedRoute, (next: ParsedRoute) => void] {
  const [hash, setHash] = React.useState<string>(() => window.location.hash);
  React.useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const route = React.useMemo(() => parseRoute(hash), [hash]);
  const navigate = React.useCallback((next: ParsedRoute) => {
    const target = buildHash(next);
    if (target !== window.location.hash) {
      window.location.hash = target;
    }
  }, []);
  return [route, navigate];
}
