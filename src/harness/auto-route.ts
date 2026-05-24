import { CAPABILITIES, type AdapterId } from "../adapters/capabilities/index.js";
import type { AdapterCapabilities, CostClass } from "../schema/adapter-capabilities.js";
import type { MissionDocument } from "../schema/mission.js";
import { compareCostClass } from "./cost-table.js";
import {
  evaluateAdapterEligibility,
  resolveRuntimeRequirements,
} from "./runtime-requirements.js";

/**
 * UH-101 — deterministic adapter auto-routing.
 *
 * Given a mission's `runtime_requirements` and the set of installed adapters
 * that carry a typed capability manifest, pick the cheapest adapter that
 * satisfies the requirements. Same inputs always yield the same choice (no RNG):
 * eligible adapters are sorted by cost class ascending, then by context window
 * descending, then by adapter id for a stable final tie-break.
 */

export interface AutoRouteCandidate {
  adapter: AdapterId;
  eligible: boolean;
  exclusionReasons: string[];
  cost_class: CostClass;
  max_context_tokens: number;
}

export interface AutoRouteDecision {
  /** Chosen adapter, or null when nothing is eligible / available. */
  adapter: AdapterId | null;
  /** Human-readable explanation of the decision. */
  reason: string;
  /** Every considered adapter with its eligibility verdict, sorted best-first. */
  candidates: AutoRouteCandidate[];
}

function rankCandidate(a: AutoRouteCandidate, b: AutoRouteCandidate): number {
  const byCost = compareCostClass(a.cost_class, b.cost_class);
  if (byCost !== 0) return byCost;
  if (a.max_context_tokens !== b.max_context_tokens) {
    return b.max_context_tokens - a.max_context_tokens;
  }
  return a.adapter.localeCompare(b.adapter);
}

export function chooseAdapter(
  mission: MissionDocument,
  available: AdapterId[],
  caps: Record<AdapterId, AdapterCapabilities> = CAPABILITIES,
): AutoRouteDecision {
  const requirements = resolveRuntimeRequirements(mission);

  // De-dup, drop ids without a capability manifest, then rank for determinism.
  const ids = [...new Set(available)].filter((id) => caps[id] !== undefined);

  const candidates: AutoRouteCandidate[] = ids
    .map((id) => {
      const adapterCaps = caps[id];
      const exclusionReasons = evaluateAdapterEligibility(adapterCaps, requirements);
      return {
        adapter: id,
        eligible: exclusionReasons.length === 0,
        exclusionReasons,
        cost_class: adapterCaps.cost_class,
        max_context_tokens: adapterCaps.max_context_tokens,
      } satisfies AutoRouteCandidate;
    })
    .sort(rankCandidate);

  if (candidates.length === 0) {
    return {
      adapter: null,
      reason: "no installed adapter has a typed capability manifest to route over",
      candidates,
    };
  }

  const eligible = candidates.filter((c) => c.eligible);
  if (eligible.length === 0) {
    const detail = candidates
      .map((c) => `${c.adapter} (${c.exclusionReasons.join("; ")})`)
      .join(", ");
    return {
      adapter: null,
      reason: `no adapter satisfies the mission runtime_requirements: ${detail}`,
      candidates,
    };
  }

  const winner = eligible[0];
  return {
    adapter: winner.adapter,
    reason: `cheapest eligible adapter (cost_class=${winner.cost_class}, max_context_tokens=${winner.max_context_tokens})`,
    candidates,
  };
}

/** Render the decision matrix for `uh mission run --auto --explain`. */
export function formatAutoRouteExplain(decision: AutoRouteDecision): string {
  const lines = ["Auto-route decision matrix:"];
  for (const c of decision.candidates) {
    const verdict = c.eligible
      ? "eligible"
      : `excluded: ${c.exclusionReasons.join("; ")}`;
    lines.push(
      `  ${c.adapter.padEnd(14)} cost=${c.cost_class.padEnd(9)} ctx=${String(c.max_context_tokens).padEnd(9)} ${verdict}`,
    );
  }
  lines.push(
    decision.adapter
      ? `=> ${decision.adapter}: ${decision.reason}`
      : `=> no route: ${decision.reason}`,
  );
  return lines.join("\n");
}
