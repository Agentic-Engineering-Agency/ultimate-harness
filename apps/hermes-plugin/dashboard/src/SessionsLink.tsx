/**
 * UH-69 — `sessions:bottom` slot.
 *
 * Renders a card under the Sessions page that lists recent UH-bound sessions.
 * A session is "UH-bound" when its `metadata.mission_id` matches a mission
 * in `.harness/missions/`. Clicking jumps to the mission drilldown.
 *
 * Empty state when no sessions / no UH missions / no match.
 */
import { pluginFetch, SDK, UI, type MissionSummary } from "./sdk";
import { PLUGIN_BASE_PATH } from "./sdk";

interface SessionRow {
  id: string;
  title?: string;
  updated_at?: string;
  metadata?: { mission_id?: string } | null;
}

export function SessionsLink() {
  const [linked, setLinked] = React.useState<Array<{ session: SessionRow; mission: MissionSummary }>>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [sessionsResp, missionsResp] = await Promise.all([
          SDK.api.getSessions(20).catch(() => ({ sessions: [] })),
          pluginFetch<{ missions: MissionSummary[] }>("/missions").catch(() => ({ missions: [] as MissionSummary[] })),
        ]);
        const sessions: SessionRow[] = (sessionsResp?.sessions ?? []) as SessionRow[];
        const missionsById = new Map<string, MissionSummary>();
        for (const m of missionsResp.missions) missionsById.set(m.id, m);
        const matches: Array<{ session: SessionRow; mission: MissionSummary }> = [];
        for (const s of sessions) {
          const mid = s.metadata?.mission_id;
          if (!mid) continue;
          const m = missionsById.get(mid);
          if (m) matches.push({ session: s, mission: m });
        }
        if (!cancelled) { setLinked(matches); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  if (error || linked.length === 0) {
    // Empty slot — render nothing rather than a noisy empty card.
    return null;
  }

  return (
    <UI.Card>
      <UI.CardHeader><UI.CardTitle>UH missions for these sessions</UI.CardTitle></UI.CardHeader>
      <UI.CardContent>
        <div className="uh-stack">
          {linked.map(({ session, mission }) => (
            <div
              key={session.id}
              className="uh-sessions-link"
              onClick={() => {
                // Deep-link into the UH plugin tab + mission drilldown.
                window.location.assign(`${PLUGIN_BASE_PATH}#/missions/${encodeURIComponent(mission.id)}`);
              }}
            >
              <div>
                <div className="uh-id">{mission.id}</div>
                <div className="uh-muted">session: {session.title ?? session.id}</div>
              </div>
              <UI.Badge variant="outline">{mission.status}</UI.Badge>
            </div>
          ))}
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}
