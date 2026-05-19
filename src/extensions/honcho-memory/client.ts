import type { HonchoMemoryConfig } from "./config.js";
import { deriveHonchoSessionKey } from "./session-key.js";

/**
 * Structural type for the bits of the Honcho SDK we depend on. Declared
 * locally so the rest of UH does not need ambient types for an optional dep,
 * and so consumers can stub it cleanly in tests.
 */
export interface HonchoPeer {
  message: (text: string) => HonchoMessage;
}

export interface HonchoMessage {
  // Opaque to UH; the SDK accepts message handles in `session.addMessages`.
  readonly __brand?: "honcho-message";
}

export interface HonchoSessionContext {
  peerRepresentation?: string | null;
  summary?: { content?: string | null } | null;
}

export interface HonchoSession {
  addPeers: (peers: HonchoPeer[]) => Promise<unknown>;
  context: (opts: {
    summary?: boolean;
    peerPerspective?: HonchoPeer;
    peerTarget?: HonchoPeer;
    tokens?: number;
  }) => Promise<HonchoSessionContext>;
  addMessages: (messages: HonchoMessage[]) => Promise<unknown>;
}

export interface HonchoClient {
  peer: (id: string) => HonchoPeer | Promise<HonchoPeer>;
  session: (key: string) => HonchoSession | Promise<HonchoSession>;
}

/**
 * Factory may be synchronous (test stubs) or asynchronous (real SDK loaded
 * via dynamic import). Callers always `await` the result.
 */
export interface HonchoClientFactory {
  (init: {
    apiKey: string;
    baseURL?: string;
    workspaceId: string;
  }): HonchoClient | Promise<HonchoClient>;
}

export interface HonchoHandles {
  client: HonchoClient;
  userPeer: HonchoPeer;
  aiPeer: HonchoPeer;
  session: HonchoSession;
  sessionKey: string;
  config: HonchoMemoryConfig;
}

/**
 * Operator-actionable configuration error. The public surface throws this
 * specific class for missing/unusable config so callers can decide whether
 * to surface or swallow without resorting to error-message string matching.
 */
export class HonchoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HonchoConfigError";
  }
}

/**
 * Default factory: dynamically imports `@honcho-ai/sdk` so the package only
 * matters when Honcho is actually enabled. Real ESM dynamic import — works
 * under Node ≥20 ESM, Bun, and tsc/NodeNext. Tests pass a stub factory via
 * `bootstrapHonchoHandles(..., { factory })` and never exercise this path.
 *
 * The factory is exported so tests can verify the import path resolves (the
 * default path is otherwise untouched by the stub-driven unit tests).
 */
export const defaultHonchoClientFactory: HonchoClientFactory = async (init) => {
  const mod = (await import("@honcho-ai/sdk")) as unknown as {
    Honcho: new (opts: typeof init) => HonchoClient;
  };
  return new mod.Honcho({
    apiKey: init.apiKey,
    baseURL: init.baseURL,
    workspaceId: init.workspaceId,
  });
};

let cachedHandles: HonchoHandles | null = null;
let inflight: Promise<HonchoHandles> | null = null;

export const getCachedHandles = (): HonchoHandles | null => cachedHandles;

export const clearHandles = (): void => {
  cachedHandles = null;
  inflight = null;
};

export interface BootstrapOptions {
  cwd: string;
  factory?: HonchoClientFactory;
}

/**
 * Build (or return cached) Honcho handles for the active session.
 *
 * Bootstrap is idempotent and de-duplicates concurrent callers: two adapter
 * runs starting at the same time share the in-flight bootstrap promise so we
 * never spawn two clients or two `session.addPeers` round-trips.
 *
 * Throws `HonchoConfigError` when the config is enabled but unusable
 * (missing key). Network failures bubble up as ordinary `Error`s — the
 * public `enrichMissionPrompt` / `recordMissionExchange` translate those
 * into a stderr warning and a no-op, while config errors propagate so the
 * operator sees the misconfiguration immediately.
 */
export const bootstrapHonchoHandles = async (
  config: HonchoMemoryConfig,
  options: BootstrapOptions,
): Promise<HonchoHandles> => {
  if (!config.enabled) {
    throw new HonchoConfigError(
      "bootstrapHonchoHandles called with disabled config — caller should short-circuit",
    );
  }
  if (!config.apiKey) {
    throw new HonchoConfigError(
      "HONCHO_ENABLED is true but HONCHO_API_KEY is missing — set the key or unset HONCHO_ENABLED",
    );
  }

  if (cachedHandles) {
    return cachedHandles;
  }
  if (inflight) {
    return inflight;
  }

  const factory = options.factory ?? defaultHonchoClientFactory;
  inflight = (async () => {
    const client = await factory({
      apiKey: config.apiKey!,
      baseURL: config.baseURL,
      workspaceId: config.workspaceId,
    });
    const sessionKey = await deriveHonchoSessionKey(
      options.cwd,
      config.sessionStrategy,
    );

    const [userPeer, aiPeer, session] = await Promise.all([
      Promise.resolve(client.peer(config.userPeerId)),
      Promise.resolve(client.peer(config.aiPeerId)),
      Promise.resolve(client.session(sessionKey)),
    ]);

    await session.addPeers([userPeer, aiPeer]);

    cachedHandles = {
      client,
      userPeer,
      aiPeer,
      session,
      sessionKey,
      config,
    };
    return cachedHandles;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
};
