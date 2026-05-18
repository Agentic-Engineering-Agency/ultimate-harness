import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createFilePersistenceStore,
  createMemoryPersistenceStore,
  resolveDefaultConfigDir,
} from "../src/tui/persistence.js";

const TMP_ROOT = "/tmp/uh-test-tui-persistence";

async function reset() {
  try { await rm(TMP_ROOT, { recursive: true, force: true }); } catch {}
  await mkdir(TMP_ROOT, { recursive: true });
}

beforeEach(reset);
afterEach(async () => { try { await rm(TMP_ROOT, { recursive: true, force: true }); } catch {} });

describe("tui/persistence resolveDefaultConfigDir", () => {
  test("prefers XDG_CONFIG_HOME when set", () => {
    expect(resolveDefaultConfigDir({ XDG_CONFIG_HOME: "/tmp/xdg" })).toBe("/tmp/xdg/uh");
  });
  test("falls back to ~/.config/uh otherwise", () => {
    const dir = resolveDefaultConfigDir({});
    expect(dir.endsWith("/.config/uh")).toBe(true);
  });
});

describe("tui/persistence createFilePersistenceStore", () => {
  test("returns null when state file missing", async () => {
    const store = createFilePersistenceStore({ configDir: TMP_ROOT });
    expect(await store.load("/repo")).toBeNull();
  });

  test("persists per-project state and reads it back", async () => {
    const store = createFilePersistenceStore({ configDir: TMP_ROOT });
    await store.save("/repo-a", { focused: "missions", selectedMissionId: "m-1" });
    await store.save("/repo-b", { focused: "adapters", selectedAdapterId: "codex" });
    const a = await store.load("/repo-a");
    const b = await store.load("/repo-b");
    const c = await store.load("/repo-c");
    expect(a).toEqual({ focused: "missions", selectedMissionId: "m-1" });
    expect(b).toEqual({ focused: "adapters", selectedAdapterId: "codex" });
    expect(c).toBeNull();
  });

  test("overwrites a previous entry on save", async () => {
    const store = createFilePersistenceStore({ configDir: TMP_ROOT });
    await store.save("/repo-a", { selectedMissionId: "old" });
    await store.save("/repo-a", { selectedMissionId: "new" });
    expect(await store.load("/repo-a")).toEqual({ selectedMissionId: "new" });
  });

  test("treats malformed JSON as empty without throwing", async () => {
    await writeFile(path.join(TMP_ROOT, "tui-state.json"), "::: not json :::", "utf-8");
    const store = createFilePersistenceStore({ configDir: TMP_ROOT });
    expect(await store.load("/repo")).toBeNull();
    await store.save("/repo", { selectedMissionId: "ok" });
    expect(await store.load("/repo")).toEqual({ selectedMissionId: "ok" });
  });

  test("writes a valid file with schema_version", async () => {
    const store = createFilePersistenceStore({ configDir: TMP_ROOT });
    await store.save("/repo", { selectedMissionId: "m-1" });
    const text = await readFile(path.join(TMP_ROOT, "tui-state.json"), "utf-8");
    const parsed = JSON.parse(text);
    expect(parsed.schema_version).toBe("uh.tui-state.v0");
    expect(parsed.projects["/repo"].selectedMissionId).toBe("m-1");
  });
});

describe("tui/persistence createMemoryPersistenceStore", () => {
  test("respects seeded entries and updates on save", async () => {
    const store = createMemoryPersistenceStore({ "/repo": { selectedMissionId: "m-seed" } });
    expect(await store.load("/repo")).toEqual({ selectedMissionId: "m-seed" });
    await store.save("/repo", { selectedMissionId: "m-new" });
    expect(await store.load("/repo")).toEqual({ selectedMissionId: "m-new" });
  });
});
