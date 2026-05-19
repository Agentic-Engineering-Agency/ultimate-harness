import { createHash } from "node:crypto";
import type { HonchoSessionStrategy } from "./config.js";
import { execGit } from "./git.js";

const HASH_LENGTH = 8;
const SSH_MATCH_INDEX = 1;

const shortHash = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, HASH_LENGTH);

/** Replace any character not in [a-zA-Z0-9_-] with an underscore. */
const sanitize = (input: string): string => input.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * Normalize a git remote URL to `owner/repo` form. Handles:
 *
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo.git
 *   ssh://git@github.com/owner/repo.git
 */
const normalizeGitUrl = (url: string): string | null => {
  const sshMatch = url.match(/^[^@]+@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[SSH_MATCH_INDEX] ?? null;
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
    if (path) {
      return path;
    }
  } catch {
    // not a parseable URL — fall through to null
  }

  return null;
};

const tryGitRemote = async (cwd: string): Promise<string | null> => {
  const result = await execGit(cwd, ["remote", "get-url", "origin"]);
  if (result?.code === 0 && result.stdout.trim()) {
    const normalized = normalizeGitUrl(result.stdout.trim());
    if (normalized) {
      // Hash the unsanitized normalized path so distinct remotes that would
      // otherwise collapse to the same sanitized form (e.g. `owner/repo`,
      // `owner.repo`, `owner_repo`) stay disjoint.
      return `${sanitize(`repo_${normalized}`)}_${shortHash(normalized)}`;
    }
  }
  return null;
};

const tryGitRoot = async (cwd: string): Promise<string | null> => {
  const result = await execGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (result?.code === 0 && result.stdout.trim()) {
    const root = result.stdout.trim();
    const basename = root.split("/").pop() ?? "repo";
    return sanitize(`local_${basename}_${shortHash(root)}`);
  }
  return null;
};

const tryGitBranch = async (cwd: string): Promise<string | null> => {
  const branchResult = await execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchResult || branchResult.code !== 0 || !branchResult.stdout.trim()) {
    return null;
  }

  const branch = branchResult.stdout.trim();
  if (branch !== "HEAD") {
    // Same collision concern as remote URLs: hash the unsanitized branch so
    // `feat/foo` and `feat_foo` produce different keys.
    return `${sanitize(branch)}_${shortHash(branch)}`;
  }

  const commitResult = await execGit(cwd, ["rev-parse", "--short", "HEAD"]);
  if (commitResult?.code === 0 && commitResult.stdout.trim()) {
    return sanitize(`detached_${commitResult.stdout.trim()}`);
  }

  return null;
};

const deriveRepoScopedKey = async (cwd: string): Promise<string> => {
  const remoteKey = await tryGitRemote(cwd);
  if (remoteKey) {
    return remoteKey;
  }
  const rootKey = await tryGitRoot(cwd);
  if (rootKey) {
    return rootKey;
  }
  const basename = cwd.split("/").pop() ?? "project";
  return sanitize(`cwd_${basename}_${shortHash(cwd)}`);
};

const deriveDirectoryScopedKey = (cwd: string): string => {
  const basename = cwd.split("/").pop() ?? "project";
  return sanitize(`cwd_${basename}_${shortHash(cwd)}`);
};

/**
 * Derive a stable Honcho session key from the current working directory.
 *
 * Strategies:
 *   - `repo`: share memory across worktrees of the same repo (remote first,
 *     then root, then cwd hash).
 *   - `git-branch`: same as `repo` but suffixed with the current branch so
 *     each branch keeps its own memory.
 *   - `directory`: scope to the literal cwd. Used when there is no useful
 *     repo signal or the caller wants per-directory isolation.
 */
export const deriveHonchoSessionKey = async (
  cwd: string,
  sessionStrategy: HonchoSessionStrategy,
): Promise<string> => {
  if (sessionStrategy === "directory") {
    return deriveDirectoryScopedKey(cwd);
  }

  const repoKey = await deriveRepoScopedKey(cwd);
  if (sessionStrategy === "git-branch") {
    const branch = await tryGitBranch(cwd);
    if (branch) {
      return `${repoKey}__branch_${branch}`;
    }
  }

  return repoKey;
};
