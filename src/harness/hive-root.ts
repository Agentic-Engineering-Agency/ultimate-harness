import path from "node:path";

/**
 * Resolve the uh project that owns `.harness` state for a directory.
 *
 * Team worker worktrees live at `<project>/.harness/missions/<team>/team/workers/<role>` and sandboxes at
 * `<project>/.harness/sandboxes/<id>/worktree`, so the project that owns a worker is the parent of the outermost
 * `.harness` segment in the worker's path. Git's common directory is not used: a uh project may itself be a linked
 * worktree of another checkout with its own, unrelated `.harness`, and that checkout must never receive this
 * project's hive, reviews or evidence.
 *
 * This module imports only `node:` builtins, so the guard hooks can depend on it without pulling the harness's
 * heavier modules into a snapshot.
 */

/**
 * The owning project for `root` when `root` lies inside a worker layout UH creates under that project's `.harness`
 * (`missions/<id>/team/...`, `sandboxes/<id>/...`), else undefined. A `.harness` folder that is merely an ancestor (a
 * project that lives under `~/.harness/projects/x`) does not make the folder above it an owner, and the folder name
 * is compared without regard to case only on Windows.
 */
export function mainCheckoutRoot(root: string): string | undefined {
  const parts = path.resolve(root).split(path.sep);
  const fold = (value: string): string => (process.platform === "win32" ? value.toLowerCase() : value);
  for (let index = 1; index < parts.length; index += 1) {
    if (fold(parts[index]) !== ".harness") continue;
    const area = fold(parts[index + 1] ?? "");
    const workerLayout = (area === "missions" && fold(parts[index + 3] ?? "") === "team") || area === "sandboxes";
    if (!workerLayout) continue;
    const owner = parts.slice(0, index).join(path.sep);
    return owner.length === 0 || owner.endsWith(":") ? `${owner}${path.sep}` : owner;
  }
  return undefined;
}

/** The project that owns `.harness` state for `root`: its enclosing project, or `root` itself. */
export function harnessOwnerRoot(root: string): string {
  return mainCheckoutRoot(root) ?? path.resolve(root);
}

/** The owning project's `.harness/hive` for `root`. */
export function harnessHiveDir(root: string): string {
  return path.join(harnessOwnerRoot(root), ".harness", "hive");
}

/** True when `root` lies inside another project's `.harness` (a worker worktree or sandbox). */
export function hasMainCheckout(root: string): boolean {
  return mainCheckoutRoot(root) !== undefined;
}
