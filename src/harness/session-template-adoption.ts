import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  applySessionTemplate,
  describeAppliedTemplate,
  getSessionTemplate,
  type AppliedTemplateDescription,
} from "./session-templates.js";
import type { SessionTemplate } from "../schema/session-template.js";

/**
 * The result of adopting a session template for one mission invocation.
 *
 * `runtimeConfigOverrides` is translated from the applied document into the
 * extra runtime-config overrides the run path already accepts: the applied
 * `runtime_config_overrides` keys, plus `limits` and `recovery` when the
 * template (or mission) stated them. Callers spread an explicit
 * `--runtime-config-overrides` on top so the command line still wins.
 *
 * `workerRules` is the template's own `worker_rules` list; `constraints` is the
 * mission's constraints with those rules appended after them, so a dispatch
 * prompt built from the adopted mission carries the template's guidance.
 */
export interface SessionTemplateAdoption {
  template: SessionTemplate;
  runtime: string;
  description: AppliedTemplateDescription;
  runtimeConfigOverrides: Record<string, unknown>;
  workerRules: string[];
  constraints: string[];
}

/**
 * Append a template's `worker_rules` to a mission's existing constraints, in
 * order, without mutating either input. Shared by CLI template adoption and by
 * team worker contract resolution so both paths render the same prompt.
 */
export function appendWorkerRules(
  constraints: readonly string[],
  workerRules: readonly string[],
): string[] {
  return [...constraints, ...workerRules];
}

/**
 * Load a session template from the project root, apply it to the mission
 * file, and translate the applied result into runtime-config overrides.
 *
 * Throws when the template is unknown or invalid, when the mission ends up
 * violating strict containment, when the mission file is not a mapping, or
 * when an explicit runtime conflicts with the template's adapter.
 */
export async function adoptSessionTemplate(input: {
  root: string;
  missionPath: string;
  templateId: string;
  explicitRuntime?: string;
}): Promise<SessionTemplateAdoption> {
  const template = await getSessionTemplate(input.root, input.templateId);

  if (input.explicitRuntime !== undefined && input.explicitRuntime !== template.adapter) {
    throw new Error(
      `--runtime ${input.explicitRuntime} conflicts with session template "${template.id}" adapter ${template.adapter}`,
    );
  }

  const parsed = parseYaml(await readFile(input.missionPath, "utf-8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Mission file has no top-level mapping: ${input.missionPath}`);
  }
  const mission = parsed as Record<string, unknown>;

  const applied = applySessionTemplate(mission, template);

  const runtimeConfigOverrides: Record<string, unknown> = {
    ...applied.runtime_config_overrides,
  };
  if (applied.limits !== undefined && Object.keys(applied.limits).length > 0) {
    runtimeConfigOverrides.limits = applied.limits;
  }
  if (applied.recovery !== undefined) {
    runtimeConfigOverrides.recovery = applied.recovery;
  }

  const missionConstraints = Array.isArray(mission.constraints)
    ? mission.constraints.filter((item): item is string => typeof item === "string")
    : [];
  const workerRules = [...template.worker_rules];
  const constraints = appendWorkerRules(missionConstraints, workerRules);

  return {
    template,
    runtime: input.explicitRuntime ?? template.adapter,
    description: describeAppliedTemplate(mission, template),
    runtimeConfigOverrides,
    workerRules,
    constraints,
  };
}
