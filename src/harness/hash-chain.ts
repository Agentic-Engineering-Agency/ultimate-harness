import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { HIVE_GENESIS_HASH } from "../schema/hive.js";

/**
 * A tiny append-only hash chain shared by the hive facts, the intervention
 * ledger, and the land decision index.
 *
 * Each entry carries `prev_hash` (the previous entry's `hash`, or the fixed
 * genesis value for the first) and its own `hash` — sha256 over the entry's
 * canonical JSON with the `hash` field removed. Any edit, deletion, or reorder
 * of a chained line is therefore detectable by recomputation alone.
 */

/** The fixed value a chain's first `prev_hash` names. */
export const GENESIS_HASH = HIVE_GENESIS_HASH;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Deterministic JSON with object keys sorted at every depth. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortValue(source[key]);
    return out;
  }
  return value as JsonValue;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** sha256 of `content`, read from disk. */
export function sha256File(file: string): string {
  return sha256Hex(readFileSync(file, "utf-8"));
}

/** An entry's own hash: sha256 over its canonical JSON without the `hash` field. */
export function entryHash(entry: Record<string, unknown>): string {
  const { hash: _hash, ...rest } = entry;
  return sha256Hex(canonicalJson(rest));
}

/** Body plus `prev_hash` and the recomputed `hash`. */
export function chainEntry(
  previousHash: string,
  body: Record<string, unknown>,
): Record<string, unknown> & { prev_hash: string; hash: string } {
  const withPrev = { ...body, prev_hash: previousHash };
  return { ...withPrev, hash: entryHash(withPrev) };
}

export interface ChainBreak {
  /** 1-based line number of the first broken entry. */
  line: number;
  reason: string;
}

/**
 * Verify a chain of JSON lines. Returns the first break, or undefined when the
 * whole file is a valid chain.
 *
 * An entry with neither `prev_hash` nor `hash` is a legacy, pre-chain line: it
 * is accepted only as a leading prefix (`allowLegacyPrefix`), before the first
 * chained entry (the anchor) records the chain. An entry with only one of the
 * two fields is always a break.
 */
export function verifyChainedLines(
  lines: readonly string[],
  options: { allowLegacyPrefix?: boolean } = {},
): ChainBreak | undefined {
  let expected = GENESIS_HASH;
  let anchored = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { line: index + 1, reason: "entry is not valid JSON" };
    }
    const entry = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
    const hasPrev = entry !== undefined && typeof entry.prev_hash === "string";
    const hasHash = entry !== undefined && typeof entry.hash === "string";
    if (!hasPrev && !hasHash) {
      if (options.allowLegacyPrefix === true && !anchored) continue;
      return { line: index + 1, reason: "entry is not hash-chained" };
    }
    if (!hasPrev || !hasHash || entry === undefined) {
      return { line: index + 1, reason: "entry has an incomplete hash chain" };
    }
    if (entry.prev_hash !== expected) {
      return { line: index + 1, reason: `prev_hash ${String(entry.prev_hash)} does not chain to ${expected}` };
    }
    const recomputed = entryHash(entry);
    if (entry.hash !== recomputed) {
      return { line: index + 1, reason: "hash does not match the entry content" };
    }
    expected = entry.hash as string;
    anchored = true;
  }
  return undefined;
}

/** The last chained entry's `hash`, or the genesis value when the file is empty. */
export function lastChainedHash(lines: readonly string[]): string {
  let expected = GENESIS_HASH;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.hash === "string" && /^[a-f0-9]{64}$/.test(parsed.hash)) expected = parsed.hash;
    } catch {
      // A malformed line cannot supply a chain head; verification reports it.
    }
  }
  return expected;
}

/** The non-empty lines of a JSON-lines file, or an empty list when it is absent. */
export function readJsonLines(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8").split(/\r?\n/);
}

export interface RelinkedEntry {
  line: number;
  id?: string;
  /** `fork`: the entry linked to the same parent as the entry before it. `follows_fork`: it linked to an entry that was re-linked. */
  reason: "fork" | "follows_fork";
  old_prev_hash: string;
  new_prev_hash: string;
  old_hash: string;
  new_hash: string;
}

type ChainedLine = { entry: Record<string, unknown>; prev: string; hash: string };

/** The chain fields of a line, or a break when it is not a well-formed chained entry. Legacy lines return undefined. */
function readChainedLine(line: string, index: number, anchored: boolean, allowLegacyPrefix: boolean): ChainedLine | ChainBreak | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { line: index + 1, reason: "entry is not valid JSON" };
  }
  const entry = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  const hasPrev = entry !== undefined && typeof entry.prev_hash === "string";
  const hasHash = entry !== undefined && typeof entry.hash === "string";
  if (!hasPrev && !hasHash) {
    return allowLegacyPrefix && !anchored ? undefined : { line: index + 1, reason: "entry is not hash-chained" };
  }
  if (!hasPrev || !hasHash || entry === undefined) return { line: index + 1, reason: "entry has an incomplete hash chain" };
  if (entry.hash !== entryHash(entry)) return { line: index + 1, reason: "hash does not match the entry content" };
  return { entry, prev: entry.prev_hash as string, hash: entry.hash as string };
}

const isBreak = (value: ChainedLine | ChainBreak | undefined): value is ChainBreak => value !== undefined && "reason" in value;

/**
 * Verify a chain like {@link verifyChainedLines}, but tell apart the one break the old concurrent-append bug
 * made. Two writers that read the same last line each appended an entry linking to it, so an entry whose
 * `prev_hash` is its predecessor's own `prev_hash` is a `fork` (its line is listed in `forks`) and the walk
 * goes on from it. Every other break, such as an edited entry, a deleted or reordered one or a stray link, is
 * `hard` and stops the walk.
 */
export function verifyChainedLinesTolerant(
  lines: readonly string[],
  options: { allowLegacyPrefix?: boolean } = {},
): { hard?: ChainBreak; forks: number[] } {
  const forks: number[] = [];
  let expected = GENESIS_HASH;
  let previousPrev: string | undefined;
  let anchored = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.trim().length === 0) continue;
    const read = readChainedLine(lines[index]!, index, anchored, options.allowLegacyPrefix === true);
    if (read === undefined) continue;
    if (isBreak(read)) return { hard: read, forks };
    if (read.prev !== expected) {
      if (previousPrev !== undefined && read.prev === previousPrev) forks.push(index + 1);
      else return { hard: { line: index + 1, reason: `prev_hash ${read.prev} does not chain to ${expected}` }, forks };
    }
    expected = read.hash;
    previousPrev = read.prev;
    anchored = true;
  }
  return { forks };
}

/**
 * Re-link a chain forked by the old append bug into one valid chain: every fork entry takes its predecessor
 * as its parent, and each entry after it re-links to the one before it, with the hashes recomputed. Only the
 * chain fields change. A chain with any break other than a fork is not touched: the result is the break.
 */
export function relinkForks(
  lines: readonly string[],
  options: { allowLegacyPrefix?: boolean } = {},
): { lines: string[]; relinked: RelinkedEntry[] } | { error: ChainBreak } {
  const out: string[] = [];
  const relinked: RelinkedEntry[] = [];
  let originalExpected = GENESIS_HASH;
  let newExpected = GENESIS_HASH;
  let previousPrev: string | undefined;
  let anchored = false;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]!;
    if (text.trim().length === 0) { out.push(text); continue; }
    const read = readChainedLine(text, index, anchored, options.allowLegacyPrefix === true);
    if (read === undefined) { out.push(text); continue; }
    if (isBreak(read)) return { error: read };
    const isFork = read.prev !== originalExpected;
    if (isFork && !(previousPrev !== undefined && read.prev === previousPrev)) {
      return { error: { line: index + 1, reason: `prev_hash ${read.prev} does not chain to ${originalExpected}` } };
    }
    if (read.prev === newExpected) {
      out.push(text);
      newExpected = read.hash;
    } else {
      const { prev_hash: _prev, hash: _hash, ...body } = read.entry;
      const updated = chainEntry(newExpected, body);
      out.push(JSON.stringify(updated));
      relinked.push({
        line: index + 1,
        ...(typeof read.entry.id === "string" ? { id: read.entry.id } : {}),
        reason: isFork ? "fork" : "follows_fork",
        old_prev_hash: read.prev,
        new_prev_hash: newExpected,
        old_hash: read.hash,
        new_hash: updated.hash,
      });
      newExpected = updated.hash;
    }
    originalExpected = read.hash;
    previousPrev = read.prev;
    anchored = true;
  }
  return { lines: out, relinked };
}
