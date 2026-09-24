import { z } from "zod";

/**
 * UH queue — a file that orders missions.
 *
 * A queue names a set of entries, each pointing at a mission file and the
 * runtime that should run it. An entry may declare `after` dependencies: it is
 * only launched once every entry it depends on has passed, and it is skipped
 * when one of them settles as failed or skipped. The file is the operator
 * contract, so it is strict (unknown fields are rejected) and its dependency
 * graph is validated up front (duplicate ids, unknown references, and cycles).
 */

const SafeQueueIdSchema = z
  .string()
  .min(1, { message: "id must not be empty" })
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: "id must start with [a-zA-Z0-9] and use only [a-zA-Z0-9._-]",
  })
  .refine((id) => id !== "." && id !== "..", { message: "id must not be '.' or '..'" });

export const QueueEntrySchema = z
  .object({
    id: SafeQueueIdSchema,
    /** Path to a mission.yaml; relative paths resolve against the project root. */
    mission: z.string().min(1),
    runtime: z.string().min(1),
    /** Entry ids that must all pass before this entry launches. */
    after: z.array(SafeQueueIdSchema).optional(),
  })
  .strict();
export type QueueEntry = z.infer<typeof QueueEntrySchema>;

/**
 * Every `"after"` edge that closes a cycle, as the node list from the first
 * repeated node (for example `[a, b]` for `a -> b -> a`). Self-references are
 * excluded because the schema reports them as their own error.
 */
function detectAfterCycles(entries: readonly QueueEntry[]): string[][] {
  const known = new Set(entries.map((entry) => entry.id));
  const adjacency = new Map<string, string[]>();
  for (const entry of entries) {
    adjacency.set(entry.id, (entry.after ?? []).filter((dep) => known.has(dep) && dep !== entry.id));
  }
  const color = new Map<string, "gray" | "black">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string): void => {
    color.set(node, "gray");
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next);
      if (state === "gray") cycles.push(stack.slice(stack.indexOf(next)));
      else if (state === undefined) visit(next);
    }
    stack.pop();
    color.set(node, "black");
  };
  for (const entry of entries) if (color.get(entry.id) === undefined) visit(entry.id);
  return cycles;
}

export const QueueFileSchema = z
  .object({
    id: SafeQueueIdSchema,
    entries: z.array(QueueEntrySchema),
  })
  .strict()
  .superRefine((queue, ctx) => {
    const seen = new Set<string>();
    queue.entries.forEach((entry, index) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: `Duplicate queue entry id: "${entry.id}"`,
        });
      }
      seen.add(entry.id);
    });
    queue.entries.forEach((entry, index) => {
      (entry.after ?? []).forEach((dep, depIndex) => {
        if (dep === entry.id) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "after", depIndex],
            message: `Entry "${entry.id}" cannot depend on itself`,
          });
        } else if (!seen.has(dep)) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", index, "after", depIndex],
            message: `Entry "${entry.id}" depends on unknown entry "${dep}"`,
          });
        }
      });
    });
    for (const cycle of detectAfterCycles(queue.entries)) {
      const index = queue.entries.findIndex((entry) => entry.id === cycle[0]);
      ctx.addIssue({
        code: "custom",
        path: ["entries", index, "after"],
        message: `Entry "${cycle[0]}" participates in an "after" cycle: ${[...cycle, cycle[0]].join(" -> ")}`,
      });
    }
  });
export type QueueFile = z.infer<typeof QueueFileSchema>;

export const QUEUE_STATE_SCHEMA_VERSION = "uh.queue.v0" as const;

export const QueueEntryStatusSchema = z.enum(["pending", "running", "passed", "failed", "skipped"]);
export type QueueEntryStatus = z.infer<typeof QueueEntryStatusSchema>;

/** One entry's durable state in `.harness/queue/<queue-id>/state.json`. */
export const QueueEntryStateSchema = z
  .object({
    id: z.string().min(1),
    status: QueueEntryStatusSchema,
    run_id: z.string().min(1).nullable(),
    started_at: z.string().min(1).nullable(),
    finished_at: z.string().min(1).nullable(),
    exit_code: z.number().int().nullable(),
  })
  .strict();
export type QueueEntryState = z.infer<typeof QueueEntryStateSchema>;

export const QueueStateSchema = z
  .object({
    schema_version: z.literal(QUEUE_STATE_SCHEMA_VERSION),
    queue_id: z.string().min(1),
    entries: z.array(QueueEntryStateSchema),
  })
  .strict();
export type QueueState = z.infer<typeof QueueStateSchema>;

export function validateQueueFile(data: unknown): QueueFile {
  return QueueFileSchema.parse(data);
}

export function validateQueueState(data: unknown): QueueState {
  return QueueStateSchema.parse(data);
}
