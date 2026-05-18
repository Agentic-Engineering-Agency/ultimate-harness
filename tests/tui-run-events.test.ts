import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseEventLine,
  readExistingEvents,
  tailRunEvents,
  type RunEvent,
} from "../src/tui/run-events.js";

const ROOT = "/tmp/uh-test-run-events";
const FILE = join(ROOT, "events.ndjson");

async function reset() {
  try { await rm(ROOT, { recursive: true, force: true }); } catch {}
  await mkdir(ROOT, { recursive: true });
}

beforeEach(reset);
afterEach(async () => { try { await rm(ROOT, { recursive: true, force: true }); } catch {} });

describe("tui/run-events parseEventLine", () => {
  test("returns null for empty / whitespace input", () => {
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("    ")).toBeNull();
  });

  test("extracts kind from event / kind / type in priority order", () => {
    expect(parseEventLine(JSON.stringify({ event: "runtime.started" }))?.kind).toBe("runtime.started");
    expect(parseEventLine(JSON.stringify({ kind: "stdout" }))?.kind).toBe("stdout");
    expect(parseEventLine(JSON.stringify({ type: "verification.started" }))?.kind).toBe("verification.started");
    expect(parseEventLine(JSON.stringify({ foo: "bar" }))?.kind).toBe("unknown");
  });

  test("extracts timestamp from timestamp / ts / time / at with fallback", () => {
    const a = parseEventLine(JSON.stringify({ event: "x", timestamp: "2026-05-18T00:00:00.000Z" }));
    expect(a?.timestamp).toBe("2026-05-18T00:00:00.000Z");
    const b = parseEventLine(JSON.stringify({ event: "x", ts: "2026-01-01T00:00:00.000Z" }));
    expect(b?.timestamp).toBe("2026-01-01T00:00:00.000Z");
    const c = parseEventLine(JSON.stringify({ event: "x" }));
    expect(c?.timestamp).toBeTruthy();
  });

  test("emits parse-error event for malformed JSON without throwing", () => {
    const event = parseEventLine("::: not json :::");
    expect(event?.kind).toBe("parse-error");
    expect(event?.record).toMatchObject({ raw: "::: not json :::" });
  });
});

describe("tui/run-events readExistingEvents", () => {
  test("returns 0 and emits nothing when file missing", async () => {
    const events: RunEvent[] = [];
    const offset = await readExistingEvents(FILE, (e) => events.push(e));
    expect(offset).toBe(0);
    expect(events).toEqual([]);
  });

  test("emits one event per complete newline-terminated record and returns consumed bytes", async () => {
    const lines = [
      JSON.stringify({ event: "runtime.started", timestamp: "2026-05-18T00:00:00Z" }),
      JSON.stringify({ event: "codex.turn.completed", timestamp: "2026-05-18T00:00:01Z" }),
    ];
    const content = lines.join("\n") + "\n";
    await writeFile(FILE, content, "utf-8");
    const events: RunEvent[] = [];
    const offset = await readExistingEvents(FILE, (e) => events.push(e));
    expect(events.map((e) => e.kind)).toEqual(["runtime.started", "codex.turn.completed"]);
    expect(offset).toBe(Buffer.byteLength(content, "utf-8"));
  });

  test("respects maxBacklog limit on prior history", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => JSON.stringify({ event: `e-${i}`, timestamp: "t" }));
    await writeFile(FILE, lines.join("\n") + "\n", "utf-8");
    const events: RunEvent[] = [];
    await readExistingEvents(FILE, (e) => events.push(e), { maxBacklog: 3 });
    expect(events.map((e) => e.kind)).toEqual(["e-7", "e-8", "e-9"]);
  });
});

describe("tui/run-events tailRunEvents", () => {
  test("emits only new records appended after initialOffset", async () => {
    const first = JSON.stringify({ event: "first" }) + "\n";
    await writeFile(FILE, first, "utf-8");

    const events: RunEvent[] = [];
    const controller = await tailRunEvents(FILE, (e) => events.push(e), Buffer.byteLength(first, "utf-8"));

    // Append two more lines, give the watcher a moment.
    await appendFile(FILE, JSON.stringify({ event: "second" }) + "\n");
    await appendFile(FILE, JSON.stringify({ event: "third" }) + "\n");
    await new Promise((r) => setTimeout(r, 80));

    await controller.close();

    expect(events.map((e) => e.kind)).toEqual(["second", "third"]);
  });

  test("ignores partial trailing lines and resumes when newline arrives", async () => {
    await writeFile(FILE, "", "utf-8");
    const events: RunEvent[] = [];
    const controller = await tailRunEvents(FILE, (e) => events.push(e), 0);

    await appendFile(FILE, JSON.stringify({ event: "complete" }) + "\n");
    await appendFile(FILE, JSON.stringify({ event: "partial" })); // no newline
    await new Promise((r) => setTimeout(r, 80));
    expect(events.map((e) => e.kind)).toEqual(["complete"]);

    await appendFile(FILE, "\n");
    await new Promise((r) => setTimeout(r, 80));

    await controller.close();
    expect(events.map((e) => e.kind)).toEqual(["complete", "partial"]);
  });
});
