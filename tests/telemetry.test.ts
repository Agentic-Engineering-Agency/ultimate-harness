import { Command } from "commander";
import { describe, expect, test, vi } from "vitest";
import {
  captureCommandOutcome,
  installTelemetryHooks,
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

  test("aborts slow PostHog capture instead of hanging the CLI", async () => {
    vi.useFakeTimers();
    const fetchMock: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const capturePromise = captureCommandOutcome(
      { enabled: true, apiKey: "ph_project_key", host: "https://posthog.test" },
      {
        command: "uh status",
        status: "success",
        exitCode: 0,
        durationMs: 1,
        version: "1.0.0",
      },
      fetchMock as unknown as typeof fetch,
    );

    await vi.advanceTimersByTimeAsync(2_500);
    await expect(capturePromise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  test("flushes telemetry when a handler calls process.exit", async () => {
    const calls: unknown[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return new Response("ok", { status: 200 });
    };
    vi.stubGlobal("fetch", fetchMock);
    const prevTelemetry = process.env.UH_TELEMETRY;
    const prevKey = process.env.UH_POSTHOG_API_KEY;
    process.env.UH_TELEMETRY = "posthog";
    process.env.UH_POSTHOG_API_KEY = "ph_project_key";

    const program = new Command();
    installTelemetryHooks(program, "9.9.9");
    program
      .command("fail")
      .action(() => {
        process.exit(2);
      });

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number | string | null | undefined) => {
      exitCode = typeof code === "number" ? code : 0;
    }) as typeof process.exit;

    await program.parseAsync(["fail"], { from: "user" });
    await new Promise((resolve) => setImmediate(resolve));

    process.exit = originalExit;
    vi.unstubAllGlobals();
    if (prevTelemetry === undefined) delete process.env.UH_TELEMETRY;
    else process.env.UH_TELEMETRY = prevTelemetry;
    if (prevKey === undefined) delete process.env.UH_POSTHOG_API_KEY;
    else process.env.UH_POSTHOG_API_KEY = prevKey;

    expect(exitCode).toBe(2);
    expect(calls).toHaveLength(1);
  });
});
