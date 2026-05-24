import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SPEC_TEMPLATES,
  getSpecTemplate,
  listSpecTemplates,
} from "../src/harness/spec-templates.js";
import { parseSpecContent } from "../src/harness/spec-loader.js";

describe("spec templates", () => {
  test("lists templates sorted", () => {
    expect(listSpecTemplates()).toEqual(["epic", "feature"]);
  });

  test("getSpecTemplate throws on unknown name", () => {
    expect(() => getSpecTemplate("nope")).toThrow(/Unknown spec template/);
  });

  test.each(Object.keys(SPEC_TEMPLATES))(
    "%s template parses as a valid uh.spec.v0 spec",
    (name) => {
      const spec = parseSpecContent(SPEC_TEMPLATES[name], `${name}.spec.md`);
      expect(spec.frontMatter.schema).toBe("uh.spec.v0");
      expect(spec.frontMatter.status).toBe("draft");
      expect(spec.goal.length).toBeGreaterThan(0);
      expect(spec.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
    },
  );

  test.each(Object.keys(SPEC_TEMPLATES))(
    "docs/specs/templates/%s.spec.md matches the source constant (no drift)",
    async (name) => {
      const onDisk = await readFile(
        join(process.cwd(), "docs", "specs", "templates", `${name}.spec.md`),
        "utf-8",
      );
      expect(onDisk).toBe(SPEC_TEMPLATES[name]);
    },
  );
});
