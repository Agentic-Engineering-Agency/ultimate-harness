import { z } from "zod";
import { CostClassSchema } from "./adapter-capabilities.js";

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

const DEFAULT_TEST_PATHS = [
  "tests/**",
  "test/**",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.spec.js",
  "**/*.spec.jsx",
  "**/__tests__/**",
];
const CapabilitySchema = z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, {
  message: "Capability id must start with [A-Za-z0-9] and use only [A-Za-z0-9._:-]",
});

/**
 * Adapter ids accepted by the team shape. Hard-coded rather than read from the
 * runtime registry to keep schema parsing free of import side-effects from the
 * adapter modules. Keep in sync with `RUNTIME_WIRINGS` in `src/cli.ts` and the
 * adapter manifests under `.harness/adapters/`.
 */
export const TEAM_ADAPTER_IDS = ["hermes", "codex", "oh-my-pi", "hermes-proxy", "openrouter", "pi"] as const;
const AdapterIdSchema = z.enum(TEAM_ADAPTER_IDS);

const TeamWorkerSchema = z.object({
  adapter: AdapterIdSchema,
  role: z.string().min(1),
  count: z.number().int().positive().optional().default(1),
}).strict();

const TeamLeaderSchema = z.object({
  adapter: AdapterIdSchema,
  role: z.string().min(1).optional(),
}).strict();

const TeamShapeSchema = z.object({
  workers: z.array(TeamWorkerSchema).min(1, { message: "team.workers must contain at least one worker" }),
  leader: TeamLeaderSchema,
}).strict();


const DEFAULT_SOURCE_PATHS = ["src/**"];

const TddOptionsSchema = z.object({
  enforce_tests_first: z.boolean().optional().default(true),
  test_paths: z.array(z.string().min(1)).optional().default(DEFAULT_TEST_PATHS),
  source_paths: z.array(z.string().min(1)).optional().default(DEFAULT_SOURCE_PATHS),
}).strict();

export const RuntimeRequirementsSchema = z.object({
  needs_network: z.boolean().default(false),
  needs_shell: z.boolean().default(true),
  needs_fs_write: z.boolean().default(true),
  min_context_tokens: z.number().int().positive().optional(),
  max_cost_class: CostClassSchema.default("premium"),
}).strict();

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
  /**
   * Advisory prompt directives for capable runtimes (e.g. a ## Constraints block).
   * Not executed by `uh verify` — encode hard rules as `acceptance_criteria` with
   * `check_command` or `verification.required_checks` with `command`.
   */
  constraints: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      "Advisory limits for the runtime prompt; not enforced by verify. Use acceptance_criteria for hard gates.",
    ),
  skills: z.object({
    required: z.array(z.string()).optional().default([]),
    suggested: z.array(z.string()).optional().default([]),
  }).optional().default({ required: [], suggested: [] }),
  expected_outputs: z.object({
    files: z.array(z.string()).optional().default([]),
  }).optional().default({ files: [] }),
  completion_criteria: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).optional().default([]),
  tdd: TddOptionsSchema.optional(),
  capabilities: z.array(CapabilitySchema).optional().default([]),
  runtime_requirements: RuntimeRequirementsSchema.optional(),

  // Backward-compatible fields.
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  issues: z.array(IssueSchema).optional(),
  read_first: z.array(z.string()).optional(),
  expected_artifacts: z.array(ExpectedArtifactSchema).optional(),
  sandbox: z.object({
    backend: z.string().optional().default("directory"),
    // Recognized values: "human-approved" (default behaviour — a manual
    // `uh mission promote` is required) and "auto-on-verify" (S6 #139 — a
    // passed `uh verify` auto-promotes). Any other/typo'd value is treated as
    // human-approved (never auto-promotes), so a typo cannot trigger promotion.
    promotion_policy: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional().default({}),
  }).optional().default({ backend: "directory", config: {} }),
  verification: z.object({
    checks: z.array(z.string()).optional(),
    required_checks: z.array(RequiredCheckSchema).optional().default([]),
    review_gates: z.array(z.string()).optional().default([]),
    /**
     * UH-73 — upper bound on staged-profile verify→fix loop iterations.
     * Default applied by the workflow runner is 2 when undefined.
     */
    max_iterations: z.number().int().positive().optional(),
  }).optional().default({ checks: [], required_checks: [], review_gates: [] }),
  runtime_config_overrides: z.record(z.string(), z.unknown()).optional().default({}),

  // UH-71 team shape + UH-75 design companion.
  shape: z.enum(["single", "team"]).optional().default("single"),
  team: TeamShapeSchema.optional(),
  integration_report_path: z.string().min(1).optional(),
  design_path: z.string().min(1).optional().default("design.md"),
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
  if (mission.shape === "team") {
    if (!mission.team) {
      ctx.addIssue({
        code: "custom",
        message: "shape: team requires team.workers and team.leader",
        path: ["team"],
      });
    } else {
      const roleSeen = new Set<string>();
      for (let i = 0; i < mission.team.workers.length; i += 1) {
        const role = mission.team.workers[i].role;
        if (roleSeen.has(role)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate team.workers[].role: ${role}`,
            path: ["team", "workers", i, "role"],
          });
        }
        roleSeen.add(role);
      }
    }
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
    max_iterations: mission.verification.max_iterations,
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
export type TddOptions = z.infer<typeof TddOptionsSchema>;
export type RuntimeRequirements = z.infer<typeof RuntimeRequirementsSchema>;
export const TDD_DEFAULT_TEST_PATHS = DEFAULT_TEST_PATHS;
export const TDD_DEFAULT_SOURCE_PATHS = DEFAULT_SOURCE_PATHS;

export function validateMission(data: unknown): MissionDocument {
  return MissionSchema.parse(data);
}
