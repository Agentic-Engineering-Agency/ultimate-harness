import { describe, test, expect, vi } from "vitest";
import {
  installSuspendHandlers,
  type ProcessShim,
  type RendererShim,
} from "../src/tui/suspend.js";

function makeRenderer(): RendererShim & {
  suspend: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
} {
  return {
    suspend: vi.fn(() => {}),
    resume: vi.fn(() => {}),
  };
}

interface FakeProcess extends ProcessShim {
  emit: (event: "SIGTSTP" | "SIGCONT") => void;
  killCalls: Array<{ pid: number; signal: NodeJS.Signals | number }>;
  listenerCount: () => number;
}

function makeProcess(): FakeProcess {
  const listeners = new Map<"SIGTSTP" | "SIGCONT", Set<NodeJS.SignalsListener>>();
  const killCalls: Array<{ pid: number; signal: NodeJS.Signals | number }> = [];
  return {
    pid: 4242,
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    kill(pid, signal) {
      killCalls.push({ pid, signal });
      return true;
    },
    emit(event) {
      const set = listeners.get(event);
      if (!set) return;
      for (const fn of set) fn(event);
    },
    killCalls,
    listenerCount() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

describe("tui/suspend installSuspendHandlers", () => {
  test("SIGTSTP captures a snapshot, suspends the renderer, and re-raises SIGSTOP", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const capture = vi.fn(() => ({ selectedMissionId: "m1" }));
    const restore = vi.fn();
    const handle = installSuspendHandlers({
      renderer,
      proc,
      lifecycle: { captureSnapshot: capture, restoreSnapshot: restore },
    });

    expect(handle.isSuspended).toBe(false);
    proc.emit("SIGTSTP");

    expect(capture).toHaveBeenCalledTimes(1);
    expect(renderer.suspend).toHaveBeenCalledTimes(1);
    expect(proc.killCalls).toEqual([{ pid: 4242, signal: "SIGSTOP" }]);
    expect(handle.isSuspended).toBe(true);
    expect(restore).not.toHaveBeenCalled();

    handle.uninstall();
  });

  test("SIGCONT resumes the renderer and replays the captured snapshot", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const snapshot = { selectedMissionId: "m1" };
    const capture = vi.fn(() => snapshot);
    const restore = vi.fn();
    const handle = installSuspendHandlers({
      renderer,
      proc,
      lifecycle: { captureSnapshot: capture, restoreSnapshot: restore },
    });

    proc.emit("SIGTSTP");
    proc.emit("SIGCONT");

    expect(renderer.resume).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith(snapshot);
    expect(handle.isSuspended).toBe(false);

    handle.uninstall();
  });

  test("SIGCONT without a prior SIGTSTP is a no-op", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const restore = vi.fn();
    const handle = installSuspendHandlers({
      renderer,
      proc,
      lifecycle: { restoreSnapshot: restore },
    });

    proc.emit("SIGCONT");

    expect(renderer.resume).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(handle.isSuspended).toBe(false);

    handle.uninstall();
  });

  test("duplicate SIGTSTP while already suspended does not re-suspend", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const handle = installSuspendHandlers({ renderer, proc });

    proc.emit("SIGTSTP");
    proc.emit("SIGTSTP");

    expect(renderer.suspend).toHaveBeenCalledTimes(1);
    expect(proc.killCalls).toHaveLength(1);
    expect(handle.isSuspended).toBe(true);

    handle.uninstall();
  });

  test("uninstall detaches both SIGTSTP and SIGCONT listeners", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const handle = installSuspendHandlers({ renderer, proc });

    expect(proc.listenerCount()).toBe(2);
    handle.uninstall();
    expect(proc.listenerCount()).toBe(0);

    // Emitting after uninstall must not touch the renderer.
    proc.emit("SIGTSTP");
    expect(renderer.suspend).not.toHaveBeenCalled();
  });

  test("renderer.suspend throwing still re-raises SIGSTOP to the shell", () => {
    const renderer = makeRenderer();
    renderer.suspend.mockImplementation(() => {
      throw new Error("boom");
    });
    const proc = makeProcess();
    const writes: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    const handle = installSuspendHandlers({ renderer, proc });

    proc.emit("SIGTSTP");

    expect(renderer.suspend).toHaveBeenCalled();
    expect(proc.killCalls).toEqual([{ pid: 4242, signal: "SIGSTOP" }]);
    expect(writes.join("")).toMatch(/renderer\.suspend\(\) failed: boom/);

    stderrSpy.mockRestore();
    handle.uninstall();
  });

  test("programmatic suspend()/resume() drive the same lifecycle as signals", () => {
    const renderer = makeRenderer();
    const proc = makeProcess();
    const capture = vi.fn(() => 42);
    const restore = vi.fn();
    const handle = installSuspendHandlers({
      renderer,
      proc,
      lifecycle: { captureSnapshot: capture, restoreSnapshot: restore },
    });

    handle.suspend();
    handle.resume();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(renderer.suspend).toHaveBeenCalledTimes(1);
    expect(renderer.resume).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith(42);

    handle.uninstall();
  });
});
