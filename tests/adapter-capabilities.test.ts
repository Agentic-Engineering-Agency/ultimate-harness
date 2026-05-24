import { describe, expect, test } from "vitest";
import {
  AdapterCapabilitiesSchema,
  COST_CLASSES,
  validateAdapterCapabilities,
} from "../src/schema/adapter-capabilities.js";
import {
  CAPABILITIES,
  codexCapabilities,
  getCapabilities,
  hermesCapabilities,
  hermesProxyCapabilities,
  listAdapterIds,
  ohMyPiCapabilities,
  openRouterCapabilities,
  parseCapabilitiesManifest,
} from "../src/adapters/capabilities/index.js";
import {
  compareCostClass,
  COST_CLASS_RANK,
  COST_TABLE_LAST_REVIEWED,
  costClassWithinMax,
} from "../src/harness/cost-table.js";
import { MissionSchema, RuntimeRequirementsSchema } from "../src/schema/mission.js";

describe("AdapterCapabilitiesSchema", () => {
  test.each([
    ["hermes", hermesCapabilities],
    ["hermes-proxy", hermesProxyCapabilities],
    ["codex", codexCapabilities],
    ["oh-my-pi", ohMyPiCapabilities],
    ["openrouter", openRouterCapabilities],
  ] as const)("parses %s manifest", (id, manifest) => {
    const parsed = validateAdapterCapabilities(manifest);
    expect(parsed.id).toBe(id);
    expect(parsed.schema).toBe("uh.adapter-capabilities.v0");
  });

  test("registry exposes every team adapter id", () => {
    expect(listAdapterIds()).toEqual(["hermes", "codex", "oh-my-pi", "hermes-proxy", "openrouter"]);
    for (const id of listAdapterIds()) {
      expect(getCapabilities(id).id).toBe(id);
      expect(CAPABILITIES[id]).toEqual(getCapabilities(id));
    }
  });

  test("rejects invalid schema version", () => {
    expect(() => parseCapabilitiesManifest({
      ...hermesCapabilities,
      schema: "uh.adapter-capabilities.v1",
    })).toThrow();
  });

  test("oh-my-pi declares network: false for routing tests", () => {
    expect(ohMyPiCapabilities.tools.network).toBe(false);
  });

  test("hermes-proxy is remote-only without local tools", () => {
    const caps = hermesProxyCapabilities;
    expect(caps.sandbox).toBe("remote-only");
    expect(caps.tools.shell).toBe(false);
    expect(caps.tools.fs_read).toBe(false);
    expect(caps.tools.fs_write).toBe(false);
    expect(caps.tools.network).toBe(true);
  });
});

describe("cost table", () => {
  test("last_reviewed is a recent ISO date", () => {
    expect(COST_TABLE_LAST_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const reviewed = new Date(`${COST_TABLE_LAST_REVIEWED}T00:00:00Z`);
    const now = new Date("2026-05-20T00:00:00Z");
    const ageDays = (now.getTime() - reviewed.getTime()) / (24 * 60 * 60 * 1000);
    expect(ageDays).toBeLessThanOrEqual(90);
  });

  test("cost class ranks ascend free → premium", () => {
    expect(compareCostClass("free", "cheap")).toBeLessThan(0);
    expect(compareCostClass("cheap", "standard")).toBeLessThan(0);
    expect(compareCostClass("standard", "premium")).toBeLessThan(0);
    expect(COST_CLASS_RANK.free).toBe(0);
    expect(COST_CLASS_RANK.premium).toBe(3);
  });

  test("costClassWithinMax respects max_cost_class ceiling", () => {
    expect(costClassWithinMax("free", "premium")).toBe(true);
    expect(costClassWithinMax("premium", "cheap")).toBe(false);
    expect(costClassWithinMax("cheap", "cheap")).toBe(true);
  });

  test("COST_CLASSES snapshot matches expected $/Mtok rates", () => {
    expect(COST_CLASSES).toEqual({
      free: { input: 0, output: 0 },
      cheap: { input: 0.25, output: 1.0 },
      standard: { input: 3.0, output: 15.0 },
      premium: { input: 15.0, output: 75.0 },
    });
  });

  test("every manifest cost_class is a known tier with rates", () => {
    for (const id of listAdapterIds()) {
      const tier = getCapabilities(id).cost_class;
      expect(COST_CLASSES[tier]).toBeDefined();
      expect(AdapterCapabilitiesSchema.shape.cost_class.safeParse(tier).success).toBe(true);
    }
  });
});

describe("mission runtime_requirements", () => {
  test("parses optional runtime_requirements block", () => {
    const mission = MissionSchema.parse({
      schema_version: "uh.mission.v0",
      id: "routed",
      title: "Routed mission",
      workflow_profile: "implementation",
      runtime_requirements: {
        needs_network: true,
        needs_shell: false,
        needs_fs_write: false,
        min_context_tokens: 100_000,
        max_cost_class: "cheap",
      },
    });
    expect(mission.runtime_requirements).toEqual({
      needs_network: true,
      needs_shell: false,
      needs_fs_write: false,
      min_context_tokens: 100_000,
      max_cost_class: "cheap",
    });
  });

  test("omits runtime_requirements when unset", () => {
    const mission = MissionSchema.parse({
      schema_version: "uh.mission.v0",
      id: "legacy",
      title: "Legacy mission",
      workflow_profile: "implementation",
    });
    expect(mission.runtime_requirements).toBeUndefined();
  });

  test("RuntimeRequirementsSchema applies defaults", () => {
    expect(RuntimeRequirementsSchema.parse({})).toEqual({
      needs_network: false,
      needs_shell: true,
      needs_fs_write: true,
      max_cost_class: "premium",
    });
  });
});
