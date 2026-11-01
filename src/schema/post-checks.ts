import { z } from "zod";

export const POST_CHECK_DEFAULT_TIMEOUT_MS = 900_000;

/** Safe, log-friendly check name: no separators, no leading punctuation. */
export const POST_CHECK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const PostCheckEntrySchema = z.object({
  name: z.string().regex(POST_CHECK_NAME_PATTERN, "post-check name must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/"),
  command: z.string().min(1),
  timeout_ms: z.number().int().positive().default(POST_CHECK_DEFAULT_TIMEOUT_MS),
}).strict();

const checkList = z.array(PostCheckEntrySchema).superRefine((checks, ctx) => {
  const seen = new Set<string>();
  checks.forEach((check, index) => {
    if (seen.has(check.name)) {
      ctx.addIssue({ code: "custom", message: `duplicate post-check name: ${check.name}`, path: [index, "name"] });
    }
    seen.add(check.name);
  });
});

/**
 * The post-checks file: a bare list of checks (the original shape, still accepted) or a versioned document
 * `{ schema_version: uh.post-checks.v0, checks: [...] }`. Both parse to the same list.
 */
export const PostCheckFileSchema = z.union([
  checkList,
  z.object({ schema_version: z.literal("uh.post-checks.v0"), checks: checkList }).strict().transform((document) => document.checks),
]);
export type PostCheckEntry = z.infer<typeof PostCheckEntrySchema>;
