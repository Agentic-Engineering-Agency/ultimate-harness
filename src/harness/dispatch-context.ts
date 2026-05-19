import type { MissionDocument } from "../schema/mission.js";
import type { WorkflowDocument } from "../schema/workflow.js";
import { runtimeFinalMessageInstruction } from "./runtime-final-message.js";

/**
 * UH-80 — pre-inlined dispatch context.
 *
 * The four adapters used to each carry their own `buildMissionPrompt`
 * function whose bodies were identical aside from minor whitespace drift.
 * That meant a change to the shared mission prompt shape required four
 * surgical edits that had to stay in lockstep, and tests caught any drift
 * only after the fact.
 *
 * This module replaces the four duplicates with a single typed contract:
 *
 *   buildDispatchContext(mission, workflow?) → DispatchContext
 *   renderPrompt(ctx) → string
 *
 * Adapters compose the context, run any adapter- or extension-specific
 * transforms (e.g. Honcho memory enrichment), then call `renderPrompt`.
 */

export interface DispatchContextIssue {
  source: string;
  reference: string;
  url?: string;
}

export interface DispatchContextArtifact {
  path: string;
  type?: string;
}

export interface DispatchContextAcceptanceCriterion {
  id: string;
  description: string;
  severity: "block" | "warn";
}

export interface DispatchContext {
  mission: MissionDocument;
  workflow?: WorkflowDocument;
  issues: DispatchContextIssue[];
  readFirst: string[];
  expectedArtifacts: DispatchContextArtifact[];
  verificationChecks: string[];
  acceptanceCriteria: DispatchContextAcceptanceCriterion[];
  /**
   * Optional `[Persistent memory]` block prepended to the rendered prompt
   * before the final-message instruction. Adapters wire this in via
   * extensions (e.g. Honcho memory in oh-my-pi).
   */
  memoryBlock?: string;
  /**
   * The runtime-final-message instruction string. Stored on the context
   * (rather than recomputed inside `renderPrompt`) so adapters can audit
   * or override the exact instruction they will dispatch.
   */
  finalMessageInstruction: string;
}

export interface BuildDispatchContextOptions {
  /** Override the final-message instruction (tests only). */
  finalMessageInstruction?: string;
  /** Pre-seed the persistent-memory block. */
  memoryBlock?: string;
}

export function buildDispatchContext(
  mission: MissionDocument,
  workflow?: WorkflowDocument,
  options: BuildDispatchContextOptions = {},
): DispatchContext {
  return {
    mission,
    workflow,
    issues: mission.issues.map((i) => ({
      source: i.source,
      reference: i.reference,
      url: i.url,
    })),
    readFirst: [...mission.read_first],
    expectedArtifacts: mission.expected_artifacts.map((a) => ({ path: a.path, type: a.type })),
    verificationChecks: [...(mission.verification.checks ?? [])],
    acceptanceCriteria: mission.acceptance_criteria.map((ac) => ({
      id: ac.id,
      description: ac.description,
      severity: ac.severity,
    })),
    memoryBlock: options.memoryBlock,
    finalMessageInstruction: options.finalMessageInstruction ?? runtimeFinalMessageInstruction(),
  };
}
