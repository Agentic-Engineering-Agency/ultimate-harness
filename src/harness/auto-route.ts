import { createHash } from "node:crypto";
import { CAPABILITIES, type AdapterId } from "../adapters/capabilities/index.js";
import type { AdapterCapabilities, CostClass } from "../schema/adapter-capabilities.js";
import type { DecisionAuthorizer, DecisionProvider, DecisionProviderStatus, DecisionReceipt, DecisionStatus } from "../schema/decisions.js";
import type { MissionDocument } from "../schema/mission.js";
import { compareCostClass } from "./cost-table.js";
import {
  evaluateAdapterEligibility,
  resolveRuntimeRequirements,
} from "./runtime-requirements.js";
import { recordRouteDecision } from "./decision-receipts.js";
import { evaluateSystemOne, type Question } from "./typesafe.js";

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
  max_context_tokens: number | null;
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
    return (b.max_context_tokens ?? 0) - (a.max_context_tokens ?? 0);
  }
  return a.adapter.localeCompare(b.adapter);
}

export interface ChooseAdapterOptions {
  /**
   * `--force`: do not apply `runtime_requirements` as an eligibility filter.
   * Unmet requirements are still reported on each candidate (so `--explain`
   * shows what was waived) but no longer exclude an adapter from selection.
   */
  ignoreRequirements?: boolean;
}

export function chooseAdapter(
  mission: MissionDocument,
  available: AdapterId[],
  caps: Record<AdapterId, AdapterCapabilities> = CAPABILITIES,
  options: ChooseAdapterOptions = {},
): AutoRouteDecision {
  const ignoreRequirements = options.ignoreRequirements === true;
  const requirements = resolveRuntimeRequirements(mission);

  // De-dup, drop ids without a capability manifest, then rank for determinism.
  const ids = [...new Set(available)].filter((id) => caps[id] !== undefined);

  const candidates: AutoRouteCandidate[] = ids
    .map((id) => {
      const adapterCaps = caps[id];
      const exclusionReasons = evaluateAdapterEligibility(adapterCaps, requirements);
      return {
        adapter: id,
        eligible: ignoreRequirements || exclusionReasons.length === 0,
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
  const waived = ignoreRequirements && winner.exclusionReasons.length > 0
    ? ` — --force: waived runtime_requirements (${winner.exclusionReasons.join("; ")})`
    : "";
  return {
    adapter: winner.adapter,
    reason: `cheapest eligible adapter (cost_class=${winner.cost_class}, max_context_tokens=${winner.max_context_tokens})${waived}`,
    candidates,
  };
}

/** Render the decision matrix for `uh mission run --auto --explain`. */
export function formatAutoRouteExplain(decision: AutoRouteDecision): string {
  const lines = ["Auto-route decision matrix:"];
  for (const c of decision.candidates) {
    const verdict = c.eligible
      ? (c.exclusionReasons.length > 0
        ? `eligible (forced; waived: ${c.exclusionReasons.join("; ")})`
        : "eligible")
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

/**
 * Level 1 semantic routing. Complexity levels the `score` question may return,
 * ordered trivial → complex.
 */
export const COMPLEXITY_LEVELS = ["trivial", "simple", "moderate", "complex"] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export interface SemanticRouteOptions {
  mission: MissionDocument;
  available: AdapterId[];
  caps?: Record<AdapterId, AdapterCapabilities>;
  /**
   * `--force`: waive `runtime_requirements` in deterministic eligibility.
   * `decision_policy.allowed_runtimes` and the fleet prefilter are policy
   * allowlists and are never waived.
   */
  force?: boolean;
  /** `--auto` requested semantic evaluation even when `decision_policy.enabled` is false. */
  auto?: boolean;
  /** Adapters the project fleet authorizes for this route, when known. */
  fleetAdapters?: readonly string[];
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  delay?: (ms: number) => Promise<void>;
  /** When set, a `uh.decision-receipt.v0` receipt is persisted under this mission directory. */
  missionDir?: string;
  missionId?: string;
  runId?: string;
}

export interface SemanticRouteDecision {
  /** Chosen adapter, or null when nothing is eligible / a required provider blocked launch. */
  adapter: AdapterId | null;
  /** Chosen model, or null to defer to the adapter's configured model. */
  model: string | null;
  reason: string;
  status: DecisionStatus;
  provider_status: DecisionProviderStatus;
  authorizer: DecisionAuthorizer;
  applied: boolean;
  confidence?: number;
  complexity?: ComplexityLevel;
  /** The Level 0 deterministic decision, before any semantic recommendation. */
  deterministic: AutoRouteDecision;
  /** Candidates after `allowed_runtimes` and fleet filtering, best-first. */
  candidates: AutoRouteCandidate[];
  eligible: AdapterId[];
  recommendation?: { runtime: AdapterId; model?: string };
  receipt?: DecisionReceipt;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Combine Level 0 deterministic eligibility (runtime_requirements, capabilities,
 * `decision_policy.allowed_runtimes`, and the project-fleet prefilter) with a
 * bounded Level 1 TypeSafe System One (JEV) recommendation.
 *
 * JEV may only select among the strictly eligible adapters and the configured
 * model candidates. Its answer is applied (`authorizer: "jev"`) only when the
 * chosen adapter is eligible, the model is within `allowed_models` (when set),
 * and confidence reaches `min_confidence` (default 0.70). Otherwise the
 * deterministic incumbent and `fallback_model` are used. A missing credential,
 * transport failure, malformed answer, or low confidence never throws: an
 * outcome is returned and, when a `missionDir` is supplied, a
 * `uh.decision-receipt.v0` is recorded best-effort.
 */
export async function chooseSemanticRoute(options: SemanticRouteOptions): Promise<SemanticRouteDecision> {
  const mission = options.mission;
  const caps = options.caps ?? CAPABILITIES;
  const policy = mission.decision_policy;
  const deterministic = chooseAdapter(mission, options.available, caps, {
    ignoreRequirements: options.force === true,
  });

  const allowedRuntimes = policy?.allowed_runtimes ?? [];
  const fleet = options.fleetAdapters ? new Set<string>(options.fleetAdapters) : undefined;

  const candidates: AutoRouteCandidate[] = deterministic.candidates.map((candidate) => {
    const exclusionReasons = [...candidate.exclusionReasons];
    let eligible = candidate.eligible;
    if (allowedRuntimes.length > 0 && !allowedRuntimes.includes(candidate.adapter)) {
      exclusionReasons.push("not in decision_policy.allowed_runtimes");
      eligible = false;
    }
    if (fleet && !fleet.has(candidate.adapter)) {
      exclusionReasons.push("not authorized by the project fleet");
      eligible = false;
    }
    return { ...candidate, eligible, exclusionReasons };
  });
  const eligible = candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.adapter);
  const incumbent = eligible[0] ?? null;

  if (incumbent === null) {
    const reason = candidates.length === 0
      ? deterministic.reason
      : `no adapter satisfies the mission decision policy: ${candidates.map((c) => `${c.adapter} (${c.exclusionReasons.join("; ")})`).join(", ")}`;
    return {
      adapter: null, model: null, reason, status: "denied", provider_status: "not-requested",
      authorizer: "none", applied: false, deterministic, candidates, eligible,
    };
  }

  if (options.auto !== true && policy?.enabled !== true) {
    return {
      adapter: incumbent, model: null, status: "applied", provider_status: "not-requested",
      authorizer: "deterministic", applied: true, deterministic, candidates, eligible,
      reason: `deterministic route: ${incumbent} (${candidates.find((c) => c.adapter === incumbent)?.cost_class ?? "unknown"})`,
    };
  }

  const minConfidence = policy?.min_confidence ?? 0.7;
  const fallbackModel = policy?.fallback_model ?? null;
  const requireProvider = policy?.require_provider_for_route === true;
  const allowedModels = policy?.allowed_models ?? [];
  const modelCandidates = [...new Set(
    [...allowedModels, policy?.escalation_model, policy?.fallback_model]
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  )];

  const questions: Record<string, Question> = {
    complexity: {
      type: "score",
      instructions: "Rate the overall complexity of this mission's implementation work.",
      criteria: [...COMPLEXITY_LEVELS],
    },
  };

  if (eligible.length >= 2) {
    const adapterDescriptions: Record<string, string> = {};
    for (const id of eligible) {
      const candidate = candidates.find((c) => c.adapter === id)!;
      adapterDescriptions[id] = `cost_class=${candidate.cost_class}, max_context_tokens=${candidate.max_context_tokens ?? "unknown"}`;
    }
    questions.recommended_adapter = {
      type: "choice",
      instructions: "Select the best eligible runtime adapter for this mission. Answer with exactly one of the supplied options.",
      criteria: adapterDescriptions,
    };
  }

  if (modelCandidates.length >= 2) {
    questions.recommended_model = {
      type: "choice",
      instructions: "Select the best model for this route. Answer with exactly one of the supplied options.",
      criteria: Object.fromEntries(modelCandidates.map((model) => [model, `Candidate model: ${model}`])),
    };
  }

  const state = {
    task: {
      id: mission.id,
      title: mission.name,
      objective: mission.description || mission.title,
      workflow: mission.workflow_profile,
    },
    capabilities: mission.capabilities ?? [],
    runtime_requirements: resolveRuntimeRequirements(mission),
    allowed_runtimes: allowedRuntimes,
    allowed_models: allowedModels,
    candidates: eligible.map((id) => {
      const candidate = candidates.find((c) => c.adapter === id)!;
      return { adapter: id, cost_class: candidate.cost_class, max_context_tokens: candidate.max_context_tokens };
    }),
  };
  const input_sha256 = digest({ state, questions });

  const response = await evaluateSystemOne({
    state,
    questions,
    model: options.model,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
    delay: options.delay,
  });

  let status: DecisionStatus;
  let providerStatus: DecisionProviderStatus;
  let authorizer: DecisionAuthorizer;
  let applied = false;
  let adapter: AdapterId | null = incumbent;
  let model: string | null = null;
  let confidence: number | undefined;
  let complexity: ComplexityLevel | undefined;
  let recommendation: { runtime: AdapterId; model?: string } | undefined;
  let provider: DecisionProvider | undefined;
  let reason: string;
  let deterministicFallback = false;

  if (response.kind === "ok") {
    const adapterAnswer = response.answers.recommended_adapter;
    const recommendedAdapter = (adapterAnswer?.choice ?? (eligible.length === 1 ? eligible[0] : incumbent)) as AdapterId;
    const adapterConfidence = adapterAnswer ? (adapterAnswer.probabilities?.[recommendedAdapter] ?? 0) : 1;

    const modelAnswer = response.answers.recommended_model;
    const recommendedModel = modelAnswer?.choice ?? (modelCandidates.length === 1 ? modelCandidates[0] : undefined);
    const modelConfidence = modelAnswer ? (modelAnswer.probabilities?.[recommendedModel ?? ""] ?? 0) : 1;

    confidence = Math.min(adapterConfidence, modelConfidence);

    const score = response.answers.complexity?.score;
    complexity = typeof score === "number" ? COMPLEXITY_LEVELS[Math.min(Math.round(score), COMPLEXITY_LEVELS.length - 1)] : undefined;
    provider = {
      name: "typesafe",
      model: response.model,
      latency_ms: response.latency_ms,
      ...(response.usage ? { usage: response.usage } : {}),
    };
    providerStatus = confidence > 0 ? "available" : "uncertain";
    recommendation = { runtime: recommendedAdapter, ...(recommendedModel ? { model: recommendedModel } : {}) };
    const modelAllowed = recommendedModel === undefined
      || allowedModels.length === 0
      || allowedModels.includes(recommendedModel);

    if (!eligible.includes(recommendedAdapter)) {
      status = "denied"; authorizer = "none"; deterministicFallback = true; model = fallbackModel;
      reason = `Provider recommended adapter ${recommendedAdapter}, which is not deterministically eligible; no route applied.`;
    } else if (!modelAllowed) {
      status = "denied"; authorizer = "deterministic"; deterministicFallback = true; model = fallbackModel;
      reason = `Provider recommended model ${recommendedModel}, which is outside decision_policy.allowed_models; using the deterministic route and fallback model.`;
    } else if (confidence < minConfidence) {
      status = "uncertain"; authorizer = "deterministic"; deterministicFallback = true; model = fallbackModel;
      reason = `Provider confidence ${confidence.toFixed(2)} is below min_confidence ${minConfidence}; using the deterministic route and fallback model.`;
    } else {
      status = "applied"; authorizer = "jev"; applied = true;
      adapter = recommendedAdapter;
      model = recommendedModel ?? null;
      reason = `Provider selected ${recommendedAdapter}${recommendedModel ? ` on ${recommendedModel}` : ""} with confidence ${confidence.toFixed(2)} within deterministic eligibility.`;
    }
  } else if (response.kind === "disabled") {
    status = "unavailable"; providerStatus = "disabled"; authorizer = "deterministic";
    deterministicFallback = true; model = fallbackModel;
    reason = "Semantic routing disabled: no provider credential is configured; using the deterministic route and fallback model.";
  } else if (response.kind === "malformed") {
    status = "malformed"; providerStatus = "malformed"; authorizer = "deterministic";
    deterministicFallback = true; model = fallbackModel;
    reason = "Provider response failed the typed routing contract; using the deterministic route and fallback model.";
  } else {
    status = "unavailable"; providerStatus = "unavailable"; authorizer = "deterministic";
    deterministicFallback = true; model = fallbackModel;
    reason = `Provider request unavailable (${response.reason}${response.status === undefined ? "" : ` ${response.status}`}); using the deterministic route and fallback model.`;
  }

  if (requireProvider && !applied) {
    adapter = null;
    model = null;
    authorizer = "none";
    reason = `${reason} require_provider_for_route is set, so launch is blocked until the provider yields an applicable recommendation.`;
  }

  const decision: SemanticRouteDecision = {
    adapter,
    model,
    reason,
    status,
    provider_status: providerStatus,
    authorizer,
    applied,
    deterministic,
    candidates,
    eligible,
    ...(confidence === undefined ? {} : { confidence }),
    ...(complexity === undefined ? {} : { complexity }),
    ...(recommendation ? { recommendation } : {}),
  };

  if (!options.missionDir) return decision;
  try {
    const receipt = await recordRouteDecision(options.missionDir, {
      missionId: options.missionId ?? mission.id,
      runId: options.runId,
      status,
      provider_status: providerStatus,
      authorizer,
      applied,
      deterministic_fallback: deterministicFallback,
      human_required: false,
      confidence,
      recommendation: recommendation
        ? { kind: "runtime-selection", runtime: recommendation.runtime, ...(recommendation.model ? { model: recommendation.model } : {}) }
        : undefined,
      provider,
      input_sha256,
      response_sha256: response.kind === "ok" ? digest(response.answers) : undefined,
      reason,
      state_transition: {
        from: incumbent ?? "unrouted",
        to: adapter ?? "blocked",
        unlocked: [],
      },
    });
    return { ...decision, receipt };
  } catch {
    // Receipt persistence is best-effort: a routing decision must never fail
    // because a receipt could not be written.
    return decision;
  }
}

/** One-line summary of a semantic route for CLI output. */
export function formatSemanticRouteSummary(decision: SemanticRouteDecision): string {
  const confidence = decision.confidence === undefined ? "" : ` confidence=${decision.confidence.toFixed(2)}`;
  const complexity = decision.complexity === undefined ? "" : ` complexity=${decision.complexity}`;
  const lines = [
    `Semantic route: adapter=${decision.adapter ?? "none"} model=${decision.model ?? "runtime default"} status=${decision.status} authorizer=${decision.authorizer}${confidence}${complexity}`,
    `  reason: ${decision.reason}`,
  ];
  if (decision.receipt) {
    lines.push(`  receipt: ${decision.receipt.decision_id} (status=${decision.receipt.status}, provider=${decision.receipt.provider_status})`);
  }
  return lines.join("\n");
}
