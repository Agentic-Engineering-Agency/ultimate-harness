import { describe, test, expect } from "vitest";
import { footerHint, keymapForView, type KeymapEntry } from "../src/tui/keymap.js";

function flatKeys(entries: KeymapEntry[]): string[] {
  return entries.flatMap((e) => e.keys);
}

describe("tui/keymap", () => {
  test("dashboard view exposes pane focus and refresh keys", () => {
    const sections = keymapForView("dashboard");
    const dashboard = sections.find((s) => s.title === "Dashboard");
    expect(dashboard).toBeDefined();
    const keys = flatKeys(dashboard!.entries);
    for (const required of ["a", "m", "s", "Tab", "Enter", "r"]) {
      expect(keys).toContain(required);
    }
  });

  test("mission detail view exposes artifact navigation and back", () => {
    const sections = keymapForView("missionDetail");
    const detail = sections.find((s) => s.title === "Mission detail");
    expect(detail).toBeDefined();
    const keys = flatKeys(detail!.entries);
    for (const required of ["j", "k", "g", "Shift+G", "Enter", "Esc"]) {
      expect(keys).toContain(required);
    }
  });

  test("every view ships a global section that includes the overlay toggle", () => {
    for (const view of ["dashboard", "missionDetail"] as const) {
      const sections = keymapForView(view);
      const global = sections.find((s) => s.title === "Global");
      expect(global, `${view} missing Global section`).toBeDefined();
      const keys = flatKeys(global!.entries);
      expect(keys).toContain("?");
      expect(keys).toContain("q");
      expect(keys).toContain("Ctrl+C");
    }
  });

  test("footer hint mentions help and quit on every view", () => {
    for (const view of ["dashboard", "missionDetail"] as const) {
      const hint = footerHint(view);
      expect(hint).toMatch(/help/);
      expect(hint).toMatch(/quit/);
    }
  });
});
