import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enrichMissionPrompt,
  recordMissionExchange,
  flushPendingHonchoSaves,
  setHonchoClientFactory,
  resetHonchoExtensionForTests,
} from "../src/extensions/honcho-memory/index.js";
import {
  resolveHonchoMemoryConfig,
  normalizePositiveInteger,
  normalizeSessionStrategy,
} from "../src/extensions/honcho-memory/config.js";
import type {
  HonchoClient,
  HonchoPeer,
  HonchoSession,
  HonchoSessionContext,
  HonchoMessage,
} from "../src/extensions/honcho-memory/client.js";

/**
 * Stub Honcho client. Captures every call so the tests can assert exactly
 * what the extension would have sent to Honcho without any network.
 */
interface StubState {
  peerIds: string[];
  sessionKey: string | null;
  addedPeers: HonchoPeer[][];
  messages: { peer: string; text: string }[];
  contextRequests: number;
  contextResponse: HonchoSessionContext;
  contextError?: Error;
  addMessagesError?: Error;
}

const makeStub = (): { state: StubState; factory: () => HonchoClient } => {
  const state: StubState = {
    peerIds: [],
    sessionKey: null,
    addedPeers: [],
    messages: [],
    contextRequests: 0,
    contextResponse: {
      peerRepresentation: "user profile content",
      summary: { content: "project summary content" },
    },
  };

  const makePeer = (id: string): HonchoPeer => ({
    message(text: string): HonchoMessage {
      return { __peer: id, __text: text } as unknown as HonchoMessage;
    },
  });

  const session: HonchoSession = {
    addPeers: async (peers) => {
      state.addedPeers.push(peers);
    },
    context: async () => {
      state.contextRequests += 1;
      if (state.contextError) throw state.contextError;
      return state.contextResponse;
    },
    addMessages: async (messages) => {
      if (state.addMessagesError) throw state.addMessagesError;
      for (const m of messages) {
        const meta = m as unknown as { __peer: string; __text: string };
        state.messages.push({ peer: meta.__peer, text: meta.__text });
      }
    },
  };

  const client: HonchoClient = {
    peer: (id) => {
      state.peerIds.push(id);
      return makePeer(id);
    },
    session: (key) => {
      state.sessionKey = key;
      return session;
    },
  };

  return { state, factory: () => client };
};

const HONCHO_ENV_KEYS = [
  "HONCHO_ENABLED",
  "HONCHO_API_KEY",
  "HONCHO_URL",
  "HONCHO_WORKSPACE_ID",
  "HONCHO_PEER_NAME",
  "HONCHO_AI_PEER",
  "HONCHO_SESSION_STRATEGY",
  "HONCHO_CONTEXT_TOKENS",
  "HONCHO_MAX_MESSAGE_LENGTH",
  "HONCHO_SEARCH_LIMIT",
  "HONCHO_TOOL_PREVIEW_LENGTH",
] as const;

const savedEnv: Record<string, string | undefined> = {};
let savedHome: string | undefined;
let tmpHomeDir: string | undefined;

beforeEach(async () => {
  for (const key of HONCHO_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Isolate from the developer's real ~/.honcho/config.json so tests do
  // not silently pick up a live apiKey or workspace.
  savedHome = process.env.HOME;
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  tmpHomeDir = await mkdtemp(join(tmpdir(), "uh-honcho-home-"));
  process.env.HOME = tmpHomeDir;
  process.env.HONCHO_ENABLED = "false";
  resetHonchoExtensionForTests();
  setHonchoClientFactory(undefined);
});

afterEach(async () => {
  for (const key of HONCHO_ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (savedHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = savedHome;
  }
  if (tmpHomeDir) {
    const { rm } = await import("node:fs/promises");
    try {
      await rm(tmpHomeDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  resetHonchoExtensionForTests();
  setHonchoClientFactory(undefined);
});

describe("config", () => {
  test("normalizePositiveInteger accepts positive ints and falls back otherwise", () => {
    expect(normalizePositiveInteger(42, 0)).toBe(42);
    expect(normalizePositiveInteger("17", 0)).toBe(17);
    expect(normalizePositiveInteger(0, 9)).toBe(9);
    expect(normalizePositiveInteger(-3, 9)).toBe(9);
    expect(normalizePositiveInteger("not-a-number", 9)).toBe(9);
    expect(normalizePositiveInteger(undefined, 9)).toBe(9);
  });

  test("normalizeSessionStrategy clamps unknown values to repo", () => {
    expect(normalizeSessionStrategy("repo")).toBe("repo");
    expect(normalizeSessionStrategy("git-branch")).toBe("git-branch");
    expect(normalizeSessionStrategy("directory")).toBe("directory");
    expect(normalizeSessionStrategy("nonsense")).toBe("repo");
    expect(normalizeSessionStrategy(null)).toBe("repo");
  });

  test("resolveHonchoMemoryConfig honors env over defaults", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_WORKSPACE_ID = "custom-ws";
    process.env.HONCHO_PEER_NAME = "alice";
    process.env.HONCHO_AI_PEER = "uh-agent";
    process.env.HONCHO_SESSION_STRATEGY = "git-branch";
    process.env.HONCHO_CONTEXT_TOKENS = "256";

    const cfg = await resolveHonchoMemoryConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.apiKey).toBe("hch-test");
    expect(cfg.workspaceId).toBe("custom-ws");
    expect(cfg.userPeerId).toBe("alice");
    expect(cfg.aiPeerId).toBe("uh-agent");
    expect(cfg.sessionStrategy).toBe("git-branch");
    expect(cfg.contextTokens).toBe(256);
  });

  test("HONCHO_ENABLED=false disables even when key is present", async () => {
    process.env.HONCHO_ENABLED = "false";
    process.env.HONCHO_API_KEY = "hch-test";

    const cfg = await resolveHonchoMemoryConfig();
    expect(cfg.enabled).toBe(false);
  });
});

describe("enrichMissionPrompt", () => {
  test("returns prompt unchanged when extension is disabled", async () => {
    process.env.HONCHO_ENABLED = "false";
    const out = await enrichMissionPrompt("hello prompt", { cwd: process.cwd() });
    expect(out).toBe("hello prompt");
  });

  test("throws when HONCHO_ENABLED=true but no API key is set", async () => {
    process.env.HONCHO_ENABLED = "true";
    delete process.env.HONCHO_API_KEY;
    await expect(
      enrichMissionPrompt("hello prompt", { cwd: process.cwd() }),
    ).rejects.toThrow(/HONCHO_API_KEY/);
  });

  test("appends memory block when enabled and Honcho returns content", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_PEER_NAME = "alice";
    process.env.HONCHO_AI_PEER = "uh-agent";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    const out = await enrichMissionPrompt("Mission prompt body.", {
      cwd: process.cwd(),
      missionId: "M-test",
    });

    expect(out.startsWith("Mission prompt body.")).toBe(true);
    expect(out).toContain("[Persistent memory]");
    expect(out).toContain("User profile:\nuser profile content");
    expect(out).toContain("Project summary:\nproject summary content");
    expect(state.peerIds).toEqual(expect.arrayContaining(["alice", "uh-agent"]));
    expect(state.addedPeers).toHaveLength(1);
  });

  test("returns prompt unchanged on bootstrap network failure and warns", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setHonchoClientFactory(() => {
      throw new Error("network unreachable");
    });

    const out = await enrichMissionPrompt("prompt body", {
      cwd: process.cwd(),
      missionId: "M-fail",
    });
    expect(out).toBe("prompt body");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("returns prompt unchanged on memory-fetch failure", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, factory } = makeStub();
    state.contextError = new Error("fetch boom");
    setHonchoClientFactory(factory);

    const out = await enrichMissionPrompt("prompt body", {
      cwd: process.cwd(),
      missionId: "M-fetch-fail",
    });
    expect(out).toBe("prompt body");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("reuses cached memory across calls", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    await enrichMissionPrompt("first", { cwd: process.cwd() });
    await enrichMissionPrompt("second", { cwd: process.cwd() });
    await enrichMissionPrompt("third", { cwd: process.cwd() });

    expect(state.contextRequests).toBe(1);
  });

  test("does not append when Honcho returns empty memory", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { state, factory } = makeStub();
    state.contextResponse = {
      peerRepresentation: "",
      summary: { content: null },
    };
    setHonchoClientFactory(factory);

    const out = await enrichMissionPrompt("the prompt", { cwd: process.cwd() });
    expect(out).toBe("the prompt");
  });
});

describe("recordMissionExchange", () => {
  test("no-ops when extension is disabled", async () => {
    process.env.HONCHO_ENABLED = "false";
    // No factory needed — the call should never reach it.
    await recordMissionExchange("prompt", "final", { cwd: process.cwd() });
    await flushPendingHonchoSaves();
    // No throw, no calls — pass.
  });

  test("persists user+assistant exchange when enabled", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_PEER_NAME = "alice";
    process.env.HONCHO_AI_PEER = "uh-agent";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    await recordMissionExchange("user prompt body", "assistant final", {
      cwd: process.cwd(),
      missionId: "M-record",
    });
    await flushPendingHonchoSaves();

    expect(state.messages).toEqual([
      { peer: "alice", text: "user prompt body" },
      { peer: "uh-agent", text: "assistant final" },
    ]);
  });

  test("skips oversized messages above maxMessageLength", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_MAX_MESSAGE_LENGTH = "10";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    await recordMissionExchange(
      "this prompt is way too long to persist",
      "short ok",
      { cwd: process.cwd(), missionId: "M-trim" },
    );
    await flushPendingHonchoSaves();

    expect(state.messages).toEqual([{ peer: "ultimate-harness", text: "short ok" }]);
  });

  test("save failure does not throw and is logged", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, factory } = makeStub();
    state.addMessagesError = new Error("write boom");
    setHonchoClientFactory(factory);

    await recordMissionExchange("prompt", "final", {
      cwd: process.cwd(),
      missionId: "M-save-fail",
    });
    await flushPendingHonchoSaves();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
