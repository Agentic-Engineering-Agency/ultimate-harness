import {
  CAPABILITIES,
  type AdapterId,
} from "../adapters/capabilities/index.js";
import type { AdapterCapabilities, ToolCapability } from "../schema/adapter-capabilities.js";
import {
  RuntimeRequirementsSchema,
  type MissionDocument,
  type RuntimeRequirements,
} from "../schema/mission.js";
import { costClassWithinMax } from "./cost-table.js";
import { loadMissionFile } from "./capabilities.js";

export interface RuntimeRequirementsMatch {
  mission: MissionDocument;
  runtime: AdapterId;
  adapterCaps: AdapterCapabilities;
  requirements: RuntimeRequirements;
  exclusionReasons: string[];
}

export function resolveRuntimeRequirements(mission: MissionDocument): RuntimeRequirements {
  return RuntimeRequirementsSchema.parse(mission.runtime_requirements ?? {});
}

export function toolsSatisfyRequirements(
  tools: ToolCapability,
  requirements: RuntimeRequirements,
): boolean {
  if (requirements.needs_network && !tools.network) return false;
  if (requirements.needs_shell && !tools.shell) return false;
  if (requirements.needs_fs_write && !tools.fs_write) return false;
  return true;
}

export function evaluateAdapterEligibility(
  adapterCaps: AdapterCapabilities,
  requirements: RuntimeRequirements,
): string[] {
  const exclusionReasons: string[] = [];

  if (!toolsSatisfyRequirements(adapterCaps.tools, requirements)) {
    if (requirements.needs_network && !adapterCaps.tools.network) {
      exclusionReasons.push("needs_network");
    }
    if (requirements.needs_shell && !adapterCaps.tools.shell) {
      exclusionReasons.push("needs_shell");
    }
    if (requirements.needs_fs_write && !adapterCaps.tools.fs_write) {
      exclusionReasons.push("needs_fs_write");
    }
  }

  if (
    requirements.min_context_tokens !== undefined &&
    adapterCaps.max_context_tokens < requirements.min_context_tokens
  ) {
    exclusionReasons.push(
      `min_context_tokens (${requirements.min_context_tokens} > ${adapterCaps.max_context_tokens})`,
    );
  }

  if (!costClassWithinMax(adapterCaps.cost_class, requirements.max_cost_class)) {
    exclusionReasons.push(
      `max_cost_class (${adapterCaps.cost_class} > ${requirements.max_cost_class})`,
    );
  }

  return exclusionReasons;
}

function adapterIdForRuntime(runtime: string): AdapterId | null {
  if (runtime in CAPABILITIES) {
    return runtime as AdapterId;
  }
  return null;
}

export async function matchRuntimeRequirements(
  missionPath: string,
  runtime: string,
): Promise<RuntimeRequirementsMatch | null> {
  const mission = await loadMissionFile(missionPath);
  if (mission.runtime_requirements === undefined) return null;

  const adapterId = adapterIdForRuntime(runtime);
  if (!adapterId) {
    throw new Error(
      `Mission ${mission.id} declares runtime_requirements but runtime "${runtime}" has no typed capability manifest`,
    );
  }

  const requirements = resolveRuntimeRequirements(mission);
  const adapterCaps = CAPABILITIES[adapterId];
  const exclusionReasons = evaluateAdapterEligibility(adapterCaps, requirements);

  return {
    mission,
    runtime: adapterId,
    adapterCaps,
    requirements,
    exclusionReasons,
  };
}

export async function assertRuntimeRequirements(
  missionPath: string,
  runtime: string,
): Promise<RuntimeRequirementsMatch | null> {
  const match = await matchRuntimeRequirements(missionPath, runtime);
  if (match && match.exclusionReasons.length > 0) {
    throw new Error(
      `Mission ${match.mission.id} runtime_requirements not satisfied by "${runtime}" ` +
      `(adapter ${match.adapterCaps.id}): ${match.exclusionReasons.join(", ")}`,
    );
  }
  return match;
}
