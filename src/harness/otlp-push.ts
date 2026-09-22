import type { OtlpTraceExport } from "./otel-export.js";

const RETRYABLE_STATUSES: readonly number[] = [429, 502, 503, 504];
const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_AFTER_CAP_SECONDS = 5;
const RETRY_DELAYS_MS: readonly number[] = [500, 2000];

type OtlpPushOk = { kind: "ok"; status: number };
type OtlpPushFailed = { kind: "failed"; reason: "invalid_endpoint" | "timeout" | "transport" | "http"; status?: number };
export type OtlpPushResult = OtlpPushOk | OtlpPushFailed;

export interface OtlpPushOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  delay?: (ms: number) => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeEndpoint(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/v1/traces";
  }
  return url.toString();
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after")?.trim();
  const seconds = header ? Number(header) : Number.NaN;
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, RETRY_AFTER_CAP_SECONDS) * 1000;
  }
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

function raceTimeout<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

export async function pushOtlpTraces(
  exportBody: OtlpTraceExport,
  options: OtlpPushOptions,
): Promise<OtlpPushResult> {
  const url = normalizeEndpoint(options.endpoint);
  if (!url) return { kind: "failed", reason: "invalid_endpoint" };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetch ?? globalThis.fetch;
  const delay = options.delay ?? sleep;
  const body = JSON.stringify(exportBody);

  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await raceTimeout(
        fetchFn(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...options.headers,
          },
          body,
          signal: controller.signal,
        }),
        controller.signal,
      );
    } catch {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        return { kind: "failed", reason: "timeout" };
      }
      return { kind: "failed", reason: "transport" };
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      return { kind: "ok", status: response.status };
    }

    lastStatus = response.status;
    if (!RETRYABLE_STATUSES.includes(response.status) || attempt === 2) break;

    await delay(retryDelayMs(response, attempt + 1));
  }

  return { kind: "failed", reason: "http", status: lastStatus };
}
