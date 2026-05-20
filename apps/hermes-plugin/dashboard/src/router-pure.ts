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
    | "missionCompare"
    | "missionNew"
    | "workflow"
    | "workflowEdit";
  missionId?: string;
  runId?: string;
  /** UH-89 — populated for the `missionCompare` view (`?a=...`). */
  runA?: string;
  /** UH-89 — populated for the `missionCompare` view (`?b=...`). */
  runB?: string;
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

function parseQuery(qs: string): Record<string, string> {
  // Tiny purpose-built parser: avoids pulling URLSearchParams into the
  // 50 KB bundle. Last value wins on duplicate keys (matches URLSearchParams.get).
  const out: Record<string, string> = {};
  if (!qs) return out;
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq >= 0 ? pair.slice(0, eq) : pair;
    const v = eq >= 0 ? pair.slice(eq + 1) : "";
    const decodedK = safeDecode(k);
    const decodedV = safeDecode(v);
    if (decodedK === null || decodedV === null) continue;
    out[decodedK] = decodedV;
  }
  return out;
}

export function parseRoute(hash: string): ParsedRoute {
  const h = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (h === "" || h === "/") return { view: "overview" };
  // Peel off the `?query` BEFORE splitting on `/`. Otherwise the query
  // string gets embedded in the last path segment and the missionCompare
  // route (which carries `?a=&b=`) never matches.
  const qIdx = h.indexOf("?");
  const pathPart = qIdx >= 0 ? h.slice(0, qIdx) : h;
  const query = qIdx >= 0 ? parseQuery(h.slice(qIdx + 1)) : {};
  const parts = pathPart.split("/").filter(Boolean);
  if (parts[0] === "missions") {
    if (parts[1] === "new") return { view: "missionNew" };
    const id = safeDecode(parts[1] ?? "");
    if (!id) return { view: "overview" };
    if (parts[2] === "compare") {
      const a = query.a;
      const b = query.b;
      // UH-89: both run ids are mandatory; fall back to the mission view
      // when either is missing so a half-written URL doesn't crash render.
      if (!a || !b) return { view: "mission", missionId: id };
      return { view: "missionCompare", missionId: id, runA: a, runB: b };
    }
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
    case "missionCompare":
      return `#/missions/${encodeURIComponent(route.missionId ?? "")}/compare?a=${encodeURIComponent(route.runA ?? "")}&b=${encodeURIComponent(route.runB ?? "")}`;
    case "workflow":
      return `#/workflows/${encodeURIComponent(route.workflowName ?? "")}`;
    case "workflowEdit":
      return `#/workflows/${encodeURIComponent(route.workflowName ?? "")}/edit`;
  }
}
