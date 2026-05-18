/**
 * UH-44 — `events.ndjson` live tail reader.
 *
 * Pure async TypeScript with injected `fs` seams so tests can drive the
 * reader against synthetic file contents without touching disk. Used by
 * `state.ts` to render a live run view; adapters already append-only
 * write `events.ndjson` line-by-line during a mission run.
 */
import { open, stat, type FileHandle } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";

/** One parsed `events.ndjson` row. `raw` is the original line for debugging. */
export interface RunEvent {
  /** Best-effort timestamp; falls back to receive-time when absent or invalid. */
  timestamp: string;
  /** Event kind extracted from `event` / `kind` / `type` (in that order). */
  kind: string;
  /** Full parsed record. */
  record: Record<string, unknown>;
  /** Raw JSON line, useful when parsing fails to mid-line garbage. */
  raw: string;
}

export interface TailEventsOptions {
  /** Inject fs primitives for tests. Defaults to node:fs/promises + node:fs. */
  fs?: {
    open: typeof open;
    stat: typeof stat;
    watch: typeof watch;
  };
  /** Replay-from-start cap. Defaults to 200 lines so reopens stay snappy. */
  maxBacklog?: number;
}

export interface TailEventsController {
  /** Stop watching, close the open file handle. Idempotent. */
  close: () => Promise<void>;
}

const DEFAULT_FS = { open, stat, watch };
const DEFAULT_MAX_BACKLOG = 200;

function eventKind(record: Record<string, unknown>): string {
  for (const key of ["event", "kind", "type"]) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "unknown";
}

function eventTimestamp(record: Record<string, unknown>): string {
  for (const key of ["timestamp", "ts", "time", "at"]) {
    const v = record[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return new Date().toISOString();
}

export function parseEventLine(raw: string): RunEvent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { timestamp: new Date().toISOString(), kind: "parse-error", record: { raw: trimmed }, raw: trimmed };
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  return {
    timestamp: eventTimestamp(record),
    kind: eventKind(record),
    record,
    raw: trimmed,
  };
}

/**
 * Read the current contents of `path` and report every newline-terminated
 * record via `onEvent`. Returns the number of bytes consumed; useful as
 * the initial offset for a subsequent live tail.
 */
export async function readExistingEvents(
  path: string,
  onEvent: (event: RunEvent) => void,
  options: TailEventsOptions = {},
): Promise<number> {
  const fs = options.fs ?? DEFAULT_FS;
  const limit = options.maxBacklog ?? DEFAULT_MAX_BACKLOG;
  let handle: FileHandle | null = null;
  try {
    handle = await fs.open(path, "r");
  } catch {
    return 0;
  }
  try {
    const info = await handle.stat();
    if (info.size === 0) return 0;
    const buf = Buffer.alloc(info.size);
    await handle.read(buf, 0, info.size, 0);
    const lines = buf.toString("utf-8").split("\n");
    // Last entry is either trailing empty (after final \n) or a partial line.
    const complete = lines.slice(0, -1);
    const tail = complete.slice(Math.max(complete.length - limit, 0));
    for (const line of tail) {
      const event = parseEventLine(line);
      if (event) onEvent(event);
    }
    // Bytes consumed = up to and including the last \n we processed.
    if (complete.length === 0) return 0;
    const consumed = complete.reduce((acc, l) => acc + Buffer.byteLength(l, "utf-8") + 1, 0);
    return consumed;
  } finally {
    await handle.close();
  }
}

/**
 * Watch `path` for new appended lines. Calls `onEvent` once per complete
 * newline-terminated record discovered after `initialOffset` bytes.
 *
 * The watcher tolerates the file not yet existing — it polls via fs.watch
 * on the parent directory until the first event delivery. Returns a
 * controller whose `close()` halts further notifications.
 */
export async function tailRunEvents(
  path: string,
  onEvent: (event: RunEvent) => void,
  initialOffset = 0,
  options: TailEventsOptions = {},
): Promise<TailEventsController> {
  const fs = options.fs ?? DEFAULT_FS;
  let offset = initialOffset;
  let closed = false;
  let pending: Promise<void> = Promise.resolve();
  let watcher: FSWatcher | null = null;
  let pendingScheduled = false;

  const drain = async (): Promise<void> => {
    if (closed) return;
    if (pendingScheduled) return; // collapse bursts; drain reads everything new in one pass
    pendingScheduled = true;
    pending = pending.finally(async () => {
      pendingScheduled = false;
      if (closed) return;
      let handle: FileHandle | null = null;
      try {
        handle = await fs.open(path, "r");
      } catch {
        return;
      }
      try {
        const info = await handle.stat();
        if (info.size <= offset) return;
        const delta = info.size - offset;
        const buf = Buffer.alloc(delta);
        await handle.read(buf, 0, delta, offset);
        const text = buf.toString("utf-8");
        // Process complete lines only; carry partial tail forward via offset arithmetic.
        const lastNl = text.lastIndexOf("\n");
        if (lastNl === -1) return;
        const complete = text.slice(0, lastNl);
        for (const line of complete.split("\n")) {
          if (closed) return;
          const event = parseEventLine(line);
          if (event) onEvent(event);
        }
        offset += Buffer.byteLength(complete, "utf-8") + 1; // include the trailing \n
      } finally {
        await handle.close();
      }
    });
    await pending;
  };

  try {
    watcher = fs.watch(path, { persistent: false }, () => {
      void drain();
    });
  } catch {
    // file may not exist yet — caller can retry on its own loop; nothing to watch here.
    watcher = null;
  }

  // Drain once at start so callers see existing lines past offset immediately.
  await drain();

  return {
    close: async () => {
      if (closed) return;
      closed = true;
      if (watcher) {
        try { watcher.close(); } catch { /* already closed */ }
        watcher = null;
      }
      await pending;
    },
  };
}
