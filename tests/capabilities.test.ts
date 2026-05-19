import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeHarness } from "../src/harness/init.js";
import { assertRuntimeCapabilities } from "../src/harness/capabilities.js";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "uh-test-capabilities-"));
  try {
    await initializeHarness(root);
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeAdapter(root: string, capabilities: string[]): Promise<void> {
  await mkdir(join(root, ".harness", "adapters"), { recursive: true });
  await writeFile(join(root, ".harness", "adapters", "codex.yaml"), [
    "schema_version: uh.adapter.v0",
    "id: codex",
    "name: Codex",
    "runtime: codex",
    "status: active",
    "capabilities:",
    ...capabilities.map((capability) => `  - ${capability}`),
    "",
  ].join("\n"), "utf-8");
}

async function writeMission(root: string, id: string, capabilities: string[]): Promise<string> {
  const dir = join(root, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  const missionPath = join(dir, "mission.yaml");
  const lines = [
    "schema_version: uh.mission.v0",
    `id: ${id}`,
    "title: Capability mission",
    "workflow_profile: implementation",
  ];
  if (capabilities.length > 0) {
    lines.push("capabilities:", ...capabilities.map((capability) => `  - ${capability}`));
  }
  lines.push("");
  await writeFile(missionPath, lines.join("\n"), "utf-8");
  return missionPath;
}

describe("runtime capability matching", () => {
  test("passes when adapter declares every mission capability", async () => {
    await withRoot(async (root) => {
      await writeAdapter(root, ["needs_browser", "needs_git"]);
      const missionPath = await writeMission(root, "m-pass", ["needs_browser"]);
      const match = await assertRuntimeCapabilities(root, missionPath, "codex");
      expect(match?.adapter.id).toBe("codex");
      expect(match?.missing).toEqual([]);
    });
  });

  test("blocks when the selected runtime is missing a required capability", async () => {
    await withRoot(async (root) => {
      await writeAdapter(root, ["needs_git"]);
      const missionPath = await writeMission(root, "m-block", ["needs_browser", "needs_git"]);
      await expect(assertRuntimeCapabilities(root, missionPath, "codex")).rejects.toThrow(/needs_browser/);
    });
  });

  test("does not require an adapter manifest for missions without capabilities", async () => {
    await withRoot(async (root) => {
      const missionPath = await writeMission(root, "m-legacy", []);
      await expect(assertRuntimeCapabilities(root, missionPath, "codex")).resolves.toBeNull();
    });
  });
});
