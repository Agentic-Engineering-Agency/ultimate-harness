# Using `uh tui`

Operator runbook for the interactive Mission Control terminal UI. Covers
the keymap, every screen, the run flow, the sandbox manager, and where
state lives on disk.

Last updated: 2026-05-20. Closes UH-48 / UH-49 / UH-50 / UH-51.

---

## 1. Launch

```bash
uh tui                # mission control, watches .harness/ live
uh tui --root /path   # point at a different repo
uh tui --once         # render one frame and exit (CI / docs / smoke)
uh tui --screenshot docs/assets/screenshots/tui.txt  # capture deterministic text frame
uh tui --screenshot /tmp/tui.txt --screenshot-size 100x30
uh tui --help         # print options
```

Requirements:

- **Bun** ≥ 1.3.x on PATH. The CLI exits 1 with an install hint when
  Bun is missing (`curl -fsSL https://bun.sh/install | bash`).
- A `.harness/project.yaml` in the target root. Without it, the TUI
  shows a full-screen takeover with the `uh init` hint.

Every other `uh` subcommand runs under Node — Bun is only required for
the TUI surface.

### Environment variables

| Variable                  | Values                       | Effect                                                                                                                  |
|---------------------------|------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `UH_TUI_ROOT`             | absolute path                | Override the project root the TUI watches (same as `--root`).                                                           |
| `UH_TUI_ONCE`             | `1`                          | Render one frame then exit (same as `--once`).                                                                          |
| `UH_TUI_THEME`            | `dark` (default), `light`, `system` | Pick the palette. `system` infers from `COLORFGBG`; unknown values fall back to `dark`. See `src/tui/theme.ts`. |
| `UH_TUI_HEADLESS`         | `1`                          | Skip signal wiring (Ctrl+Z / SIGCONT); set automatically by `uh tui screenshot`.                                        |
| `UH_TUI_SCREENSHOT`       | path                         | Write a deterministic text frame to this path (mirrors `--screenshot`).                                                 |
| `UH_TUI_SCREENSHOT_WIDTH` | positive integer (default 120) | Override the screenshot frame width.                                                                                  |
| `UH_TUI_SCREENSHOT_HEIGHT`| positive integer (default 36)  | Override the screenshot frame height.                                                                                 |
| `UH_TUI_SCREENSHOT_VIEW`  | view name                    | Pre-seed `--view` for the screenshot subcommand.                                                                        |


---

## 2. Dashboard (default screen)

```
┌─ Adapters [a] ───┬─ Missions [m] ◀ ────────────┬─ Sandboxes [s] ───┐
│  ● codex         │  ✓ codex-e2e-smoke          │  ● sbx-feature-x  │
│  ● hermes        │  ✓ hermes-proxy-smoke       │  ○ sbx-clean      │
│  ● hermes-proxy  │  ? mission-without-yaml     │                   │
│  ◐ oh-my-pi      │                             │                   │
└──────────────────┴─────────────────────────────┴───────────────────┘
preview line · synced 2026-05-18T…  · ultimate-harness
a/m/s focus · Tab cycle · Enter detail · R run · c check · n new · d
discard · r refresh · ? help · q quit
```

Pane focus is mnemonic: `a` / `m` / `s`. `Tab` cycles. Selecting a
mission scrolls the Sandboxes pane to the bound sandbox via the
existing `sandboxes[].mission_id` relationship.

### Keymap

| Key            | Action                                            |
|----------------|---------------------------------------------------|
| `a` / `m` / `s`| Focus Adapters / Missions / Sandboxes pane        |
| `Tab`          | Cycle focus forward                               |
| `Enter`        | Open mission detail (Missions pane)               |
| `R` (Shift+r)  | Open the Run mission dialog                       |
| `c`            | Force re-check the focused adapter                |
| `n`            | New sandbox dialog (Sandboxes pane)               |
| `d`            | Discard focused sandbox (with confirm)            |
| `r`            | Force-refresh now (bypasses fs.watch debounce)    |
| `?`            | Toggle keymap overlay                             |
| `q`            | Quit (restores terminal)                          |
| `Ctrl+C`       | Force-quit                                        |
| `Ctrl+Z`       | Suspend to shell — type `fg` to resume (UH-50)    |

### Status badges

| Glyph | Adapters         | Missions     | Sandboxes  |
|------|-------------------|--------------|------------|
| `●`  | active            | —            | dirty      |
| `◐`  | experimental      | —            | —          |
| `○`  | deprecated        | —            | created    |
| `✓`  | check ok          | valid        | verified   |
| `✖`  | error             | invalid      | discarded  |
| `?`  | unknown           | missing yaml | —          |
| `▶`  | —                 | —            | running    |
| `★`  | —                 | —            | promoted   |

### Footer preview line

The footer prints a one-line preview of the currently selected row.
Selecting an adapter additionally fires `runtimeRegistry.check(<id>)`
with a 5-second TTL cache and one-in-flight cap, so arrow-spamming the
list never floods the registry. Adapter footer previews include the
check result age (`age=12s`, `age=3m`, etc.) so operators can tell a
fresh green check from stale cached status.

### Tiered failure surface

| Failure | Surface |
|---|---|
| `.harness/project.yaml` absent | Full-screen takeover |
| Schema-malformed adapter/mission/sandbox | Per-row badge |
| `fs.watch` error / dropped-event burst | Sticky footer warning (5 s) |
| Adapter `check` failure | Footer preview line on selection |
| Transient loader throw | Footer error; last-good snapshot stays |

---

## 3. Mission detail (Enter on a mission)

```
┌─ Mission detail ────────────────────────────────────────────────┐
│ codex-e2e-smoke · workflow=research-docs · runtime-result=succeeded │
└─────────────────────────────────────────────────────────────────┘
┌─ Artifacts ◀ ─────┬─ mission.yaml ──────────────────────────────┐
│ Y mission.yaml    │ schema_version: uh.mission.v0               │
│ Y runtime-session…│ id: codex-e2e-smoke                         │
│ Y runtime-result…│ workflow_profile: research-docs              │
│ T runtime-final…  │ ...                                          │
│ T prompt.md       │                                              │
│ D diff.patch      │                                              │
│ E events.ndjson   │                                              │
└───────────────────┴──────────────────────────────────────────────┘
j/k or arrows · Enter focus viewer · Tab swap · g/Shift+G top/bottom
· R run · S stop · L live · Esc back · ? help · q quit
```

Each artifact renders with the right OpenTUI renderable:

| Artifact                  | Viewer                                          |
|---------------------------|-------------------------------------------------|
| `mission.yaml`            | `<code>` (yaml, tree-sitter highlight)          |
| `runtime-session.yaml`    | `<code>` (yaml)                                 |
| `runtime-result.yaml`     | `<code>` (yaml)                                 |
| `runtime-final.txt`       | `<scrollbox>` + `<text>`                        |
| `prompt.md`               | `<scrollbox>` + `<text>`                        |
| `diff.patch`              | `<diff>` (unified, line numbers, colorized)     |
| `events.ndjson`           | `<scrollbox>` (newest-first replay)             |

Missing artifacts render an inline "not present for this mission" hint
so empty states stay distinguishable from load errors.

### Keymap

| Key             | Action                                         |
|-----------------|------------------------------------------------|
| `j` / `↓`       | Next artifact                                  |
| `k` / `↑`       | Previous artifact                              |
| `g`             | Jump to first artifact                         |
| `Shift+G`       | Jump to last artifact                          |
| `Enter`         | Focus viewer pane                              |
| `Tab`           | Swap artifact/viewer focus                    |
| `R` (Shift+r)   | Open the Run mission dialog                    |
| `S` (Shift+s)   | Stop the active run (SIGTERM)                  |
| `L` (Shift+l)   | Toggle the Live events panel                   |
| `e`             | Open the focused artifact (or `mission.yaml`) in `$EDITOR` (UH-49) |
| `Esc`           | Back to dashboard                              |
| `?`             | Keymap overlay                                 |
| `q`             | Quit                                           |

---

## 4. Run mission flow

`R` opens the Run dialog:

```
┌─ Run mission ─────────────────────────────────────────┐
│ Mission: codex-e2e-smoke                              │
│ Runtime (←/→ to change):                              │
│   [hermes]  codex   oh-my-pi   hermes-proxy           │
│ Sandbox: [auto-route] (Tab to toggle)                 │
│ Enter to start · Esc to cancel                        │
└───────────────────────────────────────────────────────┘
```

- Arrow keys cycle the runtime.
- `Tab` toggles `--no-sandbox`.
- `Enter` spawns `uh mission run <mission.yaml> --runtime <r>` (with
  `--no-sandbox` when toggled on) as a child process; the TUI tails
  `.harness/missions/<id>/events.ndjson` for live updates.
- `Esc` cancels without starting.

While a run is active, the mission detail's right pane swaps to a
**Live events** ScrollBox that auto-scrolls to the bottom:

```
┌─ Live events · ▶ running · codex-e2e-smoke ─────────────┐
│ started=2026-05-18T20:00:00Z  finished=—  events=12     │
│ 20:00:00  runtime.started                                │
│ 20:00:01  codex.thread.started                           │
│ 20:00:02  codex.user_message                             │
│ 20:00:30  codex.turn.completed                           │
│ 20:00:31  runtime.finished                               │
└─────────────────────────────────────────────────────────┘
```

- `S` (Shift+s) sends SIGTERM to the child; status becomes `cancelled`.
- `L` (Shift+l) toggles the panel (e.g. to inspect the diff again).
- The live history is capped at 500 events; older lines drop off the
  front but stay on disk for post-run review.

NDJSON contract is documented in
[`docs/architecture/tui.md §3 D4`](../architecture/tui.md). Every
adapter (`hermes`, `codex`, `hermes-proxy`, `oh-my-pi`) already emits
`runtime.started`, namespaced per-step events
(`codex.thread.started`, etc.), and `runtime.finished`.

---

## 5. Sandbox manager

### Create

`n` from the Sandboxes pane opens:

```
┌─ Create sandbox ───────────────────────────────────────┐
│ Field (Tab cycles): id                                 │
│ Sandbox id: ▏                                          │
│ Mission id: codex-e2e-smoke                            │
│ Base ref (optional, defaults to HEAD): ▏               │
│ Enter to submit · Tab to cycle · Esc to cancel         │
└────────────────────────────────────────────────────────┘
```

- The mission id defaults to the currently selected mission.
- Enter on any field submits.
- The TUI calls `createSandbox(root, {id, missionId, baseRef})` from
  `src/harness/sandbox.ts` — the same implementation that backs
  `uh sandbox create`.

### Discard

`d` on the selected sandbox opens a confirm modal:

```
┌─ Discard sandbox ──────────────────────────────────────┐
│ Sandbox: sbx-feature-x                                 │
│ Mission: codex-e2e-smoke  ·  Backend: git-worktree  ·  │
│ Status: created                                        │
│ Force (--force): off  (press F to toggle)              │
│ Enter to confirm · Esc to cancel                       │
└────────────────────────────────────────────────────────┘
```

`F` toggles the `--force` flag, required for dirty worktrees. `Enter`
calls `discardSandbox(root, id, { force })`.

---

## 6. Adapter manager

The Adapters pane is read-only with one live action:

- `c` force-rechecks the focused adapter. This drops the 5-second cache
  TTL and calls `runtimeRegistry.check(root, <id>)` again. The result
  appears on the footer preview line.

Editing a manifest is available on the **mission detail** view: select
the `mission.yaml` artifact and press `e`. The TUI calls
`renderer.suspend()`, spawns `$EDITOR` (defaulting to `vi` via
`VISUAL → EDITOR → vi`), waits for the child to exit, then
`renderer.resume()`s and reloads the mission from disk (UH-49). The
same renderer-suspend lifecycle backs Ctrl+Z (UH-50) — see `src/tui/suspend.ts`
for the SIGTSTP / SIGCONT plumbing.

---

## 7. Persistence

Per-project TUI state is persisted to
`$XDG_CONFIG_HOME/uh/tui-state.json` (defaulting to
`~/.config/uh/tui-state.json`). The file is shared across all repos —
one record per absolute project root.

Persisted fields:

```json
{
  "schema_version": "uh.tui-state.v0",
  "projects": {
    "/Users/me/AgenticEngineering/ultimate-harness": {
      "selectedAdapterId": "codex",
      "selectedMissionId": "codex-e2e-smoke",
      "selectedSandboxId": "sbx-feature-x",
      "activeView": "dashboard"
    }
  }
}
```

Selections are restored on next launch when the matching rows are still
present in the snapshot. Missing rows are silently dropped — no error.
Writes are atomic via a temp-file + `rename`, so a crashed `uh tui`
never leaves a half-written state file.

To opt out, delete the file or unset selections; the TUI works
identically without persistence (e.g. in CI).

---

## 8. Architecture pointers

- `docs/architecture/tui.md` — the load-bearing decisions doc.
- `src/tui/README.md` — file responsibilities.
- `docs/research/tui-framework.md` — the OpenTUI/Solid spike record.
- `src/tui/model.ts` — pure async readers (snapshot + mission detail).
- `src/tui/state.ts` — Solid signals + fs watchers + run state +
  sandbox/adapter actions + persistence.
- `src/tui/run-events.ts` / `run-orchestrator.ts` / `run-session.ts` —
  NDJSON tailer + subprocess spawner + composition.
- `src/tui/persistence.ts` — XDG-aware JSON file for last selections.
- `src/tui/keymap.ts` — single source of truth for keybindings.
- `src/tui/dashboard.tsx` — view + key handler.

## 9. Agent skill

Future agent work on the TUI is best done with the OpenTUI Agent Skill:

```
$ npx skills add anomalyco/opentui --skill opentui -g
```

Installs to `~/.agents/skills/opentui/`; downstream subagents pick it up
automatically. See `docs/research/tui-framework.md §7` for verification
notes.

## 10. Screenshot capture

`uh tui --screenshot <path>` renders the dashboard through OpenTUI's
test renderer and writes one deterministic text frame. Use
`--screenshot-size <cols>x<rows>` to match documentation fixtures or CI
snapshots. The command does not enter the alternate screen and is safe
for non-interactive docs pipelines.

### Automated screenshots (UH-51)

`uh tui screenshot --view <name> --out <path>` is the structured
successor. It boots the TUI in headless mode (`UH_TUI_HEADLESS=1`),
navigates to the requested view via the mock-input adapter, captures
one frame, and exits.

```bash
uh tui screenshot --view overview   --out docs/assets/screenshots/overview.txt
uh tui screenshot --view missions   --out docs/assets/screenshots/missions.txt
uh tui screenshot --view sandboxes  --out docs/assets/screenshots/sandboxes.txt
uh tui screenshot --view workflows  --out docs/assets/screenshots/keymap.txt
uh tui screenshot --view overview                       # write to stdout
uh tui screenshot --view overview --out - --size 80x24  # explicit stdout + size
```

Views:

| Name        | What it shows                                          |
|-------------|--------------------------------------------------------|
| `overview`  | Default three-pane dashboard.                          |
| `missions`  | Dashboard with focus on the Missions pane.             |
| `sandboxes` | Dashboard with focus on the Sandboxes pane.            |
| `workflows` | The full keymap overlay (which lists every binding).   |

Exit codes: `0` on success, `1` on unknown view / render failure /
write failure. The orchestration lives in
`src/tui/screenshot-pipeline.ts`; the render side stays in
`src/tui/screenshot.tsx`.

---

## 11. Polish history

| Item                              | Status   | Tracking                                                         |
|-----------------------------------|----------|------------------------------------------------------------------|
| `?` keymap overlay                | shipped  | UH-42 ([#61](https://github.com/Agentic-Engineering-Agency/ultimate-harness/pull/61)) |
| State persistence                 | shipped  | UH-42                                                            |
| `UH_TUI_THEME` env var + palette  | shipped  | [UH-48](https://linear.app/agenticengineering-agency/issue/UH-48)              |
| `$EDITOR` open (`e`)              | shipped  | [UH-49](https://linear.app/agenticengineering-agency/issue/UH-49)              |
| Ctrl+Z / `fg` suspend             | shipped  | [UH-50](https://linear.app/agenticengineering-agency/issue/UH-50)              |
| `uh tui screenshot` pipeline      | shipped  | [UH-51](https://linear.app/agenticengineering-agency/issue/UH-51)              |

OpenTUI 0.2.13 exposes the full suspend/resume API surface
(`renderer.suspend()`, `renderer.resume()`, plus terminal-mode helpers
such as `resetTerminalBgColor()`), so UH-49 and UH-50 ship the lifecycle
directly instead of approximating it with `setRawMode` and ANSI escape
bytes.
