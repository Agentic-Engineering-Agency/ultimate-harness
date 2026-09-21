import path from "node:path";
import { readdir, readFile, access } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { harnessDir } from "./paths.js";
import {
  validateSessionTemplate,
  type SessionTemplate,
} from "../schema/session-template.js";

const APPLIED_META = Symbol.for("uh.session-template.applied-meta");

export interface LoadSessionTemplatesOptions {
  onInvalid?: (filePath: string, error: unknown) => void;
}

export interface AppliedTemplateDescription {
  template_id: string;
  tier: SessionTemplate["tier"];
  containment: SessionTemplate["containment"];
  overridden_by_mission: string[];
}

export type AppliedMission<T extends Record<string, unknown> = Record<string, unknown>> = Omit<
  T,
  "adapter" | "attempts" | "runtime_config_overrides" | "limits" | "recovery" | "guard"
> & {
  adapter: SessionTemplate["adapter"];
  attempts: number;
  runtime_config_overrides: Record<string, unknown>;
  limits?: SessionTemplate["limits"];
  recovery?: SessionTemplate["recovery"];
  guard?: {
    write_roots?: string[];
    deny_git_mutations?: boolean;
    deny_package_installs?: boolean;
    deny_network_clients?: boolean;
    agent_clients?: string[];
    allow_native_subagents?: boolean;
  };
};

function templatesDir(root: string): string {
  return path.join(harnessDir(root), "templates");
}

function isSafeTemplateId(id: string): boolean {
  if (typeof id !== "string") return false;
  if (id === "." || id === ".." || id.includes("/") || id.includes("\\")) {
    return false;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id);
}

/**
 * Loads session templates from `.harness/templates/*.yaml` (and `.yml`),
 * sorted by id. An invalid file is reported with its path and skipped; it never
 * makes the others unusable.
 */
export async function loadSessionTemplates(
  root: string,
  options: LoadSessionTemplatesOptions = {},
): Promise<SessionTemplate[]> {
  const dir = templatesDir(root);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const yamlFiles = entries.filter(
    (name) => name.endsWith(".yaml") || name.endsWith(".yml"),
  );

  const templates: SessionTemplate[] = [];

  for (const fileName of yamlFiles) {
    const filePath = path.join(dir, fileName);
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = parseYaml(content);
      const validated = validateSessionTemplate(parsed);
      templates.push(validated);
    } catch (err) {
      options.onInvalid?.(filePath, err);
      console.warn(
        `[uh] Failed to load session template at ${filePath}: ${(err as Error).message}`,
      );
    }
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Retrieves a session template by id.
 * Throws if the id is unsafe or the template does not exist.
 */
export async function getSessionTemplate(
  root: string,
  id: string,
): Promise<SessionTemplate> {
  if (!isSafeTemplateId(id)) {
    throw new Error(`Invalid or unsafe session template id: "${id}"`);
  }

  const dir = templatesDir(root);
  for (const ext of [".yaml", ".yml"]) {
    const candidate = path.join(dir, `${id}${ext}`);
    try {
      await access(candidate);
      const content = await readFile(candidate, "utf-8");
      const parsed = parseYaml(content);
      const validated = validateSessionTemplate(parsed);
      if (validated.id === id) {
        return validated;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Fall back to scanning all templates
      }
    }
  }

  const all = await loadSessionTemplates(root);
  const match = all.find((t) => t.id === id);
  if (match) {
    return match;
  }

  throw new Error(`Session template not found: "${id}"`);
}

/**
 * Merges a session template into a mission document.
 * Precedence, most specific wins: values the mission states explicitly,
 * then the template, then existing defaults.
 * `runtime_config_overrides`, `limits` and `recovery` merge key by key at the top level;
 * `guard` merges field by field, except that `write_roots` is never widened by a template:
 * if the mission states `write_roots`, the template's are ignored.
 */
export function applySessionTemplate<T extends Record<string, unknown>>(
  mission: T,
  template: SessionTemplate,
): AppliedMission<T> {
  const result: Record<string, unknown> = { ...mission };

  // 1. Adapter: mission explicit > template
  if (mission.adapter !== undefined) {
    result.adapter = mission.adapter;
  } else {
    result.adapter = template.adapter;
  }

  // 2. Attempts: mission explicit > template
  if (mission.attempts !== undefined) {
    result.attempts = mission.attempts;
  } else {
    result.attempts = template.attempts;
  }

  // 3. runtime_config_overrides: key by key at top level
  result.runtime_config_overrides = {
    ...(template.runtime_config_overrides ?? {}),
    ...((mission.runtime_config_overrides as Record<string, unknown>) ?? {}),
  };

  // 4. limits: key by key at top level
  const missionLimits = mission.limits as Record<string, unknown> | undefined;
  if (template.limits !== undefined || missionLimits !== undefined) {
    result.limits = {
      ...(template.limits ?? {}),
      ...(missionLimits ?? {}),
    };
  }

  // 5. recovery: key by key at top level
  const missionRecovery = mission.recovery as Record<string, unknown> | undefined;
  if (template.recovery !== undefined || missionRecovery !== undefined) {
    result.recovery = {
      ...(template.recovery ?? {}),
      ...(missionRecovery ?? {}),
    };
  }

  // 6. guard: field by field, except write_roots is never widened
  const missionGuard = mission.guard as Record<string, unknown> | undefined;
  const templateGuard = template.guard;

  if (missionGuard !== undefined || templateGuard !== undefined) {
    const mergedGuard: Record<string, unknown> = {
      ...(templateGuard ?? {}),
      ...(missionGuard ?? {}),
    };

    if (missionGuard && "write_roots" in missionGuard && missionGuard.write_roots !== undefined) {
      mergedGuard.write_roots = missionGuard.write_roots;
    } else if (templateGuard && "write_roots" in templateGuard && templateGuard.write_roots !== undefined) {
      mergedGuard.write_roots = templateGuard.write_roots;
    } else {
      delete mergedGuard.write_roots;
    }

    result.guard = mergedGuard;
  }

  // 7. Strict containment verification
  if (template.containment === "strict") {
    const guard = result.guard as {
      write_roots?: string[];
      allow_native_subagents?: boolean;
      deny_network_clients?: boolean;
    } | undefined;

    const writeRoots = guard?.write_roots;
    if (!Array.isArray(writeRoots) || writeRoots.length === 0) {
      throw new Error(
        "Strict containment violation: mission ends up with no explicit guard.write_roots",
      );
    }

    for (const root of writeRoots) {
      const normalized = path.posix
        .normalize(root.trim().replaceAll("\\", "/"))
        .replace(/^\.\/+/, "");
      if (normalized === "." || normalized === "") {
        throw new Error(
          'Strict containment violation: write root "." is not allowed in strict containment',
        );
      }
      if (
        path.isAbsolute(root) ||
        root.startsWith("/") ||
        root.startsWith("\\") ||
        /^[a-zA-Z]:[/\\]/.test(root)
      ) {
        throw new Error(
          `Strict containment violation: absolute write root "${root}" is not allowed in strict containment`,
        );
      }
    }

    if (guard?.allow_native_subagents === true) {
      throw new Error(
        "Strict containment violation: allow_native_subagents must not be true in strict containment",
      );
    }

    if (guard?.deny_network_clients === false) {
      throw new Error(
        "Strict containment violation: deny_network_clients must not be false in strict containment",
      );
    }
  }

  // Compute description for later index inspection
  const desc = describeAppliedTemplate(mission, template);
  Object.defineProperty(result, APPLIED_META, {
    value: desc,
    enumerable: false,
    configurable: true,
    writable: true,
  });

  return result as AppliedMission<T>;
}

/**
 * Returns a small description record listing which template keys the mission overrode.
 */
export function describeAppliedTemplate(
  mission: Record<string, unknown>,
  template: SessionTemplate,
): AppliedTemplateDescription {
  // If the mission was already applied through applySessionTemplate, reuse stored metadata
  const storedMeta = (mission as Record<symbol, unknown>)[APPLIED_META] as
    | AppliedTemplateDescription
    | undefined;
  if (storedMeta && storedMeta.template_id === template.id) {
    return storedMeta;
  }

  const overridden: string[] = [];

  if (template.adapter !== undefined && mission.adapter !== undefined) {
    overridden.push("adapter");
  }

  if (template.attempts !== undefined && mission.attempts !== undefined) {
    overridden.push("attempts");
  }

  if (template.runtime_config_overrides !== undefined) {
    const missionOverrides = mission.runtime_config_overrides as
      | Record<string, unknown>
      | undefined;
    if (
      missionOverrides &&
      typeof missionOverrides === "object" &&
      Object.keys(missionOverrides).length > 0
    ) {
      overridden.push("runtime_config_overrides");
    }
  }

  if (template.limits !== undefined) {
    const missionLimits = mission.limits as
      | Record<string, unknown>
      | undefined;
    if (
      missionLimits &&
      typeof missionLimits === "object" &&
      Object.keys(missionLimits).length > 0
    ) {
      overridden.push("limits");
    }
  }

  if (template.recovery !== undefined) {
    const missionRecovery = mission.recovery as
      | Record<string, unknown>
      | undefined;
    if (
      missionRecovery &&
      typeof missionRecovery === "object" &&
      Object.keys(missionRecovery).length > 0
    ) {
      overridden.push("recovery");
    }
  }

  if (template.guard !== undefined) {
    const missionGuard = mission.guard as
      | Record<string, unknown>
      | undefined;
    if (
      missionGuard &&
      typeof missionGuard === "object" &&
      Object.keys(missionGuard).length > 0
    ) {
      overridden.push("guard");
    }
  }

  overridden.sort();

  return {
    template_id: template.id,
    tier: template.tier,
    containment: template.containment,
    overridden_by_mission: overridden,
  };
}
