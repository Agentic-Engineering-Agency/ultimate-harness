/**
 * UH-42 — per-project TUI state persistence.
 *
 * State lives at `$XDG_CONFIG_HOME/uh/tui-state.json` (defaulting to
 * `~/.config/uh/tui-state.json`). One file holds entries for every
 * project root the user has invoked `uh tui` from, keyed by absolute
 * path. Writes are atomic (temp-file + rename).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface PersistedProjectState {
  focused?: "adapters" | "missions" | "sandboxes";
  activeView?: "dashboard" | "missionDetail";
  selectedAdapterId?: string;
  selectedMissionId?: string;
  selectedSandboxId?: string;
}

interface PersistedFile {
  schema_version: "uh.tui-state.v0";
  projects: Record<string, PersistedProjectState>;
}

export interface PersistenceStore {
  load(root: string): Promise<PersistedProjectState | null>;
  save(root: string, state: PersistedProjectState): Promise<void>;
}

export interface DefaultPersistenceOptions {
  /** Override the config directory; defaults to $XDG_CONFIG_HOME/uh or ~/.config/uh. */
  configDir?: string;
}

export function resolveDefaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) return path.join(xdg, "uh");
  return path.join(homedir(), ".config", "uh");
}

function resolveDefaultStatePath(env: NodeJS.ProcessEnv = process.env, dir?: string): string {
  return path.join(dir ?? resolveDefaultConfigDir(env), "tui-state.json");
}

function emptyFile(): PersistedFile {
  return { schema_version: "uh.tui-state.v0", projects: {} };
}

async function readFile_(path: string): Promise<PersistedFile> {
  try {
    const text = await readFile(path, "utf-8");
    const parsed = JSON.parse(text) as Partial<PersistedFile>;
    if (parsed && typeof parsed === "object" && parsed.schema_version === "uh.tui-state.v0" && parsed.projects && typeof parsed.projects === "object") {
      return { schema_version: "uh.tui-state.v0", projects: { ...parsed.projects } };
    }
  } catch {
    // ignore — missing or malformed counts as empty.
  }
  return emptyFile();
}

async function writeAtomic(file: string, data: PersistedFile): Promise<void> {
  const dir = path.dirname(file);
  await mkdir(dir, { recursive: true });
  // Keep the temp file on the same filesystem as the destination so `rename`
  // is atomic (and never EXDEV-fails when the OS tmpdir is on another fs).
  const tmp = path.join(dir, `.tui-state.tmp.${process.pid}.${Date.now()}.json`);
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await rename(tmp, file);
}

/**
 * File-backed persistence store. Pass a custom `configDir` for tests.
 *
 * Concurrent saves are serialized through a per-store promise chain so a
 * later save never overtakes an earlier one and clobbers a different
 * project's record in the shared file.
 */
export function createFilePersistenceStore(options: DefaultPersistenceOptions = {}): PersistenceStore {
  const file = resolveDefaultStatePath(process.env, options.configDir);
  let writeChain: Promise<void> = Promise.resolve();
  return {
    async load(root: string) {
      const all = await readFile_(file);
      return all.projects[root] ?? null;
    },
    async save(root: string, state: PersistedProjectState) {
      const next = writeChain.then(async () => {
        const all = await readFile_(file);
        all.projects[root] = state;
        await writeAtomic(file, all);
      });
      writeChain = next.catch(() => {});
      await next;
    },
  };
}

/** In-memory persistence store. Useful for tests. */
export function createMemoryPersistenceStore(seed: Record<string, PersistedProjectState> = {}): PersistenceStore {
  const projects = new Map<string, PersistedProjectState>(Object.entries(seed));
  return {
    async load(root) { return projects.get(root) ?? null; },
    async save(root, state) { projects.set(root, state); },
  };
}
