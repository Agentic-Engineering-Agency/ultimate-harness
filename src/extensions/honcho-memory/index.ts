/**
 * Honcho persistent memory for UH adapters.
 *
 * Public surface used by runtime adapters (currently `oh-my-pi`). Designed
 * to be drop-in for `codex` and `hermes` once smoke-tested.
 *
 * Semantics:
 *   - Disabled config -> every public function is a no-op (prompt returned
 *     unchanged, exchanges dropped).
 *   - Enabled config with missing API key -> throws on first call so the
 *     operator sees the misconfiguration immediately.
 *   - Enabled config + network failure -> logged to stderr, mission run
 *     continues without memory. Cache stays warm with whatever it had.
 */

import {
  bootstrapHonchoHandles,
  clearHandles,
  getCachedHandles,
  HonchoConfigError,
  type HonchoClientFactory,
  type HonchoHandles,
} from "./client.js";
import {
  resolveHonchoMemoryConfig,
  type HonchoMemoryConfig,
} from "./config.js";
import {
  clearCachedMemory,
  enqueueExchangeSave,
  enqueueMemorySave,
  flushPendingHonchoSaves,
  getCachedMemoryBlock,
  refreshMemoryCache,
  searchHonchoMemory,
} from "./memory.js";

export {
  resolveHonchoMemoryConfig,
  flushPendingHonchoSaves,
  clearCachedMemory,
  clearHandles,
  getCachedMemoryBlock,
  HonchoConfigError,
};

export type { HonchoMemoryConfig, HonchoClientFactory, HonchoHandles };

const PROMPT_MEMORY_SEPARATOR = "\n\n";

let cachedConfig: HonchoMemoryConfig | null = null;
let cachedConfigPromise: Promise<HonchoMemoryConfig> | null = null;

/**
 * Resolve config once per process and cache it. Tests reset via
 * `resetHonchoExtensionForTests`.
 */
const getOrLoadConfig = async (): Promise<HonchoMemoryConfig> => {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (!cachedConfigPromise) {
    cachedConfigPromise = resolveHonchoMemoryConfig().then((c) => {
      cachedConfig = c;
      return c;
    });
  }
  return cachedConfigPromise;
};

/**
 * Reset all in-memory state. For tests, and for CLI commands that want to
 * pick up a config change without restarting the process.
 */
export const resetHonchoExtensionForTests = (): void => {
  cachedConfig = null;
  cachedConfigPromise = null;
  clearHandles();
  clearCachedMemory();
};

/** Override for the SDK factory. Tests inject a stub; production leaves unset. */
let factoryOverride: HonchoClientFactory | undefined;

export const setHonchoClientFactory = (
  factory: HonchoClientFactory | undefined,
): void => {
  factoryOverride = factory;
};

const warn = (msg: string, err?: unknown): void => {
  const detail = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : "";
  // Stderr only — adapters already pipe stderr into the mission artifacts.
  console.warn(`[honcho-memory] ${msg}${detail}`);
};

const ensureHandles = async (cwd: string): Promise<HonchoHandles | null> => {
  const config = await getOrLoadConfig();
  if (!config.enabled) {
    return null;
  }
  const cached = getCachedHandles();
  if (cached) {
    return cached;
  }
  return bootstrapHonchoHandles(config, {
    cwd,
    factory: factoryOverride,
  });
};

export interface EnrichOptions {
  /** Working directory used to derive the Honcho session key. */
  cwd: string;
  /** Stable identifier of the mission run, used in log messages only. */
  missionId?: string;
}

/**
 * Append the cached `[Persistent memory]` block to a mission prompt.
 *
 * - Returns the prompt unchanged when Honcho is disabled.
 * - Bootstraps + refreshes the cache on first call so the *first* mission of
 *   the process already sees memory (subsequent missions hit the cache).
 * - On any runtime failure: logs a warning and returns the prompt unchanged.
 */
export const enrichMissionPrompt = async (
  prompt: string,
  options: EnrichOptions,
): Promise<string> => {
  const block = await loadHonchoMemoryBlock(options);
  if (!block) return prompt;
  return `${prompt}${PROMPT_MEMORY_SEPARATOR}${block}`;
};

/**
 * UH-80 — read-side helper that returns the `[Persistent memory]` block (or
 * `null` when memory is disabled / empty / failed). Adapters that build a
 * {@link DispatchContext} call this and set `ctx.memoryBlock`; the prompt
 * renderer handles the append. Existing callers that work with raw prompt
 * strings keep using {@link enrichMissionPrompt} for back-compat.
 */
export const loadHonchoMemoryBlock = async (
  options: EnrichOptions,
): Promise<string | null> => {
  let handles: HonchoHandles | null;
  try {
    handles = await ensureHandles(options.cwd);
  } catch (err) {
    if (err instanceof HonchoConfigError) {
      throw err;
    }
    warn(`bootstrap failed; running ${options.missionId ?? "mission"} without memory`, err);
    return null;
  }
  if (!handles) {
    return null;
  }

  const cached = getCachedMemoryBlock();
  if (!cached) {
    try {
      await refreshMemoryCache(handles);
    } catch (err) {
      warn(
        `memory fetch failed; running ${options.missionId ?? "mission"} without memory`,
        err,
      );
      return null;
    }
  }

  const block = getCachedMemoryBlock();
  return block && block.length > 0 ? block : null;
};

export interface RecordOptions {
  cwd: string;
  missionId?: string;
}

/**
 * Persist a single mission exchange (`prompt -> finalMessage`) to Honcho.
 *
 * Saves are queued and serialized — call `flushPendingHonchoSaves` before
 * process exit to make sure outstanding writes land.
 */
export const recordMissionExchange = async (
  prompt: string,
  finalMessage: string,
  options: RecordOptions,
): Promise<void> => {
  let handles: HonchoHandles | null;
  try {
    handles = await ensureHandles(options.cwd);
  } catch (err) {
    if (err instanceof HonchoConfigError) {
      throw err;
    }
    warn(`bootstrap failed; skipping memory save for ${options.missionId ?? "mission"}`, err);
    return;
  }
  if (!handles) {
    return;
  }

  try {
    await enqueueExchangeSave(handles, prompt, finalMessage);
  } catch (err) {
    warn(`memory save failed for ${options.missionId ?? "mission"}`, err);
  }
};

// --- UH-137: honcho_search / honcho_remember mission-available tools ---
//
// MECHANISM (be honest about it): UH spawns each runtime as a subprocess CLI
// (omp/codex/...) and does NOT expose an MCP tool-calling channel the runtime
// can invoke mid-mission. So these are NOT model-callable MCP tools — they are
// HARNESS-SIDE operations built on the same Honcho client as enrich/record,
// surfaced through this module's memory hook. They share the exact posture as
// the rest of the surface: disabled config -> no-op; missing key -> throws
// HonchoConfigError; network failure -> stderr warning + graceful degradation
// (never fails the mission).

export interface ToolOptions {
  /** Working directory used to derive the Honcho session key. */
  cwd: string;
  /** Stable identifier of the mission run, used in log messages only. */
  missionId?: string;
}

/**
 * `honcho_search(query)` — return relevant prior context/memories.
 *
 * Returns an array of text snippets (possibly empty). Returns `[]` when Honcho
 * is disabled, has nothing relevant, or the network blips. Throws
 * `HonchoConfigError` only on operator misconfiguration (enabled + no key).
 */
export const honchoSearch = async (
  query: string,
  options: ToolOptions,
): Promise<string[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let handles: HonchoHandles | null;
  try {
    handles = await ensureHandles(options.cwd);
  } catch (err) {
    if (err instanceof HonchoConfigError) {
      throw err;
    }
    warn(`bootstrap failed; honcho_search returned no results for ${options.missionId ?? "mission"}`, err);
    return [];
  }
  if (!handles) {
    return [];
  }

  try {
    return await searchHonchoMemory(handles, trimmed);
  } catch (err) {
    warn(`honcho_search failed for ${options.missionId ?? "mission"}`, err);
    return [];
  }
};

/**
 * `honcho_remember(content)` — persist a free-form memory.
 *
 * Queued and serialized through the same save chain as
 * {@link recordMissionExchange}; call {@link flushPendingHonchoSaves} before
 * process exit to make sure the write lands. No-ops when Honcho is disabled or
 * the content is empty/oversized. Throws `HonchoConfigError` only on operator
 * misconfiguration; network failures are logged and swallowed.
 */
export const honchoRemember = async (
  content: string,
  options: ToolOptions,
): Promise<void> => {
  let handles: HonchoHandles | null;
  try {
    handles = await ensureHandles(options.cwd);
  } catch (err) {
    if (err instanceof HonchoConfigError) {
      throw err;
    }
    warn(`bootstrap failed; honcho_remember dropped for ${options.missionId ?? "mission"}`, err);
    return;
  }
  if (!handles) {
    return;
  }

  try {
    await enqueueMemorySave(handles, content);
  } catch (err) {
    warn(`honcho_remember failed for ${options.missionId ?? "mission"}`, err);
  }
};
