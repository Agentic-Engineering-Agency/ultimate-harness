import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { runtimeRegistry, type AdapterManifestEntry } from "./registry.js";

export interface CapabilityMatch {
  mission: MissionDocument;
  adapter: AdapterManifestEntry;
  missing: string[];
}

export async function loadMissionFile(missionPath: string): Promise<MissionDocument> {
  const raw = await readFile(missionPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Mission YAML parse error in ${missionPath}: ${(err as Error).message}`);
  }
  return validateMission(parsed);
}

export async function matchRuntimeCapabilities(
  root: string,
  missionPath: string,
  runtime: string,
): Promise<CapabilityMatch | null> {
  const mission = await loadMissionFile(missionPath);
  if (mission.capabilities.length === 0) return null;

  const adapters = await runtimeRegistry.list(root);
  const adapter = adapters.find((entry) => entry.document.runtime === runtime && entry.document.status !== "deprecated");
  if (!adapter) {
    throw new Error(
      `Mission ${mission.id} declares capabilities [${mission.capabilities.join(", ")}] but no non-deprecated adapter manifest is configured for runtime "${runtime}"`,
    );
  }
  const supported = new Set(adapter.document.capabilities);
  const missing = mission.capabilities.filter((capability) => !supported.has(capability));
  return { mission, adapter, missing };
}

export async function assertRuntimeCapabilities(
  root: string,
  missionPath: string,
  runtime: string,
): Promise<CapabilityMatch | null> {
  const match = await matchRuntimeCapabilities(root, missionPath, runtime);
  if (match && match.missing.length > 0) {
    throw new Error(
      `Mission ${match.mission.id} requires capabilities not supported by runtime "${runtime}" ` +
      `(adapter ${match.adapter.id}): ${match.missing.join(", ")}`,
    );
  }
  return match;
}
