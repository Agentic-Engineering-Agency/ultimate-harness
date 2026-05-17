import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import {
  RuntimeRegistry,
  type AdapterManifestEntry,
  type AdapterRuntimeChecker,
} from "../src/harness/registry.js";

const TEST_ROOT = "/tmp/uh-test-registry";

async function cleanup(): Promise<void> {
  try {
    await rm(TEST_ROOT, { recursive: true, force: true });
  } catch {
    // ignore - directory may not exist yet
  }
}

function adapterPath(id: string): string {
  return join(TEST_ROOT, ".harness", "adapters", `${id}.yaml`);
}

function minimalManifest(id: string, runtime = id): string {
  return `schema_version: uh.adapter.v0\nid: ${id}\nname: ${id}\nruntime: ${runtime}\n`;
}

async function writeManifest(id: string, body: string): Promise<void> {
  await writeFile(adapterPath(id), body, "utf-8");
}

beforeEach(async () => {
  await cleanup();
  await mkdir(TEST_ROOT, { recursive: true });
  await initializeHarness(TEST_ROOT);
});

afterAll(cleanup);

const noopChecker: AdapterRuntimeChecker = async (manifest) => ({
  runtime: manifest.runtime,
  found: false,
  version: "",
  errors: [],
});

describe("RuntimeRegistry.list", () => {
  test("returns sorted manifest entries with parsed documents and absolute paths", async () => {
    await writeManifest("zeta", minimalManifest("zeta"));
    await writeManifest("alpha", minimalManifest("alpha"));
    const registry = new RuntimeRegistry();

    const entries = await registry.list(TEST_ROOT);

    expect(entries.map((e) => e.id)).toEqual(["alpha", "zeta"]);
    expect(entries[0].document.runtime).toBe("alpha");
    expect(entries[0].path).toBe(adapterPath("alpha"));
    expect(entries[1].path).toBe(adapterPath("zeta"));
  });

  test("returns an empty list when the adapters directory does not exist", async () => {
    await rm(join(TEST_ROOT, ".harness", "adapters"), {
      recursive: true,
      force: true,
    });
    const registry = new RuntimeRegistry();

    await expect(registry.list(TEST_ROOT)).resolves.toEqual([]);
  });

  test("ignores non-YAML files in the adapters directory", async () => {
    await writeManifest("hermes", minimalManifest("hermes"));
    await writeFile(
      join(TEST_ROOT, ".harness", "adapters", "README.md"),
      "# notes\n",
      "utf-8",
    );
    const registry = new RuntimeRegistry();

    const entries = await registry.list(TEST_ROOT);

    expect(entries.map((e) => e.id)).toEqual(["hermes"]);
  });

  test("throws on malformed YAML rather than fabricating an entry", async () => {
    await writeManifest("broken", ":: not yaml :::\n  - [\n");
    const registry = new RuntimeRegistry();

    await expect(registry.list(TEST_ROOT)).rejects.toThrow(
      /Adapter manifest YAML parse error/,
    );
  });

  test("throws when a manifest fails schema validation", async () => {
    await writeManifest(
      "invalid",
      "schema_version: uh.adapter.v0\nid: invalid\n",
    );
    const registry = new RuntimeRegistry();

    await expect(registry.list(TEST_ROOT)).rejects.toThrow(
      /Adapter manifest validation error/,
    );
  });

  test("throws when the manifest id does not match the filename", async () => {
    await writeManifest("mismatch", minimalManifest("real-id"));
    const registry = new RuntimeRegistry();

    await expect(registry.list(TEST_ROOT)).rejects.toThrow(
      /does not match file name/,
    );
  });
});

describe("RuntimeRegistry.load", () => {
  test("loads and validates a single manifest by id", async () => {
    await writeManifest("hermes", minimalManifest("hermes"));
    const registry = new RuntimeRegistry();

    const entry = await registry.load(TEST_ROOT, "hermes");

    expect(entry.id).toBe("hermes");
    expect(entry.document.runtime).toBe("hermes");
    expect(entry.path).toBe(adapterPath("hermes"));
  });

  test("throws when the manifest file is missing", async () => {
    const registry = new RuntimeRegistry();

    await expect(registry.load(TEST_ROOT, "ghost")).rejects.toThrow(
      /Adapter manifest not found/,
    );
  });

  test("rejects unsafe adapter ids before constructing a manifest path", async () => {
    const registry = new RuntimeRegistry();

    await expect(registry.load(TEST_ROOT, "../project")).rejects.toThrow(
      /Unsafe adapter id/,
    );
  });

  test("throws on malformed YAML", async () => {
    await writeManifest("broken", ":: not yaml :::\n  - [\n");
    const registry = new RuntimeRegistry();

    await expect(registry.load(TEST_ROOT, "broken")).rejects.toThrow(
      /Adapter manifest YAML parse error/,
    );
  });

  test("throws on schema validation failure", async () => {
    await writeManifest(
      "invalid",
      "schema_version: uh.adapter.v0\nid: invalid\n",
    );
    const registry = new RuntimeRegistry();

    await expect(registry.load(TEST_ROOT, "invalid")).rejects.toThrow(
      /Adapter manifest validation error/,
    );
  });

  test("throws when the manifest id mismatches the requested id", async () => {
    await writeManifest("alias", minimalManifest("other"));
    const registry = new RuntimeRegistry();

    await expect(registry.load(TEST_ROOT, "alias")).rejects.toThrow(
      /does not match file name/,
    );
  });
});

describe("RuntimeRegistry.check", () => {
  test("dispatches to the registered checker with the loaded manifest", async () => {
    await writeManifest("hermes", minimalManifest("hermes"));
    const registry = new RuntimeRegistry();
    const seen: AdapterManifestEntry[] = [];
    registry.register("hermes", async (manifest, root) => {
      seen.push({ id: manifest.id, document: manifest, path: root });
      return {
        runtime: manifest.runtime,
        found: true,
        version: "v0.test",
        errors: [],
      };
    });

    const result = await registry.check(TEST_ROOT, "hermes");

    expect(result).toEqual({
      runtime: "hermes",
      found: true,
      version: "v0.test",
      errors: [],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].document.id).toBe("hermes");
    expect(seen[0].path).toBe(TEST_ROOT);
  });

  test("returns a structured error when no checker is registered for the runtime", async () => {
    await writeManifest(
      "experimental",
      minimalManifest("experimental", "novel"),
    );
    const registry = new RuntimeRegistry();

    const result = await registry.check(TEST_ROOT, "experimental");

    expect(result.found).toBe(false);
    expect(result.runtime).toBe("novel");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(
      /No runtime checker registered for runtime "novel"/,
    );
  });

  test("surfaces a missing manifest as an errors[] entry without invoking any checker", async () => {
    const registry = new RuntimeRegistry();
    let invoked = false;
    registry.register("hermes", async () => {
      invoked = true;
      return { runtime: "hermes", found: true, version: "", errors: [] };
    });

    const result = await registry.check(TEST_ROOT, "hermes");

    expect(result.found).toBe(false);
    expect(result.runtime).toBe("hermes");
    expect(result.errors[0]).toMatch(/Adapter manifest not found/);
    expect(invoked).toBe(false);
  });

  test("surfaces a malformed manifest as an errors[] entry without invoking any checker", async () => {
    await writeManifest("hermes", ":: not yaml :::\n  - [\n");
    const registry = new RuntimeRegistry();
    let invoked = false;
    registry.register("hermes", async () => {
      invoked = true;
      return { runtime: "hermes", found: true, version: "", errors: [] };
    });

    const result = await registry.check(TEST_ROOT, "hermes");

    expect(result.found).toBe(false);
    expect(result.errors[0]).toMatch(/Adapter manifest YAML parse error/);
    expect(invoked).toBe(false);
  });

  test("propagates errors thrown by the runtime checker", async () => {
    await writeManifest("hermes", minimalManifest("hermes"));
    const registry = new RuntimeRegistry();
    registry.register("hermes", async () => {
      throw new Error("boom");
    });

    await expect(registry.check(TEST_ROOT, "hermes")).rejects.toThrow("boom");
  });
});

describe("RuntimeRegistry registration", () => {
  test("hasChecker reflects register calls", () => {
    const registry = new RuntimeRegistry();
    expect(registry.hasChecker("hermes")).toBe(false);
    registry.register("hermes", noopChecker);
    expect(registry.hasChecker("hermes")).toBe(true);
  });

  test("registered() returns runtime kinds in sorted order", () => {
    const registry = new RuntimeRegistry();
    registry.register("zulu", noopChecker);
    registry.register("alpha", noopChecker);
    registry.register("mike", noopChecker);

    expect(registry.registered()).toEqual(["alpha", "mike", "zulu"]);
  });

  test("register replaces the prior checker for a runtime", async () => {
    await writeManifest("hermes", minimalManifest("hermes"));
    const registry = new RuntimeRegistry();
    registry.register("hermes", async () => ({
      runtime: "hermes",
      found: false,
      version: "",
      errors: ["first"],
    }));
    registry.register("hermes", async () => ({
      runtime: "hermes",
      found: true,
      version: "v1",
      errors: [],
    }));

    const result = await registry.check(TEST_ROOT, "hermes");

    expect(result).toEqual({
      runtime: "hermes",
      found: true,
      version: "v1",
      errors: [],
    });
  });
});
