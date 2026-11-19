import { describe, expect, test, vi } from "vitest";
import { pushOtlpTraces, type OtlpPushOptions } from "../src/harness/otlp-push.js";
import type { OtlpTraceExport } from "../src/harness/otel-export.js";

const SECRET = "X-MARKER-SECRET-VALUE-12345";
const BODY: OtlpTraceExport = { resourceSpans: [] };

function fakeFetch(
  handler: (
    url: string,
    init: RequestInit,
  ) => Promise<Response>,
): typeof globalThis.fetch {
  return ((_input: string | URL | Request, init?: RequestInit) =>
    handler(String(_input), init! as RequestInit)) as unknown as typeof globalThis.fetch;
}

function okResponse(): Response {
  return new Response(null, { status: 200 });
}

function retryAfterResponse(seconds: number): Response {
  return new Response(null, { status: 429, headers: { "retry-after": String(seconds) } });
}

function makeDelay(): { delay: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  const delay = (ms: number) => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { delay, calls };
}

const BASE: Omit<OtlpPushOptions, "fetch" | "delay"> = {
  endpoint: "https://collector.example.com",
};

describe("pushOtlpTraces", () => {
  test("appends /v1/traces when endpoint path is empty", async () => {
    const urls: string[] = [];
    const fetch = fakeFetch(async (url) => {
      urls.push(url);
      return okResponse();
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, endpoint: "https://collector.example.com", fetch, delay });
    expect(urls[0]).toBe("https://collector.example.com/v1/traces");
  });

  test("appends /v1/traces when endpoint path is a single slash", async () => {
    const urls: string[] = [];
    const fetch = fakeFetch(async (url) => {
      urls.push(url);
      return okResponse();
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, endpoint: "https://collector.example.com/", fetch, delay });
    expect(urls[0]).toBe("https://collector.example.com/v1/traces");
  });

  test("uses endpoint path as-is when it already has a path", async () => {
    const urls: string[] = [];
    const fetch = fakeFetch(async (url) => {
      urls.push(url);
      return okResponse();
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, {
      ...BASE,
      endpoint: "https://collector.example.com/custom/traces",
      fetch,
      delay,
    });
    expect(urls[0]).toBe("https://collector.example.com/custom/traces");
  });

  test("rejects non-http(s) endpoints", async () => {
    const fetch = fakeFetch(async () => okResponse());
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, {
      ...BASE,
      endpoint: "ftp://collector.example.com",
      fetch,
      delay,
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("invalid_endpoint");
  });

  test("rejects relative endpoints", async () => {
    const fetch = fakeFetch(async () => okResponse());
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, {
      ...BASE,
      endpoint: "/v1/traces",
      fetch,
      delay,
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("invalid_endpoint");
  });

  test("returns ok with HTTP status on success", async () => {
    const fetch = fakeFetch(async () => okResponse());
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.status).toBe(200);
  });

  test("sends POST with content-type application/json", async () => {
    let capturedInit: RequestInit | undefined;
    const fetch = fakeFetch(async (_url, init) => {
      capturedInit = init;
      return okResponse();
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(capturedInit?.method).toBe("POST");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
  });

  test("includes custom headers", async () => {
    let capturedInit: RequestInit | undefined;
    const fetch = fakeFetch(async (_url, init) => {
      capturedInit = init;
      return okResponse();
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, {
      ...BASE,
      headers: { "x-api-key": "test-key" },
      fetch,
      delay,
    });
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
  });

  test("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      if (calls === 1) return retryAfterResponse(1);
      return okResponse();
    });
    const { delay, calls: delays } = makeDelay();

    const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.status).toBe(200);
    expect(calls).toBe(2);
    expect(delays).toHaveLength(1);
  });

  test("retries on 502, 503, 504 then succeeds", async () => {
    for (const status of [502, 503, 504]) {
      let calls = 0;
      const fetch = fakeFetch(async () => {
        calls++;
        if (calls === 1) return new Response(null, { status });
        return okResponse();
      });
      const { delay } = makeDelay();

      const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
      expect(result.kind).toBe("ok");
    }
  });

  test("returns failed with reason http and status after retries exhausted", async () => {
    const fetch = fakeFetch(async () => retryAfterResponse(1));
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toBe("http");
      expect(result.status).toBe(429);
    }
  });

  test("does not retry on non-retryable 400", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      return new Response(null, { status: 400 });
    });
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(calls).toBe(1);
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.reason).toBe("http");
      expect(result.status).toBe(400);
    }
  });

  test("returns failed with reason timeout when signal aborts", async () => {
    const fetch = fakeFetch(async (_url, init) => {
      const signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, {
      ...BASE,
      fetch,
      delay,
      timeoutMs: 1,
    });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("timeout");
  });

  test("returns failed with reason transport on network error", async () => {
    const fetch = fakeFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(result.kind).toBe("failed");
    if (result.kind === "failed") expect(result.reason).toBe("transport");
  });

  test("uses default 500ms retry delay when no retry-after header", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 503 });
      return okResponse();
    });
    const { delay, calls: delays } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(delays[0]).toBe(500);
  });

  test("uses 2000ms for second retry delay", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      if (calls <= 2) return new Response(null, { status: 503 });
      return okResponse();
    });
    const { delay, calls: delays } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(delays[0]).toBe(500);
    expect(delays[1]).toBe(2000);
  });

  test("caps retry-after at 5 seconds", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      if (calls === 1) return retryAfterResponse(30);
      return okResponse();
    });
    const { delay, calls: delays } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(delays[0]).toBe(5000);
  });

  test("marker in header value never appears in result", async () => {
    const fetch = fakeFetch(async () => new Response(null, { status: 500 }));
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(BODY, {
      ...BASE,
      headers: { "x-custom": SECRET },
      fetch,
      delay,
    });
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(SECRET);
  });

  test("marker in request body never appears in result", async () => {
    const bodyWithSecret: OtlpTraceExport = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "secret", value: { stringValue: SECRET } }] },
          scopeSpans: [],
        },
      ],
    };
    const fetch = fakeFetch(async () => new Response(null, { status: 500 }));
    const { delay } = makeDelay();

    const result = await pushOtlpTraces(bodyWithSecret, { ...BASE, fetch, delay });
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(SECRET);
  });

  test("never throws for network conditions", async () => {
    const fetch = fakeFetch(async () => {
      throw new Error("boom");
    });
    const { delay } = makeDelay();

    await expect(
      pushOtlpTraces(BODY, { ...BASE, fetch, delay }),
    ).resolves.toBeDefined();
  });

  test("never throws on retryable errors", async () => {
    const fetch = fakeFetch(async () => new Response(null, { status: 502 }));
    const { delay } = makeDelay();

    await expect(
      pushOtlpTraces(BODY, { ...BASE, fetch, delay }),
    ).resolves.toBeDefined();
  });

  test("does not retry on 400", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      return new Response(null, { status: 400 });
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(calls).toBe(1);
  });

  test("does not retry on 500", async () => {
    let calls = 0;
    const fetch = fakeFetch(async () => {
      calls++;
      return new Response(null, { status: 500 });
    });
    const { delay } = makeDelay();

    await pushOtlpTraces(BODY, { ...BASE, fetch, delay });
    expect(calls).toBe(1);
  });
});
