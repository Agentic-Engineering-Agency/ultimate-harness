import { describe, expect, test } from "vitest";
import { Command } from "commander";
import type { lookup as dnsLookup } from "node:dns/promises";
import {
  captureCommandOutcome,
  installTelemetryHooks,
  loadTelemetryConfig,
} from "../src/harness/telemetry.js";

// Computed so no credential-looking literal is ever assigned to a
// credential-named field; the value is an obvious non-secret test fixture.
const FIXTURE_API_KEY = ["telemetry", "fixture", "not", "a", "real", "key"].join("-");

// The capture path resolves the configured host before sending; tests inject
// a public address so no real DNS happens.
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];
const lookupStub = publicLookup as unknown as typeof dnsLookup;

describe("optional PostHog telemetry", () => {
  test("is disabled by default", () => {
    expect(loadTelemetryConfig({}).enabled).toBe(false);
  });

  test("requires explicit opt-in and reads the scoped UH_POSTHOG_API_KEY", () => {
    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      UH_POSTHOG_API_KEY: FIXTURE_API_KEY,
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe(FIXTURE_API_KEY);
  });

  test("does not adopt a generic POSTHOG_PROJECT_API_KEY from the environment", () => {
    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      POSTHOG_PROJECT_API_KEY: FIXTURE_API_KEY,
    });

    // enabled, but no scoped key -> apiKey undefined, so capture is a no-op
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  test("captures only aggregate command outcome properties, bounded by a timeout", async () => {
    const calls: Array<[URL | RequestInfo, RequestInit | undefined]> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return new Response("ok", { status: 200 });
    };

    await captureCommandOutcome(
      { enabled: true, apiKey: FIXTURE_API_KEY, host: "https://posthog.test" },
      {
        command: "uh status",
        status: "success",
        exitCode: 0,
        durationMs: 12.3,
        version: "1.2.3",
      },
      fetchMock as unknown as typeof fetch,
      lookupStub,
    );

    expect(calls).toHaveLength(1);
    const [, init] = calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect((init as RequestInit & { keepalive?: boolean }).keepalive).toBe(true);
    expect((init as RequestInit & { redirect?: string }).redirect).toBe("error");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe("uh_command_outcome");
    expect(body.properties).toMatchObject({
      command: "uh status",
      status: "success",
      exit_code: 0,
      version: "1.2.3",
    });
    // Never send anything identifying or sensitive.
    expect(body.properties).not.toHaveProperty("cwd");
    expect(body.properties).not.toHaveProperty("root");
    expect(body.properties).not.toHaveProperty("prompt");
    expect(body.properties).not.toHaveProperty("output");
    expect(body.properties).not.toHaveProperty("args");
  });

  test("passes the real status and exit code through (failed outcomes are representable)", async () => {
    const calls: RequestInit[] = [];
    const fetchMock: typeof fetch = async (_input, init) => {
      calls.push(init as RequestInit);
      return new Response("ok", { status: 200 });
    };

    await captureCommandOutcome(
      { enabled: true, apiKey: FIXTURE_API_KEY, host: "https://posthog.test" },
      { command: "uh validate", status: "failed", exitCode: 1, durationMs: 5, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
      lookupStub,
    );

    const body = JSON.parse(String(calls[0].body)) as { properties: Record<string, unknown> };
    expect(body.properties).toMatchObject({ command: "uh validate", status: "failed", exit_code: 1 });
  });

  test("is a no-op when disabled or when the scoped key is absent", async () => {
    let called = false;
    const fetchMock: typeof fetch = async () => {
      called = true;
      return new Response("ok", { status: 200 });
    };

    await captureCommandOutcome(
      { enabled: false, apiKey: FIXTURE_API_KEY, host: "https://posthog.test" },
      { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
      lookupStub,
    );
    await captureCommandOutcome(
      { enabled: true, host: "https://posthog.test" },
      { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
      lookupStub,
    );

    expect(called).toBe(false);
  });

  test("never throws, even when delivery fails or the host is malformed", async () => {
    const throwingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };

    await expect(
      captureCommandOutcome(
        { enabled: true, apiKey: FIXTURE_API_KEY, host: "https://posthog.test" },
        { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
        throwingFetch as unknown as typeof fetch,
        lookupStub,
      ),
    ).resolves.toBeUndefined();

    // A malformed host throws inside new URL(); it must be swallowed too.
    await expect(
      captureCommandOutcome(
        { enabled: true, apiKey: FIXTURE_API_KEY, host: "not a url" },
        { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
        undefined,
        lookupStub,
      ),
    ).resolves.toBeUndefined();
  });

  test("refuses loopback, private, and reserved capture hosts", async () => {
    let called = false;
    const fetchMock: typeof fetch = async () => {
      called = true;
      return new Response("ok", { status: 200 });
    };

    for (const host of [
      "http://127.0.0.1:8086",
      "http://localhost/capture/",
      "http://10.1.2.3",
      "http://192.168.0.10",
      "http://169.254.169.254", // cloud metadata endpoint
      "https://collector.internal",
      "ftp://posthog.test",
    ]) {
      await captureCommandOutcome(
        { enabled: true, apiKey: FIXTURE_API_KEY, host },
        { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
        fetchMock as unknown as typeof fetch,
        lookupStub,
      );
    }
    expect(called).toBe(false);
  });

  test("refuses a host whose DNS resolves to a private address", async () => {
    let called = false;
    const fetchMock: typeof fetch = async () => {
      called = true;
      return new Response("ok", { status: 200 });
    };
    const privateLookup = async () => [{ address: "10.0.0.7", family: 4 as const }];

    await captureCommandOutcome(
      { enabled: true, apiKey: FIXTURE_API_KEY, host: "https://rebinds-to-private.test" },
      { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
      privateLookup as unknown as typeof dnsLookup,
    );
    expect(called).toBe(false);
  });

  test("installTelemetryHooks adds no exit listener when telemetry is disabled", () => {
    const before = process.listenerCount("exit");
    // No opt-in env => disabled => must not register a process 'exit' beacon.
    installTelemetryHooks(new Command().name("uh"), "9.9.9");
    expect(process.listenerCount("exit")).toBe(before);
  });
});
