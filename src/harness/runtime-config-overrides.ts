import type { MissionDocument } from "../schema/mission.js";

/**
 * UH-81 — merge mission-level `runtime_config_overrides` with optional
 * CLI-time extras. CLI extras win (later spread = higher precedence) so
 * `uh mission run --runtime-config-overrides '{"model":"x"}'` overrides
 * what the mission file says, mirroring how the adapter merges its own
 * defaults under the mission's overrides.
 */
export function mergeRuntimeConfigOverrides(
  mission: MissionDocument,
  extra?: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...mission.runtime_config_overrides,
    ...(extra ?? {}),
  };
}

/**
 * UH-81 — parse a `--runtime-config-overrides <json>` CLI value into a
 * record. Throws with an operator-friendly message on invalid JSON or a
 * non-object shape (array, null, primitive). The thrown message is what
 * the CLI prints under `[BLOCKED]`, so it must read as instruction, not
 * as a stack trace.
 */
export function parseRuntimeConfigOverridesJson(
  raw: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `--runtime-config-overrides: invalid JSON: ${(e as Error).message}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const shape = parsed === null
      ? "null"
      : Array.isArray(parsed)
        ? "array"
        : typeof parsed;
    throw new Error(
      `--runtime-config-overrides: must be a JSON object, got ${shape}`,
    );
  }
  return parsed as Record<string, unknown>;
}