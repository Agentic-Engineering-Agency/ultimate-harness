import { readFileSync } from "node:fs";
import path from "node:path";
import type { MissionDocument } from "../schema/mission.js";
import type { WorkflowDocument } from "../schema/workflow.js";
import { harnessDir } from "./paths.js";
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
  completion_marker?: string;
}

export interface DispatchContextAcceptanceCriterion {
  id: string;
  description: string;
  check_command?: string;
  severity: "block" | "warn";
}

export interface DispatchContext {
  mission: MissionDocument;
  workflow?: WorkflowDocument;
  issues: DispatchContextIssue[];
  readFirst: string[];
  constraints: string[];
  expectedArtifacts: DispatchContextArtifact[];
  verificationChecks: string[];
  acceptanceCriteria: DispatchContextAcceptanceCriterion[];
  /**
   * Optional verbatim project brief (`.harness/project-brief.md`) rendered as a
   * `[Project facts]`-style section. Capped at {@link PROJECT_FACTS_CHAR_LIMIT}
   * characters with a truncation note so the prompt stays bounded.
   */
  projectFacts?: string;
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
  /**
   * Root directory the project brief is read from when `projectBrief` is not
   * given. Defaults to the mission's `context.repo_root`, then `process.cwd()`.
   */
  root?: string;
  /**
   * Explicit project-brief text. When set, no file is read, so callers that
   * already have the brief (or tests) can inject it deterministically.
   */
  projectBrief?: string;
  /**
   * Template `worker_rules` appended to the mission's constraints, after the
   * mission's own, so a single-run template reaches the dispatch prompt.
   */
  workerRules?: string[];
}

/** Hard cap on the rendered project brief so one brief cannot bloat a prompt. */
export const PROJECT_FACTS_CHAR_LIMIT = 4000;

const PROJECT_FACTS_TRUNCATION_NOTE =
  `\n\n[project brief truncated to ${PROJECT_FACTS_CHAR_LIMIT} characters]`;

/**
 * Trim a project brief and, when it exceeds {@link PROJECT_FACTS_CHAR_LIMIT},
 * cut it to fit with an explicit truncation note. The returned string is never
 * longer than the limit.
 */
export function capProjectFacts(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PROJECT_FACTS_CHAR_LIMIT) return trimmed;
  const keep = Math.max(0, PROJECT_FACTS_CHAR_LIMIT - PROJECT_FACTS_TRUNCATION_NOTE.length);
  return `${trimmed.slice(0, keep)}${PROJECT_FACTS_TRUNCATION_NOTE}`;
}

/**
 * Read `.harness/project-brief.md` from `root`, capped. Returns undefined when
 * the file is missing, unreadable, or empty so no empty section is rendered.
 */
export function loadProjectFacts(root: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(path.join(harnessDir(root), "project-brief.md"), "utf-8");
  } catch {
    return undefined;
  }
  const capped = capProjectFacts(text);
  return capped.length > 0 ? capped : undefined;
}

export function buildDispatchContext(
  mission: MissionDocument,
  workflow?: WorkflowDocument,
  options: BuildDispatchContextOptions = {},
): DispatchContext {
  const projectFacts = options.projectBrief !== undefined
    ? capProjectFacts(options.projectBrief)
    : loadProjectFacts(options.root ?? mission.context?.repo_root ?? process.cwd());
  return {
    mission,
    workflow,
    issues: mission.issues.map((i) => ({
      source: i.source,
      reference: i.reference,
      url: i.url,
    })),
    readFirst: [...mission.read_first],
    constraints: [...mission.constraints, ...(options.workerRules ?? [])],
    expectedArtifacts: mission.expected_artifacts.map((a) => ({ path: a.path, type: a.type,
      ...(a.completion_marker !== undefined ? { completion_marker: a.completion_marker } : {}) })),
    verificationChecks: [...(mission.verification.checks ?? [])],
    acceptanceCriteria: mission.acceptance_criteria.map((ac) => ({
      id: ac.id,
      description: ac.description,
      ...(ac.check_command !== undefined ? { check_command: ac.check_command } : {}),
      severity: ac.severity,
    })),
    ...(projectFacts !== undefined && projectFacts.length > 0 ? { projectFacts } : {}),
    memoryBlock: options.memoryBlock,
    finalMessageInstruction: options.finalMessageInstruction ?? runtimeFinalMessageInstruction(),
  };
}
