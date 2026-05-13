import { z } from "zod";

const BmadMetadataSchema = z.object({
  inspiration: z.string().min(1),
  dependency: z.literal(false),
  roles: z.array(z.string().min(1)),
  guardrails: z.array(z.string().min(1)).optional(),
});

const WorkflowPhaseSchema = z.object({
  name: z.string().min(1),
  agent_role: z.string(),
  description: z.string(),
  bmad_role: z.string().min(1).optional(),
  outputs: z.array(z.string().min(1)).optional(),
});

export const WorkflowSchema = z.object({
  schema_version: z.literal("uh.workflow.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  bmad: BmadMetadataSchema.optional(),
  phases: z.array(WorkflowPhaseSchema),
});

export type WorkflowDocument = z.infer<typeof WorkflowSchema>;

export function validateWorkflow(data: unknown): WorkflowDocument {
  return WorkflowSchema.parse(data);
}
