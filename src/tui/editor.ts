/**
 * UH-49 — open a manifest file in `$EDITOR` from the TUI.
 *
 * Workflow on the `e` keybinding while a mission is selected:
 *   1. `renderer.suspend()` — OpenTUI 0.2.13 exits the alt screen,
 *      clears mouse, lifts raw mode, pauses stdin. The editor inherits
 *      a sane TTY.
 *   2. `spawn(editor, [path], { stdio: "inherit" })` — child gets full
 *      terminal control. We await the close event.
 *   3. `renderer.resume()` — restore alt screen + raw mode + render loop.
 *   4. Reload the mission/workflow from disk so the dashboard reflects
 *      whatever the operator just saved.
 *
 * `$EDITOR` is honoured; we fall back to `vi` (POSIX-mandated to exist).
 * The helper is testable in isolation by injecting `spawn`, the renderer
 * shim, and the reload callback — see `tests/tui-editor-launch.test.ts`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { RendererShim } from "./suspend.js";

export type EditorSpawner = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; env?: NodeJS.ProcessEnv },
) => ChildProcess;

const DEFAULT_SPAWNER: EditorSpawner = (cmd, args, opts) => spawn(cmd, args, opts);

export interface OpenInEditorOptions {
  /** Absolute path to the manifest the operator wants to edit. */
  filePath: string;
  /** Renderer to suspend before spawning the editor. */
  renderer: RendererShim;
  /**
   * Called after the editor closes (and after the renderer resumes) so
   * the dashboard can re-read the file from disk. Errors propagate.
   */
  reload?: () => void | Promise<void>;
  /** Test seam — defaults to real `child_process.spawn`. */
  spawner?: EditorSpawner;
  /** Test seam — defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export interface OpenInEditorResult {
  editor: string;
  /** Child process exit code; `null` when terminated by a signal. */
  code: number | null;
  /** Signal that terminated the child, if any. */
  signal: NodeJS.Signals | null;
}

/**
 * Resolve the operator's editor with the same precedence `git commit`
 * uses: explicit `VISUAL`, then `EDITOR`, then fall back to `vi`.
 */
export function resolveEditor(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = (env.VISUAL ?? env.EDITOR ?? "").trim();
  return candidate.length > 0 ? candidate : "vi";
}

/**
 * Suspend the renderer, spawn `$EDITOR <filePath>`, await its exit, then
 * resume and reload. Throws on spawn errors so callers can surface them
 * via the TUI's error banner.
 */
export async function openInEditor(opts: OpenInEditorOptions): Promise<OpenInEditorResult> {
  const env = opts.env ?? process.env;
  const editor = resolveEditor(env);
  const spawner = opts.spawner ?? DEFAULT_SPAWNER;

  opts.renderer.suspend();
  let result: OpenInEditorResult;
  try {
    result = await runEditor(spawner, editor, opts.filePath, env);
  } catch (err) {
    // Editor never ran (e.g. spawn ENOENT). Restore the renderer so the
    // dashboard is still usable, but skip the reload — there's nothing
    // to refresh from.
    opts.renderer.resume();
    throw err;
  }
  opts.renderer.resume();
  if (opts.reload) {
    await opts.reload();
  }
  return result;
}

function runEditor(
  spawner: EditorSpawner,
  editor: string,
  filePath: string,
  env: NodeJS.ProcessEnv,
): Promise<OpenInEditorResult> {
  return new Promise((resolve, reject) => {
    const child = spawner(editor, [filePath], { stdio: "inherit", env });
    child.once("error", (err) => reject(err));
    child.once("close", (code, signal) => {
      resolve({ editor, code, signal });
    });
  });
}
