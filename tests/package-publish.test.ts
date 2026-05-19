import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  type: string;
  bin?: Record<string, string>;
  files?: string[];
  publishConfig?: { access?: string };
  scripts?: Record<string, string>;
}

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile("package.json", "utf-8")) as PackageJson;
}

describe("npm/Bun publish package metadata", () => {
  test("is public, scoped, and installs the uh binary from built dist", async () => {
    const pkg = await readPackageJson();

    expect(pkg.name).toBe("@agenticengineeringagency/ultimate-harness");
    expect(pkg.private).not.toBe(true);
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.bin).toEqual({ uh: "./dist/cli.js" });
  });

  test("publishes only runtime assets needed by the CLI and TUI", async () => {
    const pkg = await readPackageJson();

    expect(pkg.files).toEqual(["dist/", "src/", "README.md", "docs/runbooks/", "docs/architecture/"]);
    expect(pkg.files).not.toContain("tests/");
    expect(pkg.files).not.toContain("examples/");
  });

  test("exposes a dry-run publish script for PR and release verification", async () => {
    const pkg = await readPackageJson();

    expect(pkg.scripts?.["publish:dry-run"]).toBe("bun publish --dry-run");
  });
});
