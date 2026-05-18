import { describe, test, expect } from "vitest";
import { createDashboardState } from "../src/tui/state.js";
import type { DashboardSnapshot, AdapterRow, MissionDetail, MissionRow } from "../src/tui/model.js";
import { createMemoryPersistenceStore } from "../src/tui/persistence.js";
import type { AdapterCheckResult } from "../src/harness/registry.js";

const FIXED_NOW = new Date("2026-05-18T00:00:00.000Z").toISOString();

function snap(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    harness: { initialized: true, projectName: "test" },
    adapters: [],
    missions: [],
    sandboxes: [],
    capturedAt: FIXED_NOW,
    ...overrides,
  };
}


function mission(id = "m-1"): MissionRow {
  return {
    id,
    name: `Mission ${id}`,
    workflow: "research-docs",
    updatedAt: FIXED_NOW,
    missionDir: `/fake-root/.harness/missions/${id}`,
    state: "valid",
  };
}

function detailFor(row: MissionRow): MissionDetail {
  return {
    mission: row,
    runtimeStatus: "succeeded",
    artifacts: [
      { id: "mission.yaml", label: "mission.yaml", path: `${row.missionDir}/mission.yaml`, kind: "yaml", exists: true, content: "id: m-1\n" },
      { id: "diff.patch", label: "diff.patch", path: `${row.missionDir}/diff.patch`, kind: "diff", exists: true, content: "diff --git a/a b/a\n" },
      { id: "events.ndjson", label: "events.ndjson", path: `${row.missionDir}/events.ndjson`, kind: "events", exists: false, content: "" },
    ],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("tui/state createDashboardState — snapshot lifecycle", () => {
  test("loads an initial snapshot", async () => {
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => {
        calls += 1;
        return snap({ capturedAt: `call-${calls}` });
      },
      debounceMs: 10,
    });
    await delay(5);
    expect(state.snapshot().capturedAt).toBe("call-1");
    expect(state.isLoading()).toBe(false);
    expect(state.error()).toBeNull();
    state.dispose();
  });

  test("debounces fs.watch bursts into a single re-load", async () => {
    let calls = 0;
    let fire: (() => void) | null = null;
    const state = createDashboardState("/fake-root", {
      watcherFactory: (_target, onEvent) => {
        if (!fire) fire = onEvent;
        return { close: () => {} };
      },
      loader: async () => {
        calls += 1;
        return snap({ capturedAt: `call-${calls}` });
      },
      debounceMs: 30,
    });
    await delay(10);
    expect(calls).toBe(1);

    fire!();
    fire!();
    fire!();
    fire!();
    fire!();
    await delay(60);
    expect(calls).toBe(2);
    state.dispose();
  });

  test("queues one follow-up load for events received during an in-flight snapshot", async () => {
    let calls = 0;
    let fire: (() => void) | null = null;
    let releaseFirst: (v: DashboardSnapshot) => void = () => {};
    const first = new Promise<DashboardSnapshot>((r) => { releaseFirst = r; });
    const state = createDashboardState("/fake-root", {
      watcherFactory: (_target, onEvent) => {
        if (!fire) fire = onEvent;
        return { close: () => {} };
      },
      loader: () => {
        calls += 1;
        return calls === 1 ? first : Promise.resolve(snap({ capturedAt: `call-${calls}` }));
      },
      debounceMs: 10,
    });

    expect(calls).toBe(1);
    fire!();
    await delay(25);
    expect(calls).toBe(1);

    releaseFirst(snap({ capturedAt: "call-1" }));
    await delay(25);
    expect(calls).toBe(2);
    expect(state.snapshot().capturedAt).toBe("call-2");
    state.dispose();
  });

  test("watches loaded mission directories as well as top-level harness dirs", async () => {
    const watched: string[] = [];
    const state = createDashboardState("/fake-root", {
      watcherFactory: (target) => {
        watched.push(target);
        return { close: () => {} };
      },
      loader: async () => snap({
        missions: [{
          id: "m-1",
          name: "Mission 1",
          workflow: "research-docs",
          updatedAt: FIXED_NOW,
          missionDir: "/fake-root/.harness/missions/m-1",
          state: "valid",
        }],
      }),
      debounceMs: 10,
    });
    await delay(10);
    expect(watched).toContain("/fake-root/.harness/missions/m-1");
    state.dispose();
  });

  test("refresh() bypasses the debounce", async () => {
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => {
        calls += 1;
        return snap({ capturedAt: `call-${calls}` });
      },
      debounceMs: 500,
    });
    await delay(10);
    expect(calls).toBe(1);
    await state.refresh();
    expect(calls).toBe(2);
    expect(state.snapshot().capturedAt).toBe("call-2");
    state.dispose();
  });

  test("captures loader errors into error() without crashing", async () => {
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => {
        throw new Error("boom");
      },
      debounceMs: 10,
    });
    await delay(10);
    expect(state.error()?.message).toBe("boom");
    expect(state.isLoading()).toBe(false);
    state.dispose();
  });

  test("dispose() closes every watcher and is idempotent", async () => {
    let closes = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => { closes += 1; } }),
      loader: async () => snap(),
      debounceMs: 10,
    });
    await delay(5);
    state.dispose();
    state.dispose();
    expect(closes).toBe(3);
  });

  test("dispose() prevents post-dispose loader writes from updating signals", async () => {
    let release: (v: DashboardSnapshot) => void = () => {};
    const pending = new Promise<DashboardSnapshot>((r) => { release = r; });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: () => pending,
      debounceMs: 10,
    });
    expect(state.snapshot().capturedAt).toBe(new Date(0).toISOString());
    state.dispose();
    release(snap({ capturedAt: "post-dispose" }));
    await delay(10);
    expect(state.snapshot().capturedAt).toBe(new Date(0).toISOString());
  });
});

describe("tui/state — selection signals", () => {
  test("selectAdapter / selectMission / selectSandbox round-trip rows through accessors", async () => {
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      debounceMs: 10,
    });
    await delay(5);
    const adapter: AdapterRow = { id: "codex", name: "Codex", status: "active", runtime: "codex", manifestPath: "/x" };
    state.selectAdapter(adapter);
    expect(state.selectedAdapter()).toEqual(adapter);
    state.selectAdapter(null);
    expect(state.selectedAdapter()).toBeNull();
    state.dispose();
  });
});

describe("tui/state — adapter check cache", () => {
  function okResult(version = "1.0.0"): AdapterCheckResult {
    return { runtime: "codex", found: true, version, errors: [] };
  }

  test("refreshAdapterCheck() calls the checker and caches the result", async () => {
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      adapterChecker: async () => {
        calls += 1;
        return okResult();
      },
      debounceMs: 10,
    });
    await delay(5);
    expect(state.adapterCheck("codex")).toBeNull();
    const result = await state.refreshAdapterCheck("codex");
    expect(result?.found).toBe(true);
    expect(state.adapterCheck("codex")?.version).toBe("1.0.0");
    expect(calls).toBe(1);
    state.dispose();
  });

  test("returns cached result inside TTL", async () => {
    let now = 1_000;
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      adapterChecker: async () => {
        calls += 1;
        return okResult();
      },
      adapterCheckTtlMs: 100,
      now: () => now,
      debounceMs: 10,
    });
    await delay(5);
    await state.refreshAdapterCheck("codex");
    expect(calls).toBe(1);
    now += 50;
    await state.refreshAdapterCheck("codex");
    expect(calls).toBe(1);
    now += 100;
    await state.refreshAdapterCheck("codex");
    expect(calls).toBe(2);
    state.dispose();
  });

  test("collapses concurrent calls into one in-flight check", async () => {
    let resolve!: (v: AdapterCheckResult) => void;
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      adapterChecker: () => {
        calls += 1;
        return new Promise<AdapterCheckResult>((r) => { resolve = r; });
      },
      debounceMs: 10,
    });
    await delay(5);
    const a = state.refreshAdapterCheck("codex");
    const b = state.refreshAdapterCheck("codex");
    const c = state.refreshAdapterCheck("codex");
    expect(calls).toBe(1);
    resolve(okResult("9.9.9"));
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra?.version).toBe("9.9.9");
    expect(rb?.version).toBe("9.9.9");
    expect(rc?.version).toBe("9.9.9");
    state.dispose();
  });

  test("captures checker errors into a fail-result without crashing", async () => {
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      adapterChecker: async () => {
        throw new Error("codex not on PATH");
      },
      debounceMs: 10,
    });
    await delay(5);
    const r = await state.refreshAdapterCheck("codex");
    expect(r?.found).toBe(false);
    expect(r?.errors[0]).toBe("codex not on PATH");
    state.dispose();
  });
});

describe("tui/state — watcher warnings", () => {
  test("noteWatcherError sets watcherWarning() and auto-clears after TTL", async () => {
    let onError!: (e: Error) => void;
    const state = createDashboardState("/fake-root", {
      watcherFactory: (_t, _e, fnError) => {
        if (!onError) onError = fnError;
        return { close: () => {} };
      },
      loader: async () => snap(),
      watcherWarnTtlMs: 30,
      debounceMs: 10,
    });
    await delay(5);
    expect(state.watcherWarning()).toBeNull();
    onError(new Error("EBADF"));
    expect(state.watcherWarning()).toMatch(/EBADF/);
    await delay(50);
    expect(state.watcherWarning()).toBeNull();
    state.dispose();
  });
});


describe("tui/state — mission detail navigation", () => {
  test("opens selected mission detail and resets artifact selection", async () => {
    const row = mission("m-open");
    let loaded: string[] = [];
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      missionDetailLoader: async (m) => {
        loaded.push(m.id);
        return detailFor(m);
      },
      debounceMs: 10,
    });

    await delay(5);
    state.selectMission(row);
    state.selectMissionArtifactIndex(2);
    const detail = await state.openSelectedMission();

    expect(loaded).toEqual(["m-open"]);
    expect(detail?.runtimeStatus).toBe("succeeded");
    expect(state.activeView()).toBe("missionDetail");
    expect(state.missionDetail()?.mission.id).toBe("m-open");
    expect(state.selectedMissionArtifactIndex()).toBe(0);
    expect(state.isMissionDetailLoading()).toBe(false);
    state.dispose();
  });

  test("clamps artifact navigation and returns to dashboard", async () => {
    const row = mission("m-nav");
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      missionDetailLoader: async (m) => detailFor(m),
      debounceMs: 10,
    });

    await delay(5);
    state.selectMission(row);
    await state.openSelectedMission();
    state.moveMissionArtifactSelection(99);
    expect(state.selectedMissionArtifactIndex()).toBe(2);
    state.moveMissionArtifactSelection(-99);
    expect(state.selectedMissionArtifactIndex()).toBe(0);

    state.closeMissionDetail();
    expect(state.activeView()).toBe("dashboard");
    expect(state.missionDetail()).toBeNull();
    expect(state.selectedMissionArtifactIndex()).toBe(0);
    state.dispose();
  });

  test("surfaces mission detail loader errors without leaving loading true", async () => {
    const row = mission("m-error");
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      missionDetailLoader: async () => {
        throw new Error("artifact read failed");
      },
      debounceMs: 10,
    });

    await delay(5);
    state.selectMission(row);
    const detail = await state.openSelectedMission();

    expect(detail).toBeNull();
    expect(state.activeView()).toBe("missionDetail");
    expect(state.missionDetailError()?.message).toBe("artifact read failed");
    expect(state.isMissionDetailLoading()).toBe(false);
    state.dispose();
  });

  test("ignores stale mission detail results after a later open", async () => {
    const first = mission("m-first");
    const second = mission("m-second");
    let releaseFirst!: (value: MissionDetail) => void;
    const firstLoad = new Promise<MissionDetail>((resolve) => { releaseFirst = resolve; });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [first, second] }),
      missionDetailLoader: async (m) => m.id === first.id ? firstLoad : detailFor(m),
      debounceMs: 10,
    });

    await delay(5);
    state.selectMission(first);
    const stale = state.openSelectedMission();
    state.selectMission(second);
    const latest = await state.openSelectedMission();
    releaseFirst(detailFor(first));
    const staleResult = await stale;

    expect(latest?.mission.id).toBe("m-second");
    expect(staleResult).toBeNull();
    expect(state.missionDetail()?.mission.id).toBe("m-second");
    expect(state.isMissionDetailLoading()).toBe(false);
    state.dispose();
  });
});


describe("tui/state — overlay", () => {
  test("toggleOverlay round-trips and closeOverlay forces false", async () => {
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      debounceMs: 10,
    });
    await delay(5);
    expect(state.overlayOpen()).toBe(false);
    state.toggleOverlay();
    expect(state.overlayOpen()).toBe(true);
    state.toggleOverlay();
    expect(state.overlayOpen()).toBe(false);
    state.openOverlay();
    expect(state.overlayOpen()).toBe(true);
    state.closeOverlay();
    expect(state.overlayOpen()).toBe(false);
    state.dispose();
  });

  test("overlay state is independent from mission detail navigation", async () => {
    const row = mission("m-overlay");
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      missionDetailLoader: async (m) => detailFor(m),
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(row);
    await state.openSelectedMission();
    state.openOverlay();
    expect(state.overlayOpen()).toBe(true);
    expect(state.activeView()).toBe("missionDetail");
    state.closeMissionDetail();
    expect(state.activeView()).toBe("dashboard");
    expect(state.overlayOpen()).toBe(true);
    state.dispose();
  });
});


describe("tui/state — mission run flow", () => {
  function fakeStarter(options: {
    onStart?: (req: { runtime: string; noSandbox?: boolean }) => void;
    emit?: (push: (event: any) => void) => void | Promise<void>;
    outcome?: "succeeded" | "failed" | "cancelled";
    code?: number;
    spawnError?: Error;
    autoExit?: boolean;
  } = {}) {
    return {
      stopCalls: 0,
      starts: 0,
      async start(req: any, onEvent: any) {
        this.starts += 1;
        options.onStart?.(req);
        if (options.spawnError) throw options.spawnError;
        await options.emit?.(onEvent);
        let resolveExit!: (v: any) => void;
        const exit = new Promise<any>((r) => { resolveExit = r; });
        if (options.autoExit !== false) {
          setTimeout(() => resolveExit({ status: options.outcome ?? "succeeded", code: options.code ?? 0 }), 10);
        }
        return {
          pid: 12345,
          exit,
          stop: () => {
            this.stopCalls += 1;
            resolveExit({ status: "cancelled", signal: "SIGTERM" });
          },
        };
      },
    };
  }

  test("runs selected mission through to succeeded", async () => {
    const row = mission("m-run");
    const starter = fakeStarter({
      emit: (push) => {
        push({ timestamp: "t1", kind: "runtime.started", record: {}, raw: "" });
        push({ timestamp: "t2", kind: "runtime.finished", record: {}, raw: "" });
      },
      outcome: "succeeded",
    });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      missionDetailLoader: async (m) => detailFor(m),
      runStarter: (req, push) => starter.start(req, push),
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(row);
    state.setRunDialogRuntime("codex");
    state.toggleRunDialogNoSandbox();
    await state.startMissionRun();
    expect(state.runStatus()).toBe("succeeded");
    expect(state.runEvents().map((e) => e.kind)).toEqual(["runtime.started", "runtime.finished"]);
    expect(state.runMissionId()).toBe("m-run");
    expect(state.runFinishedAt()).not.toBeNull();
    expect(starter.starts).toBe(1);
    state.dispose();
  });

  test("stop sends SIGTERM and marks status cancelled", async () => {
    const row = mission("m-stop");
    const starter = fakeStarter({ autoExit: false });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      runStarter: (req, push) => starter.start(req, push),
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(row);
    const run = state.startMissionRun();
    await delay(15);
    expect(state.runStatus()).toBe("running");
    state.stopMissionRun();
    await run;
    expect(state.runStatus()).toBe("cancelled");
    expect(starter.stopCalls).toBe(1);
    state.dispose();
  });

  test("surfaces spawn errors without crashing the dashboard", async () => {
    const row = mission("m-fail");
    const starter = fakeStarter({ spawnError: new Error("node missing") });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      runStarter: (req, push) => starter.start(req, push),
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(row);
    await state.startMissionRun();
    expect(state.runStatus()).toBe("error");
    expect(state.runError()?.message).toBe("node missing");
    state.dispose();
  });

  test("caps run event history", async () => {
    const row = mission("m-cap");
    const starter = fakeStarter({
      emit: (push) => {
        for (let i = 0; i < 600; i++) push({ timestamp: "t", kind: `e-${i}`, record: {}, raw: "" });
      },
    });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [row] }),
      runStarter: (req, push) => starter.start(req, push),
      runEventsHistoryCap: 100,
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(row);
    await state.startMissionRun();
    const events = state.runEvents();
    expect(events).toHaveLength(100);
    expect(events[0].kind).toBe("e-500");
    expect(events[events.length - 1].kind).toBe("e-599");
    state.dispose();
  });

  test("refuses to start without a selected mission", async () => {
    const starter = fakeStarter();
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      runStarter: (req, push) => starter.start(req, push),
      debounceMs: 10,
    });
    await delay(5);
    await state.startMissionRun();
    expect(state.runStatus()).toBe("error");
    expect(state.runError()?.message).toBe("No mission selected");
    expect(starter.starts).toBe(0);
    state.dispose();
  });
});


describe("tui/state — sandbox manager actions", () => {
  test("openCreateSandboxDialog seeds mission id from current selection", async () => {
    const m = mission("m-seed");
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ missions: [m] }),
      sandboxOps: { create: async () => { throw new Error("unreached"); }, discard: async () => { throw new Error("unreached"); } },
      debounceMs: 10,
    });
    await delay(5);
    state.selectMission(m);
    state.openCreateSandboxDialog();
    expect(state.createSandboxDialogOpen()).toBe(true);
    expect(state.createSandboxMissionId()).toBe("m-seed");
    expect(state.createSandboxId()).toBe("");
    state.dispose();
  });

  test("submitCreateSandbox validates required fields without calling ops", async () => {
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      sandboxOps: {
        create: async () => { calls += 1; return { id: "sbx-x", mission_id: "m", path: "/x", branch: "x", base_ref: "HEAD", created_at: "", updated_at: "", backend: "git-worktree", status: "created" } as any; },
        discard: async () => ({ id: "sbx-x", removed: true, branch_removed: true } as any),
      },
      debounceMs: 10,
    });
    await delay(5);
    state.openCreateSandboxDialog();
    await state.submitCreateSandbox();
    expect(state.sandboxAction()).toBe("error");
    expect(state.sandboxActionError()?.message).toMatch(/required/);
    expect(calls).toBe(0);
    state.dispose();
  });

  test("submitCreateSandbox calls ops and refreshes on success", async () => {
    let createCalled: { root: string; id: string; missionId: string; baseRef?: string } | null = null;
    let loaderCalls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => { loaderCalls += 1; return snap(); },
      sandboxOps: {
        create: async (root, opts) => {
          createCalled = { root, id: opts.id, missionId: opts.missionId, baseRef: opts.baseRef };
          return { id: opts.id, mission_id: opts.missionId, path: "/x", branch: opts.id, base_ref: opts.baseRef ?? "HEAD", created_at: "", updated_at: "", backend: "git-worktree", status: "created" } as any;
        },
        discard: async () => ({} as any),
      },
      debounceMs: 10,
    });
    await delay(5);
    state.openCreateSandboxDialog();
    state.setCreateSandboxId("sbx-feature-a");
    state.setCreateSandboxMissionId("m-1");
    state.setCreateSandboxBaseRef("dev");
    const before = loaderCalls;
    await state.submitCreateSandbox();
    expect(state.sandboxAction()).toBe("created");
    expect(state.createSandboxDialogOpen()).toBe(false);
    expect(createCalled).toEqual({ root: "/fake-root", id: "sbx-feature-a", missionId: "m-1", baseRef: "dev" });
    await delay(15);
    expect(loaderCalls).toBeGreaterThan(before);
    state.dispose();
  });

  test("submitDiscardSandbox propagates force flag and clears selection on success", async () => {
    let discardCalls: { id: string; force?: boolean }[] = [];
    const sandbox = { id: "sbx-old", missionId: "m", backend: "git-worktree", status: "created", worktreePath: "/x" };
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ sandboxes: [sandbox] }),
      sandboxOps: {
        create: async () => ({} as any),
        discard: async (root, id, opts) => { discardCalls.push({ id, force: opts?.force }); return {} as any; },
      },
      debounceMs: 10,
    });
    await delay(5);
    state.selectSandbox(sandbox);
    state.openDiscardSandboxConfirm();
    state.toggleDiscardSandboxForce();
    await state.submitDiscardSandbox();
    expect(discardCalls).toEqual([{ id: "sbx-old", force: true }]);
    expect(state.sandboxAction()).toBe("discarded");
    expect(state.discardSandboxConfirmOpen()).toBe(false);
    expect(state.selectedSandbox()).toBeNull();
    state.dispose();
  });

  test("submitDiscardSandbox surfaces ops errors without crashing", async () => {
    const sandbox = { id: "sbx-err", missionId: "m", backend: "git-worktree", status: "dirty", worktreePath: "/x" };
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ sandboxes: [sandbox] }),
      sandboxOps: {
        create: async () => ({} as any),
        discard: async () => { throw new Error("sandbox dirty"); },
      },
      debounceMs: 10,
    });
    await delay(5);
    state.selectSandbox(sandbox);
    state.openDiscardSandboxConfirm();
    await state.submitDiscardSandbox();
    expect(state.sandboxAction()).toBe("error");
    expect(state.sandboxActionError()?.message).toBe("sandbox dirty");
    state.dispose();
  });

  test("forceCheckAdapter drops cached entry and triggers a new check", async () => {
    let calls = 0;
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      adapterChecker: async () => { calls += 1; return { runtime: "codex", found: true, version: `${calls}`, errors: [] }; },
      adapterCheckTtlMs: 100_000,
      debounceMs: 10,
    });
    await delay(5);
    await state.refreshAdapterCheck("codex");
    expect(calls).toBe(1);
    await state.refreshAdapterCheck("codex");
    expect(calls).toBe(1); // cache hit
    await state.forceCheckAdapter("codex");
    expect(calls).toBe(2);
    state.dispose();
  });
});


describe("tui/state — persistence", () => {
  test("restores selections from persisted state when matching rows are present", async () => {
    const codex: AdapterRow = { id: "codex", name: "Codex", status: "active", runtime: "codex", manifestPath: "/c" };
    const m = mission("m-restore");
    const store = createMemoryPersistenceStore({ "/fake-root": { selectedAdapterId: "codex", selectedMissionId: "m-restore" } });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ adapters: [codex], missions: [m] }),
      persistenceStore: store,
      persistenceDebounceMs: 0,
      debounceMs: 10,
    });
    await delay(15);
    expect(state.selectedAdapter()?.id).toBe("codex");
    expect(state.selectedMission()?.id).toBe("m-restore");
    state.dispose();
  });

  test("saves on subsequent selection changes", async () => {
    const codex: AdapterRow = { id: "codex", name: "Codex", status: "active", runtime: "codex", manifestPath: "/c" };
    const store = createMemoryPersistenceStore();
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap({ adapters: [codex] }),
      persistenceStore: store,
      persistenceDebounceMs: 0,
      debounceMs: 10,
    });
    await delay(15);
    state.selectAdapter(codex);
    await delay(5);
    const persisted = await store.load("/fake-root");
    expect(persisted?.selectedAdapterId).toBe("codex");
    state.dispose();
  });

  test("does not crash when persistence is disabled", async () => {
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      persistenceStore: null,
      debounceMs: 10,
    });
    await delay(10);
    state.dispose();
    expect(true).toBe(true);
  });

  test("ignores persisted ids that no longer match snapshot rows", async () => {
    const store = createMemoryPersistenceStore({ "/fake-root": { selectedAdapterId: "gone", selectedMissionId: "ghost" } });
    const state = createDashboardState("/fake-root", {
      watcherFactory: () => ({ close: () => {} }),
      loader: async () => snap(),
      persistenceStore: store,
      persistenceDebounceMs: 0,
      debounceMs: 10,
    });
    await delay(20);
    expect(state.selectedAdapter()).toBeNull();
    expect(state.selectedMission()).toBeNull();
    state.dispose();
  });
});

