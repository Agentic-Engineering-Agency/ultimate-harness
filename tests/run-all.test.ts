import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareRuntimeOutcomes,
  persistRuntimeComparison,
  renderRuntimeComparisonMarkdown,
  runMissionAcrossRuntimes,
  type RuntimeOutcome,
  type RuntimeRunResult,
} from "../src/harness/run-all.js";

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-test-run-all-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

function outcome(runtime: string, overrides: Partial<RuntimeOutcome> = {}): RuntimeOutcome {
  return {
    runtime,
    sandboxId: `sbx-${runtime}`,
    sandboxPath: `/tmp/${runtime}`,
    status: "succeeded",
    exitCode: 0,
    durationMs: 0,
    diff: "",
    diffHash: "hash-default",
    diffPaths: [],
    sentinel: "",
    stdoutSnippet: "",
    stderrSnippet: "",
    ...overrides,
  };
}

describe("run-all compareRuntimeOutcomes", () => {
  test("agreement when every succeeded runtime shares one diff hash", () => {
    const r = compareRuntimeOutcomes("m1", [
      outcome("hermes", { diffHash: "abc", status: "succeeded" }),
      outcome("codex", { diffHash: "abc", status: "succeeded" }),
      outcome("hermes-proxy", { diffHash: "abc", status: "succeeded" }),
    ]);
    expect(r.agreement).toBe(true);
    expect(r.agreementRuntimes.sort()).toEqual(["codex", "hermes", "hermes-proxy"]);
    expect(r.divergentRuntimes).toEqual([]);
    expect(r.groups[0].runtimes.length).toBe(3);
  });

  test("divergent when one runtime ships a different diff", () => {
    const r = compareRuntimeOutcomes("m1", [
      outcome("hermes", { diffHash: "abc", status: "succeeded" }),
      outcome("codex", { diffHash: "abc", status: "succeeded" }),
      outcome("oh-my-pi", { diffHash: "xyz", status: "succeeded" }),
    ]);
    expect(r.agreement).toBe(false);
    expect(r.divergentRuntimes).toContain("oh-my-pi");
    expect(r.groups[0].runtimes.length).toBe(2);
  });

  test("single successful runtime is NOT agreement (need at least 2)", () => {
    const r = compareRuntimeOutcomes("m1", [
      outcome("hermes", { diffHash: "abc", status: "succeeded" }),
      outcome("codex", { diffHash: "abc", status: "failed" }),
    ]);
    expect(r.agreement).toBe(false);
  });

  test("groups sorted by descending member count", () => {
    const r = compareRuntimeOutcomes("m1", [
      outcome("a", { diffHash: "h1", status: "succeeded" }),
      outcome("b", { diffHash: "h2", status: "succeeded" }),
      outcome("c", { diffHash: "h2", status: "succeeded" }),
      outcome("d", { diffHash: "h2", status: "succeeded" }),
    ]);
    expect(r.groups[0]).toMatchObject({ diffHash: "h2", runtimes: ["b", "c", "d"] });
    expect(r.groups[1]).toMatchObject({ diffHash: "h1", runtimes: ["a"] });
  });

  test("all-failed produces no agreement", () => {
    const r = compareRuntimeOutcomes("m1", [
      outcome("hermes", { diffHash: "abc", status: "failed" }),
      outcome("codex", { diffHash: "abc", status: "failed" }),
    ]);
    expect(r.agreement).toBe(false);
  });
});

describe("run-all renderRuntimeComparisonMarkdown", () => {
  test("renders status table, groups, and per-runtime diff path list", () => {
    const md = renderRuntimeComparisonMarkdown({
      missionId: "demo",
      outcomes: [
        outcome("hermes", { diffHash: "abc", diffPaths: ["src/a.ts"], status: "succeeded", exitCode: 0, durationMs: 100 }),
        outcome("codex", { diffHash: "xyz", diffPaths: ["src/a.ts", "src/b.ts"], status: "succeeded", exitCode: 0, durationMs: 200 }),
      ],
      groups: [
        { diffHash: "abc", runtimes: ["hermes"] },
        { diffHash: "xyz", runtimes: ["codex"] },
      ],
      agreement: false,
      agreementRuntimes: [],
      divergentRuntimes: ["hermes", "codex"],
    });
    expect(md).toMatch(/Cross-runtime comparison: demo/);
    expect(md).toMatch(/Agreement: no/);
    expect(md).toMatch(/\| `hermes` \| succeeded \| 0 \| 100ms \|/);
    expect(md).toMatch(/\| `codex` \| succeeded \| 0 \| 200ms \|/);
    expect(md).toMatch(/### hermes/);
    expect(md).toMatch(/- src\/a\.ts/);
  });

  test("renders sentinel blocks when present", () => {
    const md = renderRuntimeComparisonMarkdown({
      missionId: "demo",
      outcomes: [outcome("hermes", { sentinel: "RUNTIME-FINAL\nok" })],
      groups: [{ diffHash: "hash-default", runtimes: ["hermes"] }],
      agreement: false,
      agreementRuntimes: [],
      divergentRuntimes: ["hermes"],
    });
    expect(md).toMatch(/RUNTIME-FINAL/);
  });
});

describe("run-all runMissionAcrossRuntimes", () => {
  function fakeResult(overrides: Partial<RuntimeRunResult> = {}): RuntimeRunResult {
    return {
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      ...overrides,
    };
  }

  async function seedSandbox(parent: string, sandboxId: string, missionId: string, diff: string, sentinel: string): Promise<{ id: string; path: string }> {
    const sandboxPath = join(parent, ".harness", "sandboxes", sandboxId, "worktree");
    const missionDir = join(sandboxPath, ".harness", "missions", missionId);
    await mkdir(missionDir, { recursive: true });
    await writeFile(join(missionDir, "diff.patch"), diff, "utf-8");
    await writeFile(join(missionDir, "runtime-final.txt"), sentinel, "utf-8");
    return { id: sandboxId, path: sandboxPath };
  }

  test("fans out across runtimes, captures diff + sentinel from each sandbox", async () => {
    const runs: string[] = [];
    const comparison = await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex"],
      sandboxOps: {
        create: async (r, { id, missionId: mid }) => seedSandbox(r, id, mid, `diff for ${id}`, `sentinel ${id}`),
      },
      runtimeRunner: async (runtime, _root, _missionPath) => {
        runs.push(runtime);
        return fakeResult();
      },
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    expect(runs.sort()).toEqual(["codex", "hermes"]);
    expect(comparison.outcomes).toHaveLength(2);
    const hermes = comparison.outcomes.find((o) => o.runtime === "hermes")!;
    expect(hermes.diff).toMatch(/diff for sbx-m1-hermes-0001/);
    expect(hermes.sentinel).toBe(`sentinel sbx-m1-hermes-0001`);
  });

  test("returns error outcome when an adapter throws, doesn't abort the batch", async () => {
    const comparison = await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex"],
      sandboxOps: {
        create: async (r, { id, missionId: mid }) => seedSandbox(r, id, mid, `diff ${id}`, ""),
      },
      runtimeRunner: async (runtime) => {
        if (runtime === "codex") throw new Error("codex blew up");
        return fakeResult();
      },
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    expect(comparison.outcomes).toHaveLength(2);
    const codex = comparison.outcomes.find((o) => o.runtime === "codex")!;
    expect(codex.status).toBe("error");
    expect(codex.errorMessage).toBe("codex blew up");
    const hermes = comparison.outcomes.find((o) => o.runtime === "hermes")!;
    expect(hermes.status).toBe("succeeded");
  });

  test("computes a stable diff hash from captured diff text", async () => {
    const comparison = await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex"],
      sandboxOps: {
        create: async (r, { id, missionId: mid }) => seedSandbox(r, id, mid, "same diff", ""),
      },
      runtimeRunner: async () => fakeResult(),
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    const hashes = new Set(comparison.outcomes.map((o) => o.diffHash));
    expect(hashes.size).toBe(1);
    expect(comparison.agreement).toBe(true);
  });

  test("serial mode preserves the runtime order", async () => {
    const seen: string[] = [];
    await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex", "oh-my-pi"],
      sandboxOps: {
        create: async (r, { id, missionId: mid }) => seedSandbox(r, id, mid, "x", ""),
      },
      runtimeRunner: async (runtime) => {
        seen.push(runtime);
        return fakeResult();
      },
      now: () => 0,
      sandboxIdSuffix: () => "0001",
      serial: true,
    });
    expect(seen).toEqual(["hermes", "codex", "oh-my-pi"]);
  });
});

describe("run-all persistRuntimeComparison", () => {
  test("writes the report and appends events to events.ndjson", async () => {
    const missionDir = join(ROOT, ".harness", "missions", "m1");
    const comparison = compareRuntimeOutcomes("m1", [
      outcome("hermes", { diffHash: "abc", status: "succeeded" }),
      outcome("codex", { diffHash: "abc", status: "succeeded" }),
    ]);
    const reportPath = await persistRuntimeComparison(missionDir, comparison);
    expect(reportPath).toBe(join(missionDir, "runtime-comparison.md"));

    const report = await readFile(reportPath, "utf-8");
    expect(report).toMatch(/Agreement: yes/);

    const events = (await readFile(join(missionDir, "events.ndjson"), "utf-8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const compared = events.filter((e) => e.type === "runtime.compared");
    expect(compared.map((e) => e.runtime).sort()).toEqual(["codex", "hermes"]);
    const summary = events.find((e) => e.type === "runtime.comparison.summary");
    expect(summary).toMatchObject({ mission_id: "m1", agreement: true });
  });
});


describe("run-all reviewer-fixes", () => {
  test("sandbox creation is serialized so parallel adapter runs don't race the index", async () => {
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex", "oh-my-pi"],
      sandboxOps: {
        create: async (_r, { id }) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 10));
          calls.push(id);
          inFlight -= 1;
          return { id, path: `/tmp/${id}` };
        },
      },
      runtimeRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    expect(maxInFlight).toBe(1);
    expect(calls).toEqual(["sbx-m1-hermes-0001", "sbx-m1-codex-0001", "sbx-m1-oh-my-pi-0001"]);
  });

  test("sandbox creation failure produces an error outcome and never invokes the runner", async () => {
    let runnerCalls = 0;
    const comparison = await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex"],
      sandboxOps: {
        create: async (_r, { id }) => {
          if (id.includes("codex")) throw new Error("sandbox quota exceeded");
          return { id, path: `/tmp/${id}` };
        },
      },
      runtimeRunner: async () => { runnerCalls += 1; return { exitCode: 0, stdout: "", stderr: "" }; },
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    expect(runnerCalls).toBe(1);
    const codex = comparison.outcomes.find((o) => o.runtime === "codex")!;
    expect(codex.status).toBe("error");
    expect(codex.errorMessage).toBe("sandbox quota exceeded");
  });

  test("adapter runs happen in parallel after sandboxes are prepared", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runMissionAcrossRuntimes(ROOT, "m1", {
      runtimes: ["hermes", "codex"],
      sandboxOps: {
        create: async (_r, { id }) => ({ id, path: `/tmp/${id}` }),
      },
      runtimeRunner: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      now: () => 0,
      sandboxIdSuffix: () => "0001",
    });
    expect(maxInFlight).toBe(2);
  });
});

