import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  projectYaml,
  adaptersDir,
  workflowsDir,
  missionsDir,
  auditLog,
  skillsIndex,
  sandboxesIndex,
} from "./paths.js";
import {
  PromotionSchema,
  SandboxStatusSchema,
  VerificationResultSchema,
  type SandboxStatus,
} from "../schema/artifacts.js";

export type AdapterInfo = {
  id: string;
  name: string;
  status: string;
};

export type SandboxStatusCounts = Record<SandboxStatus, number>;

export type SandboxStatusSummary = {
  total: number;
  by_status: SandboxStatusCounts;
};

export type StatusResult = {
  name: string;
  schema_version: string;
  adapters: AdapterInfo[];
  workflow_profiles_count: number;
  active_missions_count: number;
  recent_audit_events: number;
  skills_indexed_count: number;
  sandboxes: SandboxStatusSummary;
  verified_missions_count: number;
  promoted_missions_count: number;
};

export async function getStatus(root: string): Promise<StatusResult> {
  const projPath = projectYaml(root);
  try {
    await access(projPath);
  } catch {
    throw new Error("Not a Ultimate Harness project: .harness/project.yaml not found");
  }

  const content = await readFile(projPath, "utf-8");
  const project = parse(content) as Record<string, unknown>;

  const adapters = await listAdapters(adaptersDir(root));
  const workflows = await countYamlFiles(workflowsDir(root));
  const missions = await countMissionDirs(missionsDir(root));
  const auditEvents = await countAuditLines(auditLog(root));
  const skillsCount = await countSkills(skillsIndex(root));
  const sandboxes = await summarizeSandboxes(sandboxesIndex(root));
  const verifiedMissions = await countPassedVerificationMissionDirs(missionsDir(root));
  const promotedMissions = await countPromotedMissionDirs(missionsDir(root));

  return {
    name: String(project.name ?? "unknown"),
    schema_version: String(project.schema_version ?? "unknown"),
    adapters,
    workflow_profiles_count: workflows,
    active_missions_count: missions,
    recent_audit_events: auditEvents,
    skills_indexed_count: skillsCount,
    sandboxes,
    verified_missions_count: verifiedMissions,
    promoted_missions_count: promotedMissions,
  };
}

async function listAdapters(dir: string): Promise<AdapterInfo[]> {
  try {
    const entries = await readdir(dir);
    const yamlFiles = entries.filter((f: string) => f.endsWith(".yaml") || f.endsWith(".yml"));
    const adapters: AdapterInfo[] = [];
    for (const f of yamlFiles) {
      try {
        const content = await readFile(path.join(dir, f), "utf-8");
        const parsed = parse(content) as Record<string, unknown>;
        adapters.push({
          id: String(parsed.id ?? f.replace(/\.ya?ml$/, "")),
          name: String(parsed.name ?? f),
          status: String(parsed.status ?? "unknown"),
        });
      } catch {
        adapters.push({ id: f.replace(/\.ya?ml$/, ""), name: f, status: "error" });
      }
    }
    return adapters;
  } catch {
    return [];
  }
}

async function countYamlFiles(dir: string): Promise<number> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).length;
  } catch {
    return 0;
  }
}

async function countMissionDirs(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const missionFile = path.join(dir, entry.name, "mission.yaml");
        try {
          await access(missionFile);
          count++;
        } catch {
          // not a proper mission
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function countAuditLines(logPath: string): Promise<number> {
  try {
    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}

async function countSkills(indexPath: string): Promise<number> {
  try {
    const parsed = parse(await readFile(indexPath, "utf-8")) as Record<string, unknown>;
    return Array.isArray(parsed.skills) ? parsed.skills.length : 0;
  } catch {
    return 0;
  }
}

function emptySandboxStatusCounts(): SandboxStatusCounts {
  return {
    created: 0,
    running: 0,
    dirty: 0,
    verified: 0,
    promoted: 0,
    discarded: 0,
  };
}

async function summarizeSandboxes(indexPath: string): Promise<SandboxStatusSummary> {
  const by_status = emptySandboxStatusCounts();
  try {
    const parsed = parse(await readFile(indexPath, "utf-8")) as Record<string, unknown>;
    const sandboxes = Array.isArray(parsed.sandboxes) ? parsed.sandboxes : [];
    for (const sandbox of sandboxes) {
      if (!sandbox || typeof sandbox !== "object") {
        continue;
      }
      const status = (sandbox as Record<string, unknown>).status;
      const statusResult = SandboxStatusSchema.safeParse(status);
      if (statusResult.success) {
        by_status[statusResult.data] += 1;
      }
    }
    return { total: sandboxes.length, by_status };
  } catch {
    return { total: 0, by_status };
  }
}

async function countPassedVerificationMissionDirs(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const missionDir = path.join(dir, entry.name);
      try {
        await access(path.join(missionDir, "mission.yaml"));
        const parsed = parse(await readFile(path.join(missionDir, "verification.yaml"), "utf-8"));
        const result = VerificationResultSchema.safeParse(parsed);
        if (result.success && result.data.status === "passed") {
          count++;
        }
      } catch {
        // not a mission dir, artifact not present, malformed YAML, or invalid artifact
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function countPromotedMissionDirs(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const missionDir = path.join(dir, entry.name);
      try {
        await access(path.join(missionDir, "mission.yaml"));
        const parsed = parse(await readFile(path.join(missionDir, "promotion.yaml"), "utf-8"));
        const result = PromotionSchema.safeParse(parsed);
        if (result.success && result.data.decision === "promoted") {
          count++;
        }
      } catch {
        // not a mission dir, artifact not present, malformed YAML, or invalid artifact
      }
    }
    return count;
  } catch {
    return 0;
  }
}
