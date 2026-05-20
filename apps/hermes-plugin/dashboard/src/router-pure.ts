/**
 * Pure routing helpers — no React, no DOM, safe to import from Node tests.
 *
 * `router.ts` re-exports these and adds the React-bound `useHashRoute` hook.
 * Splitting keeps the harness-side vitest typecheck (which doesn't have
 * React in scope) from choking on hook code while still letting us assert
 * on parseRoute's edge cases (Codex round 7 P3).
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

// Codex P3 round 7: decodeURIComponent throws URIError on malformed `%`
// sequences. Because parseRoute runs during render, a bad hash would crash
// the plugin view instead of degrading gracefully. Fallback to overview.
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export function parseRoute(hash: string): ParsedRoute {
  const h = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (h === "" || h === "/") return { view: "overview" };
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "missions") {
    if (parts[1] === "new") return { view: "missionNew" };
    const id = safeDecode(parts[1] ?? "");
    if (!id) return { view: "overview" };
    if (parts[2] === "runs" && parts[3]) {
      const runId = safeDecode(parts[3]);
      if (!runId) return { view: "mission", missionId: id };
      return { view: "missionRun", missionId: id, runId };
    }
    return { view: "mission", missionId: id };
  }
  if (parts[0] === "workflows" && parts[1]) {
    const name = safeDecode(parts[1]);
    if (!name) return { view: "overview" };
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
