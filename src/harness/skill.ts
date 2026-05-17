import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import {
  SkillFrontmatterSchema,
  validateSkillsIndex,
  type SkillFrontmatter,
  type SkillsIndexDocument,
} from "../schema/artifacts.js";
import { harnessDir, skillsIndex } from "./paths.js";
import {
  fileExists,
  isPathWithin,
  rejectSymlinkIfExists,
  requireInitializedProject,
} from "./mission.js";

const SKILL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export type SkillIndexEntry = {
  id: string;
  name: string;
  description: string;
  path: string;
  triggers: string[];
  prerequisites: string[];
  related: string[];
};

export type AddSkillResult = {
  id: string;
  path: string;
  index_path: string;
};

export type CheckSkillResult = {
  id: string;
  ok: boolean;
  errors: string[];
};

export async function addSkill(root: string, dir: string): Promise<AddSkillResult> {
  if (!dir || dir.trim().length === 0) {
    throw new Error("Skill directory is required");
  }

  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);

  const skillDir = path.isAbsolute(dir) ? path.resolve(dir) : path.resolve(projectRoot, dir);
  if (!isPathWithin(skillDir, projectRoot)) {
    throw new Error(`Unsafe skill directory: ${dir} resolves outside project root`);
  }
  if (skillDir === projectRoot) {
    throw new Error("Skill directory must be a subdirectory of the project root");
  }
  await rejectSymlinkIfExists(skillDir, "Skill directory");
  if (!(await fileExists(skillDir))) {
    throw new Error(`Skill directory does not exist: ${skillDir}`);
  }
  const skillDirStat = await lstat(skillDir);
  if (!skillDirStat.isDirectory()) {
    throw new Error(`Skill path is not a directory: ${skillDir}`);
  }

  const skillFile = path.resolve(skillDir, "SKILL.md");
  if (!isPathWithin(skillFile, skillDir)) {
    throw new Error(`Unsafe SKILL.md path: ${skillFile}`);
  }
  await rejectSymlinkIfExists(skillFile, "SKILL.md file");
  if (!(await fileExists(skillFile))) {
    throw new Error(`SKILL.md not found at ${skillFile}`);
  }

  const frontmatter = parseSkillFrontmatter(await readFile(skillFile, "utf-8"), skillFile);
  assertSafeSkillId(frontmatter.id);

  const indexPath = skillsIndex(projectRoot);
  await rejectSymlinkIfExists(indexPath, "Skills index file");
  const indexDoc = await readSkillsIndexFile(indexPath);

  if (indexDoc.skills.some((s) => s.id === frontmatter.id)) {
    throw new Error(`Skill already registered: id ${frontmatter.id}`);
  }

  const relPath = path.relative(projectRoot, skillDir);
  const entry: SkillIndexEntry = {
    id: frontmatter.id,
    name: frontmatter.name,
    description: frontmatter.description,
    path: relPath,
    triggers: frontmatter.triggers,
    prerequisites: frontmatter.prerequisites,
    related: frontmatter.related,
  };

  const next: SkillsIndexDocument = {
    schema_version: "uh.skills-index.v0",
    skills: [...indexDoc.skills, entry],
  };
  validateSkillsIndex(next);
  await writeFile(indexPath, stringify(next), "utf-8");

  return { id: frontmatter.id, path: skillDir, index_path: indexPath };
}

export async function listSkills(root: string): Promise<SkillIndexEntry[]> {
  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);
  const indexPath = skillsIndex(projectRoot);
  await rejectSymlinkIfExists(indexPath, "Skills index file");
  const indexDoc = await readSkillsIndexFile(indexPath);
  return indexDoc.skills.map(coerceEntry);
}

export async function checkSkill(root: string, id: string): Promise<CheckSkillResult> {
  assertSafeSkillId(id);
  const projectRoot = path.resolve(root);
  await rejectSymlinkIfExists(path.resolve(harnessDir(projectRoot)), "Harness directory");
  await requireInitializedProject(projectRoot);
  const indexPath = skillsIndex(projectRoot);
  await rejectSymlinkIfExists(indexPath, "Skills index file");
  const indexDoc = await readSkillsIndexFile(indexPath);
  const rawEntry = indexDoc.skills.find((s) => s.id === id);
  if (!rawEntry) {
    return { id, ok: false, errors: [`Skill not found in index: ${id}`] };
  }
  const indexed = coerceEntry(rawEntry);
  if (!indexed.path) {
    return { id, ok: false, errors: [`Indexed skill ${id} has no path`] };
  }
  const skillDir = path.resolve(projectRoot, indexed.path);
  if (!isPathWithin(skillDir, projectRoot)) {
    return { id, ok: false, errors: [`Skill path ${indexed.path} resolves outside project root`] };
  }
  try {
    await rejectSymlinkIfExists(skillDir, "Skill directory");
  } catch (err) {
    return { id, ok: false, errors: [(err as Error).message] };
  }
  if (!(await fileExists(skillDir))) {
    return { id, ok: false, errors: [`Skill directory missing: ${skillDir}`] };
  }
  const skillFile = path.resolve(skillDir, "SKILL.md");
  try {
    await rejectSymlinkIfExists(skillFile, "SKILL.md file");
  } catch (err) {
    return { id, ok: false, errors: [(err as Error).message] };
  }
  if (!(await fileExists(skillFile))) {
    return { id, ok: false, errors: [`SKILL.md missing: ${skillFile}`] };
  }

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parseSkillFrontmatter(await readFile(skillFile, "utf-8"), skillFile);
  } catch (err) {
    return { id, ok: false, errors: [(err as Error).message] };
  }

  const errors: string[] = [];
  if (frontmatter.id !== id) {
    errors.push(`SKILL.md id mismatch: index has ${id}, file has ${frontmatter.id}`);
  }
  if (frontmatter.name !== indexed.name) {
    errors.push(`SKILL.md name drifted: index has ${JSON.stringify(indexed.name)}, file has ${JSON.stringify(frontmatter.name)}`);
  }
  if (frontmatter.description !== indexed.description) {
    errors.push("SKILL.md description drifted from index");
  }
  if (!arraysEqual(frontmatter.triggers, indexed.triggers)) {
    errors.push("SKILL.md triggers drifted from index");
  }
  if (!arraysEqual(frontmatter.prerequisites, indexed.prerequisites)) {
    errors.push("SKILL.md prerequisites drifted from index");
  }
  if (!arraysEqual(frontmatter.related, indexed.related)) {
    errors.push("SKILL.md related drifted from index");
  }
  return { id, ok: errors.length === 0, errors };
}

export function assertSafeSkillId(id: string): void {
  if (typeof id !== "string" || id === "." || id === ".." || !SKILL_ID_PATTERN.test(id)) {
    throw new Error(`Invalid skill id: ${JSON.stringify(id)}. Use letters, numbers, dots, underscores, and hyphens; do not use path separators.`);
  }
}

function coerceEntry(entry: SkillsIndexDocument["skills"][number]): SkillIndexEntry {
  return {
    id: entry.id ?? entry.name,
    name: entry.name,
    description: entry.description ?? "",
    path: entry.path ?? "",
    triggers: entry.triggers ?? [],
    prerequisites: entry.prerequisites ?? [],
    related: entry.related ?? [],
  };
}

async function readSkillsIndexFile(indexPath: string): Promise<SkillsIndexDocument> {
  if (!(await fileExists(indexPath))) {
    throw new Error(`Skills index missing: ${indexPath}. Run 'uh init' first.`);
  }
  const raw = await readFile(indexPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new Error(`Skills index YAML parse error: ${(err as Error).message}`);
  }
  try {
    return validateSkillsIndex(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        `Skills index invalid: ${err.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      );
    }
    throw err;
  }
}

function parseSkillFrontmatter(content: string, filePath: string): SkillFrontmatter {
  if (!content.startsWith("---")) {
    throw new Error(`SKILL.md is missing YAML frontmatter delimiter at ${filePath}`);
  }
  // Strip the opening delimiter; it must be followed by a newline (or be the entire prefix).
  const afterOpen = content.slice(3);
  if (!afterOpen.startsWith("\n") && !afterOpen.startsWith("\r\n")) {
    throw new Error(`SKILL.md opening frontmatter delimiter must be on its own line: ${filePath}`);
  }
  const closeIdx = afterOpen.indexOf("\n---");
  if (closeIdx < 0) {
    throw new Error(`SKILL.md frontmatter is not closed (expected closing '---'): ${filePath}`);
  }
  const yamlBlock = afterOpen.slice(0, closeIdx);
  let parsed: unknown;
  try {
    parsed = parse(yamlBlock);
  } catch (err) {
    throw new Error(`SKILL.md frontmatter YAML parse error in ${filePath}: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`SKILL.md frontmatter must be a YAML mapping: ${filePath}`);
  }
  try {
    return SkillFrontmatterSchema.parse(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`SKILL.md frontmatter invalid (${filePath}): ${issues}`);
    }
    throw err;
  }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
