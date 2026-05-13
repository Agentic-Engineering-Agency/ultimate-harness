import { z } from "zod";

export const MissionSchema = z.object({
  schema_version: z.literal("uh.mission.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  workflow_profile: z.string().min(1),
  description: z.string().optional().default(""),
  issues: z.array(
    z.object({
      source: z.string(),
      reference: z.string(),
      url: z.string().optional(),
    })
  ).optional().default([]),
  read_first: z.array(z.string()).optional().default([]),
  expected_artifacts: z.array(z.object({
    path: z.string(),
    type: z.string().optional(),
  })).optional().default([]),
  sandbox: z.object({
    backend: z.string().optional().default("directory"),
    config: z.record(z.string(), z.unknown()).optional().default({}),
  }).optional().default({ backend: "directory", config: {} }),
  verification: z.object({
    checks: z.array(z.string()).optional().default([]),
  }).optional().default({ checks: [] }),
});

export type MissionDocument = z.infer<typeof MissionSchema>;

export function validateMission(data: unknown): MissionDocument {
  return MissionSchema.parse(data);
}
