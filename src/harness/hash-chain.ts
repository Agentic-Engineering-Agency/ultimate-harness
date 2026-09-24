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
