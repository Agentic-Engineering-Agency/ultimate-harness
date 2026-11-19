#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COVERAGE_THRESHOLD = 0.85;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 2;
const DEFAULT_CONCURRENCY = 4;

function usage() {
  console.error(
    "Usage: node scripts/landscape/verify-register.mjs [--only <substring>] [--concurrency <n>] [--json <path>] [--fixture-dir <path>] [--register <path>",
  );
}

function parseArgs(argv) {
  const options = {
    only: "",
    concurrency: DEFAULT_CONCURRENCY,
    jsonPath: undefined,
    fixtureDir: undefined,
    registerPath: resolve(process.cwd(), "docs/research/landscape-register.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--only") options.only = requiredValue(argv, ++index, arg);
    else if (arg === "--concurrency") {
      const value = Number.parseInt(requiredValue(argv, ++index, arg), 10);
      if (!Number.isInteger(value) || value < 1) throw new Error("--concurrency must be a positive integer");
      options.concurrency = value;
    } else if (arg === "--json") options.jsonPath = resolve(requiredValue(argv, ++index, arg));
    else if (arg === "--fixture-dir") options.fixtureDir = resolve(requiredValue(argv, ++index, arg));
    else if (arg === "--register") options.registerPath = resolve(requiredValue(argv, ++index, arg));
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function requiredValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function decodeEntities(value) {
  return value
    .replace(/&#x([\da-f]+);?/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);?/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

// Keep this normalization intentionally aligned with verify_fetched4.js: HTML
// entities are decoded, tags become whitespace, then punctuation is discarded.
function words(value) {
  return decodeEntities(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function grams(wordList, size = 4) {
  const result = new Set();
  for (let index = 0; index + size <= wordList.length; index += 1) {
    result.add(wordList.slice(index, index + size).join(" "));
  }
  return result;
}

function coverage(quote, text) {
  const quoteGrams = grams(words(quote));
  if (quoteGrams.size === 0) return 0;
  const pageGrams = grams(words(text));
  let hits = 0;
  for (const gram of quoteGrams) if (pageGrams.has(gram)) hits += 1;
  return hits / quoteGrams.size;
}

function urlVariants(sourceUrl) {
  const variants = [sourceUrl];
  const githubRepo = sourceUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/);
  if (githubRepo) variants.unshift(`https://raw.githubusercontent.com/${githubRepo[1]}/${githubRepo[2]}/HEAD/README.md`);
  const githubBlob = sourceUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (githubBlob) {
    variants.unshift(`https://raw.githubusercontent.com/${githubBlob[1]}/${githubBlob[2]}/${githubBlob[3]}/${githubBlob[4]}`);
  }
  if (!/github\.com|githubusercontent\.com/.test(sourceUrl) && !/\.md$/i.test(sourceUrl)) {
    variants.push(`${sourceUrl.replace(/\/?$/, "")}.md`);
    variants.push(`${sourceUrl.replace(/\/?$/, "")}/index.md`);
  }
  return [...new Set(variants)];
}

function stableHash(url) {
  return createHash("sha256").update(url).digest("hex");
}

async function fixtureResponse(fixtureDir, url) {
  const hash = stableHash(url);
  const base = resolve(fixtureDir, hash);
  for (const extension of [".html", ".md", ".txt", ""]) {
    try {
      const body = await readFile(`${base}${extension}`, "utf8");
      let status = 200;
      try {
        status = Number.parseInt((await readFile(`${base}.status`, "utf8")).trim(), 10);
        if (!Number.isInteger(status)) status = 200;
      } catch {
        // A status sidecar is optional for successful fixture pages.
      }
      return { status, body };
    } catch {
      // Try the next supported fixture extension.
    }
  }
  try {
    const status = Number.parseInt((await readFile(`${base}.status`, "utf8")).trim(), 10);
    return { status: Number.isInteger(status) ? status : 404, body: "" };
  } catch {
    return { status: 404, body: "" };
  }
}

async function fetchResponse(url) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": "ultimate-harness-landscape-verifier" },
      });
      const body = response.ok ? await response.text() : "";
      return { status: response.status, body };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: 0, body: "", error: lastError };
}

async function loadResponse(url, options) {
  if (!options.responseCache.has(url)) {
    options.responseCache.set(
      url,
      options.fixtureDir ? fixtureResponse(options.fixtureDir, url) : fetchResponse(url),
    );
  }
  return options.responseCache.get(url);
}

function isGuideSourced(row) {
  return row.source_kind === "installed_cli_guide" ||
    row.source_kind === "local_guide" ||
    row.coordinator_check === "not_applicable_local_guide" ||
    String(row.source_url ?? "").startsWith("orca://");
}

async function verifyRow(row, options) {
  const sourceUrl = typeof row.source_url === "string" ? row.source_url : "";
  const base = {
    system: row.system ?? "(unknown)",
    build_item: row.build_item,
    source_url: sourceUrl,
    quote: row.quote,
    date_checked: row.date_checked,
  };
  if (!sourceUrl || isGuideSourced(row)) return { ...base, state: "unverifiable", coverage: 0 };

  let bestCoverage = 0;
  let usedUrl = "";
  let fetchedAny = false;
  for (const variant of urlVariants(sourceUrl)) {
    const response = await loadResponse(variant, options);
    if (response.status < 200 || response.status >= 300 || response.body.length < 200) continue;
    fetchedAny = true;
    const candidateCoverage = coverage(row.quote, response.body);
    if (candidateCoverage > bestCoverage) {
      bestCoverage = candidateCoverage;
      usedUrl = variant;
    }
    if (bestCoverage >= COVERAGE_THRESHOLD) break;
  }

  const state = !fetchedAny
    ? "unreachable"
    : bestCoverage >= COVERAGE_THRESHOLD
      ? "verified"
      : "drifted";
  return { ...base, state, coverage: Number(bestCoverage.toFixed(2)), ...(usedUrl ? { via: usedUrl } : {}) };
}

async function mapConcurrent(rows, concurrency, callback) {
  const results = new Array(rows.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= rows.length) return;
      results[index] = await callback(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length || 1) }, worker));
  return results;
}

function summary(results) {
  const counts = { verified: 0, drifted: 0, unreachable: 0, unverifiable: 0 };
  for (const result of results) counts[result.state] += 1;
  return { ...counts, total: results.length };
}

export async function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  options.responseCache = new Map();
  const register = JSON.parse(await readFile(options.registerPath, "utf8"));
  if (!register || !Array.isArray(register.rows)) throw new Error("landscape register must contain a rows array");
  const rows = options.only
    ? register.rows.filter((row) => `${row.system ?? ""} ${row.source_url ?? ""}`.toLowerCase().includes(options.only.toLowerCase()))
    : register.rows;
  const results = await mapConcurrent(rows, options.concurrency, (row) => verifyRow(row, options));
  const counts = summary(results);
  const exitCode = counts.drifted > 0 ? 1 : counts.unreachable > 0 ? 2 : 0;
  for (const result of results) {
    console.log(`${result.state} ${result.system} ${result.source_url || "(no URL)"} coverage=${result.coverage.toFixed(2)}`);
  }
  const summaryLine = `landscape: verified ${counts.verified} drifted ${counts.drifted} unreachable ${counts.unreachable} unverifiable ${counts.unverifiable} of ${counts.total}`;
  console.log(summaryLine);
  if (options.jsonPath) {
    await mkdir(dirname(options.jsonPath), { recursive: true });
    await writeFile(options.jsonPath, `${JSON.stringify({ rows: results, summary: counts, exit_code: exitCode }, null, 2)}\n`);
  }
  return { results, counts, summaryLine, exitCode };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then(({ exitCode }) => process.exitCode = exitCode).catch((error) => {
    console.error(`landscape: ${error.message}`);
    usage();
    process.exitCode = 2;
  });
}
