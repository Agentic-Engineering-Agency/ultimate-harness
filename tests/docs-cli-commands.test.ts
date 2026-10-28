import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * #267: docs/architecture/progressive-decisions.md said "The CLI exposes `uh mission decision scope-change`", but the
 * CLI has no `decision` command (only the receipt schema has a `scope-change` kind). A command a doc names as exposed
 * has to be registered.
 */
describe("documented CLI commands exist", () => {
  test("progressive-decisions.md does not claim a `uh mission decision` command the CLI lacks", async () => {
    const doc = await readFile("docs/architecture/progressive-decisions.md", "utf-8");
    const cli = await readFile("src/cli.ts", "utf-8");
    const registered = /\.command\("decision"\)/.test(cli);
    const claimed = /CLI exposes `uh mission decision/.test(doc);
    expect(claimed && !registered).toBe(false);
  });
});
