import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * #221: the capability severity flags runtime-adapter-contract.md describes must exist on the commands it names.
 */
describe("capability flags match the docs", () => {
  test("--strict is registered on dry-run, run and run-all, and the doc says --force warns", async () => {
    const doc = await readFile("docs/architecture/runtime-adapter-contract.md", "utf-8");
    const cli = await readFile("src/cli.ts", "utf-8");
    expect(doc).toContain("`uh mission dry-run`, `uh mission run`, and `uh mission run-all` enforce");
    expect(doc).toMatch(/pass `--strict` to treat mismatches as a hard error/);
    expect((cli.match(/\.option\("--strict", "Treat capability mismatches as errors/g) ?? []).length).toBe(3);
    expect(doc).toContain("`[WARN]` line");
  });
});
