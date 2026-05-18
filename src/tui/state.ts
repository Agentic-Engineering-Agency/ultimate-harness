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
import { createRoot, createSignal, createEffect, on, type Accessor } from "solid-js";
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
  type MissionDetail,
  loadMissionDetail,
} from "./model.js";
import {
  runtimeRegistry,
  type AdapterCheckResult,
} from "../harness/registry.js";
import type { RunEvent } from "./run-events.js";
import type { RunOutcome, RunRuntime } from "./run-orchestrator.js";
import { createDefaultRunStarter, type RunSession, type RunStarter } from "./run-session.js";
import { createSandbox as defaultCreateSandbox, discardSandbox as defaultDiscardSandbox, type CreateSandboxOptions, type DiscardSandboxOptions, type SandboxRecord, type DiscardSandboxResult } from "../harness/sandbox.js";
import { createFilePersistenceStore, type PersistedProjectState, type PersistenceStore } from "./persistence.js";

export const DEBOUNCE_MS = 200;
export const ADAPTER_CHECK_TTL_MS = 5_000;
export const WATCHER_WARN_TTL_MS = 5_000;
export const RUN_EVENTS_HISTORY_CAP = 500;
export const RUN_RUNTIMES: RunRuntime[] = ["hermes", "codex", "oh-my-pi", "hermes-proxy"];

type WatcherHandle = { close: () => void };

/** Test seam: factory for filesystem watchers. Defaults to `fs.watch`. */
export type WatcherFactory = (
  target: string,
  onEvent: () => void,
  onError: (err: Error) => void,
) => WatcherHandle | null;

/** Test seam: per-id adapter availability check. Defaults to `runtimeRegistry.check`. */
export type AdapterChecker = (root: string, id: string) => Promise<AdapterCheckResult>;

/** Test seam: injected sandbox lifecycle ops. */
export interface SandboxOps {
  create: (root: string, opts: CreateSandboxOptions) => Promise<SandboxRecord>;
  discard: (root: string, id: string, opts?: DiscardSandboxOptions) => Promise<DiscardSandboxResult>;
}

export type RunStatus = "idle" | "running" | "succeeded" | "failed" | "cancelled" | "error";
export type SandboxAction = "idle" | "creating" | "discarding" | "created" | "discarded" | "error";

export interface DashboardStateOptions {
  watcherFactory?: WatcherFactory;
  debounceMs?: number;
  loader?: (root: string) => Promise<DashboardSnapshot>;
  /** Test seam for adapter availability checks. */
  adapterChecker?: AdapterChecker;
  /** Test seam for mission detail artifact loading. */
  missionDetailLoader?: (mission: MissionRow) => Promise<MissionDetail>;
  /** Override TTL for cached adapter-check results. */
  adapterCheckTtlMs?: number;
  /** Override TTL for the sticky watcher-warning footer line. */
  watcherWarnTtlMs?: number;
  /** Inject a clock for deterministic TTL tests. */
  now?: () => number;
  /** Test seam for run subprocess + event tail. */
  runStarter?: RunStarter;
  /** Cap on retained live event history. Defaults to RUN_EVENTS_HISTORY_CAP. */
  runEventsHistoryCap?: number;
  /** Test seam for sandbox create/discard ops. Defaults to harness/sandbox.ts. */
  sandboxOps?: SandboxOps;
  /** Persistence store for per-project TUI state (focus, last selections). */
  persistenceStore?: PersistenceStore | null;
  /** Debounce window for save-after-selection writes; 0 disables debouncing in tests. */
  persistenceDebounceMs?: number;
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
  activeView: Accessor<"dashboard" | "missionDetail">;
  selectedMissionArtifactIndex: Accessor<number>;
  missionDetail: Accessor<MissionDetail | null>;
  isMissionDetailLoading: Accessor<boolean>;
  missionDetailError: Accessor<Error | null>;
  overlayOpen: Accessor<boolean>;
  runStatus: Accessor<RunStatus>;
  runEvents: Accessor<RunEvent[]>;
  runMissionId: Accessor<string | null>;
  runStartedAt: Accessor<string | null>;
  runFinishedAt: Accessor<string | null>;
  runError: Accessor<Error | null>;
  runDialogOpen: Accessor<boolean>;
  runDialogRuntime: Accessor<RunRuntime>;
  runDialogNoSandbox: Accessor<boolean>;
  sandboxAction: Accessor<SandboxAction>;
  sandboxActionError: Accessor<Error | null>;
  createSandboxDialogOpen: Accessor<boolean>;
  createSandboxId: Accessor<string>;
  createSandboxMissionId: Accessor<string>;
  createSandboxBaseRef: Accessor<string>;
  discardSandboxConfirmOpen: Accessor<boolean>;
  discardSandboxForce: Accessor<boolean>;
  selectAdapter: (row: AdapterRow | null) => void;
  selectMission: (row: MissionRow | null) => void;
  selectSandbox: (row: SandboxRow | null) => void;

  /** Last adapter-check result for `id`, or null when none is cached. */
  adapterCheck: (id: string) => AdapterCheckResult | null;
  /** Trigger a check for `id`. No-op when an in-flight call is pending or the cache is warm. */
  refreshAdapterCheck: (id: string) => Promise<AdapterCheckResult | null>;
  openSelectedMission: () => Promise<MissionDetail | null>;
  /** Age in milliseconds for the last adapter-check result, or null when none exists. */
  adapterCheckAgeMs: (id: string) => number | null;
  closeMissionDetail: () => void;
  selectMissionArtifactIndex: (index: number) => void;
  moveMissionArtifactSelection: (delta: number) => void;
  toggleOverlay: () => void;
  closeOverlay: () => void;
  openOverlay: () => void;
  openRunDialog: () => void;
  closeRunDialog: () => void;
  setRunDialogRuntime: (runtime: RunRuntime) => void;
  toggleRunDialogNoSandbox: () => void;
  startMissionRun: () => Promise<void>;
  stopMissionRun: () => void;
  clearRunHistory: () => void;
  forceCheckAdapter: (id: string) => Promise<AdapterCheckResult | null>;
  openCreateSandboxDialog: () => void;
  closeCreateSandboxDialog: () => void;
  setCreateSandboxId: (id: string) => void;
  setCreateSandboxMissionId: (missionId: string) => void;
  setCreateSandboxBaseRef: (ref: string) => void;
  submitCreateSandbox: () => Promise<void>;
  openDiscardSandboxConfirm: () => void;
  closeDiscardSandboxConfirm: () => void;
  toggleDiscardSandboxForce: () => void;
  submitDiscardSandbox: () => Promise<void>;
  clearSandboxAction: () => void;

  /** Force a fresh load now (e.g. wired to `r` keybinding). */
  refresh: () => Promise<void>;
  /** Close watchers, clear timers, dispose Solid root. Idempotent. */
  dispose: () => Promise<void>;
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
  const missionDetailLoader = options.missionDetailLoader ?? loadMissionDetail;
  const checkTtlMs = options.adapterCheckTtlMs ?? ADAPTER_CHECK_TTL_MS;
  const warnTtlMs = options.watcherWarnTtlMs ?? WATCHER_WARN_TTL_MS;
  const now = options.now ?? (() => Date.now());
  const runStarter = options.runStarter ?? createDefaultRunStarter();
  const runHistoryCap = options.runEventsHistoryCap ?? RUN_EVENTS_HISTORY_CAP;
  let currentRunSession: RunSession | null = null;
  let runRequestId = 0;
  const sandboxOps: SandboxOps = options.sandboxOps ?? { create: defaultCreateSandbox, discard: defaultDiscardSandbox };
  let sandboxActionRequestId = 0;
  const persistenceStore: PersistenceStore | null = options.persistenceStore === null ? null : (options.persistenceStore ?? createFilePersistenceStore());
  const persistenceDebounceMs = options.persistenceDebounceMs ?? 250;
  let persistenceTimer: ReturnType<typeof setTimeout> | null = null;

  let disposed = false;
  let missionDetailRequestId = 0;
  let persistNow: (() => Promise<void>) | null = null;
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
    checkedAt: number;
    generation: number;
  }
  const checkCache = new Map<string, CheckCacheEntry>();
  let nextCheckGeneration = 0;

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
    const [activeView, setActiveView] = createSignal<"dashboard" | "missionDetail">("dashboard");
    const [selectedMissionArtifactIndex, setSelectedMissionArtifactIndex] = createSignal(0);
    const [missionDetail, setMissionDetail] = createSignal<MissionDetail | null>(null);
    const [isMissionDetailLoading, setMissionDetailLoading] = createSignal(false);
    const [missionDetailError, setMissionDetailError] = createSignal<Error | null>(null);
    const [overlayOpen, setOverlayOpen] = createSignal(false);
    const [runStatus, setRunStatus] = createSignal<RunStatus>("idle");
    const [runEvents, setRunEvents] = createSignal<RunEvent[]>([]);
    const [runMissionId, setRunMissionId] = createSignal<string | null>(null);
    const [runStartedAt, setRunStartedAt] = createSignal<string | null>(null);
    const [runFinishedAt, setRunFinishedAt] = createSignal<string | null>(null);
    const [runError, setRunError] = createSignal<Error | null>(null);
    const [runDialogOpen, setRunDialogOpen] = createSignal(false);
    const [runDialogRuntime, setRunDialogRuntime] = createSignal<RunRuntime>("hermes");
    const [runDialogNoSandbox, setRunDialogNoSandbox] = createSignal(false);
    const [sandboxAction, setSandboxAction] = createSignal<SandboxAction>("idle");
    const [sandboxActionError, setSandboxActionError] = createSignal<Error | null>(null);
    const [createSandboxDialogOpen, setCreateSandboxDialogOpen] = createSignal(false);
    const [createSandboxId, setCreateSandboxIdSignal] = createSignal("");
    const [createSandboxMissionId, setCreateSandboxMissionIdSignal] = createSignal("");
    const [createSandboxBaseRef, setCreateSandboxBaseRefSignal] = createSignal("");
    const [discardSandboxConfirmOpen, setDiscardSandboxConfirmOpen] = createSignal(false);
    const [discardSandboxForce, setDiscardSandboxForce] = createSignal(false);
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
        if (!persistenceHydrated) {
          await hydratePersistence(next);
        }
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
    // UH-42 persistence: hydrate selections after first snapshot, debounce-save on changes.
    let persistenceHydrated = persistenceStore === null;
    const computeRestorable = (target: PersistedProjectState | null): PersistedProjectState | null => target;
    const applyPersisted = (state: PersistedProjectState | null, next: DashboardSnapshot): void => {
      if (!state) return;
      if (state.activeView && state.activeView !== activeView()) {
        // Only restore activeView=dashboard automatically; missionDetail requires a loaded detail and is opt-in by Enter.
        if (state.activeView === "dashboard") setActiveView("dashboard");
      }
      if (state.selectedAdapterId) {
        const row = next.adapters.find((r) => r.id === state.selectedAdapterId);
        if (row) setSelectedAdapter(row);
      }
      if (state.selectedMissionId) {
        const row = next.missions.find((r) => r.id === state.selectedMissionId);
        if (row) setSelectedMission(row);
      }
      if (state.selectedSandboxId) {
        const row = next.sandboxes.find((r) => r.id === state.selectedSandboxId);
        if (row) setSelectedSandbox(row);
      }
    };
    const hydratePersistence = async (next: DashboardSnapshot): Promise<void> => {
      if (persistenceHydrated || !persistenceStore) return;
      persistenceHydrated = true;
      try {
        const persisted = await persistenceStore.load(root);
        if (disposed) return;
        applyPersisted(computeRestorable(persisted), next);
      } catch {
        // persistence is advisory; failures are non-fatal.
      }
    };
    createEffect(on(snapshot, (next) => {
      if (next.capturedAt !== EMPTY_SNAPSHOT.capturedAt) {
        void hydratePersistence(next);
      }
    }));
    persistNow = async (): Promise<void> => {
      if (!persistenceStore) return;
      try {
        await persistenceStore.save(root, {
          activeView: activeView(),
          selectedAdapterId: selectedAdapter()?.id,
          selectedMissionId: selectedMission()?.id,
          selectedSandboxId: selectedSandbox()?.id,
        });
      } catch {
        // ignore — advisory save.
      }
    };
    const schedulePersist = (): void => {
      if (!persistenceStore || disposed) return;
      if (persistenceDebounceMs <= 0) {
        if (persistNow) void persistNow();
        return;
      }
      if (persistenceTimer) clearTimeout(persistenceTimer);
      persistenceTimer = setTimeout(() => {
        persistenceTimer = null;
        if (!disposed && persistNow) void persistNow();
      }, persistenceDebounceMs);
    };
    createEffect(on([selectedAdapter, selectedMission, selectedSandbox, activeView], () => {
      if (persistenceHydrated) schedulePersist();
    }, { defer: true }));

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

    const adapterCheckAgeMs = (id: string): number | null => {
      void checkTick();
      const entry = checkCache.get(id);
      if (!entry?.result) return null;
      return Math.max(0, now() - entry.checkedAt);
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
      const generation = ++nextCheckGeneration;
      const promise = (async (): Promise<AdapterCheckResult | null> => {
        try {
          const result = await adapterChecker(root, id);
          if (disposed) return null;
          const current = checkCache.get(id);
          if (current && current.generation > generation) return result;
          checkCache.set(id, {
            result,
            expiresAt: now() + checkTtlMs,
            inFlight: null,
            checkedAt: now(),
            generation,
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
          const current = checkCache.get(id);
          if (current && current.generation > generation) return errorResult;
          checkCache.set(id, {
            result: errorResult,
            expiresAt: now() + checkTtlMs,
            inFlight: null,
            checkedAt: now(),
            generation,
          });
          setCheckTick((n) => n + 1);
          return errorResult;
        }
      })();
      checkCache.set(id, {
        result: existing?.result ?? null,
        expiresAt: existing?.expiresAt ?? 0,
        inFlight: promise,
        checkedAt: existing?.checkedAt ?? 0,
        generation,
      });
      return promise;
    };

    const clampMissionArtifactIndex = (index: number): number => {
      const detail = missionDetail();
      const max = detail ? detail.artifacts.length - 1 : 0;
      return Math.min(Math.max(index, 0), Math.max(max, 0));
    };

    const selectMissionArtifactIndex = (index: number): void => {
      setSelectedMissionArtifactIndex(clampMissionArtifactIndex(index));
    };

    const moveMissionArtifactSelection = (delta: number): void => {
      setSelectedMissionArtifactIndex((current) => clampMissionArtifactIndex(current + delta));
    };

    const forceCheckAdapter = async (id: string): Promise<AdapterCheckResult | null> => {
      checkCache.delete(id);
      setCheckTick((n) => n + 1);
      return refreshAdapterCheck(id);
    };

    const openCreateSandboxDialog = (): void => {
      if (disposed) return;
      setCreateSandboxIdSignal("");
      setCreateSandboxBaseRefSignal("");
      setCreateSandboxMissionIdSignal(selectedMission()?.id ?? "");
      setCreateSandboxDialogOpen(true);
    };

    const closeCreateSandboxDialog = (): void => {
      setCreateSandboxDialogOpen(false);
    };

    const setCreateSandboxId = (id: string): void => {
      setCreateSandboxIdSignal(id);
    };

    const setCreateSandboxMissionId = (id: string): void => {
      setCreateSandboxMissionIdSignal(id);
    };

    const setCreateSandboxBaseRef = (ref: string): void => {
      setCreateSandboxBaseRefSignal(ref);
    };

    const submitCreateSandbox = async (): Promise<void> => {
      if (disposed) return;
      if (sandboxAction() === "creating" || sandboxAction() === "discarding") return;
      const id = createSandboxId().trim();
      const missionId = createSandboxMissionId().trim();
      if (id.length === 0 || missionId.length === 0) {
        setSandboxActionError(new Error("id and missionId required"));
        setSandboxAction("error");
        return;
      }
      const requestId = ++sandboxActionRequestId;
      setSandboxAction("creating");
      setSandboxActionError(null);
      try {
        const baseRef = createSandboxBaseRef().trim();
        await sandboxOps.create(root, { id, missionId, baseRef: baseRef.length > 0 ? baseRef : undefined });
        if (disposed || requestId !== sandboxActionRequestId) return;
        setSandboxAction("created");
        setCreateSandboxDialogOpen(false);
        void refresh();
      } catch (err) {
        if (disposed || requestId !== sandboxActionRequestId) return;
        setSandboxActionError(err instanceof Error ? err : new Error(String(err)));
        setSandboxAction("error");
      }
    };

    const openDiscardSandboxConfirm = (): void => {
      if (disposed) return;
      if (!selectedSandbox()) return;
      setDiscardSandboxForce(false);
      setDiscardSandboxConfirmOpen(true);
    };

    const closeDiscardSandboxConfirm = (): void => {
      setDiscardSandboxConfirmOpen(false);
    };

    const toggleDiscardSandboxForce = (): void => {
      setDiscardSandboxForce((v) => !v);
    };

    const submitDiscardSandbox = async (): Promise<void> => {
      if (disposed) return;
      if (sandboxAction() === "creating" || sandboxAction() === "discarding") return;
      const sandbox = selectedSandbox();
      if (!sandbox) return;
      const requestId = ++sandboxActionRequestId;
      const force = discardSandboxForce();
      setSandboxAction("discarding");
      setSandboxActionError(null);
      try {
        await sandboxOps.discard(root, sandbox.id, { force });
        if (disposed || requestId !== sandboxActionRequestId) return;
        setSandboxAction("discarded");
        setDiscardSandboxConfirmOpen(false);
        setSelectedSandbox(null);
        void refresh();
      } catch (err) {
        if (disposed || requestId !== sandboxActionRequestId) return;
        setSandboxActionError(err instanceof Error ? err : new Error(String(err)));
        setSandboxAction("error");
      }
    };

    const clearSandboxAction = (): void => {
      setSandboxAction("idle");
      setSandboxActionError(null);
    };

        const pushRunEvent = (event: RunEvent): void => {
      if (disposed) return;
      setRunEvents((current) => {
        const next = current.length >= runHistoryCap
          ? [...current.slice(current.length - runHistoryCap + 1), event]
          : [...current, event];
        return next;
      });
    };

    const openRunDialog = (): void => {
      if (disposed) return;
      const mission = selectedMission();
      if (!mission) return;
      setRunDialogOpen(true);
    };

    const closeRunDialog = (): void => {
      setRunDialogOpen(false);
    };

    const setRunDialogRuntimeAction = (runtime: RunRuntime): void => {
      setRunDialogRuntime(runtime);
    };

    const toggleRunDialogNoSandboxAction = (): void => {
      setRunDialogNoSandbox((v) => !v);
    };

    const clearRunHistory = (): void => {
      setRunEvents([]);
      setRunMissionId(null);
      setRunStartedAt(null);
      setRunFinishedAt(null);
      setRunError(null);
      setRunStatus("idle");
    };

    const startMissionRun = async (): Promise<void> => {
      if (disposed) return;
      if (currentRunSession) return;
      const mission = selectedMission();
      if (!mission) {
        setRunError(new Error("No mission selected"));
        setRunStatus("error");
        return;
      }
      const requestId = ++runRequestId;
      setRunDialogOpen(false);
      setRunEvents([]);
      setRunMissionId(mission.id);
      setRunStartedAt(new Date(now()).toISOString());
      setRunFinishedAt(null);
      setRunError(null);
      setRunStatus("running");
      const missionPath = `${mission.missionDir}/mission.yaml`;
      let session: RunSession;
      try {
        session = await runStarter({
          missionPath,
          root,
          runtime: runDialogRuntime(),
          noSandbox: runDialogNoSandbox(),
          missionDir: mission.missionDir,
        }, pushRunEvent);
      } catch (err) {
        if (disposed || requestId !== runRequestId) return;
        setRunError(err instanceof Error ? err : new Error(String(err)));
        setRunStatus("error");
        setRunFinishedAt(new Date(now()).toISOString());
        return;
      }
      if (disposed || requestId !== runRequestId) {
        try { session.stop(); } catch { /* nothing */ }
        return;
      }
      currentRunSession = session;
      let outcome: RunOutcome;
      try {
        outcome = await session.exit;
      } catch (err) {
        if (disposed || requestId !== runRequestId) return;
        setRunError(err instanceof Error ? err : new Error(String(err)));
        setRunStatus("error");
        setRunFinishedAt(new Date(now()).toISOString());
        currentRunSession = null;
        return;
      }
      if (disposed || requestId !== runRequestId) return;
      currentRunSession = null;
      setRunFinishedAt(new Date(now()).toISOString());
      setRunStatus(outcome.status);
      void refresh();
    };

    const stopMissionRun = (): void => {
      if (!currentRunSession) return;
      try { currentRunSession.stop(); } catch { /* already gone */ }
    };

        const openSelectedMission = async (): Promise<MissionDetail | null> => {
      const mission = selectedMission();
      if (!mission || disposed) return null;
      const requestId = ++missionDetailRequestId;
      setActiveView("missionDetail");
      setMissionDetailLoading(true);
      setMissionDetailError(null);
      setSelectedMissionArtifactIndex(0);
      try {
        const detail = await missionDetailLoader(mission);
        if (disposed || requestId !== missionDetailRequestId) return null;
        setMissionDetail(detail);
        return detail;
      } catch (err) {
        if (!disposed && requestId === missionDetailRequestId) {
          setMissionDetail(null);
          setMissionDetailError(err instanceof Error ? err : new Error(String(err)));
        }
        return null;
      } finally {
        if (!disposed && requestId === missionDetailRequestId) setMissionDetailLoading(false);
      }
    };

    const closeMissionDetail = (): void => {
      missionDetailRequestId += 1;
      setActiveView("dashboard");
      setMissionDetail(null);
      setMissionDetailError(null);
      setMissionDetailLoading(false);
      setSelectedMissionArtifactIndex(0);
    };

    return {
      snapshot,
      isLoading,
      error,
      watcherWarning,
      selectedAdapter,
      selectedMission,
      selectedSandbox,
      activeView,
      selectedMissionArtifactIndex,
      missionDetail,
      isMissionDetailLoading,
      missionDetailError,
      overlayOpen,
      runStatus,
      runEvents,
      runMissionId,
      runStartedAt,
      runFinishedAt,
      runError,
      runDialogOpen,
      runDialogRuntime,
      runDialogNoSandbox,
      sandboxAction,
      sandboxActionError,
      createSandboxDialogOpen,
      createSandboxId,
      createSandboxMissionId,
      createSandboxBaseRef,
      discardSandboxConfirmOpen,
      discardSandboxForce,
      selectAdapter: (row: AdapterRow | null) => { setSelectedAdapter(row); schedulePersist(); },
      selectMission: (row: MissionRow | null) => { setSelectedMission(row); schedulePersist(); },
      selectSandbox: (row: SandboxRow | null) => { setSelectedSandbox(row); schedulePersist(); },
      adapterCheck,
      refreshAdapterCheck,
      adapterCheckAgeMs,
      openSelectedMission,
      closeMissionDetail,
      selectMissionArtifactIndex,
      moveMissionArtifactSelection,
      toggleOverlay: () => setOverlayOpen((v) => !v),
      closeOverlay: () => setOverlayOpen(false),
      openOverlay: () => setOverlayOpen(true),
      openRunDialog,
      closeRunDialog,
      setRunDialogRuntime: setRunDialogRuntimeAction,
      toggleRunDialogNoSandbox: toggleRunDialogNoSandboxAction,
      startMissionRun,
      stopMissionRun,
      clearRunHistory,
      forceCheckAdapter,
      openCreateSandboxDialog,
      closeCreateSandboxDialog,
      setCreateSandboxId,
      setCreateSandboxMissionId,
      setCreateSandboxBaseRef,
      submitCreateSandbox,
      openDiscardSandboxConfirm,
      closeDiscardSandboxConfirm,
      toggleDiscardSandboxForce,
      submitDiscardSandbox,
      clearSandboxAction,
      refresh,
    };
  });

  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (currentRunSession) {
      try { currentRunSession.stop(); } catch { /* nothing */ }
      currentRunSession = null;
    }
    if (warnTimer) {
      clearTimeout(warnTimer);
      warnTimer = null;
    }
    // Flush a pending persistence save before tearing the store down so a
    // selection made right before `q` survives the quit path.
    const hadPendingPersist = persistenceTimer !== null;
    if (persistenceTimer) {
      clearTimeout(persistenceTimer);
      persistenceTimer = null;
    }
    if (hadPendingPersist && persistNow) {
      try { await persistNow(); } catch { /* advisory */ }
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
