import { COST_CLASSES, type CostClass } from "../schema/adapter-capabilities.js";

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
