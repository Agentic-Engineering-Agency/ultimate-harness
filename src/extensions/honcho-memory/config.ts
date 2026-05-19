import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

/**
 * Honcho memory extension config for the UH harness.
 *
 * Mirrors the env surface of `@agney/pi-honcho-memory` so a single
 * `~/.honcho/config.json` can drive both the pi extension and this UH-side
 * adapter integration. The UH host lives under `hosts.uh` so peers and
 * workspaces stay independent from the pi extension's `hosts.pi`.
 */

export type HonchoSessionStrategy = "repo" | "git-branch" | "directory";

export const DEFAULT_CONTEXT_TOKENS = 1200;
export const DEFAULT_MAX_MESSAGE_LENGTH = 8000;
export const DEFAULT_SEARCH_LIMIT = 8;
export const DEFAULT_TOOL_PREVIEW_LENGTH = 500;

export const DEFAULT_WORKSPACE_ID = "uh";
export const DEFAULT_AI_PEER = "ultimate-harness";

export interface HonchoMemoryConfig {
  enabled: boolean;
  apiKey?: string;
  baseURL?: string;
  workspaceId: string;
  userPeerId: string;
  aiPeerId: string;
  sessionStrategy: HonchoSessionStrategy;
  contextTokens: number;
  maxMessageLength: number;
  searchLimit: number;
  toolPreviewLength: number;
}

interface ConfigFileHost {
  workspace?: string;
  aiPeer?: string;
  endpoint?: string;
  sessionStrategy?: HonchoSessionStrategy;
  contextTokens?: number;
  maxMessageLength?: number;
  searchLimit?: number;
  toolPreviewLength?: number;
}

interface ConfigFile {
  apiKey?: string;
  peerName?: string;
  hosts?: {
    uh?: ConfigFileHost;
    pi?: ConfigFileHost;
  };
}

const CONFIG_PATH = join(homedir(), ".honcho", "config.json");
const SESSION_STRATEGIES = ["repo", "git-branch", "directory"] as const;

const isSessionStrategy = (value: string): value is HonchoSessionStrategy =>
  SESSION_STRATEGIES.some((strategy) => strategy === value);

export const normalizePositiveInteger = (
  value: number | string | null | undefined,
  fallback: number,
): number => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
};

export const readConfigFile = async (): Promise<ConfigFile | null> => {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ConfigFile;
    }
    return null;
  } catch {
    return null;
  }
};

export const normalizeSessionStrategy = (
  value: string | null | undefined,
): HonchoSessionStrategy => {
  if (value && isSessionStrategy(value)) {
    return value;
  }
  return "repo";
};

export const getSessionStrategyLabel = (strategy: HonchoSessionStrategy): string => {
  const labels: Record<HonchoSessionStrategy, string> = {
    repo: "Repo",
    "git-branch": "Git branch",
    directory: "Directory",
  };
  return labels[strategy];
};

export const getHonchoConfigPath = (): string => CONFIG_PATH;

/**
 * Resolve effective Honcho memory config.
 *
 * Source priority (highest first):
 *   1. Environment variables (`HONCHO_*`)
 *   2. `~/.honcho/config.json` under `hosts.uh` (with `hosts.pi` as fallback so
 *      a developer already running the pi extension does not have to duplicate
 *      every host setting just to enable UH).
 *
 * The `enabled` flag:
 *   - if `HONCHO_ENABLED` is set, it wins ("true" → enabled, anything else → off)
 *   - otherwise enabled iff an API key is resolvable
 */
export const resolveHonchoMemoryConfig = async (): Promise<HonchoMemoryConfig> => {
  const file = await readConfigFile();
  const uhHost = file?.hosts?.uh;
  const piHost = file?.hosts?.pi;

  const enabledEnv = process.env.HONCHO_ENABLED;
  const apiKey = process.env.HONCHO_API_KEY ?? file?.apiKey ?? undefined;
  const enabled = enabledEnv !== undefined ? enabledEnv === "true" : Boolean(apiKey);

  const baseURL =
    process.env.HONCHO_URL ?? uhHost?.endpoint ?? piHost?.endpoint ?? undefined;
  const workspaceId =
    process.env.HONCHO_WORKSPACE_ID ??
    uhHost?.workspace ??
    DEFAULT_WORKSPACE_ID;
  const userPeerId =
    process.env.HONCHO_PEER_NAME ??
    file?.peerName ??
    userInfo().username ??
    "user";
  const aiPeerId =
    process.env.HONCHO_AI_PEER ?? uhHost?.aiPeer ?? DEFAULT_AI_PEER;
  const sessionStrategy = normalizeSessionStrategy(
    process.env.HONCHO_SESSION_STRATEGY ??
      uhHost?.sessionStrategy ??
      piHost?.sessionStrategy,
  );
  const contextTokens = normalizePositiveInteger(
    process.env.HONCHO_CONTEXT_TOKENS ?? uhHost?.contextTokens,
    DEFAULT_CONTEXT_TOKENS,
  );
  const maxMessageLength = normalizePositiveInteger(
    process.env.HONCHO_MAX_MESSAGE_LENGTH ?? uhHost?.maxMessageLength,
    DEFAULT_MAX_MESSAGE_LENGTH,
  );
  const searchLimit = normalizePositiveInteger(
    process.env.HONCHO_SEARCH_LIMIT ?? uhHost?.searchLimit,
    DEFAULT_SEARCH_LIMIT,
  );
  const toolPreviewLength = normalizePositiveInteger(
    process.env.HONCHO_TOOL_PREVIEW_LENGTH ?? uhHost?.toolPreviewLength,
    DEFAULT_TOOL_PREVIEW_LENGTH,
  );

  return {
    enabled,
    apiKey,
    baseURL,
    workspaceId,
    userPeerId,
    aiPeerId,
    sessionStrategy,
    contextTokens,
    maxMessageLength,
    searchLimit,
    toolPreviewLength,
  };
};
