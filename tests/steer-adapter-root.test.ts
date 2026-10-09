import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveAdapterRoot } from "../src/harness/steer.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #259: resolveAdapterRoot walked up to the filesystem root, so a project with no adapters of its own loaded the
 * adapter manifests of whatever directory sat above it. It stops at the project root.
 */
const project = async (dir: string, withAdapters: boolean) => {
  await mkdir(path.join(dir, ".harness"), { recursive: true });
  await writeFile(path.join(dir, ".harness", "project.yaml"), "schema_version: uh.project.v0\nname: p\n");
  if (withAdapters) await mkdir(path.join(dir, ".harness", "adapters"), { recursive: true });
};

describe("resolveAdapterRoot", () => {
  test("does not borrow the adapters of a directory above the project", async () => {
    const outer = await realpath(await mkdtemp(path.join(tmpdir(), "uh-adapter-root-")));
    dirs.push(outer);
    await project(outer, true);
    const inner = path.join(outer, "nested", "project");
    await project(inner, false);
    const scope = path.join(inner, ".harness", "missions", "m", "team", "artifacts", "a", "workers", "w");
    await mkdir(scope, { recursive: true });
    await expect(resolveAdapterRoot(scope)).rejects.toThrow(/no .harness\/adapters/);
  });

  test("a team worker scope resolves to the project that owns the adapters", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "uh-adapter-root-")));
    dirs.push(root);
    await project(root, true);
    const scope = path.join(root, ".harness", "missions", "m", "team", "artifacts", "a", "workers", "w");
    await mkdir(scope, { recursive: true });
    expect(await resolveAdapterRoot(scope)).toBe(root);
  });
});
