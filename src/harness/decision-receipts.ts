import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DecisionReceiptSchema, type DecisionReceipt } from "../schema/decisions.js";
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
