import path from "node:path";
import type { ToolGuardFields } from "../schema/runtime-control.js";

/**
 * A guard is only ever narrowed.
 *
 * A team worker's guard is the parent mission's, narrowed by the worker's mission packet, its session template and its
 * own block, in that order. A layer can switch a restriction on, take a permission away, shrink the write roots to a
 * subset and add agent clients to deny; it can never switch a restriction off, grant a permission, or reach a root the
 * parent did not allow. A layer that tries to widen the write or read roots is refused, naming the worker.
 */
const RESTRICTIONS = ["deny_git_mutations", "deny_package_installs", "deny_network_clients", "deny_unknown_tools", "confine_reads", "deny_shell"] as const;
const PERMISSIONS = ["allow_native_subagents", "allow_code_tools", "allow_unconfined"] as const;

const slashed = (root: string) => path.posix.normalize(root.trim().replaceAll("\\", "/")).replace(/^\.\/+/, "").replace(/\/+$/, "") || ".";
const absolute = (root: string) => path.isAbsolute(root) || /^[a-zA-Z]:[\\/]/.test(root) || root.startsWith("/") || root.startsWith("\\");

/** Whether `child` is `parent` or lies under it. A relative `.` parent holds every relative root that stays inside the worker's folder. */
function within(child: string, parent: string): boolean {
  const c = slashed(child);
  const p = slashed(parent);
  if (absolute(child) || absolute(parent)) return absolute(child) && absolute(parent) && (c === p || c.startsWith(`${p}/`));
  if (c === ".." || c.startsWith("../")) return false;
  if (p === ".") return true;
  return c === p || c.startsWith(`${p}/`);
}

function narrowRoots(kind: "write" | "read", base: string[] | undefined, layer: string[] | undefined, who: string): string[] | undefined {
  if (layer === undefined) return base;
  // A parent that names no write roots allows the whole worker folder; one that names no read roots allows nothing beyond it.
  const allowed = base ?? (kind === "write" ? ["."] : []);
  for (const root of layer) {
    if (!allowed.some(parent => within(root, parent))) {
      throw new Error(`${who}: ${kind} root "${root}" is outside the team's ${kind} roots (${allowed.length > 0 ? allowed.join(", ") : "none"}); a worker's guard can only narrow its parent's`);
    }
  }
  return layer;
}

/** `layer` applied to `base`, never widening it. */
export function narrowGuard(base: ToolGuardFields | undefined, layer: ToolGuardFields | undefined, who: string): ToolGuardFields {
  const result: Record<string, unknown> = { ...(base ?? {}) };
  if (layer === undefined) return result as ToolGuardFields;
  for (const field of RESTRICTIONS) {
    if (layer[field] === true) result[field] = true;
  }
  for (const field of PERMISSIONS) {
    if (layer[field] === false && base?.[field] === true) result[field] = false;
  }
  const writeRoots = narrowRoots("write", base?.write_roots, layer.write_roots, who);
  if (writeRoots !== undefined) result.write_roots = writeRoots;
  const readRoots = narrowRoots("read", base?.read_roots, layer.read_roots, who);
  if (readRoots !== undefined) result.read_roots = readRoots;
  if (layer.agent_clients !== undefined) result.agent_clients = [...new Set([...(base?.agent_clients ?? []), ...layer.agent_clients])];
  return result as ToolGuardFields;
}

/**
 * A worker's guard from the layers it has, in order of authority: the team mission's (`parent`), the worker's own mission
 * packet (`packet`), its session template and its own block. Undefined when no layer has a guard at all.
 */
export function workerGuard(
  parent: ToolGuardFields | undefined,
  template: ToolGuardFields | undefined,
  own: ToolGuardFields | undefined,
  who: string,
  packet?: ToolGuardFields | undefined,
): ToolGuardFields | undefined {
  const layers = [packet, template, own];
  if (parent === undefined && layers.every(layer => layer === undefined)) return undefined;
  return layers.reduce<ToolGuardFields>((guard, layer) => narrowGuard(guard, layer, `worker ${who}`), { ...(parent ?? {}) });
}
