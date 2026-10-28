import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ACP_CLIENT_VERSION } from "../src/adapters/acp.js";

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

function distTag(...args: string[]): string {
  return execFileSync(process.execPath, ["scripts/npm-dist-tag.mjs", ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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

    expect(pkg.scripts?.["publish:dry-run"]).toBe("bun publish --dry-run --tag $(node scripts/npm-dist-tag.mjs)");
  });

  test("every shipped version field agrees with package.json", async () => {
    const pkg = await readPackageJson();
    const plugin = parseYaml(await readFile("apps/hermes-plugin/plugin.yaml", "utf-8")) as { version?: string };
    const dashboard = JSON.parse(await readFile("apps/hermes-plugin/dashboard/manifest.json", "utf-8")) as { version?: string };
    const otel = /^const VERSION = "([^"]+)";$/m.exec(await readFile("src/harness/otel-export.ts", "utf-8"))?.[1];

    expect({ plugin: plugin.version, dashboard: dashboard.version, acp: ACP_CLIENT_VERSION, otel }).toEqual({
      plugin: pkg.version,
      dashboard: pkg.version,
      acp: pkg.version,
      otel: pkg.version,
    });
  });

  test("publishes a prerelease version to the next dist-tag, never latest", () => {
    expect(distTag("--for", "0.11.0-rc.1")).toBe("next");
    expect(distTag("--for", "1.0.0-beta.2+build.5")).toBe("next");
    expect(distTag("--for", "0.11.0")).toBe("latest");
    expect(distTag("--for", "1.0.0+build.5")).toBe("latest");
    expect(() => distTag("--for", "not-a-version")).toThrow();
  });

  test("refuses a GitHub release whose pre-release flag disagrees with the version", () => {
    expect(distTag("--for", "0.11.0-rc.1", "--github-prerelease", "true")).toBe("next");
    expect(distTag("--for", "0.11.0", "--github-prerelease", "false")).toBe("latest");
    expect(distTag("--for", "0.11.0", "--github-prerelease", "")).toBe("latest");
    expect(() => distTag("--for", "0.11.0-rc.1", "--github-prerelease", "false")).toThrow(/not marked as a pre-release/);
    expect(() => distTag("--for", "0.11.0", "--github-prerelease", "true")).toThrow(/is marked as a pre-release/);
  });

  test("the publish workflows publish with the derived dist-tag", async () => {
    const publish = await readFile(".github/workflows/publish.yml", "utf-8");
    const plugin = await readFile(".github/workflows/release-plugin.yml", "utf-8");

    expect(publish).toContain('TAG=$(node scripts/npm-dist-tag.mjs --github-prerelease "$RELEASE_PRERELEASE")');
    expect(publish).toContain('npm publish --access public --tag "$DIST_TAG"');
    expect(publish).not.toMatch(/^\s*npm publish\b(?!.*--tag)/m);
    expect(plugin).toContain('node scripts/npm-dist-tag.mjs --github-prerelease "$RELEASE_PRERELEASE"');
  });

  test("keeps release, TUI, and plugin validation scripts wired", async () => {
    const pkg = await readPackageJson();

    expect(pkg.scripts).toMatchObject({
      dev: "tsx src/cli.ts",
      build: "node scripts/build.mjs",
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
