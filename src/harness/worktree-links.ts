import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Remove every symbolic link and Windows junction inside a worktree without
 * following any of them, so that a later `git worktree remove` cannot reach
 * through a link.
 *
 * Git for Windows' `git worktree remove --force` recurses into a directory
 * junction and deletes the contents of its target, not the link: a
 * `node_modules` junction pointing at the main checkout empties the main
 * checkout's `node_modules`. `unlink` removes only the link itself (Node
 * reports junctions as symbolic links), so the target is left untouched.
 *
 * Walks the whole tree, never descending into a link. Returns the number of
 * links removed. Throws if a link cannot be removed; callers must then leave
 * the worktree in place rather than remove it.
 */
export async function removeWorktreeLinks(worktreePath: string): Promise<number> {
  let removed = 0;
  const pending = [worktreePath];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        await unlink(entryPath);
        removed += 1;
      } else if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return removed;
}
