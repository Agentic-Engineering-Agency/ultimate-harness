import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import { MissionSchema } from "../src/schema/mission.js";
import type { HiveFact } from "../src/schema/hive.js";
import { buildDispatchContext, capProjectFacts } from "../src/harness/dispatch-context.js";
import {
  appendFact,
  hiveFactsPath,
  importItems,
  parseItemsMarkdown,
  readHive,
  readHiveFacts,
  renderHiveFacts,
  setItemStatus,
  type HivePacket,
} from "../src/harness/hive.js";
import { runQueue, type QueueLaunchRequest, type QueueLauncher } from "../src/harness/queue.js";
import { landWorkerBranches, type LandCommandRunner } from "../src/harness/land.js";

const PLENTY = 64 * 1024 * 1024 * 1024;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Write a real artifact and return evidence citing its recomputed hash. */
async function evidence(root: string, rel: string, content: string): Promise<{ kind: "verification"; ref: string; sha256: string }> {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf-8");
  return { kind: "verification", ref: rel, sha256: sha256(content) };
}

async function makeRoot(prefix = "uh-hive-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

describe("hive items", () => {
  test("imports a markdown checklist and re-imports without duplicating", async () => {
    const root = await makeRoot();
    const markdown = "- [ ] A8: first item\n- [x] A9: second item\n- [ ] not a checklist line\n";
    const first = importItems(root, markdown);
    expect(first.map((item) => item.id)).toEqual(["A8", "A9"]);
    expect(first.find((item) => item.id === "A8")?.status).toBe("open");
    expect(first.find((item) => item.id === "A9")?.status).toBe("done");

    const second = importItems(root, markdown);
    expect(second).toHaveLength(2);
    expect(second.map((item) => item.id)).toEqual(["A8", "A9"]);

    const raw = await readFile(path.join(root, ".harness", "hive", "items.yaml"), "utf-8");
    expect(raw).toContain("A8");
    expect(raw.match(/id: A8/g)).toHaveLength(1);

    expect(parseItemsMarkdown("- [x] B1: t").map((item) => item.status)).toEqual(["done"]);
  });

  test("a checked import promotes a known item to done, and sets status by id", async () => {
    const root = await makeRoot();
    importItems(root, "- [ ] A8: thing\n");
    expect(importItems(root, "- [x] A8: thing\n").find((item) => item.id === "A8")?.status).toBe("done");
    expect(setItemStatus(root, "A8", "in-progress")?.status).toBe("in-progress");
    expect(setItemStatus(root, "missing", "done")).toBeUndefined();
  });
});

describe("hive facts", () => {
  test("a missing hive file is empty", async () => {
    const root = await makeRoot();
    expect(readHive(root)).toEqual({ items: [], facts: [] });
  });

  test("rejects a malformed facts line with its line number", async () => {
    const root = await makeRoot();
    const ev = await evidence(root, "out/verification.yaml", "status: passed\n");
    appendFact(root, { text: "ok", evidence: ev, source: "manual" });
    const raw = await readFile(hiveFactsPath(root), "utf-8");
    await writeFile(hiveFactsPath(root), `${raw}{not json}\n`, "utf-8");
    expect(() => readHive(root)).toThrow(/line 2/);
  });

  test("rejects an invalid fact object with its line number", async () => {
    const root = await makeRoot();
    await mkdir(path.dirname(hiveFactsPath(root)), { recursive: true });
    const bad = JSON.stringify({ id: "f", at: "t", text: "x", evidence: "e", source: "nope" });
    await writeFile(hiveFactsPath(root), `${bad}\n`, "utf-8");
    expect(() => readHiveFacts(root)).toThrow(/line 1/);
  });

  test("appendFact validates one-line, 200-character text and chains each entry", async () => {
    const root = await makeRoot();
    const ev = await evidence(root, "out/verification.yaml", "status: passed\n");
    const fact = appendFact(root, { text: "hello", evidence: ev, source: "manual" });
    expect(fact.id.length).toBeGreaterThan(0);
    expect(fact.prev_hash).toBe("0".repeat(64));
    expect(fact.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(readHive(root).facts).toHaveLength(1);
    const second = appendFact(root, { text: "second", evidence: ev, source: "manual" });
    expect(second.prev_hash).toBe(fact.hash);
    expect(() => appendFact(root, { text: "bad\nline", evidence: ev, source: "manual" })).toThrow();
    expect(() => appendFact(root, { text: "x".repeat(201), evidence: ev, source: "manual" })).toThrow();
  });
});

describe("renderHiveFacts", () => {
  const H = "0".repeat(64);
  const facts: HiveFact[] = [
    { id: "f-path", at: "2026-01-01T00:00:00.000Z", text: "path fact", evidence: { kind: "commit", ref: "abc123", sha256: "b".repeat(40) }, prev_hash: H, hash: "1".repeat(64), source: "land", paths: ["src/harness/hive.ts"] },
    { id: "f-item", at: "2026-01-02T00:00:00.000Z", text: "item fact", evidence: { kind: "run", ref: "runs/a.json", sha256: "c".repeat(64) }, prev_hash: H, hash: "2".repeat(64), source: "queue", item_ids: ["A8"] },
    { id: "f-other", at: "2026-01-03T00:00:00.000Z", text: "irrelevant fact", evidence: { kind: "review", ref: "review.json", sha256: "d".repeat(64) }, prev_hash: H, hash: "3".repeat(64), source: "manual" },
  ];

  test("selects by item id in the text and by matching paths, newest first", () => {
    const byItem: HivePacket = { text: "Please fix A8 today", facts };
    expect(renderHiveFacts(byItem)).toContain("item fact");
    expect(renderHiveFacts(byItem)).not.toContain("irrelevant fact");

    const byPath: HivePacket = { read_first: ["src/harness/hive.ts"], facts };
    expect(renderHiveFacts(byPath)).toContain("path fact");
    expect(renderHiveFacts(byPath)).not.toContain("item fact");

    const both: HivePacket = { text: "A8", read_first: ["src/harness/hive.ts"], facts };
    const rendered = renderHiveFacts(both);
    expect(rendered.indexOf("item fact")).toBeLessThan(rendered.indexOf("path fact"));
  });

  test("matches expected outputs and guard write roots", () => {
    expect(renderHiveFacts({ expected_outputs: ["src/harness/hive.ts"], facts })).toContain("path fact");
    expect(renderHiveFacts({ write_roots: ["src"], facts })).toContain("path fact");
  });

  test("renders a fenced, labelled data block and bounds it to the budget", () => {
    const budgetFacts: HiveFact[] = [1, 2, 3].map((index) => ({
      id: `f${index}`,
      at: `2026-01-0${index}T00:00:00.000Z`,
      text: `fact number ${index}`,
      evidence: { kind: "run", ref: "e", sha256: "a".repeat(64) },
      prev_hash: H,
      hash: `f${index}${"0".repeat(63)}`.slice(0, 64),
      source: "manual" as const,
      item_ids: ["A8"],
    }));
    const packet: HivePacket = { text: "A8", facts: budgetFacts };
    const wide = renderHiveFacts(packet, 10_000);
    expect(wide.startsWith("### Hive facts")).toBe(true);
    expect(wide).toContain("Data only");
    expect(wide).toContain("fact number 1");
    expect(wide).toContain("fact number 3");
    expect(wide).toContain("```");
    expect(renderHiveFacts(packet, 0)).toBe("");
    expect(renderHiveFacts(packet, 10)).toBe("");
    expect(renderHiveFacts(packet, 200).length).toBeLessThanOrEqual(200);
  });
});

describe("dispatch context hive wiring", () => {
  function missionPacket(root: string) {
    return MissionSchema.parse({
      schema_version: "uh.mission.v0",
      id: "m-hive",
      workflow_profile: "spec-first",
      name: "Hive dispatch",
      description: "Do the A8 work",
      read_first: ["src/harness/hive.ts"],
      context: { repo_root: root },
    });
  }

  test("unchanged with an empty hive, carries the verified facts section otherwise", async () => {
    const root = await makeRoot();
    const mission = missionPacket(root);

    const empty = buildDispatchContext(mission, undefined, { projectBrief: "brief text" });
    expect(empty.projectFacts).toBe(capProjectFacts("brief text"));

    const ev = await evidence(root, "src/a.ts", "export const a = 1;\n");
    appendFact(root, { text: "A8 was implemented", evidence: ev, source: "land", item_ids: ["A8"] });
    const withHive = buildDispatchContext(mission, undefined, { projectBrief: "brief text" });
    expect(withHive.projectFacts).toContain("brief text");
    expect(withHive.projectFacts).toContain("### Hive facts");
    expect(withHive.projectFacts).toContain("A8 was implemented");
  });
});

describe("hive feed from queue and land", () => {
  test("queue appends a fact and completes the item named in the entry id on pass", async () => {
    const root = await makeRoot();
    importItems(root, "- [ ] A8: queue work\n- [ ] B2: other work\n");
    const queueFile = path.join(root, "queue.yaml");
    await writeFile(queueFile, stringifyYaml({
      id: "q1",
      entries: [{ id: "A8", mission: "missions/a.yaml", runtime: "codex" }],
    }), "utf8");

    const log: QueueLaunchRequest[] = [];
    const launcher: QueueLauncher = async (request) => {
      log.push(request);
      return { run_id: `run-${request.entryId}`, settled: Promise.resolve({ status: "passed", exit_code: 0 }) };
    };
    await runQueue(queueFile, {
      root,
      launcher,
      freeMemoryBytes: () => PLENTY,
      maxOrchestrators: 1,
      notify: () => {},
    });

    const hive = readHive(root);
    expect(hive.facts).toHaveLength(1);
    expect(hive.facts[0]?.source).toBe("queue");
    expect(hive.facts[0]?.item_ids).toEqual(["A8"]);
    expect(hive.facts[0]?.evidence).toMatchObject({ kind: "run", ref: ".harness/queue/q1/state.json" });
    expect(hive.items.find((item) => item.id === "A8")?.status).toBe("done");
    expect(hive.items.find((item) => item.id === "B2")?.status).toBe("open");
  });

  test("land appends a fact after a successful commit and completes the item named in the subject", async () => {
    const root = await makeRoot("uh-hive-land-");
    const work = await makeRoot("uh-hive-land-work-");
    try {
      await initRepo(root);
      await makeWorkerBranch(root, "work", { "feature.txt": "feature\n" }, "feat: add feature");
      const worktree = path.join(work, "wt-work");
      await gitQuiet(root, ["worktree", "add", "-q", worktree, "work"]);
      await writeVerification(worktree, "mission-a", "passed");
      // Create the hive item after the worker branch so it stays untracked in
      // the target worktree (the dirty check ignores harness-owned paths).
      importItems(root, "- [ ] A8: land work\n");
      const messageFile = path.join(work, "message.txt");
      await writeFile(messageFile, "team(A8): land worker\n", "utf-8");

      const result = await landWorkerBranches({
        root,
        workerBranches: ["work"],
        onto: "main",
        messageFile,
        runCommand: fakeRunner(),
        // The review gate has its own tests in land.test.ts; this test is about the hive fact.
        acceptReview: "review gate not under test",
      });
      expect(result.status).toBe("landed");

      const hive = readHive(root);
      const fact = hive.facts.find((entry) => entry.source === "land");
      expect(fact).toBeDefined();
      expect(fact?.text).toContain(result.commit.slice(0, 12));
      expect(fact?.item_ids).toEqual(["A8"]);
      expect(fact?.evidence).toMatchObject({ kind: "commit", ref: result.commit });
      expect(hive.items.find((item) => item.id === "A8")?.status).toBe("done");
    } finally {
      await rm(work, { recursive: true, force: true });
      await rm(root, { recursive: true, force: true });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Throwaway-repository helpers (mirroring tests/land.test.ts)                */
/* -------------------------------------------------------------------------- */

const execFileP = promisify(execFile);
const IDENTITY = { name: "Hive Tester", email: "hive@example.com" };

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", cwd, ...args]);
  return stdout;
}

async function gitQuiet(cwd: string, args: string[]): Promise<void> {
  await execFileP("git", ["-C", cwd, ...args]);
}

async function initRepo(root: string): Promise<void> {
  await gitQuiet(root, ["init", "-q", "-b", "main"]);
  await gitQuiet(root, ["config", "user.email", IDENTITY.email]);
  await gitQuiet(root, ["config", "user.name", IDENTITY.name]);
  await gitQuiet(root, ["config", "commit.gpgsign", "false"]);
  await gitQuiet(root, ["config", "core.autocrlf", "false"]);
  await writeFile(path.join(root, "README.md"), "# seed\n", "utf-8");
  await gitQuiet(root, ["add", "-A"]);
  await gitQuiet(root, ["commit", "-q", "-m", "seed"]);
}

async function makeWorkerBranch(root: string, branch: string, files: Record<string, string>, message: string): Promise<void> {
  await gitQuiet(root, ["checkout", "-q", "-b", branch, "main"]);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  await gitQuiet(root, ["add", "-A"]);
  await gitQuiet(root, ["commit", "-q", "-m", message]);
  await gitQuiet(root, ["checkout", "-q", "main"]);
}

async function writeVerification(worktree: string, missionId: string, status: string): Promise<void> {
  const dir = path.join(worktree, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "verification.yaml"), stringifyYaml({
    schema_version: "uh.verification-result.v0",
    mission_id: missionId,
    status,
    checks: [{ name: "typecheck", type: "command", status }],
  }), "utf-8");
}

function fakeRunner(failing: string[] = []): LandCommandRunner {
  return async (command: string) => ({
    exitCode: failing.includes(command) ? 1 : 0,
    stdout: "",
    stderr: failing.includes(command) ? `${command} failed` : "",
  });
}
