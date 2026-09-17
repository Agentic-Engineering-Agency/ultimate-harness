import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { DecisionReceiptSchema, type DecisionReceipt } from "../schema/decisions.js";
import { assertWritableArtifact } from "../adapters/_artifact-context.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { evaluateThreeVerdict, type ThreeVerdictResult, type TypeSafeDisabledResult } from "./typesafe.js";

const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Persist the provider outcome and the consumer's actual transition, never its raw inputs. */
export async function recordAcceptanceDecision(options: {
  missionDir: string;
  missionId: string;
  runId?: string;
  consumer: "verification" | "independent-review";
  state: { contract: unknown; diff?: string; outputs?: unknown };
  prompt: string;
  from: string;
  apply: (gate: ThreeVerdictResult) => string;
}): Promise<DecisionReceipt> {
  const started = Date.now();
  let gate: ThreeVerdictResult | TypeSafeDisabledResult | undefined;
  let providerStatus: DecisionReceipt["provider_status"] = "unavailable";
  try {
    gate = await evaluateThreeVerdict(options.state, options.prompt);
    providerStatus = "enabled" in gate ? "disabled" : "available";
  } catch (error) {
    providerStatus = error instanceof ZodError ? "malformed" : "unavailable";
  }
  const result = gate && !("enabled" in gate) ? gate : undefined;
  const to = result ? options.apply(result) : options.from;
  const applied = to !== options.from;
  const raw = result?.raw && typeof result.raw === "object" ? result.raw as Record<string, unknown> : undefined;
  const receipt = DecisionReceiptSchema.parse({
    schema_version: "uh.decision-receipt.v0",
    decision_id: `${options.consumer}-${randomUUID()}`,
    mission_id: options.missionId,
    run_id: options.runId,
    kind: "acceptance",
    status: result ? applied ? "applied" : "advisory" : providerStatus === "malformed" ? "malformed" : "unavailable",
    provider_status: providerStatus,
    authorizer: applied ? "jev" : "none",
    applied,
    deterministic_fallback: !result,
    human_required: true,
    confidence: result?.confidence,
    recommendation: result ? { kind: "acceptance", outcome: result.verdict } : undefined,
    provider: { name: "typesafe", model: typeof raw?.model === "string" ? raw.model : undefined, latency_ms: Date.now() - started },
    input_sha256: digest({ state: options.state, prompt: options.prompt }),
    response_sha256: result ? digest(result.raw) : undefined,
    reason: result ? "Advisory judgment consumed; deterministic failures and human authority remain unchanged."
      : providerStatus === "disabled" ? "Judgment disabled because no provider credential is configured."
      : providerStatus === "malformed" ? "Provider response failed the typed judgment contract; no recommendation applied."
      : "Provider request unavailable; no recommendation applied.",
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
