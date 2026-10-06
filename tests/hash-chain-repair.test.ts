import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { GENESIS_HASH, chainEntry, relinkForks, verifyChainedLines, verifyChainedLinesTolerant } from "../src/harness/hash-chain.js";
import { repairChainFile } from "../src/harness/chain-repair.js";
import { assertHiveChainsIntact, hiveFactsPath } from "../src/harness/hive.js";
import { interventionsPath } from "../src/harness/interventions.js";
import { appendLandDecisionIndex, landDecisionsPath } from "../src/harness/land.js";

const execFileP = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop() as string, { recursive: true, force: true });
});

const body = (id: string) => ({ id, text: `entry ${id}` });
const line = (entry: unknown) => JSON.stringify(entry);

/** A chain a, b, c, d where the old bug forked it: b and c both link to a, and d links to c. */
function forked(): { lines: string[]; a: string; b: string; c: string; d: string } {
  const a = chainEntry(GENESIS_HASH, body("a"));
  const b = chainEntry(a.hash, body("b"));
  const c = chainEntry(a.hash, body("c")); // the second writer read the same last line as b's writer
  const d = chainEntry(c.hash, body("d"));
  return { lines: [a, b, c, d].map(line), a: a.hash, b: b.hash, c: c.hash, d: d.hash };
}

describe("the fork pattern the old append bug made", () => {
  test("strict verification breaks at the second sibling; the tolerant one names it a fork and keeps walking", () => {
    const { lines } = forked();
    expect(verifyChainedLines(lines)).toMatchObject({ line: 3 });
    expect(verifyChainedLinesTolerant(lines)).toEqual({ forks: [3] });
  });

  test("every other break stays a hard failure, including one after a fork", () => {
    const { lines } = forked();
    const edited = JSON.parse(lines[3]) as Record<string, unknown>;
    edited.text = "tampered";
    expect(verifyChainedLinesTolerant([...lines.slice(0, 3), line(edited)])).toMatchObject({ hard: { line: 4, reason: expect.stringContaining("hash does not match") } });
    const removed = [lines[0], lines[2], lines[3]]; // b deleted: c now links to a, which is its parent: not a fork, a valid chain
    expect(verifyChainedLinesTolerant(removed)).toEqual({ forks: [] });
    const stray = chainEntry("f".repeat(64), body("x"));
    expect(verifyChainedLinesTolerant([...lines.slice(0, 2), line(stray)])).toMatchObject({ hard: { line: 3 } });
  });

  test("an intact chain has no forks and no break", () => {
    const a = chainEntry(GENESIS_HASH, body("a"));
    const b = chainEntry(a.hash, body("b"));
    expect(verifyChainedLinesTolerant([line(a), line(b)])).toEqual({ forks: [] });
  });

  test("relinking makes the chain intact and reports exactly what moved", () => {
    const { lines, b, c, d } = forked();
    const result = relinkForks(lines);
    if ("error" in result) throw new Error(result.error.reason);
    expect(verifyChainedLines(result.lines)).toBeUndefined();
    expect(result.relinked.map(entry => [entry.line, entry.id, entry.reason])).toEqual([[3, "c", "fork"], [4, "d", "follows_fork"]]);
    expect(result.relinked[0]).toMatchObject({ old_prev_hash: expect.any(String), new_prev_hash: b, old_hash: c });
    expect(result.relinked[1]).toMatchObject({ old_hash: d });
    // Only the chain fields changed.
    const before = JSON.parse(lines[2]) as Record<string, unknown>;
    const after = JSON.parse(result.lines[2]) as Record<string, unknown>;
    expect({ ...after, prev_hash: 0, hash: 0 }).toEqual({ ...before, prev_hash: 0, hash: 0 });
  });

  test("relinking refuses a chain with any other break and changes nothing", () => {
    const { lines } = forked();
    const edited = JSON.parse(lines[0]) as Record<string, unknown>;
    edited.text = "tampered";
    expect(relinkForks([line(edited), ...lines.slice(1)])).toMatchObject({ error: { line: 1 } });
  });
});

describe("uh hive verify --repair's engine", () => {
  async function file(lines: string[]) {
    const dir = await mkdtemp(path.join(tmpdir(), "uh-chain-repair-"));
    roots.push(dir);
    const target = path.join(dir, "facts.ndjson");
    await writeFile(target, `${lines.join("\n")}\n`, "utf-8");
    return { dir, target };
  }

  test("re-links the fork, keeps the original beside it, and writes a report of what it re-linked", async () => {
    const { lines } = forked();
    const { dir, target } = await file(lines);
    const outcome = await repairChainFile(target, { now: () => new Date("2026-10-06T21:00:00.000Z") });
    expect(outcome).toMatchObject({ repaired: true });
    expect(verifyChainedLines((await readFile(target, "utf-8")).split("\n").filter(Boolean))).toBeUndefined();
    const names = await readdir(dir);
    const backup = names.find(name => name.includes("pre-repair"));
    const report = names.find(name => name.includes("repair-report"));
    expect(backup).toBeDefined();
    expect(report).toBeDefined();
    expect((await readFile(path.join(dir, backup!), "utf-8")).split("\n").filter(Boolean)).toEqual(lines);
    const written = JSON.parse(await readFile(path.join(dir, report!), "utf-8"));
    expect(written.relinked.map((entry: { id: string }) => entry.id)).toEqual(["c", "d"]);
  });

  test("a second run finds nothing to do", async () => {
    const { target } = await file(forked().lines);
    await repairChainFile(target, {});
    expect(await repairChainFile(target, {})).toEqual({ repaired: false, reason: "no fork to repair" });
  });

  test("a chain with any other break is refused and left byte for byte as it was", async () => {
    const { lines } = forked();
    const edited = JSON.parse(lines[0]) as Record<string, unknown>;
    edited.text = "tampered";
    const original = [line(edited), ...lines.slice(1)];
    const { dir, target } = await file(original);
    const outcome = await repairChainFile(target, {});
    expect(outcome).toMatchObject({ repaired: false, break: { line: 1 } });
    expect((await readFile(target, "utf-8")).split("\n").filter(Boolean)).toEqual(original);
    expect((await readdir(dir)).length).toBe(1);
  });
});

describe("land and queue treat a fork as a warning and every other break as a failure", () => {
  async function project(chain: string[], file: (root: string) => string) {
    const root = await mkdtemp(path.join(tmpdir(), "uh-chain-gate-"));
    roots.push(root);
    await mkdir(path.dirname(file(root)), { recursive: true });
    await writeFile(file(root), `${chain.join("\n")}\n`, "utf-8");
    return root;
  }

  test("a forked facts chain passes with a warning that names the repair command", async () => {
    const root = await project(forked().lines, hiveFactsPath);
    const warnings = assertHiveChainsIntact(root);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/fork/i);
    expect(warnings[0]).toContain("uh hive verify --repair");
  });

  test("a forked intervention ledger passes with a warning", async () => {
    const root = await project(forked().lines, interventionsPath);
    expect(assertHiveChainsIntact(root)[0]).toContain("uh hive verify --repair");
  });

  test("any other break still throws", async () => {
    const { lines } = forked();
    const edited = JSON.parse(lines[0]) as Record<string, unknown>;
    edited.text = "tampered";
    const root = await project([line(edited), ...lines.slice(1)], hiveFactsPath);
    expect(() => assertHiveChainsIntact(root)).toThrow(/Hive facts chain is broken at line 1/);
  });

  test("an intact pair of chains has no warnings", async () => {
    const root = await project([line(chainEntry(GENESIS_HASH, body("a")))], hiveFactsPath);
    expect(assertHiveChainsIntact(root)).toEqual([]);
  });
});

describe("uh hive verify --repair, end to end", () => {
  test("reports the fork, repairs it only when asked, and says what it re-linked", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-chain-cli-"));
    roots.push(root);
    await mkdir(path.join(root, ".harness", "hive"), { recursive: true });
    await writeFile(hiveFactsPath(root), `${forked().lines.join("\n")}\n`, "utf-8");
    const run = (args: string[]) => execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", "hive", "verify", "--root", root, ...args], { cwd: process.cwd() }).then(
      result => ({ code: 0, out: result.stdout }), (error: { code?: number; stdout?: string; stderr?: string }) => ({ code: error.code ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }));
    const before = await run([]);
    expect(before.code).not.toBe(0);
    expect(before.out).toContain("fork");
    expect(before.out).toContain("--repair");
    expect(verifyChainedLines((await readFile(hiveFactsPath(root), "utf-8")).split("\n").filter(Boolean))).not.toBeUndefined();
    const repaired = await run(["--repair"]);
    expect(repaired.code).toBe(0);
    expect(repaired.out).toMatch(/re-linked 2 entries/);
    expect(repaired.out).toContain("hive.facts");
    const after = await run([]);
    expect(after.code).toBe(0);
    expect(after.out).toContain("hive chains intact");
  }, 60_000);
});

describe("the land decision index is appended under the same lock", () => {
  test("concurrent appends never fork it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-land-index-"));
    roots.push(root);
    await Promise.all(Array.from({ length: 30 }, (_unused, index) => appendLandDecisionIndex(root, { file: path.join(root, `d${index}.json`), sha256: "a".repeat(64) })));
    const lines = (await readFile(landDecisionsPath(root), "utf-8")).split("\n").filter(Boolean);
    expect(lines).toHaveLength(30);
    expect(verifyChainedLines(lines)).toBeUndefined();
    expect(existsSync(`${landDecisionsPath(root)}.lock`)).toBe(false);
  });
});
