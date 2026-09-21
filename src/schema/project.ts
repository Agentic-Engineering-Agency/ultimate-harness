import { z } from "zod";

export const FleetRoleSchema = z.enum(["worker", "orchestrator"]);
export type FleetRole = z.infer<typeof FleetRoleSchema>;

/** Models the project authorizes spend on, per adapter and role. */
export const FleetPolicySchema = z.object({
  routes: z.array(z.object({
    adapter: z.string().min(1),
    model: z.string().min(1),
    roles: z.array(FleetRoleSchema).min(1).default(["worker"]),
  }).strict()).min(1),
}).strict();
export type FleetPolicy = z.infer<typeof FleetPolicySchema>;

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
  fleet: FleetPolicySchema.optional(),
});

export type ProjectDocument = z.infer<typeof ProjectSchema>;

export function validateProject(data: unknown): ProjectDocument {
  return ProjectSchema.parse(data);
}
