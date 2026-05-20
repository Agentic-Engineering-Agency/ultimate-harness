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
 *
 * Codex round 7 P3: parseRoute + buildHash + ParsedRoute live in
 * `router-pure.ts` so Node tests can import them without dragging React
 * into the harness vitest typecheck. The React-bound `useHashRoute` hook
 * stays here.
 */
export { parseRoute, buildHash, type ParsedRoute } from "./router-pure.js";
import { parseRoute, buildHash, type ParsedRoute } from "./router-pure.js";

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
