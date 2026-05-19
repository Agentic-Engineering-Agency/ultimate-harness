import type { DispatchContext } from "./dispatch-context.js";

const MEMORY_SEPARATOR = "\n\n";

/**
 * Render the canonical mission prompt from a {@link DispatchContext}.
 *
 * The output is byte-for-byte equivalent to the four pre-UH-80 in-adapter
 * `buildMissionPrompt` implementations: same section order, same blank-line
 * separators, same trailing final-message instruction. The memory block, if
 * present, is appended in the slot Honcho memory used to occupy before the
 * refactor.
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
    prompt += "\n";
  }

  if (ctx.expectedArtifacts.length > 0) {
    prompt += "## Expected Artifacts\n";
    for (const a of ctx.expectedArtifacts) {
      prompt += `- ${a.path}`;
      if (a.type) prompt += ` (${a.type})`;
      prompt += "\n";
    }
    prompt += "\n";
  }

  if (ctx.verificationChecks.length > 0) {
    prompt += "## Verification Checks\n";
    for (const c of ctx.verificationChecks) {
      prompt += `- ${c}\n`;
    }
    prompt += "\n";
  }

  prompt += "Execute this mission and produce the expected artifacts.\n";
  prompt += ctx.finalMessageInstruction;

  if (ctx.memoryBlock && ctx.memoryBlock.length > 0) {
    prompt += `${MEMORY_SEPARATOR}${ctx.memoryBlock}`;
  }

  return prompt;
}
