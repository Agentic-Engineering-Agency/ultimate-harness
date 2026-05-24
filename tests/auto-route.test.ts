import { describe, expect, test } from "vitest";
import { chooseAdapter, formatAutoRouteExplain } from "../src/harness/auto-route.js";
import type { AdapterId } from "../src/adapters/capabilities/index.js";
import type { AdapterCapabilities, CostClass } from "../src/schema/adapter-capabilities.js";
import type { MissionDocument } from "../src/schema/mission.js";

function makeCaps(
  id: AdapterId,
  opts: {
    cost?: CostClass;
    ctx?: number;
    network?: boolean;
    shell?: boolean;
    fs_write?: boolean;
  } = {},
): AdapterCapabilities {
  return {
    schema: "uh.adapter-capabilities.v0",
    id,
    display_name: id,
    tools: {
      shell: opts.shell ?? true,
      fs_read: true,
      fs_write: opts.fs_write ?? true,
      network: opts.network ?? false,
      custom: [],
    },
    sandbox: "agentfs",
    max_context_tokens: opts.ctx ?? 200_000,
    cost_class: opts.cost ?? "standard",
    supports_runtime_config_overrides: true,
    supports_cancel: true,
    supports_replay: true,
  };
}

function capsMap(entries: Partial<Record<AdapterId, AdapterCapabilities>>): Record<AdapterId, AdapterCapabilities> {
  return entries as Record<AdapterId, AdapterCapabilities>;
}

function mission(rr?: Record<string, unknown>): MissionDocument {
  return { runtime_requirements: rr } as unknown as MissionDocument;
}

describe("UH-101 chooseAdapter", () => {
  test("picks the cheapest eligible adapter", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { cost: "premium" }),
      codex: makeCaps("codex", { cost: "free" }),
    });
    const d = chooseAdapter(mission(), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("codex");
    expect(d.candidates.every((c) => c.eligible)).toBe(true);
  });

  test("breaks cost ties by larger context window", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { cost: "free", ctx: 100_000 }),
      codex: makeCaps("codex", { cost: "free", ctx: 300_000 }),
    });
    const d = chooseAdapter(mission(), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("codex");
  });

  test("breaks full ties by adapter id (deterministic)", () => {
    const caps = capsMap({
      codex: makeCaps("codex", { cost: "cheap", ctx: 200_000 }),
      hermes: makeCaps("hermes", { cost: "cheap", ctx: 200_000 }),
    });
    const d = chooseAdapter(mission(), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("codex"); // "codex" < "hermes"
  });

  test("excludes adapters that lack a required tool (needs_network)", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { network: true, cost: "premium" }),
      "oh-my-pi": makeCaps("oh-my-pi", { network: false, cost: "free" }),
    });
    const d = chooseAdapter(mission({ needs_network: true }), ["hermes", "oh-my-pi"], caps);
    expect(d.adapter).toBe("hermes");
    const omp = d.candidates.find((c) => c.adapter === "oh-my-pi");
    expect(omp?.eligible).toBe(false);
    expect(omp?.exclusionReasons).toContain("needs_network");
  });

  test("excludes adapters below min_context_tokens", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { ctx: 200_000, cost: "free" }),
      codex: makeCaps("codex", { ctx: 400_000, cost: "standard" }),
    });
    const d = chooseAdapter(mission({ min_context_tokens: 300_000 }), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("codex");
  });

  test("excludes adapters above max_cost_class", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { cost: "premium" }),
      codex: makeCaps("codex", { cost: "cheap" }),
    });
    const d = chooseAdapter(mission({ max_cost_class: "cheap" }), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("codex");
  });

  test("returns null with reasons when nothing is eligible", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { network: false }),
      codex: makeCaps("codex", { network: false }),
    });
    const d = chooseAdapter(mission({ needs_network: true }), ["hermes", "codex"], caps);
    expect(d.adapter).toBeNull();
    expect(d.reason).toContain("needs_network");
    expect(d.candidates).toHaveLength(2);
  });

  test("returns null when no adapters are available", () => {
    const d = chooseAdapter(mission(), [], capsMap({}));
    expect(d.adapter).toBeNull();
    expect(d.reason).toContain("no installed adapter");
    expect(d.candidates).toHaveLength(0);
  });

  test("drops available ids that have no capability manifest", () => {
    const caps = capsMap({ hermes: makeCaps("hermes", { cost: "free" }) });
    const d = chooseAdapter(mission(), ["hermes", "codex"], caps);
    expect(d.adapter).toBe("hermes");
    expect(d.candidates.map((c) => c.adapter)).toEqual(["hermes"]);
  });

  test("is deterministic for identical inputs", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { cost: "cheap" }),
      codex: makeCaps("codex", { cost: "standard" }),
      "oh-my-pi": makeCaps("oh-my-pi", { cost: "free" }),
    });
    const a = chooseAdapter(mission(), ["hermes", "codex", "oh-my-pi"], caps);
    const b = chooseAdapter(mission(), ["oh-my-pi", "hermes", "codex"], caps);
    expect(a.adapter).toBe("oh-my-pi");
    expect(b.adapter).toBe("oh-my-pi");
    expect(a.candidates).toEqual(b.candidates);
  });

  test("formatAutoRouteExplain renders rows and a verdict", () => {
    const caps = capsMap({
      hermes: makeCaps("hermes", { cost: "free" }),
      codex: makeCaps("codex", { cost: "premium" }),
    });
    const d = chooseAdapter(mission({ max_cost_class: "cheap" }), ["hermes", "codex"], caps);
    const text = formatAutoRouteExplain(d);
    expect(text).toContain("Auto-route decision matrix:");
    expect(text).toContain("hermes");
    expect(text).toContain("excluded:");
    expect(text).toContain("=> hermes");
  });
});
