import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  enrichMissionPrompt,
  recordMissionExchange,
  flushPendingHonchoSaves,
  setHonchoClientFactory,
  resetHonchoExtensionForTests,
  honchoSearch,
  honchoRemember,
  HonchoConfigError,
} from "../src/extensions/honcho-memory/index.js";
import {
  resolveHonchoMemoryConfig,
  normalizePositiveInteger,
  normalizeSessionStrategy,
} from "../src/extensions/honcho-memory/config.js";
import { defaultHonchoClientFactory } from "../src/extensions/honcho-memory/client.js";
import { deriveHonchoSessionKey } from "../src/extensions/honcho-memory/session-key.js";
import { planOhMyPiRun } from "../src/adapters/oh-my-pi.js";
import type {
  HonchoClient,
  HonchoPeer,
  HonchoSession,
  HonchoSessionContext,
  HonchoMessage,
} from "../src/extensions/honcho-memory/client.js";

const execFileP = promisify(execFile);

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
  // UH-137 — search tool stub state.
  searchQueries: { query: string; limit?: number }[];
  searchResponse: { content?: string | null }[];
  searchError?: Error;
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
    searchQueries: [],
    searchResponse: [],
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
    search: async (query, opts) => {
      state.searchQueries.push({ query, limit: opts?.limit });
      if (state.searchError) throw state.searchError;
      return state.searchResponse;
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

describe("honcho_search / honcho_remember tools (UH-137)", () => {
  test("honchoSearch returns [] when extension is disabled", async () => {
    process.env.HONCHO_ENABLED = "false";
    const out = await honchoSearch("anything", { cwd: process.cwd() });
    expect(out).toEqual([]);
  });

  test("honchoSearch returns [] for an empty query without touching the client", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    const out = await honchoSearch("   ", { cwd: process.cwd() });
    expect(out).toEqual([]);
    expect(state.searchQueries).toHaveLength(0);
  });

  test("honchoSearch returns trimmed snippets and honors searchLimit", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_SEARCH_LIMIT = "3";
    const { state, factory } = makeStub();
    state.searchResponse = [
      { content: "  first hit  " },
      { content: "" },
      { content: null },
      { content: "second hit" },
    ];
    setHonchoClientFactory(factory);

    const out = await honchoSearch("how does X work", {
      cwd: process.cwd(),
      missionId: "M-search",
    });
    expect(out).toEqual(["first hit", "second hit"]);
    expect(state.searchQueries).toEqual([{ query: "how does X work", limit: 3 }]);
  });

  test("honchoSearch truncates snippets to toolPreviewLength", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_TOOL_PREVIEW_LENGTH = "5";
    const { state, factory } = makeStub();
    state.searchResponse = [{ content: "abcdefghij" }];
    setHonchoClientFactory(factory);

    const out = await honchoSearch("q", { cwd: process.cwd() });
    expect(out).toEqual(["abcde"]);
  });

  test("honchoSearch degrades to [] on network failure and warns", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, factory } = makeStub();
    state.searchError = new Error("search boom");
    setHonchoClientFactory(factory);

    const out = await honchoSearch("q", { cwd: process.cwd(), missionId: "M-search-fail" });
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("honchoSearch fail-fast surfaces HonchoConfigError when key missing", async () => {
    process.env.HONCHO_ENABLED = "true";
    delete process.env.HONCHO_API_KEY;
    await expect(
      honchoSearch("q", { cwd: process.cwd() }),
    ).rejects.toBeInstanceOf(HonchoConfigError);
  });

  test("honchoRemember no-ops when extension is disabled", async () => {
    process.env.HONCHO_ENABLED = "false";
    await honchoRemember("a memory", { cwd: process.cwd() });
    await flushPendingHonchoSaves();
    // No throw, no calls — pass.
  });

  test("honchoRemember persists content attributed to the user peer", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_PEER_NAME = "alice";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    await honchoRemember("remember this fact", {
      cwd: process.cwd(),
      missionId: "M-remember",
    });
    await flushPendingHonchoSaves();

    expect(state.messages).toEqual([{ peer: "alice", text: "remember this fact" }]);
  });

  test("honchoRemember skips empty/oversized content", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    process.env.HONCHO_MAX_MESSAGE_LENGTH = "5";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    await honchoRemember("   ", { cwd: process.cwd() });
    await honchoRemember("way too long to keep", { cwd: process.cwd() });
    await flushPendingHonchoSaves();

    expect(state.messages).toEqual([]);
  });

  test("honchoRemember save failure does not throw and is logged", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, factory } = makeStub();
    state.addMessagesError = new Error("write boom");
    setHonchoClientFactory(factory);

    await honchoRemember("a memory", { cwd: process.cwd(), missionId: "M-remember-fail" });
    await flushPendingHonchoSaves();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("per-mission opt-out runtime_config.honcho_memory (UH-137)", () => {
  /**
   * Build an oh-my-pi adapter + mission fixture, optionally setting
   * `runtime_config.honcho_memory`. Returns the mission path and root.
   */
  const buildFixture = async (honchoMemory: boolean | undefined): Promise<{ root: string; missionPath: string }> => {
    const root = await mkdtemp(join(tmpdir(), "uh-honcho-optout-"));
    const adapterDir = join(root, ".harness", "adapters");
    await mkdir(adapterDir, { recursive: true });
    const honchoLine =
      honchoMemory === undefined ? "" : `\n    honcho_memory: ${honchoMemory}`;
    await writeFile(
      join(adapterDir, "oh-my-pi.yaml"),
      `schema_version: uh.adapter.v0\nid: oh-my-pi\nname: oh-my-pi\nruntime: oh-my-pi\ncapabilities:\n  - cli-execution\nstatus: experimental\nconfig:\n  cli_command: omp\n  default_toolsets: []\n  default_provider: ""\n  default_model: ""\n  worktree_mode: false\n  pass_session_id: false\n  runtime_config:\n    mode: json\n    thinking: ""\n    allow_extensions: false\n    allow_skills: false${honchoLine}\n`,
      "utf-8",
    );
    const missionDir = join(root, ".harness", "missions", "M-optout-test");
    await mkdir(missionDir, { recursive: true });
    const missionPath = join(missionDir, "mission.yaml");
    await writeFile(
      missionPath,
      `schema_version: uh.mission.v0\nid: M-optout-test\nname: Opt-out test\ndescription: Verify honcho_memory opt-out gating.\nworkflow_profile: default\nissues: []\nread_first: []\nexpected_artifacts: []\nverification:\n  checks: []\n`,
      "utf-8",
    );
    return { root, missionPath };
  };

  test("honcho_memory:false skips enrich (no [Persistent memory], no client search)", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    const { root, missionPath } = await buildFixture(false);
    try {
      const plan = await planOhMyPiRun(root, missionPath);
      expect(plan.honchoMemoryEnabled).toBe(false);
      expect(plan.prompt).not.toContain("[Persistent memory]");
      expect(plan.prompt).toBe(plan.basePrompt);
      // No bootstrap, no context fetch — Honcho was never touched.
      expect(state.peerIds).toHaveLength(0);
      expect(state.contextRequests).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("honcho_memory omitted defaults ON (enrich runs)", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { state, factory } = makeStub();
    setHonchoClientFactory(factory);

    const { root, missionPath } = await buildFixture(undefined);
    try {
      const plan = await planOhMyPiRun(root, missionPath);
      expect(plan.honchoMemoryEnabled).toBe(true);
      expect(plan.prompt).toContain("[Persistent memory]");
      expect(state.contextRequests).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("honcho_memory:true keeps enrich ON", async () => {
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { factory } = makeStub();
    setHonchoClientFactory(factory);

    const { root, missionPath } = await buildFixture(true);
    try {
      const plan = await planOhMyPiRun(root, missionPath);
      expect(plan.honchoMemoryEnabled).toBe(true);
      expect(plan.prompt).toContain("[Persistent memory]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a non-boolean honcho_memory fails strict validation", async () => {
    // The bad value sits in the adapter manifest's runtime_config, so the
    // strict per-runtime schema rejects it at manifest-load (fail-fast) with a
    // message naming the offending key.
    const { root, missionPath } = await buildFixture("yes" as unknown as boolean);
    try {
      await expect(planOhMyPiRun(root, missionPath)).rejects.toThrow(
        /honcho_memory: Invalid input: expected boolean/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("QA regression fixes", () => {
  test("fail-fast surfaces HonchoConfigError, not a generic Error", async () => {
    process.env.HONCHO_ENABLED = "true";
    delete process.env.HONCHO_API_KEY;
    await expect(
      enrichMissionPrompt("p", { cwd: process.cwd() }),
    ).rejects.toBeInstanceOf(HonchoConfigError);
  });

  test("HOME override actually isolates ~/.honcho/config.json", async () => {
    // Write a fake config into the tmp HOME the global beforeEach set up.
    // resolveHonchoMemoryConfig must read THAT file, not the developer's
    // real ~/.honcho/config.json. Pre-fix this leaked because CONFIG_PATH
    // was frozen at module load.
    const home = process.env.HOME;
    expect(home).toBeDefined();
    const cfgDir = join(home as string, ".honcho");
    await mkdir(cfgDir, { recursive: true });
    await writeFile(
      join(cfgDir, "config.json"),
      JSON.stringify({
        apiKey: "leaked-from-tmp-home",
        peerName: "tmp-user",
        hosts: { uh: { workspace: "tmp-ws" } },
      }),
      "utf-8",
    );

    resetHonchoExtensionForTests();
    const cfg = await resolveHonchoMemoryConfig();
    expect(cfg.apiKey).toBe("leaked-from-tmp-home");
    expect(cfg.workspaceId).toBe("tmp-ws");
    expect(cfg.userPeerId).toBe("tmp-user");
  });

  test("defaultHonchoClientFactory resolves @honcho-ai/sdk via real dynamic import", async () => {
    // Pre-fix this was `Function("return require")(...)`, which throws under
    // Node ESM (where `require` is undefined in module scope). This test
    // pins the prod code path so a future regression cannot ship green.
    const client = await defaultHonchoClientFactory({
      apiKey: "hch-test",
      workspaceId: "uh",
    });
    expect(typeof client.peer).toBe("function");
    expect(typeof client.session).toBe("function");
  });

  test("session-key derivation does not collide across plausible remote URLs", async () => {
    // Two repos whose normalized remotes (`owner/repo` vs `owner_repo`) used
    // to sanitize to the same `repo_owner_repo` key. Each must now produce a
    // distinct hash-suffixed key.
    const makeRepo = async (origin: string): Promise<string> => {
      const dir = await mkdtemp(join(tmpdir(), "uh-honcho-key-"));
      await execFileP("git", ["-C", dir, "init", "--quiet"]);
      await execFileP("git", ["-C", dir, "remote", "add", "origin", origin]);
      return dir;
    };
    const slashRepo = await makeRepo("https://example.com/owner/repo.git");
    const underscoreRepo = await makeRepo("https://example.com/owner_repo.git");
    try {
      const slashKey = await deriveHonchoSessionKey(slashRepo, "repo");
      const underscoreKey = await deriveHonchoSessionKey(underscoreRepo, "repo");
      expect(slashKey).not.toBe(underscoreKey);
      expect(slashKey.startsWith("repo_owner_repo_")).toBe(true);
      expect(underscoreKey.startsWith("repo_owner_repo_")).toBe(true);
    } finally {
      await rm(slashRepo, { recursive: true, force: true });
      await rm(underscoreRepo, { recursive: true, force: true });
    }
  });

  test("planOhMyPiRun returns enriched prompt AND base prompt distinctly", async () => {
    // Pre-fix the adapter passed the enriched prompt (containing the
    // injected memory block) back to Honcho as the user message, which
    // would recursively bloat memory on every subsequent run. The plan
    // now exposes both `prompt` (enriched, sent to the runtime) and
    // `basePrompt` (the raw mission prompt, persisted to Honcho).
    process.env.HONCHO_ENABLED = "true";
    process.env.HONCHO_API_KEY = "hch-test";
    const { factory } = makeStub();
    setHonchoClientFactory(factory);

    const root = await mkdtemp(join(tmpdir(), "uh-honcho-plan-"));
    try {
      const adapterDir = join(root, ".harness", "adapters");
      await mkdir(adapterDir, { recursive: true });
      await writeFile(
        join(adapterDir, "oh-my-pi.yaml"),
        `schema_version: uh.adapter.v0\nid: oh-my-pi\nname: oh-my-pi\nruntime: oh-my-pi\ncapabilities:\n  - cli-execution\nstatus: experimental\nconfig:\n  cli_command: omp\n  default_toolsets: []\n  default_provider: ""\n  default_model: ""\n  worktree_mode: false\n  pass_session_id: false\n  runtime_config:\n    mode: json\n    thinking: ""\n    allow_extensions: false\n    allow_skills: false\n`,
        "utf-8",
      );
      const missionDir = join(root, ".harness", "missions", "M-plan-test");
      await mkdir(missionDir, { recursive: true });
      const missionPath = join(missionDir, "mission.yaml");
      await writeFile(
        missionPath,
        `schema_version: uh.mission.v0\nid: M-plan-test\nname: Plan basePrompt regression\ndescription: Verify base vs enriched prompt are tracked separately.\nworkflow_profile: default\nissues: []\nread_first: []\nexpected_artifacts: []\nverification:\n  checks: []\n`,
        "utf-8",
      );

      const plan = await planOhMyPiRun(root, missionPath);
      expect(plan.basePrompt.length).toBeGreaterThan(0);
      expect(plan.prompt).toContain(plan.basePrompt);
      expect(plan.prompt).toContain("[Persistent memory]");
      expect(plan.basePrompt).not.toContain("[Persistent memory]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
