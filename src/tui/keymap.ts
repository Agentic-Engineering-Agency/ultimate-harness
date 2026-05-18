/**
 * UH-42 — keymap registry.
 *
 * Single source of truth for keybindings shown in the `?` overlay and in
 * the footer hint line. View layer subscribes via `keymapForView(view)`;
 * tests assert the registry contains every action the dashboard wires up
 * so the overlay never drifts from real behaviour.
 */

export type ViewId = "dashboard" | "missionDetail";

export interface KeymapEntry {
  /** Display key labels, e.g. ["a"], ["Tab", "Shift+Tab"]. */
  keys: string[];
  /** Human-readable action description. */
  action: string;
}

export interface KeymapSection {
  /** Section heading for the overlay; UI groups entries below it. */
  title: string;
  entries: KeymapEntry[];
}

const GLOBAL_ENTRIES: KeymapEntry[] = [
  { keys: ["?"], action: "Toggle this overlay" },
  { keys: ["q"], action: "Quit (restores terminal)" },
  { keys: ["Ctrl+C"], action: "Force-quit" },
];

const DASHBOARD_ENTRIES: KeymapEntry[] = [
  { keys: ["a"], action: "Focus Adapters pane" },
  { keys: ["m"], action: "Focus Missions pane" },
  { keys: ["s"], action: "Focus Sandboxes pane" },
  { keys: ["Tab"], action: "Cycle pane focus" },
  { keys: ["Enter"], action: "Open mission detail (on Missions)" },
  { keys: ["r"], action: "Refresh now (bypasses debounce)" },
];

const MISSION_DETAIL_ENTRIES: KeymapEntry[] = [
  { keys: ["j", "↓"], action: "Next artifact" },
  { keys: ["k", "↑"], action: "Previous artifact" },
  { keys: ["g"], action: "Jump to first artifact" },
  { keys: ["Shift+G"], action: "Jump to last artifact" },
  { keys: ["Enter"], action: "Focus viewer pane" },
  { keys: ["Tab"], action: "Swap artifact/viewer focus" },
  { keys: ["Esc"], action: "Back to dashboard" },
];

export function keymapForView(view: ViewId): KeymapSection[] {
  const contextual = view === "dashboard"
    ? { title: "Dashboard", entries: DASHBOARD_ENTRIES }
    : { title: "Mission detail", entries: MISSION_DETAIL_ENTRIES };
  return [
    contextual,
    { title: "Global", entries: GLOBAL_ENTRIES },
  ];
}

/** Compact one-line footer hint for the active view. */
export function footerHint(view: ViewId): string {
  if (view === "dashboard") {
    return "a/m/s focus · Tab cycle · Enter detail · r refresh · ? help · q quit";
  }
  return "j/k or arrows · Enter focus viewer · Tab swap · g/Shift+G top/bottom · Esc back · ? help · q quit";
}
