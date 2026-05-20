# Plugin live events smoke (UH-94)

Status: manual smoke for MissionDrilldown live SSE tail.

## Prerequisites

- Hermes dashboard running (`hermes dashboard` or LaunchAgent).
- UH plugin linked and built:

```bash
cd ~/AgenticEngineering/ultimate-harness
bun run plugin:build
ln -snf "$PWD/apps/hermes-plugin/dashboard" ~/.hermes/plugins/uh/dashboard
curl -s http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

Restart the dashboard if `/api/plugins/uh/*` routes 404 after first install.

## Smoke steps

1. Open `http://127.0.0.1:9119/` → **Ultimate Harness** tab.
2. Pick a mission and click **Run** (or use `uh mission run <id>` from a terminal).
3. While the run is **running**, open the mission drilldown (hash `#/uh/mission/<id>` or pinned run route).
4. Select the **Events** tab.
5. Confirm:
   - Header shows `live` (not static "Loading events…").
   - New NDJSON lines appear within ~200ms of adapter writes.
   - Scrolling down locks auto-scroll; scroll back to top resumes tailing newest events.
6. After the run finishes, refresh or re-open drilldown — Events tab should fall back to static historical NDJSON (no `live` badge).

## curl check (backend only)

With a finished run on disk:

```bash
curl -N "http://127.0.0.1:9119/api/plugins/uh/missions/<mission>/runs/<run>/events?stream=1"
```

Expect `data: {...}` frames and `event: done` after terminal events drain.

## Automated coverage

- Vitest: `tests/live-events-utils.test.ts`
- Pytest SSE: `apps/hermes-plugin/dashboard/tests/test_events_sse.py` (UH-93)
