import { describe, test, expect } from "vitest";
import { PALETTES, resolveTheme, type ThemeName } from "../src/tui/theme.js";

function envWith(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

describe("tui/theme resolveTheme", () => {
  test("defaults to dark when UH_TUI_THEME is unset", () => {
    expect<ThemeName>(resolveTheme(envWith({}))).toBe("dark");
  });

  test("explicit `light` resolves to light", () => {
    expect<ThemeName>(resolveTheme(envWith({ UH_TUI_THEME: "light" }))).toBe("light");
  });

  test("explicit `dark` resolves to dark", () => {
    expect<ThemeName>(resolveTheme(envWith({ UH_TUI_THEME: "dark" }))).toBe("dark");
  });

  test("case-insensitive — uppercase / mixed case is tolerated", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "LIGHT" }))).toBe("light");
    expect(resolveTheme(envWith({ UH_TUI_THEME: "Dark" }))).toBe("dark");
    expect(resolveTheme(envWith({ UH_TUI_THEME: " System " }))).toBe("dark");
  });

  test("garbage value falls back to dark", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "neon" }))).toBe("dark");
    expect(resolveTheme(envWith({ UH_TUI_THEME: "" }))).toBe("dark");
  });

  test("`system` with COLORFGBG=15;0 (light terminal hint) resolves to light", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "system", COLORFGBG: "15;0" }))).toBe("light");
  });

  test("`system` with COLORFGBG=0;default;15 resolves to light", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "system", COLORFGBG: "0;default;15" }))).toBe("light");
  });

  test("`system` with no COLORFGBG defaults to dark", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "system" }))).toBe("dark");
  });

  test("`system` with low-luminance COLORFGBG stays dark", () => {
    expect(resolveTheme(envWith({ UH_TUI_THEME: "system", COLORFGBG: "7;0" }))).toBe("dark");
  });
});

describe("tui/theme PALETTES", () => {
  test("ships fully populated dark + light palettes with hex colours", () => {
    const keys = [
      "fg", "bg", "mutedFg", "accent", "border", "cardBg",
      "success", "warning", "error", "selectionBg",
    ] as const;
    for (const name of ["dark", "light"] as const) {
      const p = PALETTES[name];
      for (const key of keys) {
        expect(p[key], `palette[${name}].${key}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  test("dark and light disagree on foreground and background", () => {
    expect(PALETTES.dark.fg).not.toEqual(PALETTES.light.fg);
    expect(PALETTES.dark.bg).not.toEqual(PALETTES.light.bg);
  });
});
