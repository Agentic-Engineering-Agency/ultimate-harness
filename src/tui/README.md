# `src/tui/` — UH interactive terminal UI

Runtime-loaded by Bun. Not compiled into `dist/`.

## Files

- `model.ts` — pure async TypeScript. Reads `.harness/` into typed rows (`AdapterRow`, `MissionRow`, `SandboxRow`, `HarnessInfo`) and mission drilldown artifacts (`mission.yaml`, runtime summaries, final text, prompt, diff, events). No Solid, no renderer. Unit-tested in `tests/tui-model.test.ts`.
- `state.ts` — Solid signals + `fs.watch` (200 ms debounce) + per-pane selection + cached `adapterCheck` (5 s TTL, one-in-flight) + mission detail + live run state + sandbox/adapter manager actions + per-project persistence. Tested in `tests/tui-state.test.ts` via injected `watcherFactory` / `adapterChecker` / `missionDetailLoader` / `runStarter` / `sandboxOps` / `persistenceStore` seams.
- `keymap.ts` — single source of truth for keybindings; consumed by the overlay (`?`) and the footer hint. Unit-tested in `tests/tui-keymap.test.ts`.
- `dashboard.tsx` — the three-pane view, mission drilldown, run dialog, live events panel, create/discard sandbox modals, keymap overlay. Mnemonic key focus (`a`/`m`/`s`), `Enter` opens detail, `R` runs, `c`/`n`/`d` manage adapters/sandboxes, `?` shows the keymap.
- `run-events.ts` / `run-orchestrator.ts` / `run-session.ts` — NDJSON tailer + subprocess spawner + composition for UH-44's live mission run.
- `persistence.ts` — XDG-aware `tui-state.json` for last selections.
- `index.tsx` — Bun entry point. Imports adapter modules for `runtimeRegistry` self-registration, then `render(<Dashboard/>)`.

## How `uh tui` finds this

```text
uh tui  →  src/cli.ts  →  spawn("bun", ["--preload", "@opentui/solid/preload", "src/tui/index.tsx"])
                                        │
                                        └─ Babel transforms .tsx at module load
```

The `--preload` flag is bunfig-independent, so the TUI works from any cwd. `src/` ships in the npm tarball via `package.json#files` because this entry imports shared harness, schema, and adapter modules from sibling source directories.

## Architecture + decisions

See `docs/architecture/tui.md` for the full record — six committed decisions (TUI as primary surface, Mission Control default, mnemonic focus, hybrid refresh, footer preview + adapter check, tiered failure surface) and the `runtime-session.ndjson` contract that UH-44 inherits.

## Lifecycle gotchas

`docs/research/tui-framework.md §6` is the canonical lifecycle doc — read it before touching `quit()`, `dispose()`, or anything that calls `renderer.destroy()`. `process.exit(0)` without `destroy()` first will leave the terminal in raw mode.
