import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshotGuardHook } from "../src/harness/runtime-snapshot.js";

let root: string;
let sourceDir: string;
let cacheRoot: string;

const HOOK_RELATIVE = path.join("extensions", "tool-guard", "omp.js");
const HOOK_DEPTH = HOOK_RELATIVE.split(path.sep).length;

async function writeFixture(): Promise<void> {
  const harness = path.join(root, "dist", "harness");
  await mkdir(harness, { recursive: true });
  await writeFile(path.join(sourceDir, "omp.js"), 'import { guard } from "../../harness/lib.js";\nconsole.log(guard);\n');
  await writeFile(path.join(harness, "lib.js"), 'import { extra } from "./extra.js";\nexport const guard = extra;\n');
  await writeFile(path.join(harness, "extra.js"), "export const extra = 1;\n");
}

/** The published snapshot root, one level above the hook's layout path. */
function snapshotDirOf(hook: string): string {
  let directory = hook;
  for (let depth = 0; depth < HOOK_DEPTH; depth += 1) directory = path.dirname(directory);
  return directory;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "uh-runtime-snapshot-"));
  sourceDir = path.join(root, "dist", "extensions", "tool-guard");
  cacheRoot = path.join(root, "cache");
  await mkdir(sourceDir, { recursive: true });
  await writeFixture();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("publishes the hook inside the cache root and preserves the relative layout", async () => {
  const hook = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });

  expect(path.isAbsolute(hook)).toBe(true);
  expect(path.relative(cacheRoot, hook)).not.toMatch(/^\.\./);
  expect(path.relative(snapshotDirOf(hook), hook)).toBe(HOOK_RELATIVE);
  expect((await stat(hook)).isFile()).toBe(true);

  const snapshotDir = snapshotDirOf(hook);
  expect(await readFile(path.join(snapshotDir, "harness", "lib.js"), "utf8")).toContain("extra");
  expect(await readFile(path.join(snapshotDir, "harness", "extra.js"), "utf8")).toContain("extra = 1");
});

test("identical content reuses the same directory without rewriting it", async () => {
  const first = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });
  const before = await stat(first);
  const second = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });

  expect(second).toBe(first);
  expect(await readdir(cacheRoot)).toEqual([path.basename(snapshotDirOf(first))]);
  expect((await stat(second)).mtimeMs).toBe(before.mtimeMs);
});

test("changed content yields a new directory and leaves the old snapshot intact", async () => {
  const first = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });
  await writeFile(path.join(root, "dist", "harness", "extra.js"), "export const extra = 2;\n");
  const second = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });

  expect(second).not.toBe(first);
  expect((await stat(first)).isFile()).toBe(true);
  expect(await readFile(path.join(snapshotDirOf(first), "harness", "extra.js"), "utf8")).toContain("extra = 1");
  expect(await readdir(cacheRoot)).toHaveLength(2);
});

test("two concurrent publications resolve to the same path", async () => {
  const [left, right] = await Promise.all([
    snapshotGuardHook("omp.js", { sourceDir, cacheRoot }),
    snapshotGuardHook("omp.js", { sourceDir, cacheRoot }),
  ]);

  expect(left).toBe(right);
  expect(await readdir(cacheRoot)).toHaveLength(1);
});

test("refuses a tampered snapshot instead of running with it", async () => {
  const hook = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });
  await writeFile(hook, "process.exit(0);\n");

  await expect(snapshotGuardHook("omp.js", { sourceDir, cacheRoot })).rejects.toThrow(/corrupt|sha-256/i);
});

test("refuses a snapshot with an unexpected extra file", async () => {
  const hook = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });
  await writeFile(path.join(snapshotDirOf(hook), "intruder.js"), "malicious\n");

  await expect(snapshotGuardHook("omp.js", { sourceDir, cacheRoot })).rejects.toThrow(/corrupt|unexpected/i);
});

test("publishes imported npm packages under node_modules so bare specifiers resolve", async () => {
  const dependency = path.join(root, "node_modules", "fake-dep");
  await mkdir(dependency, { recursive: true });
  await writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: "fake-dep", version: "1.0.0", main: "index.js" }));
  await writeFile(path.join(dependency, "index.js"), "module.exports = 1;\n");
  await writeFile(path.join(sourceDir, "omp.js"), 'import { guard } from "../../harness/lib.js";\nimport "fake-dep";\n');

  const hook = await snapshotGuardHook("omp.js", { sourceDir, cacheRoot });
  expect(await readFile(path.join(snapshotDirOf(hook), "node_modules", "fake-dep", "index.js"), "utf8")).toContain("module.exports");
});

test("fails closed when the source hook is missing", async () => {
  await expect(snapshotGuardHook("absent.js", { sourceDir, cacheRoot })).rejects.toThrow(/not found/i);
});
