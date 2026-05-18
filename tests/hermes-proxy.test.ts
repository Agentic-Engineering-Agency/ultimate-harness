import { test, expect, describe } from "vitest";
import { validateAdapter } from "../src/schema/adapter.js";
import {
  HermesProxyRuntimeConfigSchema,
  dryRunHermesProxy,
  hermesProxyRuntimeChecker,
  runHermesProxy,
} from "../src/adapters/hermes-proxy.js";
import { listAdapterTemplates } from "../src/harness/adapter-add.js";

/**
 * UH-35 — schema + manifest + template + dispatch entry.
 *
 * Real HTTP behavior arrives in UH-39 + UH-37; this suite locks the strict
 * schema, the structural shape of the dispatch stubs, and the fact that
 * `uh adapter add hermes-proxy` is wired into the templates list.
 */

describe("hermes-proxy schema", () => {
  test("accepts the canonical local-proxy manifest", () => {
    const cfg = HermesProxyRuntimeConfigSchema.parse({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
      provider: "nous",
      request_timeout_ms: 120_000,
      extra_headers: { "X-UH": "1" },
    });
    expect(cfg.endpoint).toBe("http://127.0.0.1:8645/v1");
    expect(cfg.model).toBe("hermes-4-405b");
    expect(cfg.provider).toBe("nous");
    expect(cfg.request_timeout_ms).toBe(120_000);
    expect(cfg.extra_headers).toEqual({ "X-UH": "1" });
  });

  test("defaults request_timeout_ms to 120_000 and extra_headers to {}", () => {
    const cfg = HermesProxyRuntimeConfigSchema.parse({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
    });
    expect(cfg.request_timeout_ms).toBe(120_000);
    expect(cfg.extra_headers).toEqual({});
    expect(cfg.provider).toBeUndefined();
  });

  test("rejects unknown keys (typo safety)", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        endpoiint: "http://nope",
      }),
    ).toThrow(/endpoiint/);
  });

  test("rejects non-URL endpoint", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "not-a-url",
        model: "hermes-4-405b",
      }),
    ).toThrow(/url|URL/);
  });

  test("requires model", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
      }),
    ).toThrow();
  });

  test("rejects empty-string model", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "",
      }),
    ).toThrow();
  });

  test("rejects unknown provider value", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        provider: "groq",
      }),
    ).toThrow();
  });

  test("rejects negative request_timeout_ms", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        request_timeout_ms: -1,
      }),
    ).toThrow();
  });

  test("rejects non-integer request_timeout_ms", () => {
    expect(() =>
      HermesProxyRuntimeConfigSchema.parse({
        endpoint: "http://127.0.0.1:8645/v1",
        model: "hermes-4-405b",
        request_timeout_ms: 1.5,
      }),
    ).toThrow();
  });
});

describe("hermes-proxy manifest validation via validateAdapter", () => {
  test("full manifest with valid runtime_config passes", async () => {
    // Force-import for the registerRuntimeConfigSchema side effect.
    await import("../src/adapters/hermes-proxy.js");
    const doc = validateAdapter({
      schema_version: "uh.adapter.v0",
      id: "hermes-proxy",
      name: "Hermes Proxy",
      runtime: "hermes-proxy",
      capabilities: ["oai-compat"],
      status: "experimental",
      config: {
        runtime_config: {
          endpoint: "http://127.0.0.1:8645/v1",
          model: "hermes-4-405b",
          provider: "nous",
        },
      },
    });
    expect(doc.runtime).toBe("hermes-proxy");
    expect(doc.config?.runtime_config).toMatchObject({
      endpoint: "http://127.0.0.1:8645/v1",
      model: "hermes-4-405b",
      provider: "nous",
      request_timeout_ms: 120_000,
      extra_headers: {},
    });
  });

  test("typo in runtime_config key is rejected at adapter load", async () => {
    await import("../src/adapters/hermes-proxy.js");
    expect(() =>
      validateAdapter({
        schema_version: "uh.adapter.v0",
        id: "hermes-proxy",
        name: "Hermes Proxy",
        runtime: "hermes-proxy",
        config: {
          runtime_config: {
            endpoint: "http://127.0.0.1:8645/v1",
            model: "hermes-4-405b",
            modle: "hermes-4-405b", // typo
          },
        },
      }),
    ).toThrow(/modle/);
  });
});

describe("hermes-proxy runtime checker (stub)", () => {
  test("reports configured + live HTTP probe pending UH-37", async () => {
    const result = await hermesProxyRuntimeChecker(
      {
        schema_version: "uh.adapter.v0",
        id: "hermes-proxy",
        name: "Hermes Proxy",
        description: "",
        runtime: "hermes-proxy",
        capabilities: [],
        status: "experimental",
        config: {
          cli_command: "",
          default_toolsets: [],
          default_provider: "",
          default_model: "",
          worktree_mode: false,
          pass_session_id: true,
          runtime_config: {
            endpoint: "http://127.0.0.1:8645/v1",
            model: "hermes-4-405b",
          },
        },
      },
      process.cwd(),
    );
    expect(result.runtime).toBe("hermes-proxy");
    expect(result.found).toBe(true);
    expect(result.version).toMatch(/manifest-only/);
    expect(result.version).toMatch(/UH-37/);
    expect(result.errors).toEqual([]);
  });
});

describe("hermes-proxy dispatch stub", () => {
  test("dryRun returns a structured blocked placeholder", async () => {
    const result = await dryRunHermesProxy("/tmp/unused-root", "/tmp/unused-mission.yaml");
    expect(result.command).toBe("POST <endpoint>/chat/completions");
    expect(result.args).toHaveLength(1);
    expect(result.worktree).toBe(false);
    expect(result.session_id_passthrough).toBe(false);
    expect(result.errors).toEqual([
      "hermes-proxy adapter implementation pending (UH-39)",
    ]);
  });

  test("run returns a non-zero exit + blocked result with UH-39 pointer", async () => {
    const result = await runHermesProxy("/tmp/unused-root", "/tmp/unused-mission.yaml");
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/implementation pending \(UH-39\)/);
    expect(result.result?.status).toBe("blocked");
    expect(result.result?.errors).toEqual([
      "hermes-proxy adapter implementation pending (UH-39)",
    ]);
  });
});

describe("hermes-proxy adapter-add template", () => {
  test("hermes-proxy is listed by uh adapter add", () => {
    expect(listAdapterTemplates()).toContain("hermes-proxy");
  });
});
