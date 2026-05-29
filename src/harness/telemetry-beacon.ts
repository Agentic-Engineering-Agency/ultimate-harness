/**
 * Detached child process: reads capture URL/body from env and POSTs to PostHog.
 * Spawned synchronously from the parent `process.on("exit")` handler.
 */
const TELEMETRY_FETCH_TIMEOUT_MS = 2_000;

async function postCapture(): Promise<void> {
  const url = process.env.UH_TELEMETRY_CAPTURE_URL;
  const body = process.env.UH_TELEMETRY_CAPTURE_BODY;
  if (!url || !body) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEMETRY_FETCH_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
  } catch {
    // Best-effort; never throw to the parent.
  } finally {
    clearTimeout(timeout);
  }
}

void postCapture();
