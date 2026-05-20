import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isImplementationSrcChange,
  neighborSpecPath,
  specStaleKind,
  specStaleSeverity,
} from "../src/harness/validate/drift/kinds/spec-stale.js";

const execFileP = promisify(execFile);

let TEST_ROOT: string;

async function git(args: string[]): Promise<void> {
  await execFileP("git", args, { cwd: TEST_ROOT });
}

async function seedRepo(files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(TEST_ROOT, rel);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content, "utf-8");
  }
  await git(["init"]);
  await git(["config", "user.email", "uh-test@example.com"]);
  await git(["config", "user.name", "UH Test"]);
  await git(["add", "-A"]);
  await git(["commit", "-m", "init"]);
  await git(["branch", "dev"]);
  await git(["checkout", "-B", "feature"]);
}

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-spec-stale-"));
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("UH-109 spec-stale helpers", () => {
  test("neighborSpecPath maps foo.ts to foo.spec.md", () => {
    expect(neighborSpecPath("src/harness/foo.ts")).toBe("src/harness/foo.spec.md");
  });

  test("isImplementationSrcChange accepts src ts and rejects spec paths", () => {
    expect(isImplementationSrcChange("src/a.ts")).toBe(true);
    expect(isImplementationSrcChange("src/a.spec.md")).toBe(false);
    expect(isImplementationSrcChange("tests/a.ts")).toBe(false);
  });

  test("specStaleSeverity respects --strict-spec", () => {
    expect(specStaleSeverity()).toBe("warn");
    expect(specStaleSeverity({ strictSpec: true })).toBe("error");
  });
});

describe("UH-109 spec-stale drift", () => {
  test("warns when src changes without nearest spec in dev...HEAD diff", async () => {
    await seedRepo({
      "src/feature.ts": "export const v = 1;\n",
      "src/feature.spec.md": "---\nschema: uh.spec.v0\n---\n",
    });
    await writeFile(join(TEST_ROOT, "src/feature.ts"), "export const v = 2;\n", "utf-8");
    await git(["add", "src/feature.ts"]);
    await git(["commit", "-m", "impl only"]);

    const issues = await specStaleKind.detect(TEST_ROOT);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("spec-stale");
    expect(issues[0].severity).toBe("warn");
    expect(issues[0].metadata?.srcPath).toBe("src/feature.ts");
    expect(issues[0].metadata?.specPath).toBe("src/feature.spec.md");
  });

  test("clean when src and nearest spec both change", async () => {
    await seedRepo({
      "src/feature.ts": "export const v = 1;\n",
      "src/feature.spec.md": "---\nschema: uh.spec.v0\n---\n",
    });
    await writeFile(join(TEST_ROOT, "src/feature.ts"), "export const v = 2;\n", "utf-8");
    await writeFile(join(TEST_ROOT, "src/feature.spec.md"), "---\nschema: uh.spec.v0\nid: X\n---\n", "utf-8");
    await git(["add", "src/feature.ts", "src/feature.spec.md"]);
    await git(["commit", "-m", "impl and spec"]);

    const issues = await specStaleKind.detect(TEST_ROOT);
    expect(issues).toEqual([]);
  });

  test("clean when docs/specs is touched for cross-cutting work", async () => {
    await seedRepo({
      "src/feature.ts": "export const v = 1;\n",
      "docs/specs/epic-8.md": "# epic\n",
    });
    await writeFile(join(TEST_ROOT, "src/feature.ts"), "export const v = 2;\n", "utf-8");
    await writeFile(join(TEST_ROOT, "docs/specs/epic-8.md"), "# epic\n\nupdated\n", "utf-8");
    await git(["add", "src/feature.ts", "docs/specs/epic-8.md"]);
    await git(["commit", "-m", "cross-cutting"]);

    const issues = await specStaleKind.detect(TEST_ROOT);
    expect(issues).toEqual([]);
  });

  test("--strict-spec promotes severity to error", async () => {
    await seedRepo({
      "src/feature.ts": "export const v = 1;\n",
      "src/feature.spec.md": "---\nschema: uh.spec.v0\n---\n",
    });
    await writeFile(join(TEST_ROOT, "src/feature.ts"), "export const v = 2;\n", "utf-8");
    await git(["add", "src/feature.ts"]);
    await git(["commit", "-m", "impl only"]);

    const issues = await specStaleKind.detect(TEST_ROOT, { strictSpec: true });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  test("repair is needs-human", async () => {
    const issue = {
      kind: "spec-stale" as const,
      severity: "warn" as const,
      message: "test",
      target: "/tmp/src/foo.ts",
    };
    const result = await specStaleKind.repair(issue, TEST_ROOT);
    expect(result.outcome).toBe("needs-human");
  });
});
