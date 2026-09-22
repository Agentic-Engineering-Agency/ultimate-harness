import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DecisionReceiptSchema, type DecisionAuthorizer, type DecisionProvider, type DecisionProviderStatus, type DecisionReceipt, type DecisionRecommendation, type DecisionStatus } from "../schema/decisions.js";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { evaluateThreeVerdict, type SystemOneState, type ThreeVerdictOutcome, type ThreeVerdictResult } from "./typesafe.js";

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type OutcomeMapping = {
  result?: ThreeVerdictResult;
  provider_status: DecisionReceipt["provider_status"];
  uncertain: boolean;
  reason: string;
};

function mapOutcome(outcome: ThreeVerdictOutcome): OutcomeMapping {
  switch (outcome.kind) {
    case "ok": {
      const uncertain = outcome.confidence === 0;
      return {
        result: outcome,
        provider_status: uncertain ? "uncertain" : "available",
        uncertain,
        reason: uncertain
          ? "Provider answered every asked question without a discriminating signal; no recommendation applied."
          : "Advisory judgment consumed; deterministic failures and human authority remain unchanged.",
      };
    }
    case "disabled":
      return { provider_status: "disabled", uncertain: false,
        reason: "Judgment disabled because no provider credential is configured." };
    case "malformed":
      return { provider_status: "malformed", uncertain: false,
        reason: "Provider response failed the typed judgment contract; no recommendation applied." };
    case "unavailable":
      return { provider_status: "unavailable", uncertain: false,
        reason: `Provider request unavailable (${outcome.reason}${outcome.status === undefined ? "" : ` ${outcome.status}`}); no recommendation applied.` };
  }
}

/**
 * Persist the provider outcome and the consumer's actual transition, never its raw inputs.
 *
 * Provider result kinds map onto the existing receipt statuses: `disabled` and
 * `unavailable` are recorded as `unavailable`, `malformed` as `malformed`, and an
 * answer set with no discriminating signal (every asked Noul at the midpoint,
 * confidence 0) as `uncertain`. Nothing is applied for any of those, so a
 * deterministic failure and human authority always remain unchanged.
 */
export async function recordAcceptanceDecision(options: {
  missionDir: string;
  missionId: string;
  runId?: string;
  consumer: "verification" | "independent-review";
  state: SystemOneState;
  prompt: string;
  from: string;
  apply: (gate: ThreeVerdictResult) => string;
}): Promise<DecisionReceipt> {
  const started = Date.now();
  const outcome: ThreeVerdictOutcome = await evaluateThreeVerdict(options.state, options.prompt);
  const mapped = mapOutcome(outcome);
  const result = mapped.result;
  const to = result && !mapped.uncertain ? options.apply(result) : options.from;
  const applied = to !== options.from;
  const receipt = DecisionReceiptSchema.parse({
    schema_version: "uh.decision-receipt.v0",
    decision_id: `${options.consumer}-${randomUUID()}`,
    mission_id: options.missionId,
    run_id: options.runId,
    kind: "acceptance",
    status: result ? (mapped.uncertain ? "uncertain" : applied ? "applied" : "advisory")
      : outcome.kind === "malformed" ? "malformed" : "unavailable",
    provider_status: mapped.provider_status,
    authorizer: applied ? "jev" : "none",
    applied,
    deterministic_fallback: !result,
    human_required: true,
    confidence: result?.confidence,
    recommendation: result ? { kind: "acceptance", outcome: result.verdict } : undefined,
    provider: {
      name: "typesafe",
      model: result?.model,
      latency_ms: result?.latency_ms ?? Date.now() - started,
      ...(result?.usage ? { usage: result.usage } : {}),
    },
    input_sha256: digest({ state: options.state, prompt: options.prompt }),
    response_sha256: result ? digest(result.raw) : undefined,
    reason: mapped.reason,
    state_transition: { from: options.from, to, unlocked: [] },
    created_at: new Date().toISOString(),
  });
  const directory = path.join(options.missionDir, "decision-receipts");
  await assertWritableArtifact(options.missionDir, directory);
  await mkdir(directory, { recursive: true });
  const receiptPath = path.join(directory, `${receipt.decision_id}.json`);
  await assertWritableArtifact(options.missionDir, receiptPath);
  await writeAtomicArtifact(receiptPath, JSON.stringify(receipt, null, 2));
  const eventsPath = path.join(options.missionDir, "events.ndjson");
  await assertWritableArtifact(options.missionDir, eventsPath);
  await appendFile(eventsPath, JSON.stringify({ type: "decision.recorded", mission_id: options.missionId,
    run_id: options.runId, decision_id: receipt.decision_id, consumer: options.consumer,
    status: receipt.status, provider_status: receipt.provider_status, applied,
    state_transition: receipt.state_transition, timestamp: receipt.created_at }) + "\n");
  return receipt;
}

/** The already-composed runtime-selection receipt fields, minus the server-owned identity and timestamp. */
export interface RouteDecisionRecord {
  missionId: string;
  runId?: string;
  status: DecisionStatus;
  provider_status: DecisionProviderStatus;
  authorizer: DecisionAuthorizer;
  applied: boolean;
  deterministic_fallback?: boolean;
  human_required: boolean;
  confidence?: number;
  recommendation?: DecisionRecommendation;
  provider?: DecisionProvider;
  input_sha256: string;
  response_sha256?: string;
  reason: string;
  state_transition: DecisionReceipt["state_transition"];
}

/**
 * Persist a `uh.decision-receipt.v0` runtime-selection receipt and its
 * `decision.recorded` event. Only the composed decision is written — never the
 * provider prompt, raw answers, or the mission packet.
 */
export async function recordRouteDecision(missionDir: string, record: RouteDecisionRecord): Promise<DecisionReceipt> {
  const receipt = DecisionReceiptSchema.parse({
    schema_version: "uh.decision-receipt.v0",
    decision_id: `runtime-selection-${randomUUID()}`,
    mission_id: record.missionId,
    run_id: record.runId,
    kind: "runtime-selection",
    status: record.status,
    provider_status: record.provider_status,
    authorizer: record.authorizer,
    applied: record.applied,
    deterministic_fallback: record.deterministic_fallback,
    human_required: record.human_required,
    confidence: record.confidence,
    recommendation: record.recommendation,
    provider: record.provider,
    input_sha256: record.input_sha256,
    response_sha256: record.response_sha256,
    reason: record.reason,
    state_transition: record.state_transition,
    created_at: new Date().toISOString(),
  });
  const directory = path.join(missionDir, "decision-receipts");
  await assertWritableArtifact(missionDir, directory);
  await mkdir(directory, { recursive: true });
  const receiptPath = path.join(directory, `${receipt.decision_id}.json`);
  await assertWritableArtifact(missionDir, receiptPath);
  await writeAtomicArtifact(receiptPath, JSON.stringify(receipt, null, 2));
  const eventsPath = path.join(missionDir, "events.ndjson");
  await assertWritableArtifact(missionDir, eventsPath);
  await appendFile(eventsPath, JSON.stringify({ type: "decision.recorded", kind: "runtime-selection",
    mission_id: record.missionId, run_id: record.runId, decision_id: receipt.decision_id,
    status: receipt.status, provider_status: receipt.provider_status, applied: record.applied,
    state_transition: receipt.state_transition, timestamp: receipt.created_at }) + "\n");
  return receipt;
}
