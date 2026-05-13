import { z } from "zod";

export const ProjectSchema = z.object({
  schema_version: z.literal("uh.project.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  root_path: z.string(),
  created_at: z.string(),
  issue_sources: z
    .array(
      z.object({
        provider: z.string(),
        url: z.string().url().optional(),
      }),
    )
    .optional()
    .default([]),
  default_workflow_profiles: z.array(z.string()).optional().default([]),
  artifact_schema_version: z.string().optional(),
});

export type ProjectDocument = z.infer<typeof ProjectSchema>;

export function validateProject(data: unknown): ProjectDocument {
  return ProjectSchema.parse(data);
}
