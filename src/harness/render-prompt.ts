import type { DispatchContext } from "./dispatch-context.js";

const MEMORY_SEPARATOR = "\n\n";

/**
 * Render the canonical mission prompt from a {@link DispatchContext}.
 *
 * The output preserves the pre-UH-80 section order and blank-line
 * separators, while adding optional constraints and acceptance-criteria
 * blocks from the structured mission packet. The memory block, if present,
 * is appended in the slot Honcho memory used to occupy before the refactor.
 */
export function renderPrompt(ctx: DispatchContext): string {
  let prompt = `# Mission: ${ctx.mission.name}\n\n`;
  prompt += `${ctx.mission.description}\n\n`;

  if (ctx.workflow) {
    prompt += `## Workflow: ${ctx.workflow.name}\n\n`;
    for (const phase of ctx.workflow.phases) {
      prompt += `### ${phase.name} (${phase.agent_role})\n${phase.description}\n\n`;
    }
  }

  if (ctx.issues.length > 0) {
    prompt += "## Related Issues\n";
    for (const issue of ctx.issues) {
      prompt += `- [${issue.source}] ${issue.reference}`;
      if (issue.url) prompt += ` (${issue.url})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (ctx.readFirst.length > 0) {
    prompt += "## Read First\n";
    for (const p of ctx.readFirst) {
      prompt += `- ${p}\n`;
    }
  } else {
    prompt += "## Read First\n- none, add nothing\n";
  }
  prompt += "\n";

  if (ctx.expectedArtifacts.length > 0) {
    prompt += "## Expected Artifacts\n";
    for (const a of ctx.expectedArtifacts) {
      prompt += `- ${a.path}`;
      if (a.type) prompt += ` (${a.type})`;
      if (a.completion_marker !== undefined) prompt += `; final nonblank line must be ${JSON.stringify(a.completion_marker)}`;
      prompt += "\n";
    }
  } else {
    prompt += "## Expected Artifacts\n- none, add nothing\n";
  }
  prompt += "\n";

  if (ctx.verificationChecks.length > 0) {
    prompt += "## Verification Checks\n";
    for (const c of ctx.verificationChecks) {
      prompt += `- ${c}\n`;
    }
  } else {
    prompt += "## Verification Checks\n- none, add nothing\n";
  }
  prompt += "\n";

  if (ctx.constraints.length > 0) {
    prompt += "## Constraints\n";
    for (const constraint of ctx.constraints) {
      prompt += `- ${constraint}\n`;
    }
  } else {
    prompt += "## Constraints\n- none, add nothing\n";
  }
  prompt += "\n";

  if (ctx.acceptanceCriteria.length > 0) {
    prompt += "## Acceptance Criteria\n";
    for (const criterion of ctx.acceptanceCriteria) {
      prompt += `- ${criterion.id} [${criterion.severity}] ${criterion.description}\n`;
      if (criterion.check_command !== undefined) {
        prompt += `  - check_command: ${criterion.check_command}\n`;
      }
    }
  } else {
    prompt += "## Acceptance Criteria\n- none, add nothing\n";
  }
  prompt += "\n";
  prompt += "Execute this mission and produce the expected artifacts.\n";
  prompt += ctx.finalMessageInstruction;

  if (ctx.memoryBlock && ctx.memoryBlock.length > 0) {
    prompt += `${MEMORY_SEPARATOR}${ctx.memoryBlock}`;
  }

  return prompt;
}
