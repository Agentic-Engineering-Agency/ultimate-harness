import { describe, expect, test } from "vitest";
import { Command } from "commander";
import {
  captureCommandOutcome,
  installTelemetryHooks,
  loadTelemetryConfig,
} from "../src/harness/telemetry.js";

describe("optional PostHog telemetry", () => {
  test("is disabled by default", () => {
    expect(loadTelemetryConfig({}).enabled).toBe(false);
  });

  test("requires explicit opt-in and reads the scoped UH_POSTHOG_API_KEY", () => {
    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      UH_POSTHOG_API_KEY: "ph_project_key",
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("ph_project_key");
  });

  test("does not adopt a generic POSTHOG_PROJECT_API_KEY from the environment", () => {
    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      POSTHOG_PROJECT_API_KEY: "unrelated_key",
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
      { enabled: true, apiKey: "ph_project_key", host: "https://posthog.test" },
      {
        command: "uh status",
        status: "success",
        exitCode: 0,
        durationMs: 12.3,
        version: "1.2.3",
      },
      fetchMock as unknown as typeof fetch,
    );

    expect(calls).toHaveLength(1);
    const [, init] = calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect((init as RequestInit & { keepalive?: boolean }).keepalive).toBe(true);
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
      { enabled: true, apiKey: "ph_project_key", host: "https://posthog.test" },
      { command: "uh validate", status: "failed", exitCode: 1, durationMs: 5, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
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
      { enabled: false, apiKey: "ph_project_key", host: "https://posthog.test" },
      { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
    );
    await captureCommandOutcome(
      { enabled: true, host: "https://posthog.test" },
      { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      fetchMock as unknown as typeof fetch,
    );

    expect(called).toBe(false);
  });

  test("never throws, even when delivery fails or the host is malformed", async () => {
    const throwingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };

    await expect(
      captureCommandOutcome(
        { enabled: true, apiKey: "ph_project_key", host: "https://posthog.test" },
        { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
        throwingFetch as unknown as typeof fetch,
      ),
    ).resolves.toBeUndefined();

    // A malformed host throws inside new URL(); it must be swallowed too.
    await expect(
      captureCommandOutcome(
        { enabled: true, apiKey: "ph_project_key", host: "not a url" },
        { command: "uh status", status: "success", exitCode: 0, durationMs: 1, version: "1.2.3" },
      ),
    ).resolves.toBeUndefined();
  });

  test("installTelemetryHooks adds no exit listener when telemetry is disabled", () => {
    const before = process.listenerCount("exit");
    // No opt-in env => disabled => must not register a process 'exit' beacon.
    installTelemetryHooks(new Command().name("uh"), "9.9.9");
    expect(process.listenerCount("exit")).toBe(before);
  });
});
