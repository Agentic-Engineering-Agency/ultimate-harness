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

  test("publishes only runtime assets + public docs (never internal docs)", async () => {
    const pkg = await readPackageJson();

    expect(pkg.files).toEqual([
      "dist/",
      "src/",
      "README.md",
      "CHANGELOG.md",
      "docs/*.md",
      "docs/architecture/",
      "docs/runbooks/",
      "docs/product/",
      "docs/workflows/",
      "docs/verification/",
    ]);
    expect(pkg.files).not.toContain("tests/");
    expect(pkg.files).not.toContain("examples/");
    // A bare "docs/" glob would ship internal-only planning + handoff docs
    // (handoffs include CI auth notes). Keep them out of the npm tarball.
    expect(pkg.files).not.toContain("docs/");
    for (const internal of ["docs/handoffs/", "docs/prds/", "docs/research/", "docs/specs/"]) {
      expect(pkg.files).not.toContain(internal);
    }
  });

  test("exposes a dry-run publish script for PR and release verification", async () => {
    const pkg = await readPackageJson();

    expect(pkg.scripts?.["publish:dry-run"]).toBe("bun publish --dry-run");
  });

  test("keeps release, TUI, and plugin validation scripts wired", async () => {
    const pkg = await readPackageJson();

    expect(pkg.scripts).toMatchObject({
      dev: "tsx src/cli.ts",
      build: "rm -rf dist && tsc -p tsconfig.json",
      test: "vitest run",
      typecheck: "tsc -p tsconfig.tests.json --noEmit",
      "tui-spike": "bun bin/uh-tui-spike.tsx",
      clean: "rm -rf dist",
      "plugin:build": "bun apps/hermes-plugin/esbuild.config.mjs",
      "plugin:watch": "bun apps/hermes-plugin/esbuild.config.mjs --watch",
      "plugin:typecheck": "tsc -p apps/hermes-plugin/dashboard/tsconfig.json --noEmit",
      "plugin:test": "pytest apps/hermes-plugin/dashboard/tests/",
    });
  });

  test("declares the bin target the build emits", async () => {
    const pkg = await readPackageJson();

    // Metadata-only assertion: the build job (which runs before tests in CI)
    // is what guarantees the file exists; this test must not depend on dist/.
    expect(pkg.bin?.uh).toBe("./dist/cli.js");
  });
});
