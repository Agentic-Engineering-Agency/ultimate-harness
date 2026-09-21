import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { validateProject, type FleetPolicy, type FleetRole } from "../schema/project.js";
import { adaptersDir, projectYaml } from "./paths.js";
import { loadMissionFile } from "./capabilities.js";
import { fileExists } from "./mission.js";
import { mergeRuntimeConfigOverrides } from "./runtime-config-overrides.js";

export type FleetRequest = { adapter: string; model: string | undefined; role: FleetRole };

/**
 * Spend authorization: which model may run on which adapter, and in which role.
 * Returns the refusal reason, or undefined when the run is admitted. A project
 * without a fleet block has no policy. Identifiers are compared exactly.
 */
export function decideFleetAdmission(fleet: FleetPolicy | undefined, request: FleetRequest): string | undefined {
  if (!fleet) return undefined;
  if (!request.model) return `${request.adapter} has no assigned model; the runtime would choose its own default`;
  const routes = fleet.routes.filter(route => route.model === request.model);
  if (!routes.length) return `model ${request.model} is not in the project fleet`;
  const onAdapter = routes.filter(route => route.adapter === request.adapter);
  if (!onAdapter.length) return `model ${request.model} is not authorized on adapter ${request.adapter}`;
  if (!onAdapter.some(route => route.roles.includes(request.role))) return `model ${request.model} on ${request.adapter} is not authorized for the ${request.role} role`;
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** The model a run will request: CLI overrides, then the mission, then the adapter manifest. */
async function assignedRoute(root: string, missionPath: string, runtime: string, extraOverrides?: Record<string, unknown>): Promise<{ model: string | undefined; role: FleetRole }> {
  const overrides = mergeRuntimeConfigOverrides(await loadMissionFile(missionPath), extraOverrides);
  const manifestPath = path.join(adaptersDir(root), `${runtime}.yaml`);
  const manifest = await fileExists(manifestPath) ? parse(await readFile(manifestPath, "utf8")) as { config?: { default_model?: unknown; runtime_config?: { model?: unknown; role?: unknown } } } : undefined;
  const role = text(overrides.role) ?? text(manifest?.config?.runtime_config?.role);
  return {
    model: text(overrides.model) ?? text(manifest?.config?.runtime_config?.model) ?? text(manifest?.config?.default_model),
    role: role === "orchestrator" ? "orchestrator" : "worker",
  };
}

/** Refuses a run outside the project fleet before any process is spawned. `--force` does not bypass it. */
export async function assertFleetAdmission(root: string, missionPath: string, runtime: string, extraOverrides?: Record<string, unknown>): Promise<void> {
  const projectPath = projectYaml(root);
  if (!(await fileExists(projectPath))) return;
  const fleet = validateProject(parse(await readFile(projectPath, "utf8"))).fleet;
  const refusal = decideFleetAdmission(fleet, { adapter: runtime, ...(await assignedRoute(root, missionPath, runtime, extraOverrides)) });
  if (refusal) throw new Error(`Fleet policy refuses this run: ${refusal}`);
}
