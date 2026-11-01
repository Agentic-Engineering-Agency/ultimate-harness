import { setTimeout as delay } from "node:timers/promises";

/** How long, at most, a cancelled run is given to write its own terminal state before the process exits anyway. */
export const SETTLE_ON_SIGNAL_BOUND_MS = 5_000;

/**
 * What a process does on SIGINT or SIGTERM while a run is in progress: abort the run, write the cancelled run's
 * records, then give the run its own settlement (the terminal `runtime-control.json`, the live-run registry) a
 * bounded time to finish before exiting. Exiting at once, as before, dropped those writes, and the plugin's cancel
 * reads them.
 */
export async function settleOnSignal(options: {
  abort: () => void;
  finalize: () => void;
  /** The run's own promise, once it is known. */
  running: () => Promise<unknown> | undefined;
  exit: (code: number) => void;
  code: number;
  boundMs?: number;
}): Promise<void> {
  options.abort();
  try { options.finalize(); } catch { /* the records are best-effort; the exit below is not */ }
  const running = options.running();
  if (running !== undefined) {
    await Promise.race([running.then(() => undefined, () => undefined), delay(options.boundMs ?? SETTLE_ON_SIGNAL_BOUND_MS)]);
  }
  options.exit(options.code);
}
