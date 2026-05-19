import type { HonchoHandles, HonchoMessage, HonchoSessionContext } from "./client.js";

/**
 * In-process memory cache + sequenced save queue.
 *
 * The cache holds the most recent `[Persistent memory]` block fetched from
 * Honcho. `refreshMemoryCache` populates it once per session start; the cache
 * is used by `getCachedMemoryBlock` to avoid network latency on every prompt.
 *
 * Saves are serialized through a single promise chain so consecutive
 * `agent_end`-style events never race each other.
 */

const PERSISTENT_MEMORY_HEADER = "[Persistent memory]";
const USER_PROFILE_LABEL = "User profile";
const PROJECT_SUMMARY_LABEL = "Project summary";

export interface CachedMemoryParts {
  userProfile: string | null;
  projectSummary: string | null;
}

const EMPTY_MEMORY: CachedMemoryParts = {
  userProfile: null,
  projectSummary: null,
};

let cachedMemory: CachedMemoryParts = EMPTY_MEMORY;

const normalizeMemoryText = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
};

export const buildCachedMemoryParts = (
  context: HonchoSessionContext,
): CachedMemoryParts => ({
  userProfile: normalizeMemoryText(context.peerRepresentation),
  projectSummary: normalizeMemoryText(context.summary?.content),
});

const buildCombinedMemoryBlock = (parts: CachedMemoryParts): string | null => {
  const sections = [
    parts.userProfile ? `${USER_PROFILE_LABEL}:\n${parts.userProfile}` : null,
    parts.projectSummary
      ? `${PROJECT_SUMMARY_LABEL}:\n${parts.projectSummary}`
      : null,
  ].filter((section): section is string => section !== null);

  if (sections.length === 0) {
    return null;
  }
  return `${PERSISTENT_MEMORY_HEADER}\n${sections.join("\n\n")}`;
};

export const getCachedMemoryBlock = (): string | null =>
  buildCombinedMemoryBlock(cachedMemory);

export const clearCachedMemory = (): void => {
  cachedMemory = EMPTY_MEMORY;
};

/**
 * Test-only: directly seed the in-memory cache so we can assert injection
 * without round-tripping through a stub Honcho client. Production code never
 * imports this — `refreshMemoryCache` is the only legitimate write path.
 */
export const __setCachedMemoryForTests = (parts: CachedMemoryParts): void => {
  cachedMemory = parts;
};

/**
 * Fetch the user profile + project summary from Honcho and cache them.
 *
 * Called once per session start. The project summary is intentionally frozen
 * for the lifetime of the cache — mid-session context comes from the
 * conversation history itself, not from re-querying memory each turn.
 */
export const refreshMemoryCache = async (
  handles: HonchoHandles,
): Promise<void> => {
  const ctx = await handles.session.context({
    summary: true,
    peerPerspective: handles.aiPeer,
    peerTarget: handles.userPeer,
    tokens: handles.config.contextTokens,
  });
  cachedMemory = buildCachedMemoryParts(ctx);
};

// --- Sequenced save queue ---

let pendingSave: Promise<void> = Promise.resolve();

const enqueue = (fn: () => Promise<void>): Promise<void> => {
  pendingSave = pendingSave.then(fn, () => fn());
  return pendingSave;
};

/**
 * Resolves when every save scheduled before this call has settled. Always
 * resolves — never rejects — so callers (CLI shutdown, adapter `finally`
 * blocks) can wait unconditionally without an extra try/catch.
 */
export const flushPendingHonchoSaves = (): Promise<void> =>
  pendingSave.then(
    () => undefined,
    () => undefined,
  );

/**
 * Save a single `(user prompt, assistant final message)` exchange to Honcho.
 *
 * Skips empty text and messages above `maxMessageLength` to keep oversize
 * tool dumps / pastes out of long-term memory. Failures are swallowed (and
 * surfaced by the caller as a stderr warning) so a transient Honcho error
 * never fails the mission run.
 */
export const enqueueExchangeSave = (
  handles: HonchoHandles,
  prompt: string,
  finalMessage: string,
): Promise<void> => {
  const exchanges: Array<{ peer: HonchoHandles["userPeer"]; text: string }> = [];
  const max = handles.config.maxMessageLength;

  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt && trimmedPrompt.length <= max) {
    exchanges.push({ peer: handles.userPeer, text: trimmedPrompt });
  }

  const trimmedFinal = finalMessage.trim();
  if (trimmedFinal && trimmedFinal.length <= max) {
    exchanges.push({ peer: handles.aiPeer, text: trimmedFinal });
  }

  if (exchanges.length === 0) {
    return Promise.resolve();
  }

  return enqueue(async () => {
    const messages: HonchoMessage[] = exchanges.map((e) => e.peer.message(e.text));
    await handles.session.addMessages(messages);
  });
};
