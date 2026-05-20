import { describe, expect, test } from "vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSpecContent } from "../src/harness/spec-loader.js";
import {
  generateFreshScaffold,
  mergeScaffoldContent,
  parseScaffoldLang,
  scaffoldTestsFromSpec,
} from "../src/harness/test-scaffold.js";

const execFileP = promisify(execFile);

const VALID_SPEC = `---
schema: uh.spec.v0
id: UH-108
title: uh spec scaffold
status: draft
owners: [LaloLalo1999]
linear: UH-108
---

## Goal

Generate test scaffolds from acceptance criteria.

## Non-goals

- Spec-stale drift (UH-109)

## Acceptance criteria

1. AC1: generates a new TypeScript test file
2. AC2: merges new criteria into an existing file
3. AC3: preserves implemented test bodies on re-run

## Risks

- Fragile parsing of hand-edited scaffolds

## Open questions

- None
`;

describe("parseScaffoldLang", () => {
  test("accepts ts and py aliases", () => {
    expect(parseScaffoldLang("ts")).toBe("ts");
    expect(parseScaffoldLang("typescript")).toBe("ts");
    expect(parseScaffoldLang("py")).toBe("py");
    expect(parseScaffoldLang("python")).toBe("py");
  });

  test("rejects unknown languages", () => {
    expect(() => parseScaffoldLang("rust")).toThrow(/ts or py/);
  });
});

describe("generateFreshScaffold", () => {
  test("emits vitest todos for TypeScript", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    const output = generateFreshScaffold(spec, "ts", "docs/specs/fixture.spec.md");
    expect(output).toContain('import { describe, it } from "vitest";');
    expect(output).toContain('describe("UH-108 — uh spec scaffold", () => {');
    expect(output).toContain('it.todo("AC1: generates a new TypeScript test file");');
    expect(output).toContain('it.todo("AC3: preserves implemented test bodies on re-run");');
    expect(output).toContain("uh spec scaffold --from docs/specs/fixture.spec.md --lang ts");
  });

  test("emits pytest skips for Python", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    const output = generateFreshScaffold(spec, "py", "docs/specs/fixture.spec.md");
    expect(output).toContain("import pytest");
    expect(output).toContain("class TestUH_108:");
    expect(output).toContain('@pytest.mark.skip(reason="AC1: generates a new TypeScript test file")');
    expect(output).toContain("uh spec scaffold --from docs/specs/fixture.spec.md --lang py");
  });
});

describe("mergeScaffoldContent", () => {
  test("preserves implemented it() bodies and adds new todos", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    const existing = `import { describe, it, expect } from "vitest";

// Generated from docs/specs/fixture.spec.md @ UH-108
// Re-run: uh spec scaffold --from docs/specs/fixture.spec.md --lang ts
describe("UH-108 — uh spec scaffold", () => {
  it("AC1: generates a new TypeScript test file", () => {
    expect(true).toBe(true);
  });
  it.todo("AC2: merges new criteria into an existing file");
});
`;
    const merged = mergeScaffoldContent(existing, spec, "ts");
    expect(merged).toContain("expect(true).toBe(true)");
    expect(merged).toContain('it.todo("AC3: preserves implemented test bodies on re-run");');
    expect(merged).not.toContain('it.todo("AC1: generates a new TypeScript test file")');
  });

  test("preserves implemented Python tests after skip decorator is removed", () => {
    const spec = parseSpecContent(VALID_SPEC, "fixture.spec.md");
    const existing = `"""Generated from docs/specs/fixture.spec.md @ UH-108"""
import pytest

class TestUH_108:
    def test_ac1_generates_a_new_typescript_test_file(self):
        assert True

    @pytest.mark.skip(reason="AC2: merges new criteria into an existing file")
    def test_ac2_merges_new_criteria_into_an_existing_file(self):
        pytest.skip("AC2: merges new criteria into an existing file")
`;
    const merged = mergeScaffoldContent(existing, spec, "py");
    expect(merged).toContain("def test_ac1_generates_a_new_typescript_test_file");
    expect(merged).toContain("assert True");
    expect(merged).not.toContain('@pytest.mark.skip(reason="AC1:');
    expect(merged).toContain('@pytest.mark.skip(reason="AC3:');
  });
});

describe("scaffoldTestsFromSpec", () => {
  test("writes a new file then merges idempotently", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uh-spec-scaffold-"));
    const specPath = join(dir, "sample.spec.md");
    const outPath = join(dir, "sample.test.ts");
    await writeFile(specPath, VALID_SPEC, "utf-8");

    const created = await scaffoldTestsFromSpec({
      specPath,
      lang: "ts",
      outPath,
    });
    expect(created.created).toBe(true);
    expect(created.merged).toBe(false);
    expect(created.addedAcIds).toEqual(["AC1", "AC2", "AC3"]);

    const first = await readFile(outPath, "utf-8");
    const implemented = first.replace(
      'it.todo("AC1: generates a new TypeScript test file");',
      `it("AC1: generates a new TypeScript test file", () => {
    expect(1).toBe(1);
  });`,
    );
    await writeFile(outPath, implemented, "utf-8");

    const extendedSpec = `${VALID_SPEC.replace(
      "3. AC3: preserves implemented test bodies on re-run",
      "3. AC3: preserves implemented test bodies on re-run\n4. AC4: adds net-new acceptance criteria",
    )}`;
    await writeFile(specPath, extendedSpec, "utf-8");

    const merged = await scaffoldTestsFromSpec({
      specPath,
      lang: "ts",
      outPath,
    });
    expect(merged.merged).toBe(true);
    expect(merged.addedAcIds).toEqual(["AC4"]);

    const second = await readFile(outPath, "utf-8");
    expect(second).toContain("expect(1).toBe(1)");
    expect(second).toContain('it.todo("AC4: adds net-new acceptance criteria");');
    await rm(dir, { recursive: true, force: true });
  });
});

describe("uh spec scaffold CLI", () => {
  test("runs via tsx cli", async () => {
    const dir = await mkdtemp(join(tmpdir(), "uh-spec-scaffold-cli-"));
    const specPath = join(dir, "cli.spec.md");
    const outPath = join(dir, "cli.test.ts");
    await writeFile(specPath, VALID_SPEC, "utf-8");

    await execFileP(join(process.cwd(), "node_modules", ".bin", "tsx"), [
      "src/cli.ts",
      "spec",
      "scaffold",
      "--from",
      specPath,
      "--lang",
      "ts",
      "--out",
      outPath,
    ]);

    await access(outPath);
    const content = await readFile(outPath, "utf-8");
    expect(content).toContain('it.todo("AC2: merges new criteria into an existing file");');
    await rm(dir, { recursive: true, force: true });
  });
});
