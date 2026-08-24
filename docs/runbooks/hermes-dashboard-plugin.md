# Hermes dashboard plugin runbook

Status: complete package workflow validated against Hermes Agent v0.20.5 on 2026-08-24.

The `uh` plugin makes Ultimate Harness drivable from the Hermes web dashboard: live adapter health, mission list, mission run trigger with live event tail, artifact drilldown (prompt, final-message, diff, runtime-result, events, verification), workflow viewer + editor, mission wizard, and a Sessions-page deep-link slot.

This runbook covers install, day-1 sanity checks, common failure modes, and the dev loop. The plugin source lives in [`apps/hermes-plugin/`](../../apps/hermes-plugin/). See the [hermes dashboard extension docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard) for the SDK contract this plugin builds on.

## Packaging compatibility

Hermes dashboard discovery and Hermes plugin discovery are separate gates. The
old layout linked only `~/.hermes/plugins/uh/dashboard`; the dashboard could see
its `manifest.json`, but Hermes Agent v0.20.5 could not enable the package:

```text
$ hermes plugins enable uh --no-allow-tool-override
Plugin 'uh' is not installed or bundled.
```

The complete package has `plugin.yaml`, a no-op `__init__.py`, `dashboard/`, and
`theme/` under one root. Its native manifest is metadata-only and requests no
tools, hooks, capabilities, or tool-override authority. Ultimate Harness remains
the sole Run Control through the public `uh` CLI and `.harness/` artifacts.

## Install

### From source (dev / pre-release)

```bash
# 1) Build the bundle.
cd /absolute/path/to/ultimate-harness
bun run plugin:build

# 2) Link the complete package + theme and enable without tool override.
apps/hermes-plugin/hermes-local.sh enable

# 3) Start normally in the foreground against one explicit harness root.
UH_PROJECT_ROOT=/absolute/path/to/harness-project \
  apps/hermes-plugin/hermes-local.sh start
```

The helper refuses to replace existing paths. If the obsolete dashboard-only
directory already exists, stop the dashboard and move that exact directory to a
backup before `enable`; for example:

```bash
mv ~/.hermes/plugins/uh ~/.hermes/plugins/uh.dashboard-only.backup
```

Keep that backup until the checks below pass. `start` does not install login
persistence: it runs Hermes Dashboard in the foreground on `127.0.0.1:9119`.
Stop it with `Ctrl-C`; restart by running the same explicit
`UH_PROJECT_ROOT=... hermes-local.sh start` command. Backend routes mount once
at startup, so a rescan is not a substitute for this normal restart.

Open `http://127.0.0.1:9119/uh`. The **Ultimate Harness** tab appears after
**Sessions** in the nav rail. The theme switcher lists **Ultimate Harness**.

### Lifecycle and rollback

```bash
apps/hermes-plugin/hermes-local.sh status
apps/hermes-plugin/hermes-local.sh disable   # keep links, remove allowlist entry
apps/hermes-plugin/hermes-local.sh enable    # restore allowlist, no tool override
apps/hermes-plugin/hermes-local.sh rollback  # disable + remove owned links only
```

`rollback` preflights both paths and refuses to remove anything it did not
link to this package. To restore an obsolete layout after rollback, move the
saved backup back to `~/.hermes/plugins/uh` and restart Hermes explicitly.

### From a release tarball (post UH-68)

The release tarball is produced by the GitHub Actions workflow staged at
[`docs/ci/release-plugin.yml.example`](../ci/release-plugin.yml.example).
Move it to `.github/workflows/release-plugin.yml` (requires a GitHub token
with the `workflow` scope) and tag with `plugin-v*` to trigger a build —
the staged path keeps the initial branch importable under OAuth tokens
without `workflow` scope.

```bash
mkdir -p ~/.hermes/plugins/uh
curl -sSL https://github.com/Agentic-Engineering-Agency/ultimate-harness/releases/latest/download/hermes-plugin.tar.gz \
  | tar -xz -C ~/.hermes/plugins/uh --strip-components=2

mkdir -p ~/.hermes/dashboard-themes
cp ~/.hermes/plugins/uh/theme/ultimate-harness.yaml ~/.hermes/dashboard-themes/

hermes plugins enable uh --no-allow-tool-override

# Start in the foreground with an explicit project root.
UH_PROJECT_ROOT=/absolute/path/to/harness-project \
  ~/.hermes/plugins/uh/hermes-local.sh start
```

## First sanity checks

```bash
# 1) Plugin manifest is discovered and the browser assets are served.
curl -fsS http://127.0.0.1:9119/api/dashboard/plugins | jq '.[].name' | grep -F '"uh"'
curl -fsSI http://127.0.0.1:9119/dashboard-plugins/uh/dist/index.js
curl -fsSI http://127.0.0.1:9119/dashboard-plugins/uh/dist/style.css

# 2) CLI package discovery is enabled without override authority.
hermes plugins list | grep -F 'uh'
```

The backend status and Observatory snapshot routes are session-protected. Check
them from the signed-in dashboard (or an automation tab with its own valid
session), not with an unauthenticated curl:

```js
await fetch("/api/plugins/uh/status").then((response) => response.json());
await fetch("/api/plugins/uh/observatory/snapshot").then((response) => response.json());
```

Expect the selected project name in status and
`contract_version: "delivery-observatory.v1"` in the snapshot. In the browser,
`/uh` must render the Ultimate Harness surface rather than the generic SPA
fallback, and a refresh must preserve the same project and snapshot counts.

If `/api/plugins/uh/status` returns `{"project_name": "unknown"}`, the dashboard process can't see your `.harness/` directory. Set `UH_PROJECT_ROOT`:

```bash
export UH_PROJECT_ROOT=/abs/path/to/your/uh/project
# then restart hermes dashboard so plugin_api picks it up
```

## Daily dev loop

```bash
bun run plugin:watch      # rebuild on save -> dashboard/dist/index.js
bun run plugin:test       # pytest backend tests (fast, ~150ms)
bun run plugin:typecheck  # editor parity; the bundle ships without this
```

The dashboard reloads the bundle on its own when the file mtime changes, but a hard refresh (`Cmd+R`) is the most reliable signal. After editing `plugin_api.py`, restart `hermes dashboard` so the FastAPI router re-mounts.

## Browsing run history

UH-85 / UH-86 / UH-88 — the Mission detail tab renders a **Recent runs** pane above the artifact tabs whenever you are on the mission-latest view (no `pinnedRunId`). The pane reads `mission.runs[]` (the backend cap is 50 newest-first; older runs paginate in a follow-up).

- **Sort.** Click any column header — `Run ID`, `Started`, `Duration`, `Status`, `Runtime` — to toggle the sort key. Time-ish columns default to descending on first click; textual columns default to ascending. Running rows float to the top when you sort by duration.
- **Filter by status.** The chip strip above the table lists the seven run statuses (`passed`, `needs-attention`, `needs-remediation`, `failed`, `cancelled`, `timeout`, `running`). Click chips to multi-select; OR semantics within the chip set. The `Showing N of M runs` counter and the `Clear filters` button surface only when a filter is active.
- **Filter by run id.** The free-text input next to the chips does a case-insensitive prefix match on `run_id` as you type.
- **Drill into a run.** Click any row to navigate to `#/missions/<id>/runs/<run_id>`. The drilldown hides the Recent runs pane, shows a breadcrumb with the truncated run id, and routes the Prompt / Final message / Diff / Result / Events tabs through `/missions/<id>/runs/<run_id>/<kind>` so every artifact reflects that specific run. Use the **Back to latest** button to return to the mission-latest view.

Filter and sort state is component-local — refreshing the page or navigating away resets it.

## Configuration knobs (backend)

| Env var | Default | Purpose |
| --- | --- | --- |
| `UH_PROJECT_ROOT` | dashboard cwd | Root of the harness project (`.harness/` lives here). |
| `UH_CLI_BIN` | `uh` | Path to the `uh` binary if not on `$PATH`. |
| `UH_READ_TIMEOUT_S` | `30` | Cap on synchronous CLI calls (`uh adapter check`, etc.). |
| `UH_RUN_TIMEOUT_S` | `3600` | Cap on mission-run subprocesses. |
| `UH_MAX_ARTIFACT_BYTES` | `5242880` (5 MB) | Artifacts larger than this return HTTP 413 — the UI renders an inline truncation card. |

## Endpoint reference

All endpoints are mounted under `/api/plugins/uh/`.

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/status` | GET | Project summary + adapter check (`uh adapter check` shelled out). |
| `/missions` | GET | List from `.harness/missions/*/mission.yaml`. |
| `/missions/{id}` | GET | Single mission + raw YAML. |
| `/missions/{id}/run` | POST | Spawn `uh mission run {id}`. Body: `{"runtime_config_overrides"?: {...}}` — now forwarded to the CLI as `--runtime-config-overrides <json>` (UH-81); empty/absent block runs with mission defaults. Hard cap: 8192 bytes of compact JSON (`UH_MAX_OVERRIDES_JSON_BYTES`) → 400 `overrides_too_large`. Returns `{runId, startedAt}`. |
| `/missions/{id}/{prompt|final-message|diff|result|events}` | GET | Per-artifact payload `{kind: "text", content}` or `{kind: "missing"}`. |
| `/missions/{id}/runs/{runId}/{prompt|final-message|diff|result|events}` | GET | Per-run artifact under `runs/<run_id>/`. UH-82: response carries `is_run_scoped: true` and `served_run_id == requested_run_id`. 404 when the run dir is missing. |
| `/missions/{id}/verification` | GET | `verification.yaml` parsed. 404 until `uh verify` runs. |
| `/missions` | POST | Mission wizard. Validates `id` slug + required fields. |
| `/workflows` | GET | List `.harness/workflows/*.yaml`. |
| `/workflows/{name}` | GET / PUT | Read / overwrite workflow YAML (validated before write). |
| `/runs` | GET | Recent runs (`?limit=20`). |
| `/runs/{runId}/events` | GET | SSE tail of `runs/<run_id>/events.ndjson`. Emits `event: done` when the spawn exits. |
| `/runs/{runId}/cancel` | POST | SIGTERM the spawned `uh` process for that run. |

Error shape: `{"error": "...", "code": "<slug>", "stderr"?: "...", "fields"?: {...}}`. Wizard / editor field-level errors land in `fields`.

## Troubleshooting

**Tab doesn't appear after symlink.** Verify the manifest path:

```bash
test -f ~/.hermes/plugins/uh/dashboard/manifest.json && echo OK || echo MISSING
curl -s http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

If `rescan` returns 200 but the tab still doesn't appear, open DevTools → Console — the dashboard logs `Failed to load plugin uh` with the underlying error.

**Backend returns 404 for `/api/plugins/uh/*`.** Plugin Python routes mount once at dashboard startup; restart `hermes dashboard`.

**`status` shows `project_name: unknown`.** The dashboard's CWD has no `.harness/project.yaml`. Set `UH_PROJECT_ROOT` and restart.

**Tail emits no events.** Confirm `.harness/missions/<id>/events.ndjson` exists; if the run hasn't started yet, the SSE generator waits up to 60 s for the file to appear before draining. Each adapter writes that file from the start of the run — if it never shows, the `uh mission run` invocation failed (check stderr in the SSE `event: done` payload).

**Bundle bigger than 50 KB.** Run `bun run plugin:build` — the build script logs the size. The cap is enforced by [`tests/plugin-bundle-size.test.ts`](../../tests/plugin-bundle-size.test.ts); if it fails, drop a dependency or move logic into the SDK rather than bundling it.

**Theme didn't load.** Confirm `~/.hermes/dashboard-themes/ultimate-harness.yaml` exists; refresh the dashboard and pick **Ultimate Harness** from the palette switcher (header bar).

## Screenshots

_[screenshot TBD]_ — the dev environment for this slice doesn't include a live Hermes dashboard, so screenshots will land with the [UH-68 release PR](https://linear.app/agenticengineering-agency/issue/UH-68) once we can drive the real UI.

## See also

- [Hermes dashboard extension docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/extending-the-dashboard)
- [`apps/hermes-plugin/README.md`](../../apps/hermes-plugin/README.md)
- Issue links: [UH-60](https://linear.app/agenticengineering-agency/issue/UH-60) (epic), [UH-61](https://linear.app/agenticengineering-agency/issue/UH-61) (scaffold), [UH-62](https://linear.app/agenticengineering-agency/issue/UH-62) (FastAPI backend), [UH-63](https://linear.app/agenticengineering-agency/issue/UH-63) (drilldown), [UH-64](https://linear.app/agenticengineering-agency/issue/UH-64) (run modal), [UH-65](https://linear.app/agenticengineering-agency/issue/UH-65) (overview), [UH-66](https://linear.app/agenticengineering-agency/issue/UH-66) (workflow + verification viewers), [UH-67](https://linear.app/agenticengineering-agency/issue/UH-67) (wizard + editor), [UH-68](https://linear.app/agenticengineering-agency/issue/UH-68) (packaging), [UH-69](https://linear.app/agenticengineering-agency/issue/UH-69) (theme + slot).
