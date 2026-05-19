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

export interface HonchoClientFactory {
  (init: {
    apiKey: string;
    baseURL?: string;
    workspaceId: string;
  }): HonchoClient;
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
 * Default factory: dynamically imports `@honcho-ai/sdk` so the package only
 * matters when Honcho is actually enabled. Tests pass a stub factory via
 * `bootstrapHonchoHandles(..., { factory })`.
 */
const defaultFactory: HonchoClientFactory = (init) => {
  // Lazy import — kept as `Function` so the top-level type-check does not
  // require `@honcho-ai/sdk` types at build time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod: { Honcho: new (opts: typeof init) => HonchoClient } = (() => {
    // node's CJS interop on `require` keeps this synchronous and predictable.
    // The dynamic import path keeps the SDK out of the static graph so that
    // `@honcho-ai/sdk` is effectively an optional runtime dep.
    const r = (Function("return require") as () => NodeRequire)();
    return r("@honcho-ai/sdk");
  })();
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
 * Throws when the config is enabled but unusable (missing key). Network
 * failures bubble up to the caller — `enrichMissionPrompt` translates those
 * into a stderr warning and a no-op.
 */
export const bootstrapHonchoHandles = async (
  config: HonchoMemoryConfig,
  options: BootstrapOptions,
): Promise<HonchoHandles> => {
  if (!config.enabled) {
    throw new Error(
      "bootstrapHonchoHandles called with disabled config — caller should short-circuit",
    );
  }
  if (!config.apiKey) {
    throw new Error(
      "HONCHO_ENABLED is true but HONCHO_API_KEY is missing — set the key or unset HONCHO_ENABLED",
    );
  }

  if (cachedHandles) {
    return cachedHandles;
  }
  if (inflight) {
    return inflight;
  }

  const factory = options.factory ?? defaultFactory;
  inflight = (async () => {
    const client = factory({
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
