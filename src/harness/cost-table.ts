import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { COST_CLASSES, type CostClass } from "../schema/adapter-capabilities.js";
import { OperatorPriceTableSchema, type OperatorPriceEntry } from "../schema/prices.js";
import { isUsageNumber } from "./usage.js";

/** ISO date (YYYY-MM-DD) when $/Mtok rates in {@link COST_CLASSES} were last verified. */
export const COST_TABLE_LAST_REVIEWED = "2026-05-20";

/** @deprecated Prefer {@link COST_TABLE_LAST_REVIEWED}. */
export const last_reviewed = COST_TABLE_LAST_REVIEWED;

export { COST_CLASSES };

/** Ascending cost rank for auto-router filtering (`free` is cheapest). */
export const COST_CLASS_RANK: Record<CostClass, number> = {
  free: 0,
  cheap: 1,
  standard: 2,
  premium: 3,
};

export function compareCostClass(a: CostClass, b: CostClass): number {
  return COST_CLASS_RANK[a] - COST_CLASS_RANK[b];
}

export function costClassWithinMax(actual: CostClass, max: CostClass): boolean {
  return COST_CLASS_RANK[actual] <= COST_CLASS_RANK[max];
}

/* -------------------------------------------------------------------------- */
/* Operator price table (.harness/prices.yaml)                                */
/* -------------------------------------------------------------------------- */

/** The operator price table lives at `<project root>/.harness/prices.yaml`. */
export const OPERATOR_PRICE_TABLE_PATH = path.join(".harness", "prices.yaml");

/** Operator prices keyed by lowercased model id (matching is case-insensitive). */
export type OperatorPriceTable = Map<string, OperatorPriceEntry>;

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the operator price table, walking up from `startDir` so callers rooted
 * at a team worker's artifact scope still find the project-root table. A
 * missing or malformed table prices nothing (`undefined`), never a guess.
 */
export async function loadOperatorPriceTable(startDir: string): Promise<OperatorPriceTable | undefined> {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, OPERATOR_PRICE_TABLE_PATH);
    if (await fileExists(candidate)) {
      try {
        const document = OperatorPriceTableSchema.parse(parse(await readFile(candidate, "utf8")));
        const table: OperatorPriceTable = new Map(
          Object.entries(document.models).map(([model, entry]) => [model.toLowerCase(), entry]),
        );
        return table;
      } catch {
        return undefined;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Case-insensitive lookup of one model's operator price entry. */
export function operatorPriceFor(table: OperatorPriceTable | undefined, model: string | undefined): OperatorPriceEntry | undefined {
  if (table === undefined || model === undefined) return undefined;
  return table.get(model.toLowerCase());
}

/** Price complete measurements only; a counter the stream never reported is never read as zero. */
export function estimateOperatorCost(
  totals: { input?: number; output?: number; cache_read?: number; cache_write?: number },
  price: OperatorPriceEntry,
): number | undefined {
  const { input, output, cache_read: cacheRead, cache_write: cacheWrite } = totals;
  if (!isUsageNumber(input) || !isUsageNumber(output) || !isUsageNumber(cacheRead) || !isUsageNumber(cacheWrite)) return undefined;
  const cost = (input * price.input_usd_per_million + output * price.output_usd_per_million
    + cacheRead * price.cache_read_usd_per_million + cacheWrite * price.cache_write_usd_per_million) / 1_000_000;
  return isUsageNumber(cost) ? cost : undefined;
}
