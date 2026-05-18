/**
 * UH-46 — reactive state layer.
 *
 * Wraps `loadDashboardSnapshot` (model layer) in Solid signals and
 * watches the `.harness/` tree with `fs.watch`. Re-fetches on filesystem
 * events with a 200 ms debounce, so a burst of mtime touches collapses
 * into a single snapshot load.
 *
 * Also exposes per-pane selection signals and an adapter-check cache
 * (one-in-flight cap, 5 s TTL) that powers the dashboard's A+ footer
 * preview line per UH-46 grill Q5.
 *
 * Lifecycle contract (docs/research/tui-framework.md §6):
 *   - `dispose()` MUST close every watcher and clear the pending debounce
 *     timer. It is safe to call multiple times.
 *   - The renderer-destroy hook in `<Dashboard>` is what calls
 *     `dispose()`; this file does not subscribe to `renderer.on(...)`.
 */
import { watch, type FSWatcher } from "node:fs";
import { createRoot, createSignal, type Accessor } from "solid-js";
import {
  adaptersDir,
  missionsDir,
  sandboxesDir,
} from "../harness/paths.js";
import {
  loadDashboardSnapshot,
  type DashboardSnapshot,
  type AdapterRow,
  type MissionRow,
  type SandboxRow,
} from "./model.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
} from "../harness/registry.js";

export const DEBOUNCE_MS = 200;
export const ADAPTER_CHECK_TTL_MS = 5_000;
export const WATCHER_WARN_TTL_MS = 5_000;

type WatcherHandle = { close: () => void };

/** Test seam: factory for filesystem watchers. Defaults to `fs.watch`. */
export type WatcherFactory = (
  target: string,
  onEvent: () => void,
  onError: (err: Error) => void,
) => WatcherHandle | null;

/** Test seam: per-id adapter availability check. Defaults to `runtimeRegistry.check`. */
export type AdapterChecker = (root: string, id: string) => Promise<AdapterCheckResult>;

export interface DashboardStateOptions {
  watcherFactory?: WatcherFactory;
  debounceMs?: number;
  loader?: (root: string) => Promise<DashboardSnapshot>;
  /** Test seam for adapter availability checks. */
  adapterChecker?: AdapterChecker;
  /** Override TTL for cached adapter-check results. */
  adapterCheckTtlMs?: number;
  /** Override TTL for the sticky watcher-warning footer line. */
  watcherWarnTtlMs?: number;
  /** Inject a clock for deterministic TTL tests. */
  now?: () => number;
}

export interface DashboardState {
  snapshot: Accessor<DashboardSnapshot>;
  isLoading: Accessor<boolean>;
  error: Accessor<Error | null>;
  /** Sticky warning (auto-clears after WATCHER_WARN_TTL_MS). */
  watcherWarning: Accessor<string | null>;

  selectedAdapter: Accessor<AdapterRow | null>;
  selectedMission: Accessor<MissionRow | null>;
  selectedSandbox: Accessor<SandboxRow | null>;
  selectAdapter: (row: AdapterRow | null) => void;
  selectMission: (row: MissionRow | null) => void;
  selectSandbox: (row: SandboxRow | null) => void;

  /** Last adapter-check result for `id`, or null when none is cached. */
  adapterCheck: (id: string) => AdapterCheckResult | null;
  /** Trigger a check for `id`. No-op when an in-flight call is pending or the cache is warm. */
  refreshAdapterCheck: (id: string) => Promise<AdapterCheckResult | null>;

  /** Force a fresh load now (e.g. wired to `r` keybinding). */
  refresh: () => Promise<void>;
  /** Close watchers, clear timers, dispose Solid root. Idempotent. */
  dispose: () => void;
}

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  harness: { initialized: false, projectName: "" },
  adapters: [],
  missions: [],
  sandboxes: [],
  capturedAt: new Date(0).toISOString(),
};

function defaultWatcher(
  target: string,
  onEvent: () => void,
  onError: (err: Error) => void,
): WatcherHandle | null {
  try {
    const w: FSWatcher = watch(target, { persistent: false }, () => onEvent());
    w.on("error", (err) => onError(err instanceof Error ? err : new Error(String(err))));
    return { close: () => w.close() };
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
    return null;
  }
}

/**
 * Create the dashboard reactive state. Fetches a snapshot immediately,
 * starts watchers on the three `.harness/` subtrees, and exposes
 * Solid accessors for the view layer.
 */
export function createDashboardState(
  root: string,
  options: DashboardStateOptions = {},
): DashboardState {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const watcherFactory = options.watcherFactory ?? defaultWatcher;
  const loader = options.loader ?? loadDashboardSnapshot;
  const adapterChecker = options.adapterChecker
    ?? ((r: string, id: string) => runtimeRegistry.check(r, id));
  const checkTtlMs = options.adapterCheckTtlMs ?? ADAPTER_CHECK_TTL_MS;
  const warnTtlMs = options.watcherWarnTtlMs ?? WATCHER_WARN_TTL_MS;
  const now = options.now ?? (() => Date.now());

  let disposed = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let warnTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let loadQueued = false;
  const watchers: WatcherHandle[] = [];
  const missionWatchers: WatcherHandle[] = [];
  let rootDispose: () => void = () => {};

  // Adapter check cache. One entry per adapter id; in-flight promise
  // captures the single-pending-check rule.
  interface CheckCacheEntry {
    result: AdapterCheckResult | null;
    expiresAt: number;
    inFlight: Promise<AdapterCheckResult | null> | null;
  }
  const checkCache = new Map<string, CheckCacheEntry>();

  const targets = [
    adaptersDir(root),
    missionsDir(root),
    sandboxesDir(root),
  ];

  const state = createRoot((dispose) => {
    rootDispose = dispose;
    const [snapshot, setSnapshot] = createSignal<DashboardSnapshot>(EMPTY_SNAPSHOT);
    const [isLoading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<Error | null>(null);
    const [watcherWarning, setWatcherWarning] = createSignal<string | null>(null);
    const [selectedAdapter, setSelectedAdapter] = createSignal<AdapterRow | null>(null);
    const [selectedMission, setSelectedMission] = createSignal<MissionRow | null>(null);
    const [selectedSandbox, setSelectedSandbox] = createSignal<SandboxRow | null>(null);
    // Tick counter that bumps whenever adapterCheck cache changes, so
    // Solid views reading `adapterCheck(id)` re-evaluate.
    const [checkTick, setCheckTick] = createSignal(0);

    const noteWatcherError = (err: Error): void => {
      if (disposed) return;
      setWatcherWarning(`fs.watch: ${err.message} (press r to refresh)`);
      if (warnTimer) clearTimeout(warnTimer);
      warnTimer = setTimeout(() => {
        warnTimer = null;
        if (!disposed) setWatcherWarning(null);
      }, warnTtlMs);
    };

    const closeMissionWatchers = (): void => {
      for (const w of missionWatchers) {
        try { w.close(); } catch { /* already closed */ }
      }
      missionWatchers.length = 0;
    };

    const installMissionWatchers = (next: DashboardSnapshot): void => {
      closeMissionWatchers();
      for (const mission of next.missions) {
        const handle = watcherFactory(mission.missionDir, scheduleLoad, noteWatcherError);
        if (handle) missionWatchers.push(handle);
      }
    };

    const performLoad = async (): Promise<void> => {
      if (disposed) return;
      setLoading(true);
      try {
        const next = await loader(root);
        if (disposed) return;
        setSnapshot(next);
        installMissionWatchers(next);
        setError(null);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    const runLoad = (): Promise<void> => {
      inFlight = performLoad().finally(() => {
        inFlight = null;
        if (!disposed && loadQueued) {
          loadQueued = false;
          return runLoad();
        }
      });
      return inFlight;
    };

    const scheduleLoad = (): void => {
      if (disposed) return;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (inFlight) {
          loadQueued = true;
          return;
        }
        void runLoad();
      }, debounceMs);
    };

    void runLoad();

    for (const target of targets) {
      const handle = watcherFactory(target, scheduleLoad, noteWatcherError);
      if (handle) watchers.push(handle);
    }

    const refresh = async (): Promise<void> => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (inFlight) {
        await inFlight;
      }
      await runLoad();
    };

    const adapterCheck = (id: string): AdapterCheckResult | null => {
      // Touch the tick so callers re-evaluate when the cache mutates.
      void checkTick();
      const entry = checkCache.get(id);
      return entry?.result ?? null;
    };

    const refreshAdapterCheck = async (id: string): Promise<AdapterCheckResult | null> => {
      if (disposed) return null;
      const existing = checkCache.get(id);
      if (existing?.inFlight) {
        return existing.inFlight;
      }
      if (existing && existing.result && existing.expiresAt > now()) {
        return existing.result;
      }
      const promise = (async (): Promise<AdapterCheckResult | null> => {
        try {
          const result = await adapterChecker(root, id);
          if (disposed) return null;
          checkCache.set(id, {
            result,
            expiresAt: now() + checkTtlMs,
            inFlight: null,
          });
          setCheckTick((n) => n + 1);
          return result;
        } catch (err) {
          if (disposed) return null;
          const errorResult: AdapterCheckResult = {
            runtime: id,
            found: false,
            version: "",
            errors: [(err as Error).message],
          };
          checkCache.set(id, {
            result: errorResult,
            expiresAt: now() + checkTtlMs,
            inFlight: null,
          });
          setCheckTick((n) => n + 1);
          return errorResult;
        }
      })();
      checkCache.set(id, {
        result: existing?.result ?? null,
        expiresAt: existing?.expiresAt ?? 0,
        inFlight: promise,
      });
      return promise;
    };

    return {
      snapshot,
      isLoading,
      error,
      watcherWarning,
      selectedAdapter,
      selectedMission,
      selectedSandbox,
      selectAdapter: setSelectedAdapter,
      selectMission: setSelectedMission,
      selectSandbox: setSelectedSandbox,
      adapterCheck,
      refreshAdapterCheck,
      refresh,
    };
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (warnTimer) {
      clearTimeout(warnTimer);
      warnTimer = null;
    }
    for (const w of watchers) {
      try { w.close(); } catch { /* already closed */ }
    }
    watchers.length = 0;
    for (const w of missionWatchers) {
      try { w.close(); } catch { /* already closed */ }
    }
    missionWatchers.length = 0;
    checkCache.clear();
    rootDispose();
  };

  return { ...state, dispose };
}
