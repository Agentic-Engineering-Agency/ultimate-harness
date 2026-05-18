/**
 * UH-44 — composes `startRun` (subprocess) with `tailRunEvents` (NDJSON
 * tailer) into a single reactive object the state layer drives. Kept thin
 * and side-effect-only so tests can substitute via `runStarter` instead
 * of stubbing two seams independently.
 */
import path from "node:path";
import { mkdir, open as openFile } from "node:fs/promises";
import { startRun, type RunOutcome, type RunOrchestratorOptions, type RunRequest } from "./run-orchestrator.js";
import { readExistingEvents, tailRunEvents, type RunEvent, type TailEventsOptions } from "./run-events.js";

export interface RunSessionRequest extends RunRequest {
  /** Absolute path to the mission directory under `.harness/missions/<id>/`. */
  missionDir: string;
}

export interface RunSession {
  /** Numeric pid of the running subprocess. */
  pid: number;
  /** Resolves with the final outcome once the subprocess exits. */
  exit: Promise<RunOutcome>;
  /** SIGTERM the subprocess. No-op when already exited. */
  stop: () => void;
}

export type RunStarter = (
  req: RunSessionRequest,
  onEvent: (event: RunEvent) => void,
) => Promise<RunSession>;

export interface DefaultRunStarterOptions {
  orchestrator?: RunOrchestratorOptions;
  tail?: TailEventsOptions;
}

/**
 * Production run-starter: spawn the CLI subprocess, then tail
 * `events.ndjson` until the subprocess exits.
 */
export function createDefaultRunStarter(options: DefaultRunStarterOptions = {}): RunStarter {
  return async (req, onEvent) => {
    const eventsPath = path.join(req.missionDir, "events.ndjson");
    // Adapters create the mission dir + events.ndjson as part of their run; but for a
    // first-time TUI-initiated run the file may not exist yet, which would leave fs.watch
    // with nothing to bind to. Touch the file ourselves so the tailer's watcher attaches.
    await mkdir(req.missionDir, { recursive: true });
    const handle = await openFile(eventsPath, "a");
    await handle.close();
    // Drain any pre-existing events first so re-opens of a finished mission keep history.
    const initialOffset = await readExistingEvents(eventsPath, onEvent, options.tail);
    const tailer = await tailRunEvents(eventsPath, onEvent, initialOffset, options.tail);
    const spawn = startRun(req, options.orchestrator);
    const wrappedExit = spawn.exit.finally(async () => {
      await tailer.close();
    });
    return {
      pid: spawn.pid,
      exit: wrappedExit,
      stop: spawn.stop,
    };
  };
}
