import { describe, expect, test } from "vitest";
import {
  captureCommandOutcome,
  loadTelemetryConfig,
} from "../src/harness/telemetry.js";

describe("optional PostHog telemetry", () => {
  test("is disabled by default", () => {
    expect(loadTelemetryConfig({}).enabled).toBe(false);
  });

  test("requires explicit opt-in and accepts the PostHog project API key env var", () => {
    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      UH_POSTHOG_API_KEY: "ph_project_key",
    });

    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("ph_project_key");
  });

  test("captures only aggregate command outcome properties", async () => {
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
    expect(body.properties).not.toHaveProperty("cwd");
    expect(body.properties).not.toHaveProperty("root");
    expect(body.properties).not.toHaveProperty("prompt");
    expect(body.properties).not.toHaveProperty("output");
  });
});
