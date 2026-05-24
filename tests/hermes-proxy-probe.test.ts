import { describe, expect, test } from "vitest";
import {
  mergeProbedCapabilities,
  probeHermesProxyCapabilities,
} from "../src/adapters/capabilities/hermes-proxy-probe.js";
import { hermesProxyCapabilities } from "../src/adapters/capabilities/hermes-proxy.js";
import type { AdapterCapabilities } from "../src/schema/adapter-capabilities.js";

const base = hermesProxyCapabilities as AdapterCapabilities;

function fakeFetch(impl: () => Promise<unknown>): typeof fetch {
  return (async () => {
    return impl() as unknown;
  }) as unknown as typeof fetch;
}

function okResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("mergeProbedCapabilities", () => {
  test("probe fields win; unspecified fields keep the base", () => {
    const merged = mergeProbedCapabilities(base, {
      max_context_tokens: 1_000_000,
      cost_class: "standard",
    });
    expect(merged.max_context_tokens).toBe(1_000_000);
    expect(merged.cost_class).toBe("standard");
    expect(merged.sandbox).toBe(base.sandbox); // untouched
    expect(merged.id).toBe("hermes-proxy");
  });

  test("merges partial tools over base tools", () => {
    const merged = mergeProbedCapabilities(base, { tools: { fs_write: true } });
    expect(merged.tools.fs_write).toBe(true);
    expect(merged.tools.network).toBe(base.tools.network);
  });
});

describe("probeHermesProxyCapabilities", () => {
  test("merges a valid probe document (source=probe)", async () => {
    const result = await probeHermesProxyCapabilities("http://proxy.test", {
      fetchImpl: fakeFetch(async () => okResponse({ max_context_tokens: 1_000_000, cost_class: "standard" })),
    });
    expect(result.source).toBe("probe");
    expect(result.capabilities.max_context_tokens).toBe(1_000_000);
    expect(result.capabilities.cost_class).toBe("standard");
  });

  test("falls back to static on non-200", async () => {
    const result = await probeHermesProxyCapabilities("http://proxy.test", {
      fetchImpl: fakeFetch(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response),
    });
    expect(result.source).toBe("static");
    expect(result.capabilities.max_context_tokens).toBe(base.max_context_tokens);
  });

  test("falls back to static on a malformed document", async () => {
    const result = await probeHermesProxyCapabilities("http://proxy.test", {
      fetchImpl: fakeFetch(async () => okResponse({ max_context_tokens: -10, cost_class: "bogus" })),
    });
    expect(result.source).toBe("static");
    expect(result.capabilities).toEqual(base);
  });

  test("falls back to static on a network error", async () => {
    const result = await probeHermesProxyCapabilities("http://proxy.test", {
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(result.source).toBe("static");
    expect(result.capabilities).toEqual(base);
  });
});
