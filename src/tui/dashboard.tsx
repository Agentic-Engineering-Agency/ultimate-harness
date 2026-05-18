/**
 * UH-46 — three-pane dashboard view.
 *
 * Layout (post-grill, Q3 + Q5 + Q6):
 *   ┌───────────────┬───────────────────┬──────────────┐
 *   │ Adapters      │ Missions          │ Sandboxes    │
 *   │ flexGrow=1    │ flexGrow=2        │ flexGrow=1   │
 *   └───────────────┴───────────────────┴──────────────┘
 *   <footer preview line for the selected row>
 *   <sticky watcher warning when active>
 *   <key hint line>
 *
 * Keymap (post-grill Q3):
 *   a      focus Adapters pane
 *   m      focus Missions pane
 *   s      focus Sandboxes pane
 *   Tab    cycle focus forward  (discovery fallback)
 *   r      force-refresh now (bypasses fs.watch debounce)
 *   q      quit (renderer.destroy() then process.exit(0))
 *   Ctrl+C force-quit via the renderer's `exitOnCtrlC: true`
 *
 * Soft miller link (Q3): selecting a mission also scrolls the sandboxes
 * pane to the sandbox bound to that mission (if any).
 *
 * Failure surface (Q6 — tiered):
 *   - No .harness/project.yaml → full-screen takeover with init hint.
 *   - Schema-malformed file    → per-row badge from the model layer.
 *   - fs.watch error           → sticky footer warning, 5 s TTL.
 *   - Failed adapter check     → footer preview line on the selected row.
 */
import { createSignal, createMemo, onCleanup, createEffect, on } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createDashboardState } from "./state.js";
import type {
  AdapterRow,
  MissionRow,
  SandboxRow,
} from "./model.js";

type PaneId = "adapters" | "missions" | "sandboxes";
const PANES: PaneId[] = ["adapters", "missions", "sandboxes"];

interface DashboardProps {
  root: string;
  /** Render once, then exit cleanly. Used by `uh tui --once` for CI/docs/smoke. */
  once?: boolean;
}

function adapterStatusBadge(status: string): string {
  switch (status) {
    case "active":       return "●";
    case "experimental": return "◐";
    case "deprecated":   return "○";
    case "error":        return "✖";
    default:             return "·";
  }
}

function sandboxStatusBadge(status: string): string {
  switch (status) {
    case "running":   return "▶";
    case "dirty":     return "●";
    case "verified":  return "✓";
    case "promoted":  return "★";
    case "discarded": return "✖";
    case "created":   return "○";
    default:          return "·";
  }
}

function missionStateBadge(state: MissionRow["state"]): string {
  switch (state) {
    case "valid":   return "✓";
    case "invalid": return "✖";
    case "missing": return "?";
  }
}

function adapterOptions(rows: AdapterRow[]) {
  if (rows.length === 0) {
    return [{ name: "(no adapters)", description: "Run `uh adapter add <runtime>`.", value: null }];
  }
  return rows.map((r) => ({
    name: `${adapterStatusBadge(r.status)} ${r.id}`,
    description: `${r.name} · runtime=${r.runtime} · status=${r.status}`,
    value: r,
  }));
}

function missionOptions(rows: MissionRow[]) {
  if (rows.length === 0) {
    return [{ name: "(no missions)", description: "Run `uh propose <id> …` to create one.", value: null }];
  }
  return rows.map((r) => ({
    name: `${missionStateBadge(r.state)} ${r.id}`,
    description: `${r.name || r.id} · workflow=${r.workflow || "—"} · ${r.state} · updated ${r.updatedAt}`,
    value: r,
  }));
}

function sandboxOptions(rows: SandboxRow[]) {
  if (rows.length === 0) {
    return [{ name: "(no sandboxes)", description: "Run `uh sandbox create <id> --mission <id>`.", value: null }];
  }
  return rows.map((r) => ({
    name: `${sandboxStatusBadge(r.status)} ${r.id}`,
    description: `mission=${r.missionId} · backend=${r.backend} · status=${r.status}`,
    value: r,
  }));
}

export function Dashboard(props: DashboardProps) {
  const renderer = useRenderer();
  const [focused, setFocused] = createSignal<PaneId>("missions");
  // Create state synchronously so JSX accessors subscribe to its Solid
  // signals from frame zero. Creating it inside onMount assigns a plain
  // closure variable after the first render, which does not trigger a
  // re-render and leaves the dashboard stuck on placeholder rows.
  const state = createDashboardState(props.root);
  let quitting = false;

  if (props.once) {
    // --once: quit as soon as the first snapshot resolves, or after a
    // 2 s safety cap (covers degenerate fs.watch / I/O hangs in CI).
    const cap = setTimeout(() => quit(), 2_000);
    const poll = setInterval(() => {
      const captured = state.snapshot().capturedAt;
      if (captured !== new Date(0).toISOString()) {
        clearInterval(poll);
        clearTimeout(cap);
        // grace window so OpenTUI paints the updated Solid tree before destroy
        setTimeout(() => quit(), 500);
      }
    }, 20);
    onCleanup(() => {
      clearInterval(poll);
      clearTimeout(cap);
    });
  }

  onCleanup(() => {
    state.dispose();
  });

  const quit = () => {
    if (quitting) return;
    quitting = true;
    state.dispose();
    renderer.destroy();
    process.exit(0);
  };

  useKeyboard((event) => {
    if (event.ctrl || event.meta) return;
    switch (event.name) {
      case "q":
        quit();
        return;
      case "a":
        setFocused("adapters");
        return;
      case "m":
        setFocused("missions");
        return;
      case "s":
        setFocused("sandboxes");
        return;
      case "tab": {
        const idx = PANES.indexOf(focused());
        const next = PANES[(idx + 1) % PANES.length];
        setFocused(next);
        return;
      }
      case "r":
        void state.refresh();
        return;
    }
  });

  const adapterRows = () => state.snapshot().adapters;
  const missionRows = () => state.snapshot().missions;
  const sandboxRows = () => state.snapshot().sandboxes;
  const error = () => state.error();
  const isLoading = () => state.isLoading();
  const watcherWarning = () => state.watcherWarning();
  const capturedAt = () => state.snapshot().capturedAt;
  const harness = () => state.snapshot().harness;
  // hasLoaded gates the Q6 takeover so it does not flash before the first snapshot.
  const EPOCH = new Date(0).toISOString();
  const hasLoaded = () => state.snapshot().capturedAt !== EPOCH;

  const selectedAdapter = () => state.selectedAdapter();
  const selectedMission = () => state.selectedMission();
  const selectedSandbox = () => state.selectedSandbox();

  // Q3 soft miller link: selecting a mission scrolls the sandboxes pane
  // to the bound sandbox (if any).
  const millerSandbox = createMemo(() => {
    const m = selectedMission();
    if (!m) return null;
    return sandboxRows().find((s) => s.missionId === m.id) ?? null;
  });
  createEffect(on(millerSandbox, (sandbox) => {
    if (sandbox) {
      state.selectSandbox(sandbox);
    }
  }));

  // Q5: on-focus-row adapter re-check (one-in-flight, 5s TTL handled in state).
  createEffect(on(selectedAdapter, (adapter) => {
    if (adapter) {
      void state.refreshAdapterCheck(adapter.id);
    }
  }));

  const adapterIndex = () => {
    const rows = adapterRows();
    const sel = selectedAdapter();
    if (!sel) return 0;
    const i = rows.findIndex((r) => r.id === sel.id);
    return i >= 0 ? i : 0;
  };
  const missionIndex = () => {
    const rows = missionRows();
    const sel = selectedMission();
    if (!sel) return 0;
    const i = rows.findIndex((r) => r.id === sel.id);
    return i >= 0 ? i : 0;
  };
  const sandboxIndex = () => {
    const rows = sandboxRows();
    const sel = selectedSandbox();
    if (!sel) return 0;
    const i = rows.findIndex((r) => r.id === sel.id);
    return i >= 0 ? i : 0;
  };

  const onAdapterChange = (_index: number, opt: { value?: unknown } | null) => {
    state.selectAdapter((opt?.value as AdapterRow | null) ?? null);
  };
  const onMissionChange = (_index: number, opt: { value?: unknown } | null) => {
    state.selectMission((opt?.value as MissionRow | null) ?? null);
  };
  const onSandboxChange = (_index: number, opt: { value?: unknown } | null) => {
    state.selectSandbox((opt?.value as SandboxRow | null) ?? null);
  };

  const paneTitle = (id: PaneId, label: string, mnemonic: string): string =>
    focused() === id
      ? ` ${label} [${mnemonic}] ◀ `
      : ` ${label} [${mnemonic}] `;

  // Q5 footer preview line content.
  const previewLine = createMemo<string>(() => {
    const f = focused();
    if (f === "adapters") {
      const a = selectedAdapter();
      if (!a) return "";
      const check = state.adapterCheck(a.id);
      const checkStr = !check
        ? "check=pending"
        : check.found
          ? `check=ok (${check.runtime} ${check.version || "?"})`
          : `check=fail (${check.errors[0] ?? "unknown"})`;
      return `${a.id} · runtime=${a.runtime} · status=${a.status} · ${checkStr}`;
    }
    if (f === "missions") {
      const m = selectedMission();
      if (!m) return "";
      const bound = millerSandbox();
      const boundStr = bound ? `sandbox=${bound.id}` : "sandbox=(none)";
      return `${m.id} · workflow=${m.workflow || "—"} · state=${m.state} · ${boundStr}`;
    }
    const s = selectedSandbox();
    if (!s) return "";
    return `${s.id} · mission=${s.missionId} · backend=${s.backend} · status=${s.status}`;
  });

  return (
    <>
      {/* Q6 takeover: no .harness/project.yaml → full-screen hint. */}
      {hasLoaded() && !harness().initialized ? (
        <box
          flexDirection="column"
          width="100%"
          height="100%"
          padding={2}
          alignItems="center"
          justifyContent="center"
        >
          <box
            flexDirection="column"
            border
            borderStyle="rounded"
            title=" Not a UH project "
            titleAlignment="left"
            padding={2}
            width={64}
          >
            <text>
              This directory does not contain a .harness/ tree.
            </text>
            <text marginTop={1}>
              Run  uh init             to scaffold one here, or
            </text>
            <text>
              run  uh tui --root PATH  to point at an existing project.
            </text>
            <text marginTop={1}>
              q quit   r retry
            </text>
          </box>
        </box>
      ) : (
        <box flexDirection="column" width="100%" height="100%">
          <box flexDirection="row" flexGrow={1} width="100%">
            <box
              flexGrow={1}
              flexDirection="column"
              border
              borderStyle="rounded"
              title={paneTitle("adapters", "Adapters", "a")}
              titleAlignment="left"
              padding={1}
            >
              <select
                options={adapterOptions(adapterRows())}
                showDescription
                showScrollIndicator
                width="100%"
                flexGrow={1}
                focused={focused() === "adapters"}
                selectedIndex={adapterIndex()}
                onChange={onAdapterChange}
              />
            </box>
            <box
              flexGrow={2}
              flexDirection="column"
              border
              borderStyle="rounded"
              title={paneTitle("missions", "Missions", "m")}
              titleAlignment="left"
              padding={1}
            >
              <select
                options={missionOptions(missionRows())}
                showDescription
                showScrollIndicator
                width="100%"
                flexGrow={1}
                focused={focused() === "missions"}
                selectedIndex={missionIndex()}
                onChange={onMissionChange}
              />
            </box>
            <box
              flexGrow={1}
              flexDirection="column"
              border
              borderStyle="rounded"
              title={paneTitle("sandboxes", "Sandboxes", "s")}
              titleAlignment="left"
              padding={1}
            >
              <select
                options={sandboxOptions(sandboxRows())}
                showDescription
                showScrollIndicator
                width="100%"
                flexGrow={1}
                focused={focused() === "sandboxes"}
                selectedIndex={sandboxIndex()}
                onChange={onSandboxChange}
              />
            </box>
          </box>
          <box flexDirection="column" paddingLeft={1} paddingRight={1}>
            <text>
              {previewLine() || "—"}
            </text>
            <text>
              {isLoading() ? "loading…" : `synced ${capturedAt()}${harness().projectName ? "  ·  " + harness().projectName : ""}`}
              {error() ? `  ·  error: ${error()!.message}` : ""}
            </text>
            {watcherWarning() ? <text>{`⚠ ${watcherWarning()}`}</text> : null}
            <text>
              a/m/s focus · Tab cycle · r refresh · q quit · ctrl+c force-quit
            </text>
          </box>
        </box>
      )}
    </>
  );
}
