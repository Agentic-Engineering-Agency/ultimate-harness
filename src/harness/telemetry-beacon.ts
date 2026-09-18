/**
 * Telemetry delivery beacon (compiled to dist/harness/telemetry-beacon.js).
 *
 * Runs as a standalone, detached child after the parent CLI process has
 * exited, which is why it is self-contained and reads everything from env.
 * It is a fixed script spawned by path — the parent never passes code to an
 * interpreter — and it re-validates the endpoint before sending:
 * http(s) only, no literal or resolved loopback/private/reserved targets,
 * and redirects are refused so a resolved address cannot be rerouted.
 * Every failure is swallowed; telemetry must never surface errors.
 */

const url = process.env.UH_BEACON_URL;
const body = process.env.UH_BEACON_BODY;
if (!url || !body) process.exit(0);

function refused(target: string): boolean {
  const h = target.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::" || h === "::1") return true;
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return refused(mapped[1]);
  if (h.includes(":")) {
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10) ranges.
    return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  const c = Number(v4[3]);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 113) ||
    a >= 224;
}

async function main(): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url as string);
  } catch {
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
  if (refused(parsed.hostname)) return;
  try {
    const dns = await import("node:dns");
    const records = await dns.promises.lookup(parsed.hostname, { all: true });
    if (records.length === 0) return;
    if (records.some((record) => refused(record.address))) return;
  } catch {
    return;
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.UH_BEACON_TIMEOUT_MS) || 2000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(parsed, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
      redirect: "error",
    });
  } catch {
    // best-effort: never surface telemetry failures
  } finally {
    clearTimeout(timer);
  }
}

await main();
