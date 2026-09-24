import path from "node:path";
import { TeamResourceLimitsSchema, RuntimeLimitsSchema, ToolGuardFieldsSchema, resolveToolGuardPolicy, type ToolGuardPolicy, DEFAULT_PROTECTED_PATHS } from "./runtime-control.js";
import { z } from "zod";
import { CostClassSchema } from "./adapter-capabilities.js";
import { IndependentReviewBindingSchema } from "./independent-review.js";

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
  completion_marker: z.string().trim().min(1).regex(/^[^\r\n]+$/).optional(),
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
export const TEAM_ADAPTER_IDS = ["hermes", "codex", "oh-my-pi", "hermes-proxy", "openrouter", "anthropic", "pi", "command-code", "claude-code", "acp"] as const;
const AdapterIdSchema = z.enum(TEAM_ADAPTER_IDS);

export const TeamWorkerSchema = z.object({
  adapter: AdapterIdSchema,
  role: z.string().min(1),
  mission_id: z.string().min(1).optional(),
  count: z.number().int().positive().optional().default(1),
  objective: z.string().min(1).optional(),
  runtime_config_overrides: z.record(z.string(), z.unknown()).optional(),
  limits: z.preprocess((value, ctx) => {
    if (value && typeof value === "object" && "memory_mb" in value) {
      ctx.addIssue({
        code: "custom",
        message: "Per-worker memory is governed by team.resources.worker_memory_mb",
      });
    }
    return value;
  }, RuntimeLimitsSchema.omit({ memory_mb: true })).optional(),
  guard: ToolGuardFieldsSchema.optional(),
  expected_outputs: z.object({
    files: z.array(z.string().min(1)),
  }).strict().optional(),
  seed: z.number().int().nonnegative().optional(),
}).strict();

export type TeamWorker = z.input<typeof TeamWorkerSchema>;

const TeamLeaderSchema = z.object({
  adapter: AdapterIdSchema,
  role: z.string().min(1).optional(),
}).strict();

const TeamShapeSchema = z.object({
  workers: z.array(TeamWorkerSchema).min(1, { message: "team.workers must contain at least one worker" }),
  leader: TeamLeaderSchema,
  resources: TeamResourceLimitsSchema.optional(),
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

/**
 * Optional governed-decision policy. Additive and strict: a legacy mission that
 * omits it keeps its purely deterministic behavior. `allowed_runtimes` narrows
 * deterministic adapter eligibility; `allowed_models` is the only model set a
 * JEV (TypeSafe System One) recommendation may be applied from.
 */
export const DecisionPolicySchema = z.object({
  enabled: z.boolean().default(false),
  min_confidence: z.number().min(0).max(1).default(0.7),
  allowed_runtimes: z.array(AdapterIdSchema).optional().default([]),
  allowed_models: z.array(z.string().min(1)).optional().default([]),
  require_provider_for_route: z.boolean().default(false),
  require_provider_for_retry: z.boolean().default(false),
  escalation_model: z.string().min(1).optional(),
  fallback_model: z.string().min(1).optional(),
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
  tdd: TddOptionsSchema.optional(),
  capabilities: z.array(CapabilitySchema).optional().default([]),
  runtime_requirements: RuntimeRequirementsSchema.optional(),
  decision_policy: DecisionPolicySchema.optional(),
  guard: ToolGuardFieldsSchema.optional(),
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
  independent_review: IndependentReviewBindingSchema.optional(),

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
  const declaredOutputs = [
    ...mission.expected_outputs.files.map((pathValue, index) => ({ pathValue, path: ["expected_outputs", "files", index] as (string | number)[] })),
    ...(mission.expected_artifacts ?? []).map((artifact, index) => ({ pathValue: artifact.path, path: ["expected_artifacts", index, "path"] as (string | number)[] })),
  ];
  for (const output of declaredOutputs) {
    const normalized = path.posix.normalize(output.pathValue.trim().replaceAll("\\", "/")).replace(/^\.\/+/, "");
    const protectedOutput = DEFAULT_PROTECTED_PATHS.some((root) =>
      normalized === root || normalized.startsWith(`${root}/`));
    if (protectedOutput) {
      ctx.addIssue({
        code: "custom",
        message: `Expected output cannot target protected runtime path "${output.pathValue}"; workers must write permitted outputs and the trusted controller owns .harness persistence`,
        path: output.path,
      });
    }
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
  guard: mission.guard === undefined ? undefined : resolveToolGuardPolicy(
    mission.guard,
    mission.runtime_requirements?.needs_network ?? false,
  ),
  name: mission.name ?? mission.title ?? "",
  description: mission.description ?? mission.objective,
  issues: mission.issues ?? mission.issue_refs.map((issue): { source: string; reference: string; url?: string } => ({
    source: issue.provider,
    reference: issue.id,
    url: issue.url,
  })),
  read_first: mission.read_first ?? mission.context.read_first,
  expected_artifacts: mission.expected_artifacts ?? mission.expected_outputs.files.map((path): z.infer<typeof ExpectedArtifactSchema> => ({ path })),
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
export type DecisionPolicy = z.infer<typeof DecisionPolicySchema>;
export type ResolvedToolGuardPolicy = ToolGuardPolicy;
export const TDD_DEFAULT_TEST_PATHS = DEFAULT_TEST_PATHS;
export const TDD_DEFAULT_SOURCE_PATHS = DEFAULT_SOURCE_PATHS;

export function validateMission(data: unknown): MissionDocument {
  return MissionSchema.parse(data);
}
