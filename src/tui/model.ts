/**
 * UH-46 — pure-TS dashboard snapshot reader.
 *
 * Reads adapters, missions, and sandboxes from the `.harness/` tree
 * via the same primitives used by `uh status` and `uh sandbox list`.
 *
 * This module is **renderer-free**. Vitest exercises it directly.
 * The Solid view layer wraps it through `src/tui/state.ts`.
 *
 * Design contract per docs/research/tui-framework.md §6:
 *   - never throw on missing `.harness/` subtrees — return empty arrays;
 *   - never validate strictly enough that a single malformed YAML file
 *     blanks the whole pane (mirror `listAdapters` in `harness/status.ts`).
 */
import { readdir, readFile, stat, access } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  adaptersDir,
  missionsDir,
  sandboxesIndex,
  projectYaml,
} from "../harness/paths.js";
import { MissionSchema } from "../schema/mission.js";
import { SandboxesIndexSchema } from "../schema/artifacts.js";

export type AdapterRow = {
  id: string;
  name: string;
  /** `active` / `experimental` / `deprecated` / `unknown` / `error`. */
  status: string;
  runtime: string;
  /** Absolute path to the manifest file. */
  manifestPath: string;
};

export type MissionRow = {
  id: string;
  name: string;
  workflow: string;
  /** ISO timestamp from the mission directory mtime — newest first sort key. */
  updatedAt: string;
  /** Absolute path to the mission directory. */
  missionDir: string;
  /** `valid` when mission.yaml parses; `invalid` when present-but-malformed; `missing` when no mission.yaml file. */
  state: "valid" | "invalid" | "missing";
};

export type SandboxRow = {
  id: string;
  missionId: string;
  backend: string;
  status: string;
  /** Absolute worktree path (or empty when the index entry has none). */
  worktreePath: string;
};

export type HarnessInfo = {
  /** True when `.harness/project.yaml` exists and parses as YAML. */
  initialized: boolean;
  /** Project `name` field when readable; empty string otherwise. */
  projectName: string;
};

export type DashboardSnapshot = {
  harness: HarnessInfo;
  adapters: AdapterRow[];
  missions: MissionRow[];
  sandboxes: SandboxRow[];
  /** ISO timestamp when the snapshot finished assembling. */
  capturedAt: string;
};

/** Load a complete dashboard snapshot. Never throws on missing trees. */
export async function loadDashboardSnapshot(root: string): Promise<DashboardSnapshot> {
  const [harness, adapters, missions, sandboxes] = await Promise.all([
    loadHarnessInfo(root),
    loadAdapters(root),
    loadMissions(root),
    loadSandboxes(root),
  ]);
  return {
    harness,
    adapters,
    missions,
    sandboxes,
    capturedAt: new Date().toISOString(),
  };
}

export async function loadHarnessInfo(root: string): Promise<HarnessInfo> {
  const projPath = projectYaml(root);
  try {
    await access(projPath);
  } catch {
    return { initialized: false, projectName: "" };
  }
  try {
    const parsed = parse(await readFile(projPath, "utf-8")) as Record<string, unknown> | null;
    const name = parsed && typeof parsed.name === "string" ? parsed.name : "";
    return { initialized: true, projectName: name };
  } catch {
    // present-but-unparseable still counts as "initialized" — UH-46
    // takeover screen only triggers on truly-missing harness.
    return { initialized: true, projectName: "" };
  }
}

export async function loadAdapters(root: string): Promise<AdapterRow[]> {
  const dir = adaptersDir(root);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const yamlFiles = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const rows: AdapterRow[] = [];
  for (const file of yamlFiles) {
    const manifestPath = path.join(dir, file);
    const fallbackId = file.replace(/\.ya?ml$/, "");
    try {
      const content = await readFile(manifestPath, "utf-8");
      const parsed = parse(content) as Record<string, unknown> | null | undefined;
      if (!parsed || typeof parsed !== "object") {
        rows.push({ id: fallbackId, name: file, status: "error", runtime: "", manifestPath });
        continue;
      }
      rows.push({
        id: String(parsed.id ?? fallbackId),
        name: String(parsed.name ?? file),
        status: String(parsed.status ?? "unknown"),
        runtime: String(parsed.runtime ?? ""),
        manifestPath,
      });
    } catch {
      rows.push({ id: fallbackId, name: file, status: "error", runtime: "", manifestPath });
    }
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows;
}

export async function loadMissions(root: string): Promise<MissionRow[]> {
  const dir = missionsDir(root);
  let entries: { name: string; isDirectory: boolean }[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    entries = dirents.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
  } catch {
    return [];
  }
  const rows: MissionRow[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) {
      continue;
    }
    const missionDir = path.join(dir, entry.name);
    const missionFile = path.join(missionDir, "mission.yaml");

    let dirMtimeMs = 0;
    try {
      dirMtimeMs = (await stat(missionDir)).mtimeMs;
    } catch {
      continue;
    }

    let fileExists = false;
    let parsed: unknown = null;
    try {
      const content = await readFile(missionFile, "utf-8");
      fileExists = true;
      parsed = parse(content);
    } catch {
      // mission.yaml absent or unreadable
    }

    if (!fileExists) {
      rows.push({
        id: entry.name,
        name: entry.name,
        workflow: "",
        updatedAt: new Date(dirMtimeMs).toISOString(),
        missionDir,
        state: "missing",
      });
      continue;
    }

    const result = MissionSchema.safeParse(parsed);
    if (!result.success) {
      // Best-effort surface fields from the raw YAML.
      const raw = (parsed ?? {}) as Record<string, unknown>;
      rows.push({
        id: typeof raw.id === "string" ? raw.id : entry.name,
        name: typeof raw.name === "string"
          ? raw.name
          : typeof raw.title === "string"
            ? raw.title
            : entry.name,
        workflow: typeof raw.workflow_profile === "string" ? raw.workflow_profile : "",
        updatedAt: new Date(dirMtimeMs).toISOString(),
        missionDir,
        state: "invalid",
      });
      continue;
    }

    rows.push({
      id: result.data.id,
      name: result.data.name,
      workflow: result.data.workflow_profile,
      updatedAt: new Date(dirMtimeMs).toISOString(),
      missionDir,
      state: "valid",
    });
  }
  // Newest first by directory mtime; stable on tie via id.
  rows.sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return a.id.localeCompare(b.id);
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
  return rows;
}

export async function loadSandboxes(root: string): Promise<SandboxRow[]> {
  const indexPath = sandboxesIndex(root);
  let parsed: unknown;
  try {
    parsed = parse(await readFile(indexPath, "utf-8"));
  } catch {
    return [];
  }
  const result = SandboxesIndexSchema.safeParse(parsed);
  if (!result.success) {
    return [];
  }
  return result.data.sandboxes.map((entry) => ({
    id: entry.id,
    missionId: entry.mission_id,
    backend: entry.backend,
    status: entry.status,
    worktreePath: entry.path ?? "",
  }));
}
