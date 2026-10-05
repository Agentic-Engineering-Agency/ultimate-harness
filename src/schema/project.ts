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

/**
 * Notification sink filter: narrows which events reach a sink by terminal
 * status and by mission id glob. An omitted dimension matches everything; a
 * declared dimension only matches when the event carries that dimension.
 */
export const NotificationFilterSchema = z.object({
  statuses: z.array(z.string().min(1)).optional(),
  missions: z.array(z.string().min(1)).optional(),
}).strict();
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;

/** Fields every sink shares: identity, the events it subscribes to, and its filter. */
const NotificationSinkCommonFields = {
  id: z.string().min(1),
  events: z.array(z.string().min(1)).optional(),
  filter: NotificationFilterSchema.optional(),
} as const;

/**
 * A command sink: `argv` is spawned directly (never through a shell), the
 * rendered message is written to stdin, and the event JSON is exported to the
 * `env` variable (default `UH_NOTIFICATION_EVENT`). `{subject}` and `{event}`
 * placeholders are substituted in every argv item.
 */
export const NotificationCommandSinkSchema = z.object({
  ...NotificationSinkCommonFields,
  kind: z.literal("command"),
  argv: z.array(z.string().min(1)).min(1),
  env: z.string().min(1).optional(),
}).strict();

/**
 * A webhook sink: `headers` values are environment variable NAMES, resolved at
 * delivery time, so no credential literal is ever stored in the file. The body
 * is the event JSON unless `body: text` is set.
 */
export const NotificationWebhookSinkSchema = z.object({
  ...NotificationSinkCommonFields,
  kind: z.literal("webhook"),
  url: z.string().min(1),
  method: z.string().min(1).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.enum(["json", "text"]).optional(),
}).strict();

/** The built-in preset names; each expands to a command or webhook sink. */
export const NOTIFICATION_PRESETS = ["hermes", "apprise", "ntfy", "windows-toast"] as const;
export type NotificationPreset = (typeof NOTIFICATION_PRESETS)[number];

/**
 * A preset sink: a named, data-driven expansion of one of the two sink kinds.
 * Which option fields are required depends on the preset (hermes needs `to`,
 * apprise needs `urls`, ntfy needs `server` and `topic`; windows-toast needs
 * none).
 */
export const NotificationPresetSinkSchema = z.object({
  ...NotificationSinkCommonFields,
  preset: z.enum(NOTIFICATION_PRESETS),
  to: z.string().min(1).optional(),
  urls: z.array(z.string().min(1)).min(1).optional(),
  server: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  /** windows-toast only: the registered AppUserModelID the toast is raised under. */
  app_id: z.string().min(1).optional(),
}).strict();
export type NotificationPresetSink = z.infer<typeof NotificationPresetSinkSchema>;

export const NotificationSinkSchema = z.union([
  NotificationCommandSinkSchema,
  NotificationWebhookSinkSchema,
  NotificationPresetSinkSchema,
]);
export type NotificationSink = z.infer<typeof NotificationSinkSchema>;

/** The `notifications` section of `.harness/project.yaml` (and of the user file). */
export const NotificationsSchema = z.object({
  sinks: z.array(NotificationSinkSchema).optional().default([]),
}).strict();
export type Notifications = z.infer<typeof NotificationsSchema>;

/** One `uh land` full-suite check: a display name and the command to run. */
export const LandCheckSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
}).strict();
export type LandCheck = z.infer<typeof LandCheckSchema>;

/**
 * The optional `land` block of `.harness/project.yaml`: the full-suite checks,
 * the forbidden patterns grepped from the staged diff and commit message, and
 * the build command. Absent fields fall back to `uh land`'s defaults.
 */
export const LandSchema = z.object({
  checks: z.array(LandCheckSchema).optional(),
  forbidden_patterns: z.array(z.string()).optional(),
  build: z.string().min(1).optional(),
}).strict();
export type Land = z.infer<typeof LandSchema>;

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
  /** Optional notification sinks; absent means nothing is ever sent. */
  notifications: NotificationsSchema.optional(),
  /** Optional `uh land` configuration: full-suite checks, forbidden patterns, build. */
  land: LandSchema.optional(),
});

export type ProjectDocument = z.infer<typeof ProjectSchema>;

export function validateProject(data: unknown): ProjectDocument {
  return ProjectSchema.parse(data);
}
