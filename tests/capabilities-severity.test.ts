import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeHarness } from "../src/harness/init.js";
import {
  enforceCapabilities,
  formatCapabilityBypassLine,
  formatCapabilityWarnLine,
  formatNoManifestWarnLine,
} from "../src/harness/capabilities.js";
import { assertRuntimeRequirements } from "../src/harness/runtime-requirements.js";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "uh-test-cap-severity-"));
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

async function writeMission(
  root: string,
  id: string,
  capabilities: string[],
  extra: string[] = [],
): Promise<string> {
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
  lines.push(...extra);
  lines.push("");
  await writeFile(missionPath, lines.join("\n"), "utf-8");
  return missionPath;
}

describe("capability enforcement severity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('warn (default): no throw, returns match, emits one [WARN] per missing tag', async () => {
    await withRoot(async (root) => {
      await writeAdapter(root, ["needs_git"]);
      const missionPath = await writeMission(root, "m-warn", ["needs_browser", "needs_git"]);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const match = await enforceCapabilities(root, missionPath, "codex", "warn");
      expect(match?.adapter.id).toBe("codex");
      expect(match?.missing).toEqual(["needs_browser"]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        formatCapabilityWarnLine("m-warn", "needs_browser", "codex", "codex"),
      );
    });
  });

  test("error: throws on a missing capability", async () => {
    await withRoot(async (root) => {
      await writeAdapter(root, ["needs_git"]);
      const missionPath = await writeMission(root, "m-err", ["needs_browser", "needs_git"]);
      await expect(enforceCapabilities(root, missionPath, "codex", "error"))
        .rejects.toThrow(/requires capabilities not supported/);
    });
  });

  test("off: returns null and skips the check entirely", async () => {
    await withRoot(async (root) => {
      // No adapter manifest written — proves the check is fully skipped.
      const missionPath = await writeMission(root, "m-off", ["needs_browser"]);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(enforceCapabilities(root, missionPath, "codex", "off")).resolves.toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  test("empty capabilities: no-op null regardless of severity", async () => {
    await withRoot(async (root) => {
      const missionPath = await writeMission(root, "m-empty", []);
      await expect(enforceCapabilities(root, missionPath, "codex", "warn")).resolves.toBeNull();
      await expect(enforceCapabilities(root, missionPath, "codex", "error")).resolves.toBeNull();
    });
  });

  test("no manifest (warn): returns null, emits [WARN], does not throw", async () => {
    await withRoot(async (root) => {
      const missionPath = await writeMission(root, "m-nomanifest-warn", ["needs_browser"]);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const match = await enforceCapabilities(root, missionPath, "codex", "warn");
      expect(match).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(formatNoManifestWarnLine("m-nomanifest-warn", "codex"));
    });
  });

  test("no manifest (error): throws the no-manifest message", async () => {
    await withRoot(async (root) => {
      const missionPath = await writeMission(root, "m-nomanifest-err", ["needs_browser"]);
      await expect(enforceCapabilities(root, missionPath, "codex", "error"))
        .rejects.toThrow(/no non-deprecated adapter manifest/);
    });
  });

  test("runtime_requirements still throws regardless of capability severity", async () => {
    await withRoot(async (root) => {
      await writeAdapter(root, ["needs_browser"]);
      const missionPath = await writeMission(root, "m-req", ["needs_browser"], [
        "runtime_requirements:",
        "  min_context_tokens: 100000000",
      ]);
      // Capability check itself passes in warn mode (no throw)...
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(enforceCapabilities(root, missionPath, "codex", "warn")).resolves.not.toThrow;
      spy.mockRestore();
      // ...but runtime_requirements is an always-error typed precondition.
      await expect(assertRuntimeRequirements(missionPath, "codex"))
        .rejects.toThrow(/runtime_requirements not satisfied/);
    });
  });

  describe("formatter helpers (exact strings)", () => {
    test("formatCapabilityWarnLine", () => {
      expect(formatCapabilityWarnLine("m1", "needs_browser", "codex", "codex")).toBe(
        '[WARN] mission m1: capability "needs_browser" not declared by runtime "codex" (adapter codex); proceeding — pass --strict to fail',
      );
    });

    test("formatNoManifestWarnLine", () => {
      expect(formatNoManifestWarnLine("m1", "codex")).toBe(
        '[WARN] mission m1: no non-deprecated adapter manifest for runtime "codex"; capability check skipped — pass --strict to fail',
      );
    });

    test("formatCapabilityBypassLine", () => {
      expect(formatCapabilityBypassLine("m1", "codex")).toBe(
        '[WARN] mission m1: --force bypassed capability check for runtime "codex"',
      );
    });
  });
});
