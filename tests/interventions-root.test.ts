import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { harnessRootFor } from "../src/harness/interventions.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #261: a team worker's supervision stop was written to the ledger of its own nested `.harness` (the nearest one),
 * not to the project's. The ledger root is the project that owns the run: the outermost `.harness` ancestor that
 * holds a project.yaml, else the nearest one.
 */
describe("harnessRootFor", () => {
  test("a team worker's nested run resolves to the project root", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "uh-ledger-root-")));
    dirs.push(root);
    await mkdir(path.join(root, ".harness"), { recursive: true });
    await writeFile(path.join(root, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: p\n");
    const worker = path.join(root, ".harness", "missions", "team", "team", "artifacts", "run1", "workers", "backend");
    const runDir = path.join(worker, ".harness", "missions", "m1", "runs", "r1");
    await mkdir(runDir, { recursive: true });
    expect(harnessRootFor(runDir)).toBe(root);
  });

  test("a plain run resolves to its own project root", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "uh-ledger-root-")));
    dirs.push(root);
    await mkdir(path.join(root, ".harness"), { recursive: true });
    await writeFile(path.join(root, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: p\n");
    const runDir = path.join(root, ".harness", "missions", "m1", "runs", "r1");
    await mkdir(runDir, { recursive: true });
    expect(harnessRootFor(runDir)).toBe(root);
  });

  test("with no project.yaml anywhere the nearest .harness owns the run, as before", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "uh-ledger-root-")));
    dirs.push(root);
    const runDir = path.join(root, "scratch", ".harness", "missions", "m1", "runs", "r1");
    await mkdir(runDir, { recursive: true });
    expect(harnessRootFor(runDir)).toBe(path.join(root, "scratch"));
  });
});
