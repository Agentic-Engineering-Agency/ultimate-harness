/**
 * UH-50 — Ctrl+Z / fg suspend-resume lifecycle for the OpenTUI dashboard.
 *
 * OpenTUI 0.2.13's `CliRenderer.suspend()` already does the load-bearing
 * work: pauses the render loop, flushes split output, disables mouse,
 * removes exit listeners, lifts raw mode, pauses stdin, calls the native
 * `suspendRenderer` (which exits the alternate screen). `resume()`
 * reverses every step. Both APIs are documented inline against UH-50's
 * acceptance — see `node_modules/@opentui/core/renderer.d.ts:466-468`.
 *
 * Without our own handler, Node defaults to ignoring SIGTSTP if any user
 * listener is attached, so the shell never gets the process. Therefore
 * the SIGTSTP path here explicitly re-raises SIGSTOP after the renderer
 * tears down its terminal modes, handing job control to the shell
 * cleanly. SIGCONT then restores everything.
 *
 * The "snapshot" hook is a deliberate seam: the actual JS heap survives
 * SIGSTOP intact, so no real serialization is needed, but the seam lets
 * tests assert the capture/restore lifecycle without forking. It is also
 * the right place for any future model state we may need to refresh
 * after a long suspend (e.g. force-rerun watchers).
 */

import type { CliRenderer } from "@opentui/core";

/** Capture/restore hooks. Both default to no-ops. */
export interface SuspendLifecycle<S = unknown> {
  captureSnapshot?: () => S;
  restoreSnapshot?: (snapshot: S) => void;
}

/** Minimal `process` surface needed for signal management. Test seam. */
export interface ProcessShim {
  pid: number;
  on(event: "SIGTSTP" | "SIGCONT", listener: NodeJS.SignalsListener): void;
  off(event: "SIGTSTP" | "SIGCONT", listener: NodeJS.SignalsListener): void;
  kill(pid: number, signal: NodeJS.Signals | number): boolean;
}

/** Minimal renderer surface. Avoids importing the heavy CliRenderer in tests. */
export type RendererShim = Pick<CliRenderer, "suspend" | "resume">;

export interface SuspendOptions<S = unknown> {
  renderer: RendererShim;
  lifecycle?: SuspendLifecycle<S>;
  proc?: ProcessShim;
}

export interface SuspendHandle {
  /** Programmatic trigger: suspend immediately and re-raise SIGSTOP. */
  suspend: () => void;
  /** Programmatic trigger: resume the renderer from a stopped state. */
  resume: () => void;
  /** Remove signal listeners. Idempotent. */
  uninstall: () => void;
  /** True between a `suspend` and the next `resume`. */
  readonly isSuspended: boolean;
}

const realProc: ProcessShim = {
  get pid() {
    return process.pid;
  },
  on(event, listener) {
    process.on(event, listener);
  },
  off(event, listener) {
    process.off(event, listener);
  },
  kill(pid, signal) {
    return process.kill(pid, signal);
  },
};

/**
 * Install SIGTSTP + SIGCONT handlers that drive the OpenTUI renderer's
 * suspend/resume lifecycle. Returns a handle for programmatic control
 * and teardown.
 */
export function installSuspendHandlers<S = unknown>(
  opts: SuspendOptions<S>,
): SuspendHandle {
  const { renderer, lifecycle = {}, proc = realProc } = opts;
  let suspended = false;
  let stashed: { snapshot: S | undefined } | null = null;

  const onTstp: NodeJS.SignalsListener = () => doSuspend();
  const onCont: NodeJS.SignalsListener = () => doResume();

  function doSuspend(): void {
    if (suspended) return;
    suspended = true;
    const snapshot = lifecycle.captureSnapshot?.();
    stashed = { snapshot: snapshot as S | undefined };
    try {
      renderer.suspend();
    } catch (err) {
      // Don't let a renderer error leave us in a half-suspended state —
      // the shell still needs to take over via SIGSTOP. Log and proceed.
      process.stderr.write(`uh tui: renderer.suspend() failed: ${(err as Error).message}\n`);
    }
    // Hand control to the shell. Sending SIGSTOP to self is the standard
    // way to honour Ctrl+Z once we've overridden the default SIGTSTP
    // behaviour (Node ignores SIGTSTP whenever a user listener exists).
    proc.kill(proc.pid, "SIGSTOP");
  }

  function doResume(): void {
    if (!suspended) return;
    suspended = false;
    try {
      renderer.resume();
    } catch (err) {
      process.stderr.write(`uh tui: renderer.resume() failed: ${(err as Error).message}\n`);
    }
    if (stashed && lifecycle.restoreSnapshot) {
      lifecycle.restoreSnapshot(stashed.snapshot as S);
    }
    stashed = null;
  }

  proc.on("SIGTSTP", onTstp);
  proc.on("SIGCONT", onCont);

  return {
    suspend: doSuspend,
    resume: doResume,
    uninstall() {
      proc.off("SIGTSTP", onTstp);
      proc.off("SIGCONT", onCont);
    },
    get isSuspended() {
      return suspended;
    },
  };
}
