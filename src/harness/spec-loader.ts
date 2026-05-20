import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const SPEC_SCHEMA_VERSION = "uh.spec.v0" as const;

const SpecStatusSchema = z.enum(["draft", "approved", "shipped"]);

const SpecFrontMatterSchema = z.object({
  schema: z.literal(SPEC_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1),
  status: SpecStatusSchema,
  owners: z.array(z.string().min(1)).min(1),
  linear: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
}).strict();

export type SpecFrontMatter = z.infer<typeof SpecFrontMatterSchema>;

export type SpecAcceptanceCriterion = {
  id: string;
  description: string;
};

export type LoadedSpec = {
  path: string;
  frontMatter: SpecFrontMatter;
  goal: string;
  nonGoals: string[];
  acceptanceCriteria: SpecAcceptanceCriterion[];
  risks: string[];
  openQuestions: string[];
};

const REQUIRED_SECTIONS = [
  "Goal",
  "Non-goals",
  "Acceptance criteria",
  "Risks",
  "Open questions",
] as const;

type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export async function loadSpecFile(specPath: string): Promise<LoadedSpec> {
  const absolute = path.resolve(specPath);
  const raw = await readFile(absolute, "utf-8");
  return parseSpecContent(raw, absolute);
}

export function parseSpecContent(raw: string, specPath = "<spec>"): LoadedSpec {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const match = FRONT_MATTER_RE.exec(trimmed);
  if (!match) {
    throw new Error(`Spec missing YAML front-matter delimiters (---): ${specPath}`);
  }

  let frontMatterRaw: unknown;
  try {
    frontMatterRaw = parseYaml(match[1]);
  } catch (err) {
    throw new Error(`Spec front-matter is not valid YAML (${specPath}): ${(err as Error).message}`);
  }

  if (frontMatterRaw === null || typeof frontMatterRaw !== "object" || Array.isArray(frontMatterRaw)) {
    throw new Error(`Spec front-matter must be a YAML mapping: ${specPath}`);
  }

  const frontMatter = SpecFrontMatterSchema.parse(frontMatterRaw);
  const sections = extractSections(match[2]);
  assertRequiredSections(sections, specPath);

  const goal = sections.get("Goal")?.trim() ?? "";
  if (goal.length === 0) {
    throw new Error(`Spec section "## Goal" must not be empty: ${specPath}`);
  }

  const acBody = sections.get("Acceptance criteria") ?? "";
  const acceptanceCriteria = parseAcceptanceCriteria(acBody, specPath);
  if (acceptanceCriteria.length === 0) {
    throw new Error(`Spec section "## Acceptance criteria" must contain at least one numbered item: ${specPath}`);
  }

  return {
    path: specPath,
    frontMatter,
    goal,
    nonGoals: parseBulletList(sections.get("Non-goals") ?? ""),
    acceptanceCriteria,
    risks: parseBulletList(sections.get("Risks") ?? ""),
    openQuestions: parseBulletList(sections.get("Open questions") ?? ""),
  };
}

export function linearRefsFromSpec(spec: LoadedSpec): Array<{ provider: string; id: string }> {
  const linear = spec.frontMatter.linear;
  const ids = typeof linear === "string" ? [linear] : linear;
  return ids.map((id) => ({ provider: "linear", id }));
}

export function missionIdFromSpecId(specId: string): string {
  return specId.trim();
}

function extractSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.split(/\r?\n/);
  let current: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current !== null) {
      sections.set(current, buffer.join("\n").trim());
      buffer.length = 0;
    }
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      current = h2[1].trim();
      continue;
    }
    if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function assertRequiredSections(sections: Map<string, string>, specPath: string): void {
  for (const name of REQUIRED_SECTIONS) {
    if (!sections.has(name)) {
      throw new Error(`Spec missing required section "## ${name}": ${specPath}`);
    }
  }
}

function parseBulletList(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function parseAcceptanceCriteria(body: string, specPath: string): SpecAcceptanceCriterion[] {
  const items: SpecAcceptanceCriterion[] = [];
  const numbered = /^\s*(\d+)\.\s+(.+?)\s*$/;

  for (const line of body.split(/\r?\n/)) {
    const match = numbered.exec(line);
    if (!match) continue;

    const index = Number(match[1]);
    if (!Number.isInteger(index) || index <= 0) {
      throw new Error(`Invalid acceptance criterion number in ${specPath}: ${line}`);
    }

    let description = match[2].trim();
    const acPrefix = /^AC(\d+)\s*:\s*(.+)$/i.exec(description);
    const id = acPrefix ? `AC${acPrefix[1]}` : `AC${index}`;
    if (acPrefix) {
      description = acPrefix[2].trim();
    }
    if (description.length === 0) {
      throw new Error(`Empty acceptance criterion at item ${index} in ${specPath}`);
    }

    items.push({ id, description });
  }

  return items;
}
