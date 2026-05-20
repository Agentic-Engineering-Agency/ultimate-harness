import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSpecFile, type LoadedSpec, type SpecAcceptanceCriterion } from "./spec-loader.js";

export type ScaffoldLang = "ts" | "py";

export type ScaffoldTestsOptions = {
  specPath: string;
  lang: ScaffoldLang;
  outPath: string;
};

export type ScaffoldTestsResult = {
  path: string;
  created: boolean;
  merged: boolean;
  addedAcIds: string[];
};

export async function scaffoldTestsFromSpec(
  options: ScaffoldTestsOptions,
): Promise<ScaffoldTestsResult> {
  const spec = await loadSpecFile(options.specPath);
  const outPath = path.resolve(options.outPath);
  await mkdir(path.dirname(outPath), { recursive: true });

  let existing: string | undefined;
  try {
    await access(outPath);
    existing = await readFile(outPath, "utf-8");
  } catch {
    existing = undefined;
  }

  const content =
    existing === undefined
      ? generateFreshScaffold(spec, options.lang, spec.path)
      : mergeScaffoldContent(existing, spec, options.lang);

  await writeFile(outPath, content, "utf-8");

  const preservedBefore =
    existing === undefined
      ? new Set<string>()
      : new Set(extractAcBlocks(existing, options.lang).keys());
  const addedAcIds = spec.acceptanceCriteria
    .map((ac) => ac.id)
    .filter((id) => !preservedBefore.has(id));

  return {
    path: outPath,
    created: existing === undefined,
    merged: existing !== undefined,
    addedAcIds,
  };
}

export function generateFreshScaffold(
  spec: LoadedSpec,
  lang: ScaffoldLang,
  specPath: string,
): string {
  return `${scaffoldHeader(spec, specPath, lang)}\n${renderAcBlocks(spec.acceptanceCriteria, lang, new Map())}\n`;
}

export function mergeScaffoldContent(
  existing: string,
  spec: LoadedSpec,
  lang: ScaffoldLang,
): string {
  const preserved = extractAcBlocks(existing, lang);
  return `${scaffoldHeader(spec, spec.path, lang)}\n${renderAcBlocks(spec.acceptanceCriteria, lang, preserved)}\n`;
}

function scaffoldHeader(spec: LoadedSpec, specPath: string, lang: ScaffoldLang): string {
  const describeTitle = `${spec.frontMatter.id} — ${spec.frontMatter.title}`;
  const rerun = `uh spec scaffold --from ${posixSpecPath(specPath)} --lang ${lang}`;
  const generated = `Generated from ${posixSpecPath(specPath)} @ ${spec.frontMatter.id}`;

  if (lang === "ts") {
    return [
      'import { describe, it } from "vitest";',
      "",
      `// ${generated}`,
      `// Re-run: ${rerun}`,
      `describe("${escapeTsString(describeTitle)}", () => {`,
    ].join("\n");
  }

  return [
    '"""',
    generated,
    `Re-run: ${rerun}`,
    '"""',
    "import pytest",
    "",
    `class Test${sanitizePythonClassName(spec.frontMatter.id)}:`,
  ].join("\n");
}

type AcBlockMap = Map<string, string>;

function extractAcBlocks(content: string, lang: ScaffoldLang): AcBlockMap {
  return lang === "ts" ? extractTypeScriptAcBlocks(content) : extractPythonAcBlocks(content);
}

function extractTypeScriptAcBlocks(content: string): AcBlockMap {
  const blocks: AcBlockMap = new Map();
  const lines = content.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const header = /^\s*(it(?:\.todo)?)\(\s*"((AC\d+):[^"]*)"/.exec(line);
    if (!header) {
      index += 1;
      continue;
    }
    const acId = header[2].match(/^(AC\d+)/)?.[1];
    if (!acId) {
      index += 1;
      continue;
    }
    const kind = header[1];
    const start = index;
    let end = index + 1;
    if (line.includes("{")) {
      let depth = braceDepth(line);
      while (end < lines.length && depth > 0) {
        depth += braceDepth(lines[end]);
        end += 1;
      }
    } else if (!line.trimEnd().endsWith(");")) {
      while (end < lines.length && !lines[end].includes(");")) {
        end += 1;
      }
      end += 1;
    }
    const block = lines.slice(start, end).join("\n").trimEnd();
    const body = block.includes("{") ? block.slice(block.indexOf("{") + 1, block.lastIndexOf("}")) : "";
    const implemented = kind === "it" && body.replace(/\s|\/\/.*$/gm, "").length > 0;
    if (implemented || !blocks.has(acId)) {
      blocks.set(acId, block);
    }
    index = end;
  }
  return blocks;
}

function braceDepth(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
  }
  return depth;
}

function extractPythonAcBlocks(content: string): AcBlockMap {
  const blocks: AcBlockMap = new Map();
  const lines = content.split("\n");
  let index = 0;
  while (index < lines.length) {
    const skipMatch = /^\s*@pytest\.mark\.skip\(reason=["'](AC\d+):/.exec(lines[index]);
    if (!skipMatch) {
      index += 1;
      continue;
    }
    const acId = skipMatch[1];
    const start = index;
    index += 1;
    if (index >= lines.length || !/^\s*def test_/.test(lines[index])) {
      continue;
    }
    index += 1;
    while (index < lines.length && (lines[index].trim() === "" || /^\s{4,}/.test(lines[index]))) {
      index += 1;
    }
    const block = lines.slice(start, index).join("\n").trimEnd();
    const bodyLines = block.split("\n").slice(2);
    const implemented = bodyLines.some(
      (line) =>
        line.trim().length > 0 &&
        !line.includes("pytest.skip") &&
        line.trim() !== "pass" &&
        !line.trim().startsWith("#"),
    );
    if (implemented || !blocks.has(acId)) {
      blocks.set(acId, block);
    }
  }
  return blocks;
}

function renderAcBlocks(
  criteria: SpecAcceptanceCriterion[],
  lang: ScaffoldLang,
  preserved: AcBlockMap,
): string {
  const parts: string[] = [];
  for (const ac of criteria) {
    const existing = preserved.get(ac.id);
    if (existing !== undefined && shouldPreserveBlock(existing, lang)) {
      parts.push(indentBlock(existing, lang));
      continue;
    }
    parts.push(lang === "ts" ? formatTypeScriptTodo(ac) : formatPythonSkipBlock(ac));
  }
  if (lang === "ts") {
    parts.push("});");
  }
  return parts.join("\n");
}

function shouldPreserveBlock(block: string, lang: ScaffoldLang): boolean {
  if (lang === "ts") {
    return /^\s*it\s*\(/.test(block) && !/^\s*it\.todo/.test(block);
  }
  const bodyLines = block.split("\n").slice(2);
  return bodyLines.some(
    (line) =>
      line.trim().length > 0 &&
      !line.includes("pytest.skip") &&
      line.trim() !== "pass" &&
      !line.trim().startsWith("#"),
  );
}

function indentBlock(block: string, lang: ScaffoldLang): string {
  const indent = lang === "ts" ? "  " : "    ";
  return block
    .split("\n")
    .map((line) => (line.length === 0 ? line : line.startsWith(indent) ? line : `${indent}${line.trimStart()}`))
    .join("\n");
}

function formatTypeScriptTodo(ac: SpecAcceptanceCriterion): string {
  return `  it.todo("${escapeTsString(acLabel(ac))}");`;
}

function formatPythonSkipBlock(ac: SpecAcceptanceCriterion): string {
  const fn = `test_${ac.id.toLowerCase()}_${slugify(ac.description)}`;
  return [
    `    @pytest.mark.skip(reason="${escapePyString(acLabel(ac))}")`,
    `    def ${fn}(self):`,
    `        pytest.skip("${escapePyString(acLabel(ac))}")`,
  ].join("\n");
}

function acLabel(ac: SpecAcceptanceCriterion): string {
  return `${ac.id}: ${ac.description}`;
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapePyString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function posixSpecPath(specPath: string): string {
  return specPath.split(path.sep).join("/");
}

function sanitizePythonClassName(specId: string): string {
  const cleaned = specId.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (cleaned.length === 0) return "Spec";
  if (/^\d/.test(cleaned)) return `Spec_${cleaned}`;
  return cleaned;
}

function slugify(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "criterion";
}

export function parseScaffoldLang(value: string): ScaffoldLang {
  const normalized = value.trim().toLowerCase();
  if (normalized === "ts" || normalized === "typescript") return "ts";
  if (normalized === "py" || normalized === "python") return "py";
  throw new Error(`Unsupported scaffold language "${value}" (expected ts or py)`);
}
