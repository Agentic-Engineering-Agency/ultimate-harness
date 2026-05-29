import { Command } from "commander";
import type { ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { describe, expect, test, vi } from "vitest";
import {
  buildCaptureRequest,
  captureCommandOutcome,
  getTelemetryDistinctId,
  installTelemetryHooks,
  loadTelemetryConfig,
  spawnTelemetryBeacon,
  type CaptureRequest,
  type TelemetryBeaconSpawner,
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

  test("uses a stable per-install distinct id", () => {
    const first = getTelemetryDistinctId();
    const second = getTelemetryDistinctId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second).toBe(first);
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
      distinct_id: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe("uh_command_outcome");
    expect(body.distinct_id).toBe(getTelemetryDistinctId());
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

  test("does not register exit listeners when telemetry is disabled", () => {
    const before = process.listenerCount("exit");
    const program = new Command();
    installTelemetryHooks(program, "1.0.0");
    expect(process.listenerCount("exit")).toBe(before);
  });

  test("exit beacon delivers failed status to a mock capture server", async () => {
    const received = deferred<string>();
    const server = await startMockCaptureServer(received);
    const mockSpawner = makeImmediateBeaconSpawner(received);

    const config = loadTelemetryConfig({
      UH_TELEMETRY: "posthog",
      UH_POSTHOG_API_KEY: "ph_project_key",
      UH_POSTHOG_HOST: `http://127.0.0.1:${server.port}`,
    });
    const request = buildCaptureRequest(config, {
      command: "uh validate bad",
      status: "failed",
      exitCode: 1,
      durationMs: 4,
      version: "9.9.9",
    });
    expect(request).not.toBeNull();

    spawnTelemetryBeacon(request!, mockSpawner);
    const body = JSON.parse(await received.promise) as {
      properties: { status: string; exit_code: number; command: string };
    };

    await server.close();
    expect(body.properties.status).toBe("failed");
    expect(body.properties.exit_code).toBe(1);
    expect(body.properties.command).toBe("uh validate bad");
  });

  test("installTelemetryHooks captures real exit code via exit beacon", async () => {
    const received = deferred<string>();
    const server = await startMockCaptureServer(received);
    const mockSpawner = makeImmediateBeaconSpawner(received);

    const prevTelemetry = process.env.UH_TELEMETRY;
    const prevKey = process.env.UH_POSTHOG_API_KEY;
    const prevHost = process.env.UH_POSTHOG_HOST;
    process.env.UH_TELEMETRY = "posthog";
    process.env.UH_POSTHOG_API_KEY = "ph_project_key";
    process.env.UH_POSTHOG_HOST = `http://127.0.0.1:${server.port}`;

    const program = new Command();
    installTelemetryHooks(program, "9.9.9", { spawnBeacon: mockSpawner });
    program
      .command("fail")
      .action(() => {
        process.exit(1);
      });

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number | string | null | undefined) => {
      exitCode = typeof code === "number" ? code : 0;
      process.emit("exit", exitCode);
    }) as typeof process.exit;

    await program.parseAsync(["fail"], { from: "user" });
    const body = JSON.parse(await received.promise) as {
      properties: { status: string; exit_code: number };
    };

    process.exit = originalExit;
    await server.close();
    if (prevTelemetry === undefined) delete process.env.UH_TELEMETRY;
    else process.env.UH_TELEMETRY = prevTelemetry;
    if (prevKey === undefined) delete process.env.UH_POSTHOG_API_KEY;
    else process.env.UH_POSTHOG_API_KEY = prevKey;
    if (prevHost === undefined) delete process.env.UH_POSTHOG_HOST;
    else process.env.UH_POSTHOG_HOST = prevHost;

    expect(exitCode).toBe(1);
    expect(body.properties.status).toBe("failed");
    expect(body.properties.exit_code).toBe(1);
  });
});

function makeImmediateBeaconSpawner(
  received: ReturnType<typeof deferred<string>>,
): TelemetryBeaconSpawner {
  return (_scriptPath, env) => {
    const request: CaptureRequest = {
      url: String(env.UH_TELEMETRY_CAPTURE_URL),
      body: String(env.UH_TELEMETRY_CAPTURE_BODY),
    };
    void deliverCaptureRequest(request).then(() => received.resolve(request.body));
    return { unref: () => undefined } as ChildProcess;
  };
}

async function deliverCaptureRequest(request: CaptureRequest): Promise<void> {
  await fetch(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: request.body,
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function startMockCaptureServer(
  received: ReturnType<typeof deferred<string>>,
): Promise<{ port: number; close: () => Promise<void> }> {
  let server!: Server;
  const listenPromise = new Promise<number>((resolve) => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        received.resolve(body);
        res.writeHead(200);
        res.end("ok");
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as { port: number }).port);
    });
  });
  const port = await listenPromise;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
