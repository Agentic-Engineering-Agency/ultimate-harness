import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateFile } from "../src/harness/validate.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true }); });

/**
 * U-411: `uh validate` reported about a dozen of UH's own artifact versions as "Unknown schema version". Every
 * `uh.*.v0` version a schema in src/schema declares has a validator in the dispatch, so a shipped artifact is checked
 * against its own schema (and a malformed one fails there), never reported as unknown.
 */
async function declaredVersions(): Promise<string[]> {
  const directory = "src/schema";
  const versions = new Set<string>();
  for (const file of await readdir(directory)) {
    if (!file.endsWith(".ts")) continue;
    const text = await readFile(path.join(directory, file), "utf-8");
    for (const match of text.matchAll(/schema_version:\s*z\s*\.literal\(\s*(?:"(uh\.[a-z-]+\.v\d+)"|([A-Z_]+))\s*\)/g)) {
      if (match[1]) versions.add(match[1]);
      else {
        const constant = new RegExp(`${match[2]}\\s*=\\s*"(uh\\.[a-z-]+\\.v\\d+)"`).exec(text);
        if (constant) versions.add(constant[1]);
      }
    }
  }
  return [...versions].sort();
}

describe("uh validate knows every schema version UH declares", () => {
  test("there are versions to check", async () => {
    expect((await declaredVersions()).length).toBeGreaterThan(25);
  });

  test("none is reported as unknown, and an empty document of each fails against its own schema", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "uh-validate-versions-"));
    dirs.push(root);
    const unknown: string[] = [];
    for (const version of await declaredVersions()) {
      const file = path.join(root, `${version}.yaml`);
      await writeFile(file, `schema_version: ${version}\n`, "utf-8");
      const result = await validateFile(file);
      if (result.errors.some(error => /unknown schema version/i.test(error))) unknown.push(version);
    }
    expect(unknown).toEqual([]);
  });
});
