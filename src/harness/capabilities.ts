import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { runtimeRegistry, type AdapterManifestEntry } from "./registry.js";

export interface CapabilityMatch {
  mission: MissionDocument;
  adapter: AdapterManifestEntry;
  missing: string[];
}

/**
 * How a capability mismatch is treated at run/dry-run/run-all preflight.
 * - "error": mismatch (or no non-deprecated manifest) throws — restores the
 *   pre-v0.10.0 hard-error behaviour; selected by `--strict`.
 * - "warn": emit a `[WARN]` line and proceed (the v0.10.0 default).
 * - "off": skip the capability check entirely (used by `--force` bypass).
 */
export type CapabilitySeverity = "warn" | "error" | "off";

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

/** Single `[WARN]` line emitted per missing capability tag in warn mode. */
export function formatCapabilityWarnLine(
  missionId: string,
  cap: string,
  runtime: string,
  adapterId: string,
): string {
  return `[WARN] mission ${missionId}: capability "${cap}" not declared by runtime "${runtime}" (adapter ${adapterId}); proceeding — pass --strict to fail`;
}

/** Single `[WARN]` line emitted when no non-deprecated manifest exists, in warn mode. */
export function formatNoManifestWarnLine(missionId: string, runtime: string): string {
  return `[WARN] mission ${missionId}: no non-deprecated adapter manifest for runtime "${runtime}"; capability check skipped — pass --strict to fail`;
}

/** Single `[WARN]` line emitted when `--force` bypasses the capability check. */
export function formatCapabilityBypassLine(missionId: string, runtime: string): string {
  return `[WARN] mission ${missionId}: --force bypassed capability check for runtime "${runtime}"`;
}

/**
 * Core capability enforcement with selectable severity.
 * - "off": skip entirely (returns null).
 * - mission without capabilities: no-op (returns null).
 * - no non-deprecated manifest: "error" throws; "warn" emits one [WARN] and returns null.
 * - missing tags: "error" throws; "warn" emits one [WARN] per missing tag and returns the match.
 */
export async function enforceCapabilities(
  root: string,
  missionPath: string,
  runtime: string,
  severity: CapabilitySeverity,
): Promise<CapabilityMatch | null> {
  if (severity === "off") return null;

  const mission = await loadMissionFile(missionPath);
  if (mission.capabilities.length === 0) return null;

  const adapters = await runtimeRegistry.list(root);
  const adapter = adapters.find((entry) => entry.document.runtime === runtime && entry.document.status !== "deprecated");
  if (!adapter) {
    if (severity === "error") {
      throw new Error(
        `Mission ${mission.id} declares capabilities [${mission.capabilities.join(", ")}] but no non-deprecated adapter manifest is configured for runtime "${runtime}"`,
      );
    }
    console.error(formatNoManifestWarnLine(mission.id, runtime));
    return null;
  }

  const supported = new Set(adapter.document.capabilities);
  const missing = mission.capabilities.filter((capability) => !supported.has(capability));
  if (missing.length > 0) {
    if (severity === "error") {
      throw new Error(
        `Mission ${mission.id} requires capabilities not supported by runtime "${runtime}" ` +
        `(adapter ${adapter.id}): ${missing.join(", ")}`,
      );
    }
    for (const cap of missing) {
      console.error(formatCapabilityWarnLine(mission.id, cap, runtime, adapter.id));
    }
  }
  return { mission, adapter, missing };
}

/**
 * Thin shim preserving the pre-v0.10.0 hard-error contract (and byte-identical
 * throw messages) for callers/tests that depend on the always-throw behaviour.
 */
export async function assertRuntimeCapabilities(
  root: string,
  missionPath: string,
  runtime: string,
): Promise<CapabilityMatch | null> {
  return enforceCapabilities(root, missionPath, runtime, "error");
}
