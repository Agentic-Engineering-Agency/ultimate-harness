import { readdir, readFile, stat, access } from "node:fs/promises";
import { parse } from "yaml";
import {
  projectYaml,
  adaptersDir,
  workflowsDir,
  missionsDir,
  auditLog,
} from "./paths.js";

export type AdapterInfo = {
  id: string;
  name: string;
  status: string;
};

export type StatusResult = {
  name: string;
  schema_version: string;
  adapters: AdapterInfo[];
  workflow_profiles_count: number;
  active_missions_count: number;
  recent_audit_events: number;
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

  return {
    name: String(project.name ?? "unknown"),
    schema_version: String(project.schema_version ?? "unknown"),
    adapters,
    workflow_profiles_count: workflows,
    active_missions_count: missions,
    recent_audit_events: auditEvents,
  };
}

async function listAdapters(dir: string): Promise<AdapterInfo[]> {
  try {
    const entries = await readdir(dir);
    const yamlFiles = entries.filter((f: string) => f.endsWith(".yaml") || f.endsWith(".yml"));
    const adapters: AdapterInfo[] = [];
    for (const f of yamlFiles) {
      try {
        const content = await readFile(`${dir}/${f}`, "utf-8");
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
        const missionFile = `${dir}/${entry.name}/mission.yaml`;
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
