import { z } from "zod";

export const WorkflowSchema = z.object({
  schema_version: z.literal("uh.workflow.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  phases: z.array(
    z.object({
      name: z.string().min(1),
      agent_role: z.string(),
      description: z.string(),
    })
  ),
});

export type WorkflowDocument = z.infer<typeof WorkflowSchema>;

export function validateWorkflow(data: unknown): WorkflowDocument {
  return WorkflowSchema.parse(data);
}
