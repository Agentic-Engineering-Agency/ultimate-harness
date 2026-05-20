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
import { createSignal, createMemo, onCleanup, createEffect, on, onMount } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { SyntaxStyle } from "@opentui/core";
import type { MissionDetail } from "./model.js";
import { footerHint, keymapForView, type KeymapSection } from "./keymap.js";
import { createDashboardState, RUN_RUNTIMES } from "./state.js";
import type { RunEvent } from "./run-events.js";
import type {
  AdapterRow,
  MissionRow,
  SandboxRow,
  MissionArtifact,
} from "./model.js";
import { PALETTES, type Palette } from "./theme.js";
import { installSuspendHandlers, type SuspendHandle } from "./suspend.js";
import { openInEditor } from "./editor.js";

type PaneId = "adapters" | "missions" | "sandboxes";
const PANES: PaneId[] = ["adapters", "missions", "sandboxes"];

interface DashboardProps {
  root: string;
  /** Render once, then exit cleanly. Used by `uh tui --once` for CI/docs/smoke. */
  once?: boolean;
  /** Active palette. Defaults to PALETTES.dark — caller passes the resolved value. */
  palette?: Palette;
  /**
   * Skip OS-level signal wiring. Set automatically by the screenshot
   * pipeline and any other non-interactive entry. Tests set this too.
   */
  headless?: boolean;
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


function artifactBadge(artifact: MissionArtifact): string {
  if (!artifact.exists) return "○";
  switch (artifact.kind) {
    case "yaml": return "Y";
    case "diff": return "D";
    case "events": return "E";
    case "text": return "T";
  }
}

function artifactOptions(rows: MissionArtifact[]) {
  if (rows.length === 0) {
    return [{ name: "(loading artifacts)", description: "Reading mission directory.", value: null }];
  }
  return rows.map((artifact) => ({
    name: `${artifactBadge(artifact)} ${artifact.label}`,
    description: artifact.exists ? artifact.path : "missing",
    value: artifact,
  }));
}

function selectedArtifact(detail: MissionDetail | null, index: number): MissionArtifact | null {
  if (!detail) return null;
  return detail.artifacts[index] ?? null;
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

function formatAge(ms: number | null): string {
  if (ms === null) return "age=never";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `age=${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `age=${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `age=${hours}h`;
}

export function Dashboard(props: DashboardProps) {
  const renderer = useRenderer();
  const palette: Palette = props.palette ?? PALETTES.dark;
  const [focused, setFocused] = createSignal<PaneId>("missions");
  const [detailFocus, setDetailFocus] = createSignal<"artifacts" | "viewer">("artifacts");
  const [showLive, setShowLive] = createSignal(false);
  const [createField, setCreateField] = createSignal<"id" | "mission" | "base">("id");
  // Create state synchronously so JSX accessors subscribe to its Solid
  // signals from frame zero. Creating it inside onMount assigns a plain
  // closure variable after the first render, which does not trigger a
  // re-render and leaves the dashboard stuck on placeholder rows.
  const state = createDashboardState(props.root);
  const syntaxStyle = SyntaxStyle.create();
  let quitting = false;

  // UH-50 — install Ctrl+Z/SIGCONT lifecycle wiring. Skip in headless
  // mode (screenshot pipeline, test renderer) so we don't attach signal
  // listeners that would outlive the test run.
  let suspendHandle: SuspendHandle | null = null;
  if (!props.headless && !props.once) {
    onMount(() => {
      suspendHandle = installSuspendHandlers({
        renderer,
        lifecycle: {
          captureSnapshot: () => ({
            view: state.activeView(),
            adapterId: state.selectedAdapter()?.id ?? null,
            missionId: state.selectedMission()?.id ?? null,
            sandboxId: state.selectedSandbox()?.id ?? null,
          }),
          // Solid signals survive SIGSTOP intact — the snapshot is kept
          // for symmetry and so future debugging / forensics can reason
          // about which selections were live across a suspend.
          restoreSnapshot: () => {
            void state.refresh();
          },
        },
      });
    });
  }

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
    void state.dispose();
    syntaxStyle.destroy();
    suspendHandle?.uninstall();
    suspendHandle = null;
  });

  const quit = async () => {
    if (quitting) return;
    quitting = true;
    try { await state.dispose(); } catch { /* persistence is advisory */ }
    renderer.destroy();
    process.exit(0);
  };

  // UH-49 — open the currently focused artifact (or mission.yaml) in
  // $EDITOR. Suspends the renderer via OpenTUI's native suspend() so the
  // editor inherits a clean TTY, then resumes + refreshes state on exit.
  const openCurrentInEditor = async (): Promise<void> => {
    const detail = state.missionDetail();
    const artifact = detail
      ? detail.artifacts[state.selectedMissionArtifactIndex()] ?? null
      : null;
    // Prefer the focused artifact when it has an on-disk path; otherwise
    // fall back to the mission's mission.yaml so `e` still does the
    // obvious thing from the artifact picker.
    const filePath = artifact?.exists
      ? artifact.path
      : detail?.artifacts.find((a) => a.id === "mission.yaml" && a.exists)?.path
        ?? null;
    if (!filePath) return;
    try {
      await openInEditor({
        filePath,
        renderer,
        reload: () => state.refresh(),
      });
    } catch (err) {
      process.stderr.write(`uh tui: editor failed: ${(err as Error).message}\n`);
    }
  };

  useKeyboard((event) => {
    if (event.ctrl || event.meta) return;

    // Overlay takes priority over every other handler so `?` always closes
    // the help and Esc dismisses it without bubbling to view-specific Esc.
    if (state.overlayOpen()) {
      if (event.name === "escape" || event.name === "q" || event.name === "?" || (event.shift && event.name === "/")) {
        if (event.name === "q") {
          quit();
        } else {
          state.closeOverlay();
        }
        return;
      }
      return;
    }

    if (event.shift && event.name === "/") {
      state.toggleOverlay();
      return;
    }
    if (event.name === "?") {
      state.toggleOverlay();
      return;
    }

    // Run-dialog modal traps input until closed.
    if (state.runDialogOpen()) {
      switch (event.name) {
        case "escape":
          state.closeRunDialog();
          return;
        case "enter":
        case "linefeed":
        case "return":
          void state.startMissionRun();
          return;
        case "left":
        case "right": {
          const idx = RUN_RUNTIMES.indexOf(state.runDialogRuntime());
          const dir = event.name === "right" ? 1 : -1;
          const next = RUN_RUNTIMES[(idx + dir + RUN_RUNTIMES.length) % RUN_RUNTIMES.length];
          state.setRunDialogRuntime(next);
          return;
        }
        case "tab":
          state.toggleRunDialogNoSandbox();
          return;
      }
      return;
    }

    // Discard-confirm modal traps input until resolved.
    if (state.discardSandboxConfirmOpen()) {
      switch (event.name) {
        case "escape":
          state.closeDiscardSandboxConfirm();
          return;
        case "enter":
        case "linefeed":
        case "return":
          void state.submitDiscardSandbox();
          return;
        case "f":
        case "F":
          state.toggleDiscardSandboxForce();
          return;
      }
      return;
    }

    // Create-sandbox dialog: Esc closes, Tab cycles fields. Input renderables
    // handle typing/backspace/arrows internally via `focused`.
    if (state.createSandboxDialogOpen()) {
      switch (event.name) {
        case "escape":
          state.closeCreateSandboxDialog();
          return;
        case "tab":
          setCreateField((f) => f === "id" ? "mission" : f === "mission" ? "base" : "id");
          return;
      }
      return;
    }

    if (state.activeView() === "missionDetail") {
      switch (event.name) {
        case "escape":
          state.closeMissionDetail();
          setDetailFocus("artifacts");
          return;
        case "q":
          quit();
          return;
        case "j":
        case "down":
          if (detailFocus() === "artifacts") state.moveMissionArtifactSelection(1);
          return;
        case "k":
        case "up":
          if (detailFocus() === "artifacts") state.moveMissionArtifactSelection(-1);
          return;
        case "enter":
        case "return":
          setDetailFocus("viewer");
          return;
        case "tab":
          setDetailFocus(detailFocus() === "artifacts" ? "viewer" : "artifacts");
          return;
        case "g":
          if (event.shift) {
            state.selectMissionArtifactIndex(Math.max((state.missionDetail()?.artifacts.length ?? 1) - 1, 0));
          } else {
            state.selectMissionArtifactIndex(0);
          }
          return;
        case "r":
          if (event.shift) {
            state.openRunDialog();
            return;
          }
          return;
        case "s":
          if (event.shift) {
            state.stopMissionRun();
            return;
          }
          return;
        case "l":
          if (event.shift) {
            setShowLive((v) => !v);
            return;
          }
          return;
        case "e":
          void openCurrentInEditor();
          return;
      }
      return;
    }

    switch (event.name) {
      case "q":
        quit();
        return;
      case "enter":
      case "return":
        if (focused() === "missions") {
          void state.openSelectedMission();
        }
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
        if (event.shift) {
          state.openRunDialog();
          return;
        }
        void state.refresh();
        return;
      case "c":
        if (focused() === "adapters" && state.selectedAdapter()) {
          void state.forceCheckAdapter(state.selectedAdapter()!.id);
        }
        return;
      case "n":
        if (focused() === "sandboxes") {
          state.openCreateSandboxDialog();
        }
        return;
      case "d":
        if (focused() === "sandboxes" && state.selectedSandbox()) {
          state.openDiscardSandboxConfirm();
        }
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

  // UH-44: when a run starts, surface the live events panel automatically.
  // Keep showLive set until the user dismisses it with `L`.
  createEffect(on(() => state.runStatus(), (status) => {
    if (status === "running") setShowLive(true);
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
  const onMissionSelect = (_index: number, opt: { value?: unknown } | null) => {
    const row = (opt?.value as MissionRow | null) ?? null;
    if (!row) return;
    state.selectMission(row);
    void state.openSelectedMission();
  };
  const onSandboxChange = (_index: number, opt: { value?: unknown } | null) => {
    state.selectSandbox((opt?.value as SandboxRow | null) ?? null);
  };

  const paneTitle = (id: PaneId, label: string, mnemonic: string): string =>
    focused() === id
      ? ` ${label} [${mnemonic}] ◀ `
      : ` ${label} [${mnemonic}] `;

  // Q5 footer preview line content.
  const missionDetail = () => state.missionDetail();
  const activeArtifact = () => selectedArtifact(missionDetail(), state.selectedMissionArtifactIndex());

  const previewLine = createMemo<string>(() => {
    const f = focused();
    if (f === "adapters") {
      const a = selectedAdapter();
      if (!a) return "";
      const check = state.adapterCheck(a.id);
      const age = state.adapterCheckAgeMs(a.id);
      const checkStr = !check
        ? "check=pending"
        : check.found
          ? `check=ok (${check.runtime} ${check.version || "?"}, ${formatAge(age)})`
          : `check=fail (${check.errors[0] ?? "unknown"}, ${formatAge(age)})`;
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


  const renderArtifactViewer = () => {
    const artifact = activeArtifact();
    if (!artifact) return <text>Select an artifact.</text>;
    if (!artifact.exists) return <text>{`${artifact.label} is not present for this mission.`}</text>;
    if (artifact.kind === "diff") {
      return (
        <diff
          diff={artifact.content}
          view="unified"
          showLineNumbers
          wrapMode="none"
          flexGrow={1}
          width="100%"
          height="100%"
        />
      );
    }
    if (artifact.kind === "yaml") {
      return (
        <code
          content={artifact.content}
          filetype="yaml"
          syntaxStyle={syntaxStyle}
          flexGrow={1}
          width="100%"
          height="100%"
        />
      );
    }
    return (
      <scrollbox
        flexGrow={1}
        width="100%"
        height="100%"
        focused={detailFocus() === "viewer"}
      >
        <text>{artifact.content || "(empty)"}</text>
      </scrollbox>
    );
  };


  const renderOverlay = () => {
    const sections: KeymapSection[] = keymapForView(state.activeView());
    return (
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
          borderColor={palette.accent}
          backgroundColor={palette.cardBg}
          title=" Keymap (press ? or Esc to close) "
          titleAlignment="left"
          padding={2}
          width={64}
        >
          {sections.map((section) => (
            <box flexDirection="column" marginBottom={1}>
              <text fg={palette.accent}>{section.title}</text>
              {section.entries.map((entry) => (
                <text fg={palette.fg}>{`  ${entry.keys.join(" / ").padEnd(14, " ")}  ${entry.action}`}</text>
              ))}
            </box>
          ))}
        </box>
      </box>
    );
  };

  const runStatusBadge = (): string => {
    switch (state.runStatus()) {
      case "running":    return "▶ running";
      case "succeeded":  return "✓ succeeded";
      case "failed":     return "✖ failed";
      case "cancelled":  return "■ cancelled";
      case "error":      return "! error";
      default:           return "○ idle";
    }
  };

  const formatEventRow = (event: RunEvent): string => {
    const ts = event.timestamp.length >= 19 ? event.timestamp.slice(11, 19) : event.timestamp;
    return `${ts}  ${event.kind}`;
  };

  const renderRunDialog = () => (
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
        borderColor={palette.accent}
        backgroundColor={palette.cardBg}
        title=" Run mission "
        titleAlignment="left"
        padding={2}
        width={68}
      >
        <text fg={palette.fg}>{`Mission: ${selectedMission()?.id ?? "—"}`}</text>
        <text fg={palette.mutedFg} marginTop={1}>Runtime (←/→ to change):</text>
        <text fg={palette.fg}>{`  ${RUN_RUNTIMES.map((r) => r === state.runDialogRuntime() ? `[${r}]` : ` ${r} `).join(" ")}`}</text>
        <text fg={palette.fg} marginTop={1}>{`Sandbox: ${state.runDialogNoSandbox() ? "[no-sandbox] (Tab to toggle)" : "[auto-route] (Tab to toggle)"}`}</text>
        <text fg={palette.mutedFg} marginTop={1}>Enter to start · Esc to cancel</text>
      </box>
    </box>
  );

  const renderCreateSandboxDialog = () => {
    const field = createField();
    return (
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
          borderColor={palette.accent}
          backgroundColor={palette.cardBg}
          title=" Create sandbox "
          titleAlignment="left"
          padding={2}
          width={72}
        >
          <text fg={palette.fg}>{`Field (Tab cycles): ${field}`}</text>
          <text fg={palette.mutedFg} marginTop={1}>Sandbox id:</text>
          <input
            value={state.createSandboxId()}
            focused={field === "id"}
            placeholder="e.g. sbx-feature-x"
            onInput={(v: string) => state.setCreateSandboxId(v)}
            onSubmit={((v: string) => { state.setCreateSandboxId(v); void state.submitCreateSandbox(); }) as unknown as any}
          />
          <text fg={palette.mutedFg} marginTop={1}>Mission id:</text>
          <input
            value={state.createSandboxMissionId()}
            focused={field === "mission"}
            placeholder="e.g. codex-e2e-smoke"
            onInput={(v: string) => state.setCreateSandboxMissionId(v)}
            onSubmit={((v: string) => { state.setCreateSandboxMissionId(v); void state.submitCreateSandbox(); }) as unknown as any}
          />
          <text fg={palette.mutedFg} marginTop={1}>Base ref (optional, defaults to HEAD):</text>
          <input
            value={state.createSandboxBaseRef()}
            focused={field === "base"}
            placeholder="e.g. dev"
            onInput={(v: string) => state.setCreateSandboxBaseRef(v)}
            onSubmit={((v: string) => { state.setCreateSandboxBaseRef(v); void state.submitCreateSandbox(); }) as unknown as any}
          />
          {state.sandboxActionError()
            ? <text fg={palette.error} marginTop={1}>{`error: ${state.sandboxActionError()!.message}`}</text>
            : null}
          <text fg={palette.mutedFg} marginTop={1}>{state.sandboxAction() === "creating" ? "creating sandbox…" : "Enter to submit · Tab to cycle · Esc to cancel"}</text>
        </box>
      </box>
    );
  };

  const renderDiscardSandboxConfirm = () => {
    const sandbox = state.selectedSandbox();
    return (
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
          borderColor={palette.error}
          backgroundColor={palette.cardBg}
          title=" Discard sandbox "
          titleAlignment="left"
          padding={2}
          width={72}
        >
          <text fg={palette.fg}>{sandbox ? `Sandbox: ${sandbox.id}` : "No sandbox selected."}</text>
          {sandbox
            ? <text fg={palette.mutedFg}>{`Mission: ${sandbox.missionId}  ·  Backend: ${sandbox.backend}  ·  Status: ${sandbox.status}`}</text>
            : null}
          <text fg={palette.fg} marginTop={1}>{`Force (--force): ${state.discardSandboxForce() ? "ON" : "off"}  (press F to toggle)`}</text>
          {state.sandboxActionError()
            ? <text fg={palette.error} marginTop={1}>{`error: ${state.sandboxActionError()!.message}`}</text>
            : null}
          <text fg={palette.mutedFg} marginTop={1}>{state.sandboxAction() === "discarding" ? "discarding…" : "Enter to confirm · Esc to cancel"}</text>
        </box>
      </box>
    );
  };

  const renderLivePane = () => {
    const events = state.runEvents();
    const status = state.runStatus();
    const mission = state.runMissionId() ?? "(none)";
    const startedAt = state.runStartedAt();
    const finishedAt = state.runFinishedAt();
    return (
      <box
        flexGrow={3}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={status === "error" ? palette.error : status === "running" ? palette.accent : palette.border}
        title={` Live events · ${runStatusBadge()} · ${mission} `}
        titleAlignment="left"
        padding={1}
      >
        <text fg={palette.mutedFg}>{`started=${startedAt ?? "—"}  finished=${finishedAt ?? "—"}  events=${events.length}`}</text>
        <scrollbox flexGrow={1} width="100%" height="100%" stickyScroll stickyStart="bottom">
          {events.length === 0
            ? <text fg={palette.mutedFg}>(no events yet — adapter has not written events.ndjson)</text>
            : events.map((event) => <text fg={palette.fg}>{formatEventRow(event)}</text>)}
        </scrollbox>
        {status === "error" && state.runError()
          ? <text fg={palette.error}>{`error: ${state.runError()!.message}`}</text>
          : null}
      </box>
    );
  };

  const renderMissionDetail = () => {
    const detail = missionDetail();
    const mission = selectedMission();
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box border borderStyle="rounded" borderColor={palette.border} title=" Mission detail " titleAlignment="left" padding={1}>
          <text fg={palette.fg}>
            {mission
              ? `${mission.id} · ${mission.name || mission.id} · workflow=${mission.workflow || "—"} · runtime-result=${detail?.runtimeStatus ?? "loading"}`
              : "No mission selected."}
          </text>
        </box>
        <box flexDirection="row" flexGrow={1} width="100%">
          <box
            flexGrow={1}
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={detailFocus() === "artifacts" ? palette.accent : palette.border}
            title={detailFocus() === "artifacts" ? " Artifacts ◀ " : " Artifacts "}
            titleAlignment="left"
            padding={1}
          >
            <select
              options={artifactOptions(detail?.artifacts ?? [])}
              showDescription
              showScrollIndicator
              width="100%"
              flexGrow={1}
              focused={detailFocus() === "artifacts"}
              selectedIndex={state.selectedMissionArtifactIndex()}
              onChange={(idx) => state.selectMissionArtifactIndex(idx)}
              onSelect={() => setDetailFocus("viewer")}
            />
          </box>
          {showLive() || state.runStatus() === "running" ? renderLivePane() : (
            <box
              flexGrow={3}
              flexDirection="column"
              border
              borderStyle="rounded"
              borderColor={detailFocus() === "viewer" ? palette.accent : palette.border}
              title={detailFocus() === "viewer" ? ` ${activeArtifact()?.label ?? "Viewer"} ◀ ` : ` ${activeArtifact()?.label ?? "Viewer"} `}
              titleAlignment="left"
              padding={1}
            >
              {state.isMissionDetailLoading() ? <text>loading mission artifacts…</text> : renderArtifactViewer()}
            </box>
          )}
        </box>
        <box flexDirection="column" paddingLeft={1} paddingRight={1}>
          <text fg={state.missionDetailError() ? palette.error : palette.mutedFg}>
            {state.missionDetailError() ? `error: ${state.missionDetailError()!.message}` : activeArtifact()?.path ?? "—"}
          </text>
          <text fg={palette.mutedFg}>
            {footerHint("missionDetail")}
          </text>
        </box>
      </box>
    );
  };

  return (
    <>
      {state.discardSandboxConfirmOpen() ? renderDiscardSandboxConfirm() : state.createSandboxDialogOpen() ? renderCreateSandboxDialog() : state.runDialogOpen() ? renderRunDialog() : state.overlayOpen() ? renderOverlay() : state.activeView() === "missionDetail" ? renderMissionDetail() : hasLoaded() && !harness().initialized ? (
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
            borderColor={palette.warning}
            backgroundColor={palette.cardBg}
            title=" Not a UH project "
            titleAlignment="left"
            padding={2}
            width={64}
          >
            <text fg={palette.fg}>
              This directory does not contain a .harness/ tree.
            </text>
            <text fg={palette.mutedFg} marginTop={1}>
              Run  uh init             to scaffold one here, or
            </text>
            <text fg={palette.mutedFg}>
              run  uh tui --root PATH  to point at an existing project.
            </text>
            <text fg={palette.mutedFg} marginTop={1}>
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
              borderColor={focused() === "adapters" ? palette.accent : palette.border}
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
              borderColor={focused() === "missions" ? palette.accent : palette.border}
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
                onSelect={onMissionSelect}
              />
            </box>
            <box
              flexGrow={1}
              flexDirection="column"
              border
              borderStyle="rounded"
              borderColor={focused() === "sandboxes" ? palette.accent : palette.border}
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
            <text fg={palette.fg}>
              {previewLine() || "—"}
            </text>
            <text fg={error() ? palette.error : palette.mutedFg}>
              {isLoading() ? "loading…" : `synced ${capturedAt()}${harness().projectName ? "  ·  " + harness().projectName : ""}`}
              {error() ? `  ·  error: ${error()!.message}` : ""}
            </text>
            {watcherWarning() ? <text fg={palette.warning}>{`⚠ ${watcherWarning()}`}</text> : null}
            <text fg={palette.mutedFg}>
              {footerHint("dashboard")}
            </text>
          </box>
        </box>
      )}
    </>
  );
}
