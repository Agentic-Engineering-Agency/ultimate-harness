import { z } from "zod";

export const AdapterSchema = z.object({
  schema_version: z.literal("uh.adapter.v0"),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  runtime: z.string().min(1),
  capabilities: z.array(z.string()).optional().default([]),
  status: z.enum(["active", "experimental", "deprecated"]).default("active"),
});

export type AdapterDocument = z.infer<typeof AdapterSchema>;

export function validateAdapter(data: unknown): AdapterDocument {
  return AdapterSchema.parse(data);
}
