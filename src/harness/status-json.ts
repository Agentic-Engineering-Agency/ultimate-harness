import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { adaptersDir, missionsDir } from "./paths.js";
import { detectAll } from "./validate/drift/registry.js";
import { RuntimeResultSchema, type RuntimeResultDocument } from "../schema/artifacts.js";

/**
 * UH-78 LLM-less status query mode. Produces a stable JSON document for
 * external consumers (Hermes Dashboard plugin, scripts). MUST NOT spawn any
 * subprocesses — every field is read from disk so warm-state stays sub-30ms
 * on fixtures with 50 missions.
 */
export const STATUS_JSON_SCHEMA = "uh.status.v0";

export type StatusJsonAdapter = {
  id: string;
  status: string;
  /**
   * Live adapter version. Empty in `--json` mode because we do not spawn the
   * runtime CLI. Consumers wanting a live probe should call `uh adapter check`.
   */
  version: string;
  /** ISO timestamp of the last on-disk adapter-check artifact, or null. */
  checked_at: string | null;
};

export type StatusJsonMissionStatus = "passed" | "blocked" | "failed" | "running" | "pending";

export type StatusJsonMissionCounts = Record<StatusJsonMissionStatus, number>;

export type StatusJsonMission = {
  mission_id: string;
  runtime: string;
  status: string;
  verdict: string | null;
  finished_at: string;
};

export type StatusJsonDocument = {
  schema_version: typeof STATUS_JSON_SCHEMA;
  generated_at: string;
  version: string;
  project_root: string;
  adapters: StatusJsonAdapter[];
  missions: {
    total: number;
    by_status: StatusJsonMissionCounts;
  };
  recent_runs: StatusJsonMission[];
  drift: {
    kinds_with_issues: number;
    issues_total: number;
  };
};

export type GetStatusJsonOptions = {
  /** Override the package version. Tests pass a stable value. */
  packageVersion?: string;
  /** Override `generated_at` for deterministic tests. */
  now?: string;
  /** Cap on `recent_runs`. Defaults to 20. */
  recentRunsLimit?: number;
};

const DEFAULT_RECENT_RUNS_LIMIT = 20;

function emptyCounts(): StatusJsonMissionCounts {
  return { passed: 0, blocked: 0, failed: 0, running: 0, pending: 0 };
}

export async function getStatusJson(
  root: string,
  options: GetStatusJsonOptions = {},
): Promise<StatusJsonDocument> {
  const packageVersion = options.packageVersion ?? await readPackageVersion();
  const adapters = await collectAdapters(root);
  const missions = await collectMissions(root);
  const drift = await detectAll(root);
  const kindsWithIssues = new Set(drift.map((i) => i.kind)).size;
  const recentRunsLimit = options.recentRunsLimit ?? DEFAULT_RECENT_RUNS_LIMIT;
  return {
    schema_version: STATUS_JSON_SCHEMA,
    generated_at: options.now ?? new Date().toISOString(),
    version: packageVersion,
    project_root: root,
    adapters,
    missions: { total: missions.total, by_status: missions.byStatus },
    recent_runs: missions.recentRuns.slice(0, recentRunsLimit),
    drift: { kinds_with_issues: kindsWithIssues, issues_total: drift.length },
  };
}

async function readPackageVersion(): Promise<string> {
  // Best-effort read of the published package version. Walks up from this
  // module's filesystem location until it finds a `package.json` with a
  // `version` field. Returns "unknown" rather than throwing.
  try {
    const here = path.dirname(new URL(import.meta.url).pathname);
    let dir = here;
    for (let depth = 0; depth < 6; depth += 1) {
      const candidate = path.join(dir, "package.json");
      try {
        const raw = await readFile(candidate, "utf-8");
        const parsed = JSON.parse(raw) as { version?: unknown };
        if (typeof parsed.version === "string") return parsed.version;
      } catch {
        // continue
      }
      const next = path.dirname(dir);
      if (next === dir) break;
      dir = next;
    }
  } catch {
    // ignore
  }
  return "unknown";
}

async function collectAdapters(root: string): Promise<StatusJsonAdapter[]> {
  const dir = adaptersDir(root);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: StatusJsonAdapter[] = [];
  for (const file of files) {
    if (!(file.endsWith(".yaml") || file.endsWith(".yml"))) continue;
    let parsed: Record<string, unknown>;
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const value = parse(raw);
      if (!value || typeof value !== "object") continue;
      parsed = value as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof parsed.id === "string" ? parsed.id : file.replace(/\.ya?ml$/, "");
    const status = typeof parsed.status === "string" ? parsed.status : "unknown";
    out.push({ id, status, version: "", checked_at: null });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

type MissionsSummary = {
  total: number;
  byStatus: StatusJsonMissionCounts;
  recentRuns: StatusJsonMission[];
};

async function collectMissions(root: string): Promise<MissionsSummary> {
  const dir = missionsDir(root);
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { total: 0, byStatus: emptyCounts(), recentRuns: [] };
  }
  const byStatus = emptyCounts();
  const runs: StatusJsonMission[] = [];
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const missionDir = path.join(dir, entry.name);
    const missionFile = path.join(missionDir, "mission.yaml");
    try {
      await access(missionFile);
    } catch {
      continue;
    }
    total += 1;
    const runtimeResultPath = path.join(missionDir, "runtime-result.yaml");
    const runtimeSessionPath = path.join(missionDir, "runtime-session.yaml");
    let result: RuntimeResultDocument | null = null;
    try {
      const raw = await readFile(runtimeResultPath, "utf-8");
      const parsed = parse(raw);
      const validated = RuntimeResultSchema.safeParse(parsed);
      if (validated.success) result = validated.data;
    } catch {
      // No runtime-result.yaml — fall back to session.
    }
    if (result) {
      const mapped: StatusJsonMissionStatus = result.status === "cancelled"
        ? "blocked"
        : result.status;
      byStatus[mapped] += 1;
      runs.push({
        mission_id: result.mission_id,
        runtime: result.runtime,
        status: result.status,
        verdict: result.verdict?.value ?? null,
        finished_at: result.finished_at,
      });
      continue;
    }
    let sessionStatus: string | null = null;
    try {
      const raw = await readFile(runtimeSessionPath, "utf-8");
      const parsed = parse(raw);
      if (parsed && typeof parsed === "object") {
        const s = (parsed as Record<string, unknown>).status;
        if (typeof s === "string") sessionStatus = s;
      }
    } catch {
      // no session
    }
    if (sessionStatus === "running") {
      byStatus.running += 1;
    } else {
      byStatus.pending += 1;
    }
  }
  runs.sort((a, b) => {
    if (a.finished_at < b.finished_at) return 1;
    if (a.finished_at > b.finished_at) return -1;
    return a.mission_id.localeCompare(b.mission_id);
  });
  return { total, byStatus, recentRuns: runs };
}
