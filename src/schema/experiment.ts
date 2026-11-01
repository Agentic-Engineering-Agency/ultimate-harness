import { z } from "zod";

const SafeIdentifierSchema = z
  .string()
  .min(1, { message: "id must not be empty" })
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: "id must start with [a-zA-Z0-9] and use only [a-zA-Z0-9._-]",
  })
  .refine((id) => id !== "." && id !== "..", {
    message: "id must not be '.' or '..'",
  });

/**
 * One arm is a configuration surface measured against the others: a session
 * template, extra runtime-config overrides, and how many independent attempts
 * each task gets under it.
 */
export const ExperimentArmSchema = z
  .object({
    id: SafeIdentifierSchema,
    template: z.string().min(1).optional(),
    runtime_config_overrides: z.record(z.string(), z.unknown()).optional(),
    attempts_per_task: z.number().int().min(1).default(1),
  })
  .strict();

/**
 * A seeded split: the tasks are deterministically partitioned into a `search`
 * and a `held_out` set from `seed`. The seed is part of every output so a split
 * can always be reproduced.
 */
export const ExperimentSeedSplitSchema = z
  .object({
    seed: z.number().int(),
    held_out_fraction: z.number().gt(0).lt(1).default(0.34),
  })
  .strict();

/** An explicit held-out set; every listed task must also appear in `tasks`. */
export const ExperimentExplicitSplitSchema = z
  .object({
    held_out: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const ExperimentSplitSchema = z.union([
  ExperimentSeedSplitSchema,
  ExperimentExplicitSplitSchema,
]);

export const ExperimentBudgetSchema = z
  .object({
    max_runs: z.number().int().positive().optional(),
    max_total_cost_usd: z.number().positive().optional(),
  })
  .strict()
  .default({});

/**
 * The configuration a run is honestly compared against: the baseline arm and
 * how many of its attempts run in parallel, which is what `bestOfN` makes
 * visible.
 */
export const ExperimentBaselineSchema = z
  .object({
    arm: z.string().min(1),
    parallel_attempts: z.number().int().min(1).default(1),
  })
  .strict();

export const ExperimentSchema = z
  .object({
    schema_version: z.literal("uh.experiment.v0"),
    id: SafeIdentifierSchema,
    title: z.string().min(1),
    tasks: z.array(z.string().min(1)).min(1),
    split: ExperimentSplitSchema,
    arms: z.array(ExperimentArmSchema).min(1),
    budget: ExperimentBudgetSchema,
    baseline: ExperimentBaselineSchema,
  })
  .strict()
  .superRefine((experiment, ctx) => {
    const armIds = new Set<string>();
    experiment.arms.forEach((arm, index) => {
      if (armIds.has(arm.id)) {
        ctx.addIssue({ code: "custom", message: `Duplicate arm id: ${arm.id}`, path: ["arms", index, "id"] });
      }
      armIds.add(arm.id);
    });
    const taskIds = new Set<string>();
    experiment.tasks.forEach((task, index) => {
      if (taskIds.has(task)) {
        ctx.addIssue({ code: "custom", message: `Duplicate task: ${task}`, path: ["tasks", index] });
      }
      taskIds.add(task);
    });
    if (!armIds.has(experiment.baseline.arm)) {
      ctx.addIssue({
        code: "custom",
        message: `baseline.arm "${experiment.baseline.arm}" is not one of arms`,
        path: ["baseline", "arm"],
      });
    }
    if ("held_out" in experiment.split) {
      experiment.split.held_out.forEach((task, index) => {
        if (!taskIds.has(task)) {
          ctx.addIssue({
            code: "custom",
            message: `split.held_out task "${task}" is not in tasks`,
            path: ["split", "held_out", index],
          });
        }
      });
    }
  });

export type ExperimentDocument = z.infer<typeof ExperimentSchema>;
export type ExperimentArm = z.infer<typeof ExperimentArmSchema>;
export type ExperimentSplitSpec = z.infer<typeof ExperimentSplitSchema>;
export type ExperimentBudget = z.infer<typeof ExperimentBudgetSchema>;
export type ExperimentBaseline = z.infer<typeof ExperimentBaselineSchema>;

export function validateExperiment(data: unknown): ExperimentDocument {
  return ExperimentSchema.parse(data);
}
