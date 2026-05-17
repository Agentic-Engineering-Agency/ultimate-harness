import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addSkill, checkSkill, listSkills } from "../src/harness/skill.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);
const CLI = join(process.cwd(), "node_modules", ".bin", "tsx");

async function runUh(args: string[]) {
  return execFileP(CLI, ["src/cli.ts", ...args], { cwd: process.cwd() });
}

type Frontmatter = {
  id: string;
  name: string;
  description: string;
  triggers?: string[];
  prerequisites?: string[];
  related?: string[];
};

function renderFrontmatter(fm: Frontmatter): string {
  const lines: string[] = [
    "---",
    `id: ${fm.id}`,
    `name: ${JSON.stringify(fm.name)}`,
    `description: ${JSON.stringify(fm.description)}`,
  ];
  if (fm.triggers && fm.triggers.length > 0) {
    lines.push("triggers:");
    for (const t of fm.triggers) {
      lines.push(`  - ${JSON.stringify(t)}`);
    }
  }
  if (fm.prerequisites && fm.prerequisites.length > 0) {
    lines.push("prerequisites:");
    for (const p of fm.prerequisites) {
      lines.push(`  - ${JSON.stringify(p)}`);
    }
  }
  if (fm.related && fm.related.length > 0) {
    lines.push("related:");
    for (const r of fm.related) {
      lines.push(`  - ${JSON.stringify(r)}`);
    }
  }
  lines.push("---", "", `# ${fm.name}`, "", "Body content for the skill.", "");
  return lines.join("\n");
}

async function writeSkillDir(name: string, fm: Frontmatter): Promise<string> {
  const dir = join(TEST_ROOT, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), renderFrontmatter(fm), "utf-8");
  return dir;
}

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-skill-"));
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("addSkill", () => {
  test("happy path: writes a SKILL.md-backed entry to the skills index", async () => {
    const dir = await writeSkillDir("code-review", {
      id: "code-review",
      name: "Code Review",
      description: "Review code for quality.",
      triggers: ["review my code", "check this diff"],
      prerequisites: ["linting"],
      related: ["test-authoring"],
    });

    const result = await addSkill(TEST_ROOT, dir);
    expect(result.id).toBe("code-review");
    expect(result.path).toBe(dir);
    expect(result.index_path).toBe(join(TEST_ROOT, ".harness", "skills", "index.yaml"));

    const idx = parse(await readFile(result.index_path, "utf-8"));
    expect(idx.schema_version).toBe("uh.skills-index.v0");
    expect(idx.skills).toHaveLength(1);
    expect(idx.skills[0]).toEqual({
      id: "code-review",
      name: "Code Review",
      description: "Review code for quality.",
      path: join("skills", "code-review"),
      triggers: ["review my code", "check this diff"],
      prerequisites: ["linting"],
      related: ["test-authoring"],
    });
  });

  test("missing SKILL.md fails with a clear error", async () => {
    const dir = join(TEST_ROOT, "skills", "empty");
    await mkdir(dir, { recursive: true });
    await expect(addSkill(TEST_ROOT, dir)).rejects.toThrow(/SKILL\.md not found/i);
  });

  test("duplicate id is rejected", async () => {
    const a = await writeSkillDir("alpha-a", {
      id: "alpha",
      name: "Alpha",
      description: "First skill.",
    });
    await addSkill(TEST_ROOT, a);

    const b = await writeSkillDir("alpha-b", {
      id: "alpha",
      name: "Alpha (other)",
      description: "Different skill, same id.",
    });
    await expect(addSkill(TEST_ROOT, b)).rejects.toThrow(/already registered/i);

    const idx = parse(
      await readFile(join(TEST_ROOT, ".harness", "skills", "index.yaml"), "utf-8"),
    );
    expect(idx.skills).toHaveLength(1);
    expect(idx.skills[0].name).toBe("Alpha");
  });

  test("path traversal is rejected and does not write outside project root", async () => {
    await expect(addSkill(TEST_ROOT, "../escape")).rejects.toThrow(/unsafe skill directory/i);
    const idx = parse(
      await readFile(join(TEST_ROOT, ".harness", "skills", "index.yaml"), "utf-8"),
    );
    expect(idx.skills).toEqual([]);
  });
});

describe("listSkills", () => {
  test("returns indexed entries in insertion order after addSkill", async () => {
    const a = await writeSkillDir("alpha", {
      id: "alpha",
      name: "Alpha",
      description: "First.",
      triggers: ["t1"],
    });
    const b = await writeSkillDir("beta", {
      id: "beta",
      name: "Beta",
      description: "Second.",
    });

    await addSkill(TEST_ROOT, a);
    await addSkill(TEST_ROOT, b);

    const skills = await listSkills(TEST_ROOT);
    expect(skills.map((s) => s.id)).toEqual(["alpha", "beta"]);
    expect(skills[0]).toMatchObject({
      id: "alpha",
      name: "Alpha",
      description: "First.",
      triggers: ["t1"],
      prerequisites: [],
      related: [],
    });
    expect(skills[1]).toMatchObject({
      id: "beta",
      name: "Beta",
      description: "Second.",
      triggers: [],
      prerequisites: [],
      related: [],
    });
  });
});

describe("checkSkill", () => {
  test("returns ok when index and SKILL.md still match", async () => {
    const dir = await writeSkillDir("alpha", {
      id: "alpha",
      name: "Alpha",
      description: "Alpha skill.",
      triggers: ["t1", "t2"],
      prerequisites: ["p1"],
      related: ["r1"],
    });
    await addSkill(TEST_ROOT, dir);

    const result = await checkSkill(TEST_ROOT, "alpha");
    expect(result).toEqual({ id: "alpha", ok: true, errors: [] });
  });

  test("returns error when on-disk SKILL.md drifts from the index", async () => {
    const dir = await writeSkillDir("alpha", {
      id: "alpha",
      name: "Alpha",
      description: "Alpha skill.",
      triggers: ["t1"],
    });
    await addSkill(TEST_ROOT, dir);

    // Drift the on-disk SKILL.md: rename the skill but keep the id.
    await writeFile(
      join(dir, "SKILL.md"),
      renderFrontmatter({
        id: "alpha",
        name: "Alpha Renamed",
        description: "Alpha skill, edited.",
        triggers: ["t1", "t2"],
      }),
      "utf-8",
    );

    const result = await checkSkill(TEST_ROOT, "alpha");
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /name/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /description/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /triggers/i.test(e))).toBe(true);
  });
});

describe("uh skill CLI", () => {
  test("add then list reflects the new skill through the CLI", async () => {
    const dir = await writeSkillDir("cli-skill", {
      id: "cli-skill",
      name: "CLI Skill",
      description: "Added via the CLI.",
      triggers: ["cli trigger"],
    });

    const addResult = await runUh(["skill", "add", dir, "--root", TEST_ROOT]);
    expect(addResult.stderr).toBe("");
    expect(addResult.stdout).toContain("[ADDED] cli-skill");

    const listResult = await runUh(["skill", "list", "--root", TEST_ROOT]);
    expect(listResult.stderr).toBe("");
    expect(listResult.stdout).toContain("cli-skill");
    expect(listResult.stdout).toContain("CLI Skill");
    expect(listResult.stdout).toContain("cli trigger");
  });
});
