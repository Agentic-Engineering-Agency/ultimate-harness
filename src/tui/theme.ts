/**
 * UH-48 — terminal palette + theme resolution.
 *
 * The TUI reads `process.env.UH_TUI_THEME` once at startup. Valid values
 * are `dark` (default), `light`, and `system`. The `system` value tries
 * to infer the terminal background from `COLORFGBG` (set by rxvt/urxvt
 * and a few others) and falls back to `dark` when no hint is present.
 *
 * Palettes are Catppuccin (Mocha / Latte) — both are widely tested for
 * contrast on real terminals and play well next to syntax highlighting
 * from OpenTUI's tree-sitter renderer.
 */

export type ThemeName = "dark" | "light";

export interface Palette {
  /** Primary foreground for body text. */
  fg: string;
  /** Default background (used on full-screen takeovers, modal cards). */
  bg: string;
  /** Footer hints, descriptions, secondary metadata. */
  mutedFg: string;
  /** Selected mission/adapter highlight, focused border emphasis. */
  accent: string;
  /** Inactive pane borders. */
  border: string;
  /** Card / modal surfaces (run dialog, takeover panel). */
  cardBg: string;
  /** ✓ / `succeeded` badges. */
  success: string;
  /** ⚠ / watcher-warning badges. */
  warning: string;
  /** ✖ / `failed` / error badges. */
  error: string;
  /** Selected row background in <select> panes. */
  selectionBg: string;
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    fg: "#cdd6f4",
    bg: "#1e1e2e",
    mutedFg: "#9399b2",
    accent: "#89b4fa",
    border: "#45475a",
    cardBg: "#181825",
    success: "#a6e3a1",
    warning: "#f9e2af",
    error: "#f38ba8",
    selectionBg: "#313244",
  },
  light: {
    fg: "#4c4f69",
    bg: "#eff1f5",
    mutedFg: "#6c6f85",
    accent: "#1e66f5",
    border: "#bcc0cc",
    cardBg: "#e6e9ef",
    success: "#40a02b",
    warning: "#df8e1d",
    error: "#d20f39",
    selectionBg: "#ccd0da",
  },
};

const VALID: readonly string[] = ["dark", "light", "system"];

/**
 * Resolve the active theme name from the environment.
 *
 * Precedence:
 *   1. `UH_TUI_THEME=light|dark` (case-insensitive) wins outright.
 *   2. `UH_TUI_THEME=system` infers from `COLORFGBG` — any numeric token
 *      ≥ 8 means a "bright" colour is in play, which we treat as a
 *      light-mode terminal. With no hint, default to `dark`.
 *   3. Anything else (unset, garbage, mistypes) → `dark`.
 */
export function resolveTheme(env: NodeJS.ProcessEnv): ThemeName {
  const raw = env.UH_TUI_THEME?.trim().toLowerCase();
  if (!raw || !VALID.includes(raw)) return "dark";
  if (raw === "light") return "light";
  if (raw === "dark") return "dark";
  // raw === "system"
  return detectSystemTheme(env);
}

function detectSystemTheme(env: NodeJS.ProcessEnv): ThemeName {
  const hint = env.COLORFGBG;
  if (!hint) return "dark";
  // COLORFGBG is "fg;bg" or "fg;default;bg" — any high-luminance token
  // (8..15 in the 16-colour palette) indicates a light terminal scheme.
  for (const token of hint.split(";")) {
    const n = Number.parseInt(token, 10);
    if (Number.isInteger(n) && n >= 8) return "light";
  }
  return "dark";
}
