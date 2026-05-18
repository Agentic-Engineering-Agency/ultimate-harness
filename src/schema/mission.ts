import { z } from "zod";

const IssueSchema = z.object({
  source: z.string(),
  reference: z.string(),
  url: z.string().optional(),
});

const IssueRefSchema = z.object({
  provider: z.string(),
  id: z.string(),
  url: z.string().optional(),
});

const ExpectedArtifactSchema = z.object({
  path: z.string(),
  type: z.string().optional(),
});

const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message: "AC id must start with [A-Za-z0-9] and use only [A-Za-z0-9._-]",
  }),
  description: z.string().min(1),
  check_command: z.string().optional(),
  severity: z.enum(["block", "warn"]).optional().default("block"),
});

const RequiredCheckSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(),
});

const MissionInputSchema = z.object({
  schema_version: z.literal("uh.mission.v0"),
  id: z.string().min(1),

  // Documented mission packet fields.
  title: z.string().min(1).optional(),
  issue_refs: z.array(IssueRefSchema).optional().default([]),
  workflow_profile: z.string().min(1),
  priority: z.string().optional(),
  objective: z.string().optional().default(""),
  context: z.object({
    repo_root: z.string().optional(),
    read_first: z.array(z.string()).optional().default([]),
    source_links: z.array(z.string()).optional().default([]),
  }).optional().default({ read_first: [], source_links: [] }),
  constraints: z.array(z.string()).optional().default([]),
  skills: z.object({
    required: z.array(z.string()).optional().default([]),
    suggested: z.array(z.string()).optional().default([]),
  }).optional().default({ required: [], suggested: [] }),
  expected_outputs: z.object({
    files: z.array(z.string()).optional().default([]),
  }).optional().default({ files: [] }),
  completion_criteria: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).optional().default([]),

  // Backward-compatible fields.
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  issues: z.array(IssueSchema).optional(),
  read_first: z.array(z.string()).optional(),
  expected_artifacts: z.array(ExpectedArtifactSchema).optional(),
  sandbox: z.object({
    backend: z.string().optional().default("directory"),
    promotion_policy: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional().default({}),
  }).optional().default({ backend: "directory", config: {} }),
  verification: z.object({
    checks: z.array(z.string()).optional(),
    required_checks: z.array(RequiredCheckSchema).optional().default([]),
    review_gates: z.array(z.string()).optional().default([]),
  }).optional().default({ checks: [], required_checks: [], review_gates: [] }),
  runtime_config_overrides: z.record(z.string(), z.unknown()).optional().default({}),
}).superRefine((mission, ctx) => {
  if (!mission.name && !mission.title) {
    ctx.addIssue({
      code: "custom",
      message: "Mission requires either name or title",
      path: ["name"],
    });
  }
  const seen = new Set<string>();
  for (let i = 0; i < mission.acceptance_criteria.length; i += 1) {
    const ac = mission.acceptance_criteria[i];
    if (seen.has(ac.id)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate acceptance criterion id: ${ac.id}`,
        path: ["acceptance_criteria", i, "id"],
      });
    }
    seen.add(ac.id);
  }
}).transform((mission) => ({
  ...mission,
  name: mission.name ?? mission.title ?? "",
  description: mission.description ?? mission.objective,
  issues: mission.issues ?? mission.issue_refs.map((issue): { source: string; reference: string; url?: string } => ({
    source: issue.provider,
    reference: issue.id,
    url: issue.url,
  })),
  read_first: mission.read_first ?? mission.context.read_first,
  expected_artifacts: mission.expected_artifacts ?? mission.expected_outputs.files.map((path): { path: string; type?: string } => ({ path })),
  sandbox: {
    backend: mission.sandbox.backend,
    promotion_policy: mission.sandbox.promotion_policy,
    config: mission.sandbox.config,
  },
  verification: {
    checks: mission.verification.checks ?? mission.verification.required_checks.map((check) => check.command ?? check.name),
    required_checks: mission.verification.required_checks,
    review_gates: mission.verification.review_gates,
  },
  acceptance_criteria: (mission.acceptance_criteria.length > 0
    ? mission.acceptance_criteria
    : mission.completion_criteria.map((description, index): {
        id: string;
        description: string;
        check_command?: string;
        severity: "block" | "warn";
      } => ({
        id: `ac-${index + 1}`,
        description,
        severity: "warn",
      }))),
}));

export const MissionSchema = MissionInputSchema;

export type MissionDocument = z.infer<typeof MissionSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

export function validateMission(data: unknown): MissionDocument {
  return MissionSchema.parse(data);
}
