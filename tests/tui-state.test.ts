import { describe, test, expect } from "vitest";
import { createDashboardState } from "../src/tui/state.js";
import type { DashboardSnapshot, AdapterRow } from "../src/tui/model.js";
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
